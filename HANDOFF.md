# rome-pathfinding — Session Handoff

**Branch:** `feat/ui-polish`  
**As of commit:** `4cafe0c` (feat: antislop redesign)  
**Date:** 2026-10-08  
**Next session task:** Tab system — move Guide into a separate tab

---

## What's done (this branch)

Phase 1 polish + Phase 2 redesign are complete:

- Dark mode default (always starts dark, toggle to light)
- Header: no gradient, no purple `2px` accent border → `1px border-border`
- Query bar: 2 intentional rows — route row (`From → To`) + algo row (`A vs B`)
- Toolbar: legend on own first row, all controls (overlays + playback + speed) on single compact second row
- Guide callouts: colored left stripes removed → neutral `code-bg` rounded boxes
- Peak memory row moved next to Generated in comparison table
- Vite starter leftovers removed from `index.css`

**Algorithm files are locked** — never touch: `search.ts`, `astar*.ts`, `alt.ts`, `heuristic*.ts`, `ucs.ts`, `biucs.ts`, `bfs.ts`, `dfs.ts`, `greedy.ts`.

---

## Next task: Tab system

### Desired end state

Two tabs (full-width bar below the toolbar, above the map):

| Tab | Content |
|-----|---------|
| **Map** | Everything on the current Map tab: query bar, toolbar, map visualization, comparison panel — unchanged |
| **Guide** | Guide content full-page (currently a slide-in sidebar overlay). All 8 sections stay (professor requires them). |

The Guide sidebar overlay is **removed entirely**. The tab is the only way to reach the Guide.

### What to remove

In `src/App.tsx`:
- `sidebarOpen` state (`useState` at line ~754) — delete
- `setSidebarOpen` — delete
- `<Guide open={sidebarOpen} onClose={() => setSidebarOpen(false)} />` (line ~1110) — delete this render
- The `<button className="sidebar-toggle">` with `<BookOpen>` inside `<h1>` (lines ~1113–1121) — delete
- `BookOpen` from the lucide-react import (line 2)
- `import { Guide } from '@/components/Guide'` (line 22) — keep import, just change usage

In `src/App.css`:
- The `.guide` overlay CSS block (position: fixed, transition, slide-in behavior)
- `.app-shell` layout that accounts for sidebar width
- `.sidebar-toggle` button styles
- Keep all `.guide-section`, `.guide-note`, `.guide-try`, `.guide-toc`, `.guide-heading` etc. — these are content styles that still apply

In `src/components/Guide.tsx`:
- Remove props: `open: boolean`, `onClose: () => void`
- Remove the `<button>` close button (the `<X>` icon button at the top)
- Remove `aria-hidden={!open}`, `aria-modal`, overlay semantics
- The outer wrapper should just be `<div className="guide-page">` (new class, full-page layout)
- Keep all section content unchanged

### What to add

**Tab state in App.tsx:**
```tsx
type AppTab = 'map' | 'guide'
const [tab, setTab] = useState<AppTab>('map')
```

**Tab bar JSX** — insert between toolbar and `<div className="workspace">`:
```tsx
<div className="tab-bar" role="tablist">
  <button
    role="tab"
    className={`tab-btn${tab === 'map' ? ' tab-btn-active' : ''}`}
    aria-selected={tab === 'map'}
    onClick={() => setTab('map')}
  >Map</button>
  <button
    role="tab"
    className={`tab-btn${tab === 'guide' ? ' tab-btn-active' : ''}`}
    aria-selected={tab === 'guide'}
    onClick={() => setTab('guide')}
  >Guide</button>
</div>
```

**Conditional render** — wrap the workspace in a condition:
```tsx
{tab === 'map' && (
  <div className={`workspace${statsInSidebar ? ' workspace-fit' : ''}`}>
    {/* existing map + statsPanel content */}
  </div>
)}
{tab === 'guide' && (
  <div className="guide-page-wrap">
    <Guide />
  </div>
)}
```

**Tab bar CSS** (add to App.css):
```css
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  padding: 0 var(--sp-6);
  background: var(--bg);
}

.tab-btn {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  margin-bottom: -1px; /* sit on top of tab-bar border */
}

.tab-btn:hover { color: var(--text-h); }

.tab-btn-active {
  color: var(--text-h);
  border-bottom-color: var(--map-accent);
}
```

**Guide page CSS** (add to App.css):
```css
.guide-page-wrap {
  overflow-y: auto;
  height: calc(100svh - /* header + query-bar + toolbar + tab-bar heights */);
  max-width: 740px;
  margin: 0 auto;
  padding: var(--sp-6);
}
```
Measure actual heights at runtime rather than hardcoding — or use `flex: 1; overflow-y: auto` on the wrap inside a flex column container.

---

## Key file map

| File | Role | Touch? |
|------|------|--------|
| `src/App.tsx` | Main shell, all state, renders tabs | Yes |
| `src/components/Guide.tsx` | Guide content, 8 sections | Yes — remove overlay props/button |
| `src/App.css` | All custom CSS | Yes — remove sidebar, add tab styles |
| `src/index.css` | Global tokens + Tailwind + shadcn tokens | Only if token changes needed |
| `src/search.ts` | SearchResult type, reconstructPath | **LOCKED** |
| `src/components/Tex.tsx` | KaTeX wrapper | No |

---

## Token system (important)

Two parallel token sets — both must stay in sync for dark mode:

**Custom app tokens** (in `src/App.css` `:root` and `:root.dark`):
- `--text`, `--text-h`, `--bg`, `--surface`, `--border`, `--code-bg`
- `--map-accent: #9d2ff5` (lane A purple), `--lane-b` (teal)
- `--sp-2` through `--sp-8` (spacing scale)

**shadcn tokens** (in `src/index.css` `:root` and `.dark`):
- `--background`, `--foreground`, `--border`, `--muted`, `--card`, etc.
- Mapped to Tailwind via `@theme inline` block

Dark mode is class-based — `<html class="dark">` — not `prefers-color-scheme`.

---

## Antislop rules to keep enforcing

- No colored left stripes as decoration (guide callouts already fixed)
- Tab active indicator: `border-bottom: 2px solid var(--map-accent)` is OK — it's a navigation state marker, not decoration (R-31)
- No pill tabs, no gradient tab backgrounds
- Glass dose cap ≤ 2 elements (currently 0, keep it that way)
- No endless animations

---

## Dev setup

```bash
cd ~/Code/rome-pathfinding
bun install          # if fresh clone
bun run dev          # localhost:5173
bun run build        # type-check + bundle
```

shadcn style: `base-nova`. Installed components: Button, Card, CardContent, Select, Slider.  
Add more: `bunx shadcn add <component>`.

Screenshots for verification:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --disable-gpu --window-size=1440,900 \
  --screenshot=/tmp/check.png http://localhost:5173
```

---

## Gotchas

1. **`statsInSidebar` logic** — currently `merged && isWide` (line ~761). When tab system is added, also check `tab === 'map'` so it doesn't compute for guide tab.
2. **`sidebarOpen` removal** — search for ALL uses before deleting; there may be a `useEffect` or `body` class toggle tied to it in App.css.
3. **Guide.tsx `open` prop** — currently `Guide` is typed with `{ open: boolean; onClose: () => void }`. After removal, the component takes no props. Update the type at the top of Guide.tsx.
4. **`.app-shell` layout** — currently adjusts margin for the sidebar. After removing sidebar, simplify `.app-shell` to just `display: flex; flex-direction: column; min-height: 100svh;`.
5. **Headless screenshot shows initial paint** — to verify Guide tab, open `localhost:5173` in a real browser and click Guide tab manually.
