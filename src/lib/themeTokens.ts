import type { Theme } from "@/types";

export interface ThemeTokens {
  fogColor: string;          // fills base FogLayer Rect + hide-zone re-fog Rects
  fogAdminOpacity: number;   // replaces hardcoded 0.72 on FogLayer Layer opacity (owner view)
  fogPreviewStroke: string;  // stroke color for FogPreviewOutline dashed rect
  tokenRing: string;         // stroke color for outer Circle in TokenShape
}

const THEME_TOKENS: Record<Theme, ThemeTokens> = {
  grimoire: { fogColor: "#0a0303",  fogAdminOpacity: 0.65, fogPreviewStroke: "#dc2626", tokenRing: "rgba(220,38,38,0.45)" },
  scroll:   { fogColor: "#0a0602",  fogAdminOpacity: 0.65, fogPreviewStroke: "#c9930a", tokenRing: "rgba(200,150,20,0.5)"  },
  neon:     { fogColor: "#040212",  fogAdminOpacity: 0.65, fogPreviewStroke: "#7c3aed", tokenRing: "rgba(109,40,217,0.6)"  },
};

export function getThemeTokens(theme: Theme): ThemeTokens {
  return THEME_TOKENS[theme] ?? THEME_TOKENS.grimoire;
}
