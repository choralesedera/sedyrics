const CONTENT_CACHE = "sedyrics-content-v1";
let SONGS = [];
let APP_VERSION = null;
let currentSongId = null;
let currentFilter = "all";
let favorites = JSON.parse(localStorage.getItem("sedyricsFavorites") || "[]").map(Number);
let fontSize = Number(localStorage.getItem("sedyricsFontSize") || 18);

const $ = id => document.getElementById(id);
const pages = [$("homePage"), $("lyricsPage"), $("solfaPage"), $("instrumentalPage")];

function withRevision(path, rev=1){
  if(!path) return null;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${encodeURIComponent(rev)}`;
}

async function getCachedResponse(url, networkFirst=false){
  const cache = await caches.open(CONTENT_CACHE);
  if(networkFirst){
    try{
      const r = await fetch(url, {cache:"no-store"});
      if(r.ok){ await cache.put(url, r.clone()); return r; }
    }catch(e){}
    const cached = await cache.match(url);
    if(cached) return cached;
    throw new Error("Ressource indisponible hors connexion");
  }
  const cached = await cache.match(url);
  if(cached) return cached;
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  await cache.put(url, r.clone());
  return r;
}

async function loadCatalog(){
  const status = $("syncStatus");
  try{
    const versionResp = await getCachedResponse(`version.json?t=${Date.now()}`, true);
    APP_VERSION = await versionResp.json();
    const catalogUrl = withRevision(APP_VERSION.catalog, APP_VERSION.contentVersion);
    const catalogResp = await getCachedResponse(catalogUrl, true);
    const catalog = await catalogResp.json();
    SONGS = catalog.songs || [];
    status.textContent = navigator.onLine ? `À jour • version ${APP_VERSION.contentVersion}` : `Hors connexion • version ${APP_VERSION.contentVersion}`;
    status.className = `sync-status ${navigator.onLine ? "ok" : "offline"}`;
    renderCurrentList();
    prefetchEssential().catch(()=>{});
  }catch(e){
    status.textContent = "Connexion nécessaire pour la première synchronisation.";
    status.className = "sync-status offline";
    $("songList").innerHTML = '<div class="empty-state">Aucune donnée locale disponible pour le moment.</div>';
  }
}

async function prefetchEssential(){
  if(!APP_VERSION) return;
  const cache = await caches.open(CONTENT_CACHE);
  const urls=[];
  for(const s of SONGS){
    if(APP_VERSION.prefetch?.lyrics && s.lyrics) urls.push(withRevision(s.lyrics,s.revision));
    if(APP_VERSION.prefetch?.solfas && s.solfa) urls.push(withRevision(s.solfa,s.revision));
    if(APP_VERSION.prefetch?.instrumentals && s.instrumental) urls.push(withRevision(s.instrumental,s.revision));
    if(s.image) urls.push(withRevision(s.image,s.revision));
  }
  for(const url of urls){
    if(await cache.match(url)) continue;
    try{ const r=await fetch(url); if(r.ok) await cache.put(url,r.clone()); }catch(e){}
  }
  await pruneOldContent();
}

async function pruneOldContent(){
  const cache=await caches.open(CONTENT_CACHE);
  const keep=new Set();
  keep.add(withRevision(APP_VERSION.catalog, APP_VERSION.contentVersion));
  for(const s of SONGS){
    for(const p of [s.lyrics,s.solfa,s.instrumental,s.image]) if(p) keep.add(new URL(withRevision(p,s.revision),location.href).href);
  }
  const keys=await cache.keys();
  for(const req of keys){
    const u=new URL(req.url);
    const isContent=["/lyrics/","/solfa/","/instrumentals/","/data/"].some(x=>u.pathname.includes(x));
    if(isContent && !keep.has(req.url) && !u.pathname.endsWith('/version.json')) await cache.delete(req);
  }
}

function normalize(v){ return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function isFavorite(id){return favorites.includes(Number(id));}
function saveFav(){localStorage.setItem("sedyricsFavorites",JSON.stringify(favorites));}
function showPage(p){pages.forEach(x=>x.classList.remove("active-page"));p.classList.add("active-page");window.scrollTo(0,0);if(p!==$("instrumentalPage")) pauseAudio();}
function getSong(id){return SONGS.find(s=>Number(s.id)===Number(id));}

function getFiltered(){
  const q=normalize($("searchInput").value.trim());
  return SONGS.filter(s=>(currentFilter==='all'||isFavorite(s.id)) && (!q||normalize(s.title).includes(q)||normalize(s.artist).includes(q)||String(s.id).includes(q)));
}
function renderCurrentList(){ renderSongs(getFiltered()); }
function renderSongs(songs){
  $("songList").innerHTML=''; $("songCount").textContent=`${songs.length} hira`; $("favoriteCount").textContent=favorites.length;
  if(!songs.length){$("songList").innerHTML='<div class="empty-state">Tsy misy hira hita.</div>';return;}
  for(const s of songs){
    const b=document.createElement('button'); b.className='song-item'; b.type='button';
    b.innerHTML=`<span class="song-index">${String(s.id).padStart(2,'0')}</span><span class="song-info"><strong></strong><span></span></span><span class="song-open">›</span>`;
    b.querySelector('strong').textContent=(isFavorite(s.id)?'♥ ':'')+s.title; b.querySelector('.song-info span').textContent=s.artist; b.onclick=()=>openSong(s.id); $("songList").appendChild(b);
  }
}

async function openSong(id){
  const s=getSong(id); if(!s)return; currentSongId=Number(id);
  $("lyricsNumber").textContent=`HIRA ${String(s.id).padStart(2,'0')}`; $("lyricsTitle").textContent=s.title; $("lyricsAuthor").textContent=s.artist;
  $("lyricsCredits").textContent=s.credits||''; $("lyricsCredits").style.display=s.credits?'block':'none';
  $("lyricsText").textContent='Mampiditra...'; showPage($("lyricsPage")); refreshFavButton(); updateNav(); applyFont();
  try{ const r=await getCachedResponse(withRevision(s.lyrics,s.revision)); $("lyricsText").textContent=(await r.text()).trim(); }
  catch(e){$("lyricsText").textContent='Tsy mbola voatahiry ato amin’ny finday ity tononkira ity.';}
}

async function openSolfa(id){
  const s=getSong(id); if(!s)return; currentSongId=Number(id);
  $("solfaNumber").textContent=`HIRA ${String(s.id).padStart(2,'0')}`; $("solfaTitle").textContent=s.title; $("solfaAuthor").textContent=s.artist;
  if(s.solfa){
    try{ const r=await getCachedResponse(withRevision(s.solfa,s.revision)); const blob=await r.blob(); $("solfaImage").src=URL.createObjectURL(blob); $("solfaAvailableBox").classList.remove('hidden'); $("solfaComingBox").classList.add('hidden'); }
    catch(e){ $("solfaAvailableBox").classList.add('hidden'); $("solfaComingBox").classList.remove('hidden'); }
  }else{$("solfaAvailableBox").classList.add('hidden');$("solfaComingBox").classList.remove('hidden');}
  showPage($("solfaPage"));
}

let audioObjectUrl=null;
async function openInstrumental(id){
  const s=getSong(id); if(!s)return; currentSongId=Number(id);
  $("instrumentalNumber").textContent=`HIRA ${String(s.id).padStart(2,'0')}`; $("instrumentalTitle").textContent=s.title; $("instrumentalAuthor").textContent=s.artist; $("playerSongTitle").textContent=`${s.title} • Instrumental`;
  pauseAudio(); if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null;}
  if(s.instrumental){
    try{ const r=await getCachedResponse(withRevision(s.instrumental,s.revision)); const blob=await r.blob(); audioObjectUrl=URL.createObjectURL(blob); $("instrumentalAudio").src=audioObjectUrl; $("instrumentalAvailableBox").classList.remove('hidden'); $("instrumentalComingBox").classList.add('hidden'); }
    catch(e){ $("instrumentalAvailableBox").classList.add('hidden'); $("instrumentalComingBox").classList.remove('hidden'); }
  }else{$("instrumentalAvailableBox").classList.add('hidden');$("instrumentalComingBox").classList.remove('hidden');}
  showPage($("instrumentalPage"));
}

function refreshFavButton(){const on=isFavorite(currentSongId);$("favoriteButton").textContent=on?'♥':'♡';$("favoriteButton").classList.toggle('is-favorite',on);}
function updateNav(){const i=SONGS.findIndex(s=>Number(s.id)===Number(currentSongId));const p=i>0?SONGS[i-1]:null,n=i<SONGS.length-1?SONGS[i+1]:null;$("previousSong").disabled=!p;$("nextSong").disabled=!n;$("previousTitle").textContent=p?p.title:'Tsy misy';$("nextTitle").textContent=n?n.title:'Tsy misy';$("previousSong").dataset.id=p?p.id:'';$("nextSong").dataset.id=n?n.id:'';}
function applyFont(){fontSize=Math.min(30,Math.max(15,fontSize));$("lyricsText").style.fontSize=`${fontSize}px`;$("fontSizeLabel").textContent=fontSize;localStorage.setItem('sedyricsFontSize',fontSize);}
function pauseAudio(){const a=$("instrumentalAudio"); if(a){a.pause();$("playPauseButton").textContent='▶';}}
function formatTime(sec){if(!Number.isFinite(sec))return'0:00';return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;}

$("searchInput").oninput=renderCurrentList;
$("allFilter").onclick=()=>{currentFilter='all';$("allFilter").classList.add('active');$("favoritesFilter").classList.remove('active');$("listTitle").textContent='Tononkira rehetra';renderCurrentList();};
$("favoritesFilter").onclick=()=>{currentFilter='favorites';$("favoritesFilter").classList.add('active');$("allFilter").classList.remove('active');$("listTitle").textContent='Hira voatahiry';renderCurrentList();};
$("backButton").onclick=()=>showPage($("homePage"));
$("favoriteButton").onclick=()=>{if(currentSongId===null)return;const id=Number(currentSongId);favorites=isFavorite(id)?favorites.filter(x=>x!==id):[...favorites,id];saveFav();refreshFavButton();renderCurrentList();};
$("fontMinus").onclick=()=>{fontSize--;applyFont();}; $("fontPlus").onclick=()=>{fontSize++;applyFont();};
$("previousSong").onclick=()=>openSong($("previousSong").dataset.id); $("nextSong").onclick=()=>openSong($("nextSong").dataset.id);
$("solfaTab").onclick=()=>openSolfa(currentSongId); $("instrumentalTab").onclick=()=>openInstrumental(currentSongId);
$("backFromSolfa").onclick=()=>openSong(currentSongId); $("lyricsFromSolfa").onclick=()=>openSong(currentSongId); $("instrumentalFromSolfa").onclick=()=>openInstrumental(currentSongId);
$("backFromInstrumental").onclick=()=>openSong(currentSongId); $("lyricsFromInstrumental").onclick=()=>openSong(currentSongId); $("solfaFromInstrumental").onclick=()=>openSolfa(currentSongId);
$("playPauseButton").onclick=async()=>{const a=$("instrumentalAudio");if(a.paused){try{await a.play();$("playPauseButton").textContent='❚❚';}catch(e){}}else{a.pause();$("playPauseButton").textContent='▶';}};
$("instrumentalAudio").onloadedmetadata=()=>$("durationTime").textContent=formatTime($("instrumentalAudio").duration);
$("instrumentalAudio").ontimeupdate=()=>{const a=$("instrumentalAudio");if(Number.isFinite(a.duration)&&a.duration>0){$("audioProgress").value=Math.round((a.currentTime/a.duration)*1000);$("currentTime").textContent=formatTime(a.currentTime);}};
$("instrumentalAudio").onended=()=>{$("playPauseButton").textContent='▶';$("audioProgress").value=0;};
$("audioProgress").oninput=()=>{const a=$("instrumentalAudio");if(Number.isFinite(a.duration))a.currentTime=Number($("audioProgress").value)/1000*a.duration;};
window.addEventListener('online',loadCatalog);

if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{}); }
loadCatalog();
