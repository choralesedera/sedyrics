/* LyriCSED Android membership gate. Test release: offline grant uses localStorage, not a signed token. */
(function(){
'use strict';
const APP_CODE='LYRICSED', ENDPOINT='https://license.ankino.com/activate';
const STORAGE_KEY='lyricsedLicenseGrantV1', DEVICE_KEY='lyricsedDeviceInstallIdV1';
const OFFLINE_MS=7*24*60*60*1000;
let settled=false,resolveReady,busy=false,ui=null;
const ready=new Promise(resolve=>{resolveReady=resolve;});
window.LyriCSEDGate={ready};
const el=id=>document.getElementById(id);
function store(key,obj){try{localStorage.setItem(key,JSON.stringify(obj));return true}catch{return false}}
function read(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
function remove(key){try{localStorage.removeItem(key)}catch{}}
function randomId(){
  let id=read(DEVICE_KEY);
  if(typeof id==='string'&&/^LYR-[a-f0-9]{32}$/.test(id))return id;
  if(!crypto||!crypto.getRandomValues)throw Error('Identifiant sécurisé indisponible sur cet appareil.');
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  id='LYR-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  if(!store(DEVICE_KEY,id))throw Error('Stockage local indisponible.');
  return id;
}
function showMessage(value,isError=false){
  if(el('lyrAccessMessage'))el('lyrAccessMessage').textContent=value;
  if(ui)ui.classList.toggle('lyr-error',isError);
}
function lock(){document.documentElement.classList.remove('lyricsed-authorized');if(ui)ui.hidden=false}
function unlock(){
  document.documentElement.classList.add('lyricsed-authorized');
  if(ui)ui.hidden=true;
  if(!settled){settled=true;resolveReady(true)}
}
function validOffline(grant){
  const now=Date.now();
  if(!grant||grant.appCode!==APP_CODE||!grant.licenseCode||grant.deviceId!==read(DEVICE_KEY))return false;
  if(!Number.isFinite(grant.verifiedAt)||!Number.isFinite(grant.lastSeenAt))return false;
  if(now<grant.lastSeenAt-300000||now<grant.verifiedAt-300000)return false;
  if(now-grant.verifiedAt>OFFLINE_MS)return false;
  if(grant.expiresAt&&Number.isFinite(Date.parse(grant.expiresAt))&&now>=Date.parse(grant.expiresAt))return false;
  return true;
}
async function activate(licenseCode,deviceId){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(ENDPOINT,{method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({license_code:licenseCode,app_code:APP_CODE,device_id:deviceId,app_version:'2.0-android-offline'}),signal:controller.signal});
    let data={};try{data=await r.json()}catch{}
    if(!r.ok||data.success!==true){
      const e=new Error(data.message||data.error||'Code incorrect ou accès non autorisé.');
      e.isDenied=r.status>=400&&r.status<500;throw e;
    }
    const lic=data.license||{};
    if(lic.app_code!==APP_CODE||lic.type!=='PRO'||lic.status!=='ACTIVE'){
      const e=new Error('Seule une licence LYRICSED PRO active est acceptée.');e.isDenied=true;throw e;
    }
    if(lic.device_id&&lic.device_id!==deviceId){const e=new Error('Licence liée à un autre appareil.');e.isDenied=true;throw e}
    if(lic.expires_at&&Date.parse(lic.expires_at)<=Date.now()){const e=new Error('Licence expirée.');e.isDenied=true;throw e}
    return {appCode:APP_CODE,licenseCode,deviceId,verifiedAt:Date.now(),lastSeenAt:Date.now(),expiresAt:lic.expires_at||null};
  }finally{clearTimeout(timer)}
}
async function checkSaved(grant){
  if(!grant||!grant.licenseCode){showMessage('Entrez votre code personnel.');return}
  if(el('lyrLicenseCode'))el('lyrLicenseCode').value=grant.licenseCode;
  const fallback=validOffline(grant);
  if(navigator.onLine===false){
    if(fallback){store(STORAGE_KEY,{...grant,lastSeenAt:Date.now()});unlock()}
    else showMessage('Connexion requise pour renouveler votre autorisation.',true);
    return;
  }
  showMessage('Vérification de votre autorisation...');
  try{
    const fresh=await activate(grant.licenseCode,grant.deviceId);
    if(!store(STORAGE_KEY,fresh))throw Error('Enregistrement impossible.');
    unlock();
  }catch(e){
    if(e.isDenied){remove(STORAGE_KEY);showMessage(e.message,true);lock();return}
    if(fallback){store(STORAGE_KEY,{...grant,lastSeenAt:Date.now()});unlock();return}
    showMessage('Serveur indisponible. Vérifiez Internet puis réessayez.',true);
  }
}
async function submit(){
  if(busy)return;
  const code=String(el('lyrLicenseCode')?.value||'').trim().toUpperCase().replace(/\s+/g,'');
  if(!/^LY-[A-Z0-9-]{6,40}$/.test(code)){showMessage('Entrez un code LY- valide.',true);return}
  if(navigator.onLine===false){showMessage('Internet est nécessaire à la première activation.',true);return}
  busy=true;
  if(el('lyrActivationButton'))el('lyrActivationButton').disabled=true;
  showMessage('Activation en cours...');
  try{
    const fresh=await activate(code,randomId());
    if(!store(STORAGE_KEY,fresh))throw Error('Stockage local inaccessible.');
    unlock();
  }catch(e){showMessage(e.message||'Activation impossible.',true)}
  finally{busy=false;if(el('lyrActivationButton'))el('lyrActivationButton').disabled=false}
}
function init(){
  ui=el('lyricsed-access-gate');if(!ui)throw Error('Écran de licence manquant.');
  lock();
  el('lyrActivationButton').addEventListener('click',submit);
  el('lyrLicenseCode').addEventListener('keydown',e=>{if(e.key==='Enter')submit()});
  const grant=read(STORAGE_KEY);
  if(grant&&grant.licenseCode)checkSaved(grant);
  else showMessage('Entrez votre code membre LY- pour activer LyriCSED.');
  window.addEventListener('online',()=>{
    if(document.documentElement.classList.contains('lyricsed-authorized')){
      const current=read(STORAGE_KEY);if(current)checkSaved(current);
    }
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();