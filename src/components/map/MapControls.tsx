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
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
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
        className="absolute flex items-center justify-center w-8 h-8 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-lg shadow-lg shadow-black/50 text-gray-400 hover:text-white transition-colors text-sm font-bold tabular-nums"
        style={style}
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
      className="absolute flex items-center gap-1 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-lg px-2 py-1.5 shadow-lg shadow-black/50 select-none"
      style={style}
    >
      {/* Drag handle */}
      <div
        className="flex flex-col gap-0.5 px-0.5 cursor-grab active:cursor-grabbing shrink-0"
        onPointerDown={startDrag}
        title="Drag to move"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-0.5">
            <div className="w-0.5 h-0.5 rounded-full bg-gray-600" />
            <div className="w-0.5 h-0.5 rounded-full bg-gray-600" />
          </div>
        ))}
      </div>

      <div className="w-px h-4 bg-gray-700 shrink-0" />

      <button
        onClick={onZoomOut}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
        title="Zoom out (scroll down)"
      >−</button>
      <button
        onClick={onResetView}
        className="text-xs text-gray-400 hover:text-white transition-colors w-10 text-center tabular-nums"
        title="Fit map to screen"
      >
        {Math.round(stageScale * 100)}%
      </button>
      <button
        onClick={onZoomIn}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
        title="Zoom in (scroll up)"
      >+</button>

      <div className="w-px h-4 bg-gray-700 shrink-0" />

      <button
        onClick={() => setHidden(true)}
        className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-0.5"
        title="Hide zoom controls"
      >✕</button>
    </div>
  );
}
