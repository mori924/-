import { useMemo, useState } from "react";
import Chart from "./Chart.jsx";
import AirfoilShape from "./AirfoilShape.jsx";
import { StatCard, Slider, Note, Formula } from "./ui.jsx";
import { generateNaca4 } from "../physics/airfoil.js";
import { solveAirfoil } from "../physics/panelMethod.js";

export default function AirfoilModule({ ac }) {
  const [alpha, setAlpha] = useState(4);
  // component is remounted per aircraft (key=ac.id), so init from props is safe
  const [code, setCode] = useState(ac.airfoil);

  const geom = useMemo(() => generateNaca4(code, 90), [code]);
  const sol = useMemo(() => solveAirfoil(geom, alpha), [geom, alpha]);

  // split Cp into upper / lower surfaces for plotting against x/c
  const half = Math.floor(sol.xc.length / 2);
  const lowerCp = sol.xc.slice(0, half).map((x, i) => ({ x, y: sol.cp[i] }));
  const upperCp = sol.xc.slice(half).map((x, i) => ({ x, y: sol.cp[half + i] }));

  const cpSeries = [
    { label: "上面 (負圧/吸い込み)", color: "#2563eb", points: upperCp.slice().sort((a, b) => a.x - b.x) },
    { label: "下面 (正圧)", color: "#ef4444", points: lowerCp.slice().sort((a, b) => a.x - b.x) },
  ];

  const { m, p, t } = geom.params;
  const cpMin = Math.min(...sol.cp);

  return (
    <div className="module">
      <h2>翼型と圧力分布 — パネル法による解析</h2>
      <p className="lead">
        翼型まわりの流れを <b>Hess–Smith パネル法</b>（定強度ソース＋渦パネル、Kutta 条件付き）で解き、
        表面の <b>圧力係数 C<sub>p</sub></b> 分布と揚力係数を計算します。迎角を変えると分布がどう変わるかを確かめましょう。
      </p>

      <div className="airfoil-controls">
        <div className="naca-input">
          <label>NACA 4桁翼型</label>
          <input
            value={code}
            maxLength={4}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
              if (v.length === 4) setCode(v);
              else setCode(v);
            }}
          />
          <div className="naca-presets">
            {["0012", "2412", "4412", "0006", "2415", "4415"].map((c) => (
              <button key={c} className={code === c ? "active" : ""} onClick={() => setCode(c)}>
                {c}
              </button>
            ))}
          </div>
          <small>{ac.airfoilName}</small>
        </div>
        <Slider label="迎角 α" value={alpha} min={-8} max={16} step={0.5} unit="°" onChange={setAlpha} />
      </div>

      <div className="airfoil-view">
        <AirfoilShape geom={geom} alphaDeg={alpha} cp={sol} height={210} />
        <div className="cp-color-legend">
          <span><i style={{ background: "rgb(60,80,255)" }} /> 低 C<sub>p</sub>（吸い込み・流速大）</span>
          <span><i style={{ background: "rgb(255,80,60)" }} /> 高 C<sub>p</sub>（よどみ点付近）</span>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="揚力係数 (2D, パネル法)" value={sol.cl.toFixed(3)} accent={ac.color} />
        <StatCard label="最大厚比 t/c" value={(t * 100).toFixed(0)} unit="%" />
        <StatCard label="最大キャンバー" value={(m * 100).toFixed(1)} unit="%" sub={`位置 ${(p * 100).toFixed(0)}% c`} />
        <StatCard label="最小 Cp (上面ピーク)" value={cpMin.toFixed(2)} sub="負ほど低圧＝強い吸い込み" accent="#2563eb" />
      </div>

      <div className="chart-box">
        <h3>圧力係数分布 C<sub>p</sub> – x/c</h3>
        <Chart
          series={cpSeries}
          xLabel="翼弦位置 x/c"
          yLabel="圧力係数 Cp"
          yReversed
          xDomain={[0, 1]}
          formatY={(v) => v.toFixed(1)}
        />
        <Note>
          慣例に従い <b>縦軸は反転</b>（上が負圧）。上面と下面の C<sub>p</sub> 差で囲まれる面積が揚力に対応します。
          翼前縁付近の鋭い吸い込みピークが、迎角増加とともに強まる様子に注目してください。
        </Note>
        <Formula caption="圧力係数の定義（非圧縮）">
          Cp = (p − p∞) / (½ρV∞²) = 1 − (V/V∞)²
        </Formula>
      </div>

      <Note type="warn">
        パネル法は非粘性・非圧縮の理論解です。実際の失速（剥離）や圧縮性（衝撃波）は含みません。
        高迎角や高マッハ数では実機と乖離します。
      </Note>
    </div>
  );
}
