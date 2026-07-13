export const fmtUSD = (n) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtTok = (n) =>
  n >= 1e9
    ? (n / 1e9).toFixed(2) + 'B'
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + 'M'
      : n >= 1e3
        ? (n / 1e3).toFixed(1) + 'K'
        : String(n);

export const sumTok = (t) => t.input + t.output + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead;

export const shortProject = (p) => p.split('/').filter(Boolean).slice(-2).join('/');

export const pct = (part, whole) => (whole ? ((part / whole) * 100).toFixed(1) + '%' : '—');
