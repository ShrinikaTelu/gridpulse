/**
 * Dashboard grid with pointer-based drag-to-reorder.
 *
 * Deliberately hand-rolled (no react-grid-layout): HTML5 drag events on the
 * card header, a drop indicator on the hovered card, and a single `move`
 * action on the Zustand store. Memoized cards mean a reorder re-renders
 * only the grid shell — the canvas charts inside keep their rAF loops
 * untouched because React preserves them by key.
 */
import { memo, useRef, useState } from "react";
import {
  useDashboardStore,
  type WidgetConfig,
} from "../store/stores";
import { SENSORS } from "../simulator/engine";
import { ChartWidget, GaugeWidget, StatWidget, AlertsWidget } from "../widgets/widgets";

const KIND_LABEL: Record<string, string> = {
  chart: "TREND",
  gauge: "GAUGE",
  stat: "READOUT",
  alerts: "ALERTS",
};

const WidgetCard = memo(function WidgetCard({
  w,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  dropTarget,
}: {
  w: WidgetConfig;
  index: number;
  onDragStart: (i: number) => void;
  onDragOver: (i: number, e: React.DragEvent) => void;
  onDrop: (i: number) => void;
  dropTarget: boolean;
}) {
  const removeWidget = useDashboardStore((st) => st.removeWidget);
  const cycleSize = useDashboardStore((st) => st.cycleSize);
  const setSensor = useDashboardStore((st) => st.setSensor);
  const sensor = SENSORS.find((s) => s.id === w.sensorId);

  return (
    <article
      className={`card size-${w.size} ${dropTarget ? "drop-target" : ""}`}
      onDragOver={(e) => onDragOver(index, e)}
      onDrop={() => onDrop(index)}
    >
      <header
        className="card-head"
        draggable
        onDragStart={() => onDragStart(index)}
        title="Drag to reorder"
      >
        <span className="card-kind">{KIND_LABEL[w.kind]}</span>
        {w.kind !== "alerts" ? (
          <select
            className="sensor-select"
            value={w.sensorId}
            onChange={(e) => setSensor(w.id, e.target.value)}
            aria-label="Sensor"
          >
            {SENSORS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="card-title">Alert feed</span>
        )}
        <span className="card-actions">
          <button className="btn-icon" onClick={() => cycleSize(w.id)} title="Resize">
            ⤢
          </button>
          <button className="btn-icon" onClick={() => removeWidget(w.id)} title="Remove">
            ✕
          </button>
        </span>
      </header>
      {w.kind === "chart" && <ChartWidget sensorId={w.sensorId} size={w.size} />}
      {w.kind === "gauge" && <GaugeWidget sensorId={w.sensorId} />}
      {w.kind === "stat" && <StatWidget sensorId={w.sensorId} />}
      {w.kind === "alerts" && <AlertsWidget />}
      {sensor && <footer className="card-foot">{sensor.name}</footer>}
    </article>
  );
});

export function DashboardGrid() {
  const widgets = useDashboardStore((st) => st.widgets);
  const move = useDashboardStore((st) => st.move);
  const dragFrom = useRef<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  return (
    <div className="grid" onDragLeave={() => setDropIdx(null)}>
      {widgets.map((w, i) => (
        <WidgetCard
          key={w.id}
          w={w}
          index={i}
          dropTarget={dropIdx === i && dragFrom.current !== i}
          onDragStart={(idx) => (dragFrom.current = idx)}
          onDragOver={(idx, e) => {
            e.preventDefault();
            setDropIdx(idx);
          }}
          onDrop={(idx) => {
            if (dragFrom.current !== null && dragFrom.current !== idx) {
              move(dragFrom.current, idx);
            }
            dragFrom.current = null;
            setDropIdx(null);
          }}
        />
      ))}
    </div>
  );
}
