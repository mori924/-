// Small shared presentational components.
export function StatCard({ label, value, unit, sub, accent }) {
  return (
    <div className="stat-card" style={accent ? { borderTopColor: accent } : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, unit, format }) {
  const fmt = format || ((v) => v);
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <strong>
          {fmt(value)}
          {unit ? ` ${unit}` : ""}
        </strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Note({ children, type = "info" }) {
  return <div className={`note note-${type}`}>{children}</div>;
}

export function Formula({ children, caption }) {
  return (
    <div className="formula">
      <code>{children}</code>
      {caption && <span className="formula-caption">{caption}</span>}
    </div>
  );
}
