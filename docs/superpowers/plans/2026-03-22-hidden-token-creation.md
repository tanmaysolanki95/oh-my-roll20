# Hidden Token Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Hide Token" checkbox to the DM's add token form so tokens can be created already hidden from players.

**Architecture:** Single state variable `startHidden` added to `TokenPanel`. Checkbox is DM-only (`isOwner`). Insert payload conditionally includes `visible: false` using the same spread-conditional pattern already used for `owner_id`. State persists between additions (not reset on add).

**Tech Stack:** React (useState), Supabase JS v2, Tailwind/CSS vars for theming.

---

### Task 1: Add "Hide Token" checkbox to the add token form

**Files:**
- Modify: `src/components/session/TokenPanel.tsx`

- [ ] **Step 1: Add `startHidden` state**

In `TokenPanel`, alongside the other `useState` declarations (around line 33), add:

```ts
const [startHidden, setStartHidden] = useState(false);
```

- [ ] **Step 2: Add checkbox to the add form**

In the add token form (`canAdd && adding` block), insert a checkbox row between the color swatches `</div>` and `<IconPicker .../>` (around line 257):

```tsx
{isOwner && (
  <label className="flex items-center gap-2 cursor-pointer select-none">
    <input
      type="checkbox"
      checked={startHidden}
      onChange={(e) => setStartHidden(e.target.checked)}
      className="rounded"
      style={{ accentColor: "var(--theme-accent)" }}
    />
    <span
      className="text-xs"
      style={{ color: startHidden ? "#fbbf24" : "var(--theme-text-secondary)" }}
    >
      Hide Token
    </span>
  </label>
)}
```

- [ ] **Step 3: Include `visible` in the insert payload**

In `addToken()`, add the conditional field to the insert object after the `image_url` field (around line 79):

```ts
...(isOwner ? { visible: !startHidden } : {}),
```

The full insert block should look like:

```ts
const { data, error } = await supabase
  .from("tokens")
  .insert({
    session_id: sessionId,
    name: name.trim(),
    color,
    hp: maxHp,
    max_hp: maxHp,
    x: spawn.x,
    y: spawn.y,
    size: session?.token_size ?? 56,
    image_url: iconPath,
    ...(isOwner ? { visible: !startHidden } : {}),
    ...(!isOwner && userId ? { owner_id: userId } : {}),
  })
  .select()
  .single();
```

- [ ] **Step 4: Do NOT reset `startHidden` in the post-add cleanup**

The post-add reset block (after `if (data) upsertToken(data)`) resets `name`, `maxHp`, `iconPath`, and calls `setAdding(false)`. Leave `startHidden` out of this block — its state should survive across form opens.

Verify the cleanup block looks like this (no `setStartHidden` call):

```ts
setName("");
setMaxHp(10);
setIconPath(null);
setAdding(false);
```

- [ ] **Step 5: Manual smoke test**

1. Run `npm run dev`
2. Create a session as DM
3. Click "+ Add" — verify "Hide Token" checkbox appears only for DM, not for a player in another browser tab
4. Check "Hide Token", add a token — verify it appears in the DM's token list with the dashed border + "Hidden" badge
5. Open the form again — verify "Hide Token" is still checked
6. In the player tab — verify the hidden token does NOT appear
7. Uncheck "Hide Token", add another token — verify it appears for both DM and player

- [ ] **Step 6: Commit**

```bash
git add src/components/session/TokenPanel.tsx
git commit -m "feat: allow DM to create tokens as hidden"
```
