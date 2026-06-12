/**
 * Telemetry simulator — stands in for a plant data gateway.
 *
 * Emits samples at 10 Hz per sensor over a tiny pub/sub. The transport is
 * abstracted behind `TelemetrySource`, so swapping this simulator for a
 * real WebSocket feed means implementing one interface — nothing in the
 * UI layer changes.
 */
import { RingBuffer } from "../data/ringBuffer";

export interface SensorDef {
  id: string;
  name: string;
  unit: string;
  base: number;      // nominal operating value
  noise: number;     // random jitter amplitude
  wave: number;      // slow sinusoidal drift amplitude
  period: number;    // drift period (ms)
  min: number;       // physical floor
  decimals: number;
}

export const SENSORS: SensorDef[] = [
  { id: "turbine_rpm",  name: "Turbine A — Speed",      unit: "rpm",  base: 3600, noise: 14,   wave: 40,  period: 47000, min: 0, decimals: 0 },
  { id: "inlet_temp",   name: "Inlet Temperature",      unit: "°C",   base: 412,  noise: 2.2,  wave: 9,   period: 61000, min: 0, decimals: 1 },
  { id: "line_pressure",name: "Line Pressure",          unit: "bar",  base: 18.4, noise: 0.25, wave: 0.8, period: 38000, min: 0, decimals: 2 },
  { id: "coolant_flow", name: "Coolant Flow",           unit: "m³/h", base: 126,  noise: 1.8,  wave: 6,   period: 53000, min: 0, decimals: 1 },
  { id: "vibration",    name: "Bearing Vibration",      unit: "mm/s", base: 2.1,  noise: 0.32, wave: 0.5, period: 29000, min: 0, decimals: 2 },
  { id: "power_out",    name: "Power Output",           unit: "MW",   base: 84.5, noise: 0.9,  wave: 3.2, period: 71000, min: 0, decimals: 1 },
];

export type SampleListener = (sensorId: string, t: number, v: number) => void;

export interface TelemetrySource {
  subscribe(fn: SampleListener): () => void;
  start(): void;
  stop(): void;
}

const TICK_MS = 100;            // 10 Hz
const HISTORY_SECONDS = 15 * 60; // 15 min of history per sensor
const CAPACITY = (HISTORY_SECONDS * 1000) / TICK_MS;

/** One shared buffer per sensor — module-level, deliberately not React state. */
export const buffers: Record<string, RingBuffer> = Object.fromEntries(
  SENSORS.map((s) => [s.id, new RingBuffer(CAPACITY)])
);

interface Anomaly {
  sensorId: string;
  until: number;
  offset: number;
  ramp: number;
}

class SimulatorSource implements TelemetrySource {
  private listeners = new Set<SampleListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private anomalies: Anomaly[] = [];
  private t0 = Date.now();

  subscribe(fn: SampleListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(): void {
    if (this.timer) return;
    // Pre-fill 90s of history so the dashboard opens with context.
    const now = Date.now();
    for (let ms = -90_000; ms < 0; ms += TICK_MS) this.tick(now + ms, false);
    this.timer = setInterval(() => this.tick(Date.now(), true), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Occasionally inject a drifting fault so alerts have something to catch. */
  private maybeSpawnAnomaly(now: number): void {
    if (Math.random() > 0.0012) return; // ~1 per ~80s across the fleet
    const s = SENSORS[Math.floor(Math.random() * SENSORS.length)];
    this.anomalies.push({
      sensorId: s.id,
      until: now + 8000 + Math.random() * 14000,
      offset: 0,
      ramp: (s.noise * 6) / 100, // climbs ~6 noise-widths over 10s
    });
  }

  private tick(now: number, live: boolean): void {
    if (live) this.maybeSpawnAnomaly(now);
    this.anomalies = this.anomalies.filter((a) => a.until > now);

    for (const s of SENSORS) {
      const phase = ((now - this.t0) % s.period) / s.period;
      let v =
        s.base +
        s.wave * Math.sin(phase * Math.PI * 2) +
        (Math.random() - 0.5) * 2 * s.noise;

      for (const a of this.anomalies) {
        if (a.sensorId === s.id) {
          a.offset += a.ramp;
          v += a.offset;
        }
      }

      v = Math.max(s.min, v);
      buffers[s.id].push(now, v);
      if (live) for (const fn of this.listeners) fn(s.id, now, v);
    }
  }
}

export const telemetry: TelemetrySource = new SimulatorSource();
