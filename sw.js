const CACHE='lyricsed-offline-v2';
const CORE_PATHS=[
  '/', '/index.html', '/assets/css/style-v2.css', '/assets/js/app-v2.js',
  '/version-v2.json', '/data/songs-v2.json', '/data/announcements-v2.json',
  '/manifest.webmanifest'
];

function localPath(url){
  const u=new URL(url);
  const scope=new URL(self.registration.scope);
  let p=u.pathname;
  if(p.startsWith(scope.pathname))p=p.slice(scope.pathname.length);
  return '/'+p.replace(/^\/+/, '');
}
function isCore(req){
  const p=localPath(req.url);
  return req.mode==='navigate' || CORE_PATHS.includes(p);
}

self.addEventListener('install', event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Fail installation rather than replacing the old working SW with an incomplete shell.
    for(const rel of ['index.html','assets/css/style-v2.css','assets/js/app-v2.js','version-v2.json','data/songs-v2.json','data/announcements-v2.json','manifest.webmanifest']){
      const url=new URL(rel,self.registration.scope).toString();
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw new Error('Missing core file: '+rel);
      await cache.put(url,r.clone());
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event=>{
  // Keep older caches: they may contain already-downloaded MP3/Solfa files.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  // Explicit network verification requests must never be fulfilled from cache.
  if(url.searchParams.has('__network')){
    event.respondWith(fetch(event.request));
    return;
  }

  if(isCore(event.request)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const fresh=await fetch(event.request,{cache:'no-store'});
        if(fresh&&fresh.ok)await cache.put(event.request,fresh.clone());
        return fresh;
      }catch{
        const hit=await cache.match(event.request,{ignoreSearch:true}) || await caches.match(event.request,{ignoreSearch:true});
        if(hit)return hit;
        if(event.request.mode==='navigate'){
          const fallback=await cache.match(new URL('index.html',self.registration.scope).toString());
          if(fallback)return fallback;
        }
        return new Response('',{status:503,statusText:'Offline'});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(event.request,{ignoreSearch:true}) || await caches.match(event.request,{ignoreSearch:true});
    if(hit)return hit;
    try{
      const fresh=await fetch(event.request);
      if(fresh&&fresh.ok)await cache.put(event.request,fresh.clone());
      return fresh;
    }catch{
      return new Response('',{status:503,statusText:'Offline'});
    }
  })());
});
