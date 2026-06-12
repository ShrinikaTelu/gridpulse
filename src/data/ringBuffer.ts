/**
 * RingBuffer — fixed-capacity circular buffer for telemetry samples.
 *
 * This is the heart of GridPulse's performance story: samples arrive at
 * 10 Hz per sensor and are written here, OUTSIDE React state. Charts read
 * from the buffer directly inside requestAnimationFrame, so React never
 * re-renders on data arrival. React state only carries low-frequency
 * derived values (latest readings throttled to 2 Hz, alert events).
 */
export interface Sample {
  t: number; // epoch ms
  v: number;
}

export class RingBuffer {
  private buf: Float64Array; // interleaved [t0, v0, t1, v1, ...]
  private capacity: number;
  private head = 0; // next write index (in samples)
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Float64Array(capacity * 2);
  }

  push(t: number, v: number): void {
    const i = (this.head % this.capacity) * 2;
    this.buf[i] = t;
    this.buf[i + 1] = v;
    this.head++;
    if (this.count < this.capacity) this.count++;
  }

  get size(): number {
    return this.count;
  }

  /** Most recent sample, or null if empty. */
  latest(): Sample | null {
    if (this.count === 0) return null;
    const i = ((this.head - 1 + this.capacity) % this.capacity) * 2;
    return { t: this.buf[i], v: this.buf[i + 1] };
  }

  /**
   * Copy samples in [tFrom, tTo] into `out` (callers reuse arrays to avoid
   * GC pressure in the render loop). Returns number of samples written.
   */
  window(tFrom: number, tTo: number, out: Sample[]): number {
    let n = 0;
    const start = this.head - this.count;
    for (let s = start; s < this.head; s++) {
      const i = ((s % this.capacity) + this.capacity) % this.capacity * 2;
      const t = this.buf[i];
      if (t < tFrom || t > tTo) continue;
      if (n < out.length) {
        out[n].t = t;
        out[n].v = this.buf[i + 1];
      } else {
        out.push({ t, v: this.buf[i + 1] });
      }
      n++;
    }
    return n;
  }

  /** Min/max value over a time window — used for auto-scaling and stats. */
  extent(tFrom: number, tTo: number): { min: number; max: number; avg: number; n: number } {
    let min = Infinity, max = -Infinity, sum = 0, n = 0;
    const start = this.head - this.count;
    for (let s = start; s < this.head; s++) {
      const i = ((s % this.capacity) + this.capacity) % this.capacity * 2;
      const t = this.buf[i];
      if (t < tFrom || t > tTo) continue;
      const v = this.buf[i + 1];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      n++;
    }
    return { min, max, avg: n ? sum / n : 0, n };
  }

  oldestTime(): number | null {
    if (this.count === 0) return null;
    const start = this.head - this.count;
    const i = ((start % this.capacity) + this.capacity) % this.capacity * 2;
    return this.buf[i];
  }
}
