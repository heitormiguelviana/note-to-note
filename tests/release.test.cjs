const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const manifest=JSON.parse(fs.readFileSync('manifest.json')),base='https://github.com/heitormiguelviana/note-to-note/releases/download/v'+manifest.release+'/';
const assets=[{name:'manifest.json',state:'uploaded',size:fs.statSync('manifest.json').size,browser_download_url:base+'manifest.json'},...manifest.components.map(c=>({name:c.source,state:'uploaded',size:c.sizeBytes,browser_download_url:base+c.source}))];
const release={tag_name:'v'+manifest.release,draft:false,prerelease:false,assets};
async function mockGet(url){return {text:JSON.stringify(url.endsWith('manifest.json')?manifest:release)};}
test('manifesto confere com todos os bytes finais e versões',()=>assert.doesNotThrow(()=>require('../tools/release.cjs')));
test('bootstrap real reconhece Configurações e gerenciador real reconhece seis módulos (mock de transporte)',async()=>{
 const bootstrap=fs.readFileSync('Instalador.md','utf8');const code=bootstrap.slice(bootstrap.indexOf('function validHash('),bootstrap.indexOf('checkButton.onclick'));
 const load=new AsyncFunction('fetchResponse','bytesOf',`const API="release",TARGET="Musicas/Sistema/Configurações.md",MAX_BYTES=200000; ${code};return loadRelease();`);
 const result=await load(mockGet,r=>new TextEncoder().encode(r.text));assert.equal(result.component.version,'2.6.0');
 const config=fs.readFileSync('src/Configuracoes.md','utf8');const mapping=config.slice(config.indexOf('const ntnAllowed='),config.indexOf('const ntnPage='));
 const remote=config.slice(config.indexOf('async function ntnRemote('),config.indexOf('async function ntnState('));
 const check=new AsyncFunction('ntnGet','ntnBytes',mapping+`const ntnApi="release"; const ntnAsset=(r,n)=>r.assets.find(a=>a.name===n); const ntnValidHash=s=>/^[a-f0-9]{64}$/.test(s); ${remote}; return ntnRemote();`);
 const r=await check(mockGet,r=>new TextEncoder().encode(r.text));assert.equal(r.modules.length,6);assert.deepEqual(r.modules.map(x=>x.c.source),manifest.components.map(x=>x.source));
});
test('seis oficiais compilam e têm identificação oficial, preservando chaves históricas',()=>{
 for(const c of manifest.components){const s=fs.readFileSync('src/'+c.source,'utf8');new AsyncFunction(s.replace(/^```dataviewjs\s*/,'').replace(/\s*```\s*$/,''));assert.ok(!s.includes('BETA VISUAL 1'));assert.ok(s.slice(0,250).includes('V'+c.version));}
 assert.ok(fs.readFileSync('src/Central.md','utf8').includes('central-descoberta-v12'));assert.ok(fs.readFileSync('src/Roleta.md','utf8').includes('roleta-albuns-v03'));
});
