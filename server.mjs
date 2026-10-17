import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import pg from 'pg';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  applyCommand, seed, permissions, GuildError
} from './dist-server/guild.js';
import {
  encryptTokens, decryptTokens, memberAllowed
} from './security.mjs';

const required = [
  'DATABASE_URL',
  'APP_URL',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_GUILD_ID',
  'DISCORD_MEMBER_ROLE_ID',
  'OWNER_DISCORD_ID',
  'SESSION_SECRET'
];

for (const key of required) {
  if (!process.env[key]) {
    console.error('Configure a variável ' + key + ' no ambiente antes de iniciar.');
    process.exit(1);
  }
}

const cfg = Object.fromEntries(required.map(k => [k, process.env[k]]));

if (cfg.SESSION_SECRET.length < 32) {
  throw Error('SESSION_SECRET deve ter pelo menos 32 caracteres aleatórios.');
}

for (const k of [
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'DISCORD_MEMBER_ROLE_ID',
  'OWNER_DISCORD_ID'
]) {
  if (!/^\d{17,22}$/.test(cfg[k])) {
    throw Error('ID inválido na variável ' + k);
  }
}

const origin = new URL(cfg.APP_URL).origin;
const production = process.env.NODE_ENV === 'production';

if (production && !origin.startsWith('https://')) {
  throw Error('APP_URL precisa usar HTTPS em produção.');
}

const redirectUri = origin + '/auth/discord/callback';
const base = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = new URL(cfg.DATABASE_URL);

for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
  databaseUrl.searchParams.delete(key);
}

const pool = new pg.Pool({
  connectionString: databaseUrl.toString(),
  ssl: { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 15000
});

pool.on('error', () => console.error('Conexão de banco interrompida.'));

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'blob:', 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));

app.use(cookieParser());

const cookie = age => ({
  httpOnly: true,
  secure: production,
  sameSite: 'lax',
  path: '/',
  maxAge: age
});

const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const fail = (status, message) => Object.assign(Error(message), { status });

app.use((req, res, next) => {
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers.origin !== origin
  ) {
    return res.status(403).json({ error: 'Origem da solicitação inválida.' });
  }
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const authRate = rateLimit({
  windowMs: 15 * 60000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Muitas tentativas. Aguarde alguns minutos.'
});

app.use('/auth', authRate);

async function discordFetch(url, options = {}) {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw fail(503, 'Discord indisponível. Tente novamente em instantes.');
  }
}

async function tokens(params) {
  const r = await discordFetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.DISCORD_CLIENT_ID,
      client_secret: cfg.DISCORD_CLIENT_SECRET,
      ...params
    })
  });

  if (!r.ok) {
    throw fail(
      r.status === 429 || r.status >= 500 ? 503 : 401,
      'Não foi possível validar o login. Tente entrar com Discord novamente.'
    );
  }

  const t = await r.json();

  if (!t.access_token || !t.refresh_token || !Number.isFinite(t.expires_in)) {
    throw fail(503, 'Resposta de login inválida.');
  }

  return t;
}

async function checkMember(access) {
  const r = await discordFetch(
    'https://discord.com/api/v10/users/@me/guilds/' +
      cfg.DISCORD_GUILD_ID + '/member',
    { headers: { Authorization: 'Bearer ' + access } }
  );

  if (r.status === 401) {
    throw fail(401, 'Sua autorização expirou. Entre com Discord novamente.');
  }

  if (r.status === 403 || r.status === 404) {
    throw fail(403, 'Acesso negado: entre no servidor da guild e obtenha o cargo Membro.');
  }

  if (!r.ok) {
    throw fail(503, 'Não foi possível verificar seu cargo no Discord. Tente novamente.');
  }

  const member = await r.json();

  if (!memberAllowed(member, cfg.DISCORD_MEMBER_ROLE_ID)) {
    throw fail(403, 'Acesso negado: você precisa do cargo Membro no servidor da guild.');
  }

  return member;
}

app.get('/auth/discord', async (req, res, next) => {
  try {
    const nonce = random();

    await pool.query(
      `INSERT INTO guild_oauth_states(id,return_to,expires_at)
       VALUES($1,$2,now()+interval '10 minutes')`,
      [
        hash(nonce),
        req.query.returnTo === 'signup' ? '/?view=signup' : '/'
      ]
    );

    res.cookie('guild_oauth', nonce, cookie(10 * 60000));

    const params = new URLSearchParams({
      client_id: cfg.DISCORD_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify guilds.members.read',
      state: nonce
    });

    res.redirect('https://discord.com/oauth2/authorize?' + params);
  } catch (e) {
    next(e);
  }
});

app.get('/auth/discord/callback', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');

    if (req.query.error) {
      throw fail(400, 'Login cancelado. Volte ao sistema para tentar novamente.');
    }

    const state = String(req.query.state || '');
    const browserState = String(req.cookies.guild_oauth || '');

    res.clearCookie('guild_oauth', cookie(0));

    if (!state || state.length > 200 || state !== browserState) {
      throw fail(400, 'Login expirado ou inválido. Comece novamente.');
    }

    const row = (
      await pool.query(
        `DELETE FROM guild_oauth_states
         WHERE id=$1 AND expires_at>now()
         RETURNING return_to`,
        [hash(state)]
      )
    ).rows[0];

    if (!row || typeof req.query.code !== 'string') {
      throw fail(400, 'Login expirado. Comece novamente.');
    }

    const t = await tokens({
      grant_type: 'authorization_code',
      code: req.query.code,
      redirect_uri: redirectUri
    });

    const userResponse = await discordFetch(
      'https://discord.com/api/v10/users/@me',
      { headers: { Authorization: 'Bearer ' + t.access_token } }
    );

    if (!userResponse.ok) {
      throw fail(401, 'Não foi possível identificar a conta do Discord.');
    }

    const user = await userResponse.json();

    if (!/^\d{17,22}$/.test(user.id)) {
      throw fail(401, 'Conta do Discord inválida.');
    }

    const member = await checkMember(t.access_token);
    const sid = random();

    await pool.query(
      `INSERT INTO guild_sessions(
        id,user_id,display_name,token_data,token_expires_at,
        membership_checked_at,expires_at
      ) VALUES($1,$2,$3,$4,$5,now(),now()+interval '7 days')`,
      [
        hash(sid),
        user.id,
        member.nick || user.global_name || user.username,
        encryptTokens({
          access: t.access_token,
          refresh: t.refresh_token
        }, cfg.SESSION_SECRET),
        new Date(Date.now() + t.expires_in * 1000)
      ]
    );

    res.cookie('guild_session', sid, cookie(7 * 86400000));
    res.redirect(row.return_to);
  } catch (e) {
    next(e);
  }
});

app.get('/auth/logout', async (req, res, next) => {
  try {
    if (req.cookies.guild_session) {
      await pool.query(
        'DELETE FROM guild_sessions WHERE id=$1',
        [hash(String(req.cookies.guild_session))]
      );
    }

    res.clearCookie('guild_session', cookie(0));
    res.redirect('/');
  } catch (e) {
    next(e);
  }
});

const locks = new Map();

async function verifySession(sid) {
  let row = (
    await pool.query(
      'SELECT * FROM guild_sessions WHERE id=$1 AND expires_at>now()',
      [sid]
    )
  ).rows[0];

  if (!row) throw fail(401, 'Entre com Discord para acessar.');

  if (Date.now() - new Date(row.membership_checked_at).getTime() < 60000) {
    return row;
  }

  const pending = locks.get(sid);
  if (pending) return pending;

  const job = (async () => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      row = (
        await client.query(
          'SELECT * FROM guild_sessions WHERE id=$1 AND expires_at>now() FOR UPDATE',
          [sid]
        )
      ).rows[0];

      if (!row) throw fail(401, 'Entre com Discord para acessar.');

      if (Date.now() - new Date(row.membership_checked_at).getTime() >= 60000) {
        let t = decryptTokens(row.token_data, cfg.SESSION_SECRET);

        if (new Date(row.token_expires_at).getTime() < Date.now() + 60000) {
          const fresh = await tokens({
            grant_type: 'refresh_token',
            refresh_token: t.refresh
          });

          t = {
            access: fresh.access_token,
            refresh: fresh.refresh_token
          };

          row.token_data = encryptTokens(t, cfg.SESSION_SECRET);
          row.token_expires_at = new Date(Date.now() + fresh.expires_in * 1000);
        }

        await checkMember(t.access);

        await client.query(
          `UPDATE guild_sessions
           SET token_data=$2,token_expires_at=$3,membership_checked_at=now()
           WHERE id=$1`,
          [sid, row.token_data, row.token_expires_at]
        );
      }

      await client.query('COMMIT');
      return row;
    } catch (e) {
      await client.query('ROLLBACK');

      if (e.status === 401 || e.status === 403) {
        await client.query('DELETE FROM guild_sessions WHERE id=$1', [sid]);
      }

      throw e;
    } finally {
      client.release();
      locks.delete(sid);
    }
  })();

  locks.set(sid, job);
  return job;
}

app.use('/api', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');

    const raw = req.cookies.guild_session;

    if (typeof raw !== 'string' || raw.length > 200) {
      throw fail(401, 'Entre com Discord para acessar.');
    }

    const row = await verifySession(hash(raw));

    req.actor = {
      id: row.user_id,
      discordId: row.user_id,
      name: row.display_name
    };

    next();
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      res.clearCookie('guild_session', cookie(0));
    }
    next(e);
  }
});

app.use('/api', rateLimit({
  windowMs: 60000,
  limit: 300,
  keyGenerator: req => req.actor.id,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas solicitações. Aguarde um minuto.' }
}));

async function state() {
  const row = (
    await pool.query('SELECT data,revision FROM guild_state WHERE id=1')
  ).rows[0];

  if (row) row.data.owner = cfg.OWNER_DISCORD_ID;
  return row;
}

app.get('/api/guild', async (req, res, next) => {
  try {
    const row = await state();

    if (!row) {
      if (req.actor.id !== cfg.OWNER_DISCORD_ID) {
        return res.status(403).json({
          error: 'O dono ainda não ativou o sistema.'
        });
      }
      return res.json({ setup: true, me: req.actor });
    }

    const p = permissions(row.data, req.actor);

    res.json({
      setup: false,
      revision: row.revision,
      guild: {
        ...row.data,
        owner: '',
        staff: p.owner ? row.data.staff : []
      },
      permissions: p,
      me: req.actor
    });
  } catch (e) {
    next(e);
  }
});

function requireStaff(data, actor) {
  const p = permissions(data, actor);

  if (!p.owner && !p.staff) {
    throw fail(403, 'Somente a staff e o dono podem gerenciar lutas.');
  }
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw fail(400, 'Data inválida.');
  }

  const d = new Date(value + 'T12:00:00Z');

  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value ||
    Number(value.slice(0, 4)) < 1900
  ) {
    throw fail(400, 'Data inválida.');
  }

  return value;
}

function clearCall(data) {
  return {
    ...data,
    signups: [],
    builds: data.builds.map(b => ({
      ...b,
      player: '',
      signupId: '',
      confirmed: false,
      example: false
    }))
  };
}

function fightSummary(row) {
  return {
    id: row.id,
    title: row.title,
    fightDate: row.fight_date,
    savedAt: row.saved_at,
    players: Number(row.players),
    signups: Number(row.signups)
  };
}

const fightFields = `
  id,
  title,
  to_char(fight_date, 'YYYY-MM-DD') AS fight_date,
  saved_at,
  (
    SELECT count(*)
    FROM jsonb_array_elements(data->'builds') b
    WHERE coalesce(b->>'player','') <> ''
  ) AS players,
  jsonb_array_length(data->'signups') AS signups
`;

// Ranking disponível para todos os membros autenticados.
// Cada jogador conta somente uma vez por luta salva.
app.get('/api/attendance', async (req, res, next) => {
  try {
    if (!await state()) {
      throw fail(400, 'O dono precisa ativar a guild.');
    }

    const start = req.query.start ? validDate(req.query.start) : null;
    const end = req.query.end ? validDate(req.query.end) : null;

    if (start && end && start > end) {
      throw fail(400, 'A data inicial deve ser anterior ou igual à final.');
    }

    const rows = await pool.query(
      `SELECT
        id,
        title,
        to_char(fight_date, 'YYYY-MM-DD') AS fight_date,
        (
          SELECT coalesce(
            jsonb_agg(
              jsonb_build_object(
                'player', b->>'player',
                'signupId', b->>'signupId',
                'party', b->>'party'
              )
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(data->'builds') b
          WHERE btrim(coalesce(b->>'player','')) <> ''
            AND coalesce(b->>'example','false') <> 'true'
        ) AS players
      FROM guild_fights
      WHERE ($1::date IS NULL OR fight_date >= $1::date)
        AND ($2::date IS NULL OR fight_date <= $2::date)
      ORDER BY fight_date DESC, saved_at DESC, id DESC`,
      [start, end]
    );

    const people = new Map();

    for (const fight of rows.rows) {
      const present = new Map();

      for (const b of fight.players) {
        const name = b.player.trim();

        const key = b.signupId
          ? 'id:' + b.signupId
          : 'name:' + name.normalize('NFKC').toLowerCase();

        if (!present.has(key)) {
          present.set(key, {
            name,
            parties: new Set()
          });
        }

        present.get(key).parties.add(b.party || 'Sem PT');
      }

      for (const [key, person] of present) {
        if (!people.has(key)) {
          people.set(key, {
            key,
            name: person.name,
            fights: []
          });
        }

        people.get(key).fights.push({
          id: fight.id,
          title: fight.title,
          date: fight.fight_date,
          parties: [...person.parties].sort()
        });
      }
    }

    const ranking = [...people.values()].sort((a, b) =>
      b.fights.length - a.fights.length ||
      a.name.localeCompare(b.name, 'pt-BR') ||
      a.key.localeCompare(b.key)
    );

    let position = 0;
    let previous = -1;

    const result = ranking.map((person, index) => {
      const count = person.fights.length;

      if (count !== previous) {
        position = index + 1;
      }

      previous = count;

      return {
        name: person.name,
        position,
        count,
        fights: person.fights
      };
    });

    res.json({
      totalFights: rows.rows.length,
      ranking: result
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/fights', async (req, res, next) => {
  try {
    const row = await state();

    if (!row) throw fail(400, 'O dono precisa ativar a guild.');
    requireStaff(row.data, req.actor);

    const title = String(req.query.title || '').trim();
    const player = String(req.query.player || '').trim();
    const start = req.query.start ? validDate(req.query.start) : null;
    const end = req.query.end ? validDate(req.query.end) : null;
    const page = Number(req.query.page || 0);

    if (
      title.length > 120 ||
      player.length > 60 ||
      !Number.isInteger(page) ||
      page < 0 ||
      page > 100000
    ) {
      throw fail(400, 'Filtro inválido.');
    }

    if (start && end && start > end) {
      throw fail(400, 'Intervalo de datas inválido.');
    }

    const where = `
      WHERE ($1::text = '' OR strpos(lower(title),lower($1)) > 0)
      AND ($2::date IS NULL OR fight_date >= $2::date)
      AND ($3::date IS NULL OR fight_date <= $3::date)
      AND (
        $4::text = '' OR
        EXISTS(
          SELECT 1
          FROM jsonb_array_elements(data->'builds') b
          WHERE strpos(lower(coalesce(b->>'player','')),lower($4)) > 0
        ) OR
        EXISTS(
          SELECT 1
          FROM jsonb_array_elements(data->'signups') s
          WHERE strpos(lower(coalesce(s->>'name','')),lower($4)) > 0
        )
      )
    `;

    const args = [title, start, end, player];

    const count = await pool.query(
      `SELECT count(*) AS total FROM guild_fights ${where}`,
      args
    );

    const rows = await pool.query(
      `SELECT ${fightFields}
       FROM guild_fights
       ${where}
       ORDER BY fight_date DESC, saved_at DESC, id DESC
       LIMIT 20 OFFSET $5`,
      [...args, page * 20]
    );

    res.json({
      fights: rows.rows.map(fightSummary),
      total: Number(count.rows[0].total)
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/fights/:id', async (req, res, next) => {
  try {
    const current = await state();

    if (!current) throw fail(400, 'O dono precisa ativar a guild.');
    requireStaff(current.data, req.actor);

    if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) {
      throw fail(404, 'Luta não encontrada.');
    }

    const row = (
      await pool.query(
        `SELECT ${fightFields}, data FROM guild_fights WHERE id=$1`,
        [req.params.id]
      )
    ).rows[0];

    if (!row) throw fail(404, 'Luta não encontrada.');

    res.json({ ...fightSummary(row), data: row.data });
  } catch (e) {
    next(e);
  }
});

app.post('/api/guild', express.json({ limit: '200kb' }), async (req, res, next) => {
  let client;

  try {
    const c = req.body;

    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      throw fail(400, 'Solicitação inválida.');
    }

    client = await pool.connect();
    await client.query('BEGIN');

    if (c.type === 'setup') {
      if (req.actor.id !== cfg.OWNER_DISCORD_ID) {
        throw fail(403, 'Somente o dono configurado pode ativar a guild.');
      }

      const inserted = await client.query(
        `INSERT INTO guild_state(id,revision,data)
         VALUES(1,1,$1)
         ON CONFLICT(id) DO NOTHING
         RETURNING id`,
        [seed(cfg.OWNER_DISCORD_ID)]
      );

      if (!inserted.rowCount) {
        throw fail(409, 'Sistema já configurado. Atualize a página.');
      }
    } else {
      const row = (
        await client.query(
          'SELECT data,revision FROM guild_state WHERE id=1 FOR UPDATE'
        )
      ).rows[0];

      if (!row) throw fail(400, 'O dono precisa ativar a guild.');

      row.data.owner = cfg.OWNER_DISCORD_ID;
      let data;

      if (c.type === 'fight-save' || c.type === 'call-clear') {
        requireStaff(row.data, req.actor);

        if (c.type === 'fight-save') {
          if (
            typeof c.requestId !== 'string' ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(c.requestId)
          ) {
            throw fail(400, 'Identificador da luta inválido.');
          }

          const existing = (
            await client.query(
              'SELECT saved_by FROM guild_fights WHERE id=$1',
              [c.requestId]
            )
          ).rows[0];

          if (existing) {
            if (existing.saved_by !== req.actor.id) {
              throw fail(403, 'Identificador já utilizado.');
            }

            await client.query('COMMIT');
            return res.json({ ok: true });
          }
        }

        if (c.revision !== row.revision) {
          throw fail(409, 'A convocação mudou. Confira os jogadores e tente novamente.');
        }

        if (c.type === 'fight-save') {
          if (
            typeof c.title !== 'string' ||
            !c.title.trim() ||
            c.title.length > 120
          ) {
            throw fail(400, 'Informe um nome de até 120 caracteres para a luta.');
          }

          if (typeof c.reset !== 'boolean') {
            throw fail(400, 'Opção de limpeza inválida.');
          }

          const date = validDate(c.date);

          if (
            !row.data.builds.some(b => b.player) &&
            !row.data.signups.length
          ) {
            throw fail(400, 'Não há jogadores ou inscrições para salvar.');
          }

          const snapshot = {
            config: structuredClone(row.data.config),
            builds: structuredClone(row.data.builds),
            signups: structuredClone(row.data.signups)
          };

          await client.query(
            `INSERT INTO guild_fights(id,title,fight_date,saved_by,data)
             VALUES($1,$2,$3,$4,$5)`,
            [c.requestId, c.title.trim(), date, req.actor.id, snapshot]
          );

          data = c.reset ? clearCall(row.data) : row.data;
        } else {
          data = clearCall(row.data);
        }
      } else {
        if (c.revision !== row.revision) {
          throw fail
