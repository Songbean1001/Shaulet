/* Shaulet Service Worker
 * 更新 index.html 後，可在 App「設定 → 強制更新版本」一鍵刷新離線快取。
 * 若想讓所有裝置強制換新快取，把下方 VER 的數字加一即可。 */
const VER = 'shaulet-v2';
const SCOPE = self.registration.scope;
const IDX = new URL('index.html', SCOPE).href;
const MAN = new URL('manifest.json', SCOPE).href;
const CDN = ['https://cdn.tailwindcss.com/3.4.17'];

// 抓取所有資源並寫入快取（先抓成功才覆蓋，失敗時保留舊快取）
async function fill(c) {
  await Promise.all([
    (async () => {
      const r = await fetch(IDX, { cache: 'reload' });
      if (!r.ok) throw new Error('index.html');
      await c.put(IDX, r);
    })(),
    ...CDN.map(async u => {
      const r = await fetch(new Request(u, { mode: 'no-cors' })); // 跨網域：不透明回應
      await c.put(u, r);
    }),
    fetch(MAN, { cache: 'reload' }).then(r => r.ok && c.put(MAN, r)).catch(() => {})
  ]);
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(fill).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VER) await caches.delete(k);
    await self.clients.claim();
  })());
});

// 快取優先（離線可用），同時在背景檢查更新，下次開啟即為新版
self.addEventListener('fetch', e => {
  const q = e.request;
  if (q.method !== 'GET') return;
  const nav = q.mode === 'navigate';
  const same = new URL(q.url).origin === location.origin;
  if (!nav && !same && !CDN.includes(q.url)) return;
  const key = nav ? IDX : q.url;
  e.respondWith((async () => {
    const c = await caches.open(VER);
    const hit = await c.match(key, { ignoreSearch: true });
    const net = (same ? fetch(key, { cache: 'reload' }) : fetch(new Request(key, { mode: 'no-cors' })))
      .then(r => { if (r.ok || r.type === 'opaque') c.put(key, r.clone()); return r; })
      .catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  })());
});

// 供設定頁「檢查快取狀態／強制更新版本」使用
self.addEventListener('message', e => {
  const p = e.ports[0], t = e.data && e.data.type;
  if (!p) return;
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    if (t === 'STATUS') {
      const ks = await c.keys();
      p.postMessage({ ver: VER, n: ks.length, urls: ks.map(k => k.url) });
    } else if (t === 'REFRESH') {
      try { await fill(c); p.postMessage({ ok: 1, ver: VER }); }
      catch (err) { p.postMessage({ ok: 0, err: String(err) }); }
    }
  })());
});
