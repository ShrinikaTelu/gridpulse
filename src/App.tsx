import { useEffect } from "react";
import { startTelemetryBridge } from "./store/stores";
import { Toolbar } from "./components/Toolbar";
import { DashboardGrid } from "./components/DashboardGrid";

export default function App() {
  useEffect(() => {
    startTelemetryBridge();
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          GRID<b>PULSE</b>
          <span className="brand-sub">Unit 3 — Combined Cycle · Simulated feed</span>
        </div>
        <a
          className="src-link"
          href="https://github.com/ShrinikaTelu/gridpulse"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source ↗
        </a>
      </header>
      <Toolbar />
      <main>
        <DashboardGrid />
      </main>
      <footer className="foot">
        Built with React 19 + Zustand + Canvas · 10 Hz telemetry, zero re-render streaming
      </footer>
    </div>
  );
}
