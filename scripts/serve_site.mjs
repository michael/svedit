/**
 * Serves the assembled `site/` directory the way Vercel does, following the
 * routing settings in vercel.json so a configuration mistake shows up
 * locally too:
 *
 * - `cleanUrls`: `about.html` is served at `/about` (and `dir/index.html` at
 *   `/dir`); requesting a path ending in `.html` redirects (308) to the
 *   extensionless path, and rewrite destinations with an `.html` extension
 *   do not resolve (Vercel's docs: omit the extension when cleanUrls is on).
 * - `rewrites`: applied when no file matches, in order; `:name` and
 *   `:name*` parameters are supported.
 *
 *   pnpm build:site && pnpm preview:site
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const project_root = fileURLToPath(new URL('..', import.meta.url));
const root = join(project_root, 'site');
const port = Number(process.env.PORT ?? 4173);

// Like `vite preview`, this serves an existing build and never builds one.
// Without `site/` every request would be a 404, which looks like a routing
// bug rather than a missing build.
if (!existsSync(join(root, 'index.html'))) {
	console.error('No site build found at site/. Run `pnpm build:site` first, then `pnpm preview`.');
	process.exit(1);
}
const config = JSON.parse(readFileSync(join(project_root, 'vercel.json'), 'utf8'));
const clean_urls = config.cleanUrls === true;

const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.map': 'application/json'
};

/** Compiles a Vercel path pattern (`/react/:path*`) to a regular expression. */
function compile(source) {
	const pattern = source
		.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
		.replace(/:\w+\*/g, '(.*)')
		.replace(/:\w+/g, '([^/]+)');
	return new RegExp(`^${pattern}$`);
}

const rewrites = (config.rewrites ?? []).map((rewrite) => ({
	pattern: compile(rewrite.source),
	destination: rewrite.destination
}));

function is_file(path) {
	return existsSync(path) && statSync(path).isFile();
}

/** Finds the static file a path addresses, or null. */
function lookup(pathname) {
	const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
	// With cleanUrls, HTML files are only addressable without their extension.
	if (clean_urls && clean.endsWith('.html')) return null;
	const candidates = [join(root, clean), join(root, clean, 'index.html')];
	if (clean_urls) candidates.push(join(root, `${clean.replace(/\/$/, '')}.html`));
	return candidates.find(is_file) ?? null;
}

function resolve(pathname) {
	const file = lookup(pathname);
	if (file) return file;
	for (const { pattern, destination } of rewrites) {
		if (pattern.test(pathname)) return lookup(destination);
	}
	return null;
}

createServer((request, response) => {
	const { pathname, search } = new URL(request.url ?? '/', 'http://localhost');
	if (clean_urls && pathname.endsWith('.html')) {
		const target = pathname.replace(/(\/index)?\.html$/, '') || '/';
		response.writeHead(308, { location: target + search });
		response.end();
		return;
	}
	const file = resolve(pathname);
	if (!file) {
		response.writeHead(404, { 'content-type': 'text/plain' });
		response.end('Not found');
		return;
	}
	response.writeHead(200, {
		'content-type': types[extname(file)] ?? 'application/octet-stream',
		'document-policy': 'js-profiling'
	});
	createReadStream(file).pipe(response);
}).listen(port, () => {
	console.log(`site: http://localhost:${port}/  (react: /react/, vue: /vue/)`);
});
