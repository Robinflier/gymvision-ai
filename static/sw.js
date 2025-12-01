const CACHE_NAME = 'gv-ai-v69';
const ASSETS = [
	'/',
	'/static/styles.css',
	'/static/app.js',
	'/static/manifest.webmanifest',
	'/static/images/benchpress.jpg',
	'/static/refresh-button.png',
	'/static/close.png',
	'/static/check.png',
	'/static/pencil.png'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(
			keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
		))
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	event.respondWith(
		caches.match(req).then((cached) => cached || fetch(req))
	);
});
