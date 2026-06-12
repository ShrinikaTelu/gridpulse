/**
 * TelemetryChart — canvas line chart driven by requestAnimationFrame.
 *
 * React mounts the <canvas> once; after that, drawing happens entirely
 * outside the render cycle. The rAF loop reads the ring buffer each frame,
 * so the chart scrolls smoothly at 60 fps while React's commit count for
 * this component stays at ~1. This is the deliberate contrast with the
 * naive approach (samples -> setState -> re-render at 10 Hz x N charts).
 */
import { useEffect, useRef } from "react";
import { buffers, SENSORS } from "../simulator/engine";
import type { Sample } from "../data/ringBuffer";
import { usePlaybackStore, useAlertStore } from "../store/stores";

interface Props {
  sensorId: string;
  height?: number;
}

const CYAN = "#7FD1E8";
const AMBER = "#FFB454";
const GRID = "rgba(34,48,74,0.9)";
const TEXT = "#5C6B85";

export function TelemetryChart({ sensorId, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Reused sample array to avoid per-frame allocation.
  const scratch = useRef<Sample[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sensor = SENSORS.find((s) => s.id === sensorId);
    let raf = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastDraw = 0;

    const draw = (frameT: number) => {
      raf = requestAnimationFrame(draw);
      // Honor reduced motion by dropping to 2 fps instead of 60.
      if (reduced && frameT - lastDraw < 500) return;
      lastDraw = frameT;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { mode, cursor, windowSec } = usePlaybackStore.getState();
      const now = mode === "live" ? Date.now() : cursor;
      const tFrom = now - windowSec * 1000;

      const buf = buffers[sensorId];
      if (!buf) return;
      const n = buf.window(tFrom, now, scratch.current);
      if (n < 2) return;

      // Auto-scale with padding.
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) {
        const v = scratch.current[i].v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const pad = (max - min) * 0.25 || 1;
      min -= pad;
      max += pad;

      const x = (t: number) => ((t - tFrom) / (now - tFrom)) * w;
      const y = (v: number) => h - ((v - min) / (max - min)) * h;

      // Gridlines + labels.
      ctx.strokeStyle = GRID;
      ctx.fillStyle = TEXT;
      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        const gy = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
        const val = max - ((max - min) / 4) * i;
        ctx.fillText(val.toFixed(sensor?.decimals ?? 1), 6, gy - 4);
      }

      // Threshold line, if a rule exists for this sensor.
      const rule = useAlertStore.getState().rules.find((r) => r.sensorId === sensorId);
      if (rule && rule.threshold > min && rule.threshold < max) {
        ctx.strokeStyle = AMBER;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, y(rule.threshold));
        ctx.lineTo(w, y(rule.threshold));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Area fill.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(127,209,232,0.22)");
      grad.addColorStop(1, "rgba(127,209,232,0)");
      ctx.beginPath();
      ctx.moveTo(x(scratch.current[0].t), y(scratch.current[0].v));
      for (let i = 1; i < n; i++) ctx.lineTo(x(scratch.current[i].t), y(scratch.current[i].v));
      ctx.lineTo(x(scratch.current[n - 1].t), h);
      ctx.lineTo(x(scratch.current[0].t), h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line.
      ctx.beginPath();
      ctx.moveTo(x(scratch.current[0].t), y(scratch.current[0].v));
      for (let i = 1; i < n; i++) ctx.lineTo(x(scratch.current[i].t), y(scratch.current[i].v));
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Live head dot.
      if (mode === "live") {
        const head = scratch.current[n - 1];
        ctx.beginPath();
        ctx.arc(x(head.t), y(head.v), 3, 0, Math.PI * 2);
        ctx.fillStyle = CYAN;
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [sensorId]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height, display: "block" }}
      role="img"
      aria-label={`Live chart for ${SENSORS.find((s) => s.id === sensorId)?.name ?? sensorId}`}
    />
  );
}
