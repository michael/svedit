import { afterEach } from 'vitest';
import { cleanup } from './render.js';

afterEach(() => {
	cleanup();
	window.getSelection()?.removeAllRanges();
	window.scrollTo(0, 0);
});
