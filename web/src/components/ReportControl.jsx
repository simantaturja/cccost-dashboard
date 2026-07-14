import { useState } from 'react';
import { api } from '../api.js';

export default function ReportControl({ monthly }) {
  const months = monthly.map((m) => m.month).reverse();
  const [month, setMonth] = useState(months[0] || '');

  if (!months.length) return null;

  const href = api.reportHref(month);

  return (
    <p className="report">
      Monthly report:
      <select value={month} onChange={(e) => setMonth(e.target.value)}>
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      {href ? (
        <a href={href}>Download</a>
      ) : (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            api.report(month);
          }}
        >
          Download
        </a>
      )}
    </p>
  );
}
