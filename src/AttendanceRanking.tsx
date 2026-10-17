import { useEffect, useRef, useState } from 'react';

type Weapon = {
  name: string;
  image: string;
  party: string;
};

type Fight = {
  id: string;
  title: string;
  date: string;
  parties: string[];
  weapons: Weapon[];
};

type Entry = {
  key: string;
  name: string;
  position: number;
  count: number;
  fights: Fight[];
};

type Result = {
  totalFights: number;
  ranking: Entry[];
};

type Props = {
  revision: number;
  admin: boolean;
  busy: boolean;
  act: (command: Record<string, unknown>) => Promise<boolean>;
};

const dateLabel = (date: string) =>
  date.split('-').reverse().join('/');

function initialPeriod() {
  const now = new Date();
  const prefix =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return {
    start: `${prefix}-01`,
    end: `${prefix}-${new Date(
      now.getFullYear(), now.getMonth() + 1, 0
    ).getDate()}`
  };
}

export default function AttendanceRanking({
  revision, admin, busy, act
}: Props) {
  const [filters, setFilters] = useState(initialPeriod);
  const [applied, setApplied] = useState(filters);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const disabled = busy || pending;

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');
    setResult(null);

    async function load() {
      try {
        const response = await fetch(
          `/api/attendance?${new URLSearchParams(applied)}`,
          { signal: controller.signal, cache: 'no-store' }
        );

        const data = await response.json();

        if (!response.ok) {
          throw Error(data.error || 'Não foi possível carregar o ranking.');
        }

        if (!controller.signal.aborted) setResult(data);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [applied, revision]);

  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
    }
    if (!selected && dialog.current?.open) {
      dialog.current.close();
    }
  }, [selected]);

  const entries = result?.ranking.filter(entry =>
    entry.name.toLocaleLowerCase('pt-BR')
      .includes(search.trim().toLocaleLowerCase('pt-BR'))
  ) || [];

  const detail = result?.ranking.find(entry => entry.key === selected);

  const period =
    `${applied.start ? dateLabel(applied.start) : 'Início'} até ` +
    `${applied.end ? dateLabel(applied.end) : 'última luta salva'}`;

  async function remove(fight: Fight) {
    if (!admin || disabled || lock.current || !detail) return;

    if (!window.confirm(
      `Remover a participação de ${detail.name} em "${fight.title}" ` +
      `(${dateLabel(fight.date)})? Ela sairá do ranking e das PTs desta luta ` +
      'salva. A convocação atual não será alterada.'
    )) return;

    lock.current = true;
    setPending(true);
    setActionError('');
    setNotice('');

    try {
      if (await act({
        type: 'fight-participant-remove',
        fightId: fight.id,
        playerKey: detail.key
      })) {
        setNotice('Participação removida.');
      } else {
        setActionError(
          'Não foi possível remover. Feche os detalhes para conferir ' +
          'o aviso do sistema e tente novamente.'
        );
      }
    } catch {
      setActionError('Não foi possível remover a participação. Tente novamente.');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <aside className="panel ranking-panel" aria-labelledby="ranking-title">
      <div className="between">
        <h2 id="ranking-title">Ranking</h2>
        <span className="muted">Presenças</span>
      </div>

      <form onSubmit={e => {
        e.preventDefault();

        if (filters.start && filters.end && filters.start > filters.end) {
          setValidation('A data inicial deve ser anterior ou igual à final.');
          return;
        }

        setValidation('');
        setApplied({ ...filters });
        setSelected('');
      }}>
        <div className="ranking-dates">
          <label>
            De
            <input
              type="date" min="1900-01-01" max="9999-12-31"
              value={filters.start}
              onChange={e => setFilters({ ...filters, start: e.target.value })}
            />
          </label>
          <label>
            Até
            <input
              type="date" min="1900-01-01" max="9999-12-31"
              value={filters.end}
              onChange={e => setFilters({ ...filters, end: e.target.value })}
            />
          </label>
        </div>

        <div className="actions">
          <button type="submit" className="primary small" disabled={loading}>
            Filtrar
          </button>
          <button
            type="button" className="small quiet" disabled={loading}
            onClick={() => {
              const all = { start: '', end: '' };
              setFilters(all);
              setApplied(all);
              setValidation('');
              setSearch('');
              setSelected('');
            }}
          >
            Todos
          </button>
        </div>
      </form>

      <p className="muted ranking-period">{period}</p>

      <label className="ranking-search">
        Jogador
        <input
          type="search" placeholder="Buscar nome"
          maxLength={60} value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </label>

      {validation && <p className="error" role="alert">{validation}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {loading ? (
        <p role="status" className="muted">Carregando…</p>
      ) : result && (
        <>
          <div className="table-shell ranking-table">
            <table>
              <thead>
                <tr>
                  <th>Pos.</th><th>Jogador</th><th>Lutas</th><th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.key}>
                    <td>{entry.position}º</td>
                    <td className="player-name">{entry.name}</td>
                    <td>{entry.count}</td>
                    <td>
                      <button
                        type="button" className="small"
                        aria-label={`Detalhes de ${entry.name}`}
                        onClick={() => {
                          setActionError('');
                          setNotice('');
                          setSelected(entry.key);
                        }}
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!entries.length && (
            <p className="empty">Nenhuma presença encontrada.</p>
          )}
        </>
      )}

      <dialog
        ref={dialog}
        className="modal ranking-dialog"
        aria-labelledby="player-history-title"
        onClose={() => setSelected('')}
        onCancel={e => {
          if (disabled) e.preventDefault();
        }}
      >
        <div className="between">
          <div>
            <span className="eyebrow">HISTÓRICO DE ARMAS</span>
            <h2 id="player-history-title">
              {detail?.name || 'Participações'}
            </h2>
          </div>
          <button
            type="button" autoFocus disabled={disabled}
            onClick={() => setSelected('')}
          >
            Fechar
          </button>
        </div>

        <p className="muted">{period}</p>

        {notice && <p role="status" className="success">{notice}</p>}
        {actionError && <p role="alert" className="error">{actionError}</p>}
        {error && <p role="alert" className="error">{error}</p>}

        {loading ? (
          <p role="status">Atualizando histórico…</p>
        ) : detail ? (
          <>
            <p>
              {detail.count}{' '}
              {detail.count === 1 ? 'luta neste período' : 'lutas neste período'}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data</th><th>Luta</th><th>Arma / PT</th>
                    {admin && <th>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {detail.fights.map(fight => (
                    <tr key={fight.id}>
                      <td>{dateLabel(fight.date)}</td>
                      <td>{fight.title}</td>
                      <td>
                        {(fight.weapons || []).map((weapon, index) => (
                          <div className="ranking-weapon" key={index}>
                            {weapon.image && <img src={weapon.image} alt="" />}
                            <span>
                              {weapon.name}
                              <small className="muted">{weapon.party}</small>
                            </span>
                          </div>
                        ))}
                        {!fight.weapons?.length && 'Arma não informada'}
                      </td>
                      {admin && (
                        <td>
                          <button
                            type="button" className="danger small"
                            disabled={disabled}
                            onClick={() => remove(fight)}
                          >
                            Remover participação
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : !error && (
          <p>Não há mais participações deste jogador no período.</p>
        )}
      </dialog>
    </aside>
  );
}
