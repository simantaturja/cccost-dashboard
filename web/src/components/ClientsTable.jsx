import { fmtUSD, fmtTok, pct } from '../format.js';

export default function ClientsTable({ rows, monthly, totalCost }) {
  const months = monthly.map((m) => m.month).slice(-3);
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th className="num">Sessions</th>
            <th className="num">Tokens</th>
            {months.map((m) => (
              <th className="num" key={m}>
                {m}
              </th>
            ))}
            <th className="num">Cost</th>
            <th className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.client}>
              <td>{c.client}</td>
              <td className="num">{c.sessionCount}</td>
              <td className="num">{fmtTok(c.tokens)}</td>
              {months.map((m) => (
                <td className="num" key={m}>
                  {c.months[m] ? fmtUSD(c.months[m]) : '—'}
                </td>
              ))}
              <td className="num">{fmtUSD(c.costUSD)}</td>
              <td className="num share-cell">{pct(c.costUSD, totalCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
