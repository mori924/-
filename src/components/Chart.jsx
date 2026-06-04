import { useMemo, useState } from "react";

// Lightweight dependency-free SVG line chart with multiple series, axes,
// gridlines, optional y-axis inversion (for Cp plots) and hover readout.
export default function Chart({
  series = [],
  xLabel = "",
  yLabel = "",
  height = 320,
  yReversed = false,
  xDomain,
  yDomain,
  markers = [],
  formatX = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)),
  formatY = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)),
}) {
  const [hover, setHover] = useState(null);
  const pad = { l: 58, r: 18, t: 16, b: 44 };
  const W = 640;
  const H = height;

  const allPts = series.flatMap((s) => s.points).filter(Boolean);
  const xs = allPts.map((p) => p.x);
  const ys = allPts.map((p) => p.y);

  const xMin = xDomain ? xDomain[0] : Math.min(...xs);
  const xMax = xDomain ? xDomain[1] : Math.max(...xs);
  let yMin = yDomain ? yDomain[0] : Math.min(...ys);
  let yMax = yDomain ? yDomain[1] : Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yPad = (yMax - yMin) * 0.06;
  if (!yDomain) {
    yMin -= yPad;
    yMax += yPad;
  }

  const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
  const syRaw = (y) => pad.t + ((y - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);
  const sy = (y) => (yReversed ? syRaw(y) : H - pad.b - (syRaw(y) - pad.t));

  const ticks = (min, max, n = 6) => {
    const step = niceStep((max - min) / n);
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let v = start; v <= max + 1e-9; v += step) out.push(+v.toFixed(8));
    return out;
  };

  const xticks = useMemo(() => ticks(xMin, xMax), [xMin, xMax]);
  const yticks = useMemo(() => ticks(yMin, yMax), [yMin, yMax]);

  const pathFor = (pts) =>
    pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
      .join(" ");

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const xVal = xMin + ((px - pad.l) / (W - pad.l - pad.r)) * (xMax - xMin);
    setHover(xVal);
  }

  const hoverReadout =
    hover != null
      ? series.map((s) => {
          if (!s.points.length) return null;
          let best = s.points[0];
          for (const p of s.points)
            if (Math.abs(p.x - hover) < Math.abs(best.x - hover)) best = p;
          return { label: s.label, color: s.color, p: best };
        })
      : null;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* grid */}
        {xticks.map((t) => (
          <line key={`gx${t}`} x1={sx(t)} y1={pad.t} x2={sx(t)} y2={H - pad.b} className="grid" />
        ))}
        {yticks.map((t) => (
          <line key={`gy${t}`} x1={pad.l} y1={sy(t)} x2={W - pad.r} y2={sy(t)} className="grid" />
        ))}
        {/* zero lines */}
        {yMin < 0 && yMax > 0 && (
          <line x1={pad.l} y1={sy(0)} x2={W - pad.r} y2={sy(0)} className="axis-zero" />
        )}
        {xMin < 0 && xMax > 0 && (
          <line x1={sx(0)} y1={pad.t} x2={sx(0)} y2={H - pad.b} className="axis-zero" />
        )}
        {/* axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} className="axis" />
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} className="axis" />
        {/* tick labels */}
        {xticks.map((t) => (
          <text key={`tx${t}`} x={sx(t)} y={H - pad.b + 18} className="tick" textAnchor="middle">
            {formatX(t)}
          </text>
        ))}
        {yticks.map((t) => (
          <text key={`ty${t}`} x={pad.l - 8} y={sy(t) + 4} className="tick" textAnchor="end">
            {formatY(t)}
          </text>
        ))}
        {/* axis labels */}
        <text x={(pad.l + W - pad.r) / 2} y={H - 6} className="axis-label" textAnchor="middle">
          {xLabel}
        </text>
        <text
          x={-(pad.t + H - pad.b) / 2}
          y={16}
          className="axis-label"
          textAnchor="middle"
          transform="rotate(-90)"
        >
          {yLabel}
        </text>
        {/* shaded regions */}
        {markers
          .filter((m) => m.type === "band")
          .map((m, i) => (
            <rect
              key={`band${i}`}
              x={sx(m.from)}
              y={pad.t}
              width={Math.max(0, sx(m.to) - sx(m.from))}
              height={H - pad.t - pad.b}
              fill={m.color || "rgba(239,68,68,0.08)"}
            />
          ))}
        {/* series */}
        {series.map((s, i) => (
          <path
            key={i}
            d={pathFor(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width || 2.2}
            strokeDasharray={s.dashed ? "6 5" : undefined}
          />
        ))}
        {/* point markers */}
        {markers
          .filter((m) => m.type === "point")
          .map((m, i) => (
            <g key={`pt${i}`}>
              <circle cx={sx(m.x)} cy={sy(m.y)} r={4.5} fill={m.color || "#111"} />
              {m.label && (
                <text x={sx(m.x) + 8} y={sy(m.y) - 6} className="marker-label">
                  {m.label}
                </text>
              )}
            </g>
          ))}
        {/* vertical line markers */}
        {markers
          .filter((m) => m.type === "vline")
          .map((m, i) => (
            <g key={`vl${i}`}>
              <line x1={sx(m.x)} y1={pad.t} x2={sx(m.x)} y2={H - pad.b} stroke={m.color || "#888"} strokeDasharray="4 4" strokeWidth="1.5" />
              {m.label && (
                <text x={sx(m.x) + 4} y={pad.t + 12} className="marker-label">{m.label}</text>
              )}
            </g>
          ))}
        {/* hover */}
        {hover != null && hoverReadout && (
          <line x1={sx(hover)} y1={pad.t} x2={sx(hover)} y2={H - pad.b} className="hover-line" />
        )}
      </svg>
      <div className="chart-legend">
        {series.map((s, i) => (
          <span key={i} className="legend-item">
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.label}
            {hoverReadout && hoverReadout[i] && (
              <em>
                {" "}
                ({formatX(hoverReadout[i].p.x)}, {formatY(hoverReadout[i].p.y)})
              </em>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function niceStep(raw) {
  if (raw <= 0 || !isFinite(raw)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}
