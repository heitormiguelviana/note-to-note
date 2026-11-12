```dataviewjs
// NOTE TO NOTE — BETA VISUAL 1 (base oficial preservada)
// MUSICAL — CENTRAL DE CONFIGURAÇÕES V2.5.0 | NOTA ÚNICA
// Requer Dataview com consultas JavaScript habilitadas.
const A = dv.app, V = A.vault, R = dv.container;
const PATH = "Musicas/Sistema/Configuracoes.json";
const TEMPLATE_PATH = "Musicas/Sistema/Template Album Musical.md";
const REDIRECT = "obsidian://spotify/auth";
const defaults = {
  schemaVersion: 1,
  paths: {musicRoot:"Musicas",central:"Musicas/Central",feedback:"Musicas/Central/Feedback.md"},
  lastfm: {username:"",apiKey:""},
  integrations: {spotifyEnabled:true,mediaDbEnabled:true},
  preferences: {language:"pt-BR"}
};
R.replaceChildren();
R.classList.add("musical-config-v2", "ntn-visual-beta");
const css = `
/* NOTE TO NOTE — CONFIGURAÇÕES V2.5 · interface isolada */
.musical-config-v2{--ntn-bg:#191d23;--ntn-panel:#22272e;--ntn-raised:#292f37;--ntn-border:#39434e;--ntn-accent:#8ca9c7;--ntn-ink:#e4e9ee;--ntn-muted:#9daab8;--ntn-soft:#758393;max-width:940px;margin:10px auto 36px;color:var(--ntn-ink);font-family:var(--font-interface);font-size:13px;line-height:1.48;box-sizing:border-box}
.musical-config-v2 *{box-sizing:border-box}
.musical-config-v2 .mc-shell{background:var(--ntn-bg);border:1px solid var(--ntn-border);border-radius:13px;padding:24px 25px 22px;box-shadow:0 4px 20px #0000000c}
.musical-config-v2 .mc-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:19px;border-bottom:1px solid var(--ntn-border)}
.musical-config-v2 .mc-eyebrow{color:var(--ntn-accent);font-size:10px;letter-spacing:2px;font-weight:800;margin-bottom:6px}
.musical-config-v2 .mc-hero h2{font-size:23px;line-height:1.22;letter-spacing:-.55px;margin:0 0 5px;color:var(--ntn-ink);font-weight:760}
.musical-config-v2 .mc-hero-sub{font-size:12px;color:var(--ntn-muted)}
.musical-config-v2 .mc-version{flex-shrink:0;font-size:11px;font-weight:650;color:var(--ntn-accent);background:var(--ntn-raised);border:1px solid var(--ntn-border);padding:6px 10px;border-radius:6px}
.musical-config-v2 .mc-nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:16px 0 14px;border-bottom:1px solid var(--ntn-border);margin-bottom:14px}
.musical-config-v2 .mc-nav-group{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}
.musical-config-v2 .mc-nav-divider{width:1px;height:23px;background:var(--ntn-border);margin:0 5px}
.musical-config-v2 .mc-nav button{font-size:11px;min-height:31px;padding:6px 10px;border-radius:5px;white-space:nowrap}
.musical-config-v2 .mc-card{border:1px solid var(--ntn-border);background:var(--ntn-panel);border-radius:9px;padding:18px 19px;margin:12px 0}
.musical-config-v2 .mc-card h3{font-size:14px;font-weight:730;letter-spacing:-.1px;color:var(--ntn-ink);margin:0 0 12px;line-height:1.4}
.musical-config-v2 .mc-muted{color:var(--ntn-muted);font-size:12px;line-height:1.55;margin:6px 0 11px}
.musical-config-v2 .mc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.musical-config-v2 label.mc-field{display:flex;flex-direction:column;gap:6px;font-size:11px;color:var(--ntn-muted);min-width:0}
.musical-config-v2 .mc-field input,.musical-config-v2 input[type=text],.musical-config-v2 input[type=password],.musical-config-v2 input[type=number],.musical-config-v2 select,.musical-config-v2 textarea{width:100%;min-width:0;max-width:100%;border:1px solid var(--ntn-border);background:var(--ntn-bg);color:var(--ntn-ink);border-radius:6px;padding:8px 10px;min-height:35px;box-shadow:none;font-size:12px}
.musical-config-v2 input:focus-visible,.musical-config-v2 button:focus-visible{outline:2px solid var(--ntn-accent);outline-offset:2px}
.musical-config-v2 .mc-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:12px 0}
.musical-config-v2 button{font-family:inherit;font-weight:550;font-size:11.5px;line-height:1.35;border:1px solid var(--ntn-border);background:var(--ntn-raised);color:var(--ntn-ink);border-radius:6px;padding:8px 11px;min-height:33px;box-shadow:none;cursor:pointer;transition:background .13s,border-color .13s,color .13s;max-width:100%;white-space:normal;text-align:center}
.musical-config-v2 button:hover:not(:disabled){background:#343e49;border-color:#647d94}
.musical-config-v2 button.mc-on,.musical-config-v2 button.mc-main{background:var(--ntn-accent);color:#18212b;border-color:var(--ntn-accent);font-weight:680}
.musical-config-v2 button.mc-on:hover:not(:disabled),.musical-config-v2 button.mc-main:hover:not(:disabled){background:#a3bbd3;color:#18212b}
.musical-config-v2 button:disabled{opacity:.5;cursor:wait}
.musical-config-v2 .mc-note{background:var(--ntn-bg);border:1px solid var(--ntn-border);padding:11px 12px;border-radius:6px;font-size:11.5px;color:var(--ntn-muted);white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0;line-height:1.6}
.musical-config-v2 .mc-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--ntn-border);padding:11px 0}
.musical-config-v2 .mc-check{display:flex;gap:9px;align-items:center;margin:10px 0;color:var(--ntn-ink)}
.musical-config-v2 .mc-check input{width:15px;height:15px;accent-color:var(--ntn-accent);flex-shrink:0}
.musical-config-v2 a{color:var(--ntn-accent);text-decoration:none;overflow-wrap:anywhere}
.musical-config-v2 a:hover{text-decoration:underline}
.musical-config-v2 code{color:var(--ntn-accent);overflow-wrap:anywhere}
.musical-config-v2 .mc-status{margin:0 0 13px;border-color:var(--ntn-border);background:var(--ntn-panel)}
.musical-config-v2 .mc-section-head{margin:5px 0 14px}
.musical-config-v2 .mc-section-head h3{font-size:17px;letter-spacing:-.25px;margin:0 0 3px;color:var(--ntn-ink)}
.musical-config-v2 .mc-section-head p{font-size:12px;color:var(--ntn-muted);margin:0}
.musical-config-v2 .mc-card .mc-card{background:var(--ntn-bg)}
@media(max-width:650px){.musical-config-v2{margin:0 auto}.musical-config-v2 .mc-shell{padding:16px 13px}.musical-config-v2 .mc-hero h2{font-size:20px}.musical-config-v2 .mc-card{padding:14px 12px}.musical-config-v2 .mc-grid{grid-template-columns:1fr}.musical-config-v2 .mc-nav{gap:5px}.musical-config-v2 .mc-nav-divider{display:none}.musical-config-v2 .mc-nav-group{width:100%;gap:5px}.musical-config-v2 .mc-nav button{flex:1 1 auto}.musical-config-v2 .mc-version{font-size:10px;padding:5px 7px}}

/* NTN VISUAL BETA — START */
.musical-config-v2.ntn-visual-beta {
 --ntn-ui-bg:#191d23; --ntn-ui-surface:#22272e; --ntn-ui-raised:#292f38;
 --ntn-ui-border:#3b4652; --ntn-ui-text:#e9edf0; --ntn-ui-muted:#a6b2bf;
 --ntn-ui-accent:#9bb6ce; --ntn-ui-selected:#2c3b4a;
 --ntn-ui-success:#8fc5ad; --ntn-ui-warning:#d9bb82; --ntn-ui-error:#e3a0a0;
 --ntn-ui-radius:8px; --ntn-ui-control:38px;
 --ntn-ui-space-1:4px; --ntn-ui-space-2:8px; --ntn-ui-space-3:12px; --ntn-ui-space-4:16px; --ntn-ui-space-5:24px;
 --nt-bg:var(--ntn-ui-bg); --nt-surface:var(--ntn-ui-surface); --nt-surface-2:var(--ntn-ui-raised);
 --nt-line:var(--ntn-ui-border); --nt-ink:var(--ntn-ui-text); --nt-muted:var(--ntn-ui-muted);
 --nt-accent:var(--ntn-ui-accent); --nt-accent-bg:var(--ntn-ui-selected);
 --ntn-bg:var(--ntn-ui-bg); --ntn-panel:var(--ntn-ui-surface); --ntn-raised:var(--ntn-ui-raised);
 --ntn-border:var(--ntn-ui-border); --ntn-accent:var(--ntn-ui-accent); --ntn-ink:var(--ntn-ui-text); --ntn-muted:var(--ntn-ui-muted);
 --nr-bg:var(--ntn-ui-bg); --nr-panel:var(--ntn-ui-surface); --nr-border:var(--ntn-ui-border); --nr-accent:var(--ntn-ui-accent); --nr-muted:var(--ntn-ui-muted);
 width:100%; max-width:1100px!important; min-width:0; margin:0 auto;
 color:var(--ntn-ui-text); font-family:var(--font-interface),system-ui,sans-serif;
 font-size:14px; line-height:1.55; color-scheme:dark;
}
.musical-config-v2.ntn-visual-beta, .musical-config-v2.ntn-visual-beta * {box-sizing:border-box;}
.musical-config-v2.ntn-visual-beta > * {min-width:0;}
.musical-config-v2.ntn-visual-beta button {min-height:var(--ntn-ui-control)!important; max-width:100%; height:auto; white-space:normal!important; overflow-wrap:anywhere;
 font-family:inherit; font-size:12px!important; font-weight:600; line-height:1.35; padding:8px 12px!important;
 border-radius:6px!important; border:1px solid var(--ntn-ui-border)!important;
 background:var(--ntn-ui-surface)!important; color:var(--ntn-ui-text)!important; box-shadow:none!important;
 touch-action:manipulation;}
.musical-config-v2.ntn-visual-beta button:hover:not(:disabled) {border-color:var(--ntn-ui-accent)!important;}
.musical-config-v2.ntn-visual-beta .mc-main,.musical-config-v2.ntn-visual-beta .mc-on, .musical-config-v2.ntn-visual-beta button.active, .musical-config-v2.ntn-visual-beta button.is-active {background:var(--ntn-ui-selected)!important; border-color:var(--ntn-ui-accent)!important; color:var(--ntn-ui-text)!important;}
.musical-config-v2.ntn-visual-beta button:disabled {opacity:.5; cursor:default;}
.musical-config-v2.ntn-visual-beta :is(button,input,select,textarea,a,summary):focus-visible {outline:2px solid var(--ntn-ui-accent); outline-offset:3px;}
.musical-config-v2.ntn-visual-beta :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea) {
 min-height:var(--ntn-ui-control); min-width:0; max-width:100%; padding:8px 10px; border-radius:6px!important;
 background:var(--ntn-ui-bg)!important; color:var(--ntn-ui-text)!important; border:1px solid var(--ntn-ui-border)!important; font-family:inherit; font-size:12px;}
.musical-config-v2.ntn-visual-beta :is(input[type=checkbox],input[type=radio],input[type=range]) {accent-color:var(--ntn-ui-accent);}
.musical-config-v2.ntn-visual-beta .mc-card {border-radius:var(--ntn-ui-radius)!important; border-color:var(--ntn-ui-border)!important;}
.musical-config-v2.ntn-visual-beta .mc-hero h2 {font-size:clamp(25px,3.5vw,34px); line-height:1.18; letter-spacing:-.035em; font-weight:750; overflow-wrap:anywhere;}
.musical-config-v2.ntn-visual-beta :is(h2,h3) {line-height:1.3; overflow-wrap:anywhere;}
.musical-config-v2.ntn-visual-beta :is(summary,label) {overflow-wrap:anywhere;}
.musical-config-v2.ntn-visual-beta summary {min-height:32px; cursor:pointer;}
.musical-config-v2.ntn-visual-beta :is(table,pre) {max-width:100%;}
.musical-config-v2.ntn-visual-beta pre {white-space:pre-wrap; overflow-wrap:anywhere;}
.musical-config-v2.ntn-visual-beta :is(.stat-value,.mm-stat-value,.music-diary-stat-value) {font-variant-numeric:tabular-nums;}
@media (max-width:650px) {
 .musical-config-v2.ntn-visual-beta {padding:16px 12px 24px!important;}
 .musical-config-v2.ntn-visual-beta button {min-height:44px!important;}
 .musical-config-v2.ntn-visual-beta :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select) {min-height:42px;}
}
@media (prefers-reduced-motion:reduce) {
 .musical-config-v2.ntn-visual-beta *, .musical-config-v2.ntn-visual-beta *::before, .musical-config-v2.ntn-visual-beta *::after {animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important;}
}
.musical-config-v2.ntn-visual-beta .mc-shell {border-radius:10px;padding:24px}.musical-config-v2.ntn-visual-beta .mc-card {padding:20px}.musical-config-v2.ntn-visual-beta .mc-nav {gap:8px}.musical-config-v2.ntn-visual-beta .mc-nav-group {min-width:0;max-width:100%}.musical-config-v2.ntn-visual-beta .mc-card h3 {font-size:16px}.musical-config-v2.ntn-visual-beta .mc-note {line-height:1.65}
@media(max-width:650px) { .musical-config-v2.ntn-visual-beta :is(.mc-grid,.mm-diagnostics) {grid-template-columns:repeat(2,minmax(0,1fr));} .musical-config-v2.ntn-visual-beta .mc-shell {padding:16px 12px;} }
@media(max-width:420px) { .musical-config-v2.ntn-visual-beta :is(.mc-grid,.mm-diagnostics) {grid-template-columns:1fr;} }
/* NTN VISUAL BETA — END */
`;
const styleId="musical-config-v25-visual-beta-style";
if(!document.getElementById(styleId)){
 const st=document.createElement("style");st.id=styleId;st.textContent=css;document.head.appendChild(st);
}
function E(tag,parent,text,cls){
 const x=document.createElement(tag);if(cls)x.className=cls;
 if(text!==undefined&&text!==null)x.textContent=String(text);
 if(parent)parent.appendChild(x);return x;
}
function card(parent,title){const x=E("section",parent,null,"mc-card");E("h3",x,title);return x;}
function grid(parent){return E("div",parent,null,"mc-grid");}
function field(parent,title,value="",password=false){
 const l=E("label",parent,null,"mc-field");E("span",l,title);
 const i=E("input",l);i.type=password?"password":"text";i.value=value;i.autocomplete="off";return i;
}
function note(parent,text){return E("div",parent,text,"mc-note");}
function actions(parent){return E("div",parent,null,"mc-actions");}
function link(parent,text,url){const a=E("a",parent,text+" ↗");a.href=url;a.target="_blank";a.rel="noopener noreferrer";return a;}
function btn(parent,text,fn,primary=false){
 const b=E("button",parent,text,primary?"mc-main":"");b.type="button";
 b.addEventListener("click",async()=>{
  b.disabled=true;try{await fn();}catch(e){message("Erro: "+(e?.message||e),true);}finally{b.disabled=false;}
 });return b;
}
function check(parent,text,checked){
 const l=E("label",parent,null,"mc-check"),i=E("input",l);i.type="checkbox";i.checked=checked;E("span",l,text);return i;
}
function plugin(id){return A.plugins?.plugins?.[id]||null;}
function installed(id){return !!A.plugins?.manifests?.[id];}
function norm(s){
 const p=String(s||"").trim().replace(/\\/g,"/").replace(/\/+$/,"");
 if(!p||p.startsWith("/")||/^[A-Za-z]:/.test(p)||p.split("/").some(x=>!x||x==="."||x===".."))
  throw Error("Caminho inválido: "+s);
 return p;
}
function parent(p){const i=p.lastIndexOf("/");return i<0?"":p.slice(0,i);}
async function mkdir(p){
 if(!p)return; // Arquivos na raiz do vault não precisam de pasta-pai.
 let acc="";for(const part of norm(p).split("/")){
  acc=acc?acc+"/"+part:part;const f=V.getAbstractFileByPath(acc);
  if(f&&!Array.isArray(f.children))throw Error("Um arquivo ocupa a pasta: "+acc);
  if(!f)await V.createFolder(acc);
 }
}
async function readConfig(){
 const f=V.getAbstractFileByPath(PATH);if(!f)return null;
 const c=JSON.parse(await V.read(f));
 if(c.schemaVersion!==1)throw Error("Versão desconhecida de Configuracoes.json");
 return c;
}
async function writeConfig(obj){
 await mkdir(parent(PATH));
 const f=V.getAbstractFileByPath(PATH),s=JSON.stringify(obj,null,2)+"\n";
 if(f)await V.modify(f,s);else await V.create(PATH,s);
}
async function backup(id){
 const dir=(V.configDir||".obsidian")+"/plugins/"+id,source=dir+"/data.json";
 if(!await V.adapter.exists(source))return "";
 const dest=dir+"/data.musical-backup-"+Date.now()+".json";
 await V.adapter.write(dest,await V.adapter.read(source));return dest;
}
let cfg=structuredClone(defaults),loadError="";
try{
 const old=await readConfig();
 if(old)cfg={...defaults,...old,
  paths:{...defaults.paths,...old.paths},
  lastfm:{...defaults.lastfm,...old.lastfm},
  integrations:{...defaults.integrations,...old.integrations},
  preferences:{...defaults.preferences,...old.preferences}};
}catch(e){loadError=e.message;}
// Moldura visual: a lógica de atualização, credenciais, plugins e migração é preservada.
const shell=E("div",R,null,"mc-shell");
const hero=E("header",shell,null,"mc-hero");
const heroText=E("div",hero);
E("div",heroText,"NOTE TO NOTE / SISTEMA","mc-eyebrow");
E("h2",heroText,"Configurações");
E("div",heroText,"Integrações, módulos, atualizações e manutenção do acervo.","mc-hero-sub");
E("div",hero,"V2.5.0","mc-version");
// Persiste a aba selecionada quando o Dataview reexecuta a nota.
const mcUiKey="ntn-config-ui:"+V.getName();
const mcUi=globalThis[mcUiKey]??={tab:"Note to Note"};
const nav=E("nav",shell,null,"mc-nav"),pages={},tabButtons={};
nav.setAttribute("aria-label","Seções das configurações");
const navGroups=[
 ["Note to Note","Contas","Sistema","Plugins"],
 ["Migrar Datas","Migrar Scrobbles"]
];
const labels={"Note to Note":"Módulos e atualizações","Contas":"Contas","Sistema":"Sistema","Plugins":"Plugins","Migrar Datas":"Migrar datas","Migrar Scrobbles":"Migrar scrobbles"};
for(let g=0;g<navGroups.length;g++){
 if(g)E("span",nav,null,"mc-nav-divider").setAttribute("aria-hidden","true");
 const group=E("div",nav,null,"mc-nav-group");
 for(const name of navGroups[g]){
  tabButtons[name]=btn(group,labels[name],()=>tab(name));
  tabButtons[name].setAttribute("aria-label",name);
 }
}
const sectionDescriptions={
 "Note to Note":"Instale, atualize e verifique os módulos oficiais do Note to Note.",
 "Contas":"Configure suas credenciais e teste as conexões musicais.",
 "Sistema":"Ajuste os caminhos e as preferências utilizadas pelos módulos.",
 "Plugins":"Verifique dependências, instale recursos e execute diagnósticos.",
 "Migrar Datas":"Complete as datas de catalogação das notas antigas com backup.",
 "Migrar Scrobbles":"Atualize os contadores de escuta das notas antigas com backup."
};
for(const name of ["Note to Note","Contas","Sistema","Plugins","Migrar Datas","Migrar Scrobbles"]){
 const page=E("div",shell,null,"mc-page");pages[name]=page;
 const heading=E("div",page,null,"mc-section-head");
 E("h3",heading,name==="Note to Note"?"Módulos e atualizações":name);
 E("p",heading,sectionDescriptions[name]);
}
function tab(name){
 if(!pages[name])name="Contas";
 mcUi.tab=name;
 for(const k of Object.keys(pages)){
  pages[k].style.display=k===name?"":"none";
  tabButtons[k].classList.toggle("mc-on",k===name);
  tabButtons[k].setAttribute("aria-current",k===name?"page":"false");
 }
}
const info=note(shell,loadError?"Falha ao carregar configuração: "+loadError:"Configurações carregadas. Salve após alterar os campos.");
info.classList.add("mc-status");
function message(s,error=false){info.textContent=s;info.style.color=error?"var(--color-red)":"var(--text-muted)";}
// CONTAS
const lf=card(pages.Contas,"Last.fm");
E("div",lf,"Crie uma chave para consultar suas audições.","mc-muted");
link(lf,"Criar API Key no Last.fm","https://www.last.fm/api/account/create");
const lfg=grid(lf),lfUser=field(lfg,"Nome de usuário",cfg.lastfm.username),lfKey=field(lfg,"API Key",cfg.lastfm.apiKey,true);
const lfStatus=note(lf,"Conexão não testada.");
btn(actions(lf),"Testar Last.fm",async()=>{
 const user=lfUser.value.trim(),key=lfKey.value.trim();
 if(!user||!/^[a-f0-9]{32}$/i.test(key))throw Error("Informe usuário e API Key de 32 caracteres.");
 const url="https://ws.audioscrobbler.com/2.0/?method=user.getinfo&format=json&user="+encodeURIComponent(user)+"&api_key="+encodeURIComponent(key);
 const http = typeof requestUrl === "function" ? requestUrl : (typeof require === "function" ? require("obsidian").requestUrl : null);
 if(!http)throw Error("A API requestUrl do Obsidian não está disponível neste ambiente.");
 const response=await http({url,method:"GET",throw:false});
 const data=response.json||JSON.parse(response.text);
 if(data.error||!data.user)throw Error(data.message||"Não foi possível validar o Last.fm.");
 lfStatus.textContent="✓ Conectado: "+data.user.name+" • Scrobbles: "+(data.user.playcount||"—");
 message("Conexão Last.fm validada.");
},true);
const sp=card(pages.Contas,"Spotify API");
E("div",sp,"Crie uma aplicação no Spotify Developer Dashboard e configure suas credenciais no plugin Spotify API.","mc-muted");
link(sp,"Abrir Spotify Developer Dashboard","https://developer.spotify.com/dashboard");
note(sp,"Em sua aplicação, abra Settings → Redirect URIs, cadastre a URL abaixo e salve. Ela deve ser idêntica à utilizada pelo plugin.");
const redirect=E("code",sp,REDIRECT);redirect.style.display="block";redirect.style.margin="10px 0";
btn(actions(sp),"Copiar Redirect URI",async()=>{
 try{await navigator.clipboard.writeText(REDIRECT);}
 catch(e){throw Error("Selecione e copie manualmente: "+REDIRECT);}
 message("Redirect URI copiada.");
});
const spStatus=note(sp,"Verificando plugin...");
const spg=grid(sp),spId=field(spg,"Client ID (vazio: manter atual)"),spSecret=field(spg,"Client Secret (vazio: manter atual)","",true);
function spState(){
 const p=plugin("spotify-api"),s=p?.settings;
 return {p,s,ready:!!(s?.spotify_client_id&&s?.spotify_client_secret)};
}
function refreshSpotify(){
 const {p,s}=spState();
 spStatus.textContent=!p?"Spotify API não está ativo.":(
 "Client ID: "+(s.spotify_client_id?"configurado":"ausente")+
 " • Client Secret: "+(s.spotify_client_secret?"configurado":"ausente")+
 " • Login: "+(s.spotify_access_token?.refresh_token?"token salvo (não validado)":"pendente"));
}
const spa=actions(sp);
btn(spa,"Salvar credenciais Spotify",async()=>{
 const {p,s}=spState();if(!p?.saveSettings||!s)throw Error("Ative o plugin Spotify API.");
 const id=spId.value.trim(),secret=spSecret.value.trim();
 if(!id&&!secret){message("Nenhuma credencial nova informada.");return;}
 if(!window.confirm("Atualizar as credenciais Spotify? Será necessário autorizar novamente se elas mudarem."))return;
 const previous={spotify_client_id:s.spotify_client_id,spotify_client_secret:s.spotify_client_secret,spotify_access_token:s.spotify_access_token};
 const b=await backup("spotify-api");
 try{
  const changed=(id&&id!==s.spotify_client_id)||(secret&&secret!==s.spotify_client_secret);
  if(id)s.spotify_client_id=id;if(secret)s.spotify_client_secret=secret;
  if(changed)s.spotify_access_token={access_token:"",token_type:"",expires_in:0,refresh_token:""};
  await p.saveSettings();spId.value="";spSecret.value="";refreshSpotify();
  message("Spotify atualizado."+(b?" Backup: "+b:"")+(changed?" Autorize a conta novamente.":""));
 }catch(e){Object.assign(s,previous);try{await p.saveSettings();}catch(_){}throw e;}
},true);
btn(spa,"Autorizar conta Spotify",async()=>{
 const {ready}=spState();if(!ready)throw Error("Preencha e salve as credenciais primeiro.");
 const command=A.commands?.commands?.["spotify-api:spotify-auth-login"];
 if(typeof command?.callback!=="function")throw Error("Abra Configurações → Spotify API e use o login do plugin.");
 command.callback();message("Conclua a autorização no navegador.");
});
btn(spa,"Testar conexão Spotify",async()=>{
 if(!window.spotifysdk?.currentUser?.profile)throw Error("SDK Spotify indisponível. Faça login pelo plugin.");
 const profile=await window.spotifysdk.currentUser.profile();
 spStatus.textContent="✓ Conectado: "+(profile.display_name||profile.id);
 message("Spotify validado.");
});
btn(spa,"Atualizar status",async()=>refreshSpotify());
// SISTEMA
const paths=card(pages.Sistema,"Diretórios");
const pg=grid(paths),rootInput=field(pg,"Pasta de álbuns",cfg.paths.musicRoot),centralInput=field(pg,"Pasta Central",cfg.paths.central),feedbackInput=field(pg,"Arquivo de feedback",cfg.paths.feedback);
note(paths,"Alterar caminhos não move os arquivos existentes.");
const opts=card(pages.Sistema,"Integrações");
const spEnabled=check(opts,"Habilitar integração Spotify",cfg.integrations.spotifyEnabled);
const mediaEnabled=check(opts,"Habilitar integração MediaDB",cfg.integrations.mediaDbEnabled);
note(opts,"Estas preferências serão utilizadas pelos sistemas que já estiverem integrados ao Configuracoes.json.");
const save=card(pages.Sistema,"Salvar");
function values(){
 const root=norm(rootInput.value),central=norm(centralInput.value),feedback=norm(feedbackInput.value);
 if(!central.startsWith(root+"/"))throw Error("A Central deve ficar dentro da pasta de músicas.");
 if(!feedback.startsWith(central+"/")||!feedback.endsWith(".md"))throw Error("O feedback deve ser um .md dentro da Central.");
 const key=lfKey.value.trim();if(key&&!/^[a-f0-9]{32}$/i.test(key))throw Error("API Key Last.fm inválida.");
 return {...cfg,schemaVersion:1,
  paths:{...cfg.paths,musicRoot:root,central,feedback},
  lastfm:{...cfg.lastfm,username:lfUser.value.trim(),apiKey:key},
  integrations:{...cfg.integrations,spotifyEnabled:spEnabled.checked,mediaDbEnabled:mediaEnabled.checked}};
}
btn(actions(save),"Salvar Configuracoes.json",async()=>{
 const next=values();
 if(V.getAbstractFileByPath(PATH)&&!window.confirm("Atualizar Configuracoes.json?"))return;
 await writeConfig(next);cfg=next;message("✓ Salvo em "+PATH);await diagnosis();
},true);
btn(actions(save),"Criar pastas ausentes",async()=>{
 const c=values();await mkdir(c.paths.musicRoot);await mkdir(c.paths.central);await mkdir(parent(PATH));message("Pastas verificadas/criadas.");await diagnosis();
});
// PLUGINS
const pc=card(pages.Plugins,"Plugins");
const plist=E("div",pc);
const pluginDefs=[["Dataview","dataview"],["MediaDB","obsidian-media-db-plugin"],["Meta Bind","obsidian-meta-bind-plugin"],["Spotify API","spotify-api"],["CataloguedAt","catalogued-at-system-date"]];
function renderPlugins(){
 plist.replaceChildren();
 for(const [name,id] of pluginDefs){
  const row=E("div",plist,null,"mc-row");E("span",row,name);
  E("strong",row,plugin(id)?"Ativo":installed(id)?"Desativado":"Não instalado");
 }
}
btn(actions(pc),"Atualizar plugins",async()=>{renderPlugins();await diagnosis();});
// Template sem crases aninhadas para evitar encerramento indevido de dataviewjs.
const albumTemplate=[
 "---","type: musicRelease",'title: "{{ title }}"','year: "{{ year }}"',
 "artists:","{{ LIST:artists }}",'image: "{{ image }}"',
 "personalRating: 0","scrobbles: 1",'cataloguedAt: ""',"---","",
 "# {{ title }} ({{ year }})","**Artista:** {{ ENUM:artists }}","","---","",
 "### 🎧 Minha Avaliação",
 String.fromCharCode(96)+"INPUT[slider(minValue(0), maxValue(10)):personalRating]"+String.fromCharCode(96),
 "","---","","### 📝 Notas e Destaques","- **Opinião:**","","- **Faixas favoritas:**","  -",""
].join("\n");
const mc=card(pages.Plugins,"Configurar MediaDB");
note(mc,"Configura a pasta de álbuns e cria o template Musical. A opção de frontmatter afeta globalmente o MediaDB. Confirme antes de aplicar.");
btn(actions(mc),"Configurar MediaDB automaticamente",async()=>{
 const p=plugin("obsidian-media-db-plugin");if(!p?.settings||!p.saveSettings)throw Error("Ative o MediaDB.");
 const c=values(),old=p.settings;
 if(!window.confirm("Configurar MediaDB?\nDestino: "+c.paths.musicRoot+"\nTemplate: "+TEMPLATE_PATH+"\n\nATENÇÃO: a opção de frontmatter afeta outros tipos de mídia."))return;
 await mkdir(c.paths.musicRoot);await mkdir(parent(TEMPLATE_PATH));
 const file=V.getAbstractFileByPath(TEMPLATE_PATH);
 const before=file?await V.read(file):null;
 if(file&&before!==albumTemplate&&!window.confirm("Substituir o template Musical existente?"))return;
 const previous={musicReleaseFolder:old.musicReleaseFolder,musicReleaseTemplate:old.musicReleaseTemplate,templates:old.templates,useDefaultFrontMatter:old.useDefaultFrontMatter};
 const proposed={musicReleaseFolder:c.paths.musicRoot,musicReleaseTemplate:TEMPLATE_PATH,templates:true,useDefaultFrontMatter:false};
 const b=await backup("obsidian-media-db-plugin");
 let created=false;
 try{
  if(file)await V.modify(file,albumTemplate);else{await V.create(TEMPLATE_PATH,albumTemplate);created=true;}
  Object.assign(old,proposed);await p.saveSettings();
  const dataPath=(V.configDir||".obsidian")+"/plugins/obsidian-media-db-plugin/data.json";
  const persisted=JSON.parse(await V.adapter.read(dataPath));
  for(const [k,v] of Object.entries(proposed))if(persisted[k]!==v)throw Error("Falha ao confirmar "+k);
  message("✓ MediaDB configurado."+(b?" Backup: "+b:""));await diagnosis();
 }catch(e){
  Object.assign(old,previous);try{await p.saveSettings();}catch(_){}
  try{const f=V.getAbstractFileByPath(TEMPLATE_PATH);if(created&&f)await V.delete(f);else if(f&&before!==null)await V.modify(f,before);}catch(_){}
  throw e;
 }
},true);
// INSTALADOR DO CATALOGUEDAT V3.1.0 (DESKTOP + MOBILE)
const cataloguedCard=card(pages.Plugins,"Instalar / atualizar CataloguedAt");
note(cataloguedCard,"CataloguedAt V3.1.0: preserva a lógica da V3.0, mas evita importar child_process no celular e usa a data local no mobile. A instalação não altera o Diário nem o Monitor. Se já existe uma versão anterior, use Atualizar (com backup e confirmação).");
const cataloguedStatus=note(cataloguedCard,"");
const cataloguedId="catalogued-at-system-date";
const cataloguedFiles={
 "main.js": "Y29uc3QgeyBQbHVnaW4sIFRGaWxlLCBOb3RpY2UsIFBsYXRmb3JtIH0gPSByZXF1aXJlKCJvYnNpZGlhbiIpOwovLyBDYXJyZWdhciBjaGlsZF9wcm9jZXNzIGFwZW5hcyBubyBkZXNrdG9wOyBpbmRpc3BvbsOtdmVsIG5vIE9ic2lkaWFuIE1vYmlsZS4KY29uc3QgZXhlY0ZpbGUgPSBQbGF0Zm9ybS5pc01vYmlsZSA/IG51bGwgOiByZXF1aXJlKCJjaGlsZF9wcm9jZXNzIikuZXhlY0ZpbGU7Cgptb2R1bGUuZXhwb3J0cyA9IGNsYXNzIENhdGFsb2d1ZWRBdFN5c3RlbURhdGVQbHVnaW4gZXh0ZW5kcyBQbHVnaW4gewoKICAgIG9ubG9hZCgpIHsKCiAgICAgICAgLyoKICAgICAgICAgKiBJTVBPUlRBTlRFOgogICAgICAgICAqCiAgICAgICAgICogTyBPYnNpZGlhbiBkaXNwYXJhIGV2ZW50b3MgImNyZWF0ZSIgZHVyYW50ZSBvIGNhcnJlZ2FtZW50bwogICAgICAgICAqIGluaWNpYWwgZG8gVmF1bHQuCiAgICAgICAgICoKICAgICAgICAgKiBQb3IgaXNzbyBvIGxpc3RlbmVyIHPDsyBjb21lw6dhIGRlcG9pcyBkbyBsYXlvdXQgZXN0YXIgcHJvbnRvLgogICAgICAgICAqLwogICAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHsKCiAgICAgICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudCgKICAgICAgICAgICAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKCJjcmVhdGUiLCAoZmlsZSkgPT4gewogICAgICAgICAgICAgICAgICAgIHZvaWQgdGhpcy5vbkZpbGVDcmVhdGVkKGZpbGUpOwogICAgICAgICAgICAgICAgfSkKICAgICAgICAgICAgKTsKCiAgICAgICAgfSk7CgogICAgICAgIGNvbnNvbGUubG9nKAogICAgICAgICAgICAiW0NhdGFsb2d1ZWRBdF0gUGx1Z2luIDMuMS4wIGNhcnJlZ2Fkby4iCiAgICAgICAgKTsKICAgIH0KCgogICAgYXN5bmMgb25GaWxlQ3JlYXRlZChmaWxlKSB7CgogICAgICAgIC8qCiAgICAgICAgICogU8OzIE1hcmtkb3duLgogICAgICAgICAqLwogICAgICAgIGlmICghKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkpIHsKICAgICAgICAgICAgcmV0dXJuOwogICAgICAgIH0KCiAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uLnRvTG93ZXJDYXNlKCkgIT09ICJtZCIpIHsKICAgICAgICAgICAgcmV0dXJuOwogICAgICAgIH0KCgogICAgICAgIC8qCiAgICAgICAgICogU8OzIGFycXVpdm9zIGRpcmV0YW1lbnRlIGRlbnRybyBkZSBNdXNpY2FzLy4KICAgICAgICAgKgogICAgICAgICAqIElzc28gZXhjbHVpOgogICAgICAgICAqCiAgICAgICAgICogTXVzaWNhcy9DZW50cmFsLwogICAgICAgICAqIE11c2ljYXMvcXVhbHF1ZXItb3V0cmEtcGFzdGEvCiAgICAgICAgICovCiAgICAgICAgaWYgKCFmaWxlLnBhdGguc3RhcnRzV2l0aCgiTXVzaWNhcy8iKSkgewogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQoKICAgICAgICBjb25zdCByZWxhdGl2ZVBhdGggPSBmaWxlLnBhdGguc3Vic3RyaW5nKAogICAgICAgICAgICAiTXVzaWNhcy8iLmxlbmd0aAogICAgICAgICk7CgogICAgICAgIGlmIChyZWxhdGl2ZVBhdGguaW5jbHVkZXMoIi8iKSkgewogICAgICAgICAgICByZXR1cm47CiAgICAgICAgfQoKCiAgICAgICAgLyoKICAgICAgICAgKiBUZW1wbGF0ZXMgcXVlIG7Do28gZGV2ZW0gcmVjZWJlciBjYXRhbG9ndWVkQXQuCiAgICAgICAgICovCiAgICAgICAgY29uc3QgaWdub3JlZEZpbGVzID0gbmV3IFNldChbCiAgICAgICAgICAgICJ0ZW1wbGF0ZShpZ25vcmUpLm1kIiwKICAgICAgICAgICAgInRlbXBsYXRlMihpZ25vcmUpLm1kIgogICAgICAgIF0pOwoKICAgICAgICBpZiAoaWdub3JlZEZpbGVzLmhhcyhmaWxlLm5hbWUpKSB7CiAgICAgICAgICAgIHJldHVybjsKICAgICAgICB9CgoKICAgICAgICAvKgogICAgICAgICAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQogICAgICAgICAqIENBUFRVUkEgREEgREFUQQogICAgICAgICAqID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQogICAgICAgICAqCiAgICAgICAgICogRVNUQSDDiSBBIFBBUlRFIE1BSVMgSU1QT1JUQU5URS4KICAgICAgICAgKgogICAgICAgICAqIEEgZGF0YSDDqSBjYXB0dXJhZGEgSU1FRElBVEFNRU5URSBubyBldmVudG8gImNyZWF0ZSIuCiAgICAgICAgICoKICAgICAgICAgKiBEZXBvaXMgZGlzc28sIGEgZGF0YSBmaWNhIGd1YXJkYWRhIG5lc3RhIHZhcmnDoXZlbC4KICAgICAgICAgKgogICAgICAgICAqIE7Do28gY29uc3VsdGFtb3M6CiAgICAgICAgICoKICAgICAgICAgKiAtIGN0aW1lCiAgICAgICAgICogLSBtdGltZQogICAgICAgICAqIC0gYmlydGh0aW1lCiAgICAgICAgICogLSBmaWxlLnN0YXQKICAgICAgICAgKiAtIGRhdGEgZGUgY3JpYcOnw6NvIGRvIGFycXVpdm8KICAgICAgICAgKiAtIGRhdGEgZGUgbW9kaWZpY2HDp8OjbyBkbyBhcnF1aXZvCiAgICAgICAgICovCiAgICAgICAgbGV0IHN5c3RlbURhdGU7CgogICAgICAgIHRyeSB7CgogICAgICAgICAgICBzeXN0ZW1EYXRlID0gYXdhaXQgdGhpcy5nZXRPcGVyYXRpbmdTeXN0ZW1EYXRlKCk7CgogICAgICAgICAgICBjb25zb2xlLmxvZygKICAgICAgICAgICAgICAgIGBbQ2F0YWxvZ3VlZEF0XSBOb3ZhIG5vdGEgZGV0ZWN0YWRhOiAke2ZpbGUucGF0aH1gCiAgICAgICAgICAgICk7CgogICAgICAgICAgICBjb25zb2xlLmxvZygKICAgICAgICAgICAgICAgIGBbQ2F0YWxvZ3VlZEF0XSBEYXRhIGNhcHR1cmFkYSBkbyBzaXN0ZW1hOiAke3N5c3RlbURhdGV9YAogICAgICAgICAgICApOwoKICAgICAgICB9IGNhdGNoIChlcnJvcikgewoKICAgICAgICAgICAgY29uc29sZS5lcnJvcigKICAgICAgICAgICAgICAgICJbQ2F0YWxvZ3VlZEF0XSBOw6NvIGZvaSBwb3Nzw612ZWwgb2J0ZXIgYSBkYXRhIGRvIHNpc3RlbWE6IiwKICAgICAgICAgICAgICAgIGVycm9yCiAgICAgICAgICAgICk7CgogICAgICAgICAgICBuZXcgTm90aWNlKAogICAgICAgICAgICAgICAgIkNhdGFsb2d1ZWRBdDogbsOjbyBmb2kgcG9zc8OtdmVsIG9idGVyIGEgZGF0YSBkbyBzaXN0ZW1hLiIKICAgICAgICAgICAgKTsKCiAgICAgICAgICAgIHJldHVybjsKICAgICAgICB9CgoKICAgICAgICAvKgogICAgICAgICAqIEFnb3JhIHF1ZSB0ZW1vcyBhIGRhdGEgY29ycmV0YSwgdGVudGFtb3MgZ3JhdsOhLWxhLgogICAgICAgICAqCiAgICAgICAgICogTyBNZWRpYURCIHBvZGUgYWluZGEgZXN0YXIgZXNjcmV2ZW5kbyBvIGZyb250bWF0dGVyLgogICAgICAgICAqIFBvciBpc3NvIGZhemVtb3MgYWxndW1hcyB0ZW50YXRpdmFzLgogICAgICAgICAqLwogICAgICAgIGNvbnN0IGF0dGVtcHRzID0gWwogICAgICAgICAgICAxMDAsCiAgICAgICAgICAgIDQwMCwKICAgICAgICAgICAgMTAwMCwKICAgICAgICAgICAgMjAwMCwKICAgICAgICAgICAgNDAwMCwKICAgICAgICAgICAgNzAwMAogICAgICAgIF07CgogICAgICAgIGZvciAoY29uc3QgZGVsYXkgb2YgYXR0ZW1wdHMpIHsKCiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2xlZXAoZGVsYXkpOwoKICAgICAgICAgICAgY29uc3QgY3VycmVudEZpbGUgPQogICAgICAgICAgICAgICAgdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZpbGUucGF0aCk7CgogICAgICAgICAgICBpZiAoIShjdXJyZW50RmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkgewogICAgICAgICAgICAgICAgcmV0dXJuOwogICAgICAgICAgICB9CgogICAgICAgICAgICB0cnkgewoKICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMud3JpdGVDYXRhbG9ndWVkQXQoCiAgICAgICAgICAgICAgICAgICAgY3VycmVudEZpbGUsCiAgICAgICAgICAgICAgICAgICAgc3lzdGVtRGF0ZQogICAgICAgICAgICAgICAgKTsKCiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygKICAgICAgICAgICAgICAgICAgICBgW0NhdGFsb2d1ZWRBdF0gY2F0YWxvZ3VlZEF0IHByb3RlZ2lkbzogJHtzeXN0ZW1EYXRlfWAKICAgICAgICAgICAgICAgICk7CgogICAgICAgICAgICB9IGNhdGNoIChlcnJvcikgewoKICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoCiAgICAgICAgICAgICAgICAgICAgYFtDYXRhbG9ndWVkQXRdIEVycm8gYW8gZXNjcmV2ZXIgJHtmaWxlLnBhdGh9OmAsCiAgICAgICAgICAgICAgICAgICAgZXJyb3IKICAgICAgICAgICAgICAgICk7CiAgICAgICAgICAgIH0KICAgICAgICB9CgogICAgfQoKCiAgICBhc3luYyB3cml0ZUNhdGFsb2d1ZWRBdChmaWxlLCBkYXRlKSB7CgogICAgICAgIC8qCiAgICAgICAgICogcHJvY2Vzc0Zyb250TWF0dGVyIMOpIGEgZm9ybWEgYXByb3ByaWFkYSBkZSBhbHRlcmFyCiAgICAgICAgICogcHJvcHJpZWRhZGVzIGRvIGZyb250bWF0dGVyLgogICAgICAgICAqLwogICAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcigKICAgICAgICAgICAgZmlsZSwKICAgICAgICAgICAgKGZyb250bWF0dGVyKSA9PiB7CgogICAgICAgICAgICAgICAgLyoKICAgICAgICAgICAgICAgICAqIENvbW8gZXN0YSBmdW7Dp8OjbyBzw7Mgw6kgY2hhbWFkYSBkdXJhbnRlIGEgamFuZWxhCiAgICAgICAgICAgICAgICAgKiBpbWVkaWF0YW1lbnRlIHBvc3RlcmlvciDDoCBjcmlhw6fDo28gZGEgbm90YSwKICAgICAgICAgICAgICAgICAqIGVzY3JldmVtb3MgZXhwbGljaXRhbWVudGUgYSBkYXRhIGNhcHR1cmFkYQogICAgICAgICAgICAgICAgICogbm8gbW9tZW50byBkbyBldmVudG8gY3JlYXRlLgogICAgICAgICAgICAgICAgICoKICAgICAgICAgICAgICAgICAqIElzc28gaW1wZWRlIHF1ZSB1bSB2YWxvciBhbnRpZ28gY29sb2NhZG8gcGVsbwogICAgICAgICAgICAgICAgICogdGVtcGxhdGUvTWVkaWFEQiBwZXJtYW5lw6dhIG5vIGFycXVpdm8uCiAgICAgICAgICAgICAgICAgKi8KICAgICAgICAgICAgICAgIGZyb250bWF0dGVyLmNhdGFsb2d1ZWRBdCA9IGRhdGU7CgogICAgICAgICAgICB9CiAgICAgICAgKTsKICAgIH0KCgogICAgZ2V0T3BlcmF0aW5nU3lzdGVtRGF0ZSgpIHsKCiAgICAgICAgLy8gTm8gbW9iaWxlLCB1c2FyIG8gcmVsw7NnaW8gbG9jYWwgc2VtIGRlcGVuZMOqbmNpYXMgTm9kZS5qcy4KICAgICAgICAvLyBBIGRhdGEgw6kgY2FwdHVyYWRhIG5vIGV2ZW50byBjcmVhdGUsIG7Do28gZG8gY3RpbWUvbXRpbWUuCiAgICAgICAgaWYgKFBsYXRmb3JtLmlzTW9iaWxlKSB7CiAgICAgICAgICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7CiAgICAgICAgICAgIGNvbnN0IGRheSA9IFN0cmluZyhub3cuZ2V0RGF0ZSgpKS5wYWRTdGFydCgyLCAiMCIpOwogICAgICAgICAgICBjb25zdCBtb250aCA9IFN0cmluZyhub3cuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsICIwIik7CiAgICAgICAgICAgIGNvbnN0IHllYXIgPSBub3cuZ2V0RnVsbFllYXIoKTsKICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShgJHtkYXl9LSR7bW9udGh9LSR7eWVhcn1gKTsKICAgICAgICB9CgogICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7CgogICAgICAgICAgICAvKgogICAgICAgICAgICAgKiBMaW51eCAvIG1hY09TCiAgICAgICAgICAgICAqCiAgICAgICAgICAgICAqIENvbnN1bHRhIGRpcmV0YW1lbnRlIG8gcmVsw7NnaW8vZGF0YSBkbyBzaXN0ZW1hCiAgICAgICAgICAgICAqIGF0cmF2w6lzIGRvIGNvbWFuZG8gImRhdGUiLgogICAgICAgICAgICAgKi8KICAgICAgICAgICAgaWYgKFBsYXRmb3JtLmlzTGludXggfHwgUGxhdGZvcm0uaXNNYWNPUykgewoKICAgICAgICAgICAgICAgIGV4ZWNGaWxlKAogICAgICAgICAgICAgICAgICAgICJkYXRlIiwKICAgICAgICAgICAgICAgICAgICBbIislZC0lbS0lWSJdLAogICAgICAgICAgICAgICAgICAgIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHsKCiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikgewoKICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdCgKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgRXJyb3IoCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0ZGVyciB8fAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvci5tZXNzYWdlIHx8CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICJFcnJvIGFvIGV4ZWN1dGFyIGRhdGUuIgogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICkKICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7CgogICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuOwogICAgICAgICAgICAgICAgICAgICAgICB9CgogICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPQogICAgICAgICAgICAgICAgICAgICAgICAgICAgc3Rkb3V0LnRyaW0oKTsKCiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgKICAgICAgICAgICAgICAgICAgICAgICAgICAgICEvXlxkezJ9LVxkezJ9LVxkezR9JC8udGVzdChyZXN1bHQpCiAgICAgICAgICAgICAgICAgICAgICAgICkgewoKICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdCgKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgRXJyb3IoCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGBEYXRhIGludsOhbGlkYSByZXRvcm5hZGEgcGVsbyBzaXN0ZW1hOiAke3Jlc3VsdH1gCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKQogICAgICAgICAgICAgICAgICAgICAgICAgICAgKTsKCiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47CiAgICAgICAgICAgICAgICAgICAgICAgIH0KCiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTsKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgICAgICApOwoKICAgICAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgICAgfQoKCiAgICAgICAgICAgIC8qCiAgICAgICAgICAgICAqIFdpbmRvd3MKICAgICAgICAgICAgICoKICAgICAgICAgICAgICogQ29uc3VsdGEgZGlyZXRhbWVudGUgbyByZWzDs2dpbyBkbyBXaW5kb3dzCiAgICAgICAgICAgICAqIGF0cmF2w6lzIGRvIFBvd2VyU2hlbGwuCiAgICAgICAgICAgICAqLwogICAgICAgICAgICBpZiAoUGxhdGZvcm0uaXNXaW4pIHsKCiAgICAgICAgICAgICAgICBleGVjRmlsZSgKICAgICAgICAgICAgICAgICAgICAicG93ZXJzaGVsbC5leGUiLAogICAgICAgICAgICAgICAgICAgIFsKICAgICAgICAgICAgICAgICAgICAgICAgIi1Ob1Byb2ZpbGUiLAogICAgICAgICAgICAgICAgICAgICAgICAiLU5vbkludGVyYWN0aXZlIiwKICAgICAgICAgICAgICAgICAgICAgICAgIi1Db21tYW5kIiwKICAgICAgICAgICAgICAgICAgICAgICAgIkdldC1EYXRlIC1Gb3JtYXQgJ2RkLU1NLXl5eXknIgogICAgICAgICAgICAgICAgICAgIF0sCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3dzSGlkZTogdHJ1ZQogICAgICAgICAgICAgICAgICAgIH0sCiAgICAgICAgICAgICAgICAgICAgKGVycm9yLCBzdGRvdXQsIHN0ZGVycikgPT4gewoKICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7CgogICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcigKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RkZXJyIHx8CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2UgfHwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIkVycm8gYW8gZXhlY3V0YXIgUG93ZXJTaGVsbC4iCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKQogICAgICAgICAgICAgICAgICAgICAgICAgICAgKTsKCiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47CiAgICAgICAgICAgICAgICAgICAgICAgIH0KCiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9CiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGRvdXQudHJpbSgpOwoKICAgICAgICAgICAgICAgICAgICAgICAgaWYgKAogICAgICAgICAgICAgICAgICAgICAgICAgICAgIS9eXGR7Mn0tXGR7Mn0tXGR7NH0kLy50ZXN0KHJlc3VsdCkKICAgICAgICAgICAgICAgICAgICAgICAgKSB7CgogICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcigKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYERhdGEgaW52w6FsaWRhIHJldG9ybmFkYSBwZWxvIFdpbmRvd3M6ICR7cmVzdWx0fWAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApCiAgICAgICAgICAgICAgICAgICAgICAgICAgICApOwoKICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgICAgICAgICAgICAgICAgfQoKICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHQpOwogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAgICAgICAgICk7CgogICAgICAgICAgICAgICAgcmV0dXJuOwogICAgICAgICAgICB9CgoKICAgICAgICAgICAgcmVqZWN0KAogICAgICAgICAgICAgICAgbmV3IEVycm9yKAogICAgICAgICAgICAgICAgICAgICJTaXN0ZW1hIG9wZXJhY2lvbmFsIG7Do28gc3Vwb3J0YWRvLiIKICAgICAgICAgICAgICAgICkKICAgICAgICAgICAgKTsKCiAgICAgICAgfSk7CgogICAgfQoKCiAgICBzbGVlcChtcykgewoKICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoCiAgICAgICAgICAgIHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykKICAgICAgICApOwoKICAgIH0KCn07",
 "manifest.json": "ewogICJpZCI6ICJjYXRhbG9ndWVkLWF0LXN5c3RlbS1kYXRlIiwKICAibmFtZSI6ICJDYXRhbG9ndWVkQXQgU3lzdGVtIERhdGUiLAogICJ2ZXJzaW9uIjogIjMuMS4wIiwKICAibWluQXBwVmVyc2lvbiI6ICIxLjQuMCIsCiAgImRlc2NyaXB0aW9uIjogIlJlZ2lzdHJhIGEgZGF0YSBkbyBzaXN0ZW1hIGVtIGNhdGFsb2d1ZWRBdCBxdWFuZG8gdW1hIG5vdmEgbm90YSDDqSBjcmlhZGEgZW0gTXVzaWNhcy4iLAogICJhdXRob3IiOiAiSGVpdG9yIiwKICAiaXNEZXNrdG9wT25seSI6IGZhbHNlCn0K"
};
function cataloguedDecode(encoded){
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 return new TextDecoder("utf-8").decode(bytes);
}
async function cataloguedMkdir(path){
 let current="";
 for(const part of norm(path).split("/")){
  current=current?current+"/"+part:part;
  if(!await V.adapter.exists(current))await V.adapter.mkdir(current);
  else if((await V.adapter.stat(current))?.type!=="folder")throw Error("Não é uma pasta: "+current);
 }
}
async function cataloguedRefresh(){
 const folder=(V.configDir||".obsidian")+"/plugins/"+cataloguedId;
 const paths=Object.keys(cataloguedFiles).map(f=>folder+"/"+f);
 const present=await Promise.all(paths.map(p=>V.adapter.exists(p)));
 let version="desconhecida";
 if(present[1]){
  try{version=JSON.parse(await V.adapter.read(paths[1])).version||version;}catch(e){version="manifest inválido";}
 }
 cataloguedStatus.textContent=plugin(cataloguedId)?"Plugin ativo (v"+version+")":installed(cataloguedId)?"Plugin instalado, mas desativado (v"+version+")":present.every(Boolean)?"Arquivos encontrados (v"+version+"); reinicie o Obsidian para reconhecer":present.some(Boolean)?"Instalação parcial detectada":"Plugin não instalado";
 return {folder,paths,present,version};
}
async function cataloguedInstall(update){
 try{
  const {folder,paths,present,version}=await cataloguedRefresh();
  if(!update && (installed(cataloguedId)||present.some(Boolean))){
   cataloguedStatus.textContent="Já existe uma instalação. Use 'Atualizar' para substituir com backup.";
   message("CataloguedAt já existe; use Atualizar.");return;
  }
  if(update && !present.some(Boolean)){
   cataloguedStatus.textContent="Nenhuma instalação encontrada; use Instalar.";return;
  }
  const question=update
   ? "Atualizar CataloguedAt v"+version+" para V3.1.0?\n\nSerá feito backup dos arquivos existentes antes da substituição. Reinicie o Obsidian após a atualização."
   : "Instalar CataloguedAt V3.1.0 em "+folder+"?\n\nReinicie o Obsidian e ative o plugin após a instalação.";
  if(!window.confirm(question)){cataloguedStatus.textContent="Operação cancelada.";return;}
  await cataloguedMkdir(folder);
  const filenames=Object.keys(cataloguedFiles);
  const originals={};
  const backups=[];
  const written=[];
  try{
   for(let i=0;i<paths.length;i++){
    if(await V.adapter.exists(paths[i])){
     originals[paths[i]]=await V.adapter.read(paths[i]);
     if(update){
      const backup=paths[i]+".backup-before-v3.1.0";
      if(await V.adapter.exists(backup))throw Error("Backup já existe: "+backup+". Preserve-o antes de tentar novamente.");
      await V.adapter.write(backup,originals[paths[i]]);
      backups.push(backup);
     }else throw Error("Arquivo existente: "+paths[i]);
    }
   }
   for(let i=0;i<paths.length;i++){
    const content=cataloguedDecode(cataloguedFiles[filenames[i]]);
    await V.adapter.write(paths[i],content);
    written.push(paths[i]);
    if(await V.adapter.read(paths[i])!==content)throw Error("Falha na verificação: "+paths[i]);
   }
   cataloguedStatus.textContent="✓ CataloguedAt V3.1.0 gravado em "+folder+". Reinicie o Obsidian e ative o plugin.";
   message("✓ CataloguedAt V3.1.0 instalado. Reinicie o Obsidian e ative em Plugins da comunidade.");
  }catch(e){
   for(const path of written.reverse()){
    try{if(Object.prototype.hasOwnProperty.call(originals,path))await V.adapter.write(path,originals[path]);else await V.adapter.remove(path);}catch(restoreError){console.error("Falha ao restaurar",path,restoreError);}
   }
   cataloguedStatus.textContent="Falha: "+(e?.message||e)+". Backups existentes foram preservados.";
   console.error("CataloguedAt: falha de instalação",e);
   message("Falha ao instalar CataloguedAt: "+(e?.message||e));
   return;
  }
  renderPlugins();await diagnosis();
 }catch(e){
  cataloguedStatus.textContent="Erro: "+(e?.message||e);
  console.error("CataloguedAt:",e);
  message("Erro no instalador CataloguedAt: "+(e?.message||e));
 }
}
btn(actions(cataloguedCard),"Instalar CataloguedAt V3.1",()=>cataloguedInstall(false),true);
btn(actions(cataloguedCard),"Atualizar CataloguedAt para V3.1",()=>cataloguedInstall(true));
btn(actions(cataloguedCard),"Verificar CataloguedAt",async()=>{await cataloguedRefresh();renderPlugins();await diagnosis();});
await cataloguedRefresh();
const dc=card(pages.Plugins,"Diagnóstico");
const diag=note(dc,"Verificando...");
async function diagnosis(){
 const lines=[];
 for(const [name,id] of pluginDefs)lines.push(name+": "+(plugin(id)?"ativo":installed(id)?"desativado":"não instalado"));
 for(const path of [rootInput.value,centralInput.value]){
  const f=V.getAbstractFileByPath(path);lines.push(path+": "+(f&&Array.isArray(f.children)?"pasta encontrada":"pasta ausente"));
 }
 lines.push("Configuração: "+(V.getAbstractFileByPath(PATH)?"encontrada":"não encontrada"));
 const p=plugin("obsidian-media-db-plugin");
 if(p?.settings)lines.push("MediaDB destino: "+(p.settings.musicReleaseFolder||"não configurado"));
 diag.textContent=lines.join("\n");
}
btn(actions(dc),"Executar diagnóstico",diagnosis,true);

// NOTE TO NOTE — GERENCIADOR DE MÓDULOS V2.3.1
// Não modifica o Configuracoes.json nem as notas de álbuns.
const ntnRepo="heitormiguelviana/note-to-note";
const ntnApi="https://api.github.com/repos/"+ntnRepo+"/releases/latest";
const ntnBackupDir="Musicas/Sistema/Backups/Note to Note";
const ntnStatePath="Musicas/Sistema/NoteToNote-Instalacao.json";
// Os destinos oficiais no Obsidian são independentes dos nomes dos anexos.
const ntnAllowed={
 configuracoes:"Musicas/Sistema/Configurações.md",
 diario:"Diário Musical.md",
 central:"Central.md",
 relatorio:"Relatório.md",
 roleta:"Roleta.md",
 monitor:"Monitor.md"
};
// Compatibilidade com o manifesto v1.0.0, publicado com destinos antigos.
// Valida esses valores, mas NUNCA os usa como caminho de escrita.
const ntnLegacyDestinations=Object.fromEntries(Object.entries(ntnAllowed).map(([id,path])=>
 [id,id==="configuracoes"?path:"Musicas/Sistema/"+path]));
const ntnSources={configuracoes:"Configuracoes.md",diario:"Diario.Musical.md",central:"Central.md",relatorio:"Relatorio.md",roleta:"Roleta.md",monitor:"Monitor.md"};
const ntnPage=pages["Note to Note"];
const ntnIntro=card(ntnPage,"Instalação e atualizações");
E("div",ntnIntro,"Gerencie os seis módulos pela última release estável do GitHub. Os nomes das notas no Obsidian são preservados. Nenhuma atualização é automática.","mc-muted");
const ntnActions=actions(ntnIntro);
const ntnStatus=note(ntnIntro,"Clique em Verificar atualizações para consultar o GitHub.");
const ntnList=E("div",ntnPage);
const ntnFooter=card(ntnPage,"Segurança e backups");
note(ntnFooter,"Antes de substituir uma nota, é criado e validado um backup em "+ntnBackupDir+". O arquivo Configuracoes.json, as notas dos álbuns e o plugin CataloguedAt não são alterados por este gerenciador. Notas existentes com conteúdo diferente do oficial são sinalizadas como modificadas.");
let ntnRelease=null,ntnBusy=false,ntnRows=[];
function ntnSay(text,error=false){ntnStatus.textContent=text;ntnStatus.style.color=error?"var(--color-red)":"var(--text-muted)";}
function ntnHex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");}
async function ntnHash(bytes){
 const subtle=globalThis.crypto?.subtle;
 if(subtle)return ntnHex(new Uint8Array(await subtle.digest("SHA-256",bytes)));
 if(typeof require==="function" && !require("obsidian").Platform.isMobile)return require("crypto").createHash("sha256").update(Buffer.from(bytes)).digest("hex");
 throw Error("SHA-256 indisponível neste dispositivo. Instalação cancelada.");
}
function ntnBytes(response){return response.arrayBuffer?new Uint8Array(response.arrayBuffer):new TextEncoder().encode(response.text);}
async function ntnGet(url,accept="application/vnd.github+json"){
 const http=typeof requestUrl==="function"?requestUrl:(typeof require==="function"?require("obsidian").requestUrl:null);
 if(!http)throw Error("requestUrl indisponível no Obsidian.");
 const r=await http({url,method:"GET",throw:false,headers:{Accept:accept}});
 if(r.status<200||r.status>=300)throw Error("HTTP "+r.status+" em "+url);
 return r;
}
function ntnAsset(release,name){return release.assets?.find(x=>x.name===name&&x.state==="uploaded"&&typeof x.browser_download_url==="string");}
function ntnValidHash(s){return typeof s==="string"&&/^[0-9a-f]{64}$/i.test(s);}
async function ntnRemote(){
 const response=await ntnGet(ntnApi);
 const release=JSON.parse(response.text);
 if(release.draft||release.prerelease||!/^v\d+\.\d+\.\d+$/.test(release.tag_name))throw Error("Nenhuma release estável válida encontrada.");
 const manifestAsset=ntnAsset(release,"manifest.json");
 if(!manifestAsset||manifestAsset.size>100000)throw Error("Manifesto ausente ou excessivamente grande.");
 const mres=await ntnGet(manifestAsset.browser_download_url,"application/octet-stream");
 const mbytes=ntnBytes(mres);
 if(mbytes.byteLength>100000)throw Error("Manifesto excede o limite de tamanho.");
 const manifest=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(mbytes));
 if(manifest.schemaVersion!==1||manifest.project!=="Note to Note"||manifest.release!==release.tag_name.slice(1)||!Array.isArray(manifest.components))throw Error("Manifesto incompatível com a release.");
 const ids=new Set();
 const modules=[];
 for(const c of manifest.components){
  if(!Object.prototype.hasOwnProperty.call(ntnAllowed,c.id)||ids.has(c.id))throw Error("Módulo desconhecido ou duplicado no manifesto.");
  ids.add(c.id);
  if(![ntnAllowed[c.id],ntnLegacyDestinations[c.id]].includes(c.destination)||c.source!==ntnSources[c.id]||!ntnValidHash(c.sha256)||
     !Number.isSafeInteger(c.sizeBytes)||c.sizeBytes<1||c.sizeBytes>250000||
     typeof c.version!=="string"||!/^[0-9]+(?:\.[0-9]+){1,2}$/.test(c.version))throw Error("Dados inválidos no módulo: "+c.id);
  const asset=ntnAsset(release,c.source);
  if(!asset||asset.size!==c.sizeBytes)throw Error("Anexo ausente ou tamanho divergente: "+c.source);
  modules.push({c:{...c,destination:ntnAllowed[c.id]},asset});
 }
 if(ids.size!==Object.keys(ntnAllowed).length)throw Error("O manifesto não contém todos os seis módulos.");
 return {release,modules};
}
async function ntnState(){
 try{if(!await V.adapter.exists(ntnStatePath))return {};
  const parsed=JSON.parse(await V.adapter.read(ntnStatePath));
  return parsed?.schemaVersion===1&&parsed.modules&&typeof parsed.modules==="object"?parsed.modules:{};
 }catch(e){console.warn("Note to Note: registro de instalação inválido",e);return {};}
}
async function ntnWriteState(modules){
 await mkdir(parent(ntnStatePath));
 const obj={schemaVersion:1,modules};
 const data=JSON.stringify(obj,null,2)+"\n";
 if(await V.adapter.exists(ntnStatePath))await V.adapter.write(ntnStatePath,data);
 else await V.adapter.write(ntnStatePath,data);
}
async function ntnLocal(item,state){
 const path=item.c.destination;
 if(!await V.adapter.exists(path))return {status:"Ausente",exists:false};
 const stat=await V.adapter.stat(path);
 if(stat?.type!=="file")return {status:"Destino inválido",exists:true};
 const data=await V.adapter.readBinary(path);
 const hash=await ntnHash(new Uint8Array(data));
 if(hash.toLowerCase()===item.c.sha256.toLowerCase())return {status:"Atualizado",exists:true,hash};
 const previous=state[item.c.id];
 if(previous&&previous.sha256===hash)return {status:"Versão anterior: v"+previous.version,exists:true,hash};
 return {status:"Arquivo existente/modificado",exists:true,hash};
}
async function ntnRefresh(){
 ntnSay("Consultando a última release estável...");
 const remote=await ntnRemote();
 const state=await ntnState();
 const rows=[];
 for(const item of remote.modules)rows.push({...item,local:await ntnLocal(item,state)});
 ntnRelease={tag:remote.release.tag_name,rows};
 ntnList.replaceChildren();ntnRows=[];
 for(const row of rows){
  const panel=card(ntnList,row.c.name+" · v"+row.c.version);
  const stateLabel=E("div",panel,row.local.status,"mc-muted");
  E("div",panel,"Destino: "+row.c.destination,"mc-muted");
  const group=actions(panel);
  const b=btn(group,row.local.exists?"Atualizar / reinstalar":"Instalar",async()=>{
   await ntnInstall([row.c.id]);
  },!row.local.exists);
  if(row.local.status==="Atualizado")b.disabled=true;
  ntnRows.push({row,button:b,stateLabel});
 }
 ntnSay("Release "+remote.release.tag_name+" verificada. Selecione um módulo ou use Instalar / atualizar todos.");
}
async function ntnBackup(path){
 await mkdir(ntnBackupDir);
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 const base=path.slice(path.lastIndexOf("/")+1).replace(/\.md$/i,"").replace(/[^a-zA-Z0-9_-]/g,"_");
 let target=ntnBackupDir+"/"+base+"-"+stamp+".md",i=1;
 while(await V.adapter.exists(target))target=ntnBackupDir+"/"+base+"-"+stamp+"-"+(i++)+".md";
 const original=await V.adapter.readBinary(path);
 await V.adapter.writeBinary(target,original);
 const copy=await V.adapter.readBinary(target);
 if(await ntnHash(new Uint8Array(original))!==await ntnHash(new Uint8Array(copy)))throw Error("Não foi possível validar o backup: "+target);
 return target;
}
async function ntnInstall(ids){
 if(ntnBusy)return;
 ntnBusy=true;
 try{
  if(!ntnRelease)throw Error("Clique em Verificar atualizações antes de instalar.");
  ntnSay("Revalidando release e manifesto...");
  const fresh=await ntnRemote();
  if(fresh.release.tag_name!==ntnRelease.tag)throw Error("A release mudou. Verifique novamente antes de instalar.");
  const wanted=fresh.modules.filter(item=>ids.includes(item.c.id)).sort((a,b)=>(a.c.id==="configuracoes")-(b.c.id==="configuracoes"));
  if(wanted.length!==ids.length)throw Error("Seleção de módulos inválida.");
  const state=await ntnState();
  const pending=[];
  for(const item of wanted){
   const known=ntnRelease.rows.find(x=>x.c.id===item.c.id);
   if(!known||known.c.sha256!==item.c.sha256)throw Error("Manifesto alterado. Verifique novamente.");
   const local=await ntnLocal(item,state);
   if(local.status==="Atualizado")continue;
   pending.push({...item,local});
  }
  if(!pending.length){ntnSay("Todos os módulos selecionados já estão atualizados.");return;}
  const summary=pending.map(x=>"• "+x.c.name+" — "+(x.local.exists?"substituir com backup":"instalar")).join("\n");
  if(!window.confirm("Note to Note — confirmar alterações:\n\n"+summary+"\n\nAs configurações pessoais e os álbuns não serão alterados.")){
   ntnSay("Operação cancelada. Nenhum módulo foi modificado.");return;
  }
  // Baixa e valida todos os módulos antes de escrever qualquer um deles.
  for(const item of pending){
   ntnSay("Baixando e validando: "+item.c.name);
   const response=await ntnGet(item.asset.browser_download_url,"application/octet-stream");
   const bytes=ntnBytes(response);
   if(bytes.byteLength!==item.c.sizeBytes||await ntnHash(bytes)!==item.c.sha256.toLowerCase())throw Error("Verificação de integridade falhou: "+item.c.name);
   item.content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
   if(!item.content.trimStart().startsWith("```dataviewjs"))throw Error("Formato inesperado em "+item.c.name);
  }
  const completed=[],failures=[];
  for(const item of pending){
   try{
    const path=item.c.destination;
    const existing=V.getAbstractFileByPath(path);
    if(existing&&existing.extension!=="md")throw Error("O destino não é uma nota Markdown: "+path);
    await mkdir(parent(path));
    let backupPath="";
    if(await V.adapter.exists(path))backupPath=await ntnBackup(path);
    const f=V.getAbstractFileByPath(path);
    if(f)await V.modify(f,item.content);
    else if(await V.adapter.exists(path))await V.adapter.write(path,item.content);
    else await V.create(path,item.content);
    const actual=await V.adapter.readBinary(path);
    if(await ntnHash(new Uint8Array(actual))!==item.c.sha256.toLowerCase())throw Error("Falha na validação após gravar: "+path);
    state[item.c.id]={version:item.c.version,sha256:item.c.sha256,release:fresh.release.tag_name,path};
    await ntnWriteState(state);
    completed.push(item.c.name+(backupPath?" (backup: "+backupPath+")":""));
   }catch(e){
    failures.push(item.c.name+": "+(e?.message||e));
    break; // Evita prosseguir com os próximos módulos após falha.
   }
  }
  if(failures.length)ntnSay("Concluídos: "+completed.length+". Falha: "+failures.join("; ")+". Confira os backups antes de tentar novamente.",true);
  else ntnSay("✓ "+completed.length+" módulo(s) instalado(s)/atualizado(s). "+completed.join("; "));
  // Se o próprio configurador foi atualizado, a nota pode recarregar. Reabra-a para ver o novo gerenciador.
  if(!pending.some(x=>x.c.id==="configuracoes"))await ntnRefresh();
 }catch(e){ntnSay("Erro: "+(e?.message||e),true);console.error("Note to Note Manager",e);}
 finally{ntnBusy=false;}
}
// Migração explícita das notas que a V2.3 colocou em Musicas/Sistema/.
// Só move arquivos identificados pela assinatura oficial da release ou pelo registro local.
async function ntnRelocate(){
 if(ntnBusy)return;
 ntnBusy=true;
 try{
  ntnSay("Verificando módulos instalados no caminho antigo...");
  const remote=await ntnRemote();
  const state=await ntnState();
  const moves=[];
  const blocked=[];
  for(const item of remote.modules){
   const id=item.c.id;
   if(id==="configuracoes")continue;
   const oldPath=ntnLegacyDestinations[id];
   const newPath=ntnAllowed[id];
   if(!await V.adapter.exists(oldPath))continue;
   if(await V.adapter.exists(newPath)){
    blocked.push(item.c.name+" (destino já existe: "+newPath+")");
    continue;
   }
   const source=V.getAbstractFileByPath(oldPath);
   if(!source||source.extension!=="md"){
    blocked.push(item.c.name+" (origem inválida)");continue;
   }
   const bytes=new Uint8Array(await V.adapter.readBinary(oldPath));
   const hash=await ntnHash(bytes);
   const registered=state[id];
   const recognized=hash.toLowerCase()===item.c.sha256.toLowerCase() ||
    (registered?.path===oldPath && registered?.sha256?.toLowerCase()===hash.toLowerCase());
   if(!recognized){
    blocked.push(item.c.name+" (conteúdo diferente da versão registrada; mover manualmente)");
    continue;
   }
   moves.push({id,name:item.c.name,oldPath,newPath,source,hash});
  }
  if(!moves.length){
   ntnSay("Nenhuma nota elegível para mover."+(blocked.length?" Atenção: "+blocked.join("; "):""));
   return;
  }
  const summary=moves.map(m=>"• "+m.name+": "+m.oldPath+" → "+m.newPath).join("\n");
  if(!window.confirm("Mover os módulos para a raiz do cofre?\n\n"+summary+
    "\n\nNão serão substituídos arquivos existentes. Configurações e álbuns não serão alterados.")){
   ntnSay("Migração cancelada. Nenhuma nota foi movida.");return;
  }
  const moved=[];
  for(const m of moves){
   // Revalidação imediatamente antes de cada movimento.
   if(await V.adapter.exists(m.newPath)){
    blocked.push(m.name+" (destino passou a existir)");continue;
   }
   const current=V.getAbstractFileByPath(m.oldPath);
   if(!current||current.extension!=="md"){
    blocked.push(m.name+" (origem indisponível)");continue;
   }
   if(await ntnHash(new Uint8Array(await V.adapter.readBinary(m.oldPath)))!==m.hash){
    blocked.push(m.name+" (arquivo alterado durante a migração)");continue;
   }
   await A.fileManager.renameFile(current,m.newPath);
   if(state[m.id])state[m.id]={...state[m.id],path:m.newPath};
   await ntnWriteState(state);
   moved.push(m.name);
  }
  ntnSay("Movidos para a raiz: "+(moved.join(", ")||"nenhum")+
   (blocked.length?". Não movidos: "+blocked.join("; "):""));
  if(ntnRelease)await ntnRefresh();
 }catch(e){ntnSay("Erro na migração: "+(e?.message||e),true);console.error("Note to Note: migração",e);}
 finally{ntnBusy=false;}
}
btn(ntnActions,"Mover módulos antigos para a raiz",ntnRelocate);
btn(ntnActions,"Verificar atualizações",async()=>{
 if(ntnBusy)return;ntnBusy=true;
 try{await ntnRefresh();}catch(e){ntnRelease=null;ntnList.replaceChildren();ntnSay("Erro: "+(e?.message||e),true);}
 finally{ntnBusy=false;}
},true);
btn(ntnActions,"Instalar / atualizar todos",async()=>{
 if(!ntnRelease)throw Error("Verifique as atualizações primeiro.");
 await ntnInstall(ntnRelease.rows.filter(x=>x.local.status!=="Atualizado").map(x=>x.c.id));
});


// MIGRADORES DE NOTAS LEGADAS — INDEPENDENTES DO ATUALIZADOR.
const migStateKey="ntn-config-migracao:"+V.getName();
const migStore=globalThis[migStateKey]??={
 datas:{skipped:new Set(),drafts:new Map(),current:null,completed:0},
 scrobbles:{skipped:new Set(),drafts:new Map(),current:null,completed:0}
};
const migLock={datas:false,scrobbles:false};
const migBackupBase="Musicas/Sistema/Backups/Note to Note/Migracoes";
function migFront(text){return /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1]??null;}
function migHas(text,key){
 const fm=migFront(text);
 return fm!==null&&new RegExp("^\\s*"+key+"\\s*:","mi").test(fm);
}
function migAlbum(text){
 const fm=migFront(text);
 return fm!==null&&/^\s*type\s*:\s*["']?musicRelease["']?\s*(?:#.*)?$/mi.test(fm);
}
function migDate(ms){
 const d=new Date(ms),p=x=>String(x).padStart(2,"0");
 return Number.isFinite(d.getTime())?`${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`:"";
}
function migValidDate(v){
 const m=/^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
 if(!m)return false;
 const [day,month,year]=m.slice(1).map(Number),d=new Date(year,month-1,day);
 return year>=1970&&d.getFullYear()===year&&d.getMonth()===month-1&&d.getDate()===day;
}
function migLabel(v){
 if(Array.isArray(v))return v.join(", ");
 if(v&&typeof v==="object")return Object.values(v).join(", ");
 return v==null?"":String(v);
}
function migCover(v){
 const val=migLabel(v).trim();
 if(/^https?:\/\//i.test(val))return val;
 const path=val.replace(/^!?\[\[/,"").replace(/\]\]$/,"");
 const f=V.getAbstractFileByPath(path);
 return f&&f.extension?V.getResourcePath(f):null;
}
async function migScan(mode){
 const field=mode==="datas"?"cataloguedAt":"scrobbles";
 const files=V.getMarkdownFiles().filter(f=>
  f.path.startsWith("Musicas/")&&
  !f.path.startsWith("Musicas/Central/")&&
  !f.path.startsWith("Musicas/Sistema/")
 ).sort((a,b)=>a.path.localeCompare(b.path,"pt-BR"));
 const found=[];
 for(const f of files){
  const raw=await V.read(f);
  if(!migAlbum(raw)||migHas(raw,field))continue;
  const fm=A.metadataCache.getFileCache(f)?.frontmatter??{};
  found.push({path:f.path,title:migLabel(fm.title)||f.basename,
   artist:migLabel(fm.artists)||"Artista desconhecido",
   year:migLabel(fm.year),image:migCover(fm.image),
   mtime:f.stat.mtime});
 }
 return found;
}
async function migBackup(file,original,mode){
 const dir=migBackupBase+"/"+(mode==="datas"?"Datas":"Scrobbles");
 await mkdir(dir);
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");
 const safe=file.path.replace(/[^a-zA-Z0-9._-]/g,"_");
 let path=dir+"/"+stamp+"-"+safe,n=1;
 while(await V.adapter.exists(path))path=dir+"/"+stamp+"-"+(n++)+"-"+safe;
 await V.adapter.write(path,original);
 if(await V.adapter.read(path)!==original)throw Error("Backup não validado: "+path);
 return path;
}
function migSetup(mode,page){
 const fieldName=mode==="datas"?"cataloguedAt":"scrobbles";
 const st=migStore[mode];
 const head=card(page,mode==="datas"?"Migração de cataloguedAt":"Migração de scrobbles");
 E("div",head,mode==="datas"
  ?"Recupere datas antigas usando o mtime como sugestão. Revise cada data antes de confirmar."
  :"Preencha o número de audições de álbuns antigos, um de cada vez.","mc-muted");
 note(head,"Somente notas musicRelease sem "+fieldName+" serão alteradas. Cada confirmação cria e verifica um backup antes de gravar.");
 const progress=note(head,"Clique em Verificar notas para começar.");
 const controls=actions(head);
 const work=E("div",page);
 let serial=0;
 async function draw(){
  const my=++serial;
  work.replaceChildren();
  progress.textContent="Verificando notas...";
  let all;
  try{all=await migScan(mode);}
  catch(e){if(my===serial)progress.textContent="Erro: "+(e?.message||e);return;}
  if(my!==serial)return;
  const paths=new Set(all.map(x=>x.path));
  for(const path of [...st.skipped])if(!paths.has(path))st.skipped.delete(path);
  const available=all.filter(x=>!st.skipped.has(x.path));
  if(!available.some(x=>x.path===st.current))st.current=available[0]?.path??null;
  progress.textContent=`${all.length} pendentes · ${st.skipped.size} pulados · ${st.completed} confirmados nesta sessão`;
  if(!st.current){
   note(work,all.length?"Todos os álbuns restantes foram pulados. Use Recuperar pulados.":"Nenhum álbum precisa desta migração.");
   return;
  }
  const item=available.find(x=>x.path===st.current);
  if(!item)return;
  const cardEl=card(work,item.title);
  const row=E("div",cardEl,null,"mc-row");
  if(item.image){
   const img=E("img",row);img.src=item.image;img.alt="";
   img.style.cssText="width:90px;height:90px;object-fit:cover;border-radius:8px;flex-shrink:0";
  }
  const details=E("div",row);
  E("div",details,item.artist,"mc-muted");
  if(item.year)E("div",details,item.year,"mc-muted");
  const initial=mode==="datas"?migDate(item.mtime):"1";
  if(!st.drafts.has(item.path))st.drafts.set(item.path,initial);
  const inp=field(cardEl,mode==="datas"?"Data (DD-MM-AAAA)":"Quantidade de audições",st.drafts.get(item.path));
  if(mode==="scrobbles"){inp.type="number";inp.min="0";inp.step="1";}
  inp.addEventListener("input",()=>st.drafts.set(item.path,inp.value));
  if(mode==="datas")E("div",cardEl,"mtime sugerido: "+migDate(item.mtime)+". Se a nota foi editada depois da catalogação, corrija manualmente.","mc-muted");
  E("div",cardEl,item.path,"mc-muted");
  const status=note(cardEl,"");
  const buttons=actions(cardEl);
  const confirm=btn(buttons,"Confirmar",async()=>{
   if(migLock[mode])return;
   const value=inp.value.trim();
   const valid=mode==="datas"?migValidDate(value):
    value!==""&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value));
   if(!valid){status.textContent=mode==="datas"?"Data inválida. Use DD-MM-AAAA.":"Digite um inteiro igual ou maior que zero.";return;}
   migLock[mode]=true;
   status.textContent="Criando backup e salvando...";
   try{
    const file=V.getAbstractFileByPath(item.path);
    if(!file||file.extension!=="md")throw Error("Arquivo não encontrado.");
    const original=await V.read(file);
    if(!migAlbum(original)||migHas(original,fieldName))throw Error("Nota não elegível ou campo já existente.");
    await migBackup(file,original,mode);
    await A.fileManager.processFrontMatter(file,fm=>{
     if(Object.prototype.hasOwnProperty.call(fm,fieldName))throw Error("Campo já existe.");
     fm[fieldName]=mode==="datas"?value:Number(value);
    });
    st.completed++;st.current=null;st.drafts.delete(item.path);
    status.textContent="Salvo com sucesso.";
   }catch(e){status.textContent="Erro: "+(e?.message||e);return;}
   finally{migLock[mode]=false;}
   await draw();
  },true);
  const skip=btn(buttons,"Pular",async()=>{
   if(migLock[mode])return;
   st.skipped.add(item.path);st.current=null;await draw();
  });
  inp.addEventListener("keydown",e=>{
   // Enter não confirma: evita submissões acidentais durante reexecuções.
   if(e.key==="Enter")e.preventDefault();
  });
 }
 btn(controls,"Verificar notas",draw,true);
 btn(controls,"Recuperar pulados",async()=>{
  if(migLock[mode])return;
  st.skipped.clear();st.current=null;await draw();
 });
 btn(controls,"Atualizar fila",async()=>{if(!migLock[mode])await draw();});
 // Não varre o cofre quando a aba está oculta; preserva a seleção na reexecução.
 if(mcUi.tab===(mode==="datas"?"Migrar Datas":"Migrar Scrobbles"))void draw();
 const oldTab=tabButtons[mode==="datas"?"Migrar Datas":"Migrar Scrobbles"];
 oldTab.addEventListener("click",()=>{if(!work.childElementCount)void draw();});
}
migSetup("datas",pages["Migrar Datas"]);
migSetup("scrobbles",pages["Migrar Scrobbles"]);

tab(mcUi.tab);refreshSpotify();renderPlugins();await diagnosis();

```
