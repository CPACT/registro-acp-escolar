const CACHE='acp-shell-pwa-v5';const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{if(resp.ok&&['script','style','document','manifest','image'].includes(e.request.destination)){const c=resp.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}return resp;})))});
