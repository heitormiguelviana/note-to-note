// Metadados CONTROLADOS para regressão. Não representam respostas reais do Last.fm.
const {harness}=require('./central-harness.cjs');
const {random}=require('./central-scenarios.cjs');
async function manualScenario(kind='album', reference='Alfredo', pages=[]) {
 const referenceArtist=reference==='Alfredo'?'Freddie Gibbs & The Alchemist':'Kendrick Lamar';
 const specific=reference==='Alfredo'?'sample based hip hop':'jazz rap';
 const albums=[
  {artist:'Related A',name:'Close Work',tags:['hip hop',specific]},
  {artist:'Related B',name:'Another Work',tags:['hip hop',specific]},
  {artist:'Related B',name:'Another Work Two',tags:['hip hop',specific]},
  {artist:'Related C',name:'Scene Only',tags:['hip hop','trap']},
  {artist:'Related A',name:'Close Work Instrumentals',tags:['hip hop',specific]},
  {artist:'Katy Perry',name:'Smile',tags:['pop','soul']}
 ];
 const metadata=(artist,name)=>name===reference?['hip hop','soul',specific]:albums.find(a=>a.artist===artist&&a.name===name)?.tags || (artist==='Related C'?['hip hop','trap']:['hip hop',specific]);
 const fetch=async url=>{
  const q=new URL(url).searchParams,method=q.get('method'),artist=q.get('artist'),name=q.get('album'),tag=q.get('tag');let data;
  if(method==='album.getInfo')data={album:{artist,name,tags:{tag:metadata(artist,name).map(name=>({name}))}}};
  else if(method==='artist.getSimilar')data={similarartists:{artist:['Related A','Related B','Related C'].map((name,i)=>({name,match:.92-i*.05}))}};
  else if(method==='artist.getTopAlbums')data={topalbums:{album:albums.filter(a=>a.artist===artist).map(a=>({name:a.name}))}};
  else if(method==='tag.getTopAlbums')data={albums:{album:albums.filter(a=>a.tags.includes(tag)).map(a=>({name:a.name,artist:{name:a.artist}}))}};
  else if(method==='track.getSimilar')data={similartracks:{track:[{name:'Close Track',artist:{name:'Related A'},match:.9},{name:'Weak Track',artist:{name:'Related C'},match:.05}]}};
  else if(method==='track.getTopTags' || method==='artist.getTopTags')data={toptags:{tag:(artist==='Related C'?['hip hop','trap']:['hip hop',specific]).map(name=>({name,count:100}))}};
  else if(method==='tag.getTopTracks')data={tracks:{track:[{name:'Tag Track',artist:{name:'Related B'}}]}};
  else if(method==='tag.getTopArtists')data={topartists:{artist:[{name:'Related A'}]}};
  else throw Error('Unexpected fixture method '+method);
  return {ok:true,json:async()=>data};
 };
 const h=await harness(pages,'',{fetch,math:random()});h.CFG.lastfmKey='fixture';h.CFG.lastfmDelay=0;h.CFG.debug=true;h.state.manualFilters.excludeCatalogArtists=false;
 h.setSpotify({search:async(query,types)=>{
  const type=Array.isArray(types)?types[0]:types;
  if(type==='artist'){const name=query.replace(/^"|"$/g,'');return {artists:{items:[{id:name,name}]}};}
  const [,title,artist]=query.match(/^"(.*)" "(.*)"$/);
  if(type==='track')return {tracks:{items:[{id:title,name:title,artists:[{name:artist}],album:{name:'Container'}}]}};
  return {albums:{items:[{id:title,name:title,album_type:'album',total_tracks:10,artists:[{name:artist,id:artist}]}]}};
 }});
 const ref={type:kind,artist:referenceArtist,name:kind==='artist'?referenceArtist:kind==='tag'?'hip hop':reference};
 const results=await h.generateManual([ref],await h.parseFeedback());
 return {results,h,ref};
}
module.exports={manualScenario};
