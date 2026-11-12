const {test}=require('node:test');const assert=require('node:assert/strict');
const {harness}=require('./central-harness.cjs');const {manualScenario}=require('./central-manual-scenarios.cjs');
for(const reference of ['Alfredo','To Pimp a Butterfly'])test(`manual ${reference}: referência específica, sem preenchimento fraco`,async()=>{
 const {results,h}=await manualScenario('album',reference);
 assert.ok(results.some(x=>x.album==='Close Work'));
 assert.ok(results.every(x=>x.album!=='Smile'&&x.album!=='Scene Only'));
 assert.ok(results.length<6);assert.ok(!results.some(x=>x.album==='Close Work Instrumentals'));assert.equal(h.getIssues().length,0);
 const trace=h.getDiagnostics().manual.find(x=>x.key.includes('smile'));
 assert.ok(trace.origins.some(x=>x.source==='tag'&&x.sourceTag==='soul'));assert.equal(trace.after,null);
 assert.ok(results.filter(x=>x.artist==='Related B').length<=2);
 assert.ok(results.every(x=>x.reason&&!/timbre|instrumentação|atmosfera/.test(x.reason)));
});
test('manual não é puxada por avaliações de artistas favoritos',async()=>{
 const pages=[{type:'musicRelease',title:'Other Pop Album',artists:['Katy Perry'],personalRating:10,genres:['pop'],file:{path:'Musicas/Pop.md'}}];
 const a=await manualScenario('album','Alfredo'),b=await manualScenario('album','Alfredo',pages);
 assert.deepEqual(a.results.map(x=>x.spotifyId),b.results.map(x=>x.spotifyId));
});
test('manual por faixa privilegia track.getSimilar e rejeita conexão fraca',async()=>{
 const {results,h}=await manualScenario('track');assert.ok(results.some(x=>x.track==='Close Track'));assert.ok(results.every(x=>x.track!=='Weak Track'));assert.ok(h.getDiagnostics().manual.some(x=>x.origins.some(e=>e.source==='similar-track')));
});
test('manual por artista preserva relações entre artistas e por tag continua explícita',async()=>{
 const a=await manualScenario('artist');assert.ok(a.results.some(x=>x.type==='artist'));assert.equal(a.h.getIssues().length,0);
 const tag=await manualScenario('tag');assert.ok(tag.results.length>0);
});
test('pontuações 15, 35 e 65 não saturam em 10',async()=>{
 const h=await harness();const taste={affinity:new Map(),works:[]};const values=[15,35,65].map(discoveryScore=>h.scoreAlbumTaste({discoveryScore},taste).discoveryScore);assert.deepEqual(values,[15,35,65]);
});
test('feedback fraco ajusta a nota sem substituir; repetição não amplia efeito',async()=>{
 const pages=[{type:'musicRelease',title:'Work',artists:['A'],personalRating:9,genres:['specific style'],file:{path:'Musicas/Work.md'}}];
 const line='- feedback: maybe | type: album | artist: A | album: Work';
 const h=await harness(pages,line),profile=await h.albumTasteProfile(await h.parseFeedback());
 const signal=profile.works[0].signal;assert.ok(signal>.6);assert.ok(signal<(9-5.5)/4.5);
 h.setFeedback(line+'\n'+line);assert.equal((await h.albumTasteProfile(await h.parseFeedback())).works[0].signal,signal);
});
test('instrumentais e edições alternativas são rebaixadas, sem proibição por nome',async()=>{
 const h=await harness();const taste={affinity:new Map(),works:[]};const normal=h.scoreAlbumTaste({album:'Work',discoveryScore:10},taste),instrumental=h.scoreAlbumTaste({album:'Work Instrumentals',discoveryScore:10},taste);assert.ok(instrumental.discoveryScore<normal.discoveryScore);assert.ok(instrumental.discoveryScore>0);
 const explicit=h.scoreAlbumTaste({album:'Work Instrumentals',discoveryScore:10},{affinity:new Map(),works:[{album:'Other Instrumentals',signal:1,tags:[]}]});assert.equal(explicit.discoveryScore,10);
});
