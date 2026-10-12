import { useMemo } from 'react';
import { useSveditContext } from './context.js';
import { useSnapshot, shallow_equal } from './reactive.js';
import type { DocumentPath, DocumentSchema, SveditContext } from './types.js';

/**
 * Reads a value derived from the editor context and re-renders the
 * component only when that value changes. Subscribes to both the session
 * (document, selection, history, commands) and the context's own state
 * (editable, canvas focus, composition). The React equivalent of reading
 * `$derived` state from Svedit's context.
 *
 * Use `shallow_equal` as `is_equal` when the selector returns a fresh
 * object or array per call.
 *
 * @example
 * const editable = useSvedit((ctx) => ctx.editable);
 * const node = useSvedit((ctx) => ctx.session.get(path));
 */
export function useSvedit<T, S extends DocumentSchema = DocumentSchema>(
	selector: (context: SveditContext<S>) => T,
	is_equal: (a: T, b: T) => boolean = Object.is
): T {
	const context = useSveditContext<S>();
	const session = context.session;
	const stores = useMemo(() => [context, session], [context, session]);
	return useSnapshot(stores, () => selector(context), is_equal);
}

/**
 * Reads the node (or property value) at `path` and re-renders when it
 * changes. Values are copy-on-write, so an unchanged node keeps its
 * reference and the component stays put.
 *
 * @example
 * const node = useNode<Nodes['story']>(path);
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useNode<T = any>(path: DocumentPath | string): T {
	return useSvedit((context) => context.session.get<T>(path));
}

export { shallow_equal };
