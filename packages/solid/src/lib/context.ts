import { createContext, useContext } from 'solid-js';
import type { KeyMapper } from '@svedit/core';
import type { DocumentSchema, NodeArrayRenderContext, SveditContext } from './types.js';

/**
 * Solid context carrying the editor context object (session, editable,
 * canvas state, visibility registry). Provided by `<Svedit>`; the
 * equivalent of Svelte's `getContext('svedit')` and Vue's `inject('svedit')`.
 * The object is stable for the lifetime of the editor; its fields are
 * reactive getters, so reading them inside a memo, effect or JSX expression
 * subscribes to them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SveditContextObject = createContext<SveditContext<any>>();

/**
 * Returns the editor context object. Throws when used outside `<Svedit>`.
 */
export function use_svedit<S extends DocumentSchema = DocumentSchema>(): SveditContext<S> {
	const context = useContext(SveditContextObject);
	if (!context) {
		throw new Error('use_svedit must be used inside a <Svedit> component.');
	}
	return context as SveditContext<S>;
}

/**
 * Solid context for the app-level KeyMapper. Provide it from a parent of
 * `<Svedit>` so the canvas can push and pop the session keymap on focus.
 */
export const KeyMapperContext = createContext<KeyMapper | undefined>(undefined);

/** Internal context shared by a node array and its rendered child nodes. */
export const NodeArrayMetaContext = createContext<NodeArrayRenderContext | undefined>(undefined);
