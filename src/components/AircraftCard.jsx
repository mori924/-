// Planform silhouette + summary card used in the selection grid.
export default function AircraftCard({ ac, selected, onSelect }) {
  return (
    <button className={`ac-card ${selected ? "selected" : ""}`} onClick={() => onSelect(ac.id)} style={{ "--accent": ac.color }}>
      <div className="ac-card-top">
        <span className="ac-emoji">{ac.emoji}</span>
        <Planform ac={ac} />
      </div>
      <div className="ac-card-name">{ac.name}</div>
      <div className="ac-card-cat">{ac.category}</div>
      <div className="ac-card-specs">
        <span>AR {ac.AR}</span>
        <span>S {ac.S} m²</span>
        <span>{(ac.mass / 1000).toFixed(1)} t</span>
      </div>
    </button>
  );
}

// Rough top-view planform, scaled by aspect ratio so the silhouette visually
// reflects wing slenderness (glider = long thin, fighter = short stubby).
function Planform({ ac }) {
  const W = 120;
  const H = 54;
  const cx = W / 2;
  // half-span and root chord scaled from AR (visual only)
  const halfSpan = Math.min(W / 2 - 6, 14 + ac.AR * 2.8);
  const rootChord = Math.max(8, 30 - ac.AR * 1.1);
  const tipChord = rootChord * 0.4;
  const sweep = ac.id === "f16" ? 14 : ac.id === "b738" || ac.id === "a320" ? 9 : 3;
  const yTop = 12;
  const fuseLen = 46;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="planform">
      {/* fuselage */}
      <ellipse cx={cx} cy={yTop + fuseLen / 2} rx={4} ry={fuseLen / 2} fill={ac.color} opacity="0.85" />
      {/* wings */}
      <polygon
        points={`${cx},${yTop + 6} ${cx + halfSpan},${yTop + 6 + sweep} ${cx + halfSpan},${yTop + 6 + sweep + tipChord} ${cx},${yTop + 6 + rootChord}`}
        fill={ac.color}
        opacity="0.7"
      />
      <polygon
        points={`${cx},${yTop + 6} ${cx - halfSpan},${yTop + 6 + sweep} ${cx - halfSpan},${yTop + 6 + sweep + tipChord} ${cx},${yTop + 6 + rootChord}`}
        fill={ac.color}
        opacity="0.7"
      />
      {/* tail */}
      <polygon
        points={`${cx},${yTop + fuseLen - 8} ${cx + halfSpan * 0.4},${yTop + fuseLen} ${cx + halfSpan * 0.4},${yTop + fuseLen + 4} ${cx},${yTop + fuseLen - 2}`}
        fill={ac.color}
        opacity="0.7"
      />
      <polygon
        points={`${cx},${yTop + fuseLen - 8} ${cx - halfSpan * 0.4},${yTop + fuseLen} ${cx - halfSpan * 0.4},${yTop + fuseLen + 4} ${cx},${yTop + fuseLen - 2}`}
        fill={ac.color}
        opacity="0.7"
      />
    </svg>
  );
}
