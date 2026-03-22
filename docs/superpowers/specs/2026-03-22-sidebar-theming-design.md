# Sidebar Theming Design

**Date:** 2026-03-22
**Status:** Approved

## Summary

Apply the app's existing three-theme system (Obsidian Grimoire / Arcane Scroll / Arcane Neon) to the right sidebar. The `TokenPanel` and `DiceRoller` components are already fully themed via CSS variables. The gap is `SessionView.tsx`: the sidebar shell, tab bar, and all DM tab panels still use hardcoded Tailwind `bg-gray-*` / `text-gray-*` / `border-indigo-*` classes that don't respond to theme changes.

## Scope

### Files to change

| File | What changes |
|---|---|
| `src/app/session/[id]/SessionView.tsx` | Replace hardcoded gray/indigo Tailwind classes with `var(--theme-*)` inline styles throughout the sidebar shell and DM tab |
| `src/components/session/TokenPanel.tsx` | Replace `text-indigo-400` ("you" badge) with `var(--theme-accent)` |

### What does NOT change

- `TokenPanel.tsx` and `DiceRoller.tsx` structure and logic — already themed
- Semantic status colors: green ("Reveal area"), red ("Hide area"), HP bar gradient, "Dead" badge red, "Hidden" badge amber, amber at-limit warning, red error text — these carry functional meaning and must stay fixed regardless of theme
- All layout, spacing, and non-color Tailwind classes
- Functionality of every control

## Color mapping

| Current hardcoded class | Replacement |
|---|---|
| `bg-gray-900`, `bg-gray-900/80` | `var(--theme-bg-deep)` |
| `bg-gray-800/60`, `bg-gray-800` | `var(--theme-bg-panel)` |
| `border-gray-800`, `border-gray-700`, `border-gray-700/40` | `var(--theme-border)` |
| `text-gray-400`, `text-gray-500` (section labels/desc) | `var(--theme-text-secondary)` / `var(--theme-text-muted)` |
| `text-gray-300`, `text-gray-100` (values/counts) | `var(--theme-text-primary)` |
| `text-gray-600` (de-emphasized) | `var(--theme-text-muted)` |
| `text-indigo-300` (join code) | `var(--theme-text-primary)` + display font |
| `text-indigo-400` (fog hint, "you" badge) | `var(--theme-text-secondary)` / `var(--theme-accent)` |
| `bg-indigo-500/60`, `bg-indigo-500` (resize handle hover/active) | `var(--theme-accent-glow)` / `var(--theme-accent)` |
| `border-indigo-500` (active tab underline) | `var(--theme-tab-border)` |
| `text-white` (active tab text) | `var(--theme-text-primary)` |
| `bg-indigo-700`, `bg-indigo-600` (ON buttons, scope-toggle active) | `var(--theme-accent)` |
| `bg-gray-700 hover:bg-gray-600` (inactive/secondary buttons) | `var(--theme-bg-deep)` + `var(--theme-border)` with hover via `var(--theme-border-accent)` |
| `accent-indigo-500` (range slider thumb) | CSS `accent-color: var(--theme-accent)` |

### Section labels

Section labels (`🔗 Invite Code`, `🌫️ Fog of War`, etc.) should gain `fontFamily: "var(--theme-font-display)"` to match the theme's display font, consistent with how the Tokens tab and Dice tab header already use it.

## What stays in semantic colors (no change)

- `bg-green-700 text-white` — active "Reveal area" fog button
- `bg-red-800 text-white` — active "Hide area" fog button
- `bg-gray-800 text-gray-600` — disabled fog button state (intentionally muted)
- `text-amber-400` — at-limit warning
- `text-red-400` — error messages
- HP bar green/yellow/red gradient

## Constraints

- Do not alter any event handlers, logic, or component props
- Do not add new CSS classes or modify `globals.css`
- Do not redesign layout or change spacing/sizing
- Inline `style={{}}` props are preferred over Tailwind arbitrary CSS-variable shorthand for consistency with the rest of the themed code
