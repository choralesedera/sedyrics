const CONTENT_CACHE="sedyrics-content-v4";
const $=id=>document.getElementById(id);
const $$=sel=>[...document.querySelectorAll(sel)];
let SONGS=[],ANNOUNCEMENTS=[],APP_VERSION=null,currentSong=null,currentView="home",songFilter="all",favorites=readJSON("sedyricsFavorites",[]).map(Number),fontSize=Number(localStorage.getItem("sedyricsFontSize")||18),audioObjectUrl=null,loopA=null,loopB=null,loopEnabled=false,toastTimer=null;
const audio=$("audio");

function readJSON(k,fallback){try{const v=JSON.parse(localStorage.getItem(k));return v??fallback}catch{return fallback}}
function writeJSON(k,v){localStorage.setItem(k,JSON.stringify(v))}
function normalize(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function withRevision(path,rev=1){if(!path)return null;return `${path}${path.includes("?")?"&":"?"}v=${encodeURIComponent(rev)}`}
function icon(id){return `<svg><use href="#${id}"/></svg>`}
function fmt(sec){if(!Number.isFinite(sec))return"0:00";return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1700)}

async function getCached(url,networkFirst=false){
  const cache=await caches.open(CONTENT_CACHE);
  if(networkFirst){try{const r=await fetch(url,{cache:"no-store"});if(r.ok){await cache.put(url,r.clone());return r}}catch{}const c=await cache.match(url);if(c)return c;throw new Error("offline")}
  const c=await cache.match(url);if(c)return c;const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}`);await cache.put(url,r.clone());return r;
}


async function forceAppUpdate(){
  const btn=$("updateBtn");
  if(!btn||btn.classList.contains("loading"))return;

  if(location.hostname==="localhost"||location.hostname==="127.0.0.1"||location.protocol==="file:"){
    toast("Ampiasao ao Kodular ny URL GitHub Pages mba hahazoana mise à jour.");
    return;
  }

  btn.classList.add("loading");
  btn.disabled=true;
  const label=btn.querySelector("span");
  if(label)label.textContent="Mise à jour";
  toast("Recherche de la dernière version...");

  try{
    // Preserve localStorage intentionally: notes, favorites and rehearsal markers stay intact.
    const keys=await caches.keys();
    await Promise.all(
      keys.filter(k=>k.startsWith("sedyrics-")).map(k=>caches.delete(k))
    );

    if("serviceWorker" in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs){
        try{await reg.update()}catch{}
        try{await reg.unregister()}catch{}
      }
    }

    const url=new URL(location.href);
    url.searchParams.set("_sedyrics_update",Date.now().toString());
    url.hash="#home";
    location.replace(url.toString());
  }catch(err){
    btn.classList.remove("loading");
    btn.disabled=false;
    if(label)label.textContent="Actualiser";
    toast("Mise à jour impossible. Vérifiez la connexion.");
    loadCatalog().catch(()=>{});
  }
}

async function loadCatalog(){
  try{
    const vr=await getCached(`version.json?t=${Date.now()}`,true);APP_VERSION=await vr.json();
    const cr=await getCached(withRevision(APP_VERSION.catalog,APP_VERSION.contentVersion),true);SONGS=(await cr.json()).songs||[];
    try{const ar=await getCached(withRevision(APP_VERSION.announcements,APP_VERSION.contentVersion),true);ANNOUNCEMENTS=(await ar.json()).announcements||[]}catch{ANNOUNCEMENTS=[]}
    $("syncPill").textContent=navigator.onLine?`À jour • v${APP_VERSION.contentVersion}`:`Offline • v${APP_VERSION.contentVersion}`;
    $("libraryStatus").textContent=navigator.onLine?"Synchronisé":"Mode hors connexion";
    renderAll();prefetchEssential().catch(()=>{});
  }catch{
    $("syncPill").textContent="Première connexion requise";$("libraryStatus").textContent="Aucune donnée locale";renderAll();
  }
}

async function prefetchEssential(){
  if(!APP_VERSION)return;const cache=await caches.open(CONTENT_CACHE);const urls=[];
  for(const s of SONGS){if(APP_VERSION.prefetch?.lyrics&&s.lyrics)urls.push(withRevision(s.lyrics,s.revision));if(APP_VERSION.prefetch?.solfas&&s.solfa)urls.push(withRevision(s.solfa,s.revision));if(APP_VERSION.prefetch?.instrumentals&&s.instrumental)urls.push(withRevision(s.instrumental,s.revision));if(s.image)urls.push(withRevision(s.image,s.revision))}
  for(const u of urls){if(await cache.match(u))continue;try{const r=await fetch(u);if(r.ok)await cache.put(u,r.clone())}catch{}}
}

function renderAll(){
  $("homeSongCount").textContent=`${SONGS.length} hira`;renderRecent();renderSongs();renderAnnouncements();
}
function recentIds(){return readJSON("sedyricsRecent",[])}
function pushRecent(id){const ids=recentIds().filter(x=>Number(x)!==Number(id));ids.unshift(Number(id));writeJSON("sedyricsRecent",ids.slice(0,5));renderRecent()}
function renderRecent(){
  const host=$("recentSongs");host.innerHTML="";let list=recentIds().map(id=>SONGS.find(s=>Number(s.id)===Number(id))).filter(Boolean);if(!list.length)list=SONGS.slice(0,3);
  if(!list.length){host.innerHTML='<div class="empty-announcement">Tsy mbola misy hira.</div>';return}
  list.slice(0,3).forEach(s=>{const b=document.createElement("button");b.className="recent-song";b.innerHTML=`<span class="num">${String(s.id).padStart(2,"0")}</span><span><strong>${escapeHtml(s.title)}</strong><span>${s.solfa?"Solfa • ":""}${s.instrumental?"Playback":"Lyrics"}</span></span>${icon("i-chevron")}`;b.onclick=()=>openSong(s.id);host.appendChild(b)})
}
function isFav(id){return favorites.includes(Number(id))}
function toggleFav(){if(!currentSong)return;const id=Number(currentSong.id);favorites=isFav(id)?favorites.filter(x=>x!==id):[...favorites,id];writeJSON("sedyricsFavorites",favorites);refreshFavorite();renderSongs();toast(isFav(id)?"Favori ajouté":"Favori retiré")}
function getFilteredSongs(){const q=normalize($("songSearch").value.trim());return SONGS.filter(s=>{const pass=songFilter==="all"||(songFilter==="favorites"&&isFav(s.id))||(songFilter==="solfa"&&s.solfa)||(songFilter==="instrumental"&&s.instrumental);return pass&&(!q||normalize(s.title).includes(q)||normalize(s.artist).includes(q)||String(s.id).includes(q))})}
function renderSongs(){
  const list=getFilteredSongs(),host=$("songGrid");host.innerHTML="";$("libraryCount").textContent=`${list.length} hira`;
  if(!list.length){host.innerHTML='<div class="empty-announcement">Tsy misy hira hita.</div>';return}
  list.forEach(s=>{const b=document.createElement("button");b.className="song-card";const tags=[s.lyrics?'<span class="tiny-tag">LYRICS</span>':'',s.solfa?'<span class="tiny-tag">SOLFA</span>':'',s.instrumental?'<span class="tiny-tag">PLAYBACK</span>':''].join('');b.innerHTML=`<span class="song-num">${String(s.id).padStart(2,"0")}</span><span><h3>${isFav(s.id)?"♥ ":""}${escapeHtml(s.title)}</h3><p>${escapeHtml(s.artist||"")}</p><span class="song-tags">${tags}</span></span><svg class="chev"><use href="#i-chevron"/></svg>`;b.onclick=()=>openSong(s.id);host.appendChild(b)})
}
function renderAnnouncements(){
  const host=$("announcementList");host.innerHTML="";
  if(!ANNOUNCEMENTS.length){host.innerHTML=`<div class="empty-announcement">${icon("i-bell")}<h3>Tsy mbola misy Filazan-draharaha</h3><p>Eto no hiseho ireo vaovao mahakasika ny activité ato amin-tsika.</p></div>`;return}
  ANNOUNCEMENTS.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).forEach(a=>{const el=document.createElement("article");el.className="announcement-card";el.innerHTML=`<span class="date">${escapeHtml(a.date||"")}</span><h3>${escapeHtml(a.title||"")}</h3><p>${escapeHtml(a.body||"")}</p>`;host.appendChild(el)})
}

function setView(name,{push=true}={}){
  currentView=name;$$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  $("mainHeader").style.display=name==='song'?'none':'flex';$("bottomNav").style.display=name==='song'?'none':'grid';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
  if(push)history.pushState({view:name,songId:currentSong?.id||null},"",`#${name}${name==='song'&&currentSong?'-'+currentSong.id:''}`);
  window.scrollTo(0,0);
}
function restoreState(state){if(state?.view==='song'&&state.songId){openSong(state.songId,{push:false})}else setView(state?.view||'home',{push:false})}

async function openSong(id,{push=true}={}){
  const s=SONGS.find(x=>Number(x.id)===Number(id));if(!s)return;currentSong=s;pushRecent(s.id);pauseAudio(false);resetLoop();
  $("detailNumber").textContent=`HIRA ${String(s.id).padStart(2,'0')}`;$("detailMiniTitle").textContent=s.title;$("detailTitle").textContent=s.title;$("detailArtist").textContent=s.artist||"Chorale Sedera Ambalavato";$("audioTitle").textContent=`${s.title} • Playback`;$("miniTrackTitle").textContent=s.title;
  $("availabilityBadge").textContent=["LYRICS",s.solfa?"SOLFA":"",s.instrumental?"PLAYBACK":""].filter(Boolean).join(" • ");refreshFavorite();applyFont();setSongTab('lyrics');loadSongNote();setView('song',{push});
  $("lyricsText").innerHTML='<div class="loading-line"></div><br><div class="loading-line"></div><br><div class="loading-line"></div>';
  try{const r=await getCached(withRevision(s.lyrics,s.revision));$("lyricsText").textContent=(await r.text()).trim()}catch{$("lyricsText").textContent="Tsy mbola voatahiry ato amin'ny finday ity tononkira ity."}
  const c=$("creditsCard");c.textContent=s.credits||"";c.style.display=s.credits?"block":"none";
  loadSolfa();loadInstrumental();renderMarkers();
}
function refreshFavorite(){if(!currentSong)return;$("favoriteBtn").classList.toggle('active',isFav(currentSong.id))}
function applyFont(){fontSize=Math.min(30,Math.max(15,fontSize));$("lyricsText").style.fontSize=`${fontSize}px`;$("fontSizeValue").textContent=fontSize;localStorage.setItem('sedyricsFontSize',fontSize)}
function setSongTab(tab){$$('[data-song-tab]').forEach(b=>b.classList.toggle('active',b.dataset.songTab===tab));['lyrics','solfa','instrumental'].forEach(x=>$(x+'Panel').classList.toggle('active',x===tab));if(tab==='instrumental')setTimeout(()=>$("advancedPlayer").scrollIntoView({behavior:'smooth',block:'nearest'}),60)}

async function loadSolfa(){
  const host=$("solfaContent");if(!currentSong?.solfa){host.innerHTML=`<div class="empty-panel"><span class="empty-icon">${icon("i-note")}</span><h3>Solfa à venir</h3><p>Mbola tsy misy solfa ho an'ity hira ity.</p></div>`;return}
  host.innerHTML='<div class="loading-line"></div>';
  try{const r=await getCached(withRevision(currentSong.solfa,currentSong.revision));const blob=await r.blob();host.innerHTML=`<div class="solfa-view"><img alt="Solfa ${escapeHtml(currentSong.title)}"></div>`;host.querySelector('img').src=URL.createObjectURL(blob)}catch{host.innerHTML=`<div class="empty-panel"><h3>Solfa tsy azo vakiana offline</h3></div>`}
}

async function loadInstrumental(){
  const player=$("advancedPlayer"),empty=$("instrumentalEmpty"),mini=$("persistentPlayer");
  if(audioObjectUrl){URL.revokeObjectURL(audioObjectUrl);audioObjectUrl=null}audio.removeAttribute('src');audio.load();
  if(!currentSong?.instrumental){player.classList.remove('active');empty.classList.remove('hidden');mini.classList.remove('active');return}
  player.classList.add('active');empty.classList.add('hidden');mini.classList.add('active');$("audioCacheBadge").textContent='Chargement...';
  try{const url=withRevision(currentSong.instrumental,currentSong.revision);const cache=await caches.open(CONTENT_CACHE);const wasCached=!!(await cache.match(url));const r=await getCached(url);const blob=await r.blob();audioObjectUrl=URL.createObjectURL(blob);audio.src=audioObjectUrl;audio.load();$("audioCacheBadge").textContent=wasCached?'Offline prêt':'Téléchargé';}
  catch{$("audioCacheBadge").textContent='Indisponible';player.classList.remove('active');empty.classList.remove('hidden');mini.classList.remove('active')}
}
function playPause(){if(!audio.src)return;if(audio.paused)audio.play().catch(()=>{});else audio.pause()}
function seekBy(delta){if(Number.isFinite(audio.duration))audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+delta))}
function updateAudioUI(){const playing=!audio.paused;const use=playing?'i-pause':'i-play';$("mainPlayBtn").innerHTML=icon(use);$("miniPlay").innerHTML=icon(use);$("playingBars").classList.toggle('active',playing);$("elapsed").textContent=fmt(audio.currentTime);$("duration").textContent=fmt(audio.duration);$("miniTrackTime").textContent=`${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;if(Number.isFinite(audio.duration)&&audio.duration>0)$("seekBar").value=Math.round(audio.currentTime/audio.duration*1000)}
function pauseAudio(reset=false){audio.pause();if(reset&&Number.isFinite(audio.duration))audio.currentTime=0;updateAudioUI()}
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
    jump.onclick=()=>{audio.currentTime=Number(m.time)||0;toast(`Repère: ${m.label}`)};

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
$("favoriteBtn").onclick=toggleFav;$("fontDown").onclick=()=>{fontSize--;applyFont()};$("fontUp").onclick=()=>{fontSize++;applyFont()};$$('[data-song-tab]').forEach(b=>b.onclick=()=>setSongTab(b.dataset.songTab));

// audio
$("mainPlayBtn").onclick=playPause;$("miniPlay").onclick=playPause;$("rewindBtn").onclick=()=>seekBy(-10);$("miniRewind").onclick=()=>seekBy(-10);$("forwardBtn").onclick=()=>seekBy(10);$("miniForward").onclick=()=>seekBy(10);
$("seekBar").oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=Number($("seekBar").value)/1000*audio.duration};$("volumeBar").oninput=()=>{audio.volume=Number($("volumeBar").value)/100;$("volumeValue").textContent=`${$("volumeBar").value}%`};
$("setA").onclick=()=>{loopA=audio.currentTime;$("aTime").textContent=fmt(loopA);toast('Point A défini')};$("setB").onclick=()=>{loopB=audio.currentTime;$("bTime").textContent=fmt(loopB);toast('Point B défini')};$("toggleLoop").onclick=()=>{if(loopA===null||loopB===null||loopB<=loopA){toast('Définissez A puis B');return}loopEnabled=!loopEnabled;$("toggleLoop").classList.toggle('active',loopEnabled);toast(loopEnabled?'Répétition A/B activée':'Répétition A/B désactivée')};$("clearLoop").onclick=resetLoop;$("addMarkerBtn").onclick=addMarker;
audio.addEventListener('timeupdate',()=>{if(loopEnabled&&loopA!==null&&loopB!==null&&audio.currentTime>=loopB)audio.currentTime=loopA;updateAudioUI()});audio.addEventListener('play',updateAudioUI);audio.addEventListener('pause',updateAudioUI);audio.addEventListener('loadedmetadata',updateAudioUI);audio.addEventListener('ended',updateAudioUI);

// notes autosave
$("songNote").addEventListener('input',()=>{const s=$("songNoteSaved");s.textContent='Enregistrement...';clearTimeout($("songNote")._t);$("songNote")._t=setTimeout(()=>autosave($("songNote"),noteKey(),s),260)});
$("generalNotes").value=localStorage.getItem('sedyricsGeneralNotes')||'';$("generalNotes").addEventListener('input',()=>{const s=$("generalSaved");s.textContent='Enregistrement...';clearTimeout($("generalNotes")._t);$("generalNotes")._t=setTimeout(()=>autosave($("generalNotes"),'sedyricsGeneralNotes',s),260)});

window.addEventListener('online',loadCatalog);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').then(r=>r.update()).catch(()=>{});
restoreState(history.state||{view:'home'});loadCatalog();