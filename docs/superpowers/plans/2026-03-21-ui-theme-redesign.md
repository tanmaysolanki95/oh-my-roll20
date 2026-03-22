# UI Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic indigo/gray UI palette with three named fantasy themes (Obsidian Grimoire, Arcane Scroll, Arcane Neon) selectable by the DM per session and enforced for all players, extending to the Konva canvas and adding map upload at session creation.

**Architecture:** CSS custom properties (`[data-theme]` blocks on `<body>`) handle all UI styling — a single attribute flip switches every component instantly with no React re-renders. A companion pure-function library (`src/lib/themeTokens.ts`) provides JS values for the Konva canvas, which cannot read CSS. `session.theme` is persisted in the DB and propagated to all clients via the existing `postgres_changes` sessions subscription.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Konva/react-konva, Zustand, Supabase (postgres_changes + Storage)

**Spec:** `docs/superpowers/specs/2026-03-21-ui-theme-redesign.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/migrations/014_theme.sql` | **Create** | `theme` column on sessions |
| `src/types/index.ts` | **Modify** | Add `Theme` type, `theme` field on `Session` |
| `src/lib/themeTokens.ts` | **Create** | `ThemeTokens` interface, `getThemeTokens()` pure function |
| `src/app/globals.css` | **Modify** | `[data-theme]` variable blocks, new font vars in `@theme inline {}` |
| `src/app/layout.tsx` | **Modify** | Load 4 Google Fonts, set `data-theme="grimoire"` on `<body>` |
| `src/app/page.tsx` | **Modify** | Full-bleed bg image, glassmorphism card, theme picker, map upload |
| `src/app/session/[id]/SessionView.tsx` | **Modify** | `useEffect` for `data-theme`, DM theme switcher, pass `themeTokens` to `MapCanvas` |
| `src/components/map/MapCanvas.tsx` | **Modify** | Accept `themeTokens` prop, mirror in ref, pass to canvas children |
| `src/components/map/FogLayer.tsx` | **Modify** | Accept `fogColor`, `fogAdminOpacity`, `fogPreviewStroke` props |
| `src/components/map/TokenShape.tsx` | **Modify** | Accept `tokenRing` prop, use as Circle stroke |
| `src/components/session/TokenPanel.tsx` | **Modify** | CSS var styling throughout, restructured token row layout |
| `src/components/session/PresenceBar.tsx` | **Modify** | CSS var styling |
| `src/components/map/MapControls.tsx` | **Modify** | CSS var styling |
| `src/components/dice/DiceRoller.tsx` | **Modify** | CSS var styling |
| `src/components/dice/DiceToast.tsx` | **Modify** | CSS var styling |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/014_theme.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/014_theme.sql
ALTER TABLE sessions
  ADD COLUMN theme text NOT NULL DEFAULT 'grimoire'
  CHECK (theme IN ('grimoire', 'scroll', 'neon'));
```

- [ ] **Step 2: Apply to local Supabase**

```bash
supabase db push
# or: supabase migration up
```

Expected: migration runs without error. Verify with:
```bash
supabase db diff
# should show no pending changes
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_theme.sql
git commit -m "feat: add theme column to sessions"
```

---

## Task 2: Types and Theme Token Library

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/themeTokens.ts`

- [ ] **Step 1: Add `Theme` type and `theme` field to `Session`**

In `src/types/index.ts`, add after the imports block (line 1):

```ts
export type Theme = 'grimoire' | 'scroll' | 'neon';
```

Add `theme: Theme;` to the `Session` interface after `owner_id`:

```ts
export interface Session {
  id: string;
  name: string;
  map_url: string | null;
  grid_size: number;
  token_size: number;
  fog_enabled: boolean;
  fog_shapes: FogShape[];
  fog_history: FogShape[][];
  grid_enabled: boolean;
  join_code: string;
  max_tokens_per_player: number;
  owner_id: string;
  theme: Theme;
  created_at: string;
}
```

- [ ] **Step 2: Create `src/lib/themeTokens.ts`**

```ts
import type { Theme } from "@/types";

export interface ThemeTokens {
  fogColor: string;          // fills base FogLayer Rect + hide-zone re-fog Rects
  fogAdminOpacity: number;   // replaces hardcoded 0.72 on FogLayer Layer opacity (owner view)
  fogPreviewStroke: string;  // stroke color for FogPreviewOutline dashed rect
  tokenRing: string;         // stroke color for outer Circle in TokenShape
}

const THEME_TOKENS: Record<Theme, ThemeTokens> = {
  grimoire: { fogColor: "rgba(10,3,3,0.65)",  fogAdminOpacity: 0.65, fogPreviewStroke: "#dc2626", tokenRing: "rgba(220,38,38,0.45)" },
  scroll:   { fogColor: "rgba(10,6,2,0.65)",  fogAdminOpacity: 0.65, fogPreviewStroke: "#c9930a", tokenRing: "rgba(200,150,20,0.5)"  },
  neon:     { fogColor: "rgba(4,2,18,0.65)",  fogAdminOpacity: 0.65, fogPreviewStroke: "#7c3aed", tokenRing: "rgba(109,40,217,0.6)"  },
};

export function getThemeTokens(theme: Theme): ThemeTokens {
  return THEME_TOKENS[theme] ?? THEME_TOKENS.grimoire;
}
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/themeTokens.ts
git commit -m "feat: add Theme type and getThemeTokens library"
```

---

## Task 3: CSS Theme Variables and Fonts

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Load fonts and set default `data-theme` in `layout.tsx`**

Replace the entire content of `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel, Crimson_Text, Rajdhani, Exo_2 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const cinzel    = Cinzel({ variable: "--font-cinzel-loaded", subsets: ["latin"], weight: ["400", "600", "700", "900"] });
const crimson   = Crimson_Text({ variable: "--font-crimson-loaded", subsets: ["latin"], weight: ["400", "600"] });
const rajdhani  = Rajdhani({ variable: "--font-rajdhani-loaded", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const exo2      = Exo_2({ variable: "--font-exo2-loaded", subsets: ["latin"], weight: ["300", "400", "600", "700"] });

export const metadata: Metadata = {
  title: "oh-my-roll20",
  description: "A VTT for friends",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${crimson.variable} ${rajdhani.variable} ${exo2.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" data-theme="grimoire">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add theme CSS variable blocks to `globals.css`**

Replace the entire content of `src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --background: #050202;
  --foreground: #fecaca;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans:     var(--font-geist-sans);
  --font-mono:     var(--font-geist-mono);
  --font-cinzel:   var(--font-cinzel-loaded);
  --font-crimson:  var(--font-crimson-loaded);
  --font-rajdhani: var(--font-rajdhani-loaded);
  --font-exo2:     var(--font-exo2-loaded);
}

/* ── Obsidian Grimoire (default) ── */
[data-theme="grimoire"] {
  --theme-bg-deep:         #050202;
  --theme-bg-surface:      rgba(12,3,3,0.92);
  --theme-bg-panel:        rgba(14,4,4,0.88);
  --theme-accent:          #dc2626;
  --theme-accent-dim:      #7f1d1d;
  --theme-accent-glow:     rgba(185,28,28,0.35);
  --theme-text-primary:    #fecaca;
  --theme-text-secondary:  #7f1d1d;
  --theme-text-muted:      #5a1010;
  --theme-border:          rgba(185,28,28,0.12);
  --theme-border-accent:   rgba(220,38,38,0.5);
  --theme-font-display:    var(--font-cinzel-loaded), serif;
  --theme-font-body:       var(--font-crimson-loaded), serif;
  --theme-tab-border:      #dc2626;
  --theme-lobby-bg:        url('https://images.unsplash.com/photo-1448375240586-882707db888b?w=1400&q=70');
}

/* ── Arcane Scroll ── */
[data-theme="scroll"] {
  --theme-bg-deep:         #060402;
  --theme-bg-surface:      rgba(12,7,2,0.92);
  --theme-bg-panel:        rgba(14,6,2,0.88);
  --theme-accent:          #c9930a;
  --theme-accent-dim:      #8b6914;
  --theme-accent-glow:     rgba(180,130,20,0.3);
  --theme-text-primary:    #d4a843;
  --theme-text-secondary:  #8b6914;
  --theme-text-muted:      #6a4a14;
  --theme-border:          rgba(139,105,20,0.18);
  --theme-border-accent:   rgba(200,150,20,0.5);
  --theme-font-display:    var(--font-cinzel-loaded), serif;
  --theme-font-body:       var(--font-crimson-loaded), serif;
  --theme-tab-border:      #c9930a;
  --theme-lobby-bg:        url('https://images.unsplash.com/photo-1520116468816-95b69f847357?w=1400&q=70');
}

/* ── Arcane Neon ── */
[data-theme="neon"] {
  --theme-bg-deep:         #04020e;
  --theme-bg-surface:      rgba(8,4,22,0.92);
  --theme-bg-panel:        rgba(7,3,20,0.88);
  --theme-accent:          #7c3aed;
  --theme-accent-dim:      #4c1d95;
  --theme-accent-glow:     rgba(109,40,217,0.35);
  --theme-text-primary:    #c4b5fd;
  --theme-text-secondary:  #6d3aaa;
  --theme-text-muted:      #3d2880;
  --theme-border:          rgba(109,40,217,0.15);
  --theme-border-accent:   rgba(109,40,217,0.55);
  --theme-font-display:    var(--font-rajdhani-loaded), sans-serif;
  --theme-font-body:       var(--font-rajdhani-loaded), sans-serif;
  --theme-tab-border:      #7c3aed;
  --theme-lobby-bg:        url('https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1400&q=70');
}

body {
  background: var(--theme-bg-deep);
  color: var(--theme-text-primary);
  font-family: var(--theme-font-body);
}
```

- [ ] **Step 3: Start dev server and verify fonts + default theme load**

```bash
npm run dev
```

Open `http://localhost:3000`. The lobby should have a dark red background tint (Grimoire default). Check browser DevTools → Elements: `<body data-theme="grimoire">`. Check that `--theme-accent` resolves to `#dc2626` in the Computed Styles panel.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: add theme CSS variables and load fantasy fonts"
```

---

## Task 4: Canvas Theming — FogLayer and TokenShape

Theme these first so that by the time `SessionView` passes `themeTokens`, the canvas components are already ready to receive them.

**Files:**
- Modify: `src/components/map/FogLayer.tsx`
- Modify: `src/components/map/TokenShape.tsx`

- [ ] **Step 1: Update `FogLayer` to accept theme props**

Replace `src/components/map/FogLayer.tsx` entirely:

```tsx
"use client";

import { Layer, Rect } from "react-konva";
import type { FogShape } from "@/types";
import { VIRTUAL_SIZE } from "@/lib/mapUtils";

interface FogLayerProps {
  fogShapes: FogShape[];
  fogPreview: FogShape | null;
  isOwner: boolean;
  mapWidth: number;
  mapHeight: number;
  fogColor: string;
  fogAdminOpacity: number;
}

export function FogLayer({ fogShapes, fogPreview, isOwner, mapWidth, mapHeight, fogColor, fogAdminOpacity }: FogLayerProps) {
  const fogOpacity = isOwner ? fogAdminOpacity : 1;
  const hasMap = mapWidth > 0 && mapHeight > 0;

  return (
    <Layer
      listening={false}
      opacity={fogOpacity}
      clipX={0}
      clipY={0}
      clipWidth={hasMap ? mapWidth : VIRTUAL_SIZE}
      clipHeight={hasMap ? mapHeight : VIRTUAL_SIZE}
    >
      <Rect x={0} y={0} width={VIRTUAL_SIZE} height={VIRTUAL_SIZE} fill={fogColor} />
      {fogShapes.map((shape, i) =>
        shape.type === "reveal"
          ? <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
              fill="black" globalCompositeOperation="destination-out" />
          : <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
              fill={fogColor} globalCompositeOperation="source-over" />
      )}
      {fogPreview && (
        fogPreview.type === "reveal"
          ? <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
              fill="black" globalCompositeOperation="destination-out" />
          : <Rect x={fogPreview.x} y={fogPreview.y} width={fogPreview.w} height={fogPreview.h}
              fill={fogColor} globalCompositeOperation="source-over" />
      )}
    </Layer>
  );
}

export function FogAdminOverlay({ fogShapes }: { fogShapes: FogShape[] }) {
  const reveals = fogShapes.filter(s => s.type === "reveal");
  if (reveals.length === 0) return null;
  return (
    <Layer listening={false}>
      {reveals.map((shape, i) => (
        <Rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h}
          fill="rgba(34,197,94,0.25)" />
      ))}
    </Layer>
  );
}

export function FogPreviewOutline({ preview, stageScale, fogPreviewStroke }: {
  preview: FogShape;
  stageScale: number;
  fogPreviewStroke: string;
}) {
  return (
    <Layer listening={false}>
      <Rect
        x={preview.x} y={preview.y}
        width={preview.w} height={preview.h}
        fill="transparent"
        stroke={fogPreviewStroke}
        strokeWidth={2 / stageScale}
        dash={[8 / stageScale, 4 / stageScale]}
      />
    </Layer>
  );
}
```

- [ ] **Step 2: Update `TokenShape` to accept `tokenRing` prop**

In `src/components/map/TokenShape.tsx`:

Add `tokenRing: string;` to `TokenShapeProps`:

```ts
export interface TokenShapeProps {
  token: Token;
  draggable: boolean;
  opacity: number;
  tokenSize: number;
  imageBounds: { x: number; y: number; width: number; height: number } | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDragStart: (id: string) => void;
  tokenRing: string;
}
```

Update the destructure and the `Circle` stroke:

```tsx
export default function TokenShape({
  token, draggable, opacity, tokenSize,
  imageBounds, stageRef, onDragMove, onDragEnd, onDragStart, tokenRing,
}: TokenShapeProps) {
```

Change the `Circle` stroke from `"white"` to `tokenRing`:
```tsx
<Circle
  radius={radius}
  fill={token.color}
  stroke={tokenRing}
  strokeWidth={3}
  shadowBlur={8}
  shadowColor="black"
  shadowOpacity={0.5}
/>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: TypeScript will report errors in `MapCanvas.tsx` because `FogLayer`, `FogPreviewOutline`, and `TokenShape` now require new props. This is expected — we fix `MapCanvas` in the next task. Note which lines are reported.

- [ ] **Step 4: Commit**

```bash
git add src/components/map/FogLayer.tsx src/components/map/TokenShape.tsx
git commit -m "feat: add theme props to FogLayer and TokenShape"
```

---

## Task 5: MapCanvas — Wire ThemeTokens

**Files:**
- Modify: `src/components/map/MapCanvas.tsx`

Read `src/components/map/MapCanvas.tsx` fully before editing. Find every usage of `FogLayer`, `FogPreviewOutline`, and `TokenShape` in the file.

- [ ] **Step 1: Add `themeTokens` to `MapCanvas` props**

Find the `MapCanvasProps` interface in `MapCanvas.tsx`. Add:

```ts
import type { ThemeTokens } from "@/lib/themeTokens";
```

Add to the props interface:
```ts
themeTokens: ThemeTokens;
```

- [ ] **Step 2: Add stale-closure ref for `themeTokens`**

In the `MapCanvas` component body, after the existing refs (look for other `useRef` + sync `useEffect` pairs), add:

```ts
const themeTokensRef = useRef(themeTokens);
useEffect(() => { themeTokensRef.current = themeTokens; }, [themeTokens]);
```

- [ ] **Step 3: Pass theme props to `FogLayer`**

Find the `<FogLayer ... />` JSX in `MapCanvas`. Add the new props:

```tsx
<FogLayer
  // ... existing props ...
  fogColor={themeTokens.fogColor}
  fogAdminOpacity={themeTokens.fogAdminOpacity}
/>
```

- [ ] **Step 4: Pass `fogPreviewStroke` to `FogPreviewOutline`**

Find the `<FogPreviewOutline ... />` JSX. Add:

```tsx
<FogPreviewOutline
  // ... existing props ...
  fogPreviewStroke={themeTokens.fogPreviewStroke}
/>
```

- [ ] **Step 5: Pass `tokenRing` to each `TokenShape`**

Find the `<TokenShape ... />` JSX (likely inside a `.map()` over tokens). Add:

```tsx
<TokenShape
  // ... existing props ...
  tokenRing={themeTokens.tokenRing}
/>
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors now shift to `SessionView.tsx` (doesn't pass `themeTokens` to `MapCanvas` yet). Note the line.

- [ ] **Step 7: Commit**

```bash
git add src/components/map/MapCanvas.tsx
git commit -m "feat: wire themeTokens through MapCanvas to canvas children"
```

---

## Task 6: SessionView — Theme Application and Switcher

**Files:**
- Modify: `src/app/session/[id]/SessionView.tsx`

Read the full file before editing. Key areas:
- Top of component: existing `useEffect` calls
- DM tab JSX: find the fog controls section (search for `fogTool`)
- `MapCanvas` JSX call (search for `<MapCanvas`)

- [ ] **Step 1: Import `getThemeTokens`**

Add to imports at the top of `SessionView.tsx`:

```ts
import { getThemeTokens } from "@/lib/themeTokens";
```

- [ ] **Step 2: Add `useEffect` to apply `data-theme` on `session.theme` changes**

After the existing `useEffect` that calls `setSession(initialSession)`, add:

```ts
// Apply theme to <body> whenever session.theme changes; reset on unmount
useEffect(() => {
  const theme = session?.theme ?? "grimoire";
  document.body.setAttribute("data-theme", theme);
  return () => { document.body.setAttribute("data-theme", "grimoire"); };
}, [session?.theme]);
```

- [ ] **Step 3: Compute `themeTokens`**

After the `isOwner` line, add:

```ts
const themeTokens = getThemeTokens(session?.theme ?? "grimoire");
```

- [ ] **Step 4: Pass `themeTokens` to `MapCanvas`**

Find the `<MapCanvas ... />` JSX. Add the prop:

```tsx
<MapCanvas
  // ... all existing props ...
  themeTokens={themeTokens}
/>
```

- [ ] **Step 5: Add theme switcher to the DM tab**

Find the DM tab content (search for `activeTab === "dm"` or the fog controls JSX). Add a new panel **above** the fog controls:

```tsx
{/* Theme switcher */}
{isOwner && (
  <div className="bg-[var(--theme-bg-panel)] border border-[var(--theme-border)] rounded-xl p-3">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-secondary)] mb-2"
         style={{ fontFamily: "var(--theme-font-display)" }}>
      Realm Theme
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {(["grimoire", "scroll", "neon"] as const).map((t) => {
        const labels = { grimoire: "💀 Grimoire", scroll: "📜 Scroll", neon: "🔮 Arcane" };
        const active = (session?.theme ?? "grimoire") === t;
        return (
          <button
            key={t}
            onClick={async () => {
              if (!session) return;
              setSession({ ...session, theme: t });
              await createClient().from("sessions").update({ theme: t }).eq("id", sessionId);
            }}
            className={`rounded-lg py-1.5 px-1 text-[10px] font-semibold border transition-all
              ${active
                ? "bg-[var(--theme-accent-dim)]/20 border-[var(--theme-accent)] text-[var(--theme-text-primary)] shadow-[0_0_8px_var(--theme-accent-glow)]"
                : "bg-[var(--theme-bg-deep)] border-[var(--theme-border)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]"
              }`}
            style={{ fontFamily: "var(--theme-font-display)" }}
          >
            {labels[t]}
          </button>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 6: Type-check and start dev server**

```bash
npx tsc --noEmit
npm run dev
```

Open the session view. The `<body>` should have `data-theme` matching the session's theme. Switching themes in the DM tab should instantly change the accent colors on the page for all tabs.

- [ ] **Step 7: Commit**

```bash
git add src/app/session/[id]/SessionView.tsx
git commit -m "feat: apply session theme to body and add DM theme switcher"
```

---

## Task 7: Lobby Page Redesign

**Files:**
- Modify: `src/app/page.tsx`

This is a full rewrite of the JSX, keeping all existing logic (state, handlers). Read the file fully first.

- [ ] **Step 1: Add theme state and map upload state**

In the component, add after the existing `useState` declarations:

```ts
const [lobbyTheme, setLobbyTheme] = useState<"grimoire" | "scroll" | "neon">("grimoire");
const [mapFile, setMapFile] = useState<File | null>(null);

// Apply theme preview to <body> immediately when user picks a theme
useEffect(() => {
  document.body.setAttribute("data-theme", lobbyTheme);
}, [lobbyTheme]);
```

- [ ] **Step 2: Update `createSession` to include theme and optional map upload**

Replace the existing `createSession` function body. Keep the auth logic, but change the session insert and add upload:

```ts
const createSession = async () => {
  if (!nameInput.trim()) { setError("Please enter your name first."); return; }
  if (!sessionName.trim()) { setError("Session name required"); return; }
  setLoading(true);
  setError("");
  saveIdentity();

  const supabase = createClient();

  let uid = userId;
  if (!uid) {
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError) { setError(`Auth error: ${authError.message}`); setLoading(false); return; }
    uid = authData.user?.id ?? null;
    if (uid) setUserId(uid);
  }
  if (!uid) { setError("Could not authenticate. Please refresh and try again."); setLoading(false); return; }

  const { data, error: err } = await supabase
    .from("sessions")
    .insert({ name: sessionName.trim(), owner_id: uid, theme: lobbyTheme })
    .select()
    .single();

  if (err || !data) { setError(err?.message ?? "Failed to create session"); setLoading(false); return; }

  // Optional map upload
  if (mapFile) {
    const ext = mapFile.name.split(".").pop() ?? "png";
    const path = `${data.id}/map.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("maps").upload(path, mapFile);
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from("maps").getPublicUrl(path);
      await supabase.from("sessions").update({ map_url: urlData.publicUrl }).eq("id", data.id);
    }
    // Non-fatal: session still created; user can upload map from inside session
  }

  setLoading(false);
  router.push(`/session/${data.id}`);
};
```

- [ ] **Step 3: Rewrite the return JSX**

Replace the `return (...)` block entirely:

```tsx
return (
  <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
    {/* Background image */}
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{
        backgroundImage: "var(--theme-lobby-bg)",
        filter: "brightness(0.42) saturate(0.75)",
      }}
    />
    {/* Ambient overlay */}
    <div className="absolute inset-0"
      style={{ background: "radial-gradient(ellipse at 50% 100%, var(--theme-bg-deep) 0%, transparent 70%), linear-gradient(180deg, rgba(0,0,0,0.3) 0%, var(--theme-bg-deep) 100%)" }}
    />

    {/* Glassmorphism card */}
    <div className="relative z-10 w-full max-w-xs flex flex-col gap-4 rounded-xl p-6"
      style={{
        background: `color-mix(in srgb, var(--theme-bg-deep) 78%, transparent)`,
        border: "1px solid var(--theme-border-accent)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.65), 0 0 40px var(--theme-accent-glow)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `linear-gradient(145deg, var(--theme-accent-dim), var(--theme-accent))`, boxShadow: "0 0 18px var(--theme-accent-glow)", border: "1px solid var(--theme-border-accent)" }}>
          <Logo size={26} />
        </div>
        <div>
          <div className="font-bold leading-tight text-[var(--theme-text-primary)]"
            style={{ fontFamily: "var(--theme-font-display)", fontSize: "1rem" }}>
            oh-my-roll20
          </div>
          <div className="text-[0.6rem] uppercase tracking-widest text-[var(--theme-text-muted)]"
            style={{ fontFamily: "var(--theme-font-display)" }}>
            Virtual Tabletop
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, var(--theme-accent-dim) 30%, var(--theme-accent) 50%, var(--theme-accent-dim) 70%, transparent)`, opacity: 0.6 }} />

      {/* Identity */}
      <div className="flex flex-col gap-2">
        <div className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)]"
          style={{ fontFamily: "var(--theme-font-display)" }}>
          Your Name
        </div>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Adventurer"
          className="w-full px-3 py-2 rounded-md text-sm transition-all placeholder:opacity-40 focus:outline-none"
          style={{
            background: `color-mix(in srgb, var(--theme-bg-deep) 85%, transparent)`,
            border: "1px solid var(--theme-border)",
            color: "var(--theme-text-primary)",
            fontFamily: "var(--theme-font-body)",
          }}
        />
        <div className="flex gap-1.5 flex-wrap">
          {PLAYER_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColorPick(c)}
              style={{ background: c }}
              className={`w-5 h-5 rounded-full transition-all ${colorPick === c ? "scale-125 ring-2 ring-white ring-offset-1 ring-offset-[var(--theme-bg-deep)]" : "hover:scale-110 opacity-80 hover:opacity-100"}`}
            />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, var(--theme-accent-dim) 30%, var(--theme-accent) 50%, var(--theme-accent-dim) 70%, transparent)`, opacity: 0.4 }} />

      {/* Create section */}
      <div className="flex flex-col gap-2">
        <div className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)]"
          style={{ fontFamily: "var(--theme-font-display)" }}>
          New Session
        </div>
        <input
          type="text"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createSession()}
          placeholder="Campaign name"
          className="w-full px-3 py-2 rounded-md text-sm transition-all placeholder:opacity-40 focus:outline-none"
          style={{
            background: `color-mix(in srgb, var(--theme-bg-deep) 85%, transparent)`,
            border: "1px solid var(--theme-border)",
            color: "var(--theme-text-primary)",
            fontFamily: "var(--theme-font-body)",
          }}
        />

        {/* Theme picker */}
        <div className="text-[0.5rem] uppercase tracking-[0.18em] text-[var(--theme-text-muted)] mt-1 mb-0.5"
          style={{ fontFamily: "var(--theme-font-display)" }}>
          Realm Theme
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["grimoire", "scroll", "neon"] as const).map((t) => {
            const labels = { grimoire: "💀 Grimoire", scroll: "📜 Scroll", neon: "🔮 Arcane" };
            const active = lobbyTheme === t;
            return (
              <button
                key={t}
                onClick={() => setLobbyTheme(t)}
                className="rounded-md py-1.5 px-1 text-[10px] font-semibold border transition-all"
                style={{
                  fontFamily: "var(--theme-font-display)",
                  background: active ? `color-mix(in srgb, var(--theme-accent-dim) 20%, transparent)` : `color-mix(in srgb, var(--theme-bg-deep) 80%, transparent)`,
                  borderColor: active ? "var(--theme-accent)" : "var(--theme-border)",
                  color: active ? "var(--theme-text-primary)" : "var(--theme-text-muted)",
                  boxShadow: active ? "0 0 8px var(--theme-accent-glow)" : "none",
                }}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        {/* Map upload */}
        <label
          className="flex items-center gap-2 cursor-pointer rounded-md px-3 py-2 text-[0.65rem] transition-colors mt-1"
          style={{
            background: `color-mix(in srgb, var(--theme-accent-dim) 6%, transparent)`,
            border: `1px dashed color-mix(in srgb, var(--theme-border-accent) 50%, transparent)`,
            color: "var(--theme-text-secondary)",
            fontFamily: "var(--theme-font-display)",
          }}
        >
          <span>🗺️</span>
          <span>{mapFile ? mapFile.name : "Upload battle map (optional)"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setMapFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <button
          onClick={createSession}
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-bold tracking-wider uppercase transition-all active:scale-[0.98] disabled:opacity-50 mt-1"
          style={{
            background: `linear-gradient(135deg, var(--theme-accent-dim), var(--theme-accent))`,
            color: lobbyTheme === "scroll" ? "#0a0600" : "var(--theme-text-primary)",
            fontFamily: "var(--theme-font-display)",
            boxShadow: "0 0 16px var(--theme-accent-glow), 0 2px 8px rgba(0,0,0,0.4)",
            border: "1px solid color-mix(in srgb, var(--theme-border-accent) 50%, transparent)",
          }}
        >
          {loading ? "Forging…" : "Forge the Hall"}
        </button>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, var(--theme-accent-dim) 30%, var(--theme-accent) 50%, var(--theme-accent-dim) 70%, transparent)`, opacity: 0.3 }} />

      {/* Join section */}
      <div className="flex flex-col gap-2">
        <div className="text-[0.55rem] uppercase tracking-[0.2em] text-[var(--theme-text-secondary)]"
          style={{ fontFamily: "var(--theme-font-display)" }}>
          Join Session
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinSession()}
            placeholder="A3F2B9"
            className="flex-1 px-3 py-2 rounded-md text-sm font-mono tracking-widest uppercase text-center transition-all placeholder:opacity-30 focus:outline-none"
            style={{
              background: `color-mix(in srgb, var(--theme-bg-deep) 85%, transparent)`,
              border: "1px solid var(--theme-border)",
              color: "var(--theme-text-primary)",
            }}
          />
          <button
            onClick={joinSession}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-bold tracking-wider uppercase transition-all active:scale-[0.98] disabled:opacity-50"
            style={{
              background: `color-mix(in srgb, var(--theme-bg-deep) 80%, transparent)`,
              border: "1px solid var(--theme-border-accent)",
              color: "var(--theme-text-secondary)",
              fontFamily: "var(--theme-font-display)",
            }}
          >
            Enter
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  </main>
);
```

- [ ] **Step 4: Verify in browser**

```bash
npm run dev
```

- Lobby loads with Grimoire theme (dark, blood-red accents, full-bleed dark forest background)
- Clicking 📜 Scroll switches entire page live (gold tones, castle ruins background)
- Clicking 🔮 Arcane switches to violet/nebula
- The map upload row accepts an image file (file name shows after selection)
- Creating a session with a map file navigates to the session and the map is visible

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: redesign lobby with full-bleed themes, theme picker, and map upload"
```

---

## Task 8: Sidebar Components — CSS Variable Styling

Replace hard-coded Tailwind color classes with CSS variable inline styles throughout all sidebar components. Work through each file in order.

**Files:**
- Modify: `src/components/session/PresenceBar.tsx`
- Modify: `src/components/map/MapControls.tsx`

Read each file fully before editing. The pattern throughout is:
- `bg-gray-900` → `style={{ background: "var(--theme-bg-surface)" }}`
- `border-gray-700` → `style={{ borderColor: "var(--theme-border)" }}`
- `text-gray-400` → `style={{ color: "var(--theme-text-secondary)" }}`
- `text-white` → `style={{ color: "var(--theme-text-primary)" }}`
- `bg-indigo-600` → `style={{ background: "var(--theme-accent)" }}`
- `border-indigo-500` (focus/active) → `style={{ borderColor: "var(--theme-border-accent)" }}`
- Font family on headings/labels: `style={{ fontFamily: "var(--theme-font-display)" }}`

- [ ] **Step 1: Theme `PresenceBar.tsx`**

Read the file. Apply the substitution pattern above to:
- The outer container background and bottom border
- Player avatar ring color (`border-gray-800` → `var(--theme-border)`)
- Session name text color
- "Leave" / "End Session" button text colors
- Confirmation button backgrounds

- [ ] **Step 2: Theme `MapControls.tsx`**

Read the file. Apply to:
- Container background (`bg-gray-950/90` → `var(--theme-bg-surface)` with backdrop-blur retained)
- Border (`border-white/10` → `var(--theme-border)`)
- Button text colors (`text-gray-400` → `var(--theme-text-secondary)`)
- Zoom percentage text
- Divider between buttons

- [ ] **Step 3: Verify in browser**

Run dev server, open a session. Check the presence bar and map controls adopt the active theme's colors.

- [ ] **Step 4: Commit**

```bash
git add src/components/session/PresenceBar.tsx src/components/map/MapControls.tsx
git commit -m "feat: apply theme CSS vars to PresenceBar and MapControls"
```

---

## Task 9: TokenPanel Styling and Token Row Layout

This is the most complex component. Read `src/components/session/TokenPanel.tsx` fully before starting.

**Files:**
- Modify: `src/components/session/TokenPanel.tsx`

The token row must be restructured into three sections (from design):
1. **Identity row**: token circle + name + visibility/delete icons
2. **HP block**: `Hit Points` label + `48/60` right-aligned, thicker HP bar (5px), "Adjust" label + slider on one row
3. **Actions**: 1px divider, then Damage/Heal buttons + size row

- [ ] **Step 1: Theme all container, panel, and button styles**

Apply the CSS variable substitution pattern from Task 8 to:
- Outer section headers
- `bg-gray-800/60` panels → `var(--theme-bg-panel)` + `var(--theme-border)`
- Section label text (`text-[10px] uppercase tracking-wider`) → `var(--theme-text-secondary)` + `var(--theme-font-display)`
- Input fields (name input, color picker)
- Add/toggle/delete buttons
- Visibility badges (hidden → amber stays; dead → red stays — these are semantic, not theme-specific)
- Active ring on owned token (`ring-1 ring-indigo-500` → `outline: 1px solid var(--theme-accent)`)

- [ ] **Step 2: Restructure the token row HP section**

Find the token row JSX. Replace the current layout (HP text on its own line, bar, then slider immediately below) with:

```tsx
{/* HP block */}
<div>
  <div className="flex justify-between items-baseline mb-1">
    <span className="text-[0.48rem] uppercase tracking-[0.18em]"
      style={{ color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-display)" }}>
      Hit Points
    </span>
    <span className="text-[0.58rem] font-semibold"
      style={{ color: hpRatio <= 0.25 ? "#f87171" : "var(--theme-text-primary)", fontFamily: "var(--theme-font-body)" }}>
      {token.hp} / {token.max_hp}
    </span>
  </div>
  {/* Thicker HP bar */}
  <div className="h-[5px] rounded-full overflow-hidden mb-1.5"
    style={{ background: "var(--theme-border)" }}>
    <div className="h-full rounded-full transition-all"
      style={{ width: `${hpRatio * 100}%`, background: hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444" }} />
  </div>
  {/* Adjust slider with label */}
  <div className="flex items-center gap-1.5">
    <span className="text-[0.46rem] uppercase tracking-[0.1em] whitespace-nowrap"
      style={{ color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-display)" }}>
      Adjust
    </span>
    <input type="range" min={0} max={token.max_hp} value={token.hp}
      className="flex-1 h-[3px] rounded-full cursor-pointer"
      style={{ accentColor: "var(--theme-accent)" }}
      onPointerUp={async (e) => {
        // keep existing onPointerUp handler logic here
      }}
    />
  </div>
</div>
{/* Section divider */}
<div className="h-px" style={{ background: "var(--theme-border)", opacity: 0.5 }} />
{/* Actions: damage/heal + size */}
```

Keep the Damage/Heal buttons and size row below the divider, themed with CSS vars.

- [ ] **Step 3: Verify in browser**

Run dev server, open a session with tokens. Check:
- Token rows are readable and not cluttered
- HP section has clear visual separation from the actions
- "Hit Points 48/60" with the bar and "Adjust" slider are legible
- Switching themes (DM tab) updates the token panel colors

- [ ] **Step 4: Commit**

```bash
git add src/components/session/TokenPanel.tsx
git commit -m "feat: theme TokenPanel and restructure token row HP layout"
```

---

## Task 10: Dice Components Styling

**Files:**
- Modify: `src/components/dice/DiceRoller.tsx`
- Modify: `src/components/dice/DiceToast.tsx`

Read each file fully before editing.

- [ ] **Step 1: Theme `DiceRoller.tsx`**

Apply CSS variable substitution:
- Quick dice buttons: `bg-gray-800` → `var(--theme-bg-panel)`, `border-gray-700` → `var(--theme-border)`
- d20 button glow: replace hard-coded violet with `var(--theme-accent)`, keep `box-shadow` using `var(--theme-accent-glow)`
- Expression input: `bg-gray-800 border-gray-700` → CSS vars; focus border → `var(--theme-border-accent)`
- Roll button: replace violet gradient with `var(--theme-accent-dim)` → `var(--theme-accent)` gradient
- Result callout box: border and glow → `var(--theme-border-accent)` and `var(--theme-accent-glow)`
- Large result number: `text-white` → `var(--theme-text-primary)`, glow color → `var(--theme-accent-glow)`
- Roll log dividers and text colors → CSS vars

- [ ] **Step 2: Theme `DiceToast.tsx`**

Apply CSS variable substitution:
- Card background → `var(--theme-bg-surface)` with backdrop-blur retained
- Border → `var(--theme-border)`
- Result number glow → `var(--theme-accent-glow)`
- Player name and expression text → CSS vars

- [ ] **Step 3: Verify in browser**

Roll some dice. The toast notification and dice log should adopt the active theme's accent color. The d20 button's glow should be blood-red (Grimoire), gold (Scroll), or violet (Neon).

- [ ] **Step 4: Commit**

```bash
git add src/components/dice/DiceRoller.tsx src/components/dice/DiceToast.tsx
git commit -m "feat: apply theme CSS vars to dice components"
```

---

## Task 11: Full Build Verification and AGENTS.md Update

- [ ] **Step 1: Full TypeScript build**

```bash
npm run build
```

Expected: exits 0 with no type errors. Fix any remaining type errors (usually prop mismatches from the canvas changes) before proceeding.

- [ ] **Step 2: End-to-end manual test**

Start `npm run dev`. Test the following scenarios:

| Scenario | Expected |
|---|---|
| Lobby loads fresh | Grimoire theme active — dark, blood-red, misty forest background |
| Pick 📜 Scroll in lobby | Page instantly switches to gold tones + castle background |
| Pick 🔮 Arcane in lobby | Page instantly switches to violet + nebula background |
| Create session (no map) | Session created, navigate to session view with chosen theme |
| Create session (with map) | Map uploaded and visible on canvas after navigation |
| Join session | Joins with whatever theme the DM set |
| DM switches theme in session | All three tabs (DM, Tokens, Dice), canvas fog, token rings all switch instantly |
| Player sees theme switch in real-time | Open two browser tabs: one DM, one player. DM switches theme, player tab updates |
| Fog painting | Reveal/hide fog works; preview outline uses theme accent color |
| Token HP controls | HP bar, "Adjust" slider, Damage/Heal all visible with clear separation |
| d20 roll | Toast and result box glow in theme accent color |

- [ ] **Step 3: Update AGENTS.md**

Add a new section to `AGENTS.md` documenting the theme system, following the existing documentation style. Add after the "Token icons" section:

```markdown
### Theme system

Three named themes (Obsidian Grimoire / Arcane Scroll / Arcane Neon) are stored as `session.theme` (text, CHECK constraint) and propagate to all clients via the existing `postgres_changes` sessions handler.

**CSS layer:** `[data-theme]` attribute blocks in `globals.css` define all `--theme-*` CSS custom properties. `layout.tsx` sets `data-theme="grimoire"` on `<body>` as the default. A `useEffect` in `SessionView` overrides it to `session.theme` on mount and on change.

**Canvas layer:** `src/lib/themeTokens.ts` exports `getThemeTokens(theme): ThemeTokens` — a pure lookup function returning `fogColor`, `fogAdminOpacity`, `fogPreviewStroke`, and `tokenRing`. `SessionView` calls this and passes the result as a `themeTokens` prop to `MapCanvas`. `MapCanvas` mirrors it in `themeTokensRef` for stale-closure safety.

**DM theme switcher:** In the DM tab, three buttons update `session.theme` optimistically via `setSession` then `await supabase.from('sessions').update(...)`.

**Pitfalls:**
- Never hardcode Tailwind color classes in components — use `var(--theme-*)` inline styles or CSS var references
- The `fogColor` value replaces the hardcoded `"#0f172a"` fill in **all three** fog Rect usages in `FogLayer` (base rect + hide-zone rects)
- `FogPreviewOutline` has a separate `fogPreviewStroke` prop — do not use `fogColor` for it
- Semantic colors (HP green/yellow/red, damage red, heal green) are **not** theme-specific and must not be replaced by theme vars
```

- [ ] **Step 4: Final commit**

```bash
git add AGENTS.md
git commit -m "docs: document theme system in AGENTS.md"
```
