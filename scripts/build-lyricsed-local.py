#!/usr/bin/env python3
# LyriCSED Android: preserve exact index.html appearance; preload catalogue/text/solfa.
import base64, json, mimetypes, re, sys
from pathlib import Path

src=Path(sys.argv[1])
dest=Path('lyricsed-local.html')
html=(src/'index.html').read_text(encoding='utf-8-sig')
marker='<script id="lyricsed-inline-app">'
assert marker in html, 'Missing app marker in current index.html'
catalog=json.loads((src/'data/songs-v2.json').read_text(encoding='utf-8-sig'))
assert catalog.get('songs'), 'Empty song catalogue'
files={'version-v2.json','version.json','data/songs-v2.json','data/songs.json','data/announcements-v2.json','data/announcements.json'}
for song in catalog['songs']:
    files.update(song[x].lstrip('./') for x in ('lyrics','solfa') if song.get(x))
docs={}
for name in sorted(files):
    p=src/name
    assert p.is_file(), 'Missing source: '+name
    is_binary=p.suffix.lower() in ('.png','.jpg','.jpeg','.webp','.pdf','.gif')
    docs[name]=dict(body=base64.b64encode(p.read_bytes()).decode('ascii') if is_binary else p.read_text(encoding='utf-8-sig'),
                    type=mimetypes.guess_type(name)[0] or 'application/octet-stream',
                    binary=is_binary)
for name in ('assets/images/icon-sedera.png','assets/images/ankino-logo.webp'):
    p=src/name
    assert p.is_file(), 'Missing image: '+name
    uri='data:'+mimetypes.guess_type(name)[0]+';base64,'+base64.b64encode(p.read_bytes()).decode('ascii')
    html=html.replace('src="'+name+'"', 'src="'+uri+'"')
html=re.sub(r'\s*<link\s+rel="manifest"\s+href="manifest\.webmanifest"\s*>','',html,count=1)
embedded=json.dumps(docs,ensure_ascii=False,separators=(',',':')).replace('<',r'\u003c').replace('&',r'\u0026')
prelude= """// Offline bootstrap for Android Kodular APK. Original interface unchanged.
const IS_KODULAR_LOCAL=true;
const REMOTE_CONTENT_BASE='https://raw.githubusercontent.com/choralesedera/sedyrics/main/';
const EMBEDDED_DOCS=__EMBEDDED__;
function embeddedResponse(path){
  const entry=EMBEDDED_DOCS[cleanPath(path)];
  if(!entry)return null;
  const body=entry.binary?Uint8Array.from(atob(entry.body),c=>c.charCodeAt(0)):entry.body;
  return new Response(body,{status:200,headers:{'Content-Type':entry.type}});
}
""".replace('__EMBEDDED__',embedded)
html=html.replace(marker,marker+'\n'+prelude,1)
html,n=re.subn(r'const SHELL_FILES=\[\s*"index\.html",.*?\];',
                'const SHELL_FILES=[]; // Static HTML is bundled in Android APK',html,count=1,flags=re.S)
assert n==1,'SHELL_FILES pattern changed'
start=html.index('async function getAnyCached(path){')
end=html.index('function resourceRevision(song,kind){',start)
replacement="""async function getAnyCached(path){
  // Updates in Cache Storage take precedence over included starter content.
  if('caches' in window){
    try{
      const key=reqFor(path);
      const c=await caches.open(OFFLINE_CACHE);
      const hit=await c.match(key,{ignoreSearch:true}) || await caches.match(key,{ignoreSearch:true});
      if(hit)return hit;
    }catch(e){console.warn('Cache access',e)}
  }
  return embeddedResponse(path);
}
async function getCached(path,{timeout=10000}={}){
  const cached=await getAnyCached(path);
  if(cached)return cached;
  const r=await networkFetch(path,{timeout});
  if('caches' in window){
    try{const c=await caches.open(OFFLINE_CACHE);await c.put(reqFor(path),r.clone())}catch(e){console.warn('Cache write',e)}
  }
  return r;
}
async function networkFetch(path,{timeout=120000}={}){
  // Never fetch /version-v2.json from http://localhost.
  const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const url=new URL(cleanPath(path),REMOTE_CONTENT_BASE);
    url.searchParams.set('__network',String(Date.now()));
    const r=await fetch(url.toString(),{cache:'no-store',signal:ctrl.signal,mode:'cors'});
    if(!r.ok)throw new Error('Remote HTTP '+r.status);
    return r;
  }finally{clearTimeout(timer)}
}
"""
html=html[:start]+replacement+html[end:]
old="function absoluteMediaUrl(path){try{return new URL(cleanPath(path),location.href).toString()}catch{return String(path||'')}}"
new="function absoluteMediaUrl(path){try{return new URL(cleanPath(path),REMOTE_CONTENT_BASE).toString()}catch{return String(path||'')}}"
assert old in html, 'Native player URL helper changed'
html=html.replace(old,new,1)
old='async function syncOfflineLibrary({manual=false,initial=false}={}){\n  if(syncInProgress)return false;'
new="""async function syncOfflineLibrary({manual=false,initial=false}={}){
  if(!('caches' in window)){if(manual)toast('Stockage WebView non disponible sur cet appareil.');return false;}
  if(syncInProgress)return false;"""
assert old in html
html=html.replace(old,new,1)
old="async function boot(){\n  if('serviceWorker' in navigator){"
assert old in html
html=html.replace(old,"async function boot(){\n  if(!IS_KODULAR_LOCAL && 'serviceWorker' in navigator){",1)
assert 'const initial=!state?.complete||!SONGS.length;' in html
html=html.replace('const initial=!state?.complete||!SONGS.length;','const initial=!SONGS.length;',1)
html=html.replace('if(shellChanged&&!initial){\n      setTimeout(()=>location.reload(),650);\n    }',
                  'if(shellChanged&&!initial && !IS_KODULAR_LOCAL){\n      setTimeout(()=>location.reload(),650);\n    }',1)
assert html.count('const IS_KODULAR_LOCAL=true;')==1
assert html.count(marker)==1
assert '<!doctype html>' in html.lower()
dest.write_text(html,encoding='utf-8')
print('LyriCSED local HTML:',dest.stat().st_size,'bytes,',len(catalog['songs']),'songs;',
      'seed files:',len(docs))

# Add member activation only in this testing branch. Never alter the published website.
gate_path=src/'kodular/lyricsed-access-gate.js'
if gate_path.is_file():
    gate_js=gate_path.read_text(encoding='utf-8-sig')
    assert '</script>' not in gate_js
    css='''<style id="lyricsed-access-css">
html:not(.lyricsed-authorized) .app{visibility:hidden!important;pointer-events:none!important}
#lyricsed-access-gate[hidden]{display:none!important}
#lyricsed-access-gate{position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:22px;overflow:auto;background:linear-gradient(145deg,#082f49,#0c4a6e 65%,#087fa5);font-family:Roboto,Arial,sans-serif}
#lyricsed-access-gate *{box-sizing:border-box}
#lyricsed-access-gate .lyr-card{background:white;padding:32px 25px;border-radius:24px;max-width:390px;width:100%;text-align:center;box-shadow:0 26px 70px #0003}
#lyricsed-access-gate .lyr-mark{width:64px;height:64px;margin:0 auto 14px;border-radius:18px;background:#e0f2fe;display:grid;place-items:center;font-size:26px;font-weight:900;color:#0c4a6e}
#lyricsed-access-gate h1{font-size:24px;margin:8px 0;color:#082f49}
#lyricsed-access-gate p{font-size:13px;line-height:1.7;color:#617b8d}
#lyricsed-access-gate label{display:block;text-align:left;font-size:12px;color:#40586b;font-weight:700;margin-bottom:8px}
#lyricsed-access-gate input{background:#f5f9fc;border:1.5px solid #b5cdd9;border-radius:12px;width:100%;height:48px;padding:0 14px;font-size:16px;color:#082f49}
#lyricsed-access-gate button{margin-top:14px;background:#0c4a6e;color:white;border:0;border-radius:12px;height:48px;width:100%;font-size:15px;font-weight:750}
#lyricsed-access-gate button:disabled{opacity:.65}
#lyricsed-access-gate #lyrAccessMessage{font-size:12px;min-height:30px;margin:13px 0 0;line-height:1.5;color:#637986}
#lyricsed-access-gate.lyr-error #lyrAccessMessage{color:#b42318}
</style>'''
    ui='''<div id="lyricsed-access-gate" role="dialog" aria-modal="true" aria-labelledby="lyrAccessTitle"><div class="lyr-card">
<div class="lyr-mark">S</div><h1 id="lyrAccessTitle">LyriCSED</h1>
<p>Accès réservé aux membres autorisés de la Chorale Sedera Ambalavato.</p>
<label for="lyrLicenseCode">Code d'activation personnel</label>
<input id="lyrLicenseCode" type="text" autocapitalize="characters" autocomplete="off" placeholder="LY-XXXX-XXXX" maxlength="45" />
<button type="button" id="lyrActivationButton">Activer LyriCSED</button>
<div id="lyrAccessMessage" role="status" aria-live="polite">Chargement...</div>
<p style="font-size:11px">Première activation : Internet obligatoire.</p></div></div>'''
    html=html.replace('</head>',css+'\n</head>',1)
    html=html.replace('<body>','<body>\n'+ui,1)
    html=html.replace(marker,'<script id="lyricsed-license-gate">\n'+gate_js+'\n</script>\n'+marker,1)
    assert html.count('async function boot(){')==1
    html=html.replace('async function boot(){','async function boot(){\n  await window.LyriCSEDGate.ready;',1)
    assert html.count('id="lyricsed-access-gate"')==1
    assert html.count('await window.LyriCSEDGate.ready;')==1
    dest.write_text(html,encoding='utf-8')
    print('Licensed HTML gate added; body remains blocked until valid PRO licence')
