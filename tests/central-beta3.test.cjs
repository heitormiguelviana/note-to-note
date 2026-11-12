const {test}=require('node:test');const assert=require('node:assert/strict');const {harness}=require('./central-harness.cjs');const {manualScenario}=require('./central-manual-scenarios.cjs');
for(const [type,expected] of [['album','album'],['track','track'],['artist','artist']])test(`tipo único ${type} retorna apenas ${expected}`,async()=>{
 const {results}=await manualScenario(type);assert.ok(results.length);assert.ok(results.every(x=>x.type===expected));
});
test('cache reduz chamadas reais em buscas repetidas',async()=>{
 const {h,ref}=await manualScenario('album');const first={...h.getDiagnostics().counts};await h.generateManual([ref],await h.parseFeedback());const next=h.getDiagnostics().counts;
 assert.ok(next.lastfmCacheHits>first.lastfmCacheHits);assert.equal(next.lastfmRequests,first.lastfmRequests);assert.equal(next.spotifyRequests,first.spotifyRequests);
});
test('parallel preserva resultados isolados e diagnostica erro inesperado sem vazar texto',async()=>{
 const notices=[];const h=await harness([],'',{notices});h.CFG.debug=true;
 const result=await h.parallel([1,2,3],async x=>{if(x===2)throw new TypeError('TOKEN privado');return x;});assert.deepEqual(result,[1,null,3]);assert.equal(h.getDiagnostics().counts.unexpectedWorkerErrors,1);assert.ok(!JSON.stringify(h.getDiagnostics()).includes('TOKEN'));h.reportApiIssues(2);assert.match(notices[0],/erro interno/);
});
test('estado V1.8 é importado sem escrever na chave oficial; curtidos e feedback preservados',async()=>{
 const original={section:'manual',manualSelected:[{type:'album',artist:'A',name:'Work'}],manualSeen:['a::work'],knownItems:[{type:'album',artist:'B',album:'Known'}],personalizedMode:'familiar',personalizedSeeds:'A',recommendations:[]};const data=new Map([['central-descoberta-v12',JSON.stringify(original)]]),writes=[];
 const h=await harness([],'- feedback: block | type: artist | artist: C',{storage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>{writes.push(k);data.set(k,v);}},likedData:{version:2,items:[{type:'album',artist:'D',album:'Liked'}]}});
 assert.deepEqual(h.state.manualSelected,original.manualSelected);assert.deepEqual(h.state.knownItems,original.knownItems);h.saveState();assert.ok(!writes.includes('central-descoberta-v12'));assert.equal(data.get('central-descoberta-v12'),JSON.stringify(original));await h.loadLiked();assert.equal(h.getLiked()[0].album,'Liked');assert.ok((await h.parseFeedback()).blockedArtists.has('c'));
});
test('referências mistas continuam admitindo resultados mistos',async()=>{
 const {h,ref}=await manualScenario('album');h.state.manualSeen=[];h.setFeedback('- feedback: dislike | type: album | artist: Related C | album: Scene Only');const results=await h.generateManual([ref,{type:'artist',name:ref.artist}],await h.parseFeedback());assert.ok(results.length);assert.ok(results.some(x=>x.type==='album'));assert.ok(results.some(x=>x.type==='artist'));
});
