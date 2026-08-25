import { fmtTok, pct } from '../format.js';

// How token volume splits by billing bucket, as one 100%-stacked share bar +
// legend. Buckets are identity, so they take fixed categorical slots; cache
// read holds the neutral gray because it is the cheap de-emphasized bulk,
// while cache write takes the warm slot — it is the premium-priced one.
const SEGMENTS = [
  { key: 'cacheRead', label: 'Cache read', bg: 'bg-cat-other' },
  { key: 'cacheWrite', label: 'Cache write', bg: 'bg-cat-3' },
  { key: 'input', label: 'Input', bg: 'bg-cat-1' },
  { key: 'output', label: 'Output', bg: 'bg-cat-2' },
];

export default function TokenMix({ tokenMix, totalTokens }) {
  if (!totalTokens) return null;

  const segs = SEGMENTS.map((s) => ({ ...s, tokens: tokenMix[s.key] })).filter((s) => s.tokens > 0);
  const fresh = totalTokens - tokenMix.cacheRead;

  return (
    <div className="mb-3.5 rounded-panel border border-line bg-surface px-5 py-[18px] shadow-panel">
      <div
        className="flex h-[18px] gap-0.5 overflow-hidden rounded-[5px] bg-surface-2"
        role="img"
        aria-label="Token volume share by billing bucket"
      >
        {segs.map((s) => (
          <div
            key={s.key}
            className={`min-w-[3px] transition-[flex-grow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${s.bg}`}
            style={{ flexGrow: s.tokens }}
            title={`${s.label} — ${fmtTok(s.tokens)} tokens · ${pct(s.tokens, totalTokens)}`}
          />
        ))}
      </div>
      <ul className="mt-3.5 grid list-none grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-5 gap-y-2 p-0">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[12.5px]">
            <span className={`h-2.5 w-2.5 flex-none rounded-[3px] ${s.bg}`} />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-ink">{s.label}</span>
            <span className="ml-auto whitespace-nowrap font-mono text-xs font-medium text-muted tabular-nums">
              {fmtTok(s.tokens)}
              <span className="ml-2 font-normal text-faint">{pct(s.tokens, totalTokens)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3.5 border-t border-rule pt-3 text-[12.5px] text-muted">
        Fresh tokens, not served from cache:{' '}
        <b className="font-mono font-semibold text-ink tabular-nums">{fmtTok(fresh)}</b>
        <span className="ml-2 font-mono text-faint tabular-nums">{pct(fresh, totalTokens)}</span>
      </div>
    </div>
  );
}
