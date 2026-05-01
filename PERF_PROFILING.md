# Profiling the 2000-node mount

The benchmark shows a 3.7s render at 2000 nodes. That's the user-felt
"several seconds until I can do something." Scroll FPS at the same scale
is misleading (the test scrolls at ~67,000 px/s — 13× faster than any
human). Mount time is the real problem, and DevTools is the only tool
that will tell us what to fix.

## Recording the trace

1. Open `http://localhost:5173/perftest` in Chrome with DevTools open.
2. **DevTools > Performance** tab.
3. Settings cog: enable **Screenshots**, set CPU throttling to **No
   throttling**, Network to **No throttling**.
4. Click **2000** in the perf controls (sets `node_count` to 2000).
5. Press **Record** (the circle icon).
6. Click **Apply & Measure**.
7. Wait until the **Render** metric appears in the controls bar
   (apply_settings sets `render_ms` after the mount + 2 RAFs +
   100ms settle). That's your signal that mount finished. Then wait
   ~2 more seconds so initial IO callbacks land in the trace.
8. Press **Stop**.

You'll see a flame chart of the recording. The recording is dominated
by one giant task (the mount), then a quieter idle period.

## What to look for

In the **Bottom-Up** tab below the flame chart, group by **Activity**
and sort by **Total Time**. The categories that matter:

| Activity                    | What it means                                    |
|-----------------------------|--------------------------------------------------|
| Scripting                   | All JS — Svelte runtime + your code              |
| Rendering / Layout          | CSS layout (anchor positioning lives here)       |
| Painting                    | Compositing                                      |
| GC / Garbage Collection     | V8 freeing memory                                |
| Recalculate Style           | Style invalidation from class/attribute changes  |

**Scripting > 50% of total** → bottleneck is JS. Drill in:
- Switch to **Call Tree**, expand `make_session` → `apply_op` chain →
  attribute time to Session work vs render. If Session ops dominate,
  the doc-build (`generate_document` in perftest) or Session
  construction is the issue, not Svelte.
- Look for `mount_component`, `init`, `create_block` — these are
  Svelte's per-component setup. If 1500-3000 components are mounting,
  expect ~30-50% of script time here. Per-component cost = total / N.
- Look for `set` / `derived` / `effect` — Svelte's signal allocation.
  At 5 deriveds × 3000 components = 15000 signals.

**Rendering / Layout > 30% of total** → bottleneck is browser layout.
- Click into the longest "Layout" bar in the flame chart. It will tell
  you how many nodes were laid out and the document size. With anchor
  positioning, even 14 active anchors against 27000 DOM elements can be
  expensive — anchor() resolves against the box tree.
- If layout is dominant, the lever is **fewer DOM elements** (lazy
  rendering of off-screen text content) or **fewer anchored elements**.

**Recalculate Style > 20% of total** → style invalidation cascading.
- Likely culprit: every Svelte class binding effect causes a recalc on
  the affected element. At 3000 NodeGap class binding effects all firing
  at mount, that's a lot of style work.

## Quick triage questions

After recording, answer these in order:

1. **What % of total time is Scripting vs Layout?** This tells you if
   JS or browser is the bottleneck.
2. **Inside Scripting, what's the top 3 functions by self-time?**
   `mount_component` dominating means Svelte component cost; `create`
   means DOM creation; `apply_op` means Session work.
3. **Is there a "Long Task" warning on the timeline?** The mount is
   one giant task. Long tasks block input. A 3.7s long task means the
   user can't interact for 3.7s (matches your "several seconds" report).

## What to share back

- A screenshot of the flame chart (collapse to the top-level task).
- The Bottom-Up summary, sorted by Total Time, top 10 entries.
- The Call Tree expanded one level under `apply_settings`.

That's enough to diagnose. Paste them in chat and we can pick the
right fix.

## If Scripting dominates

Likely fixes, in order of expected impact:
- **Lazy NodeGap** — don't mount NodeGap for off-screen nodes. Breaks
  the "always present in DOM" rule for selection anchoring; needs a
  fallback (e.g., dynamically mount on selection).
- **Drop $deriveds for constant props** — most NodeGaps have stable
  `offset` (keyed by index in parent each block). Replace `$derived`
  with regular `let` for things that don't actually change. Saves
  signal allocation × 3000 components.
- **Coarser-grained reactivity** — single per-array signal instead of
  SvelteSet's per-key sources. Reduces source count from ~3000 to ~30.

## If Layout dominates

- **Fewer anchored elements** — the perftest renders nested arrays
  (buttons inside stories, items inside lists). Each adds anchor
  overhead. Maybe limit anchor positioning to top-level body gaps only.
- **`content-visibility: auto`** on off-screen nodes — browser-native
  culling, skips layout for off-screen content. Big win at scale, but
  may interact poorly with anchor positioning. Worth testing.

## Things tried and rejected

- **`content-visibility: auto` on `.node`** — broke multi-node selection:
  when a selection spans many viewports and the user scrolls back,
  content-visibility sometimes culled nodes that were part of the
  active selection range, dropping the visual selection overlay.
  NodeGap and NodeGapMarker rendering also became inconsistent. Not
  viable for an editor with cross-viewport selection.

## Findings from the 2026-05-01 trace at 2000 nodes

Trace (`Performance-Trace-20260501T233256.json`, 4131 ms INP):

- **Layout dominated**: 6.12 s across 15 passes. Top 3: 1.37 s + 1.24 s
  + 1.22 s = 3.8 s in three giant passes.
- **Forced reflow: 1.5 s** attributed to `sync_fill_if_near` calling
  `getBoundingClientRect`. The bootstrap loop was interleaved with
  Svelte's mount work, so each gBCR re-triggered layout for the
  growing DOM. **Fixed** by removing gBCR-based pre-fill from bootstrap
  and MO callback — IO populates state on its first callback (one
  frame later), and un-positioned NodeGaps have zero layout presence
  so the lag is invisible.
- **DOM: 27,401 elements, max children 4,007** (`div.body-node-array`
  has ~4000 direct children from gap+node interleaving). The 1.37 s
  single-pass layout is the browser laying these out. Mitigations
  (`content-visibility: auto`, virtualization) are the next targets
  if this remains too slow.
- **Layout shift culprit (img.placeholder unsized)**: unrelated to the
  visibility system; perftest demo issue.
