import type { Session } from "@/types";
import { MIN_TOKEN_SIZE, MAX_TOKEN_SIZE } from "@/lib/mapUtils";

type TokenSizeScope = "all" | "players";

interface MapControlsProps {
  isOwner: boolean;
  session: Session | null;
  stageScale: number;
  pendingTokenSize: number | null;
  tokenSizeScope: TokenSizeScope;
  onPendingTokenSize: (v: number | null) => void;
  onTokenSizeScope: (s: TokenSizeScope) => void;
  onTokenSizeCommit: (newSize: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export default function MapControls({
  isOwner, session, stageScale,
  pendingTokenSize, tokenSizeScope,
  onPendingTokenSize, onTokenSizeScope, onTokenSizeCommit,
  onZoomIn, onZoomOut, onResetView,
}: MapControlsProps) {
  const tokenSize = session?.token_size ?? 56;

  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 shadow-lg shadow-black/50">
      {/* Token size — DM only */}
      {isOwner && session && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 shrink-0">Token</span>

            {/* Scope toggle */}
            <div className="flex rounded overflow-hidden border border-gray-700 text-xs">
              {(["all", "players"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onTokenSizeScope(s)}
                  className={`px-1.5 py-0.5 capitalize transition-colors ${
                    tokenSizeScope === s
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                  title={s === "all" ? "Resize all tokens" : "Resize player-owned tokens only"}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={() => onTokenSizeCommit(Math.max(MIN_TOKEN_SIZE, tokenSize - 4))}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-sm transition-colors"
            >−</button>
            <input
              type="range"
              min={MIN_TOKEN_SIZE}
              max={MAX_TOKEN_SIZE}
              value={pendingTokenSize ?? tokenSize}
              onChange={(e) => onPendingTokenSize(Number(e.target.value))}
              onPointerUp={() => {
                if (pendingTokenSize === null) return;
                onTokenSizeCommit(pendingTokenSize);
                onPendingTokenSize(null);
              }}
              className="w-20 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <button
              onClick={() => onTokenSizeCommit(Math.min(MAX_TOKEN_SIZE, tokenSize + 4))}
              className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-sm transition-colors"
            >+</button>
          </div>
          <div className="w-px h-6 bg-gray-700" />
        </>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
          title="Zoom out (scroll down)"
        >−</button>
        <button
          onClick={onResetView}
          className="text-xs text-gray-400 hover:text-white transition-colors w-12 text-center tabular-nums"
          title="Fit map to screen"
        >
          {Math.round(stageScale * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700 text-base transition-colors"
          title="Zoom in (scroll up)"
        >+</button>
      </div>
    </div>
  );
}
