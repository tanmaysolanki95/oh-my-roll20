import { useState } from "react";

interface MapControlsProps {
  stageScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export default function MapControls({ stageScale, onZoomIn, onZoomOut, onResetView }: MapControlsProps) {
  const [pos, setPos] = useState({ x: 12, y: -1 }); // -1 = anchor to bottom
  const [hidden, setHidden] = useState(false);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    // When bottom-anchored (pos.y === -1), resolve actual top from DOM before dragging
    // so the panel doesn't jump on first move.
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>(".absolute");
    const rect = el?.getBoundingClientRect();
    const resolvedY = rect ? rect.top : pos.y;
    const startX = e.clientX - pos.x;
    const startY = e.clientY - resolvedY;
    const onMove = (ev: PointerEvent) => setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const style: React.CSSProperties = pos.y === -1
    ? { left: pos.x, bottom: 12 }
    : { left: pos.x, top: pos.y };

  if (hidden) {
    return (
      <button
        className="absolute flex items-center justify-center w-8 h-8 backdrop-blur-md border rounded-lg shadow-lg shadow-black/50 text-sm font-bold tabular-nums transition-colors"
        style={{
          ...style,
          background: "var(--theme-bg-surface)",
          borderColor: "var(--theme-border)",
          color: "var(--theme-text-secondary)",
        }}
        onPointerDown={startDrag}
        onClick={() => setHidden(false)}
        title="Show zoom controls"
      >
        🔍
      </button>
    );
  }

  return (
    <div
      className="absolute flex items-center gap-1 backdrop-blur-md border rounded-lg px-2 py-1.5 shadow-lg shadow-black/50 select-none"
      style={{
        ...style,
        background: "var(--theme-bg-surface)",
        borderColor: "var(--theme-border)",
      }}
    >
      {/* Drag handle */}
      <div
        className="flex flex-col gap-0.5 px-0.5 cursor-grab active:cursor-grabbing shrink-0"
        onPointerDown={startDrag}
        title="Drag to move"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-0.5">
            <div className="w-0.5 h-0.5 rounded-full" style={{ background: "var(--theme-border)" }} />
            <div className="w-0.5 h-0.5 rounded-full" style={{ background: "var(--theme-border)" }} />
          </div>
        ))}
      </div>

      <div className="w-px h-4 shrink-0" style={{ background: "var(--theme-border)" }} />

      <button
        onClick={onZoomOut}
        className="w-6 h-6 flex items-center justify-center rounded text-base transition-colors"
        style={{ color: "var(--theme-text-secondary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--theme-text-primary)";
          e.currentTarget.style.background = "var(--theme-bg-panel)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--theme-text-secondary)";
          e.currentTarget.style.background = "transparent";
        }}
        title="Zoom out (scroll down)"
      >−</button>
      <button
        onClick={onResetView}
        className="text-xs transition-colors w-10 text-center tabular-nums"
        style={{ color: "var(--theme-text-secondary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--theme-text-primary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--theme-text-secondary)")}
        title="Fit map to screen"
      >
        {Math.round(stageScale * 100)}%
      </button>
      <button
        onClick={onZoomIn}
        className="w-6 h-6 flex items-center justify-center rounded text-base transition-colors"
        style={{ color: "var(--theme-text-secondary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--theme-text-primary)";
          e.currentTarget.style.background = "var(--theme-bg-panel)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--theme-text-secondary)";
          e.currentTarget.style.background = "transparent";
        }}
        title="Zoom in (scroll up)"
      >+</button>

      <div className="w-px h-4 shrink-0" style={{ background: "var(--theme-border)" }} />

      <button
        onClick={() => setHidden(true)}
        className="text-xs transition-colors px-0.5"
        style={{ color: "var(--theme-text-muted)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--theme-text-primary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--theme-text-muted)")}
        title="Hide zoom controls"
      >✕</button>
    </div>
  );
}
