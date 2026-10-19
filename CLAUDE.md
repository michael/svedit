# CLAUDE.md

pnpm workspace with the framework-free editor core (`packages/core`, npm `@svedit/core`) and four bindings:
`packages/svelte` (`svedit`), `packages/react` (`@svedit/react`), `packages/vue` (`@svedit/vue`), `packages/solid` (`@svedit/solid`). Each package keeps its own
CLAUDE.md with the conventions for that framework; read the one for the package you are editing.

## Where things live

- Framework-free logic (Session, Transaction, Command, doc_utils, transforms, paste/export, types): `packages/core/src/lib`.
  Never add a framework import there. The bindings alias `@svedit/core` to this source in dev and tests, so no build step is needed.
  The correctness properties the bindings rely on (immutable values, copy on write, stale-transaction guard, untracked
  state transitions, …) are listed in `packages/core/CLAUDE.md` and pinned by `packages/core/src/test/invariants.test.ts`.
- Reactivity bridge: `packages/core/src/lib/reactive.ts` (`Store`, `derived`, `Tracker`). The Svelte, Vue and Solid bindings install a
  tracker in their `Session` subclass (`packages/svelte/src/lib/reactivity.svelte.ts`, `packages/vue/src/lib/reactivity.ts`,
  `packages/solid/src/lib/reactivity.ts`).
  A tracker's `trigger` must only write, never read, or effects that write session state loop.
- Components, node visibility and attachments are per binding and intentionally duplicated across the four.
- Component styles are duplicated too (Svelte/Vue inline, React and Solid in `.css` files), so a copied component stays self-contained.
  `pnpm lint:styles` (part of `pnpm lint`) fails when they drift apart: change a component's styles in all four bindings.
- Binding `types.ts` files hold only component props and the editor context; everything else is `export type * from '@svedit/core'`.
- The demo switcher at the top of every demo: `packages/demo-shared/framework-switcher.css`, one small component per demo.

## Commands

- `pnpm dev` (alias of `pnpm dev:site`) runs the whole site in dev mode on one origin: the SvelteKit dev server proxies `/react`, `/vue` and `/solid`
  to the other three Vite servers (ports passed through `SVEDIT_REACT_PORT` / `SVEDIT_VUE_PORT` / `SVEDIT_SOLID_PORT`), websockets included.
- `pnpm check`, `pnpm lint`, `pnpm test` run across all packages (tests run in the browser, one package at a time).
- `pnpm build:site` builds the four demos into `site/` (`/`, `/react/`, `/vue/`, `/solid/`); `pnpm preview` (alias of `pnpm preview:site`) serves it like Vercel.
- `pnpm perftest` builds the site and runs the Svelte/React/Vue/Solid benchmark headless (the `/perftest` page). The suite is
  `packages/demo-shared/src/perftest`; each demo only has a harness route (`perftest/harness`) implementing `PerfHarness`.
- The React, Vue and Solid demos are served under `/react/`, `/vue/` and `/solid/` in dev too (`base` in their vite configs); static asset
  URLs in demo code go through `import.meta.env.BASE_URL`.

## Conventions

- snake_case for our own identifiers (React hooks are the one camelCase exception, see `packages/react/CLAUDE.md`).
- Versions of core and bindings move in lockstep; the bindings depend on `@svedit/core` via `workspace:*`.
- When changing core behaviour, run all five test suites: a change that is fine for one framework's reactivity can break another's.
