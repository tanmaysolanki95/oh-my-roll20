import { useState } from "react";

interface FogToolbarProps {
  fogEnabled: boolean;
  fogTool: "reveal" | "hide" | null;
  onToggleFog: () => void;
  onActivateTool: (tool: "reveal" | "hide" | null) => void;
  onClearFog: () => void;
}

export default function FogToolbar({ fogEnabled, fogTool, onToggleFog, onActivateTool, onClearFog }: FogToolbarProps) {
  const [pos, setPos] = useState({ x: 12, y: 12 });
  const [hidden, setHidden] = useState(false);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    const onMove = (ev: PointerEvent) => {
      setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (hidden) {
    return (
      <button
        className="absolute flex items-center justify-center w-8 h-8 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-lg shadow-lg shadow-black/50 text-gray-400 hover:text-white transition-colors"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={startDrag}
        onClick={() => setHidden(false)}
        title="Show fog toolbar"
      >
        ☁
      </button>
    );
  }

  return (
    <div
      className="absolute flex items-center gap-1.5 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-lg px-2 py-1.5 shadow-lg shadow-black/50 select-none"
      style={{ left: pos.x, top: pos.y }}
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
        onClick={onToggleFog}
        className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
          fogEnabled
            ? "bg-indigo-600 text-white hover:bg-indigo-500"
            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        }`}
        title={fogEnabled ? "Fog is ON — players only see revealed areas. Click to disable." : "Fog is OFF — players see the whole map. Click to enable."}
      >
        🌫️ Fog {fogEnabled ? "On" : "Off"}
      </button>

      {fogEnabled && (
        <>
          <div className="w-px h-4 bg-gray-700 shrink-0" />
          <button
            onClick={() => onActivateTool(fogTool === "reveal" ? null : "reveal")}
            className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
              fogTool === "reveal"
                ? "bg-green-700 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            title="Drag on the map to uncover an area for players"
          >
            👁 Reveal area
          </button>
          <button
            onClick={() => onActivateTool(fogTool === "hide" ? null : "hide")}
            className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
              fogTool === "hide"
                ? "bg-red-800 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            title="Drag on the map to re-fog an area, hiding it from players"
          >
            🌑 Hide area
          </button>
          <button
            onClick={onClearFog}
            className="text-xs px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Remove all fog zones — the whole map becomes fogged again"
          >
            Reset all
          </button>
        </>
      )}

      <div className="w-px h-4 bg-gray-700 shrink-0" />

      {/* Hide button */}
      <button
        onClick={() => setHidden(true)}
        className="text-xs text-gray-600 hover:text-gray-300 transition-colors px-0.5"
        title="Hide toolbar"
      >
        ✕
      </button>
    </div>
  );
}
