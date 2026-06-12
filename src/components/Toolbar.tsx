/**
 * Toolbar: live/replay scrubber, window selector, add-widget controls,
 * and the "Ask GridPulse" query bar.
 */
import { useEffect, useState } from "react";
import {
  usePlaybackStore,
  useDashboardStore,
  useAlertStore,
  type WidgetKind,
} from "../store/stores";
import { SENSORS, buffers } from "../simulator/engine";
import { answerQuery } from "../ai/queryEngine";

export function Toolbar() {
  const { mode, cursor, windowSec, goLive, scrubTo, setWindow } = usePlaybackStore();
  const addWidget = useDashboardStore((st) => st.addWidget);
  const [kind, setKind] = useState<WidgetKind>("chart");
  const [sensorId, setSensorId] = useState(SENSORS[0].id);

  // The scrubber needs a slowly-advancing "now" while live.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const oldest = buffers[SENSORS[0].id]?.oldestTime() ?? now - 60_000;
  const pos = mode === "live" ? now : cursor;

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <button
          className={`btn-live ${mode === "live" ? "on" : ""}`}
          onClick={goLive}
        >
          ● {mode === "live" ? "LIVE" : "GO LIVE"}
        </button>
        <input
          className="scrubber"
          type="range"
          min={oldest}
          max={now}
          value={pos}
          onChange={(e) => scrubTo(Number(e.target.value))}
          aria-label="Replay scrubber"
        />
        <span className="scrub-time">
          {mode === "replay"
            ? new Date(cursor).toLocaleTimeString([], { hour12: false })
            : "now"}
        </span>
        <select
          className="sensor-select"
          value={windowSec}
          onChange={(e) => setWindow(Number(e.target.value))}
          aria-label="Chart window"
        >
          <option value={30}>30s window</option>
          <option value={60}>1m window</option>
          <option value={300}>5m window</option>
          <option value={900}>15m window</option>
        </select>
      </div>

      <div className="toolbar-row">
        <select className="sensor-select" value={kind} onChange={(e) => setKind(e.target.value as WidgetKind)} aria-label="Widget type">
          <option value="chart">Trend chart</option>
          <option value="gauge">Gauge</option>
          <option value="stat">Readout</option>
          <option value="alerts">Alert feed</option>
        </select>
        <select className="sensor-select" value={sensorId} onChange={(e) => setSensorId(e.target.value)} aria-label="Sensor for new widget">
          {SENSORS.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button className="btn-add" onClick={() => addWidget(kind, sensorId)}>
          + Add widget
        </button>
        <ThresholdEditor />
      </div>

      <QueryBar />
    </div>
  );
}

function ThresholdEditor() {
  const setRule = useAlertStore((st) => st.setRule);
  const [sensorId, setSensorId] = useState("vibration");
  const [op, setOp] = useState<">" | "<">(">");
  const [value, setValue] = useState("4.2");

  return (
    <span className="threshold-editor">
      <span className="te-label">Alert when</span>
      <select className="sensor-select" value={sensorId} onChange={(e) => setSensorId(e.target.value)} aria-label="Alert sensor">
        {SENSORS.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select className="sensor-select narrow" value={op} onChange={(e) => setOp(e.target.value as ">" | "<")} aria-label="Comparison">
        <option value=">">&gt;</option>
        <option value="<">&lt;</option>
      </select>
      <input
        className="te-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        aria-label="Threshold value"
      />
      <button
        className="btn-add"
        onClick={() => {
          const v = parseFloat(value);
          if (!Number.isNaN(v)) setRule({ sensorId, op, threshold: v });
        }}
      >
        Arm
      </button>
    </span>
  );
}

function QueryBar() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const run = () => {
    if (!q.trim()) return;
    setAnswer(answerQuery(q));
  };

  return (
    <div className="querybar">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && run()}
        placeholder='Ask the data — e.g. "max vibration last 5 min" or "average power output"'
        aria-label="Query the telemetry data"
      />
      <button className="btn-add" onClick={run}>Ask</button>
      {answer && <div className="query-answer">{answer}</div>}
    </div>
  );
}
