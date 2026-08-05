const CACHE="acp-shell-pwa-v47";
const CORE=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icon.svg"];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{}));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);

  // Always prefer the fresh app shell from the network.
  if(url.origin===self.location.origin && (
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/manifest.webmanifest")
  )){
    event.respondWith(
      fetch(req,{cache:"no-store"})
        .then(resp=>{
          const copy=resp.clone();
          caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
          return resp;
        })
        .catch(()=>caches.match(req).then(r=>r||caches.match("./index.html")))
    );
    return;
  }

  // Other local assets: cache-first is fine.
  if(url.origin===self.location.origin){
    event.respondWith(
      caches.match(req).then(cached=>cached||fetch(req).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
        return resp;
      }))
    );
  }
});
