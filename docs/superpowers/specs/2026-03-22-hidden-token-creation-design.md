# Hidden Token Creation

**Date:** 2026-03-22
**Status:** Approved

## Summary

DMs can create tokens in a hidden state directly from the add token form, without needing to toggle visibility after creation. The "Hide Token" checkbox sticks between additions so DMs can rapidly add multiple hidden NPCs.

## Scope

Single file change: `src/components/session/TokenPanel.tsx`. No DB migration required — the `visible` column already exists with a default of `true`.

## Design

### State

Add one piece of local state to `TokenPanel`:

```ts
const [startHidden, setStartHidden] = useState(false);
```

This is **not** reset after `addToken()` completes, so it persists across multiple additions in the same form session.

### UI

In the add token form, below the color swatches and above the `IconPicker`, render a checkbox row — **DM-only** (`isOwner`):

```
☐ Hide Token
```

- Label: `"Hide Token"` — matches the existing Hide/Show button language in the token list
- When checked: label/checkbox tinted amber (`text-amber-400`) to visually signal the token will be hidden
- When unchecked: muted secondary color

### Insert payload

Pass `visible: !startHidden` in the `addToken()` insert:

```ts
visible: !startHidden,
```

### Cleanup

`startHidden` is intentionally excluded from the post-add reset block. Name, maxHp, and iconPath reset; startHidden does not.

## What does NOT change

- No new DB column or migration
- No change to the token list, MapCanvas, or any other component
- Players never see this control (`isOwner` guard)
- The existing Hide/Show toggle in the token list is unchanged
