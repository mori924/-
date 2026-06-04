import { useState } from "react";
import { aircraftList, aircraftById } from "./data/aircraft.js";
import AircraftCard from "./components/AircraftCard.jsx";
import BasicAero from "./components/BasicAero.jsx";
import AirfoilModule from "./components/AirfoilModule.jsx";
import PerformanceModule from "./components/PerformanceModule.jsx";
import StabilityModule from "./components/StabilityModule.jsx";
import "./styles/app.css";

const TABS = [
  { id: "basic", label: "基本空力", icon: "📈", Comp: BasicAero },
  { id: "airfoil", label: "翼型・圧力分布", icon: "🌀", Comp: AirfoilModule },
  { id: "perf", label: "飛行性能", icon: "🚀", Comp: PerformanceModule },
  { id: "stab", label: "安定性・運動", icon: "⚖️", Comp: StabilityModule },
];

export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("basic");
  const ac = selectedId ? aircraftById[selectedId] : null;
  const ActiveComp = TABS.find((t) => t.id === tab).Comp;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">✈︎</span>
          <div>
            <h1>AeroLab — 航空力学ラボ</h1>
            <p>飛行機を選んで、翼まわりの解析と飛行特性を学ぶインタラクティブ教材</p>
          </div>
        </div>
        {ac && (
          <button className="change-ac" onClick={() => setSelectedId(null)}>
            ← 機体を選び直す
          </button>
        )}
      </header>

      {!ac ? (
        <main className="select-screen">
          <h2>機体を選択してください</h2>
          <p className="select-sub">それぞれ設計思想が異なります。比較しながら学ぶと理解が深まります。</p>
          <div className="ac-grid">
            {aircraftList.map((a) => (
              <AircraftCard key={a.id} ac={a} selected={false} onSelect={setSelectedId} />
            ))}
          </div>
        </main>
      ) : (
        <main className="analysis-screen">
          <section className="ac-banner" style={{ "--accent": ac.color }}>
            <div className="ac-banner-left">
              <span className="ac-banner-emoji">{ac.emoji}</span>
              <div>
                <h2>{ac.name}</h2>
                <span className="ac-banner-cat">{ac.category}</span>
                <p>{ac.blurb}</p>
              </div>
            </div>
            <div className="ac-banner-specs">
              <Spec k="質量" v={`${(ac.mass / 1000).toFixed(1)} t`} />
              <Spec k="主翼面積" v={`${ac.S} m²`} />
              <Spec k="翼幅" v={`${ac.span} m`} />
              <Spec k="アスペクト比" v={ac.AR} />
              <Spec k="翼型" v={ac.airfoil} />
              <Spec k="巡航速度" v={`${ac.cruiseSpeed} m/s`} />
            </div>
          </section>

          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                <span className="tab-icon">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <section className="tab-content">
            <ActiveComp key={ac.id} ac={ac} />
          </section>
        </main>
      )}

      <footer className="app-footer">
        AeroLab — 薄翼理論・パネル法・ISA 大気・Breguet 航続距離式・縦静安定理論に基づく教育用シミュレーション。
        パラメータは公開資料に基づく代表値で、設計値ではありません。
      </footer>
    </div>
  );
}

function Spec({ k, v }) {
  return (
    <div className="spec">
      <span className="spec-k">{k}</span>
      <span className="spec-v">{v}</span>
    </div>
  );
}
