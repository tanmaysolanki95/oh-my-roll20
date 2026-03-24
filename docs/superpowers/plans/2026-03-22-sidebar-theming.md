# Sidebar Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded Tailwind gray/indigo color classes in the right sidebar with CSS variable inline styles so the sidebar responds to the active theme.

**Architecture:** Pure styling change — swap hardcoded `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-indigo-*` Tailwind classes for `style={{ ... }}` props referencing `var(--theme-*)` CSS variables. No logic, layout, or spacing changes. Two files only.

**Tech Stack:** React, Next.js App Router, Tailwind CSS v4, CSS custom properties (`var(--theme-*)`), inline `style` props

---

## File Map

| File | Change |
|---|---|
| `src/app/session/[id]/SessionView.tsx` | Replace hardcoded gray/indigo classes throughout sidebar shell + DM tab panels |
| `src/components/session/TokenPanel.tsx` | Replace `text-indigo-400` on "you" badge with `style={{ color: "var(--theme-accent)" }}` |

---

## Semantic Colors — Do NOT Change

These carry functional meaning and must stay hardcoded regardless of theme:

| Usage | Current class | Keep as-is |
|---|---|---|
| Fog "Reveal area" active | `bg-green-700 text-white` | yes |
| Fog "Hide area" active | `bg-red-800 text-white` | yes |
| Fog/fog button disabled | `bg-gray-800 text-gray-600 cursor-not-allowed` | yes |
| At-limit warning | `text-amber-400` | yes |
| Map upload error | `text-red-400` | yes |
| "Dead" badge | `bg-red-950/60 text-red-400 border-red-800/50` | yes |
| "Hidden" badge | `bg-amber-950/60 text-amber-400 border-amber-800/50` | yes |

---

## Task 1: Sidebar shell and tab bar (`SessionView.tsx`)

**Files:**
- Modify: `src/app/session/[id]/SessionView.tsx` (lines ~305–338)

No unit tests exist for CSS class usage — verify visually by running the dev server and switching themes.

- [ ] **Step 1: Update the resize handle**

Find (line ~307):
```tsx
className="w-1 shrink-0 cursor-col-resize bg-gray-800 hover:bg-indigo-500/60 active:bg-indigo-500 transition-colors"
```
Replace with:
```tsx
className="w-1 shrink-0 cursor-col-resize transition-colors hover:opacity-80 active:opacity-100"
style={{ background: "var(--theme-accent)" }}
```

- [ ] **Step 2: Update the sidebar wrapper**

Find (line ~320):
```tsx
<div className="shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col" style={{ width: sidebarWidth }}>
```
Replace with:
```tsx
<div
  className="shrink-0 flex flex-col border-l"
  style={{ width: sidebarWidth, background: "var(--theme-bg-deep)", borderColor: "var(--theme-border)" }}
>
```

- [ ] **Step 3: Update the tab bar container**

Find (line ~323):
```tsx
<div className="flex border-b border-gray-800 bg-gray-900/80 shrink-0 overflow-x-auto">
```
Replace with:
```tsx
<div
  className="flex shrink-0 overflow-x-auto border-b"
  style={{ background: "var(--theme-bg-surface)", borderColor: "var(--theme-border)" }}
>
```

- [ ] **Step 4: Update the tab buttons**

Find (lines ~325–336):
```tsx
className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
  activeTab === tab.id
    ? "border-indigo-500 text-white"
    : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
}`}
```
Replace with a style-based approach. Remove color classes from className and add inline style:
```tsx
className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap"
style={
  activeTab === tab.id
    ? { borderColor: "var(--theme-tab-border)", color: "var(--theme-text-primary)", fontFamily: "var(--theme-font-display)" }
    : { borderColor: "transparent", color: "var(--theme-text-muted)" }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/session/[id]/SessionView.tsx
git commit -m "style: theme sidebar shell and tab bar"
```

---

## Task 2: DM tab — Invite Code and Battle Map panels

**Files:**
- Modify: `src/app/session/[id]/SessionView.tsx` (lines ~347–373)

- [ ] **Step 1: Update the shared panel card style**

Both the Invite Code and Battle Map panels use `className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3"`. Update each to:
```tsx
className="rounded-xl p-3 border"
style={{ background: "var(--theme-bg-panel)", borderColor: "var(--theme-border)" }}
```

- [ ] **Step 2: Update section label style** (both panels)

`className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5"`
→
```tsx
className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--theme-font-display)" }}
```

- [ ] **Step 3: Update description text** (both panels)

`className="text-[11px] text-gray-500 mb-2"`
→
```tsx
className="text-[11px] mb-2"
style={{ color: "var(--theme-text-muted)" }}
```

- [ ] **Step 4: Update the join code display**

`className="font-mono text-lg font-black text-indigo-300 tracking-widest flex-1"`
→
```tsx
className="font-mono text-lg font-black tracking-widest flex-1"
style={{ color: "var(--theme-text-primary)", fontFamily: "var(--theme-font-display)" }}
```

- [ ] **Step 5: Update the Copy button**

`className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors shrink-0"`
→
```tsx
className="text-xs px-2.5 py-1 rounded-lg transition-colors shrink-0 border"
style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-secondary)", borderColor: "var(--theme-border)" }}
```

- [ ] **Step 6: Update the map upload zone**

The dashed upload zone has two states. Replace:
```tsx
className={`w-full py-2 px-3 border border-dashed rounded-lg text-center text-xs transition-colors ${
  mapUploading ? "border-indigo-500/50 text-indigo-400 bg-indigo-950/20" : "border-gray-600 text-gray-400 hover:border-indigo-500/60 hover:text-gray-200 bg-gray-900/40"
}`}
```
With a style prop for color values (keep `border-dashed` and layout classes):
```tsx
className="w-full py-2 px-3 border border-dashed rounded-lg text-center text-xs transition-colors"
style={
  mapUploading
    ? { borderColor: "var(--theme-border-accent)", color: "var(--theme-text-secondary)", background: "transparent" }
    : { borderColor: "var(--theme-border)", color: "var(--theme-text-muted)", background: "transparent" }
}
```

- [ ] **Step 7: Update the "Map loaded" confirmation text**

`className="text-[11px] text-gray-600 mt-1.5"`
→
```tsx
className="text-[11px] mt-1.5"
style={{ color: "var(--theme-text-muted)" }}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/session/[id]/SessionView.tsx
git commit -m "style: theme Invite Code and Battle Map panels"
```

---

## Task 3: DM tab — Fog of War panel

**Files:**
- Modify: `src/app/session/[id]/SessionView.tsx` (lines ~409–495)

- [ ] **Step 1: Panel card, label, description** — same pattern as Task 2.

- [ ] **Step 2: Fog ON/OFF toggle button**

```tsx
// Before
className={`w-full py-1.5 rounded-lg text-xs font-bold mb-2 transition-colors ${
  session?.fog_enabled
    ? "bg-indigo-700 hover:bg-indigo-600 text-white"
    : "bg-gray-700 hover:bg-gray-600 text-gray-300"
}`}

// After — remove color classes, add style
className="w-full py-1.5 rounded-lg text-xs font-bold mb-2 transition-colors"
style={
  session?.fog_enabled
    ? { background: "var(--theme-accent)", color: "var(--theme-text-primary)", boxShadow: "0 0 8px var(--theme-accent-glow)" }
    : { background: "var(--theme-bg-panel)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-border)" }
}
```

- [ ] **Step 3: Fog Reveal/Hide buttons** — these are **semantic** and must stay green/red when active. Only update the inactive state and disabled state:

```tsx
// Reveal button — active state stays bg-green-700; only change inactive + disabled:
// disabled:
className={`py-2 rounded-lg text-xs font-bold transition-colors ${
  fogAtLimit
    ? "bg-gray-800 text-gray-600 cursor-not-allowed"   // ← KEEP as-is (intentionally muted)
    : fogTool === "reveal"
      ? "bg-green-700 text-white"                       // ← KEEP as-is (semantic green)
      : "bg-gray-700 hover:bg-gray-600 text-gray-300"  // ← replace inactive
}`}

// Replace only the inactive branch:
// "bg-gray-700 hover:bg-gray-600 text-gray-300" → use style prop for inactive
```

Refactor both buttons to split className from style:
```tsx
<button
  onClick={...}
  disabled={fogAtLimit}
  className={`py-2 rounded-lg text-xs font-bold transition-colors ${
    fogAtLimit ? "bg-gray-800 text-gray-600 cursor-not-allowed"
    : fogTool === "reveal" ? "bg-green-700 text-white"
    : ""
  }`}
  style={
    !fogAtLimit && fogTool !== "reveal"
      ? { background: "var(--theme-bg-panel)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-border)" }
      : {}
  }
  title={...}
>
  👁 Reveal area
</button>

<button
  onClick={...}
  disabled={fogAtLimit}
  className={`py-2 rounded-lg text-xs font-bold transition-colors ${
    fogAtLimit ? "bg-gray-800 text-gray-600 cursor-not-allowed"
    : fogTool === "hide" ? "bg-red-800 text-white"
    : ""
  }`}
  style={
    !fogAtLimit && fogTool !== "hide"
      ? { background: "var(--theme-bg-panel)", color: "var(--theme-text-secondary)", border: "1px solid var(--theme-border)" }
      : {}
  }
  title={...}
>
  🌑 Hide area
</button>
```

- [ ] **Step 4: Active tool hint text**

`className="text-[11px] text-indigo-400 text-center mb-2"`
→
```tsx
className="text-[11px] text-center mb-2"
style={{ color: "var(--theme-text-secondary)" }}
```

- [ ] **Step 5: Fog op counter**

`className="text-[11px] text-gray-500"`
→
```tsx
className="text-[11px]"
style={{ color: "var(--theme-text-muted)" }}
```

- [ ] **Step 6: Undo button**

`className="text-xs px-2.5 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white rounded-lg transition-colors"`
→
```tsx
className="text-xs px-2.5 py-1 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors border"
style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-secondary)", borderColor: "var(--theme-border)" }}
```

- [ ] **Step 7: Reset all fog zones button**

`className="w-full py-1.5 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-colors"`
→
```tsx
className="w-full py-1.5 rounded-lg text-xs transition-colors border"
style={{ color: "var(--theme-text-muted)", borderColor: "var(--theme-border)", background: "transparent" }}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/session/[id]/SessionView.tsx
git commit -m "style: theme Fog of War panel"
```

---

## Task 4: DM tab — Token Size, Player Limit, Grid panels

**Files:**
- Modify: `src/app/session/[id]/SessionView.tsx` (lines ~497–586)

- [ ] **Step 1: All three panel card wrappers** — same pattern (Task 2, Step 1).

- [ ] **Step 2: All section labels and descriptions** — same pattern (Task 2, Steps 2–3).

- [ ] **Step 3: Lock all / Unlock all button (Token Size)**

`className="w-full py-1.5 rounded-lg text-xs font-bold mb-3 transition-colors bg-gray-700 hover:bg-gray-600 text-gray-300"`
→
```tsx
className="w-full py-1.5 rounded-lg text-xs font-bold mb-3 transition-colors border"
style={{ background: "var(--theme-bg-panel)", color: "var(--theme-text-secondary)", borderColor: "var(--theme-border)" }}
```

- [ ] **Step 4: Scope toggle (All tokens / Players only)**

Container border: `className="flex rounded-lg overflow-hidden border border-gray-700 text-xs mb-3"`
→ `className="flex rounded-lg overflow-hidden text-xs mb-3 border"` + `style={{ borderColor: "var(--theme-border)" }}`

Active/inactive button:
```tsx
// Before
className={`flex-1 py-1.5 font-medium transition-colors ${
  tokenSizeScope === s ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
}`}

// After
className="flex-1 py-1.5 font-medium transition-colors"
style={
  tokenSizeScope === s
    ? { background: "var(--theme-accent)", color: "var(--theme-text-primary)" }
    : { background: "var(--theme-bg-deep)", color: "var(--theme-text-muted)" }
}
```

- [ ] **Step 5: Slider**

`className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"`
→
```tsx
className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
style={{ background: "var(--theme-border)", accentColor: "var(--theme-accent)" } as React.CSSProperties}
```

Slider min/max labels: `text-gray-600` → `style={{ color: "var(--theme-text-muted)" }}`

Slider value display: `text-gray-400` → `style={{ color: "var(--theme-text-secondary)" }}`

- [ ] **Step 6: Player Token Limit — stepper buttons and value**

Stepper buttons (`bg-gray-700 hover:bg-gray-600 text-white`):
```tsx
className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors border"
style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-primary)", borderColor: "var(--theme-border)" }}
```

Value span (`text-gray-100`): `style={{ color: "var(--theme-text-primary)" }}`

"per player" label (`text-gray-500`): `style={{ color: "var(--theme-text-muted)" }}`

- [ ] **Step 7: Grid — ON/OFF button**

The grid defaults to ON when `session?.grid_enabled` is undefined. Treat `session?.grid_enabled ?? true` as the active check:

```tsx
// Before
className={`w-full py-1.5 rounded-lg text-xs font-bold mb-3 transition-colors ${
  (session?.grid_enabled ?? true)
    ? "bg-indigo-700 hover:bg-indigo-600 text-white"
    : "bg-gray-700 hover:bg-gray-600 text-gray-300"
}`}

// After
className="w-full py-1.5 rounded-lg text-xs font-bold mb-3 transition-colors"
style={
  (session?.grid_enabled ?? true)
    ? { background: "var(--theme-accent)", color: "var(--theme-text-primary)", boxShadow: "0 0 8px var(--theme-accent-glow)" }
    : { background: "var(--theme-bg-panel)", color: "var(--theme-text-muted)", border: "1px solid var(--theme-border)" }
}
```

- [ ] **Step 8: Grid — cell size stepper buttons and labels**

The stepper is inside `{(session?.grid_enabled ?? true) && (...)}` — the wrapper is conditional but the styling inside is the same pattern as the Player Token Limit stepper:

```tsx
// Stepper buttons — both − and +
className="w-7 h-7 flex items-center justify-center rounded-lg text-base transition-colors border"
style={{ background: "var(--theme-bg-deep)", color: "var(--theme-text-primary)", borderColor: "var(--theme-border)" }}

// Value span  (was text-gray-100)
style={{ color: "var(--theme-text-primary)" }}

// "cell size" label  (was text-gray-500)
style={{ color: "var(--theme-text-muted)" }}
```

- [ ] **Step 9: Commit**

```bash
git add src/app/session/[id]/SessionView.tsx
git commit -m "style: theme Token Size, Player Limit, and Grid panels"
```

---

## Task 5: TokenPanel — "you" badge

**Files:**
- Modify: `src/components/session/TokenPanel.tsx` (line ~333)

- [ ] **Step 1: Replace the hardcoded indigo badge**

Find:
```tsx
<span className="text-xs text-indigo-400 shrink-0">you</span>
```
Replace with:
```tsx
<span className="text-xs shrink-0" style={{ color: "var(--theme-accent)" }}>you</span>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/session/TokenPanel.tsx
git commit -m "style: theme 'you' badge in TokenPanel"
```

---

## Task 6: Verify

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open a session and switch between all 3 themes**

In the DM tab, click each theme button (💀 Grimoire, 📜 Scroll, 🔮 Arcane). Confirm:
- Sidebar background, tab bar, and tab underline shift to theme colors
- All DM panel cards pick up the theme tint
- Section labels use display font
- "Fog ON", "Grid ON", scope-toggle active use theme accent color
- Green "Reveal" / Red "Hide" fog buttons stay green/red
- Dead/Hidden/amber badges are unchanged
- Tokens tab and Dice tab look the same as before

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.
