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
