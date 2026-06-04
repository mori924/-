// Draws an airfoil cross-section (upper/lower surfaces + camber line) to scale,
// optionally rotated to a given angle of attack with a freestream arrow.
export default function AirfoilShape({ geom, alphaDeg = 0, showCamber = true, height = 200, cp }) {
  const W = 640;
  const H = height;
  const pad = 40;

  // rotate by -alpha so positive AoA tilts nose up relative to horizontal flow
  const a = (-alphaDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rot = (x, y) => ({ x: x * ca - y * sa, y: x * sa + y * ca });

  const upPts = geom.upper.x.map((x, i) => rot(x, geom.upper.y[i]));
  const loPts = geom.lower.x.map((x, i) => rot(x, geom.lower.y[i]));
  const camPts = geom.camberLine.x.map((x, i) => rot(x, geom.camberLine.y[i]));

  const all = [...upPts, ...loPts];
  const xmin = Math.min(...all.map((p) => p.x));
  const xmax = Math.max(...all.map((p) => p.x));
  const ymin = Math.min(...all.map((p) => p.y));
  const ymax = Math.max(...all.map((p) => p.y));
  const spanX = xmax - xmin;
  const spanY = ymax - ymin;
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / (spanY || 1));
  const ox = (W - spanX * scale) / 2 - xmin * scale;
  const oy = H / 2 + ((ymax + ymin) / 2) * scale;
  const px = (p) => ox + p.x * scale;
  const py = (p) => oy - p.y * scale;

  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(" ");
  const fillPath = toPath(upPts) + " " + loPts.slice().reverse().map((p) => `L${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(" ") + " Z";

  // colour the surface by Cp if provided (suction = blue, pressure = red)
  let cpSegments = null;
  if (cp && cp.xc) {
    const cmin = Math.min(...cp.cp);
    const cmax = Math.max(...cp.cp);
    cpSegments = cp.xc.map((xcv, i) => {
      const t = (cp.cp[i] - cmin) / (cmax - cmin || 1); // 0 (low Cp/suction) -> 1 (high Cp)
      const r = Math.round(60 + t * 195);
      const b = Math.round(255 - t * 195);
      const pt = rot(xcv, cp.yc[i]);
      return { x: px(pt), y: py(pt), color: `rgb(${r},80,${b})` };
    });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="airfoil-svg" preserveAspectRatio="xMidYMid meet">
      {/* freestream arrow */}
      <g className="flow-arrow">
        <line x1={6} y1={H / 2} x2={pad - 6} y2={H / 2} />
        <polygon points={`${pad - 6},${H / 2} ${pad - 14},${H / 2 - 5} ${pad - 14},${H / 2 + 5}`} />
        <text x={8} y={H / 2 - 8} className="flow-label">V∞</text>
      </g>
      {/* chord reference (horizontal) */}
      <line x1={px(rot(0, 0))} y1={py(rot(0, 0))} x2={px(rot(1, 0))} y2={py(rot(1, 0))} className="chord-line" />
      <path d={fillPath} className="airfoil-fill" />
      <path d={toPath(upPts)} className="airfoil-edge" />
      <path d={toPath(loPts)} className="airfoil-edge" />
      {showCamber && <path d={toPath(camPts)} className="camber-line" />}
      {cpSegments &&
        cpSegments.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={2.4} fill={s.color} opacity="0.9" />)}
    </svg>
  );
}
