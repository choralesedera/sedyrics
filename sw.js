const CACHE="lyricsed-offline-v1";
const INDEX="./index.html";
const BOOT_FILES=[
  "./index.html",
  "./assets/css/style.css",
  "./assets/js/app.js",
  "./assets/images/icon-sedera.png",
  "./assets/images/ankino-logo.webp",
  "./manifest.webmanifest",
  "./version.json",
  "./data/songs.json",
  "./data/announcements.json"
];

function canonicalRequest(request){
  const u=new URL(request.url);
  u.search="";
  return new Request(u.toString(),{method:"GET"});
}

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);

    // Do not fail the service-worker installation if one file is temporarily unavailable.
    for(const path of BOOT_FILES){
      try{
        const r=await fetch(path,{cache:"no-store"});
        if(r&&r.ok)await cache.put(path,r.clone());
      }catch{}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  // Important: never delete CACHE here. It contains the user's offline library.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  // Requests carrying __network are used only to verify/download real GitHub updates.
  // Never satisfy them from cache, otherwise the app could think it is online when it is not.
  if(url.searchParams.has("__network")){
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=canonicalRequest(event.request);

    let cached=await cache.match(key,{ignoreSearch:true});
    if(!cached)cached=await cache.match(event.request,{ignoreSearch:true});
    if(cached)return cached;

    try{
      const network=await fetch(event.request);
      if(network&&network.ok){
        try{await cache.put(key,network.clone())}catch{}
      }
      return network;
    }catch{
      if(event.request.mode==="navigate"){
        const fallback=await cache.match(INDEX,{ignoreSearch:true});
        if(fallback)return fallback;
      }
      return new Response("",{status:503,statusText:"Offline"});
    }
  })());
});
