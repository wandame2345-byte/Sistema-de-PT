import { useEffect, useRef, useState } from 'react';
import type { Guild } from '../lib/guild';

type FightSummary = {
  id: string;
  title: string;
  fightDate: string;
  savedAt: string;
  players: number;
  signups: number;
};

type SavedFight = FightSummary & {
  data: Pick<Guild, 'config' | 'builds' | 'signups'>;
};

type Filters = {
  title: string;
  player: string;
  start: string;
  end: string;
};

type Props = {
  guild: Guild;
  revision: number;
  busy: boolean;
  act: (command: Record<string, unknown>) => Promise<boolean>;
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateLabel(value: string) {
  return value.slice(0, 10).split('-').reverse().join('/');
}

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const data = await response.json();

  if (!response.ok) {
    throw Error(data.error || 'Não foi possível carregar o histórico.');
  }

  return data as T;
}

export default function FightHistory({
  guild, revision, busy, act
}: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    title: '', player: '', start: '', end: ''
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{
    fights: FightSummary[];
    total: number;
  }>({ fights: [], total: 0 });
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<SavedFight | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const requestId = useRef<{ id: string; key: string } | null>(null);
  const lock = useRef(false);
  const disabled = busy || pending;
  const players = guild.builds.filter(build => build.player).length;

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      ...applied,
      page: String(page)
    });

    getJSON<{ fights: FightSummary[]; total: number }>(
      `/api/fights?${params}`, controller.signal
    )
      .then(setResult)
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, applied, page, revision]);

  useEffect(() => {
    setSelected(null);
    setDetailLoading(false);

    if (!selectedId) return;

    const controller = new AbortController();
    setDetailLoading(true);
    setError('');

    getJSON<SavedFight>(
      `/api/fights/${selectedId}`, controller.signal
    )
      .then(setSelected)
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [selectedId, revision]);

  async function save(reset: boolean) {
    if (disabled || lock.current) return;

    setError('');
    setNotice('');

    if (!title.trim() || !date) {
      setError('Preencha o nome e a data da luta.');
      return;
    }

    if (!players && !guild.signups.length) {
      setError('Não há jogadores ou inscrições para salvar.');
      return;
    }

    if (reset && !window.confirm(
      'Salvar esta luta no histórico e depois retirar todos os jogadores ' +
      'das PTs e da convocação?'
    )) return;

    lock.current = true;
    setPending(true);

    try {
      const key = JSON.stringify([title.trim(), date, reset, revision]);

      if (requestId.current?.key !== key) {
        requestId.current = { id: crypto.randomUUID(), key };
      }

      if (await act({
        type: 'fight-save',
        title: title.trim(),
        date,
        reset,
        requestId: requestId.current.id
      })) {
        requestId.current = null;
        setNotice(reset
          ? 'Luta salva. PTs e convocação prontas para novos jogadores.'
          : 'Luta salva no histórico.');
        setOpen(true);
        setApplied({ title: '', player: '', start: '', end: '' });
        setFilters({ title: '', player: '', start: '', end: '' });
        setPage(0);
        setSelectedId('');
        if (reset) setTitle('');
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function clear() {
    if (disabled || lock.current) return;

    if (!window.confirm(
      'Zerar sem salvar uma nova luta? Todas as inscrições e jogadores das ' +
      'PTs serão removidos. Builds, funções, imagens e lutas já salvas serão mantidas.'
    )) return;

    lock.current = true;
    setPending(true);
    setError('');
    setNotice('');

    try {
      if (await act({ type: 'call-clear' })) {
        requestId.current = null;
        setNotice('Convocação zerada. As funções das PTs foram mantidas.');
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function removeFight(fight: FightSummary) {
    if (disabled || lock.current) return;

    if (!window.confirm(
      `Excluir a luta "${fight.title}" de ${dateLabel(fight.fightDate)}? ` +
      'Todas as presenças desta luta sairão do ranking. Esta exclusão é definitiva.'
    )) return;

    lock.current = true;
    setPending(true);

    try {
      if (await act({ type: 'fight-delete', fightId: fight.id })) {
        setSelectedId('');
        setPage(0);
        setNotice('Luta excluída do histórico e do ranking.');
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function removeParticipant(build: Guild['builds'][number]) {
    if (!selected || disabled || lock.current || !build.player) return;

    if (!window.confirm(
      `Remover a participação de ${build.player} em "${selected.title}"? ` +
      'A presença sairá do ranking e de todas as PTs desta luta salva. ' +
      'A PT atual não será alterada.'
    )) return;

    lock.current = true;
    setPending(true);

    const playerKey = build.signupId
      ? 'id:' + build.signupId
      : 'name:' + build.player.trim().normalize('NFKC').toLowerCase();

    try {
      if (await act({
        type: 'fight-participant-remove',
        fightId: selected.id,
        playerKey
      })) {
        setNotice('Participação removida.');
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <div className="between">
        <div>
          <h2>Lutas e convocações</h2>
          <p className="muted">
            {players} jogadores nas PTs · {guild.signups.length} inscritos na convocação
          </p>
        </div>
        <button type="button" onClick={() => setOpen(!open)}>
          {open ? 'Fechar histórico' : 'Histórico de lutas'}
        </button>
      </div>

      <div className="form-grid">
        <label>
          Nome da luta
          <input
            value={title} maxLength={120} disabled={disabled}
            placeholder="Ex.: Território — quinta-feira"
            onChange={e => {
              setTitle(e.target.value);
              requestId.current = null;
            }}
          />
        </label>
        <label>
          Data da luta
          <input
            type="date" value={date} disabled={disabled}
            onChange={e => {
              setDate(e.target.value);
              requestId.current = null;
            }}
          />
        </label>
      </div>

      <div className="actions">
        <button type="button" className="primary" disabled={disabled} onClick={() => save(false)}>
          Salvar luta
        </button>
        <button type="button" disabled={disabled} onClick={() => save(true)}>
          Salvar luta e zerar convocação
        </button>
        <button
          type="button" className="danger"
          disabled={disabled || (!players && !guild.signups.length)}
          onClick={clear}
        >
          Zerar convocação
        </button>
      </div>

      <p className="muted">
        Salvar guarda uma cópia das PTs, sets e inscrições.
        Zerar mantém as funções e builds para a próxima luta.
      </p>

      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {open && (
        <>
          <div className="divider" />
          <h2>Histórico de lutas</h2>

          <form onSubmit={e => {
            e.preventDefault();

            if (filters.start && filters.end && filters.start > filters.end) {
              setError('A data inicial deve ser anterior ou igual à final.');
              return;
            }

            setPage(0);
            setApplied({ ...filters });
            setSelectedId('');
          }}>
            <div className="form-grid">
              <label>
                Nome da luta
                <input
                  value={filters.title} maxLength={120}
                  onChange={e => setFilters({ ...filters, title: e.target.value })}
                />
              </label>
              <label>
                Jogador
                <input
                  value={filters.player} maxLength={60}
                  placeholder="Nome nas PTs ou na convocação"
                  onChange={e => setFilters({ ...filters, player: e.target.value })}
                />
              </label>
              <label>
                De
                <input
                  type="date" value={filters.start}
                  onChange={e => setFilters({ ...filters, start: e.target.value })}
                />
              </label>
              <label>
                Até
                <input
                  type="date" value={filters.end}
                  onChange={e => setFilters({ ...filters, end: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" disabled={loading}>Filtrar</button>
          </form>

          {loading ? <p>Carregando histórico…</p> : (
            <>
              <p className="muted">{result.total} lutas encontradas</p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th><th>Luta</th><th>Nas PTs</th>
                      <th>Inscritos</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fights.map(fight => (
                      <tr key={fight.id}>
                        <td>{dateLabel(fight.fightDate)}</td>
                        <td>{fight.title}</td>
                        <td>{fight.players}</td>
                        <td>{fight.signups}</td>
                        <td>
                          <div className="actions">
                            <button type="button" onClick={() => setSelectedId(fight.id)}>
                              Detalhes
                            </button>
                            <button
                              type="button" className="danger small"
                              disabled={disabled}
                              onClick={() => removeFight(fight)}
                            >
                              Excluir luta
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!result.fights.length && (
                <p>Nenhuma luta encontrada com esses filtros.</p>
              )}

              <div className="actions">
                <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anterior
                </button>
                <span>Página {page + 1}</span>
                <button
                  type="button"
                  disabled={(page + 1) * 20 >= result.total}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </button>
              </div>
            </>
          )}

          {detailLoading && <p>Carregando composição salva…</p>}

          {selected && (
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="between">
                <h2>{selected.title} · {dateLabel(selected.fightDate)}</h2>
                <button type="button" onClick={() => setSelectedId('')}>
                  Fechar detalhes
                </button>
              </div>

              <p className="muted">
                Cópia salva em {new Date(selected.savedAt).toLocaleString('pt-BR')}.
                Esta consulta não altera a convocação atual.
              </p>
              <p>
                {[
                  selected.data.config.event,
                  selected.data.config.departure,
                  selected.data.config.time
                ].filter(Boolean).join(' · ')}
              </p>

              {Array.from(new Set(
                selected.data.builds.map(build => build.party)
              )).map(party => (
                <section key={party}>
                  <h3>{party}</h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Função</th><th>Build</th><th>Jogador</th>
                          <th>Confirmado</th><th>Set salvo</th><th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.data.builds
                          .filter(build => build.party === party)
                          .map(build => (
                            <tr key={build.id}>
                              <td>{build.role}</td>
                              <td>{build.name}</td>
                              <td>{build.player || 'Vaga vazia'}</td>
                              <td>{build.confirmed ? 'Sim' : 'Não'}</td>
                              <td>
                                <div className="gear-line">
                                  {build.gear.map((item, index) => (
                                    <span key={index} title={item.name}>
                                      {item.image ? (
                                        <img
                                          src={item.image}
                                          alt={item.name || 'Equipamento'}
                                          style={{
                                            width: 34, height: 34,
                                            objectFit: 'contain'
                                          }}
                                        />
                                      ) : item.name || '—'}
                                    </span>
                                  ))}
                                </div>
                                {build.instructions && <small>{build.instructions}</small>}
                              </td>
                              <td>
                                {build.player && (
                                  <button
                                    type="button" className="danger small"
                                    disabled={disabled || detailLoading}
                                    onClick={() => removeParticipant(build)}
                                  >
                                    Remover participação
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

              <h3>Inscritos na convocação salva</h3>
              <p className="muted">
                Inscrição não significa presença confirmada.
                A distribuição está nas PTs acima.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Jogador</th><th>Principal</th>
                      <th>Secundária</th><th>Fill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.data.signups.map(signup => (
                      <tr key={signup.id}>
                        <td>{signup.name}</td>
                        {[signup.main, signup.secondary, signup.fill].map((id, index) => (
                          <td key={index}>
                            {selected.data.builds.find(build => build.id === id)?.name || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
