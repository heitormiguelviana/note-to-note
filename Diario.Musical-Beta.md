```dataviewjs
// NOTE TO NOTE — BETA VISUAL 1 (base oficial preservada)
// ============================================================
// 🎧 DIÁRIO MUSICAL
//============================================================
//
// • Mantém integração com Media DB
// • Lista os álbuns catalogados
// • Pesquisa por álbum / artista / ano
// • Ordenação por diversos critérios
// • Estatísticas da biblioteca
// • Visual alinhado à Central de Descoberta Musical
// • Registro manual de álbuns sem MusicBrainz
// • Filtro por quantidade de scrobbles (propriedade "scrobbles")
// ============================================================

// ============================================================
// INTEGRAÇÃO COM A CENTRAL DE CONFIGURAÇÕES MUSICAL
// ============================================================
// Usa a pasta definida em Musicas/Sistema/Configuracoes.json.
// Se o arquivo não existir, mantém a pasta original "Musicas".
// Não modifica o Monitor nem as notas de álbuns existentes.

const musicalConfigPath = "Musicas/Sistema/Configuracoes.json";
let musicalMusicRoot = "Musicas";
try {
  const musicalConfigFile = dv.app.vault.getAbstractFileByPath(musicalConfigPath);
  if (musicalConfigFile && !Array.isArray(musicalConfigFile.children)) {
    const musicalConfig = JSON.parse(await dv.app.vault.read(musicalConfigFile));
    const configuredRoot = musicalConfig?.paths?.musicRoot;
    if (typeof configuredRoot === "string") {
      const cleanRoot = configuredRoot.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
      if (
        cleanRoot &&
        !cleanRoot.startsWith("/") &&
        !/^[A-Za-z]:/.test(cleanRoot) &&
        !cleanRoot.split("/").some(part => !part || part === "." || part === "..")
      ) {
        musicalMusicRoot = cleanRoot;
      }
    }
  }
} catch (error) {
  console.warn("Diário Musical: não foi possível ler a configuração; usando Musicas.", error);
}

// ============================================================
// 1. DATA DE CATALOGAÇÃO
// ============================================================
//
// O campo cataloguedAt é salvo nas notas como:
//
// cataloguedAt: "DD-MM-YYYY"
//
// Exemplo:
// cataloguedAt: "26-09-2026"
//
// Esta função converte o valor para:
// • text → usado para exibição
// • timestamp → usado para ordenação
// ============================================================

function getCataloguedDate(value) {

  if (value === undefined || value === null) {
    return { text: "", timestamp: 0 };
  }

  let raw = String(value).trim();

  // --------------------------------------------------------
  // FORMATO ESPERADO: DD-MM-YYYY
  // --------------------------------------------------------

  let match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!match) {
    return { text: "", timestamp: 0 };
  }

  let day = Number(match[1]);
  let month = Number(match[2]);
  let year = Number(match[3]);

  let date = new Date(year, month - 1, day);

  // --------------------------------------------------------
  // VALIDAR DATA
  // --------------------------------------------------------

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return { text: "", timestamp: 0 };
  }

  return {
    text:
      `${String(day).padStart(2, "0")}/` +
      `${String(month).padStart(2, "0")}/` +
      `${year}`,
    timestamp: date.getTime()
  };

}

// ============================================================
// 2. BUSCAR ÁLBUNS
// ============================================================

let albuns = dv.pages()
  .where(p =>
    (p.file.path.startsWith(musicalMusicRoot + "/")) &&
    (
      p.type === "musicRelease" ||
      (
        p.tags &&
        p.tags.includes("mediaDB/music/Album")
      )
    ) &&
    !p.file.name
      .toLowerCase()
      .includes("template")
  )
  .sort(
    p => getCataloguedDate(p.cataloguedAt).timestamp,
    "desc"
  );

// ============================================================
// 3. ESTATÍSTICAS
// ============================================================

let totalAlbuns = albuns.length;

let albunsComNota = albuns.where(
  p =>
    p.personalRating !== undefined &&
    p.personalRating !== null &&
    typeof p.personalRating === "number"
);

let mediaNotas = "0";

if (albunsComNota.length > 0) {

  let soma = 0;

  for (let album of albunsComNota) {
    soma += album.personalRating;
  }

  mediaNotas = (soma / albunsComNota.length).toFixed(1);

}

// ============================================================
// 4. NORMALIZAR ARTISTAS
// ============================================================

function getArtistName(artists) {

  if (artists == null) {
    return "Desconhecido";
  }

  // --------------------------------------------------------
  // Lista de artistas
  // --------------------------------------------------------

  if (Array.isArray(artists)) {

    const names = artists
      .map(artist => getArtistName(artist))
      .filter(name => name && name !== "Desconhecido");

    return names.length > 0
      ? names.join(", ")
      : "Desconhecido";
  }

  // --------------------------------------------------------
  // String
  // --------------------------------------------------------

  if (typeof artists === "string") {

    const name = artists.trim();

    if (!name || name === "[object Object]") {
      return "Desconhecido";
    }

    return name;
  }

  // --------------------------------------------------------
  // Objeto / link Dataview
  // --------------------------------------------------------

  if (typeof artists === "object") {

    if (
      typeof artists.display === "string" &&
      artists.display.trim()
    ) {

      const name = artists.display.trim();

      if (name !== "[object Object]") {
        return name;
      }

    }

    if (
      typeof artists.path === "string" &&
      artists.path.trim()
    ) {

      let name = artists.path.trim();

      name = name.replace(/\.md$/i, "");
      name = name.split("/").pop();

      if (name && name !== "[object Object]") {
        return name;
      }

    }

  }

  return "Desconhecido";
}

// ============================================================
// 5. CSS
// ============================================================

let css = `

/* NOTE TO NOTE — IDENTIDADE VISUAL DA CENTRAL V1.7 */
.music-diary {
  --nt-bg:#191d23; --nt-surface:#22272e; --nt-surface-2:#292f38;
  --nt-line:#383f48; --nt-ink:#e9edf0; --nt-muted:#a0aab5;
  --nt-accent:#8ca9c7; --nt-accent-bg:#2a3949;
  display:flex; flex-direction:column; gap:18px; width:100%; max-width:990px;
  min-width:0; margin:0 auto; padding:24px 26px 34px;
  background:var(--nt-bg); color:var(--nt-ink);
  border:1px solid var(--nt-line); border-radius:10px;
  font-family:var(--font-interface),system-ui,sans-serif;
  font-size:14px; line-height:1.5;
}
.music-diary,.music-diary * {box-sizing:border-box}
.music-diary > * {min-width:0;max-width:100%}
.music-diary button,.music-diary input,.music-diary select {font:inherit}
.music-diary button {box-shadow:none!important;height:auto}
.music-diary button:focus-visible,.music-diary input:focus-visible,.music-diary select:focus-visible {outline:2px solid var(--nt-accent);outline-offset:2px}
.music-diary-hero {padding:8px 2px 14px;border-bottom:1px solid var(--nt-line);display:block}
.music-diary-eyebrow {font-size:10px;letter-spacing:.19em;font-weight:750;color:var(--nt-accent);text-transform:uppercase}
.music-diary-heading {font-size:clamp(25px,4vw,35px);font-weight:750;letter-spacing:-.045em;line-height:1.16;margin:9px 0 7px;color:var(--nt-ink)}
.music-diary-description {font-size:12px;color:var(--nt-muted);line-height:1.65;max-width:670px}
.music-diary-add-container {display:flex;gap:8px;flex-wrap:wrap;padding-bottom:13px;border-bottom:1px solid var(--nt-line)}
.music-diary button.music-diary-add-button,.music-diary button.music-diary-manual-confirm {
  border-radius:5px!important;padding:8px 13px!important;min-height:35px;
  line-height:1.3;font-size:12px!important;font-weight:650;cursor:pointer;
  white-space:normal;max-width:100%;background:var(--nt-accent)!important;
  color:#101b25!important;border:1px solid var(--nt-accent)!important;
}
.music-diary button.music-diary-add-button:hover,.music-diary button.music-diary-manual-confirm:hover {filter:brightness(1.08)}
.music-diary button.music-diary-add-button:nth-child(2),.music-diary button.music-diary-manual-cancel {
  background:transparent!important;color:var(--nt-muted)!important;
  border:1px solid var(--nt-line)!important;border-radius:5px!important;
  padding:8px 13px!important;min-height:35px;font-size:12px!important;font-weight:650;
}
.music-diary button.music-diary-add-button:nth-child(2):hover,.music-diary button.music-diary-manual-cancel:hover {color:var(--nt-ink)!important;border-color:#70859a!important}
.music-diary-manual-form {display:none;padding:20px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);gap:10px}
.music-diary-manual-form.active {display:flex;flex-direction:column}
.music-diary-manual-input,.music-diary-search,.music-diary-sort,.music-diary-filter-op,.music-diary-filter-value {
  width:100%;min-width:0;min-height:40px;background:var(--nt-bg)!important;color:var(--nt-ink)!important;
  border:1px solid var(--nt-line)!important;border-radius:5px!important;padding:9px 12px!important;
  font-size:12px!important;box-shadow:none!important;
}
.music-diary input::placeholder {color:#808c98}
.music-diary-manual-actions {display:flex;gap:8px;flex-wrap:wrap}
.music-diary-stats {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.music-diary-stat {padding:20px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);min-width:0}
.music-diary-stat-value {font-size:25px;font-weight:750;letter-spacing:-.04em;line-height:1.2;color:var(--nt-ink)}
.music-diary-stat-label {margin-top:8px;font-size:11px;color:var(--nt-muted)}
.music-diary-controls {display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.music-diary-search {flex:1 1 210px;width:auto}
.music-diary-sort {flex:0 1 190px;width:190px!important;appearance:auto!important;cursor:pointer}
.music-diary-filter {display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:14px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface)}
.music-diary-filter-label {font-size:11px;color:var(--nt-muted);font-weight:650}
.music-diary-filter-op {width:190px!important;flex:0 1 190px;appearance:auto!important}
.music-diary-filter-value {width:95px!important;flex:0 0 95px}
.music-diary-filter-hint {width:100%;font-size:11px;line-height:1.6;color:var(--nt-muted)}
.music-diary-list {display:flex;flex-direction:column;gap:9px}
.music-diary-item {display:flex;align-items:flex-start;gap:16px;padding:15px;border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-surface);min-width:0;overflow:hidden;transition:border-color .16s}
.music-diary-item:hover {border-color:#586676}
.music-diary-cover {width:88px;height:88px;flex:0 0 88px;border-radius:4px;overflow:hidden;background:var(--nt-surface-2)}
.music-diary-cover img {display:block;width:100%;height:100%;object-fit:cover}
.music-diary-info {min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center}
.music-diary-title {font-size:16px;font-weight:750;letter-spacing:-.025em;color:var(--nt-ink)!important;line-height:1.25;overflow-wrap:anywhere;text-decoration:none!important}
.music-diary-title:hover {color:var(--nt-accent)!important}
.music-diary-artist {font-size:12px;color:var(--nt-accent);margin-top:5px;overflow-wrap:anywhere}
.music-diary-meta {display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.music-diary-badge {font-size:10px;color:var(--nt-muted);border:1px solid var(--nt-line);padding:2px 7px;border-radius:3px;background:var(--nt-bg)}
.music-diary-rating {color:var(--nt-accent);font-weight:750}
.music-diary-empty {padding:28px 18px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);color:var(--nt-muted);font-size:12px;text-align:center}
@media(max-width:600px) {
  .music-diary {padding:18px 14px 26px;gap:14px}
  .music-diary-add-container {flex-direction:column;align-items:stretch}
  .music-diary button.music-diary-add-button {width:100%;max-width:none}
  .music-diary-stats {gap:8px}
  .music-diary-stat {padding:14px}
  .music-diary-stat-value {font-size:21px}
  .music-diary-controls {flex-direction:column;align-items:stretch}
  .music-diary-search,.music-diary-sort {width:100%!important;flex:1 1 auto}
  .music-diary-filter-op {flex:1 1 140px;width:auto!important}
  .music-diary-item {gap:11px;padding:11px}
  .music-diary-cover {width:68px;height:68px;flex-basis:68px}
  .music-diary-title {font-size:14px}
}

/* V1.3.1 — Corrige dimensões herdadas dos controles antigos */
.music-diary .music-diary-filter-panel .music-diary-search,
.music-diary .music-diary-filter-panel .music-diary-sort {
  flex:0 0 auto!important;
  width:100%!important;
  height:38px!important;
  min-height:38px!important;
  max-height:38px!important;
  box-sizing:border-box!important;
  align-self:stretch;
  margin:0!important;
}
.music-diary .music-diary-filter-panel .music-diary-field {align-self:start;min-height:0}
.music-diary .music-diary-filter-panel .music-diary-controls-grid {align-items:start}
/* V1.3 — Filtros compactos no padrão da Roleta */
.music-diary-filter-panel {display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);min-width:0}
.music-diary-filter-heading {display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px}
.music-diary button.music-diary-reset {background:transparent!important;color:var(--nt-accent)!important;border:1px solid var(--nt-line)!important;border-radius:5px!important;padding:5px 9px!important;font-size:11px!important;cursor:pointer}
.music-diary-controls-grid {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
.music-diary-field {display:flex;flex-direction:column;gap:5px;min-width:0}
.music-diary-field label {font-size:11px;color:var(--nt-muted);font-weight:600}
.music-diary-filter-panel input:not([type="checkbox"]),.music-diary-filter-panel select {width:100%!important;min-width:0!important;max-width:100%;height:38px!important;min-height:38px;background:var(--nt-bg)!important;color:var(--nt-ink)!important;border:1px solid var(--nt-line)!important;border-radius:5px!important;padding:7px 10px!important;font-size:12px!important}
.music-diary-filter-panel input[type="checkbox"] {accent-color:var(--nt-accent)}
.music-diary-acervo {border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-bg);min-width:0}
.music-diary-acervo > summary {list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;padding:11px 12px;font-size:12px;font-weight:650}
.music-diary-acervo > summary::-webkit-details-marker {display:none}
.music-diary-acervo > summary:before {content:"▸";color:var(--nt-accent);margin-right:4px}
.music-diary-acervo[open] > summary:before {content:"▾"}
.music-diary-filter-status,.music-diary-group-status {font-size:10px;font-weight:500;color:var(--nt-accent);text-align:right}
.music-diary-acervo-content {border-top:1px solid var(--nt-line);padding:12px;display:flex;flex-direction:column;gap:13px}
.music-diary-acervo-group + .music-diary-acervo-group {border-top:1px solid var(--nt-line);padding-top:13px}
.music-diary-group-header {display:flex;justify-content:space-between;align-items:center;gap:8px}
.music-diary-filter-toggle {display:flex;align-items:center;gap:8px;font-size:11px;font-weight:650;cursor:pointer}
.music-diary-group-body {margin-top:9px;display:flex;flex-direction:column;gap:8px}
.music-diary-group-body.is-off {opacity:.45;pointer-events:none}
.music-diary-range-row {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.music-diary-time-row {display:grid;grid-template-columns:minmax(0,1.4fr) minmax(65px,.5fr) minmax(0,1.15fr);gap:7px}
.music-diary-filter-hint {font-size:11px;color:var(--nt-muted);line-height:1.5}
.music-diary-results-hint {text-align:right}
@media(max-width:600px) {
  .music-diary-controls-grid {grid-template-columns:minmax(0,1fr)}
  .music-diary-time-row {grid-template-columns:minmax(0,1fr) 75px}
  .music-diary-time-row select:last-child {grid-column:1/-1}
  .music-diary-group-header {align-items:flex-start}
}


/* NTN VISUAL BETA — START */
.music-diary.ntn-visual-beta {
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
.music-diary.ntn-visual-beta, .music-diary.ntn-visual-beta * {box-sizing:border-box;}
.music-diary.ntn-visual-beta > * {min-width:0;}
.music-diary.ntn-visual-beta button {min-height:var(--ntn-ui-control)!important; max-width:100%; height:auto; white-space:normal!important; overflow-wrap:anywhere;
 font-family:inherit; font-size:12px!important; font-weight:600; line-height:1.35; padding:8px 12px!important;
 border-radius:6px!important; border:1px solid var(--ntn-ui-border)!important;
 background:var(--ntn-ui-surface)!important; color:var(--ntn-ui-text)!important; box-shadow:none!important;
 touch-action:manipulation;}
.music-diary.ntn-visual-beta button:hover:not(:disabled) {border-color:var(--ntn-ui-accent)!important;}
.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-add-button:first-child,.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-manual-confirm, .music-diary.ntn-visual-beta button.active, .music-diary.ntn-visual-beta button.is-active {background:var(--ntn-ui-selected)!important; border-color:var(--ntn-ui-accent)!important; color:var(--ntn-ui-text)!important;}
.music-diary.ntn-visual-beta button:disabled {opacity:.5; cursor:default;}
.music-diary.ntn-visual-beta :is(button,input,select,textarea,a,summary):focus-visible {outline:2px solid var(--ntn-ui-accent); outline-offset:3px;}
.music-diary.ntn-visual-beta :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea) {
 min-height:var(--ntn-ui-control); min-width:0; max-width:100%; padding:8px 10px; border-radius:6px!important;
 background:var(--ntn-ui-bg)!important; color:var(--ntn-ui-text)!important; border:1px solid var(--ntn-ui-border)!important; font-family:inherit; font-size:12px;}
.music-diary.ntn-visual-beta :is(input[type=checkbox],input[type=radio],input[type=range]) {accent-color:var(--ntn-ui-accent);}
.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-stat,.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-item,.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-filter {border-radius:var(--ntn-ui-radius)!important; border-color:var(--ntn-ui-border)!important;}
.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-heading {font-size:clamp(25px,3.5vw,34px); line-height:1.18; letter-spacing:-.035em; font-weight:750; overflow-wrap:anywhere;}
.music-diary.ntn-visual-beta :is(h2,h3) {line-height:1.3; overflow-wrap:anywhere;}
.music-diary.ntn-visual-beta :is(summary,label) {overflow-wrap:anywhere;}
.music-diary.ntn-visual-beta summary {min-height:32px; cursor:pointer;}
.music-diary.ntn-visual-beta :is(table,pre) {max-width:100%;}
.music-diary.ntn-visual-beta pre {white-space:pre-wrap; overflow-wrap:anywhere;}
.music-diary.ntn-visual-beta :is(.stat-value,.mm-stat-value,.music-diary.ntn-visual-beta-stat-value) {font-variant-numeric:tabular-nums;}
@media (max-width:650px) {
 .music-diary.ntn-visual-beta {padding:16px 12px 24px!important;}
 .music-diary.ntn-visual-beta button {min-height:44px!important;}
 .music-diary.ntn-visual-beta :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select) {min-height:42px;}
}
@media (prefers-reduced-motion:reduce) {
 .music-diary.ntn-visual-beta *, .music-diary.ntn-visual-beta *::before, .music-diary.ntn-visual-beta *::after {animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important;}
}
.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-controls {gap:8px}.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-list {gap:12px}.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-info {min-width:0}.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-title {line-height:1.3}.music-diary.ntn-visual-beta .music-diary.ntn-visual-beta-filter-hint {line-height:1.65}
@media(max-width:650px) { .music-diary.ntn-visual-beta :is(.mc-grid,.mm-diagnostics) {grid-template-columns:repeat(2,minmax(0,1fr));} .music-diary.ntn-visual-beta .mc-shell {padding:16px 12px;} }
@media(max-width:420px) { .music-diary.ntn-visual-beta :is(.mc-grid,.mm-diagnostics) {grid-template-columns:1fr;} }
/* NTN VISUAL BETA — END */
`;

// ============================================================
// 6. CONTAINER PRINCIPAL
// ============================================================

let mainContainer = dv.container.createEl(
  "div",
  { cls: "music-diary ntn-visual-beta" }
);

mainContainer.innerHTML = `<style>${css}</style>`;

mainContainer.createDiv({ cls: "music-diary-hero" }).innerHTML = `
  <div>
    <div class="music-diary-eyebrow">NOTE TO NOTE / BIBLIOTECA</div>
    <h2 class="music-diary-heading">Diário Musical</h2>
    <div class="music-diary-description">Seu acervo de álbuns, avaliações e registros em um só lugar.</div>
  </div>

`;

// ============================================================
// 7. BOTÕES
// ============================================================

let btnContainer = mainContainer.createEl(
  "div",
  { cls: "music-diary-add-container" }
);

// ------------------------------------------------------------
// REGISTRAR NOVO ÁLBUM — MEDIADB
// ------------------------------------------------------------

let addBtn = btnContainer.createEl(
  "button",
  {
    cls: "music-diary-add-button",
    text: "➕ Registrar Novo Álbum"
  }
);

addBtn.addEventListener(
  "click",
  () => {

    let allCommands = Object.values(app.commands.commands);

    let mediaDbCmd = allCommands.find(
      c =>
        c.id.includes("media-db") &&
        (
          c.id.includes("music") ||
          (
            c.name &&
            c.name
              .toLowerCase()
              .includes("music release")
          )
        )
    );

    if (mediaDbCmd) {

      app.commands.executeCommandById(mediaDbCmd.id);

    } else {

      app.commands.executeCommandById(
        "media-db:create-media-db-entry-music-release"
      );

    }

  }
);

// ------------------------------------------------------------
// REGISTRAR ÁLBUM MANUALMENTE
// ------------------------------------------------------------

let manualBtn = btnContainer.createEl(
  "button",
  {
    cls: "music-diary-add-button",
    text: "✍️ Registrar Álbum Manualmente"
  }
);

// ============================================================
// 8. FORMULÁRIO MANUAL
// ============================================================

let manualForm = mainContainer.createEl(
  "div",
  { cls: "music-diary-manual-form" }
);

// ------------------------------------------------------------
// NOME DO ÁLBUM
// ------------------------------------------------------------

let manualTitle = manualForm.createEl(
  "input",
  {
    cls: "music-diary-manual-input",
    attr: {
      type: "text",
      placeholder: "Nome do álbum"
    }
  }
);

// ------------------------------------------------------------
// ARTISTA
// ------------------------------------------------------------

let manualArtist = manualForm.createEl(
  "input",
  {
    cls: "music-diary-manual-input",
    attr: {
      type: "text",
      placeholder: "Artista"
    }
  }
);

// ------------------------------------------------------------
// ANO
// ------------------------------------------------------------

let manualYear = manualForm.createEl(
  "input",
  {
    cls: "music-diary-manual-input",
    attr: {
      type: "number",
      placeholder: "Ano (opcional)",
      min: "0",
      max: "9999"
    }
  }
);

// ------------------------------------------------------------
// CAPA
// ------------------------------------------------------------

let manualImage = manualForm.createEl(
  "input",
  {
    cls: "music-diary-manual-input",
    attr: {
      type: "url",
      placeholder: "URL da capa (opcional)"
    }
  }
);

// ------------------------------------------------------------
// AÇÕES
// ------------------------------------------------------------

let manualActions = manualForm.createEl(
  "div",
  { cls: "music-diary-manual-actions" }
);

let manualConfirm = manualActions.createEl(
  "button",
  {
    cls: "music-diary-manual-confirm",
    text: "✓ Registrar Álbum"
  }
);

let manualCancel = manualActions.createEl(
  "button",
  {
    cls: "music-diary-manual-cancel",
    text: "Cancelar"
  }
);

// ============================================================
// 9. ABRIR FORMULÁRIO
// ============================================================

manualBtn.addEventListener(
  "click",
  () => {

    manualForm.classList.toggle("active");

    if (manualForm.classList.contains("active")) {
      manualTitle.focus();
    }

  }
);

// ============================================================
// 10. CANCELAR REGISTRO MANUAL
// ============================================================

manualCancel.addEventListener(
  "click",
  () => {

    manualForm.classList.remove("active");

    manualTitle.value = "";
    manualArtist.value = "";
    manualYear.value = "";
    manualImage.value = "";

  }
);

// ============================================================
// 11. ESCAPAR TEXTO PARA YAML
// ============================================================

function yamlQuote(value) {

  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim()}"`;

}

// ============================================================
// 12. NORMALIZAR NOME DE ARQUIVO
// ============================================================

function sanitizeFileName(name) {

  return String(name)
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

}

// ============================================================
// 13. REGISTRAR MANUALMENTE
// ============================================================

manualConfirm.addEventListener(
  "click",
  async () => {

    let title = manualTitle.value.trim();
    let artist = manualArtist.value.trim();
    let year = manualYear.value.trim();
    let image = manualImage.value.trim();

    // ----------------------------------------------------
    // VALIDAÇÃO
    // ----------------------------------------------------

    if (!title) {

      new Notice("Digite o nome do álbum.");

      manualTitle.focus();

      return;

    }

    if (!artist) {

      new Notice("Digite o artista.");

      manualArtist.focus();

      return;

    }

    // ----------------------------------------------------
    // NOME DO ARQUIVO
    //
    // SOMENTE O NOME DO ÁLBUM
    // ----------------------------------------------------

    let safeTitle = sanitizeFileName(title);

    let filePath = `${musicalMusicRoot}/${safeTitle}.md`;

    // ----------------------------------------------------
    // VERIFICAR DUPLICATA
    // ----------------------------------------------------

    let existing = app.vault.getAbstractFileByPath(filePath);

    if (existing) {

      new Notice(`Esse álbum já possui uma nota em ${musicalMusicRoot}.`);

      return;

    }

    // ----------------------------------------------------
    // GARANTIR PASTA
    // ----------------------------------------------------

    let folder = musicalMusicRoot;

    let folderExists = app.vault.getAbstractFileByPath(folder);

    if (!folderExists) {

      try {

        let partial = "";
        for (const segment of folder.split("/")) {
          partial = partial ? `${partial}/${segment}` : segment;
          if (!app.vault.getAbstractFileByPath(partial)) {
            await app.vault.createFolder(partial);
          }
        }

      } catch (error) {

        console.error("Erro ao criar pasta de álbuns:", error);

        new Notice(`Não foi possível criar a pasta ${musicalMusicRoot}.`);

        return;

      }

    }

    // ----------------------------------------------------
    // DATA DE CATALOGAÇÃO
    //
    // O plugin de cataloguedAt normalmente adicionará
    // este campo automaticamente ao criar a nota.
    //
    // Aqui não adicionamos cataloguedAt manualmente,
    // para manter a mesma lógica do sistema atual.
    // ----------------------------------------------------

    // ----------------------------------------------------
    // TEMPLATE MANUAL
    // ----------------------------------------------------

    let frontmatter =
`---
type: musicRelease
title: ${yamlQuote(title)}
year: ${year ? yamlQuote(year) : '""'}
artists:
  - ${yamlQuote(artist)}
image: ${image ? yamlQuote(image) : '""'}
personalRating: 0
scrobbles: 1
---`;

    let heading = year
      ? `# ${title} (${year})`
      : `# ${title}`;

    let content =
`${frontmatter}

${heading}
**Artista:** ${artist}

---

### 🎧 Minha Avaliação
\`INPUT[slider(minValue(0), maxValue(10)):personalRating]\`

---

### 📝 Notas e Destaques
- **Opinião:**

- **Faixas favoritas:**
	- `;

    // ----------------------------------------------------
    // CRIAR NOTA
    // ----------------------------------------------------

    try {

      let file = await app.vault.create(filePath, content);

      new Notice(`Álbum "${title}" registrado manualmente.`);

      // ------------------------------------------------
      // LIMPAR FORMULÁRIO
      // ------------------------------------------------

      manualTitle.value = "";
      manualArtist.value = "";
      manualYear.value = "";
      manualImage.value = "";

      manualForm.classList.remove("active");

      // ------------------------------------------------
      // ABRIR NOTA CRIADA
      // ------------------------------------------------

      let leaf = app.workspace.getLeaf(false);

      await leaf.openFile(file);

    } catch (error) {

      console.error("Erro ao registrar álbum manualmente:", error);

      new Notice("Erro ao criar a nota do álbum.");

    }

  }
);

// ============================================================
// 14. ESTATÍSTICAS
// ============================================================

let statsDiv = mainContainer.createEl(
  "div",
  { cls: "music-diary-stats" }
);

let albumsStat = statsDiv.createEl(
  "div",
  { cls: "music-diary-stat" }
);

albumsStat.innerHTML = `

  <div class="music-diary-stat-value">
    🎧 ${totalAlbuns}
  </div>

  <div class="music-diary-stat-label">
    Álbuns Registrados
  </div>

`;

let ratingStat = statsDiv.createEl(
  "div",
  { cls: "music-diary-stat" }
);

ratingStat.innerHTML = `

  <div class="music-diary-stat-value">
    ⭐ ${mediaNotas}
  </div>

  <div class="music-diary-stat-label">
    Média Geral
  </div>

`;

// ============================================================
// 15. CONTROLES
// ============================================================

let controlsDiv = mainContainer.createEl("div", { cls: "music-diary-filter-panel" });
let controlsHead = controlsDiv.createDiv({ cls: "music-diary-filter-heading" });
controlsHead.createEl("strong", { text: "Filtros" });
const resetFilters = controlsHead.createEl("button", { text: "Limpar filtros", cls: "music-diary-reset" });

let controlsGrid = controlsDiv.createDiv({ cls: "music-diary-controls-grid" });
const searchField = controlsGrid.createDiv({ cls: "music-diary-field music-diary-search-field" });
searchField.createEl("label", { text: "Pesquisar álbum, artista ou ano" });
let searchInput = searchField.createEl("input", {
  cls: "music-diary-search",
  attr: { type: "search", placeholder: "Pesquisar no acervo..." }
});

const sortField = controlsGrid.createDiv({ cls: "music-diary-field" });
sortField.createEl("label", { text: "Ordenar por" });
let sortSelect = sortField.createEl("select", { cls: "music-diary-sort" });
sortSelect.innerHTML = `
  <option value="recent">Catalogados recentemente</option>
  <option value="rating-desc">Maior nota</option>
  <option value="rating-asc">Menor nota</option>
  <option value="year-desc">Ano de lançamento (novo)</option>
  <option value="year-asc">Ano de lançamento (antigo)</option>
  <option value="title-asc">Nome (A–Z)</option>
  <option value="scrobbles-desc">Mais audições</option>
  <option value="scrobbles-asc">Menos audições</option>
`;

const acervoDetails = controlsDiv.createEl("details", { cls: "music-diary-acervo" });
const acervoSummary = acervoDetails.createEl("summary");
acervoSummary.createSpan({ text: "Filtros do acervo" });
acervoSummary.createSpan({ cls: "music-diary-filter-status", text: "Opcionais" });
const acervoContent = acervoDetails.createDiv({ cls: "music-diary-acervo-content" });

function diaryFilterGroup(title) {
  const group = acervoContent.createDiv({ cls: "music-diary-acervo-group" });
  const header = group.createDiv({ cls: "music-diary-group-header" });
  const label = header.createEl("label", { cls: "music-diary-filter-toggle" });
  const check = label.createEl("input", { type: "checkbox" });
  label.createSpan({ text: title });
  const status = header.createSpan({ cls: "music-diary-group-status", text: "Desativado" });
  const body = group.createDiv({ cls: "music-diary-group-body is-off" });
  check.addEventListener("change", () => {
    body.classList.toggle("is-off", !check.checked);
    applyListFilters();
  });
  return { check, status, body };
}

function diaryNumberField(parent, label, options = {}) {
  const field = parent.createDiv({ cls: "music-diary-field" });
  field.createEl("label", { text: label });
  return field.createEl("input", {
    attr: { type: "number", min: String(options.min ?? 0),
      max: options.max === undefined ? "" : String(options.max),
      step: String(options.step ?? 1), placeholder: options.placeholder ?? "Sem limite" }
  });
}

function diarySelect(parent, entries) {
  const select = parent.createEl("select");
  entries.forEach(([value, label]) => select.createEl("option", { value, text: label }));
  return select;
}

const ratingGroup = diaryFilterGroup("Filtrar por nota pessoal");
const ratingRow = ratingGroup.body.createDiv({ cls: "music-diary-range-row" });
const ratingMin = diaryNumberField(ratingRow, "Mínima", { min: 0, max: 10, step: 0.1, placeholder: "0" });
const ratingMax = diaryNumberField(ratingRow, "Máxima", { min: 0, max: 10, step: 0.1, placeholder: "10" });

const scrobbleGroup = diaryFilterGroup("Filtrar por audições");
const scrobbleRow = scrobbleGroup.body.createDiv({ cls: "music-diary-range-row" });
const scrobbleMin = diaryNumberField(scrobbleRow, "Mínimo", { min: 0, placeholder: "Sem mínimo" });
const scrobbleMax = diaryNumberField(scrobbleRow, "Máximo", { min: 0, placeholder: "Sem máximo" });

const timeGroup = diaryFilterGroup("Filtrar por tempo de catalogação");
const timeRow = timeGroup.body.createDiv({ cls: "music-diary-time-row" });
const timeMode = diarySelect(timeRow, [
  ["older", "Catalogados há mais de"],
  ["recent", "Catalogados nos últimos"]
]);
const timeValue = timeRow.createEl("input", { type: "number", attr: { min: "1", max: "999", step: "1", value: "1" } });
const timeUnit = diarySelect(timeRow, [
  ["days", "dia(s)"], ["weeks", "semana(s)"],
  ["months", "mês(es)"], ["years", "ano(s)"]
]);
timeUnit.value = "months";
const timeHint = timeGroup.body.createDiv({ cls: "music-diary-filter-hint" });
const filterHint = controlsDiv.createDiv({ cls: "music-diary-filter-hint music-diary-results-hint" });

function getScrobbles(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function diaryBound(input, min, max, integer = false) {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) && value >= min && value <= max &&
    (!integer || Number.isInteger(value)) ? value : null;
}

function diaryPeriodDays(amount, unit) {
  return amount * ({ days: 1, weeks: 7, months: 30.436875, years: 365.2425 }[unit] ?? 1);
}

function updateDiaryFilterStatuses() {
  const ratingA = diaryBound(ratingMin, 0, 10);
  const ratingB = diaryBound(ratingMax, 0, 10);
  const playsA = diaryBound(scrobbleMin, 0, Number.MAX_SAFE_INTEGER, true);
  const playsB = diaryBound(scrobbleMax, 0, Number.MAX_SAFE_INTEGER, true);
  const period = diaryBound(timeValue, 1, 999, true);
  ratingGroup.status.textContent = ratingGroup.check.checked
    ? `Nota ${ratingA ?? 0}–${ratingB ?? 10}` : "Desativado";
  scrobbleGroup.status.textContent = scrobbleGroup.check.checked
    ? `${playsA ?? "0"} a ${playsB ?? "∞"} audições` : "Desativado";
  const unitName = {
    days: ["dia", "dias"], weeks: ["semana", "semanas"],
    months: ["mês", "meses"], years: ["ano", "anos"]
  }[timeUnit.value];
  const description = `${timeMode.value === "older" ? "Catalogados há mais de" : "Catalogados nos últimos"} ${period ?? 1} ${unitName[(period ?? 1) === 1 ? 0 : 1]}`;
  timeGroup.status.textContent = timeGroup.check.checked ? description : "Desativado";
  timeHint.textContent = `${description}. Notas sem cataloguedAt válido não entram neste filtro.`;
  acervoSummary.querySelector(".music-diary-filter-status").textContent =
    [ratingGroup.check, scrobbleGroup.check, timeGroup.check].filter(c => c.checked).length
      ? `${[ratingGroup.check, scrobbleGroup.check, timeGroup.check].filter(c => c.checked).length} ativo(s)`
      : "Opcionais";
}

for (const input of [ratingMin, ratingMax, scrobbleMin, scrobbleMax, timeValue]) {
  input.addEventListener("input", applyListFilters);
}
for (const select of [timeMode, timeUnit]) select.addEventListener("change", applyListFilters);

resetFilters.addEventListener("click", () => {
  searchInput.value = "";
  sortSelect.value = "recent";
  for (const check of [ratingGroup.check, scrobbleGroup.check, timeGroup.check]) {
    check.checked = false;
    check.dispatchEvent(new Event("change"));
  }
  for (const input of [ratingMin, ratingMax, scrobbleMin, scrobbleMax]) input.value = "";
  timeMode.value = "older";
  timeValue.value = "1";
  timeUnit.value = "months";
  sortList("recent");
  applyListFilters();
});

// ============================================================
// 16. LISTA
// ============================================================

let listContainer = mainContainer.createEl(
  "div",
  { cls: "music-diary-list" }
);

// ============================================================
// 17. RENDERIZAR ÁLBUNS
// ============================================================

for (let album of albuns) {

  let item = listContainer.createEl(
    "div",
    { cls: "music-diary-item" }
  );

  // --------------------------------------------------------
  // Dados
  // --------------------------------------------------------

  let imgUrl = album.image || "";

  let title = album.title || album.file.name;

  let artist = getArtistName(album.artists);

  let year = album.year
    ? Number(album.year)
    : 0;

  // --------------------------------------------------------
  // DATA DE CATALOGAÇÃO
  // --------------------------------------------------------

  let cataloguedDate = getCataloguedDate(album.cataloguedAt);

  let dataFormatada = cataloguedDate.text;

  let rawRating =
    album.personalRating !== undefined &&
    album.personalRating !== null
      ? Number(album.personalRating)
      : -1;

  let ratingText = rawRating >= 0
    ? `⭐ ${rawRating}`
    : "Sem nota";

  // --------------------------------------------------------
  // SCROBBLES (somente leitura; "" = desconhecido)
  // --------------------------------------------------------

  let scrobbles = getScrobbles(album.scrobbles);

  // --------------------------------------------------------
  // Atributos para pesquisa / ordenação
  // --------------------------------------------------------

  item.setAttribute(
    "data-search",
    `${title} ${artist} ${year} ${dataFormatada}`.toLowerCase()
  );

  item.setAttribute("data-catalogued", cataloguedDate.timestamp);

  item.setAttribute("data-rating", rawRating);

  item.setAttribute("data-year", year);

  item.setAttribute("data-title", String(title).toLowerCase());

  item.setAttribute(
    "data-scrobbles",
    scrobbles === null ? "" : String(scrobbles)
  );

  // --------------------------------------------------------
  // CAPA
  // --------------------------------------------------------

  let cover = item.createEl(
    "div",
    { cls: "music-diary-cover" }
  );

  if (imgUrl) {

    let img = cover.createEl("img");

    img.src = imgUrl;

    img.alt = title;

    img.loading = "lazy";

  }

  // --------------------------------------------------------
  // INFORMAÇÕES
  // --------------------------------------------------------

  let info = item.createEl(
    "div",
    { cls: "music-diary-info" }
  );

  // --------------------------------------------------------
  // TÍTULO
  // --------------------------------------------------------

  let titleLink = info.createEl(
    "a",
    {
      cls: "internal-link music-diary-title",
      text: title,
      attr: {
        href: album.file.path
      }
    }
  );

  // --------------------------------------------------------
  // ARTISTA
  // --------------------------------------------------------

  info.createEl(
    "div",
    {
      cls: "music-diary-artist",
      text: artist
    }
  );

  // --------------------------------------------------------
  // META
  // --------------------------------------------------------

  let meta = info.createEl(
    "div",
    { cls: "music-diary-meta" }
  );

  if (year > 0) {

    meta.createEl(
      "span",
      {
        cls: "music-diary-badge",
        text: String(year)
      }
    );

  }

  if (dataFormatada) {

    meta.createEl(
      "span",
      {
        cls: "music-diary-badge",
        text: `📅 ${dataFormatada}`
      }
    );

  }

  let rating = meta.createEl(
    "span",
    {
      cls: "music-diary-rating",
      text: ratingText
    }
  );

}

// ============================================================
// 18. ORDENAÇÃO
// ============================================================

function sortList(criteria) {

  let items = Array.from(
    listContainer.querySelectorAll(".music-diary-item")
  );

  items.sort(
    (a, b) => {

      if (criteria === "recent") {

        return (
          Number(b.getAttribute("data-catalogued")) -
          Number(a.getAttribute("data-catalogued"))
        );

      }

      if (criteria === "rating-desc") {

        return (
          Number(b.getAttribute("data-rating")) -
          Number(a.getAttribute("data-rating"))
        );

      }

      if (criteria === "rating-asc") {

        return (
          Number(a.getAttribute("data-rating")) -
          Number(b.getAttribute("data-rating"))
        );

      }

      if (criteria === "year-desc") {

        return (
          Number(b.getAttribute("data-year")) -
          Number(a.getAttribute("data-year"))
        );

      }

      if (criteria === "year-asc") {

        return (
          Number(a.getAttribute("data-year")) -
          Number(b.getAttribute("data-year"))
        );

      }

      if (criteria === "scrobbles-desc" || criteria === "scrobbles-asc") {
        const read = el => {
          const raw = el.getAttribute("data-scrobbles");
          return raw === "" || raw === null ? null : Number(raw);
        };
        const av = read(a), bv = read(b);
        if (av === null) return bv === null ? 0 : 1;
        if (bv === null) return -1;
        return criteria === "scrobbles-desc" ? bv - av : av - bv;
      }

      if (criteria === "title-asc") {

        return (
          a.getAttribute("data-title")
            .localeCompare(
              b.getAttribute("data-title"),
              "pt-BR",
              { sensitivity: "base" }
            )
        );

      }

      return 0;

    }
  );

  items.forEach(
    item => listContainer.appendChild(item)
  );

}

// ============================================================
// 19. EVENTO DE ORDENAÇÃO
// ============================================================

sortSelect.addEventListener(
  "change",
  event => {

    sortList(event.target.value);

  }
);

// ============================================================
// 20. FILTROS COMBINADOS (busca + acervo)
// ============================================================

function applyListFilters() {
  updateDiaryFilterStatuses();
  const query = searchInput.value.toLowerCase().trim();
  const ratingA = diaryBound(ratingMin, 0, 10);
  const ratingB = diaryBound(ratingMax, 0, 10);
  const playsA = diaryBound(scrobbleMin, 0, Number.MAX_SAFE_INTEGER, true);
  const playsB = diaryBound(scrobbleMax, 0, Number.MAX_SAFE_INTEGER, true);
  const period = diaryBound(timeValue, 1, 999, true);
  const now = Date.now();
  const items = listContainer.querySelectorAll(".music-diary-item");
  let shown = 0;

  items.forEach(item => {
    const matchesText = (item.getAttribute("data-search") || "").includes(query);
    const rating = Number(item.getAttribute("data-rating"));
    const ratingValid = Number.isFinite(rating) && rating >= 0 && rating <= 10;
    const ratingPass = !ratingGroup.check.checked ||
      (ratingValid && (ratingA === null || rating >= ratingA) &&
        (ratingB === null || rating <= ratingB));

    const playsText = item.getAttribute("data-scrobbles") || "";
    const plays = playsText === "" ? null : Number(playsText);
    const playsPass = !scrobbleGroup.check.checked ||
      (plays !== null && (playsA === null || plays >= playsA) &&
        (playsB === null || plays <= playsB));

    const timestamp = Number(item.getAttribute("data-catalogued"));
    const ageDays = (now - timestamp) / 86400000;
    const timePass = !timeGroup.check.checked ||
      (period !== null && timestamp > 0 && timestamp <= now &&
        (timeMode.value === "older"
          ? ageDays > diaryPeriodDays(period, timeUnit.value)
          : ageDays <= diaryPeriodDays(period, timeUnit.value)));

    const visible = matchesText && ratingPass && playsPass && timePass;
    item.style.display = visible ? "flex" : "none";
    if (visible) shown++;
  });

  filterHint.textContent = `${shown} de ${items.length} álbuns exibidos.`;
}

searchInput.addEventListener("input", applyListFilters);

// ============================================================
// 21. ORDENAÇÃO INICIAL
// ============================================================

sortList("recent");
applyListFilters();
```