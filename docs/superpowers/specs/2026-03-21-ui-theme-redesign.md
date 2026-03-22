# UI Theme Redesign — Design Spec
_2026-03-21_

## Goals

1. Replace the generic AI-looking indigo/gray palette with a hand-crafted fantasy aesthetic.
2. Introduce three named themes selectable by the DM per session, enforced for all connected players.
3. Allow map upload at session creation (not just inside the session).
4. Extend theming to the Konva canvas — fog color, token ring borders.

---

## Themes

Three themes ship at launch. Each is a named set of design tokens.

### A — Arcane Scroll
Classic high fantasy. Warm gold and parchment tones, serif headings, medieval manuscript feel.

| Token | Value |
|---|---|
| `--theme-bg-deep` | `#060402` |
| `--theme-bg-surface` | `rgba(12,7,2,0.92)` |
| `--theme-bg-panel` | `rgba(14,6,2,0.88)` |
| `--theme-accent` | `#c9930a` |
| `--theme-accent-dim` | `#8b6914` |
| `--theme-accent-glow` | `rgba(180,130,20,0.3)` |
| `--theme-text-primary` | `#d4a843` |
| `--theme-text-secondary` | `#8b6914` |
| `--theme-text-muted` | `#6a4a14` |
| `--theme-border` | `rgba(139,105,20,0.18)` |
| `--theme-border-accent` | `rgba(200,150,20,0.5)` |
| `--theme-divider` | `linear-gradient(90deg, transparent, #8b6914 30%, #c9930a 50%, #8b6914 70%, transparent)` |
| `--theme-font-display` | `'Cinzel', serif` |
| `--theme-font-body` | `'Crimson Text', serif` |
| `--theme-lobby-bg-image` | Unsplash gothic castle ruins photo |
| `--theme-fog-color` | `rgba(10,6,2,0.65)` (warm dark) |
| `--theme-fog-admin-opacity` | `0.65` |
| `--theme-token-ring` | `rgba(200,150,20,0.5)` |
| `--theme-tab-active-border` | `#c9930a` |

### B — Arcane Neon
Fantasy meets crystalline sci-fi. Deep void black, violet and cyan glows, geometric rune motifs, Rajdhani sans-serif.

| Token | Value |
|---|---|
| `--theme-bg-deep` | `#04020e` |
| `--theme-bg-surface` | `rgba(8,4,22,0.92)` |
| `--theme-bg-panel` | `rgba(7,3,20,0.88)` |
| `--theme-accent` | `#7c3aed` |
| `--theme-accent-dim` | `#4c1d95` |
| `--theme-accent-glow` | `rgba(109,40,217,0.35)` |
| `--theme-text-primary` | `#c4b5fd` |
| `--theme-text-secondary` | `#6d3aaa` |
| `--theme-text-muted` | `#3d2880` |
| `--theme-border` | `rgba(109,40,217,0.15)` |
| `--theme-border-accent` | `rgba(109,40,217,0.55)` |
| `--theme-divider` | `linear-gradient(90deg, transparent, #4c1d95 30%, #06b6d4 50%, #4c1d95 70%, transparent)` |
| `--theme-font-display` | `'Rajdhani', sans-serif` |
| `--theme-font-body` | `'Rajdhani', sans-serif` |
| `--theme-lobby-bg-image` | Unsplash deep-space starfield photo |
| `--theme-fog-color` | `rgba(4,2,18,0.65)` (cold dark) |
| `--theme-fog-admin-opacity` | `0.65` |
| `--theme-token-ring` | `rgba(109,40,217,0.6)` |
| `--theme-tab-active-border` | `#7c3aed` |

### C — Obsidian Grimoire _(default)_
Dark gothic horror. Near-black obsidian, blood-red accents, bone-white text, Cinzel serif, faint crack/vein decoration.

| Token | Value |
|---|---|
| `--theme-bg-deep` | `#050202` |
| `--theme-bg-surface` | `rgba(12,3,3,0.92)` |
| `--theme-bg-panel` | `rgba(14,4,4,0.88)` |
| `--theme-accent` | `#dc2626` |
| `--theme-accent-dim` | `#7f1d1d` |
| `--theme-accent-glow` | `rgba(185,28,28,0.35)` |
| `--theme-text-primary` | `#fecaca` |
| `--theme-text-secondary` | `#7f1d1d` |
| `--theme-text-muted` | `#5a1010` |
| `--theme-border` | `rgba(185,28,28,0.12)` |
| `--theme-border-accent` | `rgba(220,38,38,0.5)` |
| `--theme-divider` | `linear-gradient(90deg, transparent, #7f1d1d 30%, #dc2626 50%, #7f1d1d 70%, transparent)` |
| `--theme-font-display` | `'Cinzel', serif` |
| `--theme-font-body` | `'Crimson Text', serif` |
| `--theme-lobby-bg-image` | Unsplash dark forest / misty woods photo |
| `--theme-fog-color` | `rgba(10,3,3,0.65)` (blood dark) |
| `--theme-fog-admin-opacity` | `0.65` |
| `--theme-token-ring` | `rgba(220,38,38,0.45)` |
| `--theme-tab-active-border` | `#dc2626` |

Semantic colors (HP, damage, positive) are **not** theme-specific — they remain green/red/amber across all themes.

---

## Architecture: CSS Variables + Zustand Token Object (Approach A)

### CSS layer

`layout.tsx` sets `data-theme="grimoire"` as the default on `<body>` so that CSS variables are always active — even on the lobby page before any user interaction. A `useEffect` in `SessionView` overrides this when a session is loaded.

```tsx
// src/app/layout.tsx
export default function RootLayout({ children }) {
  return <html><body data-theme="grimoire">{children}</body></html>
}
```

The `[data-theme]` blocks in `globals.css` define all tokens:

```css
/* globals.css */
[data-theme="grimoire"] {
  --theme-bg-deep: #050202;
  --theme-accent: #dc2626;
  /* ... all tokens ... */
}
[data-theme="scroll"] {
  --theme-bg-deep: #060402;
  --theme-accent: #c9930a;
  /* ... */
}
[data-theme="neon"] {
  --theme-bg-deep: #04020e;
  --theme-accent: #7c3aed;
  /* ... */
}
```

The `@theme inline {}` block is extended to expose all new font variables to Tailwind v4's JIT:

```css
@theme inline {
  --font-cinzel:   var(--font-cinzel-loaded);
  --font-crimson:  var(--font-crimson-loaded);
  --font-rajdhani: var(--font-rajdhani-loaded);
  --font-exo2:     var(--font-exo2-loaded);
  /* existing geist vars remain */
}
```

Every component references CSS vars instead of hard-coded Tailwind color classes. Switching `data-theme` is a single DOM attribute change — no React re-render, instant for all elements.

### Zustand layer (canvas values)

Konva components need JS values, not CSS strings. `getThemeTokens` is a pure function exported from `src/lib/themeTokens.ts`:

```ts
// src/lib/themeTokens.ts

export interface ThemeTokens {
  fogColor: string;          // rgba — fills base FogLayer Rect + hide-zone re-fog Rects
  fogAdminOpacity: number;   // replaces hardcoded 0.72 on FogLayer Layer opacity (owner view only)
  fogPreviewStroke: string;  // stroke color for FogPreviewOutline dashed rect
  tokenRing: string;         // stroke color for outer Circle in TokenShape
}

const THEME_TOKENS: Record<Theme, ThemeTokens> = {
  grimoire: { fogColor: 'rgba(10,3,3,0.65)',  fogAdminOpacity: 0.65, fogPreviewStroke: '#dc2626', tokenRing: 'rgba(220,38,38,0.45)' },
  scroll:   { fogColor: 'rgba(10,6,2,0.65)',  fogAdminOpacity: 0.65, fogPreviewStroke: '#c9930a', tokenRing: 'rgba(200,150,20,0.5)'  },
  neon:     { fogColor: 'rgba(4,2,18,0.65)',  fogAdminOpacity: 0.65, fogPreviewStroke: '#7c3aed', tokenRing: 'rgba(109,40,217,0.6)'  },
};

export function getThemeTokens(theme: Theme): ThemeTokens {
  return THEME_TOKENS[theme] ?? THEME_TOKENS.grimoire;
}
```

`SessionView` calls `getThemeTokens(session.theme)` and passes the result as a `themeTokens` prop to `MapCanvas`. `MapCanvas` passes `fogColor` and `fogAdminOpacity` to `FogLayer`/`FogAdminOverlay`, and `tokenRing` to each `TokenShape`. No canvas component reads from the store directly for theme values — they receive props only.

**Stale closure safety:** `MapCanvas` mirrors `themeTokens` in a ref:

```ts
const themeTokensRef = useRef(themeTokens);
useEffect(() => { themeTokensRef.current = themeTokens; }, [themeTokens]);
```

Any long-lived event handler that needs a theme value (e.g. fog painting preview color) reads `themeTokensRef.current`, never the prop directly.

### FogLayer API clarification

`fogColor` replaces the hard-coded fill value in **all three** fog rect usages in `FogLayer`:
1. The base full-canvas `Rect` (currently `"#0f172a"` or similar)
2. The hide-zone re-fog `Rect`s (same color — they re-apply the fog on top of revealed zones)
3. The `FogPreviewOutline` does not use `fogColor` — it uses a dashed stroke; its color becomes `var(--theme-accent)` read from CSS or passed as a separate `fogPreviewStroke` prop.

`fogAdminOpacity` replaces the hardcoded `0.72` on the `FogLayer` Layer's `opacity` prop (owner/admin view only). The non-owner view remains `opacity={1}`.

### Propagation

`session.theme` is a new column (`text`, default `'grimoire'`). It propagates to all clients via the existing `postgres_changes` sessions UPDATE handler in `useRealtimeSession.ts`. On receiving the update, `setSession()` already writes to the store; a `useEffect` in `SessionView` watches `session?.theme` and calls `document.body.setAttribute('data-theme', session.theme)`. The dependency is `session?.theme` (not the whole `session` object) to avoid unnecessary re-runs.

No extra subscription needed.

---

## Data Model

### New migration: `014_theme.sql`

```sql
ALTER TABLE sessions
  ADD COLUMN theme text NOT NULL DEFAULT 'grimoire'
  CHECK (theme IN ('grimoire', 'scroll', 'neon'));
```

### Updated `Session` type

```ts
export type Theme = 'grimoire' | 'scroll' | 'neon';

export interface Session {
  // ... existing fields ...
  theme: Theme;
}
```

---

## Lobby Page Changes (`src/app/page.tsx`)

### Background image
Full-bleed atmospheric photo per theme, darkened via CSS `filter: brightness(0.45) saturate(0.75)` and overlaid with a radial gradient. On the lobby (no session yet), the default theme is `grimoire`. A theme picker in the Create card changes the preview live (local state only until the session is created).

### Layout
The current centered form becomes a glassmorphism card (`backdrop-filter: blur(12px)`) floating over the background. The card uses:
- `background: var(--theme-bg-deep)` at ~75% opacity
- `border: 1px solid var(--theme-border-accent)`
- `box-shadow: 0 8px 40px rgba(0,0,0,0.65), 0 0 40px var(--theme-accent-glow)`

### Create card additions
1. **Theme picker** — three icon+label cards (📜 Scroll / 🔮 Arcane / 💀 Grimoire) inside the Create section. Selecting one changes `data-theme` on the body immediately so the background and card style preview the theme in real time.
2. **Map upload** — a dashed-border row (`🗺️ Upload battle map (optional)`) below the theme picker. Accepts the same image formats as the existing in-session upload. The file is stored in Supabase Storage at session creation using the new session ID; `map_url` is stamped on the session row in the same INSERT.

### Typography
Replace Geist Sans with theme-appropriate fonts loaded from Google Fonts:
- Cinzel (display headings, labels, buttons) — Scroll + Grimoire
- Crimson Text (body, inputs) — Scroll + Grimoire
- Rajdhani (all text) — Neon
- Exo 2 (fallback / non-themed contexts)

---

## Session View Changes (`src/app/session/[id]/SessionView.tsx`)

### Theme application
`SessionView` adds a `useEffect` that watches `session.theme` and sets `document.body.setAttribute('data-theme', session.theme)` on mount and on change. Cleanup resets to `'grimoire'` on unmount.

### DM tab — theme switcher
A new "Realm Theme" control panel at the top of the DM tab, above Fog of War. Three `tcard` buttons (📜 / 🔮 / 💀); clicking one:
1. Optimistically calls `setSession({ ...session, theme: newTheme })`
2. `await supabase.from('sessions').update({ theme: newTheme })`
3. Other clients receive via `postgres_changes` → `setSession()` → `useEffect` applies new `data-theme`

### Sidebar component styling
All sidebar components replace hard-coded Tailwind color classes (e.g. `bg-gray-800/60`, `border-gray-700/40`, `text-gray-500`) with CSS variable references. Tabs, panels, buttons, inputs, HP controls, dice buttons all use `var(--theme-*)` tokens.

### Token row layout (from review)
The token row is restructured into three visual sections with clear separation:
1. **Identity** — token circle + name + visibility/delete actions
2. **HP block** — `Hit Points` label + `48/60` value right-aligned, then thicker HP bar (5px), then "Adjust" label + slider on the same row
3. **Actions** — subtle 1px divider, then Damage/Heal buttons + size slider

---

## Canvas Changes

### FogLayer
`FogLayer` receives `fogColor` and `fogAdminOpacity` from `themeTokens` (passed as props from `MapCanvas`). The base full-canvas `Rect` fill changes from a hard-coded dark value to `fogColor`. `FogAdminOverlay` layer opacity changes from a hard-coded `0.65` to `fogAdminOpacity` (same value for now, kept as a token for future per-theme tuning).

### TokenShape
`TokenShape` receives `tokenRingColor` from `themeTokens`. The outer `Circle` stroke changes from a hard-coded color to `tokenRingColor`. The HP bar colors (green/yellow/red) remain semantic and do not change per theme.

---

## Map Upload at Session Creation

Session creation currently only takes `name` + player identity. New flow:

1. User optionally selects a file in the Create card.
2. On submit, the session INSERT runs first to get `sessionId`.
3. If a file was selected: upload to `maps/${sessionId}/map.${ext}` in Supabase Storage → get public URL → `UPDATE sessions SET map_url = $url WHERE id = $sessionId`.
4. If no file: session is created with `map_url = null` as before.

The upload uses the existing `maps` bucket and its storage INSERT policy (migration 010 — a simple `owner_id = auth.uid()` check, not `split_part(name)`). At upload time the session row already exists (INSERT ran first), so the user is authenticated as the session owner and the policy passes. No new storage policy is needed.

A loading state on the Create button shows "Forging…" while the upload is in progress. If the upload fails after the session INSERT succeeds, the session is still created with `map_url = null` — the user can upload a map from inside the session as before. Error state is shown inline below the upload row.

---

## Fonts

Google Fonts are loaded in `src/app/layout.tsx` via `next/font/google` (Server Component — correct for App Router):

```ts
import { Cinzel, Crimson_Text, Rajdhani, Exo_2 } from 'next/font/google';

const cinzel    = Cinzel({ subsets: ['latin'], variable: '--font-cinzel-loaded' });
const crimson   = Crimson_Text({ subsets: ['latin'], weight: ['400','600'], variable: '--font-crimson-loaded' });
const rajdhani  = Rajdhani({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-rajdhani-loaded' });
const exo2      = Exo_2({ subsets: ['latin'], variable: '--font-exo2-loaded' });

export default function RootLayout({ children }) {
  return (
    <html>
      <body
        data-theme="grimoire"
        className={`${cinzel.variable} ${crimson.variable} ${rajdhani.variable} ${exo2.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
```

The `next/font` variables (`--font-cinzel-loaded`, etc.) are surfaced to Tailwind v4 via the `@theme inline {}` block in `globals.css` as `--font-cinzel`, `--font-crimson`, `--font-rajdhani`. Each `[data-theme]` block then sets `--theme-font-display` and `--theme-font-body` to reference these. Geist Sans and Geist Mono variables are retained alongside the new fonts.

---

## Out of Scope

- Per-player theme override (theme is session-enforced)
- Custom theme builder / color picker
- Animated background (particles, moving fog) — can be a follow-up
- Mobile / responsive layout changes beyond what theming naturally provides
