import { afterEach } from 'vitest';
import { cleanup } from 'vitest-browser-vue';

afterEach(() => {
	cleanup();
	window.getSelection()?.removeAllRanges();
	window.scrollTo(0, 0);
});
