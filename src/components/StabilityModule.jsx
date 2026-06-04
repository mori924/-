import { useMemo, useState } from "react";
import Chart from "./Chart.jsx";
import { StatCard, Note, Formula, Slider } from "./ui.jsx";
import { cmCurve, takeoffRoll } from "../physics/stability.js";

export default function StabilityModule({ ac }) {
  const cm = useMemo(() => cmCurve(ac), [ac]);
  const [xcg, setXcg] = useState(ac.stability.xcg);

  // recompute static margin live as the CG is moved
  const sm = cm ? cm.xnp - xcg : 0;
  const cmSlopeLive = -sm;
  const cmLive = [];
  if (cm) {
    for (let cl = -0.4; cl <= ac.clMax; cl += 0.05) {
      cmLive.push({ x: +cl.toFixed(3), y: +(cm.cm0 + cmSlopeLive * cl).toFixed(4) });
    }
  }
  const stable = sm > 0;

  const takeoff = useMemo(() => (ac.propulsion === "glider" ? null : takeoffRoll(ac)), [ac]);

  return (
    <div className="module">
      <h2>安定性と運動 — 縦の静安定・離陸加速</h2>
      <p className="lead">
        重心 (CG) と <b>中立点 (Neutral Point)</b> の位置関係で、機体が乱れたあと自ら姿勢を戻すか（静安定）が決まります。
        CG を動かして、ピッチングモーメント曲線 C<sub>m</sub>–C<sub>L</sub> の傾きがどう変わるか確かめましょう。
      </p>

      {cm && (
        <>
          <div className="stat-grid">
            <StatCard label="中立点 x_np" value={cm.xnp.toFixed(3)} unit="c" sub="主翼+水平尾翼の推定" accent={ac.color} />
            <StatCard label="重心 x_cg" value={xcg.toFixed(3)} unit="c" />
            <StatCard label="静安定余裕 SM" value={(sm * 100).toFixed(1)} unit="% MAC" sub={stable ? "正：静安定" : "負：静不安定"} accent={stable ? "#10b981" : "#ef4444"} />
            <StatCard label="dCm/dCL" value={cmSlopeLive.toFixed(3)} sub={stable ? "負＝安定" : "正＝不安定"} />
          </div>

          <div className="cg-slider">
            <Slider label="重心位置 x_cg (翼弦比)" value={xcg} min={0.15} max={0.55} step={0.01} unit="c" onChange={setXcg} format={(v) => v.toFixed(2)} />
            <div className={`stability-flag ${stable ? "ok" : "bad"}`}>
              {stable ? "✅ 静安定：迎角が乱れると元に戻す復元モーメントが働く" : "⚠️ 静不安定：CG が中立点より後方。発散する（要・操縦増幅／FBW）"}
            </div>
          </div>

          <div className="chart-grid">
            <div className="chart-box">
              <h3>ピッチングモーメント C<sub>m</sub> – C<sub>L</sub></h3>
              <Chart
                series={[{ label: `Cm (SM=${(sm * 100).toFixed(0)}%)`, color: stable ? "#10b981" : "#ef4444", points: cmLive }]}
                xLabel="揚力係数 CL"
                yLabel="ピッチングモーメント係数 Cm"
              />
              <Note>
                安定な機体は曲線が<b>右下がり（dCm/dCL &lt; 0）</b>。迎角（CL）が増えると頭下げモーメントが生じ、元の釣り合いに戻ります。
                Cm=0 の点がトリム（釣り合い）状態です。
              </Note>
              <Formula caption="中立点と静安定余裕">
                x_np = x_ac + η·(a_t/a_w)·V_H·(1−dε/dα),  SM = x_np − x_cg
              </Formula>
            </div>

            <div className="chart-box">
              <h3>重心・中立点の位置関係</h3>
              <CgDiagram xcg={xcg} xnp={cm.xnp} xac={cm.xacWing} stable={stable} />
              <Note>
                {ac.id === "f16"
                  ? "F-16 は意図的に CG を後方に置いた『緩和静安定 (RSS)』設計。フライ・バイ・ワイヤで安定を作り、高い運動性を得ています。"
                  : "CG が中立点より前にあるほど安定余裕が大きく、操縦は穏やかになりますが舵の利きは鈍くなります。"}
              </Note>
            </div>
          </div>
        </>
      )}

      {takeoff && (
        <div className="chart-box">
          <h3>離陸滑走シミュレーション（運動方程式の数値積分）</h3>
          <div className="stat-grid">
            <StatCard label="離陸滑走距離" value={takeoff.distance.toFixed(0)} unit="m" accent={ac.color} />
            <StatCard label="離陸までの時間" value={takeoff.time.toFixed(1)} unit="s" />
            <StatCard label="浮揚速度 V_LOF" value={takeoff.vLof.toFixed(1)} unit="m/s" sub="1.2 × Vs" />
            <StatCard label="平均加速度" value={(takeoff.vLof / takeoff.time).toFixed(2)} unit="m/s²" sub={`${(takeoff.vLof / takeoff.time / 9.81).toFixed(2)} G`} />
          </div>
          <Chart
            series={[
              { label: "速度 [m/s]", color: ac.color, points: takeoff.series.map((s) => ({ x: s.x, y: s.v })) },
            ]}
            xLabel="滑走距離 x [m]"
            yLabel="速度 V [m/s]"
            markers={[{ type: "point", x: takeoff.distance, y: takeoff.vLof, color: "#10b981", label: "離陸" }]}
          />
          <Formula caption="地上滑走の運動方程式">
            m·(dV/dt) = T − D − μ(W − L)
          </Formula>
        </div>
      )}
    </div>
  );
}

// Simple plan-view diagram of chord with AC / CG / NP positions.
function CgDiagram({ xcg, xnp, xac, stable }) {
  const W = 640;
  const H = 150;
  const x0 = 60;
  const x1 = W - 60;
  const px = (frac) => x0 + frac * (x1 - x0);
  const y = 70;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cg-diagram" preserveAspectRatio="xMidYMid meet">
      {/* wing chord schematic */}
      <polygon points={`${x0},${y} ${x1},${y - 10} ${x1},${y + 10} ${x0},${y + 6}`} fill="rgba(120,120,140,0.18)" stroke="#888" />
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="#bbb" strokeDasharray="3 3" />
      <text x={x0} y={y + 34} className="tick">前縁 LE</text>
      <text x={x1} y={y + 34} className="tick" textAnchor="end">後縁 TE</text>

      <Marker x={px(xac)} y={y} label={`AC ${xac.toFixed(2)}`} color="#888" dy={-30} />
      <Marker x={px(xnp)} y={y} label={`NP ${xnp.toFixed(2)}`} color="#2563eb" dy={-50} />
      <Marker x={px(xcg)} y={y} label={`CG ${xcg.toFixed(2)}`} color={stable ? "#10b981" : "#ef4444"} dy={-12} big />

      {/* static margin bracket */}
      <line x1={px(xcg)} y1={y + 24} x2={px(xnp)} y2={y + 24} stroke={stable ? "#10b981" : "#ef4444"} strokeWidth="2" />
      <text x={px((xcg + xnp) / 2)} y={y + 38} className="tick" textAnchor="middle" fill={stable ? "#10b981" : "#ef4444"}>
        SM = {((xnp - xcg) * 100).toFixed(0)}%
      </text>
    </svg>
  );
}

function Marker({ x, y, label, color, dy = -20, big }) {
  return (
    <g>
      <line x1={x} y1={y - 12} x2={x} y2={y + 12} stroke={color} strokeWidth={big ? 3 : 2} />
      <circle cx={x} cy={y} r={big ? 6 : 4} fill={color} />
      <text x={x} y={y + dy} className="marker-label" textAnchor="middle" fill={color}>
        {label}
      </text>
    </g>
  );
}
