import { useMemo, useState } from "react";
import Chart from "./Chart.jsx";
import { StatCard, Slider, Note, Formula } from "./ui.jsx";
import { isa } from "../physics/atmosphere.js";
import {
  performanceCurves,
  stallSpeed,
  maxSpeed,
  bestClimb,
  breguetRange,
  turnPerformance,
} from "../physics/performance.js";

export default function PerformanceModule({ ac }) {
  const [altKm, setAltKm] = useState(Math.min(ac.cruiseAlt / 1000, 8));
  const [loadFactor, setLoadFactor] = useState(2);
  const altitude = altKm * 1000;

  const isGlider = ac.propulsion === "glider";
  const usePower = ac.propulsion === "prop" || isGlider;

  const { data, vs } = useMemo(() => performanceCurves(ac, altitude), [ac, altitude]);
  const vmax = useMemo(() => maxSpeed(ac, altitude), [ac, altitude]);
  const bc = useMemo(() => bestClimb(ac, altitude), [ac, altitude]);
  const range = useMemo(() => (isGlider ? null : breguetRange(ac)), [ac, isGlider]);
  const turn = turnPerformance(ac, ac.cruiseSpeed, loadFactor);
  const atm = isa(altitude);
  const mach = vmax / atm.soundSpeed;

  // build thrust or power required/available chart
  let series, yLabel, reqKey, availKey;
  if (usePower) {
    yLabel = "パワー [kW]";
    reqKey = "powerReq";
    availKey = "powerAvail";
  } else {
    yLabel = "推力 [kN]";
    reqKey = "thrustReq";
    availKey = "thrustAvail";
  }
  series = [
    { label: usePower ? "必要パワー" : "必要推力", color: "#ef4444", points: data.map((d) => ({ x: d.v, y: d[reqKey] })) },
  ];
  if (!isGlider)
    series.push({
      label: usePower ? "利用可能パワー" : "利用可能推力",
      color: "#10b981",
      points: data.map((d) => ({ x: d.v, y: d[availKey] })),
    });

  const rocSeries = [{ label: "上昇率 R/C", color: ac.color, points: data.map((d) => ({ x: d.v, y: d.roc })) }];

  return (
    <div className="module">
      <h2>飛行性能 — 速度・上昇・航続</h2>
      <p className="lead">
        国際標準大気 (ISA) のもとで、{ac.name} の <b>失速速度・最大速度・上昇率・航続距離・旋回性能</b> を計算します。
        高度を変えると空気密度が下がり、性能がどう変化するか観察できます。
      </p>

      <div className="airfoil-controls">
        <Slider label="高度" value={altKm} min={0} max={isGlider ? 6 : (ac.serviceCeiling || 13000) / 1000} step={0.5} unit="km" onChange={setAltKm} format={(v) => v.toFixed(1)} />
        <div className="atm-readout">
          <span>気温 {(atm.temperature - 273.15).toFixed(1)}℃</span>
          <span>密度 {atm.density.toFixed(3)} kg/m³</span>
          <span>音速 {atm.soundSpeed.toFixed(0)} m/s</span>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="失速速度 Vs" value={vs.toFixed(1)} unit="m/s" sub={`${(vs * 1.944).toFixed(0)} kt @ ${altKm}km`} accent="#ef4444" />
        {!isGlider && <StatCard label="最大速度 Vmax" value={vmax.toFixed(0)} unit="m/s" sub={`Mach ${mach.toFixed(2)}`} accent="#10b981" />}
        {!isGlider && <StatCard label="最良上昇率" value={bc.roc.toFixed(1)} unit="m/s" sub={`速度 ${bc.v.toFixed(0)} m/s`} accent={ac.color} />}
        {isGlider && <StatCard label="最良滑空比" value={ac.cruiseLD} unit=":1" sub={`沈下 ${(ac.cruiseSpeed / ac.cruiseLD).toFixed(2)} m/s`} accent="#10b981" />}
        {range && <StatCard label="航続距離 (Breguet)" value={(range.range / 1000).toFixed(0)} unit="km" sub={`滞空 ${(range.endurance / 3600).toFixed(1)} h`} />}
      </div>

      <div className="chart-grid">
        <div className="chart-box">
          <h3>{usePower ? "パワー曲線" : "推力曲線"}（必要 vs 利用可能）</h3>
          <Chart
            series={series}
            xLabel="速度 V [m/s]"
            yLabel={yLabel}
            markers={[{ type: "vline", x: vs, color: "#ef4444", label: "失速速度" }]}
          />
          <Note>
            {isGlider
              ? "推進力がないため、必要パワーが最小となる速度付近が最も沈下の小さい飛行になります。"
              : "2本の曲線の右側の交点が最大速度。曲線間の差（余剰パワー/推力）が大きいほど上昇性能が高くなります。"}
          </Note>
          {usePower ? (
            <Formula caption="必要パワー">P_req = D·V = (½ρV²S·CD)·V</Formula>
          ) : (
            <Formula caption="必要推力 = 抗力">T_req = D = ½ρV²S·CD</Formula>
          )}
        </div>

        {!isGlider && (
          <div className="chart-box">
            <h3>上昇率 R/C – 速度</h3>
            <Chart series={rocSeries} xLabel="速度 V [m/s]" yLabel="上昇率 [m/s]" markers={[{ type: "point", x: bc.v, y: bc.roc, color: ac.color, label: "最良上昇" }]} />
            <Formula caption="上昇率">R/C = (P_avail − P_req) / W</Formula>
          </div>
        )}

        <div className="chart-box">
          <h3>旋回性能（定常水平旋回）</h3>
          <div className="turn-panel">
            <Slider label="荷重倍数 n" value={loadFactor} min={1} max={ac.id === "f16" ? 9 : 4} step={0.5} unit="G" onChange={setLoadFactor} />
            <div className="stat-grid">
              <StatCard label="旋回半径" value={turn.radius.toFixed(0)} unit="m" />
              <StatCard label="旋回率" value={turn.rateDeg.toFixed(1)} unit="°/s" />
              <StatCard label="バンク角" value={(Math.acos(1 / loadFactor) * 180 / Math.PI).toFixed(0)} unit="°" />
              <StatCard label="旋回失速速度" value={(stallSpeed(ac, altitude, loadFactor)).toFixed(0)} unit="m/s" sub={`Vs·√n`} accent="#ef4444" />
            </div>
          </div>
          <Formula caption="旋回（速度は巡航速度で計算）">
            R = V² / (g·√(n²−1)),  ω = g·√(n²−1) / V
          </Formula>
        </div>
      </div>

      <Note type="warn">
        圧縮性（造波抗力）は未モデル化のため、高マッハ数域では最大速度を過大評価します。実機の最大運用マッハ数とは異なります。
      </Note>
    </div>
  );
}
