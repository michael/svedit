# CLAUDE.md

`@svedit/core` is the framework-free core of Svedit: document model, `Session`, `Transaction`, `Command`,
`KeyMapper`, document utilities, transforms, paste and export, the DOM-level editor helpers and all types.
See the root `CLAUDE.md` for the workspace layout. Never add a framework import here; the bindings alias
`@svedit/core` to `src/lib` in dev and tests, so no build step is needed to see a change.

## Commands

- `pnpm check` type-checks, `pnpm lint` runs prettier and eslint.
- `pnpm test` runs the suites in the browser you have open; `CI=1 pnpm test` runs them in headless Chromium.
- When changing `Session`, `Transaction` or `reactive.ts`, also run the Svelte, React and Vue suites: a
  change that is fine for one framework's reactivity can break another's.

## Correctness properties

The three bindings and application code rely on the properties below. `src/test/invariants.test.ts` pins
each one; extend it when you add a property, and treat a failure there as a bug in core, never as a test
to adjust.

1. **Values are immutable.** `session.doc`, every node, every property value and `session.selection` are
   plain objects that are never mutated once they became session state. A change produces a new object,
   so readers compare by reference (`===`), never by value. This is what makes `useNode`, `$derived` and
   `computed` cheap, and what lets an application detect unsaved changes with `doc !== last_saved_doc`.
2. **Copy on write at node granularity.** `Session.apply` replaces `session.doc` with the transaction's
   draft. Only nodes touched by an op are new objects; every other node, and every untouched value inside
   a touched node, keeps its identity.
3. **Transactions work on a draft.** `session.tr` shallow-copies the nodes map; ops mutate the draft and
   copy a node before changing it (`apply_op_to_draft`). Until `apply`, `session.doc` and `session.version`
   are untouched. An applied transaction is sealed (further ops throw), because its draft is now the live
   document.
4. **No aliasing with caller-owned objects.** `tr.set` and `tr.create` clone the value they record, and
   `apply_op_to_draft` clones again when writing a draft. Neither the document nor the undo history changes
   when the caller mutates its object afterwards. The session does not unwrap or freeze what it is given,
   though: a Svelte `$state` proxy assigned to `session.selection` is stored as is (the Vue binding unwraps
   with `toRaw`), so bindings and apps should hand the session plain objects.
5. **A transaction applies only to the document it was created from.** `apply` throws when a transaction
   with ops was created before another apply, undo, redo or doc assignment (its `doc_before` is no longer
   `session.doc`), instead of silently overwriting those changes with its draft. A transaction without ops
   carries only a selection, which is validated against the current document, and may still apply.
6. **Validate before swapping.** `apply` validates the resulting nodes and the selection first. A failed
   apply leaves doc, selection, history and `session.version` exactly as they were and wakes no subscriber.
7. **Assigning the current value is a no-op.** Setters compare with `Object.is` and neither notify nor bump
   `version`. A transaction that did not touch the selection keeps the selection object; a transaction
   without ops keeps the doc object (so a selection-only apply invalidates nothing that depends on the doc).
8. **One notification per transition.** `apply`, `undo` and `redo` batch their field writes; subscribers
   and the tracker are woken once, after all fields are consistent, with the set of keys that changed.
9. **State transitions read untracked.** `apply`, `undo`, `redo` and the selection setter's validation
   read the private fields, so calling them inside a framework effect does not subscribe that effect to
   history or document state. Only public getters track (`session.tr` reads through public getters and
   therefore tracks `schema`, `doc`, `selection` and `config`).
10. **Derived values are stable.** `selected_node`, `selected_marks`, `active_mark`, … and values made with
    `derived()` keep their reference until a key they read changes, and track those keys again when served
    from cache, so an effect reading a cached value still depends on the right fields.
11. **A tracker's `trigger` only writes.** It must not read framework-reactive state; otherwise an effect
    that writes session state re-subscribes to it and loops (`effect_update_depth_exceeded` in Svelte, a
    self-triggering watcher in Vue).
12. **History entries are immutable.** The history array is replaced, never pushed into; a batched apply
    produces a merged entry with fresh arrays, and a transaction's own `ops` and `inverse_ops` are never
    extended after it was applied.
