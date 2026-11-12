const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const md=fs.readFileSync('betas/Roleta-Beta.md','utf8'),stable=fs.readFileSync('betas/backups/pre-padronizacao/oficiais/Roleta.md','utf8');const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function harness(saved={},random=()=>.5){
 const prefix=md.slice(md.indexOf('\n')+1,md.indexOf('// ============================================================\n// VISUAL'));
 const key=md.slice(md.indexOf('function betaWorkKey('),md.indexOf('function betaSetScreen('));
 const algo=md.slice(md.indexOf('const betaSoundGroups'),md.indexOf('function betaRenderDiagnostics'));
 const surprise=md.slice(md.indexOf('function pickSurprise'),md.indexOf('// ------------------------------------------------------------\n// SORTEIO',md.indexOf('function pickSurprise')));
 const math=Object.create(Math);math.random=random;
 return new AsyncFunction('dv','localStorage','Math','window','fetch',prefix+"\nfunction paintGenreMeta(){} function paintGenreList(){} function refreshStats(){}\n"+'\nlet betaHistory=[], betaLastDecision=null;\n'+key+algo+surprise+`\nreturn {state,CFG,applyFilters,betaWeight,betaPick,betaSimilarity,betaEvidence,betaAffinity,betaSameAlbum,loadState,loadSpotifyLibrary,loadGenres,getDecision:()=>betaLastDecision,setHistory:x=>betaHistory=x,setPool:x=>{catalogEntries=x;spotifyLibrary=x;},setTags:(a,t)=>genreCache.albums[a.key]={status:'found',at:Date.now(),tags:t.map(key=>({key,name:key}))}};`)({app:{vault:{getAbstractFileByPath:()=>null}}},{getItem:k=>k==='roleta-albuns-v03'?JSON.stringify(saved):null,setItem:()=>{}},math,{},async()=>{throw new Error('fixture network unavailable');});
}
const a=(name,tags=[])=>({name,artist:'Artist',artists:['Artist'],key:name,id:name,catalogued:true,albumType:'album',durationMs:40*60000,rating:8,scrobbles:10,cataloguedAt:Date.now()-100*86400000,tags});
const pref=(mode)=>({mode,anchor:{tags:['jazz','calm']}});
test('DataviewJS inteiro compila',()=>assert.doesNotThrow(()=>new AsyncFunction(md.replace(/^```dataviewjs\s*/,'').replace(/\s*```\s*$/,''))));
test('quatro ajustes ponderam dimensões; desconhecidos nunca representam diferença',async()=>{
 const h=await harness(),close=a('close'),diffGenre=a('genre'),diffSound=a('sound'),both=a('both'),unknown=a('unknown');
 h.setTags(close,['jazz','calm']);h.setTags(diffGenre,['metal','calm']);h.setTags(diffSound,['jazz','energetic']);h.setTags(both,['metal','energetic']);
 assert.ok(h.betaWeight(close,pref('similar'))>h.betaWeight(both,pref('similar')));
 assert.ok(h.betaWeight(diffGenre,pref('genre'))>h.betaWeight(close,pref('genre')));
 assert.equal(h.betaSimilarity(diffGenre,pref('genre').anchor,'sound'),1);
 assert.ok(h.betaWeight(diffSound,pref('sound'))>h.betaWeight(close,pref('sound')));
 assert.ok(h.betaWeight(both,pref('both'))>h.betaWeight(close,pref('both')));
 for(const mode of ['similar','genre','sound','both'])assert.ok(h.betaWeight(unknown,pref(mode))<h.betaWeight(close,pref(mode)));
 assert.equal(h.betaEvidence(unknown,pref('both')),'unknown');h.setTags(unknown,['jazz']);assert.equal(h.betaEvidence(unknown,pref('both')),'partial');
});
test('ajuste explícito não usa desvio exploratório, fallback sem tags e sorteio livre funcionam',async()=>{
 const h=await harness({},()=>.01),x=a('x'),y=a('y');h.setTags(x,['jazz','calm']);h.setTags(y,['metal','energetic']);
 for(const mode of ['similar','genre','sound','both']){assert.ok(h.betaPick([x,y],pref(mode)));assert.equal(h.getDecision().exploratory,false);assert.equal(h.getDecision().pref.mode,mode);}
 assert.ok(h.betaPick([a('missing')],pref('both')));assert.equal(h.getDecision().evidence,'unknown');
 h.state.drawMode='random';assert.equal(h.betaPick([x,y]),x);h.state.drawMode='surprise';assert.ok(h.betaPick([x,y]));
});
test('histórico reconhece IDs, títulos normalizados e edições; filtros não apagam a sessão',async()=>{
 const h=await harness(),x=a('Album'),edition={...a('ALBUM (Deluxe Edition)'),id:'regional'},y=a('Other');h.setHistory([x]);assert.ok(h.betaSameAlbum(x,edition));assert.equal(h.betaPick([edition,y]),y);assert.ok(h.betaPick([edition]));
 h.setHistory([]);assert.equal(h.betaPick([x]),x);assert.ok(h.betaSameAlbum(x,{...a('Renamed'),id:x.id}));
});
test('filtros continuam aplicados antes do sorteio offline; estado V1.1 é mantido',async()=>{
 const saved={catalog:'catalogued',ratingEnabled:true,ratingMin:7,ratingMax:9,scrobblesEnabled:true,scrobblesMin:5,scrobblesMax:20,artist:'all',genres:['jazz'],genreMatch:'all',includeUnknownGenres:false,timeEnabled:true,timeValue:1,timeUnit:'days',timeMode:'older'};
 const h=await harness(saved),good=a('good'),bad={...a('bad'),rating:2};h.setTags(good,['jazz']);h.setTags(bad,['jazz']);h.setPool([good,bad]);assert.deepEqual(h.applyFilters().map(x=>x.name),['good']);assert.equal(h.betaPick(h.applyFilters()),good);assert.equal(h.state.ratingMin,7);assert.equal(h.CFG.stateKey,'roleta-albuns-v03');
});
test('contratos essenciais V1.1 são idênticos (filtros, estado, APIs, animação e surpresa)',()=>{
 function fn(source,name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const next=source.indexOf('\n}',start);return source.slice(start,next+2);}
 for(const name of ['loadState','saveState','applyFilters','currentPool','matchesGenreFilter','matchesDurationFilter','matchesRatingFilter','matchesTimeFilter','matchesScrobblesFilter','loadSpotifyLibrary','loadGenres','animateDraw','pickSurprise'])assert.equal(fn(md,name),fn(stable,name),name);
 assert.match(md,/Consome o ajuste somente depois de concluir/);assert.ok(md.indexOf('await animateDraw(candidates, winner)')<md.indexOf('if (pendingPreference) { betaFeedback = null;'));
 assert.match(md,/betaHistory = \[\]; betaCurrent = null; betaFeedback = null/);
});

test('falhas de APIs não viram sucesso e tags ausentes preservam fallback',async()=>{
 const h=await harness();await assert.rejects(h.loadSpotifyLibrary());h.CFG.lastfmKey='fixture';const x=a('network');const outcome=await h.loadGenres([x]);assert.equal(outcome.failed,1);assert.equal(outcome.done,1);assert.ok(h.betaPick([x],pref('sound')));assert.equal(h.getDecision().evidence,'unknown');
});
test('snapshots imutáveis e Beta 4 idêntica ao ativo',()=>{
 const crypto=require('node:crypto'),root='betas/roleta-musical/';for(const [name,hash]of Object.entries(JSON.parse(fs.readFileSync(root+'snapshots.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(root+name)).digest('hex'),hash);
 assert.deepEqual(fs.readFileSync(root+'Roleta-Musical-V1.2-Beta4.md'),fs.readFileSync('betas/backups/pre-padronizacao/betas-originais/Roleta-Musical-Beta.md'));
});
