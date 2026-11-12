// Comparação determinística dos snapshots sobre as mesmas respostas simuladas.
const {manualScenario}=require('./central-manual-scenarios.cjs');
(async()=>{
 const report={};
 for(const [label,path] of [['beta1','betas/central-musical/Central-Musical-Beta-1.md'],['beta2','Central-Beta.md']]){
  process.env.CENTRAL_TEST_FILE=path;report[label]={};
  for(const ref of ['Alfredo','To Pimp a Butterfly']){
   const started=performance.now(),{results}=await manualScenario('album',ref);
   report[label][ref]={results:results.map(x=>({type:x.type,artist:x.artist,title:x.album||x.track||x.artist,score:x.discoveryScore})),count:results.length,artists:new Set(results.map(x=>x.artist)).size,uniqueItems:new Set(results.map(x=>x.spotifyId)).size,elapsedMs:performance.now()-started};
  }
 }
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
