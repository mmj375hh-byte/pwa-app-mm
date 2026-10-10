const CACHE_NAME = 'workout-log-cache-v1.0.4';

const urlsToCache = [
    './', // オフライン起動を確実にするためにルート追加
    'index.html',
    'manifest.json',
    'css/lib/bootstrap.min.css',
    'css/home.css',
    'js/lib/dexie.min.js',
    'js/lib/chart.umd.min.js',
    'js/lib/bootstrap.min.js',
    'js/app.js',
    'js/backup.js',
    'js/chart.js',
    'js/chart_advanced.js'
];

// インストール処理
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

// アクティベート処理（古いキャッシュの自動削除）
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        // console.log('古いキャッシュを削除しました:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

// フェッチ処理
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting(); // 画面側からの合図を受け取って、最新キャッシュを有効化する
    }
});
