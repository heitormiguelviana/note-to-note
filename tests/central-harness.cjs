const fs = require('node:fs');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
async function harness(pages = [], feedback = '', options = {}) {
  const md = fs.readFileSync(process.env.CENTRAL_TEST_FILE || 'betas/Central-Beta.md', 'utf8');
  const source = md.slice(md.indexOf('\n') + 1, md.indexOf('/* ============================================================\n   INTERFACE — CSS')) +
    md.slice(md.indexOf('function personalizedProfile()'), md.indexOf('function renderPersonalized()')) + md.slice(md.indexOf('function manualPreferredType('), md.indexOf('async function runManualSearch('));
  let body = feedback, spotifyItems = [];
  const vault = {getAbstractFileByPath: p => p.endsWith('Feedback.md') || (options.likedData && p.endsWith('NoteToNote-Curtidos.json')) ? {path:p} : null, read: async file => file?.path?.endsWith('NoteToNote-Curtidos.json') ? JSON.stringify(options.likedData) : body};
  const dv = {app:{vault}, pages: () => pages};
  const window = {spotifysdk:{search: async () => ({albums:{items:spotifyItems}})}};
  // Closures passed into the evaluated program for deterministic fixtures.
  const injected = source.replace('const DEFAULT_FILTERS =', 'const bodySetter = value => app.setFeedback(value); const itemSetter = value => app.setItems(value);\nconst DEFAULT_FILTERS =');
  const renderStub = "function render() {}\n";
  const fn = new AsyncFunction('dv','app','window','localStorage','Math','fetch','Notice', renderStub + injected + `\nreturn {parallel,loadState,saveState,loadLiked, getLiked:()=>likedAlbums,parseFeedback,artistFeedbackScore,feedbackAlbumState,feedbackTrackState,resolveSpotifyAlbum,personalizedSeeds,personalizedProfile,diversify,dedupe,remember,discoverPersonalized,lastfm,spotifySearch,CFG,state,setSpotify:x=>window.spotifysdk=x,setLiked:x=>likedAlbums=x,setFeedback:bodySetter,setItems:itemSetter,getIssues:()=>[...apiIssues], reportApiIssues, resolveAlbumPool, beginDiagnostics:typeof beginDiagnostics === "function" ? beginDiagnostics : null, getDiagnostics:()=>typeof diagnostics === "undefined" ? null : diagnostics, albumTasteProfile:typeof albumTasteProfile === "function" ? albumTasteProfile : null, scoreAlbumTaste:typeof scoreAlbumTaste === "function" ? scoreAlbumTaste : null, generateManual};`);
  return fn(dv,{vault,setFeedback:x=>body=x,setItems:x=>spotifyItems=x},window,options.storage || {getItem:()=>null,setItem:()=>{}}, options.math || Math, options.fetch || ((...args)=>global.fetch(...args)), function Notice(message) { options.notices?.push(message); });
}
module.exports = { harness };
