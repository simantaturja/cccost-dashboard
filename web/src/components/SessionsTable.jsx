import { Fragment, useMemo, useState } from 'react';
import { fmtUSD, fmtTok, sumTok, shortProject } from '../format.js';

function SessionDetail({ s }) {
  const models = Object.entries(s.models).sort((a, b) => b[1].costUSD - a[1].costUSD);
  return (
    <div className="detail-inner">
      <div className="detail-head">
        <b>{s.project}</b> · session {s.sessionId}
      </div>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th className="num">Msgs</th>
            <th className="num">Input</th>
            <th className="num">Output</th>
            <th className="num">Cache write</th>
            <th className="num">Cache read</th>
            <th className="num">Cost</th>
          </tr>
        </thead>
        <tbody>
          {models.map(([model, m]) => (
            <tr key={model}>
              <td className="mono">{model}</td>
              <td className="num">{m.messages}</td>
              <td className="num">{fmtTok(m.tokens.input)}</td>
              <td className="num">{fmtTok(m.tokens.output)}</td>
              <td className="num">{fmtTok(m.tokens.cacheWrite5m + m.tokens.cacheWrite1h)}</td>
              <td className="num">{fmtTok(m.tokens.cacheRead)}</td>
              <td className="num">{fmtUSD(m.costUSD)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SessionsTable({ sessions }) {
  const [sort, setSort] = useState({ key: 'cost', dir: -1 });
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const [va, vb] =
        sort.key === 'date'
          ? [a.lastTimestamp || '', b.lastTimestamp || '']
          : [a.costUSD, b.costUSD];
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [sessions, sort]);

  function toggleSort(key) {
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));
    setOpen(null);
  }

  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Session</th>
            <th className="num th-sortable" onClick={() => toggleSort('date')}>
              Last active <span className="arrow">⇅</span>
            </th>
            <th className="num">Msgs</th>
            <th className="num">Tokens</th>
            <th className="num th-sortable" onClick={() => toggleSort('cost')}>
              Cost <span className="arrow">⇅</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const id = s.sessionId + (s.lastTimestamp || '');
            const isOpen = open === id;
            return (
              <Fragment key={id}>
                <tr
                  className={'row' + (isOpen ? ' is-open' : '')}
                  onClick={() => setOpen(isOpen ? null : id)}
                >
                  <td title={s.project}>{shortProject(s.project)}</td>
                  <td className="mono">{s.sessionId.slice(0, 8)}</td>
                  <td className="num">{(s.lastTimestamp || '').slice(0, 10)}</td>
                  <td className="num">{s.messages}</td>
                  <td className="num">{fmtTok(sumTok(s.tokens))}</td>
                  <td className="num">{fmtUSD(s.costUSD)}</td>
                </tr>
                {isOpen && (
                  <tr className="detail">
                    <td colSpan={6}>
                      <SessionDetail s={s} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
