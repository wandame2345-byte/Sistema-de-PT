import { useEffect, useState, type CSSProperties } from 'react';
import FightHistory from './FightHistory';
import AttendanceRanking from './AttendanceRanking';
import {
  Swords, Shield, Users, Settings, ImagePlus, ArrowLeft, Plus,
  MoveRight, Trash2, Check, Copy, LogOut, ChevronUp, ChevronDown,
  Pencil, X, RefreshCw, Sun, Moon
} from 'lucide-react';
import {
  pieces, pieceNames, MAX_PARTY_SLOTS,
  type Guild, type Build, type Config, type Signup
} from '../lib/guild';

type Snapshot = {
  setup: boolean;
  login?: boolean;
  error?: string;
  revision: number;
  guild: Guild;
  permissions: {
    owner: boolean;
    staff: boolean;
    editBuilds: boolean;
  };
  me: { id: string; discordId: string } | null;
};

type Action = (cmd: Record<string, unknown>) => Promise<boolean>;

function vacancyLabel(guild: Guild, build: Build) {
  const number = guild.builds
    .filter(item => item.party === build.party)
    .findIndex(item => item.id === build.id) + 1;

  return `${build.party} · ${String(number).padStart(2, '0')} · ${build.role} · ${build.name}`;
}

function GearImage({
  gear, index, onClick
}: {
  gear: Build['gear'][number];
  index: number;
  onClick?: () => void;
}) {
  const label = pieceNames[index] + (gear.name ? ' · ' + gear.name : '');

  return (
    <button
      type="button" className="gear-tile"
      title={label} aria-label={label} onClick={onClick}
    >
      {gear.image
        ? <img src={gear.image} alt={gear.name || pieceNames[index]} />
        : pieces[index]}
    </button>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('we-profit-theme') === 'light'
        ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('we-profit-theme', theme);
    } catch {
      // O tema continua funcionando sem armazenamento disponível.
    }
  }, [theme]);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState('board');
  const [tab, setTab] = useState('roster');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [party, setParty] = useState('');
  const [selected, setSelected] = useState('');
  const [moving, setMoving] = useState('');
  const [creatingParty, setCreatingParty] = useState(false);

  function navigate(nextView: string) {
    setView(nextView);
    setDetail(null);
    setMoving('');
    setCreatingParty(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function refresh() {
    const response = await fetch('/api/guild', { cache: 'no-store' });
    const data = await response.json() as Snapshot & { error?: string };

    if (response.status === 401 || response.status === 403) {
      const denied = { login: true, error: data.error } as Snapshot;
      setSnapshot(denied);
      return denied;
    }

    if (!response.ok) {
      throw Error(data.error || 'Não foi possível carregar o sistema.');
    }

    setSnapshot(data);
    return data;
  }

  useEffect(() => {
    refresh().catch(e => setError(e.message));
    const initialView = new URLSearchParams(location.search).get('view');
    if (initialView === 'signup') setView('signup');
  }, []);

  const act: Action = async cmd => {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/guild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cmd, revision: snapshot?.revision })
      });

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw Error(data.error || 'Não foi possível salvar.');
      }

      await refresh();
      setMessage('Alteração salva.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      throw Error('Use imagens de até 5 MB.');
    }

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 384 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Não foi possível preparar a imagem.');

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const compact = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(Error('Imagem inválida.')),
        'image/png'
      );
    });

    const response = await fetch('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: compact
    });

    const data = await response.json() as {
      error?: string;
      image: string;
    };

    if (!response.ok) {
      throw Error(data.error || 'Falha no envio da imagem.');
    }

    return data.image;
  }

  async function copyLink() {
    const link = location.origin + '/?view=signup';
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Link da convocação copiado.');
    } catch {
      setMessage('Link da convocação: ' + link);
    }
  }

  if (!snapshot) {
    return (
      <main className="loading">
        <Swords size={36} />
        <h1>WE PROFIT</h1>
        <p>{error || 'Carregando a guild…'}</p>
        {error && (
          <button onClick={() => refresh().catch(e => setError(e.message))}>
            Tentar novamente
          </button>
        )}
      </main>
    );
  }

  if (snapshot.login) {
    return (
      <main className="welcome">
        <Swords size={46} />
        <span className="eyebrow">WE PROFIT / ACESSO DA GUILD</span>
        <h1>Sua guild.<br />Sua próxima luta.</h1>
        <p>
          Entre com Discord para ver as PTs e responder à convocação.
          É necessário estar no servidor da guild e ter o cargo Membro.
        </p>
        <a className="button primary" href="/auth/discord">
          Entrar com Discord <MoveRight size={17} />
        </a>
        {snapshot.error && <p className="muted">{snapshot.error}</p>}
      </main>
    );
  }

  if (snapshot.setup) {
    return (
      <main className="welcome">
        <Swords size={46} />
        <span className="eyebrow">WE PROFIT / PRIMEIRO ACESSO</span>
        <h1>Sua guild.<br />Sua composição.</h1>
        <p>
          Ative sua administração para editar todas as builds, os sets,
          as imagens e a distribuição das PTs.
        </p>
        <p className="muted">
          Somente a conta definida como dono na configuração do servidor
          pode ativar a guild.
        </p>
        {snapshot.me ? (
          <button
            className="primary" disabled={busy}
            onClick={() => act({ type: 'setup' })}
          >
            Ativar minha administração <MoveRight size={17} />
          </button>
        ) : (
          <a className="button primary" href="/auth/discord" target="_top">
            Entrar com Discord
          </a>
        )}
        {error && <p role="alert" className="error">{error}</p>}
      </main>
    );
  }

  const g = snapshot.guild;
  const p = snapshot.permissions;
  const parties = Array.from(new Set(g.builds.map(b => b.party)));
  const activeParty = parties.includes(party) ? party : parties[0];
  const rows = g.builds.filter(b => b.party === activeParty);
  const modal = g.builds.find(b => b.id === detail);
  const movingBuild = g.builds.find(b => b.id === moving);
  const admin = p.owner || p.staff;

  const openAdmin = (id?: string) => {
    if (id) setSelected(id);
    setView('admin');
    setTab('roster');
  };

  return (
    <div className="app" style={{ '--accent': g.config.accent } as CSSProperties}>
      <header className="topbar">
        <div className="brand-group">
          <a className="brand" href="/" onClick={e => {
            e.preventDefault();
            navigate('board');
          }}>
            {g.config.logo
              ? <img src={g.config.logo} alt="Logo da guild" />
              : <span className="brand-icon"><Swords size={24} /></span>}
            <span>
              {g.config.guild}
              <small>{g.config.subtitle}</small>
            </span>
          </a>
          <button
            type="button" className="theme-toggle"
            onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
          </button>
        </div>

        <nav className="header-actions" aria-label="Menu principal">
          <button
            type="button"
            className={view === 'board' ? 'primary' : ''}
            aria-current={view === 'board' ? 'page' : undefined}
            onClick={() => navigate('board')}
          >
            <ArrowLeft size={15} /> Tela inicial
          </button>
          <button
            type="button"
            className={view === 'signup' ? 'primary' : ''}
            aria-current={view === 'signup' ? 'page' : undefined}
            onClick={() => navigate('signup')}
          >
            <Users size={15} /> Minha inscrição
          </button>
          {admin && (
            <button
              type="button"
              className={view === 'admin' ? 'primary' : ''}
              aria-current={view === 'admin' ? 'page' : undefined}
              onClick={() => {
                openAdmin();
                navigate('admin');
              }}
            >
              <Shield size={15} /> Administração
            </button>
          )}
          {snapshot.me ? (
            <a
              className="icon-link" href="/auth/logout"
              target="_top" aria-label="Sair" title="Sair"
            >
              <LogOut size={17} />
            </a>
          ) : (
            <a className="button" href="/auth/discord" target="_top">Entrar</a>
          )}
        </nav>
      </header>

      <div className="notifications" aria-live="polite">
        {message && (
          <div className="success">
            {message}
            <button aria-label="Fechar aviso" onClick={() => setMessage('')}>
              <X size={14} />
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            <button aria-label="Fechar erro" onClick={() => setError('')}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <main>
        {view === 'board' && (
          <>
            <div className="page-title">
              <div>
                <span className="eyebrow">PRONTOS PARA A PRÓXIMA LUTA</span>
                <h1>Composição da PT<span className="gold-dot">.</span></h1>
                <p className="muted">
                  {[g.config.event, g.config.departure, g.config.time]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <button className="quiet" onClick={() =>
                refresh()
                  .then(() => setMessage('Painel atualizado.'))
                  .catch(e => setError(e.message))
              }>
                <RefreshCw size={14} /> Atualizar
              </button>
            </div>

            {g.config.notice && (
              <div className="notice">
                <Shield size={16} />{g.config.notice}
              </div>
            )}

            <div className="pt-ranking-layout">
              <div className="pt-board">
                <div className="party-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <div className="tabs" style={{ flexWrap: 'wrap' }}>
                    {parties.map(name => (
                      <button
                        className={activeParty === name ? 'active' : ''}
                        key={name} onClick={() => setParty(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>

                  {admin && (
                    <div className="actions">
                      <button disabled={busy} onClick={() => {
                        setError('');
                        setCreatingParty(true);
                      }}>
                        <Plus size={15} /> Adicionar PT
                      </button>
                      <button
                        type="button"
                        disabled={busy || !activeParty || rows.length >= MAX_PARTY_SLOTS}
                        onClick={() => {
                          setSelected('__new__');
                          setView('admin');
                          setTab('builds');
                        }}
                      >
                        <Plus size={15} /> Adicionar função
                      </button>
                    </div>
                  )}

                  <span className="muted">
                    {rows.filter(b => b.player).length} / {rows.length} vagas preenchidas
                    {' · '}máximo de 20 por PT
                  </span>
                </div>

                <div className="table-shell">
                  <table className="roster">
                    <thead>
                      <tr>
                        <th>Nº</th><th>Função</th><th>Build / arma</th>
                        <th>Equipamentos do set</th><th>Jogador</th>
                        <th>Vaga</th><th>OK</th>{admin && <th>Ações</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((b, i) => (
                        <tr key={b.id}>
                          <td className="num">{String(i + 1).padStart(2, '0')}</td>
                          <td>
                            <span className="role" style={{ borderLeftColor: b.color }}>
                              {b.role}
                            </span>
                          </td>
                          <td>
                            <button className="text-button build-name" onClick={() => setDetail(b.id)}>
                              {b.name}
                            </button>
                          </td>
                          <td>
                            <div className="gear-line">
                              {b.gear.map((item, j) => (
                                <GearImage
                                  key={j} gear={item} index={j}
                                  onClick={() => setDetail(b.id)}
                                />
                              ))}
                            </div>
                          </td>
                          <td className={b.player ? 'player-name' : 'muted'}>
                            {b.player || '—'}
                            {b.example && <small className="example">Exemplo</small>}
                          </td>
                          <td>
                            <span className={'vacancy ' + (b.player ? 'occupied' : 'available')}>
                              {b.player ? 'Vaga indisponível' : 'Vaga disponível'}
                            </span>
                          </td>
                          <td>
                            {b.confirmed
                              ? <Check className="green" size={17} />
                              : <span className="muted">—</span>}
                          </td>
                          {admin && (
                            <td>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button className="small" onClick={() => openAdmin(b.id)}>
                                  <Pencil size={13} /> Gerenciar
                                </button>
                                {b.player && (
                                  <button className="small" disabled={busy} onClick={() => {
                                    setError('');
                                    setMoving(b.id);
                                  }}>
                                    <MoveRight size={13} /> Mover
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!g.builds.length && (
                    <div className="empty">
                      Nenhuma build cadastrada. Use Adicionar PT para começar.
                    </div>
                  )}
                </div>

                <div className="board-footer">
                  <span>
                    {pieces.map((code, i) => code + ' ' + pieceNames[i]).join(' · ')}
                  </span>
                  <span>Distribuição pela staff e pelo dono</span>
                </div>
              </div>

              <AttendanceRanking
                revision={snapshot.revision}
                admin={admin} busy={busy} act={act}
              />
            </div>
          </>
        )}

        {view === 'signup' && (
          <>
            <div className="page-title">
              <div>
                <span className="eyebrow">CONVOCAÇÃO / PING</span>
                <h1>Qual é a sua função?</h1>
                <p className="muted">
                  Escolha suas preferências. A staff define sua vaga na composição.
                </p>
              </div>
            </div>
            {snapshot.me ? (
              <>
                <SignupForm guild={g} me={snapshot.me.id} act={act} busy={busy} />
                {g.signups.some(s => s.id === snapshot.me?.id) && (
                  <button className="primary" type="button" onClick={() => navigate('board')}>
                    <Users size={15} /> Visualizar PTs
                  </button>
                )}
              </>
            ) : (
              <div className="panel">
                <h2>Identifique-se para responder</h2>
                <p className="muted">
                  Sua conta permite atualizar sua inscrição sem alterar a de outros players.
                </p>
                <a className="button primary" href="/auth/discord?returnTo=signup" target="_top">
                  Entrar com Discord
                </a>
              </div>
            )}
          </>
        )}

        {view === 'admin' && admin && (
          <>
            <div className="page-title">
              <div>
                <span className="eyebrow">
                  {p.owner ? 'ACESSO DO DONO' : 'ACESSO DA STAFF'}
                </span>
                <h1>Administração<span className="gold-dot">.</span></h1>
                <p className="muted">Tudo que a guild vê, organizado por você.</p>
              </div>
              <button onClick={copyLink}>
                <Copy size={15} /> Copiar link da convocação
              </button>
            </div>

            <nav className="admin-tabs" aria-label="Administração">
              {[
                ['roster', 'PTs e players', Users],
                ['ping', 'Convocação', Users],
                ['fights', 'Lutas e convocações', Swords],
                ['builds', 'Builds e imagens', ImagePlus],
                ...(p.owner ? [
                  ['settings', 'Visualização', Settings],
                  ['staff', 'Staff e acessos', Shield]
                ] : [])
              ].map(([id, label, Icon]) => {
                const I = Icon as typeof Users;
                return (
                  <button
                    key={id as string}
                    className={tab === id ? 'active' : ''}
                    onClick={() => setTab(id as string)}
                  >
                    <I size={16} />{label as string}
                  </button>
                );
              })}
            </nav>

            {tab === 'roster' && (
              <Allocation
                guild={g} initial={selected} act={act} busy={busy}
                onEdit={id => {
                  setSelected(id);
                  setTab('builds');
                }}
              />
            )}

            {tab === 'fights' && (
              <FightHistory
                guild={g} revision={snapshot.revision}
                busy={busy} act={act}
              />
            )}

            {tab === 'ping' && (
              <Ping
                guild={g} owner={admin} act={act} busy={busy}
                onAssign={signup => {
                  setSelected(g.builds.find(b => !b.player)?.id || '');
                  setTab('roster');
                  setMessage(
                    'Selecione ' + signup.name +
                    ' na lista da convocação e escolha a vaga.'
                  );
                }}
              />
            )}

            {tab === 'builds' && (
              <BuildEditor
                key={selected + ':' + (activeParty || 'Party 1')}
                defaultParty={activeParty || 'Party 1'}
                guild={g} initial={selected} owner={admin}
                act={act} busy={busy} upload={upload} onError={setError}
              />
            )}

            {tab === 'settings' && p.owner && (
              <SettingsForm
                guild={g} act={act} busy={busy}
                upload={upload} onError={setError}
              />
            )}

            {tab === 'staff' && p.owner && (
              <Staff guild={g} act={act} busy={busy} />
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <span>
          © 2025 Albion PTS System. All rights reserved. Made with ❤ by [Prozin]
        </span>
      </footer>

      {admin && creatingParty && (
        <CreateParty
          guild={g} act={act} busy={busy} error={error}
          onClose={() => setCreatingParty(false)}
          onCreated={name => {
            setParty(name);
            navigate('board');
          }}
        />
      )}

      {admin && movingBuild && (
        <MovePlayer
          key={movingBuild.id}
          guild={g} source={movingBuild}
          act={act} busy={busy} error={error}
          onClose={() => setMoving('')}
        />
      )}

      {modal && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="modal" role="dialog" aria-modal="true"
            aria-label={'Set ' + modal.name}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') setDetail(null);
            }}
          >
            <div className="between">
              <div>
                <span className="eyebrow">{modal.role} / {modal.party}</span>
                <h2>{modal.name}</h2>
              </div>
              <button autoFocus aria-label="Fechar set" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="set-detail">
              {modal.gear.map((item, i) => (
                <div key={i}>
                  <GearImage gear={item} index={i} />
                  <strong>{pieceNames[i]}</strong>
                  <span className="muted">{item.name || 'Não definido'}</span>
                </div>
              ))}
            </div>
            {modal.instructions && <p className="instructions">{modal.instructions}</p>}
            <p className="muted">Player: {modal.player || 'Vaga disponível'}</p>
          </section>
        </div>
      )}
    </div>
  );
}

function CreateParty({
  guild, act, busy, error, onClose, onCreated
}: {
  guild: Guild;
  act: Action;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const parties = Array.from(new Set(guild.builds.map(b => b.party)));
  let number = 1;
  while (parties.some(p => p.toLowerCase() === `party ${number}`)) number++;

  const [name, setName] = useState(`Party ${number}`);
  const [source, setSource] = useState('');

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <section
        className="modal" role="dialog" aria-modal="true"
        aria-label="Adicionar PT"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}
      >
        <div className="between">
          <h2>Adicionar PT</h2>
          <button disabled={busy} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <form onSubmit={async e => {
          e.preventDefault();
          if (busy || !name.trim()) return;
          if (await act({ type: 'party-create', name: name.trim(), source })) {
            onCreated(name.trim());
          }
        }}>
          <label>
            Nome da PT
            <input
              autoFocus required maxLength={60} value={name}
              onChange={e => setName(e.target.value)} disabled={busy}
            />
          </label>
          <label>
            Composição inicial
            <select value={source} onChange={e => setSource(e.target.value)} disabled={busy}>
              <option value="">Começar com uma vaga para configurar</option>
              {parties.map(party => (
                <option key={party} value={party}>Copiar builds e imagens de {party}</option>
              ))}
            </select>
          </label>
          <p className="muted">
            Cada PT pode ter até {MAX_PARTY_SLOTS} funções/vagas.
            Você pode criar quantas PTs precisar.
            Players e confirmações não são copiados.
          </p>
          <p className="muted">
            Para escolher suas funções, entre em Administração → Builds e imagens.
          </p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
            <button className="primary" disabled={busy || !name.trim()}>
              <Plus size={15} />{busy ? 'Criando…' : 'Criar PT'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MovePlayer({
  guild: g, source, act, busy, error, onClose
}: {
  guild: Guild;
  source: Build;
  act: Action;
  busy: boolean;
  error: string;
  onClose: () => void;
}) {
  const [target, setTarget] = useState('');
  const destinations = g.builds.filter(b => b.id !== source.id);
  const destination = destinations.find(b => b.id === target);
  const canMove = !!source.player && !!destination && !destination.player;
  const hasVacancy = destinations.some(b => !b.player);

  return (
    <div
      className="modal-backdrop" style={{ zIndex: 100 }}
      onClick={() => { if (!busy) onClose(); }}
    >
      <section
        className="modal" role="dialog" aria-modal="true"
        aria-labelledby="move-player-title"
        style={{ width: 'min(560px, 94vw)' }}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}
      >
        <div className="between">
          <div>
            <span className="eyebrow">DISTRIBUIÇÃO DA PT</span>
            <h2 id="move-player-title">Mover {source.player || 'player'}</h2>
          </div>
          <button aria-label="Fechar" disabled={busy} onClick={onClose}><X size={18} /></button>
        </div>
        <p className="muted">De: {vacancyLabel(g, source)}</p>
        <form onSubmit={async e => {
          e.preventDefault();
          if (!canMove || busy) return;
          if (await act({ type: 'move', id: source.id, to: target })) onClose();
        }}>
          <label>
            Para qual vaga?
            <select
              autoFocus required value={target}
              disabled={busy || !source.player}
              onChange={e => setTarget(e.target.value)}
            >
              <option value="">Selecione a função de destino</option>
              {destinations.map(b => (
                <option key={b.id} value={b.id} disabled={!!b.player}>
                  {vacancyLabel(g, b)}
                  {b.player ? ' — Ocupada por ' + b.player : ' — Disponível'}
                </option>
              ))}
            </select>
          </label>
          {!hasVacancy && <p className="muted">Não há outra vaga disponível para mover este player.</p>}
          {!source.player && <p className="muted">Esta vaga não possui mais um player.</p>}
          <p className="muted">A vaga anterior ficará disponível. O set permanece na função.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
            <button className="primary" disabled={busy || !canMove}>
              <MoveRight size={15} />{busy ? 'Movendo…' : 'Mover player'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SignupForm({
  guild: g, me, act, busy
}: {
  guild: Guild;
  me: string;
  act: Action;
  busy: boolean;
}) {
  const existing = g.signups.find(s => s.id === me);
  const [name, setName] = useState(existing?.name || '');
  const [main, setMain] = useState(existing?.main || '');
  const [secondary, setSecondary] = useState(existing?.secondary || '');
  const [fill, setFill] = useState(existing?.fill || '');

  const fields: [string, string, (s: string) => void, boolean][] = [
    ['Main role · principal', main, setMain, true],
    ['Role secundária', secondary, setSecondary, false],
    ['Role fill · alternativa', fill, setFill, false]
  ];

  return (
    <div className="signup-layout">
      <form className="panel" onSubmit={e => {
        e.preventDefault();
        act({ type: 'signup', name, main, secondary, fill });
      }}>
        <h2>{existing ? 'Sua inscrição' : 'Entrar na convocação'}</h2>
        <label>
          Nome no jogo
          <input
            value={name} maxLength={60} required
            onChange={e => setName(e.target.value)} placeholder="Ex.: Wandame"
          />
        </label>
        {fields.map(([label, value, change, required]) => (
          <label key={label}>
            {label}
            <select value={value} required={required} onChange={e => change(e.target.value)}>
              <option value="">
                {required ? 'Selecione sua principal' : 'Sem preferência / não tenho'}
              </option>
              {g.builds.map(b => (
                <option value={b.id} key={b.id}>{b.party} · {b.role} — {b.name}</option>
              ))}
            </select>
          </label>
        ))}
        <button className="primary" disabled={busy || !g.config.signupOpen}>
          {g.config.signupOpen
            ? (existing ? 'Atualizar inscrição' : 'Confirmar inscrição')
            : 'Convocação fechada'}
        </button>
        {existing && (
          <button type="button" disabled={busy} onClick={() => act({ type: 'withdraw' })}>
            Retirar minha inscrição
          </button>
        )}
      </form>
      <div className="panel signup-aside">
        <Users size={28} />
        <h2>Você escolhe as preferências.<br />A staff monta a PT.</h2>
        <p className="muted">
          Sua inscrição aparece na convocação. Nenhuma vaga é ocupada automaticamente.
        </p>
        <div className="steps">
          <p><span>01</span> Informe seu nome no jogo.</p>
          <p><span>02</span> Selecione as funções que você joga.</p>
          <p><span>03</span> Acompanhe sua vaga no painel da guild.</p>
        </div>
        {existing && <span className="vacancy available">Inscrição recebida</span>}
      </div>
    </div>
  );
}

function Allocation({
  guild: g, initial, act, busy, onEdit
}: {
  guild: Guild;
  initial: string;
  act: Action;
  busy: boolean;
  onEdit: (id: string) => void;
}) {
  const [id, setId] = useState(
    g.builds.some(b => b.id === initial) ? initial : g.builds[0]?.id || ''
  );
  const [name, setName] = useState('');
  const [signup, setSignup] = useState('');
  const [target, setTarget] = useState('');
  const b = g.builds.find(build => build.id === id);

  useEffect(() => {
    setName(b?.player || '');
    setSignup(b?.signupId || '');
    setTarget('');
  }, [id, b?.player, b?.signupId]);

  if (!b) {
    return (
      <div className="panel">
        <p>Cadastre uma build para criar a primeira vaga.</p>
        <button onClick={() => onEdit('')}>Criar build</button>
      </div>
    );
  }

  const destination = g.builds.find(build => build.id === target);

  return (
    <div className="admin-grid">
      <div className="panel">
        <div className="between">
          <h2>Distribuir players</h2>
          <span className={'vacancy ' + (b.player ? 'occupied' : 'available')}>
            {b.player ? 'Vaga indisponível' : 'Vaga disponível'}
          </span>
        </div>
        <label>
          Vaga / função
          <select value={id} onChange={e => setId(e.target.value)}>
            {g.builds.map(build => (
              <option key={build.id} value={build.id}>
                {vacancyLabel(g, build)}
                {build.player ? ' · ' + build.player : ' · Livre'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Escolher da convocação
          <select value={signup} onChange={e => {
            setSignup(e.target.value);
            const entry = g.signups.find(s => s.id === e.target.value);
            if (entry) setName(entry.name);
          }}>
            <option value="">Nome manual</option>
            {g.signups.map(s => (
              <option value={s.id} key={s.id}>
                {s.name} · {g.builds.find(build => build.id === s.main)?.name || 'Build removida'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nome do player
          <input
            value={name} onChange={e => setName(e.target.value)}
            maxLength={60} placeholder="Digite o nome de quem você quiser"
          />
        </label>
        <div className="actions">
          <button
            className="primary" disabled={busy || !name.trim()}
            onClick={() => act({ type: 'assign', id, name, signupId: signup })}
          >
            Salvar nome
          </button>
          <button
            className="danger" disabled={busy || !b.player}
            onClick={() => act({ type: 'remove', id })}
          >
            <Trash2 size={14} /> Remover player
          </button>
        </div>

        <div className="divider" />
        <h3>Mover para outra função</h3>
        <label>
          Vaga de destino
          <select value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Escolha uma vaga disponível</option>
            {g.builds.filter(other => other.id !== id).map(other => (
              <option key={other.id} value={other.id} disabled={!!other.player}>
                {vacancyLabel(g, other)}
                {other.player ? ' · Ocupada' : ' · Livre'}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !destination || !!destination.player || !b.player}
          onClick={async () => {
            if (await act({ type: 'move', id, to: target })) setId(target);
          }}
        >
          <MoveRight size={15} /> Mover player
        </button>
        <label className="check-label">
          <input
            type="checkbox" checked={b.confirmed} disabled={busy || !b.player}
            onChange={e => act({ type: 'confirm', id, value: e.target.checked })}
          />
          Presença confirmada
        </label>
      </div>

      <div>
        <div className="panel">
          <span className="eyebrow">SET DESTA VAGA</span>
          <h2>{b.name}</h2>
          <p className="muted">{b.role} · {b.party}</p>
          <div className="gear-line roomy">
            {b.gear.map((item, i) => <GearImage key={i} gear={item} index={i} />)}
          </div>
          <button onClick={() => onEdit(id)}>
            <ImagePlus size={15} /> Editar build e imagens
          </button>
          <p className="muted">
            Ao mover um player, a vaga anterior fica disponível.
            Os equipamentos pertencem à build e permanecem na função.
          </p>
        </div>
        {g.builds.some(build => build.example) && (
          <div className="panel">
            <h3>Players de exemplo</h3>
            <p className="muted">
              Player 1 e Player 2 ajudam a visualizar a composição inicial.
            </p>
            <button disabled={busy} onClick={() => act({ type: 'clear-examples' })}>
              Remover somente os exemplos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Ping({
  guild: g, owner, act, busy, onAssign
}: {
  guild: Guild;
  owner: boolean;
  act: Action;
  busy: boolean;
  onAssign: (s: Signup) => void;
}) {
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const role = (id: string) =>
    g.builds.find(b => b.id === id)?.name || (id ? 'Build removida' : '—');

  return (
    <div className="panel">
      <div className="between">
        <h2>Convocação / PING</h2>
        <span className="muted">{g.signups.length} players</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Player</th><th>Main role</th><th>Role secundária</th>
              <th>Role fill</th><th>Vaga</th>{owner && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {g.signups.map(s => (
              <tr key={s.id}>
                <td>
                  {editing === s.id ? (
                    <input
                      aria-label="Nome do player" value={name} maxLength={60}
                      onChange={e => setName(e.target.value)}
                    />
                  ) : s.name}
                </td>
                <td>{role(s.main)}</td><td>{role(s.secondary)}</td><td>{role(s.fill)}</td>
                <td>{g.builds.find(b => b.signupId === s.id)?.name || 'Aguardando'}</td>
                {owner && (
                  <td>
                    <div className="actions">
                      {editing === s.id ? (
                        <>
                          <button disabled={busy} onClick={async () => {
                            if (await act({ type: 'signup-edit', id: s.id, name })) {
                              setEditing('');
                            }
                          }}>Salvar</button>
                          <button onClick={() => setEditing('')}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button className="small" onClick={() => onAssign(s)}>Distribuir</button>
                          <button
                            className="small" aria-label={'Renomear ' + s.name}
                            onClick={() => { setEditing(s.id); setName(s.name); }}
                          ><Pencil size={13} /></button>
                          <button
                            className="small danger"
                            aria-label={'Retirar ' + s.name + ' da convocação'}
                            disabled={busy}
                            onClick={() => act({ type: 'signup-delete', id: s.id })}
                          ><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!g.signups.length && (
        <div className="empty">
          A convocação está pronta. Os nomes aparecerão aqui conforme os players responderem.
        </div>
      )}
    </div>
  );
}

function BuildEditor({
  guild: g, initial, defaultParty, owner, act, busy, upload, onError
}: {
  guild: Guild;
  initial: string;
  defaultParty: string;
  owner: boolean;
  act: Action;
  busy: boolean;
  upload: (f: File) => Promise<string>;
  onError: (s: string) => void;
}) {
  const [id, setId] = useState(
    initial === '__new__' ? ''
      : g.builds.some(b => b.id === initial) ? initial
      : g.builds.find(b => b.party === defaultParty)?.id || ''
  );
  const [draft, setDraft] = useState<Build | null>(null);
  const [uploading, setUploading] = useState(false);

  const blank = (): Build => ({
    id: '', name: '', role: '', party: defaultParty, color: '#5689bc',
    gear: pieces.map(() => ({ name: '', image: '' })),
    instructions: '', player: '', signupId: '', confirmed: false
  });

  useEffect(() => {
    setDraft(current => structuredClone(
      g.builds.find(b => b.id === id) || {
        ...blank(), party: current?.party || defaultParty
      }
    ));
  }, [id]);

  if (!draft) return null;

  const count = g.builds.filter(b =>
    b.id !== draft.id &&
    b.party.trim().toLowerCase() === draft.party.trim().toLowerCase()
  ).length;
  const full = count >= MAX_PARTY_SLOTS;
  const change = (key: keyof Build, value: unknown) =>
    setDraft({ ...draft, [key]: value });

  function gear(i: number, key: 'name' | 'image', value: string) {
    setDraft(current => current ? {
      ...current,
      gear: current.gear.map((item, j) =>
        j === i ? { ...item, [key]: value } : item
      )
    } : current);
  }

  return (
    <div className="panel">
      <div className="between">
        <div>
          <h2>Builds, sets e imagens</h2>
          <p className="muted">
            Escolha manualmente a função e a build de cada vaga.
            Cada PT pode ter até 20 vagas.
          </p>
        </div>
        {owner && (
          <button type="button" disabled={busy || uploading} onClick={() => {
            setId('');
            setDraft({ ...blank(), party: draft.party });
          }}>
            <Plus size={15} /> Nova build / vaga
          </button>
        )}
      </div>
      <label>
        Escolher build
        <select value={id} onChange={e => setId(e.target.value)}>
          <option value="">Nova build</option>
          {g.builds.map(b => (
            <option key={b.id} value={b.id}>{b.party} · {b.role} — {b.name}</option>
          ))}
        </select>
      </label>

      <form onSubmit={async e => {
        e.preventDefault();
        if (busy || uploading) return;
        if (full) {
          onError('Esta PT já possui 20 funções. Escolha outra PT.');
          return;
        }
        if (await act({ type: 'build-save', build: draft })) {
          setDraft(id ? { ...draft } : { ...blank(), party: draft.party });
        }
      }}>
        <div className="form-grid">
          <label>
            Nome da build
            <input
              value={draft.name} maxLength={80} required
              onChange={e => change('name', e.target.value)}
            />
          </label>
          <label>
            Função
            <input
              value={draft.role} maxLength={60} required
              onChange={e => change('role', e.target.value)}
              placeholder="Digite a função que você quiser"
            />
          </label>
          <label>
            PT / grupo
            <input
              list="party-names" value={draft.party} maxLength={60} required
              onChange={e => change('party', e.target.value)}
            />
            <datalist id="party-names">
              {Array.from(new Set(g.builds.map(b => b.party))).map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label>
            Cor da função
            <input type="color" value={draft.color} onChange={e => change('color', e.target.value)} />
          </label>
        </div>

        <div className="image-editor">
          {draft.gear.map((item, i) => (
            <section className="image-card" key={i}>
              <div className="between">
                <strong>{pieces[i]} <span className="muted">/ {pieceNames[i]}</span></strong>
                <div className="image-preview">
                  {item.image
                    ? <img src={item.image} alt={pieceNames[i]} />
                    : <ImagePlus size={22} />}
                </div>
              </div>
              <label>
                Nome e tier
                <input
                  value={item.name} maxLength={100} placeholder={pieceNames[i]}
                  onChange={e => gear(i, 'name', e.target.value)}
                />
              </label>
              <label className={'file-button ' + (uploading ? 'disabled' : '')}>
                <ImagePlus size={14} />
                {item.image ? 'Trocar imagem' : 'Escolher imagem'}
                <input
                  type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploading || busy}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      gear(i, 'image', await upload(file));
                    } catch (err) {
                      onError(err instanceof Error ? err.message : 'Falha no envio.');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
              {item.image && (
                <button className="text-button muted" type="button" onClick={() => gear(i, 'image', '')}>
                  Remover imagem
                </button>
              )}
            </section>
          ))}
        </div>

        <label>
          Habilidades, passivas e instruções
          <textarea
            value={draft.instructions} maxLength={1500} rows={3}
            onChange={e => change('instructions', e.target.value)}
            placeholder="Explique o set e como jogar nesta função."
          />
        </label>
        <p className="muted">
          {draft.party}: {count + (draft.id ? 1 : 0)} / {MAX_PARTY_SLOTS} funções salvas.
        </p>
        {full && <p role="alert" className="error">Esta PT já possui 20 funções. Escolha outra PT.</p>}
        <div className="actions">
          <button className="primary" disabled={busy || uploading || full}>
            {uploading ? 'Enviando imagem…' : 'Salvar build e imagens'}
          </button>
          {id && owner && (
            <>
              <button type="button" disabled={busy} onClick={() => act({ type: 'reorder', id, direction: 'up' })}>
                <ChevronUp size={16} /> Subir
              </button>
              <button type="button" disabled={busy} onClick={() => act({ type: 'reorder', id, direction: 'down' })}>
                <ChevronDown size={16} /> Descer
              </button>
              <button
                className="danger" type="button"
                disabled={busy || !!g.builds.find(b => b.id === id)?.player}
                onClick={async () => {
                  if (confirm('Excluir esta vaga e sua build?')) {
                    if (await act({ type: 'build-delete', id })) {
                      setId('');
                      setDraft(blank());
                    }
                  }
                }}
              >
                <Trash2 size={14} /> Excluir vaga
              </button>
            </>
          )}
        </div>
        <p className="muted">
          PNG, JPG, WebP ou GIF · até 5 MB por imagem.
          As fotos aparecem no tamanho compacto aprovado.
        </p>
      </form>
    </div>
  );
}

function SettingsForm({
  guild: g, act, busy, upload, onError
}: {
  guild: Guild;
  act: Action;
  busy: boolean;
  upload: (f: File) => Promise<string>;
  onError: (s: string) => void;
}) {
  const [c, setC] = useState<Config>({ ...g.config });
  const [uploading, setUploading] = useState(false);
  const change = (key: keyof Config, value: unknown) =>
    setC({ ...c, [key]: value });

  return (
    <form className="panel settings-form" onSubmit={e => {
      e.preventDefault();
      act({ type: 'settings', config: c });
    }}>
      <h2>Visualização dos players</h2>
      <p className="muted">
        Personalize os textos, as informações da convocação,
        a identidade e os avisos do painel.
      </p>
      <div className="form-grid">
        {([
          ['guild', 'Nome da guild', 60],
          ['subtitle', 'Subtítulo', 120],
          ['event', 'Conteúdo / evento', 80],
          ['departure', 'Local de saída', 120],
          ['time', 'Horário / timer', 30]
        ] as const).map(([key, label, max]) => (
          <label key={key}>
            {label}
            <input
              value={c[key]} maxLength={max} required={key === 'guild'}
              onChange={e => change(key, e.target.value)}
            />
          </label>
        ))}
        <label>
          Cor de destaque
          <input type="color" value={c.accent} onChange={e => change('accent', e.target.value)} />
        </label>
      </div>
      <label>
        Aviso para os players
        <textarea
          value={c.notice} maxLength={500} rows={3}
          onChange={e => change('notice', e.target.value)}
        />
      </label>
      <div className="actions">
        {c.logo && <img className="logo-preview" src={c.logo} alt="Logo da guild" />}
        <label className="file-button">
          <ImagePlus size={15} />{c.logo ? 'Trocar logo' : 'Adicionar logo'}
          <input
            type="file" accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={uploading || busy}
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                change('logo', await upload(file));
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Falha no envio.');
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {c.logo && <button type="button" onClick={() => change('logo', '')}>Remover logo</button>}
      </div>
      <label className="check-label">
        <input
          type="checkbox" checked={c.signupOpen}
          onChange={e => change('signupOpen', e.target.checked)}
        />
        Convocação aberta para inscrições
      </label>
      <button className="primary" disabled={busy || uploading}>Salvar visualização</button>
    </form>
  );
}

function Staff({
  guild: g, act, busy
}: {
  guild: Guild;
  act: Action;
  busy: boolean;
}) {
  const [discordId, setDiscordId] = useState('');

  return (
    <div className="admin-grid">
      <form className="panel" onSubmit={async e => {
        e.preventDefault();
        if (await act({ type: 'staff-save', discordId, editBuilds: true })) {
          setDiscordId('');
        }
      }}>
        <h2>Autorizar staff</h2>
        <p className="muted">
          Use o ID da conta do Discord com a qual a pessoa entra.
          A staff pode adicionar funções, editar builds e distribuir players.
        </p>
        <label>
          ID do Discord
          <input
            type="text" value={discordId} maxLength={200} required
            onChange={e => setDiscordId(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>Salvar permissão</button>
      </form>
      <div className="panel">
        <h2>Staff autorizada</h2>
        {g.staff.map(s => (
          <div className="staff-row" key={s.discordId}>
            <div>
              <strong>{s.discordId}</strong>
              <small>Gerencia PTs, funções, builds e players</small>
            </div>
            <button
              className="danger small" disabled={busy}
              onClick={() => act({ type: 'staff-delete', discordId: s.discordId })}
            >Revogar</button>
          </div>
        ))}
        {!g.staff.length && <p className="muted">Nenhuma conta de staff autorizada ainda.</p>}
        <p className="muted">
          A staff também precisa pertencer ao servidor e possuir o cargo Membro.
          A staff pode gerenciar as PTs, funções e players.
        </p>
      </div>
    </div>
  );
}
