# Plan: prototype #299 — text selection bounds as CSS anchors

Goal: render two zero-size markers at the text selection boundaries carrying
`anchor-name: --text-selection-start/end`, so overlays (floating toolbar, link
popover) can anchor to the actual selection instead of the property element.
Settle the layout-perturbation question empirically. Target: normal feature
branch + PR against main.

Note: these markers are selection bounds, not annotation bounds. Annotations
almost always start and end at word boundaries, but selections routinely land
mid-word (drag, shift+arrow), so mid-word robustness matters.

## 1. Reproduce or refute the layout claim first

Michael reported zero-width spans "changed line wrapping and slightly moved
text layout" (#299 comment). Two plausible mechanisms — both only bite
mid-word, which may be why experiences differ:

- Font shaping: kerning pairs and ligatures don't cross element boundaries,
  so a marker mid-word splits the shaping run. JetBrains Mono is monospaced
  (no kerning), so the svedit demo may be unable to show this — test with a
  ligature-heavy proportional font too (e.g. Inter: "fi", "ffi").
- Line-break opportunities: an element boundary can introduce a soft-wrap
  opportunity mid-word in some engines — the likeliest explanation for
  "changed line wrapping". At whitespace, a break opportunity already
  exists, so a marker there adds nothing.

Grapheme safety comes free: svedit selection offsets are grapheme-based
(Intl.Segmenter), so markers can never split an emoji/combining cluster.

Harness: a test page with long pre-wrap paragraphs in both fonts. Fingerprint
layout via `getClientRects()` of every line + screenshot diff, before/after
marker insertion at many positions (mid-word, word edges, line edges). If
layout is byte-identical, the claim is refuted for that variant, done.

## 2. Marker variants (behind a flag in TextProperty)

a. Plain zero-width inline `<span>` — Michael's original attempt, baseline.
b. `position: absolute` zero-size span — out of flow, so it cannot
   participate in line layout (no shaping split, no break opportunity); its
   static position is exactly the inline position the anchor needs. Only
   text-node splitting remains — test whether split shaping runs alone move
   pixels (engine-dependent, Safari historically most sensitive).
c. Either variant + `contenteditable="false"` on the marker — check caret
   traversal, backspace across the marker, IME composition nearby.
d. Plan B if mid-word markers prove problematic: snap markers outward to the
   nearest whitespace on the same line. Placement error is at most half a
   word (invisible for overlay positioning); needs a fallback for lines
   without whitespace (long tokens, URLs). If this would involve expensive js computations, it's not a route we want to pursue. Performance is paramount.

## 3. Mutation timing (the native-selection constraint)

Michael's hard constraint: DOM mutations inside text while the user drags a
native selection cause feedback loops. Sidestep instead of solving: only
render/update markers when the selection settles (pointer up — the toolbar
already gates on is_dragging; keyboard selections settle per keystroke), and
remove them on pointer down before a new drag can cross them. Markers exist
for overlays, and overlays only show on settled selections anyway.

## 4. Acceptance criteria

- Pixel-identical text rendering with markers present (screenshot diff, both fonts)
- Caret navigation, typing, backspace, IME composition unaffected around markers
- Native selection drag unaffected (markers removed during the gesture)
- A popover positioned via `position-anchor: --text-selection-start` tracks
  the selection through scroll (anchors do this for free)
- No flicker on selection changes (markers update in the same flush as the
  selection commit)

## 5. Deliverables

- Findings comment on #299 (with the layout-diff evidence, whichever way it goes). reply in chat. don't post yourself.
- Feature-flagged PR: markers in TextProperty + the two-line switch in
  Toolbar.svelte (`floating_anchor`) and LinkActionOverlay (`anchor_name`)
- This retroactively fixes: short/line-end selection placement, the
  long-paragraph checkbox from PR #349 review, and half of the multi-node
  selection concern
