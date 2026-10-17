import { useEffect, useState } from 'react';

type Fight = {
  id: string;
  title: string;
  date: string;
  parties: string[];
};

type Entry = {
  name: string;
  position: number;
  count: number;
  fights: Fight[];
};

type Result = {
  totalFights: number;
  ranking: Entry[];
};

type Filters = {
  start: string;
  end: string;
};

function formatDate(value: string) {
  return value.split('-').reverse().join('/');
}

function initialPeriod(): Filters {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = String(
    new Date(year, now.getMonth() + 1, 0).getDate()
  ).padStart(2, '0');

  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${lastDay}`
  };
}

export default function AttendanceRanking({
  revision
}: {
  revision: number;
}) {
  const [filters, setFilters] = useState<Filters>(initialPeriod);
  const [applied, setApplied] = useState<Filters>(filters);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');
    setSelected(null);
    setResult(null);

    async function load() {
      try {
        const params = new URLSearchParams(applied);

        const response = await fetch(`/api/attendance?${params}`, {
          signal: controller.signal,
          cache: 'no-store'
        });

        const data = await response.json();

        if (!response.ok) {
          throw Error(
            data.error || 'Não foi possível carregar o ranking.'
          );
        }

        if (!controller.signal.aborted) {
          setResult(data);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : 'Falha ao carregar o ranking.'
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [applied, revision]);

  const entries = result?.ranking
    .map((entry, index) => ({
      ...entry,
      index
    }))
    .filter(entry =>
      entry.name
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR'))
    ) || [];

  const detail = selected === null
    ? null
    : result?.ranking[selected];

  return (
    <section
      className="panel"
      aria-labelledby="attendance-title"
      style={{
        maxWidth: 1200,
        margin: '20px auto',
        padding: 20
      }}
    >
      <div className="between">
        <div>
          <span className="eyebrow">PRESENÇAS NAS LUTAS</span>
          <h2 id="attendance-title">Ranking de convocados</h2>
        </div>

        <span className="muted">
          Disponível para todos os membros
        </span>
      </div>

      <p className="muted">
        Cada luta salva conta uma presença para quem estava em uma PT.
        Estar somente inscrito não conta. Exemplos são desconsiderados.
      </p>

      <form
        onSubmit={event => {
          event.preventDefault();

          if (
            filters.start &&
            filters.end &&
            filters.start > filters.end
          ) {
            setValidation(
              'A data inicial deve ser anterior ou igual à final.'
            );
            return;
          }

          setValidation('');
          setApplied({ ...filters });
        }}
      >
        <div className="form-grid">
          <label>
            Data inicial
            <input
              type="date"
              min="1900-01-01"
              max="9999-12-31"
              value={filters.start}
              onChange={e =>
                setFilters({
                  ...filters,
                  start: e.target.value
                })
              }
            />
          </label>

          <label>
            Data final
            <input
              type="date"
              min="1900-01-01"
              max="9999-12-31"
              value={filters.end}
              onChange={e =>
                setFilters({
                  ...filters,
                  end: e.target.value
                })
              }
            />
          </label>
        </div>

        <div className="actions">
          <button
            type="submit"
            className="primary"
            disabled={loading}
          >
            Filtrar ranking
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              const all = {
                start: '',
                end: ''
              };

              setFilters(all);
              setApplied(all);
              setValidation('');
              setSearch('');
            }}
          >
            Todo o histórico
          </button>
        </div>
      </form>

      {validation && (
        <p className="error" role="alert">
          {validation}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <p role="status">Carregando ranking…</p>
      )}

      {!loading && result && (
        <>
          <div className="divider" />

          <p className="muted">
            Período aplicado:{' '}
            {applied.start
              ? formatDate(applied.start)
              : 'início do histórico'}
            {' até '}
            {applied.end
              ? formatDate(applied.end)
              : 'última luta salva'}
            {' '}(incluindo os dois dias).
          </p>

          <p>
            <strong>{result.totalFights}</strong> lutas salvas
            {' · '}
            <strong>{result.ranking.length}</strong> jogadores convocados
          </p>

          <label>
            Buscar jogador
            <input
              type="search"
              placeholder="Nome do jogador"
              value={search}
              maxLength={60}
              onChange={e => setSearch(e.target.value)}
            />
          </label>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Posição</th>
                  <th>Jogador</th>
                  <th>Lutas</th>
                  <th>Detalhes</th>
                </tr>
              </thead>

              <tbody>
                {entries.map(entry => (
                  <tr key={entry.index}>
                    <td>{entry.position}º</td>
                    <td className="player-name">
                      {entry.name}
                    </td>
                    <td>{entry.count}</td>
                    <td>
                      <button
                        type="button"
                        className="small"
                        aria-expanded={selected === entry.index}
                        onClick={() =>
                          setSelected(
                            selected === entry.index
                              ? null
                              : entry.index
                          )
                        }
                      >
                        Ver lutas de {entry.name}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!entries.length && (
            <p className="empty">
              Nenhum jogador encontrado nesse período e nessa busca.
            </p>
          )}

          {detail && (
            <section
              className="roomy"
              aria-label={`Lutas de ${detail.name}`}
            >
              <div className="between">
                <h3>
                  {detail.name} · {detail.count} lutas
                </h3>

                <button
                  type="button"
                  className="small"
                  onClick={() => setSelected(null)}
                >
                  Fechar detalhes
                </button>
              </div>

              <div className="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Luta</th>
                      <th>PTs</th>
                    </tr>
                  </thead>

                  <tbody>
                    {detail.fights.map(fight => (
                      <tr key={fight.id}>
                        <td>{formatDate(fight.date)}</td>
                        <td>{fight.title}</td>
                        <td>{fight.parties.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="muted" style={{ marginTop: 16 }}>
            A contagem usa a data da luta. Ao zerar a convocação,
            as presenças das lutas salvas continuam no histórico.
            Para manter a contagem ao trocar o nome, a staff deve
            selecionar o jogador pela inscrição.
          </p>
        </>
      )}
    </section>
  );
}
