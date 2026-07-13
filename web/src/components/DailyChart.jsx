import { useRef, useState } from 'react';
import { fmtUSD, fmtTok } from '../format.js';

const W = 1080;
const H = 220;
const PAD = { t: 12, r: 6, b: 30, l: 52 };
const GAP = 2; // surface gap between adjacent bars
const RADIUS = 4; // rounded data-end

// Path with rounded top corners, square at the baseline.
function barPath(x, y, w, h) {
  const r = Math.min(RADIUS, w / 2, h);
  if (h <= 0) return '';
  return (
    `M${x},${y + h}` +
    `L${x},${y + r}` +
    `Q${x},${y} ${x + r},${y}` +
    `L${x + w - r},${y}` +
    `Q${x + w},${y} ${x + w},${y + r}` +
    `L${x + w},${y + h}Z`
  );
}

export default function DailyChart({ daily }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);

  const days = daily.slice(-90);
  if (!days.length) {
    return <div className="empty">No daily spend recorded yet.</div>;
  }

  const max = Math.max(...days.map((d) => d.costUSD), 0.01);
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const band = plotW / days.length;
  const barW = Math.max(band - GAP, 1);

  const gridlines = [0, 1, 2, 3].map((i) => {
    const v = (max * i) / 3;
    const y = H - PAD.b - (plotH * i) / 3;
    return { v, y };
  });

  function onEnter(e, d, i) {
    const svg = e.currentTarget.ownerSVGElement;
    const wrap = wrapRef.current;
    if (!svg || !wrap) return;
    const scale = svg.getBoundingClientRect().width / W;
    const wrapBox = wrap.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const barH = (plotH * d.costUSD) / max;
    const cx = PAD.l + i * band + barW / 2;
    const topY = H - PAD.b - barH;
    setHover({
      i,
      d,
      x: svgBox.left - wrapBox.left + cx * scale,
      y: svgBox.top - wrapBox.top + topY * scale - 8,
    });
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily spend, last 90 days">
        {gridlines.map(({ v, y }, i) => (
          <g key={i}>
            <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} />
            <text x={PAD.l - 8} y={y + 3} textAnchor="end">
              ${v.toFixed(v < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const barH = (plotH * d.costUSD) / max;
          const x = PAD.l + i * band + (band - barW) / 2;
          const y = H - PAD.b - barH;
          return (
            <g key={d.date}>
              <path
                className={'bar' + (hover && hover.i === i ? ' is-hover' : '')}
                d={barPath(x, y, barW, barH)}
              />
              {i % 7 === 0 && (
                <text x={PAD.l + i * band} y={H - 10}>
                  {d.date.slice(5)}
                </text>
              )}
              <rect
                x={PAD.l + i * band}
                y={PAD.t}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={(e) => onEnter(e, d, i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: hover.x, top: hover.y }}>
          <div className="t-date">{hover.d.date}</div>
          <div>
            {fmtUSD(hover.d.costUSD)} · {fmtTok(hover.d.tokens)} tok
          </div>
        </div>
      )}
    </div>
  );
}
