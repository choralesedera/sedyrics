const SHELL='sedyrics-shell-v1';
const SHELL_FILES=['./','./index.html','./assets/css/style.css','./assets/js/app.js','./assets/images/icon-sedera.png','./assets/images/ankino-logo.webp','./version.json','./data/songs.json','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin) return;
  const isShell=e.request.mode==='navigate'||['script','style','document'].includes(e.request.destination)||u.pathname.endsWith('/version.json')||u.pathname.endsWith('/data/songs.json');
  if(isShell){
    e.respondWith((async()=>{const c=await caches.open(SHELL);try{const r=await fetch(e.request);if(r&&r.ok)c.put(e.request,r.clone());return r;}catch(err){return (await c.match(e.request))||(await c.match('./index.html'));}})());
  }else{
    e.respondWith((async()=>{const c=await caches.open('sedyrics-content-v1');const hit=await c.match(e.request);if(hit)return hit;try{const r=await fetch(e.request);if(r&&r.ok)c.put(e.request,r.clone());return r;}catch(err){return new Response('Offline',{status:503});}})());
  }
});
