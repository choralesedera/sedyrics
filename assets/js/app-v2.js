const OFFLINE_CACHE="lyricsed-offline-v2";
const CONTENT_CACHE=OFFLINE_CACHE;
const STAGING_PREFIX="lyricsed-staging-v2-";
const SYNC_STATE_KEY="lyricsedOfflineSyncStateV2";
const CATALOG_SNAPSHOT_KEY="lyricsedCatalogSnapshotV2";
const SHELL_FILES=[
  "index.html",
  "assets/css/style-v2.css",
  "assets/js/app-v2.js",
  "assets/images/icon-sedera.png",
  "assets/images/ankino-logo.webp",
  "manifest.webmanifest",
  "sw.js"
];

const $=id=>document.getElementById(id);
const $$=sel=>[...document.querySelectorAll(sel)];
let SONGS=[],ANNOUNCEMENTS=[],APP_VERSION=null,currentSong=null,currentView="home",songFilter="all",
favorites=readJSON("sedyricsFavorites",[]).map(Number),
readerZoom=Number(localStorage.getItem("lyricsedReaderZoom")||100),
audioObjectUrl=null,loopA=null,loopB=null,loopEnabled=false,toastTimer=null,syncInProgress=false,globalAudioMode=null,globalAudioSongId=null,globalAudioTitle="",globalAudioReturnView=null;
const audio=$("audio");

function hasGlobalAudio(){return !!audio.getAttribute('src')}
function isCurrentSongAudio(){return globalAudioMode==='song'&&currentSong&&Number(globalAudioSongId)===Number(currentSong.id)&&hasGlobalAudio()}
function releaseAudioObjectUrl(){if(audioObjectUrl){try{URL.revokeObjectURL(audioObjectUrl)}catch{}audioObjectUrl=null}}
async function setGlobalAudioBlob(blob,{mode,title,songId=null,returnView=null,autoplay=false}={}){
  audio.pause();
  releaseAudioObjectUrl();
  audio.removeAttribute('src');audio.load();
  audioObjectUrl=URL.createObjectURL(blob);
  audio.src=audioObjectUrl;
  globalAudioMode=mode||null;
  globalAudioSongId=songId===null?null:Number(songId);
  globalAudioTitle=title||'Playback';
  globalAudioReturnView=returnView||null;
  audio.load();
  updateGlobalAudioUI();
  if(autoplay)try{await audio.play()}catch{}
}
function clearGlobalAudio(){
  audio.pause();
  audio.removeAttribute('src');audio.load();
  releaseAudioObjectUrl();
  globalAudioMode=null;globalAudioSongId=null;globalAudioTitle='';globalAudioReturnView=null;
  resetLoop();
  updateGlobalAudioUI();
}
function globalPlayPause(){
  if(pendingNextIndex!==null&&globalAudioMode==='event'){launchPendingNextNow();return}
  if(!hasGlobalAudio())return;
  if(audio.paused)audio.play().catch(()=>{});else audio.pause();
}
function updateGlobalAudioUI(){
  updateAudioUI();
  updatePlaylistPlayerUI();
  updateHeaderPlayback();
  updateMiniPlayer();
}

function readJSON(k,fallback){try{const v=JSON.parse(localStorage.getItem(k));return v??fallback}catch{return fallback}}
function writeJSON(k,v){localStorage.setItem(k,JSON.stringify(v))}
function normalize(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function withRevision(path,rev=1){return path||null}
function icon(id){return `<svg><use href="#${id}"/></svg>`}
function songNo(s){return Number(s?.displayNumber||s?.id||0)}
function fmt(sec){if(!Number.isFinite(sec))return"0:00";return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2200)}
function cleanPath(path){return String(path||"").split("?")[0].replace(/^\.?\//,"")}
function reqFor(path){return new Request(new URL(cleanPath(path),location.href).toString(),{method:"GET"})}

async function getAnyCached(path){
  const key=reqFor(path);
  const main=await caches.open(OFFLINE_CACHE);
  let hit=await main.match(key,{ignoreSearch:true});
  if(hit)return hit;

  try{
    hit=await caches.match(key,{ignoreSearch:true});
    if(hit){
      try{await main.put(key,hit.clone())}catch{}
      return hit;
    }
  }catch{}
  return null;
}

async function getCached(path,{timeout=10000}={}){
  const key=reqFor(path);
  const main=await caches.open(OFFLINE_CACHE);
  const cached=await getAnyCached(path);
  if(cached)return cached;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(cleanPath(path),{cache:"no-store",signal:controller.signal});
    if(!r.ok)throw new Error("resource unavailable");
    await main.put(key,r.clone());
    return r;
  }finally{
    clearTimeout(timer);
  }
}

async function networkFetch(path,{timeout=120000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const base=cleanPath(path);
    const url=new URL(base,location.href);
    url.searchParams.set("__network",Date.now().toString());
    const r=await fetch(url.toString(),{cache:"no-store",signal:controller.signal});
    if(!r.ok)throw new Error("network unavailable");
    return r;
  }finally{
    clearTimeout(timer);
  }
}

function resourceRevision(song,kind){
  if(song?.revisions && song.revisions[kind]!==undefined)return Number(song.revisions[kind]||0);
  const legacy=`${kind}Revision`;
  if(song && song[legacy]!==undefined)return Number(song[legacy]||0);
  return Number(song?.revision||1);
}

function resourceDescriptor(song,kind){
  const path=song?.[kind];
  if(!path)return null;
  return {path:cleanPath(path),revision:resourceRevision(song,kind)};
}

function sameDescriptor(a,b){
  return !!a&&!!b&&cleanPath(a.path)===cleanPath(b.path)&&Number(a.revision||0)===Number(b.revision||0);
}

function songMap(doc){
  const out=new Map();
  for(const s of (doc?.songs||[]))out.set(String(s.id),s);
  return out;
}

function setSyncOverlay(show,{title,message,done=0,total=0,retry=false}={}){
  const overlay=$("syncOverlay");
  if(!overlay)return;
  overlay.classList.toggle("hidden",!show);
  if(!show)return;

  if(title)$("syncTitle").textContent=title;
  if(message)$("syncMessage").textContent=message;

  const safeTotal=Math.max(0,Number(total)||0);
  const safeDone=Math.max(0,Math.min(Number(done)||0,safeTotal||0));
  const percent=safeTotal?Math.round((safeDone/safeTotal)*100):0;
  $("syncProgress").style.width=`${percent}%`;
  $("syncCount").textContent=safeTotal?`${safeDone} / ${safeTotal}`:"";
  $("syncPercent").textContent=safeTotal?`${percent}%`:"";
  $("syncRetry").classList.toggle("hidden",!retry);
}

function setUpdateButtonLoading(loading){
  const btn=$("updateBtn");
  if(!btn)return;
  btn.classList.toggle("loading",loading);
  btn.disabled=loading;
  const label=btn.querySelector("span");
  if(label)label.textContent=loading?"Mise à jour":"Actualiser";
}

async function responseDifferent(oldResponse,newResponse){
  if(!oldResponse)return true;
  try{
    const [a,b]=await Promise.all([oldResponse.clone().arrayBuffer(),newResponse.clone().arrayBuffer()]);
    if(a.byteLength!==b.byteLength)return true;
    const aa=new Uint8Array(a),bb=new Uint8Array(b);
    for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return true;
    return false;
  }catch{
    return true;
  }
}

async function putStage(stage,path,response){
  await stage.put(reqFor(path),response.clone());
}

async function forceAppUpdate(){
  await syncOfflineLibrary({manual:true,initial:false});
}

async function loadCatalog(){
  // 1. Show the last known catalog immediately, before any network request.
  const snapshot=readJSON(CATALOG_SNAPSHOT_KEY,null);
  if(snapshot?.songs?.length){
    SONGS=snapshot.songs;
    $("syncPill").textContent="Données locales";
    $("libraryStatus").textContent="Chargement local";
    renderAll();
  }

  // 2. Try the active cache / network, but never leave the screen blank indefinitely.
  try{
    const vr=await getCached("version-v2.json",{timeout:7000});
    APP_VERSION=await vr.json();

    const catalogPath=APP_VERSION.catalog||"data/songs.json";
    const cr=await getCached(catalogPath,{timeout:7000});
    const catalog=await cr.json();

    if(catalog?.songs?.length){
      SONGS=catalog.songs;
      writeJSON(CATALOG_SNAPSHOT_KEY,catalog);
    }

    try{
      const ar=await getCached(APP_VERSION.announcements||"data/announcements.json",{timeout:7000});
      ANNOUNCEMENTS=(await ar.json()).announcements||[];
    }catch{
      ANNOUNCEMENTS=ANNOUNCEMENTS||[];
    }

    const state=readJSON(SYNC_STATE_KEY,null);
    if(state?.complete){
      $("syncPill").textContent=navigator.onLine
        ?`Offline prêt • v${state.contentVersion||APP_VERSION.contentVersion||""}`.replace(/ • v$/,"")
        :"Offline prêt • hors connexion";
      $("libraryStatus").textContent=navigator.onLine?"Données locales prêtes":"Mode hors connexion";
    }else{
      $("syncPill").textContent=SONGS.length?"Préparation offline...":"Première connexion requise";
      $("libraryStatus").textContent=SONGS.length?"Catalogue chargé":"Aucune donnée locale";
    }
    renderAll();
  }catch{
    // Keep showing the local snapshot instead of replacing it with "0 hira".
    if(SONGS.length){
      $("syncPill").textContent=navigator.onLine?"Données locales • vérification...":"Offline • données locales";
      $("libraryStatus").textContent="Données locales disponibles";
      renderAll();
    }else{
      $("syncPill").textContent=navigator.onLine?"Connexion au catalogue...":"Première connexion requise";
      $("libraryStatus").textContent="Aucune donnée locale";
      renderAll();
    }
  }
}
async function syncOfflineLibrary({manual=false,initial=false}={}){
  if(syncInProgress)return false;
  syncInProgress=true;
  setUpdateButtonLoading(true);

  let stageName=null;
  try{
    let versionResponse;
    try{
      versionResponse=await networkFetch("version-v2.json",{timeout:9000});
    }catch{
      const state=readJSON(SYNC_STATE_KEY,null);
      setSyncOverlay(false);
      if(manual)toast("Tsy misy connexion. Ny données offline dia tsy voakitika.");
      $("syncPill").textContent=SONGS.length?"Offline • données locales":"Première connexion requise";
      $("libraryStatus").textContent=SONGS.length?"Données locales disponibles":"Aucune donnée locale";
      return false;
    }

    const remoteVersion=await versionResponse.clone().json();
    const catalogPath=remoteVersion.catalog||"data/songs.json";
    const announcementsPath=remoteVersion.announcements||"data/announcements.json";

    // Core metadata first. These files are small and should never wait for MP3 downloads.
    const [catalogResponse,announcementsResponse]=await Promise.all([
      networkFetch(catalogPath,{timeout:15000}),
      networkFetch(announcementsPath,{timeout:15000})
    ]);

    const remoteCatalog=await catalogResponse.clone().json();
    const remoteAnnouncements=await announcementsResponse.clone().json();
    const remoteSongs=remoteCatalog.songs||[];

    if(!remoteSongs.length)throw new Error("catalog empty");

    const oldCatalog=readJSON(CATALOG_SNAPSHOT_KEY,{songs:[]});
    const oldSongs=songMap(oldCatalog);
    const main=await caches.open(OFFLINE_CACHE);

    const changedResources=[];
    for(const song of remoteSongs){
      const oldSong=oldSongs.get(String(song.id));
      for(const kind of ["lyrics","solfa","instrumental","image"]){
        const now=resourceDescriptor(song,kind);
        if(!now)continue;
        const before=resourceDescriptor(oldSong,kind);
        const cached=await getAnyCached(now.path);
        if(!cached||!sameDescriptor(now,before)){
          if(!changedResources.some(x=>x.path===now.path)){
            changedResources.push({...now,kind,songId:song.id});
          }
        }
      }
    }

    const totalCore=SHELL_FILES.length+3;
    const total=totalCore+changedResources.length;
    let done=0;

    if(initial||manual){
      setSyncOverlay(true,{
        title:initial?"Fanomanana offline":"Mise à jour",
        message:"Chargement du catalogue et de l'interface...",
        done,total
      });
    }

    $("syncPill").textContent="Mise à jour du catalogue...";
    $("libraryStatus").textContent="Synchronisation";

    // Stage only the critical small files atomically.
    stageName=`${STAGING_PREFIX}${Date.now()}`;
    const stage=await caches.open(stageName);
    let shellChanged=false;

    await putStage(stage,"version-v2.json",versionResponse); done++;
    setSyncOverlay(initial||manual,{done,total});
    await putStage(stage,catalogPath,catalogResponse); done++;
    setSyncOverlay(initial||manual,{done,total});
    await putStage(stage,announcementsPath,announcementsResponse); done++;
    setSyncOverlay(initial||manual,{done,total});

    for(const path of SHELL_FILES){
      try{
        const fresh=await networkFetch(path,{timeout:20000});
        const old=await getAnyCached(path);
        if(await responseDifferent(old,fresh))shellChanged=true;
        await putStage(stage,path,fresh);
      }catch{
        // One optional shell refresh must not erase the current app.
      }
      done++;
      setSyncOverlay(initial||manual,{done,total});
    }

    // Promote core/catalog now. The song list becomes usable immediately.
    const stagedRequests=await stage.keys();
    for(const request of stagedRequests){
      const response=await stage.match(request);
      if(response)await main.put(request,response.clone());
    }

    await main.put(reqFor("version-v2.json"),versionResponse.clone());
    await main.put(reqFor(catalogPath),catalogResponse.clone());
    await main.put(reqFor(announcementsPath),announcementsResponse.clone());

    APP_VERSION=remoteVersion;
    SONGS=remoteSongs;
    ANNOUNCEMENTS=remoteAnnouncements.announcements||[];
    writeJSON(CATALOG_SNAPSHOT_KEY,remoteCatalog);
    renderAll();

    $("syncPill").textContent=changedResources.length
      ?`Préparation offline • 0/${changedResources.length}`
      :`Offline prêt • v${remoteVersion.contentVersion||""}`.replace(/ • v$/,"");
    $("libraryStatus").textContent="Catalogue disponible";

    // From this point on, each media/lyrics file is independent.
    // A missing MP3 must not cancel Lyrics, catalogue, or all other songs.
    let completedMedia=0;
    let failedMedia=0;

    for(const item of changedResources){
      try{
        const fresh=await networkFetch(item.path,{
          timeout:item.kind==="instrumental"?180000:30000
        });
        await main.put(reqFor(item.path),fresh.clone());
      }catch{
        failedMedia++;
      }

      completedMedia++;
      done++;
      $("syncPill").textContent=`Préparation offline • ${completedMedia}/${changedResources.length}`;
      $("libraryStatus").textContent=failedMedia
        ?`${failedMedia} fichier${failedMedia>1?"s":""} à reprendre`
        :"Téléchargement des contenus";

      setSyncOverlay(initial||manual,{
        done,total,
        message:`Téléchargement des contenus • ${completedMedia}/${changedResources.length}`
      });
    }

    // The catalog update is valid even if one media file could not be cached.
    writeJSON(SYNC_STATE_KEY,{
      complete:failedMedia===0,
      contentVersion:remoteVersion.contentVersion||0,
      updatedAt:new Date().toISOString(),
      songCount:remoteSongs.length,
      pendingFiles:failedMedia
    });

    try{
      if(navigator.storage?.persist)await navigator.storage.persist();
    }catch{}

    try{
      if("serviceWorker" in navigator){
        const reg=await navigator.serviceWorker.getRegistration();
        if(reg)await reg.update();
      }
    }catch{}

    setSyncOverlay(false);

    if(failedMedia){
      $("syncPill").textContent=`${remoteSongs.length} hira • ${failedMedia} fichier${failedMedia>1?"s":""} à reprendre`;
      $("libraryStatus").textContent="Catalogue prêt • synchronisation partielle";
      if(manual||initial)toast("Catalogue mis à jour. Certains fichiers seront repris à la prochaine connexion.");
    }else{
      $("syncPill").textContent=`Offline prêt • v${remoteVersion.contentVersion||""}`.replace(/ • v$/,"");
      $("libraryStatus").textContent="Données locales prêtes";
      if(manual||initial)toast("Mise à jour terminée • Offline prêt");
    }

    if(shellChanged&&!initial){
      setTimeout(()=>location.reload(),650);
    }
    return true;
  }catch(err){
    // Never blank the library on a synchronization error.
    if(SONGS.length){
      $("syncPill").textContent="Données locales disponibles";
      $("libraryStatus").textContent="Mise à jour à reprendre";
      renderAll();
    }
    setSyncOverlay(false);
    if(manual)toast("Mise à jour interrompue. La bibliothèque actuelle reste disponible.");
    return false;
  }finally{
    if(stageName)try{await caches.delete(stageName)}catch{}
    syncInProgress=false;
    setUpdateButtonLoading(false);
  }
}
function renderAll(){
  $("homeSongCount").textContent=`${SONGS.length} hira`;renderRecent();renderSongs();renderAnnouncements();
}
function recentIds(){return readJSON("sedyricsRecent",[])}
function pushRecent(id){const ids=recentIds().filter(x=>Number(x)!==Number(id));ids.unshift(Number(id));writeJSON("sedyricsRecent",ids.slice(0,5));renderRecent()}
function renderRecent(){
  const host=$("recentSongs");host.innerHTML="";let list=recentIds().map(id=>SONGS.find(s=>Number(s.id)===Number(id))).filter(Boolean);if(!list.length)list=SONGS.slice(0,3);
  if(!list.length){host.innerHTML='<div class="empty-announcement">Tsy mbola misy hira.</div>';return}
  list.slice(0,3).forEach(s=>{const b=document.createElement("button");b.className="recent-song";b.innerHTML=`<span class="num">${String(songNo(s)).padStart(2,"0")}</span><span><strong>${escapeHtml(s.title)}</strong><span>${s.solfa?"Solfa • ":""}${s.instrumental?"Playback":"Lyrics"}</span></span>${icon("i-chevron")}`;b.onclick=()=>openSong(s.id);host.appendChild(b)})
}
function isFav(id){return favorites.includes(Number(id))}
function toggleFav(){if(!currentSong)return;const id=Number(currentSong.id);favorites=isFav(id)?favorites.filter(x=>x!==id):[...favorites,id];writeJSON("sedyricsFavorites",favorites);refreshFavorite();renderSongs();toast(isFav(id)?"Favori ajouté":"Favori retiré")}
function getFilteredSongs(){const q=normalize($("songSearch").value.trim());return SONGS.filter(s=>{const pass=songFilter==="all"||(songFilter==="favorites"&&isFav(s.id))||(songFilter==="lyrics"&&s.lyrics)||(songFilter==="solfa"&&s.solfa)||(songFilter==="instrumental"&&s.instrumental);return pass&&(!q||normalize(s.title).includes(q)||normalize(s.artist).includes(q)||(String(songNo(s)).includes(q)||String(s.id).includes(q)))})}
function songAvailability(s){
  const items=[];
  if(s?.lyrics)items.push({key:'lyrics',label:'Lyrics'});
  if(s?.instrumental)items.push({key:'instrumental',label:'Playback'});
  if(s?.solfa)items.push({key:'solfa',label:'Solfa'});
  return items;
}
function availabilityTags(s){
  const items=songAvailability(s);
  if(!items.length)return '<span class="tiny-tag muted">À venir</span>';
  if(items.length===1)return `<span class="tiny-tag ${items[0].key}">${items[0].label} ihany</span>`;
  return items.map(x=>`<span class="tiny-tag ${x.key}">${x.label}</span>`).join('');
}
function renderSongs(){
  const list=getFilteredSongs(),host=$("songGrid");
  host.innerHTML="";
  $("libraryCount").textContent=`${list.length} hira`;

  if(!list.length){
    host.innerHTML='<div class="empty-announcement">Tsy misy hira hita.</div>';
    return;
  }

  list.forEach(s=>{
    const b=document.createElement("button");
    b.className="song-card";
    const tags=availabilityTags(s);
    b.innerHTML=`<span class="song-num">${String(songNo(s)).padStart(2,"0")}</span><span><h3>${isFav(s.id)?"♥ ":""}${escapeHtml(s.title)}</h3><p>${escapeHtml(s.artist||"")}</p><span class="song-tags">${tags}</span></span><svg class="chev"><use href="#i-chevron"/></svg>`;
    b.onclick=()=>openSong(s.id);
    host.appendChild(b);
  });
}
function renderAnnouncements(){
  const host=$("announcementList");host.innerHTML="";
  if(!ANNOUNCEMENTS.length){host.innerHTML=`<div class="empty-announcement">${icon("i-bell")}<h3>Tsy mbola misy Filazan-draharaha</h3><p>Eto no hiseho ireo vaovao mahakasika ny activité ato amin-tsika.</p></div>`;return}
  ANNOUNCEMENTS.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).forEach(a=>{const el=document.createElement("article");el.className="announcement-card";el.innerHTML=`<span class="date">${escapeHtml(a.date||"")}</span><h3>${escapeHtml(a.title||"")}</h3><p>${escapeHtml(a.body||"")}</p>`;host.appendChild(el)})
}

function setView(name,{push=true}={}){
  currentView=name;
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  if(name==='liturgy'||name==='concert')renderPlaylistUI();
  $("mainHeader").style.display='flex';
  $("bottomNav").style.display=name==='song'?'none':'grid';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  updateEventPlayerVisibility();
  if(push)history.pushState({view:name,songId:currentSong?.id||null},"",`#${name}${name==='song'&&currentSong?'-'+currentSong.id:''}`);
  window.scrollTo(0,0);
}
function restoreState(state){if(state?.view==='song'&&state.songId){openSong(state.songId,{push:false})}else setView(state?.view||'home',{push:false})}

async function openSong(id,{push=true}={}){
  const s=SONGS.find(x=>Number(x.id)===Number(id));if(!s)return;
  currentSong=s;pushRecent(s.id);
  $("detailNumber").textContent=`HIRA ${String(songNo(s)).padStart(2,'0')}`;
  $("detailMiniTitle").textContent=s.title;
  $("detailTitle").textContent=s.title;
  $("detailArtist").textContent=s.artist||"Chorale Sedera Ambalavato";
  $("audioTitle").textContent=`${s.title} • Playback`;
  $("miniTrackTitle").textContent=s.title;

  const available=songAvailability(s);
  $("availabilityBadge").textContent=available.length
    ? available.map(x=>x.label.toUpperCase()).join(" • ")
    : "CONTENU À VENIR";

  $$('[data-song-tab]').forEach(b=>{
    const tab=b.dataset.songTab;
    const enabled=tab==='lyrics'?!!s.lyrics:tab==='solfa'?!!s.solfa:!!s.instrumental;
    b.disabled=!enabled;
    b.hidden=!enabled;
    b.classList.toggle('disabled',!enabled);
    if(!enabled)b.classList.remove('active');
  });

  const tabs=$("songTabs");
  if(tabs){
    tabs.dataset.count=String(Math.max(1,available.length));
    tabs.classList.toggle('single-tab',available.length===1);
    tabs.classList.toggle('no-tabs',available.length===0);
  }

  refreshFavorite();applyReaderZoom();loadSongNote();setView('song',{push});
  const firstTab=s.lyrics?'lyrics':s.solfa?'solfa':s.instrumental?'instrumental':'lyrics';
  setSongTab(firstTab);

  const c=$("creditsCard");c.textContent=s.credits||"";c.style.display=s.credits?"block":"none";
  if(s.lyrics){
    $("lyricsText").innerHTML='<div class="loading-line"></div><br><div class="loading-line"></div><br><div class="loading-line"></div>';
    try{const r=await getCached(withRevision(s.lyrics,resourceRevision(s,'lyrics')));$("lyricsText").textContent=(await r.text()).trim()}
    catch{$("lyricsText").textContent="Tononkira tsy azo vakiana amin'izao fotoana izao."}
  }else{
    $("lyricsText").textContent=currentSong?.instrumental
      ?"Tsy mbola misy Lyrics ho an'ity hira ity. Playback ihany no misy amin'izao fotoana izao."
      :"Tsy mbola misy Lyrics ho an'ity hira ity.";
  }
  applyReaderZoom();loadSolfa();loadInstrumental();renderMarkers();updateHeaderPlayback();
}
function refreshFavorite(){if(!currentSong)return;$("favoriteBtn").classList.toggle('active',isFav(currentSong.id))}
function applyReaderZoom(){
  readerZoom=Math.min(180,Math.max(70,Number(readerZoom)||100));
  const scale=readerZoom/100;
  if($("lyricsText"))$("lyricsText").style.fontSize=`${(18*scale).toFixed(1)}px`;
  const img=$("solfaContent")?.querySelector('img');
  if(img){img.style.width=`${readerZoom}%`;img.style.maxWidth='none'}
  if($("fontSizeValue"))$("fontSizeValue").textContent=`${readerZoom}%`;
  localStorage.setItem('lyricsedReaderZoom',String(readerZoom));
}
function setSongTab(tab){
  const btn=$(`[data-song-tab="${tab}"]`);
  if(btn?.disabled)return;
  $$('[data-song-tab]').forEach(b=>b.classList.toggle('active',b.dataset.songTab===tab));
  ['lyrics','solfa','instrumental'].forEach(x=>$(x+'Panel').classList.toggle('active',x===tab));
  $("readerZoomBar")?.classList.toggle('hidden',tab==='instrumental');
  if(tab==='solfa')applyReaderZoom();
  if(tab==='instrumental')setTimeout(()=>$("advancedPlayer").scrollIntoView({behavior:'smooth',block:'nearest'}),60)
}

async function loadSolfa(){
  const host=$("solfaContent");
  if(!currentSong?.solfa){
    host.innerHTML=`<div class="empty-panel"><span class="empty-icon">${icon("i-note")}</span><h3>Solfa à venir</h3><p>Mbola tsy misy solfa ho an'ity hira ity.</p></div>`;
    return;
  }
  host.innerHTML='<div class="loading-line"></div>';
  try{
    const r=await getCached(withRevision(currentSong.solfa,resourceRevision(currentSong,'solfa')));
    const blob=await r.blob();
    host.innerHTML=`<div class="solfa-view"><img alt="Solfa ${escapeHtml(currentSong.title)}"></div>`;
    host.querySelector('img').src=URL.createObjectURL(blob);
    applyReaderZoom();
  }catch{
    host.innerHTML=`<div class="empty-panel"><h3>Solfa tsy azo vakiana offline</h3></div>`;
  }
}

async function loadInstrumental(){
  const player=$("advancedPlayer"),empty=$("instrumentalEmpty"),mini=$("persistentPlayer");
  if(!currentSong?.instrumental){
    player.classList.remove('active');empty.classList.remove('hidden');mini.classList.remove('active');
    updateAudioUI();return;
  }
  player.classList.add('active');empty.classList.add('hidden');mini.classList.add('active');
  try{
    const cached=await getAnyCached(withRevision(currentSong.instrumental,resourceRevision(currentSong,'instrumental')));
    $("audioCacheBadge").textContent=isCurrentSongAudio()?'En cours':cached?'Offline prêt':'Prêt';
  }catch{$("audioCacheBadge").textContent='Prêt'}
  updateAudioUI();
}
async function ensureSongAudioLoaded(song,autoplay=false){
  if(!song?.instrumental)return false;
  if(globalAudioMode==='song'&&Number(globalAudioSongId)===Number(song.id)&&hasGlobalAudio()){
    if(autoplay&&audio.paused)try{await audio.play()}catch{}
    updateGlobalAudioUI();return true;
  }
  cancelPlaylistCountdown();
  playlistQueue=[];playlistIndex=-1;playlistOriginType=null;
  resetLoop();
  $("audioCacheBadge").textContent='Chargement...';
  try{
    const path=withRevision(song.instrumental,resourceRevision(song,'instrumental'));
    const cached=await getAnyCached(path);
    const r=cached||await getCached(path);
    const blob=await r.blob();
    await setGlobalAudioBlob(blob,{mode:'song',title:song.title,songId:song.id,returnView:'song',autoplay});
    $("audioCacheBadge").textContent=cached?'Offline prêt':'Téléchargé';
    return true;
  }catch{
    $("audioCacheBadge").textContent='Indisponible';
    toast('Playback indisponible.');
    return false;
  }
}
async function playPause(){
  if(!currentSong?.instrumental)return;
  if(!isCurrentSongAudio()){await ensureSongAudioLoaded(currentSong,true);return}
  globalPlayPause();
}
function seekBy(delta){
  if(!isCurrentSongAudio()||!Number.isFinite(audio.duration))return;
  audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+delta));
}
function updateAudioUI(){
  const same=isCurrentSongAudio();
  const playing=same&&!audio.paused;
  const use=playing?'i-pause':'i-play';
  if($("mainPlayBtn"))$("mainPlayBtn").innerHTML=icon(use);
  if($("miniPlay"))$("miniPlay").innerHTML=icon(use);
  if($("playingBars"))$("playingBars").classList.toggle('active',playing);
  const now=same?audio.currentTime:0,dur=same?audio.duration:0;
  if($("elapsed"))$("elapsed").textContent=fmt(now);
  if($("duration"))$("duration").textContent=fmt(dur);
  if($("miniTrackTime"))$("miniTrackTime").textContent=same?`${fmt(now)} / ${fmt(dur)}`:'Prêt';
  if($("seekBar"))$("seekBar").value=(same&&Number.isFinite(dur)&&dur>0)?Math.round(now/dur*1000):0;
  if($("audioTitle"))$("audioTitle").textContent=same?`${globalAudioTitle} • Playback`:`${currentSong?.title||'Instrumental'} • Playback`;
  if($("volumeBar"))$("volumeBar").value=Math.round(audio.volume*100);if($("volumeValue"))$("volumeValue").textContent=`${Math.round(audio.volume*100)}%`;
}
function pauseAudio(reset=false){audio.pause();if(reset&&Number.isFinite(audio.duration))audio.currentTime=0;updateGlobalAudioUI()}
function resetLoop(){loopA=null;loopB=null;loopEnabled=false;$("aTime").textContent='--:--';$("bTime").textContent='--:--';$("toggleLoop").classList.remove('active')}
function markerKey(){return currentSong?`sedyricsMarkers:${currentSong.id}`:'sedyricsMarkers:none'}
function hiddenMarkerKey(){return currentSong?`sedyricsHiddenMarkers:${currentSong.id}`:'sedyricsHiddenMarkers:none'}
function markerSignature(m){return `${String(m.label||'')}|${Number(m.time)||0}`}
function localMarkers(){return readJSON(markerKey(),[])}
function hiddenMarkers(){return readJSON(hiddenMarkerKey(),[])}
function removeMarker(marker){
  if(!currentSong)return;
  const sig=markerSignature(marker);

  if(marker.source==='local'){
    const next=localMarkers().filter(m=>markerSignature(m)!==sig);
    writeJSON(markerKey(),next);
  }else{
    const hidden=hiddenMarkers();
    if(!hidden.includes(sig))hidden.push(sig);
    writeJSON(hiddenMarkerKey(),hidden);
  }

  renderMarkers();
  toast('Repère supprimé');
}
function renderMarkers(){
  const host=$("markerList");
  host.innerHTML='';
  const hidden=hiddenMarkers();
  const cat=(currentSong?.markers||[])
    .map(m=>({...m,source:'catalog'}))
    .filter(m=>!hidden.includes(markerSignature(m)));
  const local=localMarkers().map(m=>({...m,source:'local'}));
  const all=[...cat,...local].sort((a,b)=>a.time-b.time);

  if(!all.length){
    host.innerHTML='<span style="color:#78909E;font-size:9px">Tsy mbola misy repère. Afaka manampy eto ambany ianao.</span>';
    return;
  }

  all.forEach(m=>{
    const wrap=document.createElement('span');
    wrap.className='marker-item';

    const jump=document.createElement('button');
    jump.className='marker-chip';
    jump.innerHTML=`${escapeHtml(m.label)} <small>${fmt(Number(m.time))}</small>`;
    jump.onclick=async()=>{if(!isCurrentSongAudio())await ensureSongAudioLoaded(currentSong,false);if(isCurrentSongAudio())audio.currentTime=Number(m.time)||0;toast(`Repère: ${m.label}`)};

    const del=document.createElement('button');
    del.className='marker-delete';
    del.type='button';
    del.title='Supprimer ce repère';
    del.setAttribute('aria-label',`Supprimer ${m.label}`);
    del.innerHTML=icon('i-close');
    del.onclick=e=>{e.stopPropagation();removeMarker(m)};

    wrap.appendChild(jump);
    wrap.appendChild(del);
    host.appendChild(wrap);
  });
}
function addMarker(){
  if(!currentSong)return;
  const label=$("markerLabel").value.trim();
  if(!label){toast('Ampidiro ny anaran\'ny repère');return}
  if(!isCurrentSongAudio()){toast('Lancez d’abord ce playback.');return}
  const list=localMarkers();
  list.push({label,time:Math.round(audio.currentTime*10)/10});
  writeJSON(markerKey(),list);
  $("markerLabel").value='';
  renderMarkers();
  toast('Repère voatahiry');
}
function noteKey(){return currentSong?`sedyricsSongNote:${currentSong.id}`:'none'}
function loadSongNote(){$("songNote").value=localStorage.getItem(noteKey())||'';$("songNoteSaved").textContent='Voatahiry'}
function autosave(el,key,status){localStorage.setItem(key,el.value);status.textContent='Voatahiry';status.style.color='#059669'}

function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}


// ---------- Liturgie / Concert playlists ----------
const PLAYLIST_KEY='lyricsedEventPlaylistsV1';
const PLAYLIST_DELAY_KEY='lyricsedPlaylistDelaySettingsV2';
const LOCAL_AUDIO_DB='lyricsed-local-audio-v1';
const LOCAL_AUDIO_STORE='audio';
// Liturgie, Concert, Antsam-panahy et Playback utilisent tous le même élément audio global.

let playlistTarget=null;
let playlistQueue=[];
let playlistIndex=-1;
let playlistOriginType=null;
let countdownTimer=null;
let countdownRemaining=0;
let pendingNextIndex=null;

function defaultPlaylists(){
  return {
    liturgy:{prelude:[],interlude:[],rakitra:[],postlude:[]},
    concert:{part1:[],part2:[],part3:[]}
  };
}
function getPlaylists(){
  const saved=readJSON(PLAYLIST_KEY,null);
  const base=defaultPlaylists();
  if(!saved)return base;
  for(const type of Object.keys(base)){
    for(const section of Object.keys(base[type])){
      if(Array.isArray(saved?.[type]?.[section]))base[type][section]=saved[type][section];
    }
  }
  return base;
}
function savePlaylists(data){writeJSON(PLAYLIST_KEY,data)}

function defaultDelaySettings(){
  return {
    liturgy:{mode:'0',custom:10},
    concert:{mode:'0',custom:10}
  };
}
function getDelaySettings(){
  const saved=readJSON(PLAYLIST_DELAY_KEY,null);
  const base=defaultDelaySettings();
  if(!saved)return base;
  for(const type of ['liturgy','concert']){
    if(saved[type]){
      base[type].mode=String(saved[type].mode??'0');
      base[type].custom=Math.min(300,Math.max(1,Number(saved[type].custom)||10));
    }
  }
  return base;
}
function saveDelaySettings(settings){writeJSON(PLAYLIST_DELAY_KEY,settings)}
function getGlobalDelay(type){
  const s=getDelaySettings()[type]||{mode:'0',custom:10};
  if(s.mode==='custom')return Number(s.custom)||0;
  return Number(s.mode)||0;
}
function currentItemDelay(item){
  if(item && item.delayAfter!==undefined && item.delayAfter!==null && item.delayAfter!=='global'){
    return Math.max(0,Number(item.delayAfter)||0);
  }
  return getGlobalDelay(item?._type||playlistOriginType||'liturgy');
}
function syncDelayControls(type){
  const settings=getDelaySettings();
  const select=$(`${type}PauseSelect`);
  const customWrap=$(`${type}CustomDelay`);
  const customInput=$(`${type}PauseCustom`);
  if(!select||!customWrap||!customInput)return;
  select.value=settings[type].mode;
  customInput.value=settings[type].custom;
  customWrap.classList.toggle('hidden',settings[type].mode!=='custom');
}
function bindDelayControls(type){
  const select=$(`${type}PauseSelect`);
  const customInput=$(`${type}PauseCustom`);
  if(!select||!customInput)return;
  select.onchange=()=>{
    const settings=getDelaySettings();
    settings[type].mode=select.value;
    saveDelaySettings(settings);
    syncDelayControls(type);
    renderPlaylistUI();
  };
  customInput.oninput=()=>{
    const settings=getDelaySettings();
    settings[type].custom=Math.min(300,Math.max(1,Number(customInput.value)||1));
    saveDelaySettings(settings);
  };
}

function parsePlaylistTarget(value){
  const [type,section]=String(value||'').split(':');
  if(!type||!section)return null;
  return {type,section};
}
function playlistSectionLabel(type,section){
  const labels={
    'liturgy:prelude':'Prélude',
    'liturgy:interlude':'Interlude',
    'liturgy:rakitra':'Rakitra',
    'liturgy:postlude':'Postlude',
    'concert:part1':'Partie I',
    'concert:part2':'Partie II',
    'concert:part3':'Partie III'
  };
  return labels[`${type}:${section}`]||'PLAYLIST';
}
function playlistSectionOrder(type){
  return type==='liturgy'
    ?['prelude','interlude','rakitra','postlude']
    :['part1','part2','part3'];
}
function createPlaylistItemId(prefix='item'){
  try{return `${prefix}-${crypto.randomUUID()}`}catch{return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`}
}
function humanFileSize(bytes){
  const n=Number(bytes)||0;
  if(n<1024*1024)return `${Math.max(1,Math.round(n/1024))} Ko`;
  return `${(n/1024/1024).toFixed(1)} Mo`;
}

function renderPlaylistUI(){
  syncDelayControls('liturgy');
  syncDelayControls('concert');
  const data=getPlaylists();
  for(const type of ['liturgy','concert']){
    for(const section of playlistSectionOrder(type)){
      renderPlaylistSection(type,section,data[type][section]||[]);
    }
  }
  updatePlaylistPlayerUI();
}

function delaySelectHTML(item){
  const current=item.delayAfter===undefined||item.delayAfter===null?'global':String(item.delayAfter);
  const opts=[
    ['global','Global'],
    ['0','0 s'],
    ['5','5 s'],
    ['10','10 s'],
    ['15','15 s'],
    ['30','30 s']
  ];
  return `<label class="track-delay"><span>Pause après</span><select data-track-delay>${opts.map(([v,l])=>`<option value="${v}"${v===current?' selected':''}>${l}</option>`).join('')}</select></label>`;
}

function renderPlaylistSection(type,section,items){
  const host=$(`playlist-${type}-${section}`);
  if(!host)return;
  host.innerHTML='';

  if(!items.length){
    host.innerHTML='<div class="playlist-empty">Tsy mbola misy playback voafidy.</div>';
    return;
  }

  items.forEach((item,index)=>{
    const row=document.createElement('div');
    row.className='playlist-track';
    const source=item.source==='local'?'Téléphone':'LyriCSED';
    const detail=item.source==='local'
      ?`${source} • ${humanFileSize(item.size)}`
      :`${source}${item.artist?` • ${escapeHtml(item.artist)}`:''}`;

    row.innerHTML=`
      <span class="playlist-track-num">${String(index+1).padStart(2,'0')}</span>
      <span class="playlist-track-copy">
        <strong>${escapeHtml(item.title||'Playback')}</strong>
        <span>${detail}</span>
        ${delaySelectHTML(item)}
      </span>
      <span class="playlist-track-actions">
        <button type="button" data-track-action="up" title="Monter">${icon('i-up')}</button>
        <button type="button" data-track-action="down" title="Descendre">${icon('i-down')}</button>
        <button type="button" class="remove-track" data-track-action="remove" title="Supprimer">${icon('i-trash')}</button>
      </span>`;

    row.querySelector('[data-track-action="up"]').onclick=()=>movePlaylistItem(type,section,index,-1);
    row.querySelector('[data-track-action="down"]').onclick=()=>movePlaylistItem(type,section,index,1);
    row.querySelector('[data-track-action="remove"]').onclick=()=>removePlaylistItem(type,section,index);

    const delaySelect=row.querySelector('[data-track-delay]');
    delaySelect.onchange=()=>{
      const data=getPlaylists();
      const target=data[type][section][index];
      if(!target)return;
      target.delayAfter=delaySelect.value==='global'?null:Number(delaySelect.value);
      savePlaylists(data);
      toast(delaySelect.value==='global'?'Pause globale utilisée':`Pause après ce playback : ${delaySelect.value} s`);
    };

    host.appendChild(row);
  });
}

function movePlaylistItem(type,section,index,delta){
  const data=getPlaylists();
  const list=data[type][section];
  const next=index+delta;
  if(next<0||next>=list.length)return;
  [list[index],list[next]]=[list[next],list[index]];
  savePlaylists(data);
  renderPlaylistUI();
}

async function removePlaylistItem(type,section,index){
  const data=getPlaylists();
  const [removed]=data[type][section].splice(index,1);
  if(!removed)return;
  savePlaylists(data);
  renderPlaylistUI();

  if(removed.source==='local'&&removed.blobId){
    const stillUsed=Object.values(getPlaylists()).some(group=>
      Object.values(group).some(list=>list.some(x=>x.source==='local'&&x.blobId===removed.blobId))
    );
    if(!stillUsed)try{await deleteLocalAudio(removed.blobId)}catch{}
  }
  toast('Playback supprimé de la playlist');
}

function openLocalAudioDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(LOCAL_AUDIO_DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(LOCAL_AUDIO_STORE))db.createObjectStore(LOCAL_AUDIO_STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function putLocalAudio(record){
  const db=await openLocalAudioDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOCAL_AUDIO_STORE,'readwrite');
    tx.objectStore(LOCAL_AUDIO_STORE).put(record);
    tx.oncomplete=()=>{db.close();resolve(true)};
    tx.onerror=()=>{db.close();reject(tx.error)};
  });
}
async function getLocalAudio(id){
  const db=await openLocalAudioDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOCAL_AUDIO_STORE,'readonly');
    const req=tx.objectStore(LOCAL_AUDIO_STORE).get(id);
    req.onsuccess=()=>{db.close();resolve(req.result||null)};
    req.onerror=()=>{db.close();reject(req.error)};
  });
}
async function deleteLocalAudio(id){
  const db=await openLocalAudioDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(LOCAL_AUDIO_STORE,'readwrite');
    tx.objectStore(LOCAL_AUDIO_STORE).delete(id);
    tx.oncomplete=()=>{db.close();resolve(true)};
    tx.onerror=()=>{db.close();reject(tx.error)};
  });
}

function openLibraryPicker(target){
  playlistTarget=parsePlaylistTarget(target);
  if(!playlistTarget)return;
  $("playlistLibrarySearch").value='';
  renderLibraryPicker();
  $("libraryPicker").classList.remove('hidden');
  $("libraryPicker").setAttribute('aria-hidden','false');
}
function closeLibraryPicker(){
  $("libraryPicker").classList.add('hidden');
  $("libraryPicker").setAttribute('aria-hidden','true');
}
function renderLibraryPicker(){
  const q=normalize($("playlistLibrarySearch").value.trim());
  const host=$("playlistLibraryList");
  host.innerHTML='';
  const available=SONGS.filter(s=>s.instrumental&&(!q||normalize(s.title).includes(q)||normalize(s.artist).includes(q)||(String(songNo(s)).includes(q)||String(s.id).includes(q))));

  if(!available.length){
    host.innerHTML='<div class="playlist-empty">Tsy misy playback hita.</div>';
    return;
  }

  available.forEach(song=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='picker-song';
    b.innerHTML=`<span class="picker-num">${String(songNo(song)).padStart(2,'0')}</span><span><strong>${escapeHtml(song.title)}</strong><small>${escapeHtml(song.artist||'')}</small></span>${icon('i-plus')}`;
    b.onclick=()=>addLibraryTrack(song);
    host.appendChild(b);
  });
}
function addLibraryTrack(song){
  if(!playlistTarget||!song?.instrumental)return;
  const data=getPlaylists();
  data[playlistTarget.type][playlistTarget.section].push({
    id:createPlaylistItemId('lib'),
    source:'library',
    songId:Number(song.id),
    title:song.title,
    artist:song.artist||'',
    instrumental:song.instrumental,
    delayAfter:null
  });
  savePlaylists(data);
  renderPlaylistUI();
  closeLibraryPicker();
  toast('Playback ajouté');
}
async function importLocalFiles(files){
  if(!playlistTarget||!files?.length)return;
  const data=getPlaylists();
  const dest=data[playlistTarget.type][playlistTarget.section];
  let added=0;

  for(const file of [...files]){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    const allowed=['mp3','wav','mpeg','mpga','m4a','aac','ogg','flac'];
    if(!(String(file.type||'').startsWith('audio/')||allowed.includes(ext)))continue;

    const blobId=createPlaylistItemId('audio');
    try{
      await putLocalAudio({
        id:blobId,
        name:file.name,
        type:file.type||'audio/*',
        size:file.size,
        addedAt:Date.now(),
        blob:file
      });
      dest.push({
        id:createPlaylistItemId('local'),
        source:'local',
        blobId,
        title:file.name.replace(/\.[^.]+$/,''),
        filename:file.name,
        size:file.size,
        type:file.type||'',
        delayAfter:null
      });
      added++;
    }catch{
      toast('Impossible de stocker un fichier audio');
    }
  }

  if(added){
    savePlaylists(data);
    renderPlaylistUI();
    toast(`${added} playback${added>1?'s':''} ajouté${added>1?'s':''} et enregistré${added>1?'s':''} localement`);
  }
  $("localAudioPicker").value='';
}

function buildPlaylistQueue(type,onlySection=null){
  const data=getPlaylists();
  const sections=onlySection?[onlySection]:playlistSectionOrder(type);
  const queue=[];
  for(const section of sections){
    for(const item of data[type][section]||[]){
      queue.push({...item,_type:type,_section:section,_sectionLabel:playlistSectionLabel(type,section)});
    }
  }
  return queue;
}

async function playEvent(type,section=null){
  const queue=buildPlaylistQueue(type,section);
  if(!queue.length){toast('Tsy mbola misy playback ao amin’ity playlist ity');return}

  pauseAudio(false);
  cancelPlaylistCountdown();
  playlistQueue=queue;
  playlistIndex=0;
  playlistOriginType=type;
  updateEventPlayerVisibility(true);
  await loadPlaylistQueueItem(0,true);
}

async function loadPlaylistQueueItem(index,autoplay=true){
  if(index<0||index>=playlistQueue.length)return;
  cancelPlaylistCountdown();
  playlistIndex=index;
  const item=playlistQueue[index];
  resetLoop();

  try{
    let blob;
    if(item.source==='local'){
      const record=await getLocalAudio(item.blobId);
      if(!record?.blob)throw new Error('local audio missing');
      blob=record.blob;
    }else{
      const song=SONGS.find(s=>Number(s.id)===Number(item.songId));
      const path=song?.instrumental||item.instrumental;
      if(!path)throw new Error('library audio missing');
      const response=await getCached(path);
      blob=await response.blob();
    }
    await setGlobalAudioBlob(blob,{mode:'event',title:item.title||'Playback',returnView:playlistOriginType||item._type,autoplay});
    updateGlobalAudioUI();
  }catch{
    toast('Playback indisponible. Vérifiez qu’il est bien enregistré offline.');
    updateGlobalAudioUI();
  }
}

function cancelPlaylistCountdown(){
  if(countdownTimer){
    clearInterval(countdownTimer);
    countdownTimer=null;
  }
  countdownRemaining=0;
  pendingNextIndex=null;
  $("eventCountdown")?.classList.add('hidden');
}

function startPlaylistCountdown(seconds,nextIndex){
  cancelPlaylistCountdown();
  countdownRemaining=Math.max(0,Math.round(Number(seconds)||0));
  pendingNextIndex=nextIndex;

  if(countdownRemaining<=0){
    loadPlaylistQueueItem(nextIndex,true);
    return;
  }

  $("eventCountdown").classList.remove('hidden');
  $("countdownSeconds").textContent=countdownRemaining;
  updatePlaylistPlayerUI();

  countdownTimer=setInterval(()=>{
    countdownRemaining--;
    $("countdownSeconds").textContent=Math.max(0,countdownRemaining);
    updatePlaylistPlayerUI();

    if(countdownRemaining<=0){
      const target=pendingNextIndex;
      cancelPlaylistCountdown();
      if(target!==null)loadPlaylistQueueItem(target,true);
    }
  },1000);
}

function handlePlaylistEnded(){
  if(playlistIndex+1>=playlistQueue.length){
    cancelPlaylistCountdown();
    audio.pause();
    toast('Fin de la playlist');
    updateGlobalAudioUI();
    return;
  }

  const current=playlistQueue[playlistIndex];
  const delay=currentItemDelay(current);

  if(delay>0)startPlaylistCountdown(delay,playlistIndex+1);
  else loadPlaylistQueueItem(playlistIndex+1,true);
}

function launchPendingNextNow(){
  if(pendingNextIndex===null)return;
  const target=pendingNextIndex;
  cancelPlaylistCountdown();
  loadPlaylistQueueItem(target,true);
}

function stopPlaylistPlayback(hide=true){
  cancelPlaylistCountdown();
  if(globalAudioMode==='event')clearGlobalAudio();
  playlistQueue=[];playlistIndex=-1;playlistOriginType=null;
  if(hide)closeGlobalMiniPlayer();
  updateGlobalAudioUI();
}
function stopGlobalPlayback(){
  cancelPlaylistCountdown();
  clearGlobalAudio();
  playlistQueue=[];playlistIndex=-1;playlistOriginType=null;
  closeGlobalMiniPlayer();
  updateGlobalAudioUI();
}
function playlistPlayPause(){globalPlayPause()}
function playlistNext(){
  if(globalAudioMode!=='event')return;
  cancelPlaylistCountdown();
  if(playlistIndex+1<playlistQueue.length)loadPlaylistQueueItem(playlistIndex+1,true);
  else{audio.pause();toast('Fin de la playlist');updateGlobalAudioUI()}
}
function playlistPrev(){
  if(globalAudioMode!=='event')return;
  cancelPlaylistCountdown();
  if(playlistIndex>0)loadPlaylistQueueItem(playlistIndex-1,true);
  else if(Number.isFinite(audio.duration))audio.currentTime=0;
}

function currentQueueItem(){return playlistQueue[playlistIndex]||null}
function nextQueueItem(){return playlistQueue[playlistIndex+1]||null}

function renderUpcoming(){
  const host=$("eventUpcomingList");if(!host)return;host.innerHTML='';
  if(globalAudioMode!=='event'){
    host.innerHTML='<small>Aucun morceau suivant</small>';return;
  }
  const upcoming=playlistQueue.slice(playlistIndex+1,playlistIndex+4);
  if(!upcoming.length){host.innerHTML='<small>Aucun morceau suivant</small>';return}
  upcoming.forEach((item,i)=>{
    const row=document.createElement('div');row.className='up-next-item';
    row.innerHTML=`<span>${String(playlistIndex+i+2).padStart(2,'0')}</span><strong>${escapeHtml(item.title||'Playback')}</strong>`;
    host.appendChild(row);
  });
}
function updateEventPlayerVisibility(){
  const player=$("eventPlayer");if(!player)return;
  player.classList.toggle('active',currentView==='liturgy'||currentView==='concert');
}
function updateHeaderPlayback(){
  const chip=$("headerPlayback");if(!chip)return;
  const active=hasGlobalAudio()||pendingNextIndex!==null;
  chip.classList.toggle('hidden',!active);if(!active)return;
  const waiting=globalAudioMode==='event'&&pendingNextIndex!==null;
  const playing=hasGlobalAudio()&&!audio.paused&&!waiting;
  const next=nextQueueItem();
  const title=waiting?`Pause ${countdownRemaining}s • ${next?.title||'Suivant'}`:(globalAudioTitle||'Playback');
  chip.classList.toggle('playing',playing);chip.classList.toggle('waiting',waiting);
  $("headerPlaybackTitle").textContent=title;
  $("headerPlaybackToggle").innerHTML=icon(playing?'i-pause':'i-play');
  if($("headerPlaybackTime"))$("headerPlaybackTime").textContent=waiting?`${countdownRemaining}s`:`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
}
function updateMiniPlayer(){
  if(!$("miniGlobalTitle"))return;
  const next=globalAudioMode==='event'?nextQueueItem():null;
  $("miniGlobalTitle").textContent=globalAudioTitle||'Aucun playback';
  $("miniGlobalNext").textContent=next?`Prochain : ${next.title}`:(globalAudioMode==='song'?'Playback global':'Prochain : aucun');
  $("miniGlobalPlay").innerHTML=icon(!audio.paused&&hasGlobalAudio()?'i-pause':'i-play');
  if($("miniGlobalElapsed"))$("miniGlobalElapsed").textContent=fmt(audio.currentTime);
  if($("miniGlobalDuration"))$("miniGlobalDuration").textContent=fmt(audio.duration);
  if($("miniGlobalSeek"))$("miniGlobalSeek").value=(Number.isFinite(audio.duration)&&audio.duration>0)?Math.round(audio.currentTime/audio.duration*1000):0;
  const eventMode=globalAudioMode==='event';
  $("miniGlobalPrev").disabled=!eventMode;$("miniGlobalNextBtn").disabled=!eventMode;
}
function updatePlaylistPlayerUI(){
  if(!$("eventPlayBtn"))return;
  const eventMode=globalAudioMode==='event';
  const item=eventMode?currentQueueItem():null;
  const next=eventMode?nextQueueItem():null;
  const playing=hasGlobalAudio()&&!audio.paused&&pendingNextIndex===null;
  $("eventPlayBtn").innerHTML=icon(playing?'i-pause':'i-play');
  $("eventElapsed").textContent=fmt(audio.currentTime||0);$("eventDuration").textContent=fmt(audio.duration||0);
  $("eventSeek").value=(Number.isFinite(audio.duration)&&audio.duration>0)?Math.round(audio.currentTime/audio.duration*1000):0;
  $("eventPlayerSection").textContent=eventMode?(item?._sectionLabel||'Playlist'):'Playback';
  $("eventPlayerTitle").textContent=globalAudioTitle||'Aucun playback';
  $("eventNextTitle").textContent=next?`Prochain : ${next.title}`:'Prochain : aucun';
  $("eventQueuePosition").textContent=eventMode&&playlistQueue.length?`${playlistIndex+1} / ${playlistQueue.length}`:'—';
  $("eventQueueMode").textContent=pendingNextIndex!==null?`Pause • prochain dans ${countdownRemaining} s`:eventMode?`Pause après : ${item?currentItemDelay(item):0} s`:'Lecteur global';
  $("eventVolume").value=Math.round(audio.volume*100);$("eventVolumeValue").textContent=`${Math.round(audio.volume*100)}%`;
  $("eventPrevBtn").disabled=!eventMode;$("eventNextBtn").disabled=!eventMode;
  renderUpcoming();updateEventPlayerVisibility();
}
function openGlobalMiniPlayer(){
  if(!hasGlobalAudio()&&pendingNextIndex===null)return;
  updateMiniPlayer();$("globalMiniPlayer").classList.remove('hidden');$("globalMiniPlayer").setAttribute('aria-hidden','false');
}
function closeGlobalMiniPlayer(){$("globalMiniPlayer")?.classList.add('hidden');$("globalMiniPlayer")?.setAttribute('aria-hidden','true')}
function returnToPlaylistPlayer(){
  closeGlobalMiniPlayer();
  if(globalAudioMode==='event'){
    setView(playlistOriginType==='concert'?'concert':'liturgy');
    setTimeout(()=>$("eventPlayer")?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    return;
  }
  if(globalAudioMode==='song'&&globalAudioSongId!==null){
    openSong(globalAudioSongId).then(()=>{setSongTab('instrumental');setTimeout(()=>$("advancedPlayer")?.scrollIntoView({behavior:'smooth',block:'center'}),80)});
  }
}

// Add / import / play actions
$$('[data-add-library]').forEach(b=>b.onclick=()=>openLibraryPicker(b.dataset.addLibrary));
$$('[data-add-phone]').forEach(b=>b.onclick=()=>{
  playlistTarget=parsePlaylistTarget(b.dataset.addPhone);
  if(!playlistTarget)return;
  $("localAudioPicker").click();
});
$$('[data-play-event]').forEach(b=>b.onclick=()=>playEvent(b.dataset.playEvent));
$$('[data-play-section]').forEach(b=>b.onclick=()=>{
  const target=parsePlaylistTarget(b.dataset.playSection);
  if(target)playEvent(target.type,target.section);
});

$("closeLibraryPicker").onclick=closeLibraryPicker;
$("libraryPicker").addEventListener('click',e=>{if(e.target===$("libraryPicker"))closeLibraryPicker()});
$("playlistLibrarySearch").oninput=renderLibraryPicker;
$("localAudioPicker").addEventListener('change',e=>importLocalFiles(e.target.files));

$("eventPlayBtn").onclick=globalPlayPause;
$("eventNextBtn").onclick=playlistNext;
$("eventPrevBtn").onclick=playlistPrev;
$("eventStopBtn").onclick=stopGlobalPlayback;
$("playNextNow").onclick=launchPendingNextNow;

$("eventSeek").oninput=()=>{
  if(Number.isFinite(audio.duration))audio.currentTime=Number($("eventSeek").value)/1000*audio.duration;updateGlobalAudioUI();
};
$("eventVolume").oninput=()=>{
  audio.volume=Number($("eventVolume").value)/100;
  $("eventVolumeValue").textContent=`${$("eventVolume").value}%`;
};

$("headerPlayback").onclick=openGlobalMiniPlayer;
$("headerPlaybackToggle").onclick=e=>{e.stopPropagation();globalPlayPause()};
$("closeGlobalMiniPlayer").onclick=closeGlobalMiniPlayer;
$("globalMiniPlayer").addEventListener('click',e=>{if(e.target===$("globalMiniPlayer"))closeGlobalMiniPlayer()});
$("miniGlobalPlay").onclick=globalPlayPause;
$("miniGlobalNextBtn").onclick=playlistNext;
$("miniGlobalPrev").onclick=playlistPrev;
$("returnToPlayer").onclick=returnToPlaylistPlayer;
$("miniGlobalSeek").oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Number($("miniGlobalSeek").value)/1000*audio.duration;updateGlobalAudioUI()};

bindDelayControls('liturgy');
bindDelayControls('concert');






let pendingFacebookLink=null;

function nativeMessage(action,value=''){
  const payload=`LYRICSED::${action}::${String(value||'')}`;
  try{
    if(window.Kodular&&typeof window.Kodular.setWebViewString==='function'){
      window.Kodular.setWebViewString(`${payload}::${Date.now()}`);
      return true;
    }
  }catch{}
  try{
    if(window.AppInventor&&typeof window.AppInventor.setWebViewString==='function'){
      window.AppInventor.setWebViewString(`${payload}::${Date.now()}`);
      return true;
    }
  }catch{}
  return false;
}

function normalizeFacebookUrl(url){
  return String(url||'').replace('://web.facebook.com/', '://www.facebook.com/');
}

function openFacebookChoice(url,name='Chorale Sedera Ambalavato'){
  pendingFacebookLink=normalizeFacebookUrl(url);
  $("facebookChoiceName").textContent=name||'Chorale Sedera Ambalavato';
  $("facebookChoiceModal").classList.remove('hidden');
  $("facebookChoiceModal").setAttribute('aria-hidden','false');
}

function closeFacebookChoice(){
  $("facebookChoiceModal").classList.add('hidden');
  $("facebookChoiceModal").setAttribute('aria-hidden','true');
}

function openFacebookInside(){
  if(!pendingFacebookLink)return;
  const url=pendingFacebookLink;
  closeFacebookChoice();

  // Open Facebook directly inside the current LyriCSED WebView,
  // exactly like a normal website. No Kodular bridge is required.
  try{
    window.location.href=url;
  }catch{
    try{window.open(url,'_self')}catch{}
  }
}

function openFacebookExternal(){
  if(!pendingFacebookLink)return;
  const url=pendingFacebookLink;
  closeFacebookChoice();

  if(!nativeMessage('FACEBOOK_EXTERNAL',url)){
    try{window.open(url,'_blank')}catch{location.href=url}
  }
}

function openSmartLink(url,kind='web',label=''){
  if(!url)return;
  const target=kind==='facebook'?normalizeFacebookUrl(url):String(url);

  if(kind==='facebook'){
    openFacebookChoice(target,label);
    return;
  }

  // Normal website: keep the current LyriCSED behavior.
  try{window.location.href=target}catch{
    try{window.open(target,'_blank')}catch{}
  }
}

function closeTransientUi(){
  if(!$("facebookChoiceModal").classList.contains('hidden')){
    closeFacebookChoice();
    return true;
  }
  if(!$("globalMiniPlayer").classList.contains('hidden')){
    closeGlobalMiniPlayer();
    return true;
  }
  if(!$("libraryPicker").classList.contains('hidden')){
    closeLibraryPicker();
    return true;
  }
  if(!$("exitConfirmModal").classList.contains('hidden')){
    hideExitConfirmation();
    return true;
  }
  return false;
}

function showExitConfirmation(){
  $("exitConfirmModal").classList.remove('hidden');
  $("exitConfirmModal").setAttribute('aria-hidden','false');
}
function hideExitConfirmation(){
  $("exitConfirmModal").classList.add('hidden');
  $("exitConfirmModal").setAttribute('aria-hidden','true');
}

function handleAndroidBack(){
  if(closeTransientUi())return 'handled';

  if(currentView!=='home'){
    history.back();
    return 'back';
  }

  showExitConfirmation();
  return 'confirm-exit';
}

window.LyriCSED=Object.assign(window.LyriCSED||{},{
  handleAndroidBack,
  showExitConfirmation,
  hideExitConfirmation
});

$$('.smart-link').forEach(a=>a.addEventListener('click',e=>{
  e.preventDefault();
  openSmartLink(a.href,a.dataset.smartLink||'web',a.textContent.trim());
}));

$("facebookOpenInside").onclick=openFacebookInside;
$("facebookOpenExternal").onclick=openFacebookExternal;
$("facebookChoiceCancel").onclick=closeFacebookChoice;
$("facebookChoiceModal").addEventListener('click',e=>{
  if(e.target===$("facebookChoiceModal"))closeFacebookChoice();
});

$("exitCancel").onclick=hideExitConfirmation;
$("exitConfirm").onclick=()=>{
  hideExitConfirmation();
  if(!nativeMessage('EXIT_APP')){
    toast("La fermeture complète est disponible dans l'application Android.");
  }
};
$("exitConfirmModal").addEventListener('click',e=>{
  if(e.target===$("exitConfirmModal"))hideExitConfirmation();
});

// Navigation
$("updateBtn").onclick=forceAppUpdate;
$$('[data-nav]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.nav)));
$("songBack").onclick=()=>history.back();
window.addEventListener('popstate',e=>restoreState(e.state||{view:'home'}));
if(!history.state)history.replaceState({view:'home'},'',location.hash||'#home');

// Search/filter
$("globalSearch").addEventListener('input',e=>{const q=e.target.value.trim();if(q){$("songSearch").value=q;setView('songs');renderSongs()}});
$("songSearch").oninput=renderSongs;
$$('[data-filter]').forEach(b=>b.onclick=()=>{$$('[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');songFilter=b.dataset.filter;renderSongs()});

// song controls
$("favoriteBtn").onclick=toggleFav;$("fontDown").onclick=()=>{readerZoom-=10;applyReaderZoom()};$("fontUp").onclick=()=>{readerZoom+=10;applyReaderZoom()};$("zoomReset").onclick=()=>{readerZoom=100;applyReaderZoom()};$$('[data-song-tab]').forEach(b=>b.onclick=()=>setSongTab(b.dataset.songTab));

// audio
$("mainPlayBtn").onclick=playPause;$("miniPlay").onclick=playPause;$("rewindBtn").onclick=()=>seekBy(-10);$("miniRewind").onclick=()=>seekBy(-10);$("forwardBtn").onclick=()=>seekBy(10);$("miniForward").onclick=()=>seekBy(10);
$("seekBar").oninput=()=>{if(isCurrentSongAudio()&&Number.isFinite(audio.duration))audio.currentTime=Number($("seekBar").value)/1000*audio.duration;updateGlobalAudioUI()};$("volumeBar").oninput=()=>{audio.volume=Number($("volumeBar").value)/100;$("volumeValue").textContent=`${$("volumeBar").value}%`};
$("setA").onclick=()=>{if(!isCurrentSongAudio()){toast("Lancez d’abord ce playback.");return}loopA=audio.currentTime;$("aTime").textContent=fmt(loopA);toast('Point A défini')};$("setB").onclick=()=>{if(!isCurrentSongAudio()){toast("Lancez d’abord ce playback.");return}loopB=audio.currentTime;$("bTime").textContent=fmt(loopB);toast('Point B défini')};$("toggleLoop").onclick=()=>{if(loopA===null||loopB===null||loopB<=loopA){toast('Définissez A puis B');return}loopEnabled=!loopEnabled;$("toggleLoop").classList.toggle('active',loopEnabled);toast(loopEnabled?'Répétition A/B activée':'Répétition A/B désactivée')};$("clearLoop").onclick=resetLoop;$("addMarkerBtn").onclick=addMarker;
audio.addEventListener('timeupdate',()=>{if(globalAudioMode==='song'&&loopEnabled&&loopA!==null&&loopB!==null&&audio.currentTime>=loopB)audio.currentTime=loopA;updateGlobalAudioUI()});
audio.addEventListener('play',updateGlobalAudioUI);
audio.addEventListener('pause',updateGlobalAudioUI);
audio.addEventListener('loadedmetadata',updateGlobalAudioUI);
audio.addEventListener('ended',()=>{if(globalAudioMode==='event')handlePlaylistEnded();else updateGlobalAudioUI()});

// notes autosave
$("songNote").addEventListener('input',()=>{const s=$("songNoteSaved");s.textContent='Enregistrement...';clearTimeout($("songNote")._t);$("songNote")._t=setTimeout(()=>autosave($("songNote"),noteKey(),s),260)});
$("generalNotes").value=localStorage.getItem('sedyricsGeneralNotes')||'';$("generalNotes").addEventListener('input',()=>{const s=$("generalSaved");s.textContent='Enregistrement...';clearTimeout($("generalNotes")._t);$("generalNotes")._t=setTimeout(()=>autosave($("generalNotes"),'sedyricsGeneralNotes',s),260)});

window.addEventListener('online',()=>syncOfflineLibrary({manual:false,initial:false}).catch(()=>{}));
window.addEventListener('offline',()=>{
  const state=readJSON(SYNC_STATE_KEY,null);
  if(state?.complete){
    $("syncPill").textContent="Offline prêt • hors connexion";
    $("libraryStatus").textContent="Mode hors connexion";
  }
});

async function boot(){
  if('serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.register('sw.js');
      try{await navigator.serviceWorker.ready}catch{}
      try{await reg.update()}catch{}
    }catch{}
  }

  restoreState(history.state||{view:'home'});
  await loadCatalog();

  const state=readJSON(SYNC_STATE_KEY,null);
  const initial=!state?.complete||!SONGS.length;
  syncOfflineLibrary({manual:false,initial}).catch(()=>{});
}
boot();