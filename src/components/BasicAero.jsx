import { useMemo } from "react";
import Chart from "./Chart.jsx";
import { StatCard, Note, Formula } from "./ui.jsx";
import { aeroCurves, maxLD, liftSlope3D, inducedDragFactor } from "../physics/aero.js";

export default function BasicAero({ ac }) {
  const { data, alphaStallDeg } = useMemo(() => aeroCurves(ac), [ac]);
  const { ldMax, clOpt } = useMemo(() => maxLD(ac), [ac]);
  const aSlope = liftSlope3D(ac.a0_2d ?? 2 * Math.PI, ac.AR, ac.e);
  const k = inducedDragFactor(ac);

  // CL-alpha (clip at stall)
  const clSeries = data.filter((d) => !d.stalled);
  const ldStalled = data.filter((d) => !d.stalled);

  const clVsAlpha = [{ label: "CL", color: ac.color, points: clSeries.map((d) => ({ x: d.alpha, y: d.cl })) }];
  const cdVsAlpha = [{ label: "CD", color: "#ef4444", points: ldStalled.map((d) => ({ x: d.alpha, y: d.cd })) }];
  const ldVsAlpha = [{ label: "L/D", color: "#10b981", points: ldStalled.map((d) => ({ x: d.alpha, y: d.ld })) }];

  // drag polar (CD on x, CL on y)
  const polar = [{ label: "ドラッグポーラー", color: ac.color, points: ldStalled.map((d) => ({ x: d.cd, y: d.cl })) }];
  const cdOpt = ac.cd0 + k * clOpt * clOpt;

  return (
    <div className="module">
      <h2>基本空力特性 — 揚力・抗力・揚抗比</h2>
      <p className="lead">
        翼にはたらく力を無次元化した <b>揚力係数 C<sub>L</sub></b> と <b>抗力係数 C<sub>D</sub></b> を、
        迎角 α の関数として求めます。{ac.name} は有限翼なので、2次元翼の揚力傾斜をアスペクト比で補正しています。
      </p>

      <div className="stat-grid">
        <StatCard label="揚力傾斜 (3D)" value={(aSlope * Math.PI / 180).toFixed(4)} unit="/deg" sub={`a = ${aSlope.toFixed(3)} /rad`} accent={ac.color} />
        <StatCard label="最大揚抗比 (L/D)max" value={ldMax.toFixed(1)} sub={`CL = ${clOpt.toFixed(2)} のとき`} accent="#10b981" />
        <StatCard label="失速迎角 (推定)" value={alphaStallDeg.toFixed(1)} unit="°" sub={`CLmax = ${ac.clMax}`} accent="#ef4444" />
        <StatCard label="誘導抗力係数 k" value={k.toFixed(4)} sub={`1/(π·e·AR), e=${ac.e}`} />
      </div>

      <div className="chart-grid">
        <div className="chart-box">
          <h3>揚力曲線 C<sub>L</sub> – α</h3>
          <Chart
            series={clVsAlpha}
            xLabel="迎角 α [deg]"
            yLabel="揚力係数 CL"
            markers={[{ type: "vline", x: alphaStallDeg, color: "#ef4444", label: "失速" }]}
          />
          <Formula caption="有限翼の揚力係数（線形域）">
            CL = a·(α − α₀),  a = a₀ / (1 + a₀/(π·e·AR))
          </Formula>
        </div>

        <div className="chart-box">
          <h3>抗力曲線 C<sub>D</sub> – α</h3>
          <Chart series={cdVsAlpha} xLabel="迎角 α [deg]" yLabel="抗力係数 CD" />
          <Formula caption="ドラッグポーラー（寄生抗力＋誘導抗力）">
            CD = CD₀ + CL² / (π·e·AR)
          </Formula>
        </div>

        <div className="chart-box">
          <h3>揚抗比 L/D – α</h3>
          <Chart
            series={ldVsAlpha}
            xLabel="迎角 α [deg]"
            yLabel="揚抗比 L/D"
            markers={[{ type: "point", x: data.find((d) => Math.abs(d.ld - ldMax) < 0.5)?.alpha ?? 0, y: ldMax, color: "#10b981", label: `(L/D)max=${ldMax.toFixed(1)}` }]}
          />
          <Note>揚抗比が最大になる迎角で飛ぶと、最も効率よく（最小の推力で）水平飛行できます。</Note>
        </div>

        <div className="chart-box">
          <h3>ドラッグポーラー C<sub>L</sub> – C<sub>D</sub></h3>
          <Chart
            series={polar}
            xLabel="抗力係数 CD"
            yLabel="揚力係数 CL"
            markers={[{ type: "point", x: cdOpt, y: clOpt, color: "#10b981", label: "最大L/D点" }]}
          />
          <Note>原点から曲線へ引いた接線の接点が (L/D)max。傾きが揚抗比そのものを表します。</Note>
        </div>
      </div>
    </div>
  );
}
