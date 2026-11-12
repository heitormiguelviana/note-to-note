const {harness}=require('./central-harness.cjs');
function random(seed=731) { const m=Object.create(Math);m.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};return m; }
const pages=[['Seed',9,'Bright',['soul','pop']],['Seed',3,'Noise',['noise']],['Other',8,'Blue',['jazz','soul']]].map(([artist,rating,title,genres])=>({type:'musicRelease',title,artists:[artist],personalRating:rating,genres,file:{path:`Musicas/${title}.md`}}));
async function scenario(mode, seen=[], feedback='', known=[]) {
 const notices=[];
 const fetch=async url=>{
  const q=new URL(url).searchParams,method=q.get('method'),artist=q.get('artist'),name=q.get('album'),tag=q.get('tag');
  let data;
  if(method==='artist.getSimilar')data={similarartists:{artist:Array.from({length:4},(_,i)=>({name:`Candidate ${i}`,match:1-i*.06}))}};
  else if(method==='artist.getTopAlbums')data={topalbums:{album:Array.from({length:3},(_,i)=>({name:`Record ${artist} ${i}`,artist:{name:artist}}))}};
  else if(method==='album.getInfo')data={album:{name,artist,tags:{tag:(artist==='Seed'&&name==='Noise'?['noise']:artist==='Other'?['jazz','soul']:['soul','pop']).map(name=>({name}))}}};
  else if(method==='tag.getSimilar')data={similartags:{tag:[{name:'neo soul'}]}};
  else if(method==='tag.getTopAlbums')data={albums:{album:Array.from({length:8},(_,i)=>({name:`${tag} record ${i}`,artist:{name:`${tag} artist ${i}`}}))}};
  else throw new Error('Unexpected fixture method '+method);
  return {ok:true,json:async()=>data};
 };
 const h=await harness(pages,feedback,{math:random(),fetch,notices});h.CFG.lastfmKey='fixture';h.CFG.lastfmDelay=0;h.state.personalizedMode=mode;h.state.knownItems=known;
 h.setSpotify({search:async query=>{
  const [,title,artist]=query.match(/^"(.*)" "(.*)"$/)||[];
  return {albums:{items:[{id:`${artist}:${title}`,name:title,album_type:'album',total_tracks:10,release_date:'2020-01-01',artists:[{name:artist,id:artist}]}]}};
 }});
 const before=performance.now();const result=await h.discoverPersonalized(await h.parseFeedback(),new Set(seen));const elapsedMs=performance.now()-before;
 return {keys:result.map(x=>`${x.artist}::${x.album}`),artists:new Set(result.map(x=>x.artist)).size,tags:new Set(result.flatMap(x=>x.tags||[])).size,distances:result.map(x=>x.distance||null),elapsedMs,notices, result,h};
}
module.exports={scenario,random};
