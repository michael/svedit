# Changelog

## 0.16.0 (unreleased)

Svedit is now one editor for three frameworks. The framework-free part of the editor lives in a new
package, `@svedit/core`, and three bindings share it: `svedit` (Svelte 5), `@svedit/react` (React 19)
and `@svedit/vue` (Vue 3). The four packages are versioned and released in lockstep.

### Added

- `KeyMapper.remove_scope(keymap)` removes a specific scope wherever it is in the stack.
- `@svedit/core` exports the editor's DOM-level building blocks, shared by all three editor
  components: `render_selection` and the DOM-to-model mapping (`get_selection_from_dom` and
  friends), the clipboard format and exporters (`handle_copy`, `export_html`,
  `export_plain_text`), paste handling (`handle_paste`, `try_node_paste`, `try_html_paste`) and
  canvas helpers (`check_duplicate_paths`, `remove_native_composition_text`). Useful for building an
  integration for another framework.
- `session.store` gives access to the session's change store, and `derived(session, fn)` memoizes a
  value computed from session state in every framework.
- `@svedit/core`: the document model, `Session`, `Transaction`, `Command`, `KeyMapper`, the document
  utilities, transforms, paste and HTML export helpers, all data types and a small reactivity bridge
  (`Store`, `derived`, `Tracker`) that the bindings plug their framework's reactivity into. It has no
  framework dependency and can be used on its own, for example on a server or in tests.
- `@svedit/react`: React 19 components (`Svedit`, `TextProperty`, `NodeArrayProperty`, `Node`,
  `CustomProperty`, `NodeGap`, `NodeGapMarkers`, `NodeCaret`, `NodeSelectionMarkers`), the hooks
  `useSvedit`, `useNode`, `useSnapshot`, `useVersion` and `useAttach`, and the `SveditContextObject` and
  `KeyMapperContext` contexts. Styles are a separate entry point: `import '@svedit/react/svedit.css'`.
- `@svedit/vue`: Vue 3 components with the same names as above, a `Session` with Vue reactivity and the
  `vAttach` directive. Styles are a separate entry point: `import '@svedit/vue/svedit.css'`.
- The demo site is one static site built from the three demos: `svedit.dev` (Svelte),
  `svedit.dev/react` and `svedit.dev/vue`, with a framework switcher at the top of every demo.
- `svedit.dev/perftest` compares the three editors on the same benchmark suite (`pnpm perftest`
  runs it headless and prints the table). It replaces the per-framework perftest pages.
- A single document format and schema API across the three packages, so documents, schemas, commands
  and keymaps can be shared between a Svelte, React and Vue application.

### Changed

- `svedit` re-exports everything from `@svedit/core` (`export * from '@svedit/core'`) and adds its
  Svelte components and the `Session` with Svelte reactivity. Every name that `svedit` exported before
  is still exported, from the same package.
- `@svedit/core` is a regular dependency of the three bindings and is installed automatically.
- Derived session state (`selected_node`, `selected_marks`, `active_mark`, …) and values made with
  `derived()` recompute only when session state they read has changed, and keep their reference
  otherwise. Previously any change, including to the undo history, recomputed all of them.
- Assigning a session field its current value (for example `session.selection = session.selection`)
  is a no-op and wakes no one, like `$state.raw`.
- `tr.set` and `tr.create` copy the value they record, so an object you keep mutating after the
  transaction (a form model, say) no longer changes what redo applies.
- `session.apply`, `session.undo`, `session.redo` and the `session.selection` setter read session state
  untracked. Calling them inside a framework effect no longer subscribes that effect to the history and
  document fields the session reads internally. The properties the bindings rely on are listed in
  `packages/core/CLAUDE.md` and pinned by `packages/core/src/test/invariants.test.ts`.

### Fixed

- Transactions that change nothing (for example Backspace at the very start of a document, or a mark
  toggle that does not apply) no longer add an undo step. They still update the selection.
- `session.apply` validates the resulting selection before changing anything, so a transaction that
  would leave an invalid selection throws without half-applying the document.
- Deleting nodes no longer crashes when a document carries a property that the schema no longer
  defines.
- `tr.set` refuses to change a node's `id`, which used to silently corrupt the document.
- A batched edit right after resetting `session.history` no longer throws.
- `<Svedit>` removes exactly its own keymap from the `KeyMapper` on blur. It used to pop whatever
  scope was on top, so a scope pushed while the editor had focus (for example a modal's) lost its
  shortcuts and the editor's shortcuts stayed active.
- Selections passed as framework proxies (Vue `reactive()`, Svelte `$state`) no longer make
  `session.apply` throw. It used to deep-clone the selection, which fails on proxies.
- `derived(session, fn)` now updates in Svelte and Vue when read inside an effect, `$derived` or
  `computed`. It used to recompute without being tracked, so such readers did not re-run.
- Enter in a top-level text property (a path like `['paragraph_1', 'content']`, outside any node
  array) no longer throws: `join_text_node`, `break_text_node` and `BreakTextNodeCommand` treat it as
  "not inside a node array".
- `break_text_node` reports a missing inserter for the new node's type with a clear error, before
  changing the transaction.
- Batching edits into one undo step no longer appends to the operations of the transaction that
  started the batch.

### Breaking changes

- A transaction is applied once. Changing it after `session.apply(tr)` (ops or `set_selection`)
  throws, because its draft has become the session's document; create a new one with `session.tr`.
- A transaction applies only to the document it was created from. `session.apply` throws when a
  transaction with ops was created before another change (an apply, undo, redo or a doc assignment),
  instead of silently overwriting that change with the transaction's draft. Code that creates a
  transaction, awaits something (an upload, a dialog) and applies it afterwards must create the
  transaction after the await. Selection-only transactions still apply; `transaction.doc_before` is
  the document a transaction was created from.
- `derived()` takes a `Store` or an object with a `store` (such as a `Session`). The
  `DerivedSource` type no longer accepts an object with just a `version`.
- The selection is stored by reference, like `session.doc`: `session.selection = x` keeps `x`, and
  `session.apply` keeps the current selection object when a transaction does not change the
  selection. `apply` used to hand out a fresh copy every time, so code that relied on the selection
  changing identity after every transaction should watch `session.doc` as well. Compare selections
  by identity to detect changes.
- The set of names exported by `svedit` is larger than before: in addition to the previous API it now
  includes everything the core exports, for example the HTML paste helpers (`parse_html_paste`,
  `map_html_text`, `map_html_blocks`), the paste utilities, every document utility and the reactivity
  primitives (`Store`, `derived`, `shallow_equal`). If you `import * as svedit from 'svedit'` or
  declare your own identifiers with these names next to a wildcard import, check for collisions.
- Core modules no longer live in the `svedit` package: `Transaction`, `Command`, `KeyMapper`, the
  transforms and the document utilities moved from `svedit/src/lib/*.svelte.js` to `@svedit/core`.
  Import them from `svedit` (or `@svedit/core`) instead of by file path.
- The React and Vue editor component is called `Svedit` (the earlier ports used framework-specific
  names), and their component styles are no longer bundled into the JavaScript: import
  `@svedit/react/svedit.css` or `@svedit/vue/svedit.css` once in your application.
