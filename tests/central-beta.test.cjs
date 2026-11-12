const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const {harness} = require('./central-harness.cjs');
const line = (action,type,artist,name='') => `- feedback: ${action} | type: ${type} | artist: ${artist} | ${type === 'track' ? 'track' : 'album'}: ${name}`;
const album = (id,artist,title,artistId=artist) => ({id,name:title,album_type:'album',total_tracks:10,artists:[{name:artist,id:artistId}]});
const page = (artist,rating,title='Album') => ({file:{path:`Musicas/${artist}-${title}.md`},type:'musicRelease',artists:[artist],title,personalRating:rating});

test('feedback repetido, alteração, bloqueio e desbloqueio usam último estado', async () => {
 const h=await harness([], [line('interesting','album','A','X'),line('interesting','album','A','X'),line('dislike','album','A','X'),line('block','artist','A'),line('maybe','artist','A')].join('\n'));
 const f=await h.parseFeedback(); assert.equal(h.feedbackAlbumState(f,'A','X'),'dislike'); assert.equal(f.blockedArtists.has('a'),false); assert.equal(f.albums.values().next().value.actions.length,3); assert.ok(Math.abs(h.artistFeedbackScore(f,'A') + .55) < 1e-9);
});
test('edições de feedback compartilham estado e bloqueios de artista persistem', async()=>{
 const h=await harness([], [line('dislike','album','A','X'),line('interesting','album','A','X (Deluxe Edition)'),line('block','artist','A')].join('\n')); const f=await h.parseFeedback(); assert.equal(h.feedbackAlbumState(f,'A','X'),null); assert.ok(f.blockedArtists.has('a'));
});
test('Spotify rejeita homônimos, edições divergentes e artistas ambíguos', async()=>{
 let h=await harness(); h.setItems([album('1','Outro','Same')]); assert.equal(await h.resolveSpotifyAlbum('A','Same'),null);
 h=await harness();h.setItems([album('1','A','Same (Deluxe Edition)')]);assert.equal(await h.resolveSpotifyAlbum('A','Same'),null);
 h=await harness();h.setItems([album('1','A','Same','a1'),album('2','A','Same','a2')]);assert.equal(await h.resolveSpotifyAlbum('A','Same'),null);
 h=await harness();h.setItems([album('1','A','Same'),album('2','A','Same')]);assert.equal(await h.resolveSpotifyAlbum('A','Same'),null);
 h=await harness();h.setItems([album('1','A','Same')]);assert.equal((await h.resolveSpotifyAlbum('A','Same')).spotifyId,'1');
 h=await harness(); const item=album('1','A','Same');item.artists.push({name:'B',id:'b'}); h.setItems([item]); assert.equal((await h.resolveSpotifyAlbum('A feat. B','Same')).spotifyId,'1');
});
test('perfil agrega notas contraditórias sem contagem ilimitada',async()=>{
 const h=await harness([page('A',5,'x'),page('A',8,'y'),page('B',8,'z')]); const f=await h.parseFeedback(); const {seeds}=await h.personalizedSeeds(f); assert.ok(seeds.find(x=>x.artist==='B').weight>seeds.find(x=>x.artist==='A').weight);
 const many=await harness(Array.from({length:100},(_,i)=>page('A',8,`${i}`))); assert.ok((await many.personalizedSeeds(await many.parseFeedback())).seeds[0].weight<=10);
});
test('catálogo sem avaliações não é tratado como preferência; curtidas são sinais',async()=>{
 const h=await harness([page('A',0)]);let f=await h.parseFeedback();assert.equal((await h.personalizedSeeds(f)).seeds.length,0);h.setLiked([{type:'track',artist:'B',track:'x'}]);assert.equal((await h.personalizedSeeds(f)).seeds[0].artist,'B');
});
test('diversidade de tags é suave e ausência é neutra; deduplicação e histórico',async()=>{
 const h=await harness(); const items=[{type:'album',artist:'A',album:'x',discoveryScore:100,tags:['jazz']},{type:'album',artist:'B',album:'y',discoveryScore:99,tags:['jazz']},{type:'album',artist:'C',album:'z',discoveryScore:95,tags:['soul']}]; const out=h.diversify(items,{limit:2}); assert.equal(out[1].artist,'C'); assert.equal(h.dedupe([items[0],{...items[0],album:'x (Deluxe Edition)'}]).length,1);let seen=['a','b'];h.remember(seen,[{type:'artist',artist:'x'}]);assert.ok(seen.includes('artist::x'));
});
test('API ausente e catálogo vazio são distintos', async()=>{
 const h=await harness(); await assert.rejects(h.lastfm('artist.getSimilar',{artist:'A'}));assert.ok(h.getIssues().some(x=>x.includes('autenticação'))); const f=await h.parseFeedback();await assert.rejects(h.discoverPersonalized(f,new Set()),/Para começar/);
});
test('evento shown não desfaz bloqueio explícito; faixas usam estado mais recente',async()=>{
 const h=await harness([], [line('block','artist','A'),line('shown','artist','A'),line('block','track','B','song'),line('interesting','track','B','song')].join('\n'));const f=await h.parseFeedback(); assert.ok(f.blockedArtists.has('a'));assert.equal(h.feedbackTrackState(f,'B','song'),null);
});
test('Last.fm diferencia resposta vazia, limite, autenticação e resposta inválida',async()=>{
 const original=global.fetch;try{
  for (const [response,expected] of [[{ok:true,json:async()=>({similarartists:{artist:[]}})},null],[{ok:false,status:429},'limite'],[{ok:false,status:401},'autenticação'],[{ok:true,json:async()=>({})},'inválida']]) {
   const h=await harness();h.CFG.lastfmKey='ficticia';global.fetch=async()=>response;
   if(expected){await assert.rejects(h.lastfm('artist.getSimilar',{artist:'A'}));assert.ok(h.getIssues().some(x=>x.includes(expected)));}else{const result=await h.lastfm('artist.getSimilar',{artist:'A'});assert.equal(result.similarartists.artist.length,0);assert.equal(h.getIssues().length,0);}
  }
 } finally {global.fetch=original;}
});
test('sem tags não inventa diversidade e catálogo extenso respeita limites',async()=>{
 const h=await harness();let pool=Array.from({length:1000},(_,i)=>({type:'album',artist:`Artist ${i%100}`,album:`Album ${i}`,discoveryScore:1000-i}));const out=h.diversify(pool,{limit:6,maxPerArtist:1});assert.equal(out.length,6);assert.equal(new Set(out.map(x=>x.artist)).size,6); assert.equal(out[1].artist,'Artist 1');let history=[];h.remember(history,pool);assert.equal(history.length,h.CFG.seenLimit);
});
test('arquivo DataviewJS inteiro compila',()=>{
 const md=fs.readFileSync('Central-Beta.md','utf8');assert.doesNotThrow(()=>new AsyncFunction('dv','app',md.replace(/^```dataviewjs\s*/, '').replace(/\s*```\s*$/, '')));
});

test('Spotify distingue falha de rede, autenticação e lista vazia',async()=>{
 for(const [sdk,expected] of [[{search:async()=>{throw Object.assign(new Error('privado'),{status:401})}},'autenticação'],[{search:async()=>{throw new Error('privado')}},'rede'],[{search:async()=>({albums:{items:[]}})},null]]) {
  const h=await harness();h.setSpotify(sdk);if(expected){await assert.rejects(h.spotifySearch('query',['album']), e=>!e.message.includes('privado'));assert.ok(h.getIssues().some(x=>x.includes(expected)));}else{assert.equal((await h.spotifySearch('query',['album'])).albums.items.length,0);assert.equal(h.getIssues().length,0);}
 }
});

test('descarte Spotify normal não notifica; falha real informa resultados parciais',async()=>{
 const notices=[];const h=await harness([], '', {notices});h.setItems([album('1','Wrong','Same')]);assert.equal(await h.resolveSpotifyAlbum('A','Same'),null);h.reportApiIssues(6);assert.equal(notices.length,0);assert.equal(h.getDiagnostics().counts.spotifyIncompatible,1);
 h.setSpotify({search:async()=>{throw {status:429};}});await assert.rejects(h.spotifySearch('x',['album']));h.reportApiIssues(3);assert.match(notices[0],/3 recomendações entregues/);assert.doesNotMatch(notices[0],/indisponível/);
});
test('IDs regionais equivalentes são resolvidos deterministicamente, edições e datas distintas não',async()=>{
 const a={...album('z','A','Same'),release_date:'2020-01-01'},b={...a,id:'a'};
 let h=await harness();h.setItems([a,b]);assert.equal((await h.resolveSpotifyAlbum('A','Same')).spotifyId,'a');
 h=await harness();h.setItems([b,a]);assert.equal((await h.resolveSpotifyAlbum('A','Same')).spotifyId,'a');
 h=await harness();h.setItems([a,{...b,release_date:'2021-01-01'}]);assert.equal(await h.resolveSpotifyAlbum('A','Same'),null);
});
test('perfil por álbum distingue fases e dados ausentes, feedback não se duplica com curtida',async()=>{
 const pages=[{...page('A',9,'Pop'),genres:['pop']},{...page('A',2,'Noise'),genres:['noise']}];
 const h=await harness(pages);const taste=await h.albumTasteProfile(await h.parseFeedback());assert.ok(taste.affinity.get('pop')>0);assert.ok(taste.affinity.get('noise')<0);
 const base={type:'album',artist:'B',album:'New',discoveryScore:5,reason:'Fixture'};
 const pop=h.scoreAlbumTaste({...base,tags:['pop']},taste),noise=h.scoreAlbumTaste({...base,tags:['noise']},taste),unknown=h.scoreAlbumTaste(base,taste);
 assert.ok(pop.discoveryScore>unknown.discoveryScore);assert.ok(noise.discoveryScore<unknown.discoveryScore);assert.equal(unknown.discoveryScore,5);assert.match(pop.reason,/Pop/);
 h.setLiked([{type:'album',artist:'A',album:'Pop'}]);const same=await h.albumTasteProfile(await h.parseFeedback());assert.deepEqual([...same.affinity],[...taste.affinity]);
});
test('evidências redundantes têm contribuição limitada e metadados incompatíveis não entram no perfil',async()=>{
 const h=await harness(Array.from({length:100},(_,i)=>({...page('A',9,`work${i}`),genres:['pop']})));const taste=await h.albumTasteProfile(await h.parseFeedback());assert.equal(taste.works.length,3);assert.ok(taste.affinity.get('pop')<.34);
 const mismatch=await harness([page('A',9,'X')],'',{fetch:async()=>({ok:true,json:async()=>({album:{artist:'Wrong',name:'X',tags:{tag:[{name:'metal'}]}}})})});mismatch.CFG.lastfmKey='fixture';mismatch.CFG.lastfmDelay=0;assert.equal((await mismatch.albumTasteProfile(await mismatch.parseFeedback())).affinity.size,0);
});
test('pipeline completo dos três modos: estabilidade, cobertura, histórico e comparação de referência',async()=>{
 const {scenario}=require('./central-scenarios.cjs');const reference=require('./fixtures/recommendation-reference.json');
 const metrics={};
 for(const mode of ['familiar','balanced','explore']){
  const a=await scenario(mode),b=await scenario(mode);assert.deepEqual(a.keys,b.keys);assert.equal(a.keys.length,6);assert.equal(new Set(a.keys).size,6);assert.equal(a.notices.length,0);assert.equal(a.h.getIssues().length,0);
  const seen=a.result.map(x=>`${x.artist.toLowerCase()}::${x.album.toLowerCase()}`);const retry=await scenario(mode,seen);assert.ok(retry.keys.every(key=>!a.keys.includes(key)));
  metrics[mode]={before:{count:reference[mode].keys.length,artists:reference[mode].artists,tags:reference[mode].tags},after:{count:a.keys.length,artists:a.artists,tags:a.tags,distances:a.distances},elapsedMs:a.elapsedMs};
 }
 assert.ok(metrics.balanced.after.artists>=metrics.familiar.after.artists);
 assert.ok(metrics.explore.after.distances.includes('adjacent'));assert.ok(!metrics.explore.after.distances.includes('distant')); // fixture não possui ponte específica para estilos distantes
 assert.ok(metrics.explore.after.distances.filter(x=>x==='distant').length<=1);
 console.log('Comparação de fixtures:',JSON.stringify(metrics));
});

test('pipeline respeita bloqueios, posse e Já conheço em todos os modos',async()=>{
 const {scenario}=require('./central-scenarios.cjs');
 for(const mode of ['familiar','balanced','explore']) {
  const first=await scenario(mode);const item=first.result[0];
  const blocked=await scenario(mode,[],line('block','artist',item.artist));assert.ok(blocked.result.every(x=>x.artist!==item.artist));
  const known=await scenario(mode,[],'',[{type:'album',artist:item.artist,album:item.album}]);assert.ok(known.result.every(x=>x.artist!==item.artist || x.album!==item.album));
  assert.ok(first.result.every(x=>!['Bright','Noise','Blue'].includes(x.album)));
 }
});
test('familiar e equilibrado dão prioridades distintas no mesmo perfil e candidatos',async()=>{
 const {scenario}=require('./central-scenarios.cjs');const a=await scenario('familiar'),b=await scenario('balanced');assert.notDeepEqual(a.keys,b.keys);
});
test('resolução final escolhe obra compatível acima do ranking de popularidade',async()=>{
 const h=await harness([{...page('A',9,'Anchor'),genres:['pop']}],'',{fetch:async url=>{const q=new URL(url).searchParams;return {ok:true,json:async()=>({album:{name:q.get('album'),artist:q.get('artist'),tags:{tag:[{name:q.get('album')==='Second'?'pop':'noise'}]}}})};}});
 h.CFG.lastfmKey='fixture';h.CFG.lastfmDelay=0;
 h.setSpotify({search:async query=>{const [,name,artist]=query.match(/^"(.*)" "(.*)"$/);return {albums:{items:[album(name,artist,name)]}};}});
 const feedback=await h.parseFeedback(),taste=await h.albumTasteProfile(feedback);
 const result=await h.resolveAlbumPool([{type:'album',artist:'B',album:'First',discoveryScore:5.15},{type:'album',artist:'B',album:'Second',discoveryScore:5.14}],{maxPerArtist:1},feedback,taste);
 assert.equal(result[0].album,'Second');assert.match(result[0].reason,/Anchor/);
});
