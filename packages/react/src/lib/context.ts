import { createContext, useContext } from 'react';
import type { KeyMapper } from '@svedit/core';
import type { DocumentSchema, NodeArrayRenderContext, SveditContext } from './types.js';

/**
 * React context carrying the editor context object (session, editable,
 * canvas state, visibility registry). Provided by `<Svedit>`; the
 * equivalent of Svedit's `getContext('svedit')`. The value object is stable
 * for the lifetime of the editor — reactive reads go through
 * `useSvedit` / `useSnapshot`, never through context identity.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SveditContextObject = createContext<SveditContext<any> | null>(null);

/**
 * Returns the editor context object. Throws when used outside `<Svedit>`.
 */
export function useSveditContext<S extends DocumentSchema = DocumentSchema>(): SveditContext<S> {
	const context = useContext(SveditContextObject);
	if (!context) {
		throw new Error('useSveditContext must be used inside a <Svedit> component.');
	}
	return context as SveditContext<S>;
}

/**
 * React context for the app-level KeyMapper. Provide it from a parent of
 * `<Svedit>` so the canvas can push and pop the session keymap on focus.
 */
export const KeyMapperContext = createContext<KeyMapper | undefined>(undefined);

/** Internal context shared by a node array and its rendered child nodes. */
export const NodeArrayMetaContext = createContext<NodeArrayRenderContext | undefined>(undefined);
