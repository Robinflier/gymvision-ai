const CACHE_NAME = 'gv-ai-v70';
const ASSETS = [
	'/',
	'/static/styles.css',
	'/static/app.js',
	'/static/manifest.webmanifest',
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

	// Fix legacy paths: some older clients still request /static/images/*
	// Our canonical route is /images/* (served by backend resolver).
	try {
		const url = new URL(req.url);
		if (url.origin === self.location.origin && url.pathname.startsWith('/static/images/')) {
			const filename = url.pathname.split('/').pop();
			if (filename) {
				event.respondWith(fetch(`/images/${filename}`));
				return;
			}
		}
	} catch (e) {
		// ignore URL parsing errors
	}

	event.respondWith(
		caches.match(req).then((cached) => cached || fetch(req))
	);
});
