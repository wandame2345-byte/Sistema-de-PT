export const pieces = [
  'AR', 'MS', 'CA', 'PE', 'BO', 'CP', 'CO', 'PO', 'MO'
] as const;

export const pieceNames = [
  'Arma', 'Mão secundária', 'Capacete', 'Peitoral', 'Botas',
  'Capa', 'Comida', 'Poção', 'Montaria'
];

export const MAX_PARTY_SLOTS = 20;

export type Gear = {
  name: string;
  image: string;
};

export type Build = {
  id: string;
  party: string;
  name: string;
  role: string;
  color: string;
  gear: Gear[];
  instructions: string;
  player: string;
  signupId: string;
  confirmed: boolean;
  example?: boolean;
};

export type Signup = {
  id: string;
  name: string;
  main: string;
  secondary: string;
  fill: string;
  updated: string;
};

export type Config = {
  guild: string;
  subtitle: string;
  event: string;
  departure: string;
  time: string;
  notice: string;
  accent: string;
  logo: string;
  signupOpen: boolean;
};

export type Guild = {
  owner: string;
  staff: { discordId: string; editBuilds: boolean }[];
  config: Config;
  builds: Build[];
  signups: Signup[];
};

export type Actor = {
  id: string;
  discordId: string;
};

export type Command = {
  type: string;
  [key: string]: unknown;
};

export class GuildError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function permissions(g: Guild, u: Actor | null) {
  const owner = !!u && g.owner === u.id;
  const staff = u
    ? g.staff.find(s => s.discordId === u.discordId.toLowerCase())
    : undefined;

  return {
    owner,
    staff: !!staff,
    editBuilds: owner || !!staff
  };
}

const str = (value: unknown, max = 120, required = false) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new GuildError('Campo inválido ou muito longo.');
  }

  return value.trim();
};

const img = (value: unknown) => {
  const result = str(value, 120);

  if (result && !/^\/api\/images\/[a-f0-9-]{36}$/.test(result)) {
    throw new GuildError('Imagem inválida.');
  }

  return result;
};

const color = (value: unknown) => {
  const result = str(value, 7);

  if (!/^#[a-f0-9]{6}$/i.test(result)) {
    throw new GuildError('Cor inválida.');
  }

  return result;
};

const partyKey = (name: string) =>
  name.trim().toLocaleLowerCase('pt-BR');

export function partyNames(g: Guild) {
  return Array.from(new Set(g.builds.map(b => b.party)));
}

function checkLimits(g: Guild) {
  const counts = new Map<string, number>();

  for (const build of g.builds) {
    const key = partyKey(build.party);
    const count = (counts.get(key) || 0) + 1;

    if (count > MAX_PARTY_SLOTS) {
      throw new GuildError(
        `A PT ${build.party} pode ter no máximo 20 funções/vagas.`
      );
    }

    counts.set(key, count);
  }
}

export function seed(owner: string): Guild {
  const entries = [
    ['Clapper', 'Caller', '#5689bc'],
    ['Set Engage', 'Martelo de Batalha', '#5689bc'],
    ['Stopper', 'Mace 1H / Silence', '#5689bc'],
    ['Set Engage / Cleanse', 'Para-Tempo', '#5689bc'],
    ['Suporte / Cleanse', 'Locus', '#c5b459'],
    ['Runa Guarda', 'Incubus', '#c5b459'],
    ['Runa Guarda', 'Jurador', '#c5b459'],
    ['Debuff', 'Quebra-Reinos 8.1', '#a386c2'],
    ['Debuff', 'Caça-Espíritos 8.1', '#a386c2'],
    ['Debuff', 'Chama-Sombra T8', '#a386c2'],
    ['Debuff', 'Execrado T8', '#a386c2'],
    ['DPS', 'Prisma 8.1', '#d9944c'],
    ['DPS', 'Frost Elevado 8.1', '#d9944c']
  ];

  return {
    owner,
    staff: [],
    config: {
      guild: 'WE PROFIT',
      subtitle: 'Organização da guild',
      event: 'Território',
      departure: 'Hideout de Marsh',
      time: '',
      notice: 'Confira seu set e aguarde a distribuição da PT pela staff.',
      accent: '#edc76b',
      logo: '',
      signupOpen: true
    },
    builds: entries.map(([role, name, buildColor], i) => ({
      id: crypto.randomUUID(),
      party: 'Party 1',
      name,
      role,
      color: buildColor,
      gear: pieces.map(() => ({ name: '', image: '' })),
      instructions: '',
      player: i === 1 ? 'Player 1' : i === 4 ? 'Player 2' : '',
      signupId: '',
      confirmed: false,
      example: i === 1 || i === 4
    })),
    signups: []
  };
}

export function applyCommand(
  original: Guild,
  c: Command,
  user: Actor
): Guild {
  const g = structuredClone(original);
  const p = permissions(g, user);

  const own = () => {
    if (!p.owner) {
      throw new GuildError(
        'Somente o dono pode realizar esta alteração.',
        403
      );
    }
  };

  const manage = () => {
    if (!p.owner && !p.staff) {
      throw new GuildError(
        'Somente a staff e o dono podem alterar as PTs.',
        403
      );
    }
  };

  const edit = () => {
    if (!p.editBuilds) {
      throw new GuildError('Sem permissão para editar builds.', 403);
    }
  };

  const find = (id: unknown) => {
    const build = g.builds.find(b => b.id === id);

    if (!build) {
      throw new GuildError('Vaga não encontrada.', 404);
    }

    return build;
  };

  switch (c.type) {
    case 'party-create': {
      manage();

      const name = str(c.name, 60, true);

      if (g.builds.some(b => partyKey(b.party) === partyKey(name))) {
        throw new GuildError('Já existe uma PT com este nome.');
      }

      const sourceName = str(c.source ?? '', 60);

      if (sourceName) {
        const source = g.builds.filter(b => b.party === sourceName);

        if (!source.length) {
          throw new GuildError('PT de origem não encontrada.');
        }

        g.builds.push(
          ...source.map(b => ({
            ...structuredClone(b),
            id: crypto.randomUUID(),
            party: name,
            player: '',
            signupId: '',
            confirmed: false,
            example: false
          }))
        );
      } else {
        g.builds.push({
          id: crypto.randomUUID(),
          party: name,
          name: 'Nova build',
          role: 'Definir função',
          color: '#5689bc',
          gear: pieces.map(() => ({ name: '', image: '' })),
          instructions: '',
          player: '',
          signupId: '',
          confirmed: false
        });
      }

      checkLimits(g);
      break;
    }

    case 'signup': {
      if (!g.config.signupOpen) {
        throw new GuildError('A convocação está fechada.');
      }

      const name = str(c.name, 60, true);
      const main = str(c.main, 80, true);
      const secondary = str(c.secondary, 80);
      const fill = str(c.fill, 80);

      for (const id of [main, secondary, fill]) {
        if (id && !g.builds.some(b => b.id === id)) {
          throw new GuildError(
            'Uma das builds mudou. Atualize sua escolha.'
          );
        }
      }

      const duplicate = g.signups.find(
        s => s.id !== user.id &&
          s.name.toLowerCase() === name.toLowerCase()
      );

      if (duplicate) {
        throw new GuildError('Este nome já está na convocação.');
      }

      if (
        g.signups.length >= 300 &&
        !g.signups.some(s => s.id === user.id)
      ) {
        throw new GuildError('Limite de 300 inscrições atingido.');
      }

      g.signups = g.signups.filter(s => s.id !== user.id);
      g.signups.push({
        id: user.id,
        name,
        main,
        secondary,
        fill,
        updated: new Date().toISOString()
      });

      break;
    }

    case 'withdraw':
      g.signups = g.signups.filter(s => s.id !== user.id);
      break;

    case 'signup-edit': {
      manage();
      const signup = g.signups.find(s => s.id === c.id);

      if (!signup) {
        throw new GuildError('Inscrição não encontrada.');
      }

      signup.name = str(c.name, 60, true);
      break;
    }

    case 'signup-delete':
      manage();
      g.signups = g.signups.filter(s => s.id !== c.id);
      break;

    case 'assign': {
      manage();

      const build = find(c.id);
      const name = str(c.name, 60, true);
      const signupId = str(c.signupId ?? '', 100);

      if (signupId && !g.signups.some(s => s.id === signupId)) {
        throw new GuildError('Inscrição não encontrada.');
      }

      if (
        g.builds.some(other =>
          other.id !== build.id &&
          (
            other.player.toLowerCase() === name.toLowerCase() ||
            (signupId && other.signupId === signupId)
          )
        )
      ) {
        throw new GuildError(
          'Este player já está em uma vaga. Use Mover player.'
        );
      }

      build.player = name;
      build.signupId = signupId;
      build.confirmed = false;
      build.example = false;
      break;
    }

    case 'remove':
      manage();
      Object.assign(find(c.id), {
        player: '',
        signupId: '',
        confirmed: false,
        example: false
      });
      break;

    case 'move': {
      manage();

      const from = find(c.id);
      const to = find(c.to);

      if (from.id === to.id || !from.player) {
        throw new GuildError(
          'Selecione um player e uma vaga diferente.'
        );
      }

      if (to.player) {
        throw new GuildError('Vaga de destino ocupada.');
      }

      Object.assign(to, {
        player: from.player,
        signupId: from.signupId,
        confirmed: from.confirmed,
        example: from.example
      });

      Object.assign(from, {
        player: '',
        signupId: '',
        confirmed: false,
        example: false
      });

      break;
    }

    case 'confirm': {
      manage();
      const build = find(c.id);

      if (!build.player) {
        throw new GuildError('Vaga vazia.');
      }

      build.confirmed = !!c.value;
      break;
    }

    case 'build-save': {
      edit();

      const data = c.build as Record<string, unknown>;

      if (!data || typeof data !== 'object') {
        throw new GuildError('Build inválida.');
      }

      const existing = g.builds.find(b => b.id === data.id);

      if (!Array.isArray(data.gear) || data.gear.length !== 9) {
        throw new GuildError('O set deve ter nove posições.');
      }

      const fields = {
        name: str(data.name, 80, true),
        role: str(data.role, 60, true),
        party: str(data.party, 60, true),
        color: color(data.color),
        instructions: str(data.instructions, 1500),
        gear: data.gear.map((x: Record<string, unknown>) => {
          if (!x || typeof x !== 'object') {
            throw new GuildError('Equipamento inválido.');
          }

          return {
            name: str(x.name, 100),
            image: img(x.image)
          };
        })
      };

      const canonical = g.builds.find(
        b => partyKey(b.party) === partyKey(fields.party)
      );

      if (canonical) {
        fields.party = canonical.party;
      }

      if (existing) {
        Object.assign(existing, fields);
      } else {
        g.builds.push({
          id: crypto.randomUUID(),
          ...fields,
          player: '',
          signupId: '',
          confirmed: false
        });
      }

      checkLimits(g);
      break;
    }

    case 'build-delete': {
      manage();

      const build = find(c.id);

      if (build.player) {
        throw new GuildError(
          'Remova ou mova o player antes de excluir a vaga.'
        );
      }

      g.builds = g.builds.filter(b => b.id !== build.id);
      break;
    }

    case 'reorder': {
      manage();

      const build = find(c.id);
      const rows = g.builds.filter(
        b => partyKey(b.party) === partyKey(build.party)
      );

      const i = rows.findIndex(b => b.id === build.id);
      const j = i + (c.direction === 'up' ? -1 : 1);

      if (j < 0 || j >= rows.length) break;

      const from = g.builds.indexOf(rows[i]);
      const to = g.builds.indexOf(rows[j]);

      [g.builds[from], g.builds[to]] = [
        g.builds[to],
        g.builds[from]
      ];

      break;
    }

    case 'settings': {
      own();

      const data = c.config as Record<string, unknown>;

      if (!data) {
        throw new GuildError('Configuração inválida.');
      }

      g.config = {
        guild: str(data.guild, 60, true),
        subtitle: str(data.subtitle, 120),
        event: str(data.event, 80),
        departure: str(data.departure, 120),
        time: str(data.time, 30),
        notice: str(data.notice, 500),
        accent: color(data.accent),
        logo: img(data.logo),
        signupOpen: !!data.signupOpen
      };

      break;
    }

    case 'staff-save': {
      own();

      const discordId = str(c.discordId, 25, true);

      if (!/^\d{17,22}$/.test(discordId)) {
        throw new GuildError('ID do Discord inválido.');
      }

      if (
        g.staff.length >= 30 &&
        !g.staff.some(s => s.discordId === discordId)
      ) {
        throw new GuildError('Limite de 30 membros de staff.');
      }

      g.staff = g.staff.filter(s => s.discordId !== discordId);
      g.staff.push({
        discordId,
        editBuilds: !!c.editBuilds
      });

      break;
    }

    case 'staff-delete':
      own();
      g.staff = g.staff.filter(s => s.discordId !== c.discordId);
      break;

    case 'clear-examples':
      manage();

      for (const build of g.builds) {
        if (build.example) {
          Object.assign(build, {
            player: '',
            signupId: '',
            confirmed: false,
            example: false
          });
        }
      }

      break;

    default:
      throw new GuildError('Operação desconhecida.');
  }

  return g;
}
