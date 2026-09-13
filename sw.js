// 📄 sw.js の中身

const CACHE_NAME = 'workout-log-cache-v3';

const urlsToCache = [
    'index.html',
    'home.html',
    'manifest.json',
    'css/lib/bootstrap.min.css',
    'css/home.css',
    'js/lib/dexie.min.js',
    'js/lib/chart.umd.min.js',
    'js/chart.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
