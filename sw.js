/* ============================================
   Service Worker for 遂城土白話多功能音典 PWA
   仓库：DICTIONARY_of_Suixi_Vernacular_of_Yue_Chinese
   策略：
     - HTML / JSON / JS / CSS → 网络优先，离线回退缓存
     - 图片 / 图标 / 字体       → 缓存优先
     - 音频                     → 不拦截（交给页面自己的多源回退逻辑）
   ============================================ */

const CACHE_NAME = 'suixi-dictionary-v4';

// 预缓存的核心资源（首次安装时下载）
const PRECACHE_URLS = [
  '/DICTIONARY_of_Suixi_Vernacular_of_Yue_Chinese/',
  '/DICTIONARY_of_Suixi_Vernacular_of_Yue_Chinese/index.html',
  '/DICTIONARY_of_Suixi_Vernacular_of_Yue_Chinese/manifest.json',
  '/DICTIONARY_of_Suixi_Vernacular_of_Yue_Chinese/icons/icon-192.png',
  '/DICTIONARY_of_Suixi_Vernacular_of_Yue_Chinese/icons/icon-512.png'
];

/* --------------------------------------------
   判断请求类型
   -------------------------------------------- */
function isAudioRequest(url) {
  return /\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?|$)/i.test(url);
}

function isFontRequest(url) {
  return /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url) ||
         url.includes('lxgw-wenkai-webfont');
}

function isImageRequest(url) {
  return /\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(url);
}

function isCodeOrDataRequest(url) {
  return /\.(html|json|js|css)(\?|$)/i.test(url) || url.endsWith('/');
}

/* --------------------------------------------
   install：预缓存核心资源
   -------------------------------------------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 预缓存核心资源');
        // 逐个添加，避免某一个失败导致整体失败
        return Promise.all(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] 预缓存失败:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* --------------------------------------------
   activate：清理旧缓存
   -------------------------------------------- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* --------------------------------------------
   fetch：按类型分流处理
   -------------------------------------------- */
self.addEventListener('fetch', event => {
  const req = event.request;

  // 只处理 GET
  if (req.method !== 'GET') return;

  // 跳过非 http/https
  if (!req.url.startsWith('http')) return;

  // ============ 音频请求：完全不拦截 ============
  // 交给页面里的 fetchAudioWithFallback 自己处理
  if (isAudioRequest(req.url)) {
    return;
  }

  // ============ 图片 / 图标 / 字体：缓存优先 ============
  if (isImageRequest(req.url) || isFontRequest(req.url)) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req).then(res => {
          // 只缓存同源或 CORS 成功的响应
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached); // 网络失败回退缓存
      })
    );
    return;
  }

  // ============ HTML / JSON / JS / CSS：网络优先，离线回退缓存 ============
  if (isCodeOrDataRequest(req.url)) {
    event.respondWith(
      fetch(req)
        .then(res => {
          // 网络成功 → 更新缓存
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // 网络失败 → 用缓存
          return caches.match(req).then(cached => {
            if (cached) return cached;
            // 页面导航请求兜底
            if (req.mode === 'navigate') {
              return caches.match('/DICTIONARY_of_Suixi_Vernacular_of_Yue_Chinese/index.html');
            }
          });
        })
    );
    return;
  }

  // ============ 其他请求：网络优先 + 缓存回退 ============
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
