interface FogToolbarProps {
  fogEnabled: boolean;
  fogTool: "reveal" | "hide" | null;
  onToggleFog: () => void;
  onActivateTool: (tool: "reveal" | "hide" | null) => void;
  onClearFog: () => void;
}

export default function FogToolbar({ fogEnabled, fogTool, onToggleFog, onActivateTool, onClearFog }: FogToolbarProps) {
  return (
    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-lg px-2 py-1.5 shadow-lg shadow-black/50">
      <button
        onClick={onToggleFog}
        className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
          fogEnabled
            ? "bg-indigo-600 text-white hover:bg-indigo-500"
            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        }`}
      >
        Fog {fogEnabled ? "On" : "Off"}
      </button>

      {fogEnabled && (
        <>
          <div className="w-px h-4 bg-gray-700" />
          {(["reveal", "hide"] as const).map((tool) => (
            <button
              key={tool}
              onClick={() => onActivateTool(fogTool === tool ? null : tool)}
              className={`text-xs px-2 py-1 rounded font-medium capitalize transition-colors ${
                fogTool === tool
                  ? tool === "reveal" ? "bg-green-700 text-white" : "bg-red-800 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
              title={tool === "reveal" ? "Drag to reveal map area" : "Drag to re-fog map area"}
            >
              {tool}
            </button>
          ))}
          <button
            onClick={onClearFog}
            className="text-xs px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Remove all fog reveals"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
