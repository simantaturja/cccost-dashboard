import { useState } from 'react';

export default function ReportControl({ monthly }) {
  const months = monthly.map((m) => m.month).reverse();
  const [month, setMonth] = useState(months[0] || '');

  if (!months.length) return null;

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
      <a href={`/api/report?month=${month}`}>Download</a>
    </p>
  );
}
