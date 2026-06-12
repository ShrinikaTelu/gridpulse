/**
 * "Ask GridPulse" — natural-language queries over the telemetry buffers.
 *
 * Two-layer design:
 *   1. `parseQuery` turns text into a structured `DataQuery`.
 *   2. `executeQuery` runs it against the ring buffers.
 *
 * The local parser handles the common shapes (max/min/avg/current +
 * sensor + time window) with zero network calls, so the deployed demo
 * needs no API key. `parseQuery` is the LLM seam: swap it for a model
 * call that returns the same `DataQuery` JSON (schema below) and
 * everything downstream is unchanged.
 */
import { SENSORS, buffers } from "../simulator/engine";

export interface DataQuery {
  op: "max" | "min" | "avg" | "current";
  sensorId: string;
  windowMs: number;
}

/* ---------- layer 1: parse ---------- */

const OPS: Array<[RegExp, DataQuery["op"]]> = [
  [/\b(max|maximum|highest|peak)\b/i, "max"],
  [/\b(min|minimum|lowest)\b/i, "min"],
  [/\b(avg|average|mean)\b/i, "avg"],
  [/\b(current|now|latest|right now)\b/i, "current"],
];

const SENSOR_HINTS: Record<string, string[]> = {
  turbine_rpm: ["rpm", "speed", "turbine"],
  inlet_temp: ["temp", "temperature", "inlet"],
  line_pressure: ["pressure", "bar"],
  coolant_flow: ["flow", "coolant"],
  vibration: ["vibration", "vibe", "bearing"],
  power_out: ["power", "output", "mw"],
};

export function parseQuery(text: string): DataQuery | null {
  const op = OPS.find(([re]) => re.test(text))?.[1] ?? "current";

  let sensorId: string | null = null;
  for (const [id, hints] of Object.entries(SENSOR_HINTS)) {
    if (hints.some((h) => text.toLowerCase().includes(h))) {
      sensorId = id;
      break;
    }
  }
  if (!sensorId) return null;

  let windowMs = 60_000;
  const m = text.match(/last\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    windowMs = /^s/i.test(m[2]) ? n * 1000 : n * 60_000;
  }

  return { op, sensorId, windowMs };
}

/* ---------- layer 2: execute ---------- */

export function executeQuery(q: DataQuery): string {
  const sensor = SENSORS.find((s) => s.id === q.sensorId)!;
  const buf = buffers[q.sensorId];
  const now = Date.now();

  if (q.op === "current") {
    const s = buf.latest();
    return s
      ? `${sensor.name} is currently ${s.v.toFixed(sensor.decimals)} ${sensor.unit}.`
      : `No data yet for ${sensor.name}.`;
  }

  const ext = buf.extent(now - q.windowMs, now);
  if (ext.n === 0) return `No samples for ${sensor.name} in that window.`;

  const mins = Math.round(q.windowMs / 60_000);
  const win = q.windowMs >= 60_000 ? `${mins} min` : `${q.windowMs / 1000}s`;
  const val =
    q.op === "max" ? ext.max : q.op === "min" ? ext.min : ext.avg;
  const label = q.op === "max" ? "Peak" : q.op === "min" ? "Lowest" : "Average";

  return `${label} ${sensor.name} over the last ${win}: ${val.toFixed(
    sensor.decimals
  )} ${sensor.unit} (${ext.n} samples).`;
}

export function answerQuery(text: string): string {
  const q = parseQuery(text);
  if (!q) {
    return 'I couldn\'t match a sensor. Try naming one — e.g. "peak vibration last 10 min" or "current power output".';
  }
  return executeQuery(q);
}
