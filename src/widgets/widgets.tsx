/**
 * Widget bodies. These render from throttled store state (2 Hz), never
 * from raw 10 Hz samples — that's the chart's job via canvas.
 */
import { SENSORS, buffers } from "../simulator/engine";
import {
  useReadingsStore,
  useAlertStore,
  usePlaybackStore,
} from "../store/stores";
import { TelemetryChart } from "../components/TelemetryChart";

const fmt = (sensorId: string, v: number | undefined): string => {
  if (v === undefined) return "—";
  const s = SENSORS.find((x) => x.id === sensorId);
  return v.toFixed(s?.decimals ?? 1);
};

/* ---------------- Chart widget ---------------- */

export function ChartWidget({ sensorId, size }: { sensorId: string; size: string }) {
  const v = useReadingsStore((st) => st.latest[sensorId]);
  const sensor = SENSORS.find((s) => s.id === sensorId);
  return (
    <div className="widget-body">
      <div className="reading-row">
        <span className="reading">{fmt(sensorId, v)}</span>
        <span className="unit">{sensor?.unit}</span>
      </div>
      <TelemetryChart sensorId={sensorId} height={size === "l" ? 200 : 140} />
    </div>
  );
}

/* ---------------- Gauge widget ---------------- */

export function GaugeWidget({ sensorId }: { sensorId: string }) {
  const v = useReadingsStore((st) => st.latest[sensorId]);
  const sensor = SENSORS.find((s) => s.id === sensorId)!;
  const lo = sensor.base - sensor.wave - sensor.noise * 4;
  const hi = sensor.base + sensor.wave + sensor.noise * 8;
  const frac = v === undefined ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const angle = -120 + frac * 240;
  const rule = useAlertStore((st) => st.rules.find((r) => r.sensorId === sensorId));
  const inAlarm =
    rule && v !== undefined && (rule.op === ">" ? v > rule.threshold : v < rule.threshold);

  return (
    <div className="widget-body gauge">
      <svg viewBox="0 0 120 78" className="gauge-svg" role="img" aria-label={`${sensor.name} gauge`}>
        <path d="M 14 70 A 50 50 0 1 1 106 70" fill="none" stroke="#22304A" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M 14 70 A 50 50 0 1 1 106 70"
          fill="none"
          stroke={inAlarm ? "#FF6B6B" : "#7FD1E8"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${frac * 220} 400`}
        />
        <line
          x1="60" y1="66" x2="60" y2="28"
          stroke="#FFB454" strokeWidth="2.5" strokeLinecap="round"
          transform={`rotate(${angle} 60 66)`}
        />
        <circle cx="60" cy="66" r="4" fill="#FFB454" />
      </svg>
      <div className="reading-row center">
        <span className={`reading ${inAlarm ? "alarm" : ""}`}>{fmt(sensorId, v)}</span>
        <span className="unit">{sensor.unit}</span>
      </div>
    </div>
  );
}

/* ---------------- Stat widget ---------------- */

export function StatWidget({ sensorId }: { sensorId: string }) {
  const v = useReadingsStore((st) => st.latest[sensorId]);
  const sensor = SENSORS.find((s) => s.id === sensorId)!;
  const now = Date.now();
  const ext = buffers[sensorId]?.extent(now - 5 * 60_000, now);

  return (
    <div className="widget-body stat">
      <div className="reading-row center big">
        <span className="reading">{fmt(sensorId, v)}</span>
        <span className="unit">{sensor.unit}</span>
      </div>
      {ext && ext.n > 0 && (
        <div className="stat-extent">
          <span>5m lo {ext.min.toFixed(sensor.decimals)}</span>
          <span>avg {ext.avg.toFixed(sensor.decimals)}</span>
          <span>hi {ext.max.toFixed(sensor.decimals)}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Alert feed widget ---------------- */

export function AlertsWidget() {
  const events = useAlertStore((st) => st.events);
  const ackAll = useAlertStore((st) => st.ackAll);
  const scrubTo = usePlaybackStore((st) => st.scrubTo);
  const unacked = events.filter((e) => !e.ack).length;

  return (
    <div className="widget-body alerts">
      <div className="alerts-head">
        <span>{unacked > 0 ? `${unacked} unacknowledged` : "All clear"}</span>
        {unacked > 0 && (
          <button className="btn-mini" onClick={ackAll}>
            Acknowledge all
          </button>
        )}
      </div>
      <ul className="alert-list">
        {events.length === 0 && <li className="alert-empty">No alerts yet — thresholds are armed.</li>}
        {events.slice(0, 30).map((e) => {
          const s = SENSORS.find((x) => x.id === e.sensorId);
          return (
            <li key={e.id} className={e.ack ? "acked" : ""}>
              <button
                className="alert-row"
                onClick={() => scrubTo(e.t + 5000)}
                title="Jump to this moment in replay"
              >
                <span className="alert-time">
                  {new Date(e.t).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="alert-name">{s?.name ?? e.sensorId}</span>
                <span className="alert-val">
                  {e.value.toFixed(s?.decimals ?? 1)} {e.rule.op} {e.rule.threshold}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
