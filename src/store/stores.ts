/**
 * Zustand stores — the only state React renders from.
 *
 * Design rule: nothing here updates at 10 Hz. Latest sensor readings are
 * throttled to 2 Hz before touching the store; raw samples live in the
 * ring buffers and are read directly by canvas charts.
 */
import { create } from "zustand";
import { SENSORS, buffers, telemetry } from "../simulator/engine";

/* ---------------- dashboard layout ---------------- */

export type WidgetKind = "chart" | "gauge" | "stat" | "alerts";
export type WidgetSize = "s" | "m" | "l";

export interface WidgetConfig {
  id: string;
  kind: WidgetKind;
  sensorId: string; // ignored by "alerts"
  size: WidgetSize;
}

let nextId = 1;
const wid = () => `w${nextId++}`;

interface DashboardState {
  widgets: WidgetConfig[];
  addWidget: (kind: WidgetKind, sensorId: string) => void;
  removeWidget: (id: string) => void;
  cycleSize: (id: string) => void;
  setSensor: (id: string, sensorId: string) => void;
  move: (fromIdx: number, toIdx: number) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  widgets: [
    { id: wid(), kind: "chart", sensorId: "turbine_rpm",   size: "l" },
    { id: wid(), kind: "gauge", sensorId: "inlet_temp",    size: "s" },
    { id: wid(), kind: "stat",  sensorId: "power_out",     size: "s" },
    { id: wid(), kind: "chart", sensorId: "vibration",     size: "m" },
    { id: wid(), kind: "chart", sensorId: "line_pressure", size: "m" },
    { id: wid(), kind: "alerts", sensorId: "",             size: "m" },
  ],
  addWidget: (kind, sensorId) =>
    set((st) => ({ widgets: [...st.widgets, { id: wid(), kind, sensorId, size: "m" }] })),
  removeWidget: (id) =>
    set((st) => ({ widgets: st.widgets.filter((w) => w.id !== id) })),
  cycleSize: (id) =>
    set((st) => ({
      widgets: st.widgets.map((w) =>
        w.id === id
          ? { ...w, size: (w.size === "s" ? "m" : w.size === "m" ? "l" : "s") as WidgetSize }
          : w
      ),
    })),
  setSensor: (id, sensorId) =>
    set((st) => ({ widgets: st.widgets.map((w) => (w.id === id ? { ...w, sensorId } : w)) })),
  move: (fromIdx, toIdx) =>
    set((st) => {
      const ws = [...st.widgets];
      const [moved] = ws.splice(fromIdx, 1);
      ws.splice(toIdx, 0, moved);
      return { widgets: ws };
    }),
}));

/* ---------------- latest readings (throttled) ---------------- */

interface ReadingsState {
  /** sensorId -> latest value, refreshed at 2 Hz */
  latest: Record<string, number>;
}

export const useReadingsStore = create<ReadingsState>(() => ({ latest: {} }));

/* ---------------- alert rules + events ---------------- */

export interface AlertRule {
  sensorId: string;
  op: ">" | "<";
  threshold: number;
}

export interface AlertEvent {
  id: number;
  t: number;
  sensorId: string;
  value: number;
  rule: AlertRule;
  ack: boolean;
}

interface AlertState {
  rules: AlertRule[];
  events: AlertEvent[];
  setRule: (rule: AlertRule) => void;
  removeRule: (sensorId: string) => void;
  fire: (e: Omit<AlertEvent, "id" | "ack">) => void;
  ackAll: () => void;
}

let nextAlertId = 1;

export const useAlertStore = create<AlertState>((set) => ({
  rules: [
    { sensorId: "vibration",  op: ">", threshold: 4.2 },
    { sensorId: "inlet_temp", op: ">", threshold: 440 },
  ],
  events: [],
  setRule: (rule) =>
    set((st) => ({
      rules: [...st.rules.filter((r) => r.sensorId !== rule.sensorId), rule],
    })),
  removeRule: (sensorId) =>
    set((st) => ({ rules: st.rules.filter((r) => r.sensorId !== sensorId) })),
  fire: (e) =>
    set((st) => ({
      events: [{ ...e, id: nextAlertId++, ack: false }, ...st.events].slice(0, 200),
    })),
  ackAll: () =>
    set((st) => ({ events: st.events.map((e) => ({ ...e, ack: true })) })),
}));

/* ---------------- playback (live vs replay) ---------------- */

interface PlaybackState {
  mode: "live" | "replay";
  /** In replay: the "now" the charts render, in epoch ms. */
  cursor: number;
  windowSec: number; // visible chart window
  goLive: () => void;
  scrubTo: (t: number) => void;
  setWindow: (sec: number) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  mode: "live",
  cursor: 0,
  windowSec: 60,
  goLive: () => set({ mode: "live" }),
  scrubTo: (t) => set({ mode: "replay", cursor: t }),
  setWindow: (sec) => set({ windowSec: sec }),
}));

/* ---------------- wiring: telemetry -> stores ---------------- */

const ALERT_COOLDOWN_MS = 5000;
const lastFired: Record<string, number> = {};

let started = false;
export function startTelemetryBridge(): void {
  if (started) return;
  started = true;

  telemetry.start();

  // Alert evaluation on every sample (cheap comparisons, no React work
  // unless a rule actually trips).
  telemetry.subscribe((sensorId, t, v) => {
    const { rules, fire } = useAlertStore.getState();
    for (const rule of rules) {
      if (rule.sensorId !== sensorId) continue;
      const hit = rule.op === ">" ? v > rule.threshold : v < rule.threshold;
      if (hit && t - (lastFired[sensorId] ?? 0) > ALERT_COOLDOWN_MS) {
        lastFired[sensorId] = t;
        fire({ t, sensorId, value: v, rule });
      }
    }
  });

  // Throttled readings: 2 Hz is plenty for numeric displays.
  setInterval(() => {
    const latest: Record<string, number> = {};
    for (const s of SENSORS) {
      const sample = buffers[s.id].latest();
      if (sample) latest[s.id] = sample.v;
    }
    useReadingsStore.setState({ latest });
  }, 500);
}
