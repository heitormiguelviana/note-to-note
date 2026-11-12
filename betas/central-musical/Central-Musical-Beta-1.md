```dataviewjs
/* ============================================================
   CENTRAL MUSICAL — BETA

   FLUXO:  FONTES → CANDIDATOS → NORMALIZAÇÃO → EXCLUSÕES
           → PONTUAÇÃO → DIVERSIDADE → SPOTIFY → RESULTADOS

   POSSE (excluído de toda descoberta):
   1. catalogado em Musicas/ (exceto Musicas/Central/)
   2. salvo na biblioteca do Spotify
   3. edição equivalente (Deluxe, Expanded, Remastered...)
   ============================================================ */

/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */
const CFG = {
  debug: false, // Ative para consultar window.noteToNoteCentralDebug após uma busca.
  root: "Musicas",
  central: "Musicas/Central",
  feedback: "Musicas/Central/Feedback.md",
  likedPath: "Musicas/Sistema/NoteToNote-Curtidos.json",

  lastfmKey: "",
  lastfmUser: "",
  lastfmURL: "https://ws.audioscrobbler.com/2.0/",

  // Beta 3: estado independente. Importa a Beta 2 Revisada sem alterar seus dados.
  stateKey: "central-descoberta-v19-beta3-ui",
  legacyStateKey: "central-descoberta-v19-beta2-revisada",
  fallbackStateKey: "central-descoberta-v12",

  lastfmDelay: 90,
  cacheTTL: 1000 * 60 * 60 * 6,
  cacheMax: 450,
  concurrency: 4,

  similarArtists: 20,
  similarTracks: 25,
  topAlbums: 15,
  tagAlbums: 25,
  tagArtists: 20,
  tagTracks: 25,

  results: 6,

  /* Quantos candidatos (x results) são resolvidos no Spotify
     para sobrar margem quando algum não for encontrado/já for seu. */
  resolvePoolFactor: 3,

  /* DESCOBERTA UNIFICADA */
  maxDiscoveryArtists: 24,

  /* MANUAL */
  manualPoolSize: 40,
  manualMaxPerArtist: 2,

  seenLimit: 400
};

/* ============================================================
   INTEGRAÇÃO COM A CENTRAL DE CONFIGURAÇÕES MUSICAL
   ============================================================ */
const MUSICAL_CONFIG_PATH = "Musicas/Sistema/Configuracoes.json";
try {
  const configFile = dv.app.vault.getAbstractFileByPath(MUSICAL_CONFIG_PATH);
  if (!configFile || configFile.extension !== "json") {
    console.warn("Central Musical: Configuracoes.json não encontrado. Configure o Musical para usar o Last.fm.");
  } else {
    const config = JSON.parse(await dv.app.vault.read(configFile));
    const cleanPath = (value, fallback) => {
      if (typeof value !== "string") return fallback;
      const path = value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
      if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path) ||
          path.split("/").some(segment => !segment || segment === "." || segment === "..")) return fallback;
      return path;
    };
    CFG.root = cleanPath(config?.paths?.musicRoot, CFG.root);
    CFG.central = cleanPath(config?.paths?.central, CFG.central);
    CFG.feedback = cleanPath(config?.paths?.feedback, CFG.feedback);
    CFG.lastfmKey = typeof config?.lastfm?.apiKey === "string" ? config.lastfm.apiKey.trim() : "";
    CFG.lastfmUser = String(config?.lastfm?.username ?? config?.lastfm?.user ?? "").trim();
  }
} catch (error) {
  console.error("Central Musical: falha ao ler Configuracoes.json", error);
}

/* ============================================================
   ESTADO
   ============================================================ */
const DEFAULT_FILTERS = {
  excludeCatalogArtists: true,
  excludeCatalogAlbumTracks: true
};

const DEFAULT_STATE = {
  section: "personalized",
  personalizedMode: "balanced",
  personalizedSeeds: "",
  manualType: "artist",
  manualQuery: "",
  manualResults: [],
  manualSelected: [],
  manualFilters: { ...DEFAULT_FILTERS },
  manualSeen: [],
  manualExpanded: false,
  likedCategory: "album",
  knownCategory: "album",
  knownItems: [],
  personalizedSeen: [],
  recommendationSection: "",
  recommendations: [],
  resultsView: false
};

function loadState() {
  try {
    const raw = localStorage.getItem(CFG.stateKey) ?? localStorage.getItem(CFG.legacyStateKey) ?? localStorage.getItem(CFG.fallbackStateKey);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object" || Array.isArray(p)) return structuredClone(DEFAULT_STATE);
    const s = { ...structuredClone(DEFAULT_STATE), ...p };
    s.manualFilters = { ...DEFAULT_FILTERS, ...(p.manualFilters || {}) };
    // Valida primeiro os dados persistidos: uma lista corrompida não deve
    // descartar Curtidos/Conhecidos e as demais configurações.
    for (const k of ["manualResults", "manualSelected", "manualSeen", "personalizedSeen", "recommendations"]) {
      if (!Array.isArray(s[k])) s[k] = [];
    }
    if (s.section === "automatic") s.section = "personalized";
    if (!["manual", "personalized", "liked", "known"].includes(s.section)) s.section = "personalized";
    if (s.recommendationSection === "automatic") s.recommendationSection = "personalized";
    if (Array.isArray(p.autoSeen) && p.autoSeen.length) s.personalizedSeen = [...new Set([...(Array.isArray(p.personalizedSeen) ? p.personalizedSeen : []), ...p.autoSeen])].slice(-CFG.seenLimit);
    if (!s.recommendationSection && s.recommendations.length) s.recommendationSection = s.section;
    // Nunca entrar na tela de resultados com dados vazios ou de outra seção.
    s.resultsView = s.resultsView === true && s.recommendations.length > 0 &&
      ["manual", "personalized"].includes(s.recommendationSection) &&
      s.recommendationSection === s.section;
    if (!["familiar", "balanced", "explore"].includes(s.personalizedMode)) s.personalizedMode = "balanced";
    s.knownItems = Array.isArray(p.knownItems) ? p.knownItems.filter(i => i && ["album", "artist", "track"].includes(i.type) && typeof i.artist === "string" && i.artist.trim() && (i.type === "artist" || (i.type === "album" ? typeof i.album === "string" && i.album.trim() : typeof i.track === "string" && i.track.trim()))).slice(-5000) : [];
    if (!["album", "artist", "track"].includes(s.knownCategory)) s.knownCategory = "album";
    return s;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

let state = loadState();
let discoveryFocusKey = null; // Somente UI, não persistido no cofre


/* CURTIDOS V1.7 — artistas, álbuns e músicas. Lê o formato V1.6 sem migrar manualmente. */
let likedAlbums = [];
let likedReady = false;
let likedQueue = Promise.resolve();
const LIKED_TYPES = ["album", "artist", "track"];
function likedKey(item) {
  if (item?.type === "artist") return artistKey(item.artist);
  if (item?.type === "track") return trackKey(item.artist, item.track);
  return `album::${albumKey(item.artist, item.album)}`;
}
function likedSnapshot(item) {
  return {
    type: LIKED_TYPES.includes(item.type) ? item.type : "album",
    artist: String(item.artist || "").trim(),
    album: String(item.album || "").trim(),
    track: String(item.track || "").trim(),
    image: item.image || "",
    spotifyId: item.spotifyId || "",
    spotifyUrl: item.spotifyUrl || "",
    spotifyUri: item.spotifyUri || "",
    year: item.year || null,
    genre: item.genre || "",
    reason: item.reason || "",
    savedAt: new Date().toISOString()
  };
}
function isLiked(item) {
  return LIKED_TYPES.includes(item?.type) && likedAlbums.some(a => likedKey(a) === likedKey(item));
}
async function ensureVaultParent(path) {
  const parts = path.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}
async function loadLiked() {
  try {
    const file = app.vault.getAbstractFileByPath(CFG.likedPath);
    if (file) {
      const raw = JSON.parse(await app.vault.read(file));
      const entries = Array.isArray(raw) ? raw :
        Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.albums) ? raw.albums : [];
      const unique = new Map();
      for (const a of entries) {
        if (!a || !a.artist) continue;
        const item = { ...a, type: LIKED_TYPES.includes(a.type) ? a.type : "album" };
        if (item.type === "album" && !item.album) continue;
        if (item.type === "track" && !item.track) continue;
        unique.set(likedKey(item), item);
      }
      likedAlbums = [...unique.values()];
    }
  } catch (error) {
    console.error("Central: não foi possível carregar Curtidos", error);
    notice("Não foi possível ler Curtidos. O arquivo não será sobrescrito.");
    likedReady = false;
    return;
  }
  likedReady = true;
  render();
}
function toggleLiked(item) {
  if (!likedReady || !LIKED_TYPES.includes(item?.type) || !item.artist ||
      (item.type === "album" && !item.album) || (item.type === "track" && !item.track)) return Promise.resolve(false);
  likedQueue = likedQueue.catch(() => {}).then(async () => {
    const key = likedKey(item);
    const next = likedAlbums.some(a => likedKey(a) === key)
      ? likedAlbums.filter(a => likedKey(a) !== key)
      : [...likedAlbums, likedSnapshot(item)];
    await ensureVaultParent(CFG.likedPath);
    const file = app.vault.getAbstractFileByPath(CFG.likedPath);
    // Compatibilidade: mantém albums para leitores antigos; items contém todos os tipos.
    const payload = JSON.stringify({ version: 2, items: next, albums: next.filter(a => a.type === "album") }, null, 2) + "\n";
    if (file) await app.vault.modify(file, payload);
    else await app.vault.create(CFG.likedPath, payload);
    likedAlbums = next;
    render();
    return true;
  });
  return likedQueue;
}

/* "busy" NÃO é salvo: evita ficar preso em "Pesquisando..." */
let busy = false;

function saveState() {
  try { localStorage.setItem(CFG.stateKey, JSON.stringify(state)); } catch {}
}

/* ============================================================
   UTILIDADES
   ============================================================ */
function list(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function arr(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map(x => x.trim()).filter(Boolean);
  if (typeof value === "object") {
    if ("#text" in value) return [value["#text"]];
    if ("name" in value) return [value.name];
  }
  return [String(value)];
}

function text(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("#text" in value) return String(value["#text"]);
    if ("name" in value) return String(value.name);
  }
  return String(value);
}

function norm(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function notice(message, duration = 3500) {
  try { new Notice(message, duration); } catch { console.log(message); }
}

async function parallel(items, worker, concurrency = CFG.concurrency) {
  const results = new Array(items.length);
  let index = 0;
  async function runner() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

function shuffle(array) {
  const c = [...array];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/* Amostragem ponderada sem reposição (Efraimidis–Spirakis). */
function weightedSample(items, n) {
  return items
    .map(it => ({ it, k: Math.pow(Math.random(), 1 / Math.max(0.1, it.weight || 0.1)) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, n)
    .map(x => x.it);
}

function el(tag, cls = "", txt = null, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  Object.assign(e, props);
  return e;
}

/* ============================================================
   NORMALIZAÇÃO DE ÁLBUNS (edições equivalentes)
   ============================================================ */

/* Dentro de (parênteses) ou [colchetes]: aceita bastante coisa. */
const EDITION_LOOSE =
  /\b(deluxe|expanded|remaster(?:ed)?|anniversary|special|limited|collector'?s?|bonus|extended|re-?issue|complete|international|standard|platinum|edition|version|mono|stereo|explicit|clean)\b/i;

/* Depois de " - " ou ": ": mais rígido, para não cortar subtítulos legítimos. */
const EDITION_STRICT =
  /\b(deluxe|expanded|remaster(?:ed)?|anniversary|re-?issue|bonus|collector'?s?|edition|version)\b/i;

function albumBaseTitle(title) {
  let v = text(title).normalize("NFC").trim();
  let prev;
  do {
    prev = v;

    // "(Deluxe Edition)", "[2011 Remaster]", "(2015)"
    v = v.replace(/\s*[\(\[]([^\)\]]*)[\)\]]\s*$/, (m, inner) =>
      (EDITION_LOOSE.test(inner) || /^\s*\d{4}\s*$/.test(inner)) ? "" : m
    );

    // "Blonde - Expanded", "Album: Deluxe Edition"
    v = v.replace(/\s+[-–—:]\s+([^-–—:]*)$/, (m, tail) =>
      EDITION_STRICT.test(tail) ? "" : m
    );

    // sufixos soltos: "Blonde Deluxe", "Album Special Edition"
    v = v.replace(/\s+(?:super\s+)?(?:deluxe|expanded|remaster(?:ed)?|re-?issue|bonus|anniversary)(?:\s+(?:edition|version))?\s*$/i, "");
    v = v.replace(/\s+(?:special|limited|anniversary|collector'?s?|extended|complete|international|standard)\s+(?:edition|version)\s*$/i, "");

    v = v.trim();
  } while (v !== prev && v);

  return norm(v) || norm(title);
}

/* Índice de equivalência: reconhece participações e separadores de artistas,
   mas nunca elimina um álbum apenas por ter o mesmo título de outro artista. */
function artistVariants(value) {
  const raw = text(value).trim();
  if (!raw) return [];
  const variants = new Set([norm(raw)]);
  for (const part of raw.split(/\s*(?:,|;|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+featuring\s+|\s+x\s+)\s*/i)) {
    if (norm(part)) variants.add(norm(part));
  }
  return [...variants].filter(Boolean);
}
const albumKey = (artist, album) => `${norm(artist)}::${albumBaseTitle(album)}`;
const trackKey = (artist, track) => `track::${norm(artist)}::${norm(track)}`;
const artistKey = artist => `artist::${norm(artist)}`;
const feedbackKey = (artist, album) => `${norm(artist)}::${norm(album)}`;

function candidateKey(item) {
  if (item.type === "album") return albumKey(item.artist, item.album);
  if (item.type === "track") return trackKey(item.artist, item.track);
  if (item.type === "artist") return artistKey(item.artist);
  return "";
}

function dedupe(items) {
  const map = new Map();
  for (const item of items || []) {
    const k = candidateKey(item);
    if (!k) continue;
    const old = map.get(k);
    if (old) countDiagnostic("duplicates");
    if (!old || (item.discoveryScore || item.score || 0) > (old.discoveryScore || old.score || 0)) {
      map.set(k, item);
    }
  }
  return [...map.values()];
}

function remember(target, items) {
  for (const item of items) {
    const k = candidateKey(item);
    if (k) { const old = target.indexOf(k); if (old >= 0) target.splice(old, 1); target.push(k); }
  }
  while (target.length > CFG.seenLimit) target.shift();
}

/* ============================================================
   JÁ CONHEÇO — familiaridade, sem catalogar ou rejeitar estilos.
   Persistência no estado local existente (sem arquivos extras no vault).
   ============================================================ */
function knownKey(item) {
  if (item?.type === "track") {
    // O Spotify pode juntar artistas em "artist"; a referência Last.fm usa o principal.
    const mainArtist = Array.isArray(item.artists) && item.artists.length
      ? item.artists[0] : String(item.artist || "").split(/,\s*/)[0];
    return trackKey(mainArtist, item.track);
  }
  return candidateKey(item);
}
function isKnown(item) {
  if (!item || !["album", "artist", "track"].includes(item.type)) return false;
  const key = knownKey(item);
  return !!key && state.knownItems.some(entry => knownKey(entry) === key);
}
function knownSnapshot(item) {
  return {
    type: item.type,
    artist: String(item.type === "track" && item.artists?.length ? item.artists[0] : item.artist || "").trim(),
    album: item.type === "album" ? String(item.album || "").trim() : "",
    track: item.type === "track" ? String(item.track || "").trim() : "",
    image: item.image || "",
    spotifyId: item.spotifyId || "",
    spotifyUrl: item.spotifyUrl || "",
    spotifyUri: item.spotifyUri || "",
    knownAt: new Date().toISOString()
  };
}
function markKnown(item) {
  const key = knownKey(item);
  if (!key || isKnown(item)) return;
  const snapshot = knownSnapshot(item);
  state.knownItems.push(snapshot);
  // Remove resultados atuais, inclusive edições equivalentes do mesmo álbum.
  state.recommendations = state.recommendations.filter(candidate => !isKnown(candidate));
  saveState();
  render();
  notice(`Marcado como já conhecido: ${item.type === "track" ? item.track : item.type === "album" ? item.album : item.artist}`);
}
function unmarkKnown(item) {
  const key = knownKey(item);
  state.knownItems = state.knownItems.filter(entry => knownKey(entry) !== key);
  saveState();
  render();
}

/* ============================================================
   LAST.FM
   ============================================================ */
// Diagnósticos agregados por busca, sem armazenar URLs, respostas ou credenciais.
let apiIssues = new Set();
let diagnostics = { counts: {}, started: Date.now() };
function countDiagnostic(key, amount = 1) {
  diagnostics.counts[key] = (diagnostics.counts[key] || 0) + amount;
}
function beginDiagnostics() { apiIssues = new Set(); diagnostics = { counts: {}, started: Date.now() }; }
function finishDiagnostics(items = []) {
  diagnostics.final = items.length;
  diagnostics.artists = new Set(items.map(i => norm(i.artist))).size;
  diagnostics.tagged = items.filter(i => musicalTags(i.tags).length).length;
  diagnostics.distinctTags = new Set(items.flatMap(i => musicalTags(i.tags))).size;
  diagnostics.apiFailures = [...apiIssues];
  diagnostics.elapsedMs = Date.now() - diagnostics.started;
  if (CFG.debug) {
    diagnostics.selection = items.map(i => ({ key: candidateKey(i), score: i.discoveryScore, components: i.scoreComponents, distance: i.distance }));
    window.noteToNoteCentralDebug = structuredClone(diagnostics);
    console.debug("Central Musical", window.noteToNoteCentralDebug);
  }
}
function apiIssue(service, kind) { apiIssues.add(`${service}: ${kind}`); countDiagnostic("apiFailures"); }
function reportApiIssues(delivered = 0) {
  if (!apiIssues.size) return;
  const outcome = delivered > 0 ? `${delivered} recomendações entregues; houve falhas em parte das consultas` : "Não foi possível concluir as consultas";
  notice(`${outcome} (${[...apiIssues].join(", ")}). Tente novamente.`, 7000);
}
function apiFailure(service, error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const kind = status === 401 || status === 403 ? "autenticação" : status === 429 ? "limite de requisições" :
    error?.kind || (status ? `HTTP ${status}` : "rede ou serviço indisponível");
  apiIssue(service, kind);
  return new Error(`${service}: ${kind}.`);
}
const lastfmCache = new Map();
async function lastfm(method, params = {}) {
  if (!CFG.lastfmKey) { apiIssue("Last.fm", "autenticação"); throw new Error("Configure sua chave do Last.fm na Central de Configurações."); }
  const query = new URLSearchParams({ method, api_key: CFG.lastfmKey, format: "json", ...params });
  const cacheKey = query.toString();
  const cached = lastfmCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CFG.cacheTTL) return cached.promise;
  if (cached) lastfmCache.delete(cacheKey);
  const request = (async () => {
    const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(15000) : undefined;
    const response = await fetch(`${CFG.lastfmURL}?${query}`, signal ? { signal } : {});
    if (!response.ok) throw { status: response.status };
    let data;
    try { data = await response.json(); } catch { throw { kind: "resposta inválida" }; }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw { kind: "resposta inválida" };
    if (data.error) throw { status: [4, 9, 10, 26].includes(Number(data.error)) ? 401 : Number(data.error) === 29 ? 429 : 0, kind: "erro da API" };
    const expected = { "artist.getSimilar":"similarartists", "track.getSimilar":"similartracks", "artist.getTopAlbums":"topalbums", "tag.getTopAlbums":"albums", "tag.getTopArtists":"topartists", "tag.getTopTracks":"tracks", "album.getInfo":"album", "track.getTopTags":"toptags", "artist.search":"results", "album.search":"results", "track.search":"results" }[method];
    if (expected && !(expected in data)) throw { kind: "resposta inválida" };
    await sleep(CFG.lastfmDelay);
    return data;
  })();
  lastfmCache.set(cacheKey, { at: Date.now(), promise: request });
  if (lastfmCache.size > CFG.cacheMax) lastfmCache.delete(lastfmCache.keys().next().value);
  try { return await request; }
  catch (error) { lastfmCache.delete(cacheKey); throw apiFailure("Last.fm", error); }
}

/* Last.fm NÃO possui "tag.search". Para gênero/tag usamos:
   tag.getInfo (valida a tag), tag.getTopTags (filtra por texto)
   e tag.getSimilar (sugestões). */
async function tagSearch(query) {
  const q = query.trim();
  const names = [];
  const add = n => {
    n = text(n).trim();
    if (n && !names.some(x => norm(x) === norm(n))) names.push(n);
  };

  try {
    const info = await lastfm("tag.getInfo", { tag: q });
    add(info?.tag?.name);
  } catch {}

  if (!names.length) add(q);

  try {
    const top = await lastfm("tag.getTopTags", {});
    list(top?.toptags?.tag)
      .map(t => text(t?.name))
      .filter(n => norm(n).includes(norm(q)))
      .slice(0, 8)
      .forEach(add);
  } catch {}

  try {
    const sim = await lastfm("tag.getSimilar", { tag: q });
    list(sim?.similartags?.tag).slice(0, 6).forEach(t => add(t?.name));
  } catch {}

  return names.map(name => ({ name }));
}

async function lastfmSearch(type, query) {
  if (!query?.trim()) return [];

  if (type === "tag") return tagSearch(query);

  const spec = {
    artist: ["artist.search", { artist: query, limit: 15 }, d => d?.results?.artistmatches?.artist],
    album: ["album.search", { album: query, limit: 15 }, d => d?.results?.albummatches?.album],
    track: ["track.search", { track: query, limit: 15 }, d => d?.results?.trackmatches?.track]
  }[type];

  if (!spec) return [];
  const data = await lastfm(spec[0], spec[1]);
  return list(spec[2](data));
}

async function similarArtists(artist) {
  try {
    const data = await lastfm("artist.getSimilar", { artist, limit: CFG.similarArtists });
    return list(data?.similarartists?.artist)
      .map(i => ({ name: text(i?.name), match: Number(i?.match || 0) }))
      .filter(x => x.name);
  } catch { return []; }
}

async function similarTracks(artist, track) {
  try {
    const data = await lastfm("track.getSimilar", { artist, track, limit: CFG.similarTracks });
    return list(data?.similartracks?.track)
      .map(i => ({
        artist: text(i?.artist?.name ?? i?.artist),
        name: text(i?.name),
        match: Number(i?.match || 0)
      }))
      .filter(x => x.artist && x.name);
  } catch { return []; }
}

/* A posição na lista é o ranking (artist.getTopAlbums não envia "@attr.rank"). */
async function topAlbums(artist) {
  try {
    const data = await lastfm("artist.getTopAlbums", { artist, limit: CFG.topAlbums });
    return list(data?.topalbums?.album)
      .map((a, i) => ({
        artist,
        album: text(a?.name),
        rank: Number(a?.["@attr"]?.rank) || (i + 1)
      }))
      .filter(x => x.album && !/^\(?null\)?$/i.test(x.album));
  } catch { return []; }
}

async function tagTopAlbums(tag) {
  try {
    const data = await lastfm("tag.getTopAlbums", { tag, limit: CFG.tagAlbums });
    return list(data?.albums?.album)
      .map((a, i) => ({
        artist: text(a?.artist?.name ?? a?.artist),
        album: text(a?.name),
        rank: Number(a?.["@attr"]?.rank) || (i + 1)
      }))
      .filter(x => x.artist && x.album);
  } catch { return []; }
}

async function tagTopArtists(tag) {
  try {
    const data = await lastfm("tag.getTopArtists", { tag, limit: CFG.tagArtists });
    return list(data?.topartists?.artist)
      .map(i => ({ artist: text(i?.name ?? i) }))
      .filter(x => x.artist);
  } catch { return []; }
}

async function tagTopTracks(tag) {
  try {
    const data = await lastfm("tag.getTopTracks", { tag, limit: CFG.tagTracks });
    return list(data?.tracks?.track)
      .map(i => ({ artist: text(i?.artist?.name ?? i?.artist), track: text(i?.name) }))
      .filter(x => x.artist && x.track);
  } catch { return []; }
}

async function albumDetails(artist, album) {
  try {
    const data = await lastfm("album.getInfo", { artist, album, autocorrect: 1 });
    const info = data?.album || {};
    if (norm(info.artist) !== norm(artist) || albumBaseTitle(info.name) !== albumBaseTitle(album)) {
      countDiagnostic("lastfmMetadataMismatch");
      return { genre: "", tags: [], year: null, durationMinutes: null };
    }

    const tags = list(info?.tags?.tag)
      .map(t => text(t?.name ?? t))
      .filter(Boolean);

    const yearMatch = `${text(info?.releasedate)} ${text(info?.wiki?.published)}`.match(/\b(19|20)\d{2}\b/);

    let seconds = 0;
    for (const t of list(info?.tracks?.track)) {
      const d = Number(text(t?.duration));
      if (Number.isFinite(d) && d > 0) seconds += d;
    }

    return {
      genre: tags[0] || "",
      tags,
      year: yearMatch ? Number(yearMatch[0]) : null,
      durationMinutes: seconds ? Math.round(seconds / 60) : null
    };
  } catch {
    return { genre: "", tags: [], year: null, durationMinutes: null };
  }
}

/* ============================================================
   SPOTIFY
   ============================================================ */
function getSpotify() { return window.spotifysdk || null; }

async function spotifySearch(query, types) {
  const sdk = getSpotify();
  if (!sdk) { apiIssue("Spotify", "autenticação"); throw new Error("Spotify API não conectado."); }
  try {
    let response;
    try { response = await sdk.search(query, types); }
    catch (error) {
      // Compatibilidade apenas com SDKs que rejeitam o formato de argumento.
      if (!(error instanceof TypeError)) throw error;
      response = await sdk.search(query, Array.isArray(types) ? types[0] : types);
    }
    const field = Array.isArray(types) ? `${types[0]}s` : `${types}s`;
    if (!response || !Array.isArray(response[field]?.items)) throw { kind: "resposta inválida" };
    return response;
  } catch (error) { throw apiFailure("Spotify", error); }
}

const spotifySearchAlbums = async q => (await spotifySearch(q, ["album"]))?.albums?.items || [];
const spotifySearchTracks = async q => (await spotifySearch(q, ["track"]))?.tracks?.items || [];
const spotifySearchArtists = async q => (await spotifySearch(q, ["artist"]))?.artists?.items || [];

/* ---------- Biblioteca salva ---------- */
let SPOTIFY_SAVED_ALBUMS = null;

async function getSpotifySavedAlbums() {
  if (SPOTIFY_SAVED_ALBUMS) return SPOTIFY_SAVED_ALBUMS;

  const sdk = getSpotify();
  if (!sdk) throw new Error("O plugin Spotify API não está disponível. Ative-o para filtrar os álbuns salvos no Spotify.");

  const albums = [];
  try {
    let offset = 0;
    const limit = 50;
    while (true) {
      const response = await sdk.makeRequest("GET", `me/albums?limit=${limit}&offset=${offset}`);
      const body = Array.isArray(response) ? response : (response?.body ?? response?.data ?? response);
      if (!body || !Array.isArray(body.items)) throw { kind: "resposta inválida" };
      const items = body.items;
      if (!items.length) break;
      for (const entry of items) if (entry?.album) albums.push(entry.album);
      if (items.length < limit) break;
      offset += limit;
      if (offset > 5000) break;
    }
    SPOTIFY_SAVED_ALBUMS = albums;
    return albums;
  } catch (e) {
    throw apiFailure("Spotify", e);
  }
}

/* ============================================================
   ACERVO OBSIDIAN
   ============================================================ */
function getLibrary() {
  const result = [];
  for (const p of dv.pages(`"${CFG.root}"`)) {
    const path = p?.file?.path || "";
    if (!path.startsWith(`${CFG.root}/`)) continue;
    if (path === CFG.central || path.startsWith(`${CFG.central}/`)) continue;
    if (p.type && text(p.type).toLowerCase() !== "musicrelease" &&
        !list(p.file?.tags).some(t => norm(t).includes("mediadb music album"))) continue;

    const artists = arr(p.artists ?? p.artist).map(text).filter(Boolean);
    const title = text(p.title ?? p.album ?? p.name);
    if (!title || !artists.length) continue;

    const rating = Number(p.personalRating ?? p.rating ?? 0);
    result.push({ path, title, artists, tags: arr(p.genres ?? p.genre).map(text), rating: Number.isFinite(rating) ? rating : 0 });
  }
  return result;
}

const LIBRARY = getLibrary();

const CATALOG_ARTISTS = new Set(LIBRARY.flatMap(i => i.artists.flatMap(artistVariants)));
const CATALOG_ALBUMS = new Set(LIBRARY.flatMap(i => i.artists.flatMap(a => artistVariants(a).map(v => albumKey(v, i.title)))));

const catalogContainsArtist = artist => artistVariants(artist).some(a => CATALOG_ARTISTS.has(a));
const catalogContainsAlbum = (artist, album) => artistVariants(artist).some(a => CATALOG_ALBUMS.has(albumKey(a, album)));

/* ---------- Índice único de posse (Obsidian + Spotify) ---------- */
let OWNED = null;
let OWNED_TITLES = null;

function buildOwnedIndex() {
  const set = new Set();
  const titles = new Map();
  const add = (artist, title) => {
    const base = albumBaseTitle(title);
    if (!base) return;
    const artists = artistVariants(artist);
    for (const a of artists) {
      set.add(albumKey(a, title));
      if (!titles.has(base)) titles.set(base, new Set());
      titles.get(base).add(a);
    }
  };
  for (const item of LIBRARY) for (const artist of item.artists) add(artist, item.title);
  for (const saved of SPOTIFY_SAVED_ALBUMS || []) {
    for (const artist of list(saved?.artists)) add(text(artist?.name ?? artist), saved?.name);
  }
  OWNED = set;
  OWNED_TITLES = titles;
}

function ownedAlbum(artist, album, otherArtists = []) {
  if (!OWNED) buildOwnedIndex();
  const base = albumBaseTitle(album);
  const ownedArtists = OWNED_TITLES.get(base);
  if (!ownedArtists) return false;
  const candidates = [artist, ...list(otherArtists)].flatMap(artistVariants);
  return candidates.some(a => ownedArtists.has(a));
}

/* Revalida a lista inteira de artistas da edição encontrada no Spotify,
   inclusive em álbuns colaborativos que a API atribui a outro artista. */
function ownedSpotifyAlbum(item) {
  return ownedAlbum(item.artist, item.album, item.artists);
}

function catalogArtistStats() {
  const map = new Map();

  for (const item of LIBRARY) {
    for (const artist of item.artists) {
      const k = norm(artist);
      if (!map.has(k)) map.set(k, { artist, albums: 0, ratings: [] });
      const e = map.get(k);
      e.albums++;
      if (item.rating > 0 && item.rating <= 10) e.ratings.push(item.rating);
    }
  }

  for (const e of map.values()) {
    const sum = e.ratings.reduce((a, b) => a + b, 0);
    e.average = e.ratings.length ? sum / e.ratings.length : 0;
    e.max = e.ratings.length ? Math.max(...e.ratings) : 0;
    e.weight = e.ratings.length ? Math.max(0.1, (e.average - 4.5) * 2.1 + Math.min(e.ratings.length, 5) * 0.4) : 0.6;
  }
  return map;
}

/* ============================================================
   FEEDBACK
   ============================================================ */
const FEEDBACK_WEIGHTS = { love: 3, interesting: 1.5, maybe: 0.5, dislike: -3, block: -8, shown: 0 };

async function parseFeedback() {
  const file = app.vault.getAbstractFileByPath(CFG.feedback);
  const albums = new Map(), artists = new Map(), tracks = new Map(), blockedArtists = new Set();
  if (!file) return { albums, artists, tracks, blockedArtists };
  const effective = new Map();
  const raw = await app.vault.read(file);
  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.includes("feedback:")) continue;
    const fields = {};
    for (const part of line.split("|")) {
      const match = part.trim().match(/(?:^|\s)(feedback|action|artist|album|track|type|source|mode):\s*(.*)$/i);
      if (match) fields[match[1].toLowerCase()] = match[2].trim();
    }
    const artist = fields.artist || "", album = fields.album || "", track = fields.track || "";
    const action = (fields.action || fields.feedback || "").toLowerCase();
    const type = (fields.type || (track ? "track" : album ? "album" : "artist")).toLowerCase();
    // "shown" é telemetria histórica, não desfaz uma preferência explícita.
    if (!artist || action === "shown" || !Object.prototype.hasOwnProperty.call(FEEDBACK_WEIGHTS, action)) continue;
    if ((type === "album" && !album) || (type === "track" && !track) || !["artist", "album", "track"].includes(type)) continue;
    const key = type === "album" ? `album::${albumKey(artist, album)}` : type === "track" ? trackKey(artist, track) : artistKey(artist);
    const old = effective.get(key);
    effective.set(key, { artist, album, track, type, action, actions: [...(old?.actions || []), action] });
  }
  const signals = new Map();
  for (const e of effective.values()) {
    const id = norm(e.artist), weight = FEEDBACK_WEIGHTS[e.action];
    if (!signals.has(id)) signals.set(id, { artist: e.artist, direct: 0, items: [] });
    const signal = signals.get(id);
    if (e.type === "artist") {
      signal.direct = weight;
      if (e.action === "block") blockedArtists.add(id);
    } else {
      // Uma avaliação de obra é evidência fraca sobre o artista inteiro.
      signal.items.push(weight);
      const target = e.type === "album" ? albums : tracks;
      target.set(e.type === "album" ? albumKey(e.artist, e.album) : trackKey(e.artist, e.track), { ...e, score: weight });
    }
  }
  for (const [id, signal] of signals) {
    const mean = signal.items.length ? signal.items.reduce((a, b) => a + b, 0) / signal.items.length : 0;
    artists.set(id, { artist: signal.artist, score: signal.direct + Math.max(-1.5, Math.min(1.5, mean * .35)) });
  }
  return { albums, artists, tracks, blockedArtists };
}

function feedbackTrackState(feedback, artist, track) {
  const actions = feedback.tracks?.get(trackKey(artist, track))?.actions || [];
  const last = actions[actions.length - 1];
  return last === "block" || last === "dislike" ? last : null;
}

function feedbackAlbumState(feedback, artist, album) {
  const target = albumKey(artist, album);
  for (const e of feedback.albums.values()) {
    if (albumKey(e.artist, e.album) !== target) continue;
    const last = e.actions[e.actions.length - 1];
    if (last === "block" || last === "dislike") return last;
  }
  return null;
}

const artistFeedbackScore = (fb, artist) => fb.artists.get(norm(artist))?.score || 0;

function buildTasteProfile(feedback) {
  const profile = [];
  for (const e of catalogArtistStats().values()) {
    const fb = artistFeedbackScore(feedback, e.artist);
    profile.push({ ...e, feedback: fb, weight: Math.max(0.1, e.weight + fb) });
  }
  return profile.sort((a, b) => b.weight - a.weight);
}

/* ============================================================
   FILTROS
   ============================================================ */
function invalidAlbum(album) {
  const n = norm(album);
  if (!n) return true;

  const blocked = [
    "single", "radio edit", "radio version", "remix", "remixes", "instrumental",
    "karaoke", "acapella", "acoustic version", "sped up", "slowed", "slowed reverb"
  ];

  return blocked.some(term => {
    const t = norm(term);
    return n === t || n.includes(` ${t} `) || n.startsWith(`${t} `) || n.endsWith(` ${t}`);
  });
}

function isValidSpotifyAlbum(item) {
  return item && item.id && item.album_type === "album" &&
    Number(item.total_tracks || 0) >= 2 && !invalidAlbum(item.name);
}

/* ============================================================
   DIVERSIDADE
   ------------------------------------------------------------
   Seleção gulosa: a cada passo escolhe o melhor score ajustado.
   Cada item extra do mesmo artista é multiplicado por "penalty";
   "maxPerArtist" é teto duro; "accept" permite regras extras.
   ============================================================ */
function diversify(items, opts) {
  const {
    limit,
    maxPerArtist = 2,
    penalty = 0.55,
    typePenalty = 1,
    accept = null
  } = opts;

  const pool = [...items];
  const out = [];
  const byArtist = new Map();
  const byType = new Map();

  while (out.length < limit && pool.length) {
    let best = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const it = pool[i];
      const a = norm(it.artist);
      const c = byArtist.get(a) || 0;

      if (c >= (typeof maxPerArtist === "function" ? maxPerArtist(it) : maxPerArtist)) continue;
      if (accept && !accept(it, out)) continue;

      const base = Math.max(0, it.discoveryScore || 0) + 0.001;
      const tags = new Set((it.tags || (it.genre ? [it.genre] : [])).map(norm).filter(Boolean));
      let overlap = 0;
      if (tags.size) for (const selected of out) {
        const other = new Set((selected.tags || (selected.genre ? [selected.genre] : [])).map(norm).filter(Boolean));
        if (other.size) overlap = Math.max(overlap, [...tags].filter(t => other.has(t)).length / Math.sqrt(tags.size * other.size));
      }
      const connections = new Set((it.connections || []).map(norm));
      let related = 0;
      if (connections.size) for (const selected of out) {
        const other = new Set((selected.connections || []).map(norm));
        if (other.size) related = Math.max(related, [...connections].filter(t => other.has(t)).length / Math.sqrt(connections.size * other.size));
      }
      const s = base * Math.pow(penalty, c) * Math.pow(typePenalty, byType.get(it.type) || 0) * (1 - .2 * overlap - .1 * related);

      if (s > bestScore) { bestScore = s; best = i; }
    }

    if (best < 0) break;

    const [it] = pool.splice(best, 1);
    out.push(it);
    byArtist.set(norm(it.artist), (byArtist.get(norm(it.artist)) || 0) + 1);
    byType.set(it.type, (byType.get(it.type) || 0) + 1);
  }

  return out;
}

/* ============================================================
   SPOTIFY — RESOLUÇÃO
   ============================================================ */
function spotifyArtistMatches(item, artist) {
  const target = norm(artist);
  return list(item?.artists)
    .map(x => norm(x?.name))
    .some(n => n === target || n.includes(target) || target.includes(n));
}

const spotifyAlbumCache = new Map();

async function resolveSpotifyAlbum(artist, album) {
  const ck = `${norm(artist)}::${norm(album)}`;
  if (spotifyAlbumCache.has(ck)) {
    countDiagnostic(spotifyAlbumCache.get(ck) ? "spotifyCachedResolved" : "spotifyCachedRejected");
    return spotifyAlbumCache.get(ck);
  }
  const results = await spotifySearchAlbums(`"${album}" "${artist}"`);
  const wantedArtists = artistVariants(artist);
  const primary = wantedArtists.length > 1 ? wantedArtists[1] : wantedArtists[0];
  const valid = results.filter(isValidSpotifyAlbum).filter(item => {
    const names = list(item.artists).map(a => norm(a?.name)).filter(Boolean);
    // Sem correspondência textual integral do artista, título igual não basta.
    return (names[0] === norm(artist) || names[0] === primary) && albumBaseTitle(item.name) === albumBaseTitle(album);
  });
  // Edições explicitamente diferentes não são intercambiáveis para resolução.
  const exact = valid.filter(item => norm(item.name) === norm(album));
  const choices = exact.length ? exact : valid.filter(item =>
    norm(album) === albumBaseTitle(album) && norm(item.name) === albumBaseTitle(item.name));
  const artistIds = new Set(choices.flatMap(item => list(item.artists)
    .filter((a, i) => i === 0 && a?.id).map(a => a.id)));
  let resolved = null;
  const albumIds = new Set(choices.map(item => item.id));
  // IDs regionais distintos só são intercambiáveis com identidade comprovada
  // nos metadados resumidos. Datas/faixas diferentes ou ausentes ficam ambíguas.
  const signature = item => JSON.stringify([norm(item.name), list(item.artists).map(a => a.id || norm(a.name)), item.release_date, item.total_tracks]);
  const equivalent = albumIds.size > 1 && artistIds.size === 1 && choices.every(item =>
    item.release_date && list(item.artists).every(a => a.id) && signature(item) === signature(choices[0]));
  if (choices.length && artistIds.size <= 1 && (albumIds.size === 1 || equivalent)) {
    const item = [...choices].sort((a,b) => String(a.id).localeCompare(String(b.id)))[0];
    resolved = {
      type: "album", artist,
      artists: list(item.artists).map(a => text(a?.name)).filter(Boolean),
      album: item.name, spotifyId: item.id,
      spotifyUri: item.uri || `spotify:album:${item.id}`,
      spotifyUrl: item.external_urls?.spotify || `https://open.spotify.com/album/${item.id}`,
      image: item.images?.[1]?.url || item.images?.[0]?.url || "",
      totalTracks: Number(item.total_tracks || 0), releaseDate: item.release_date || ""
    };
  }
  if (!resolved) countDiagnostic(!results.length ? "spotifyNotFound" : choices.length > 1 ? "spotifyAmbiguous" : "spotifyIncompatible");
  else countDiagnostic("spotifyResolved");
  spotifyAlbumCache.set(ck, resolved);
  return resolved;
}

async function resolveSpotifyTrack(artist, track) {
  const results = await spotifySearchTracks(`"${track}" "${artist}"`);

  // Beta 2: evita aceitar uma faixa diferente só porque é do mesmo artista.
  // O nome do álbum é metadado da faixa, não seu título.
  const wanted = norm(track);
  const valid = results
    .filter(item => item?.id && item?.name &&
      list(item?.artists).some(a => norm(a?.name) === norm(artist)))
    .map(item => {
      const got = norm(item.name);
      const exact = got === wanted;
      const compatible = got.includes(wanted) || wanted.includes(got);
      return {item, score: exact ? 100 : compatible ? 65 : 0};
    })
    .filter(x => x.score >= 65)
    .sort((a,b) => b.score - a.score);

  if (!valid.length) return null;
  const item = valid[0].item;
  const artists = list(item.artists).map(a => text(a?.name)).filter(Boolean);

  return {
    type: "track",
    artist: artists.join(", "),
    artists,
    track: item.name,
    spotifyId: item.id,
    spotifyUri: item.uri || `spotify:track:${item.id}`,
    spotifyUrl: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
    image: item.album?.images?.[1]?.url || item.album?.images?.[0]?.url || "",
    album: item.album?.name || ""
  };
}

async function resolveSpotifyArtist(artist) {
  const results = await spotifySearchArtists(`"${artist}"`);
  if (!results.length) return null;

  const target = norm(artist);
  const item = results.find(i => norm(i?.name) === target) || results[0];
  if (!item?.id) return null;

  return {
    type: "artist",
    artist: item.name,
    spotifyId: item.id,
    spotifyUri: item.uri || `spotify:artist:${item.id}`,
    spotifyUrl: item.external_urls?.spotify || `https://open.spotify.com/artist/${item.id}`,
    image: item.images?.[1]?.url || item.images?.[0]?.url || ""
  };
}

/* Resolve candidatos de ÁLBUM no Spotify (capa + links), reaplica
   a exclusão com o título real do Spotify e escolhe o conjunto final. */
async function resolveAlbumPool(pool, divOpts, feedback, taste = null) {
  const resolved = await parallel(pool, async c => {
    const sp = await resolveSpotifyAlbum(c.artist, c.album);
    if (!sp) return null;
    if (sp.artists.some(a => feedback.blockedArtists.has(norm(a)))) { countDiagnostic("excludedBlocked"); return null; }
    if (ownedSpotifyAlbum(sp) || ownedAlbum(c.artist, c.album)) { countDiagnostic("excludedOwned"); return null; }
    if (isKnown(c) || isKnown(sp)) { countDiagnostic("excludedKnown"); return null; }
    return { ...c, ...sp, lastfmAlbum: c.album };
  });

  const seenIds = new Set();
  const unique = [];
  for (const r of resolved) {
    if (!r || seenIds.has(r.spotifyId)) continue;
    seenIds.add(r.spotifyId);
    unique.push(r);
  }

  await enrichAlbums(unique);
  const scored = taste ? unique.map(c => scoreAlbumTaste(c, taste)) : unique;
  if (CFG.debug) diagnostics.scores = scored.slice(0, 60).map(c => ({key:candidateKey(c), score:c.discoveryScore, components:c.scoreComponents}));
  return diversify(scored, { ...divOpts, limit: CFG.results });
}

/* ============================================================
   EXPLORAÇÃO — GÊNEROS POUCO PRESENTES NO ACERVO
   ============================================================ */
const DISTANT_TAGS = [
  "jazz", "classical", "opera", "folk", "country", "blues", "reggae", "dub",
  "ambient", "experimental", "world", "latin", "soul", "funk", "metal", "punk",
  "hardcore", "post rock", "shoegaze", "industrial", "electronic", "techno",
  "house", "drum and bass", "trip hop", "psychedelic", "soundtrack", "afrobeat",
  "gospel", "bluegrass", "baroque", "minimalism"
];

async function getLibraryTags() {
  const sample = LIBRARY.filter(a => a.rating > 5.5 && a.rating <= 10).sort((a, b) => b.rating - a.rating).slice(0, 15);
  const details = await parallel(sample, i => albumDetails(i.artists[0], i.title));

  const map = new Map();
  for (const d of details) {
    for (const tag of d?.tags || []) {
      const k = norm(tag);
      if (k) map.set(k, (map.get(k) || 0) + 1);
    }
  }
  return map;
}

/* ============================================================
   MANUAL — REFERÊNCIAS
   ============================================================ */
function referenceKey(item) {
  if (item.type === "artist") return artistKey(item.name);
  if (item.type === "album") return albumKey(item.artist, item.name);
  if (item.type === "track") return trackKey(item.artist, item.name);
  return `tag::${norm(item.name)}`;
}

function referenceLabel(item) {
  if (item.type === "artist") return `👤 ${item.name}`;
  if (item.type === "album") return `💿 ${item.artist} — ${item.name}`;
  if (item.type === "track") return `🎵 ${item.artist} — ${item.name}`;
  return `🏷️ ${item.name}`;
}

const isReferenceSelected = item =>
  state.manualSelected.some(s => referenceKey(s) === referenceKey(item));

const albumCandidate = (a, score, reason) => ({
  type: "album", artist: a.artist, album: a.album, name: a.album, score, reason
});

async function manualFromArtist(artist) {
  const results = [];
  const similar = await similarArtists(artist);

  for (const rel of similar) {
    results.push({
      type: "artist", artist: rel.name, name: rel.name,
      score: rel.match * 100, reason: `Artista relacionado a ${artist}`
    });
  }

  const related = similar.slice(0, 12);
  const lists = await parallel(related, r => topAlbums(r.name));

  related.forEach((rel, i) => {
    for (const a of lists[i] || []) {
      if (invalidAlbum(a.album)) continue;
      results.push(albumCandidate(a, rel.match * 100 - a.rank, `Álbum de ${a.artist}, relacionado a ${artist}`));
    }
  });

  /* Álbuns do próprio artista da referência (a posse é filtrada depois). */
  for (const a of await topAlbums(artist)) {
    if (invalidAlbum(a.album)) continue;
    results.push(albumCandidate(a, 80 - a.rank, `Álbum de ${artist} (referência)`));
  }

  return results;
}

async function manualFromAlbum(artist, album) {
  const results = [];
  const similar = await similarArtists(artist);

  for (const rel of similar) {
    results.push({
      type: "artist", artist: rel.name, name: rel.name,
      score: rel.match * 100, reason: `Artista relacionado a ${artist}`
    });
  }

  const details = await albumDetails(artist, album);
  const tags = details.tags.slice(0, 5);
  const related = similar.slice(0, 6);

  const [tagLists, artistLists] = await Promise.all([
    parallel(tags, t => tagTopAlbums(t)),
    parallel(related, r => topAlbums(r.name))
  ]);

  tags.forEach((tag, i) => {
    (tagLists[i] || []).forEach((c, idx) => {
      if (invalidAlbum(c.album)) return;
      results.push(albumCandidate(c, 70 - idx, `Relacionado pela tag "${tag}"`));
    });
  });

  related.forEach((rel, i) => {
    for (const a of artistLists[i] || []) {
      if (invalidAlbum(a.album)) continue;
      results.push(albumCandidate(a, rel.match * 100 - a.rank, `Álbum de ${a.artist}, relacionado a ${artist}`));
    }
  });

  return results;
}

/* V1.9 Beta 1: primeiro usa track.getSimilar; quando insuficiente,
   amplia por tags da própria faixa e artistas semelhantes. Não supõe
   que uma música com tags iguais tenha necessariamente o mesmo som. */
async function trackTags(artist, track) {
  try {
    const data = await lastfm("track.getTopTags", { artist, track, autocorrect: 1 });
    return list(data?.toptags?.tag)
      .map(t => ({ name: text(t?.name), count: Number(t?.count || 0) }))
      .filter(t => t.name && t.count >= 1)
      .sort((a,b) => b.count - a.count)
      .slice(0, 4).map(t => t.name);
  } catch (error) {
    console.warn("Central: tags indisponíveis para a faixa", artist, track, error);
    return [];
  }
}

async function manualFromTrack(artist, track) {
  const results = [];
  const similar = await similarTracks(artist, track);
  for (const rel of similar) results.push({
    type: "track", artist: rel.artist, track: rel.name, name: rel.name,
    score: 65 + rel.match * 65,
    reason: `Faixa semelhante a ${artist} — ${track} (Last.fm)`
  });
  for (const name of [...new Set(similar.map(x => x.artist))].slice(0, 10)) {
    results.push({type: "artist", artist: name, name, score: 38,
      reason: `Artista de uma faixa relacionada a ${track}`});
  }

  /* A busca original permanece prioritária. A ampliação ocorre quando
     a API devolve poucos resultados, inclusive listas vazias. */
  if (similar.length < 12) {
    const [tags, artists] = await Promise.all([
      trackTags(artist, track), similarArtists(artist)
    ]);
    const usefulTags = tags.filter(t => !/^(seen live|favorites|favourites|love|awesome|beautiful|music|my favorites|spotify|202[0-9]|201[0-9])$/i.test(t)).slice(0, 3);
    const [tagLists, artistLists] = await Promise.all([
      parallel(usefulTags, t => tagTopTracks(t), 3),
      parallel(artists.slice(0, 5), a => topAlbums(a.name), 3)
    ]);
    usefulTags.forEach((tag, i) => (tagLists[i] || []).slice(0, 12).forEach((t, rank) => {
      if (norm(t.artist) === norm(artist) && norm(t.track) === norm(track)) return;
      results.push({type:"track", artist:t.artist, track:t.track, name:t.track,
        score: 49 - rank * .65 - i * 3,
        reason:`Descoberta pela tag “${tag}” de ${track}`});
    }));
    artists.slice(0, 5).forEach((a, i) => {
      results.push({type:"artist", artist:a.name, name:a.name,
        score: 37 + a.match * 22 - i,
        reason:`Artista relacionado a ${artist}`});
      (artistLists[i] || []).slice(0, 4).forEach((album, rank) => {
        if (!invalidAlbum(album.album)) results.push(albumCandidate(album,
          35 + a.match * 18 - rank, `Álbum de artista relacionado a ${artist}`));
      });
    });
    if (!similar.length && !usefulTags.length && !artists.length)
      console.warn("Central: Last.fm não forneceu semelhantes, tags ou artistas relacionados para", artist, track);
  }
  return results;
}

async function manualFromTag(tag) {
  const [albums, artists, tracks] = await Promise.all([
    tagTopAlbums(tag), tagTopArtists(tag), tagTopTracks(tag)
  ]);

  const results = [];

  albums.forEach((a, i) => {
    if (invalidAlbum(a.album)) return;
    results.push(albumCandidate(a, 100 - i, `Álbum associado à tag "${tag}"`));
  });

  artists.forEach((a, i) => results.push({
    type: "artist", artist: a.artist, name: a.artist,
    score: 60 - i, reason: `Artista associado à tag "${tag}"`
  }));

  tracks.forEach((t, i) => results.push({
    type: "track", artist: t.artist, track: t.track, name: t.track,
    score: 55 - i, reason: `Música associada à tag "${tag}"`
  }));

  return results;
}

function manualFromReference(ref) {
  if (ref.type === "artist") return manualFromArtist(ref.name);
  if (ref.type === "album") return manualFromAlbum(ref.artist, ref.name);
  if (ref.type === "track") return manualFromTrack(ref.artist, ref.name);
  if (ref.type === "tag") return manualFromTag(ref.name);
  return Promise.resolve([]);
}

/* ============================================================
   MANUAL — FILTROS E MOTOR
   ============================================================ */
function manualCandidateAllowed(c, seen, feedback) {
  if (isKnown(c)) { countDiagnostic("excludedKnown"); return false; }
  if (feedback.blockedArtists?.has(norm(c.artist))) { countDiagnostic("excludedBlocked"); return false; }
  if (c.type === "track" && feedbackTrackState(feedback, c.artist, c.track)) return false;
  if (state.manualFilters.excludeCatalogArtists && catalogContainsArtist(c.artist)) return false;
  if (seen.has(candidateKey(c))) { countDiagnostic("excludedRepeated"); return false; }

  if (c.type === "album") {
    if (ownedAlbum(c.artist, c.album)) { countDiagnostic("excludedOwned"); return false; }
    const fb = feedbackAlbumState(feedback, c.artist, c.album);
    if (fb === "block" || fb === "dislike") { countDiagnostic("excludedFeedback"); return false; }
  }
  return true;
}

async function resolveManualCandidate(c, feedback) {
  if (c.type === "artist") {
    const a = await resolveSpotifyArtist(c.artist);
    return a && !isKnown(a) ? { ...a, discoveryScore: c._s, reason: c.reason } : null;
  }

  if (c.type === "album") {
    const sp = await resolveSpotifyAlbum(c.artist, c.album);
    if (!sp) return null;
    if (ownedSpotifyAlbum(sp) || ownedAlbum(c.artist, c.album) || isKnown(c) || isKnown(sp)) return null;
    return { ...sp, lastfmAlbum: c.album, discoveryScore: c._s, reason: c.reason };
  }

  if (c.type === "track") {
    const t = await resolveSpotifyTrack(c.artist, c.track);
    if (!t || isKnown(c) || isKnown(t)) return null;

    /* Filtro opcional: faixas de álbuns que você já tem (catálogo ou Spotify). */
    if (state.manualFilters.excludeCatalogAlbumTracks && t.album &&
        t.artists.some(a => ownedAlbum(a, t.album))) {
      return null;
    }
    return { ...t, discoveryScore: c._s, reason: c.reason };
  }

  return null;
}

async function generateManual(references, feedback) {
  const seen = new Set(state.manualSeen);
  const preferredType = manualPreferredType(references);
  const artistStats = catalogArtistStats();

  const lists = await parallel(references, r => manualFromReference(r), 2);
  const map = new Map();

  for (const c of lists.flatMap(l => l || [])) {
    countDiagnostic(`source:manual:${c.type}`);
    countDiagnostic("generated");
    if (!manualCandidateAllowed(c, seen, feedback)) continue;
    const k = candidateKey(c);
    if (!k) continue;

    const old = map.get(k);
    if (!old) map.set(k, { ...c, referenceCount: 1 });
    else { old.score += c.score * 0.35; old.referenceCount++; }
  }

  /* Ruído pequeno: no Refazer, empates não saem sempre na mesma ordem. */
  const candidates = [...map.values()]
    .map(c => ({
      ...c,
      _s: c.score + c.referenceCount * (c.type === "track" ? 15 : 20)
        + manualTasteScore(c, feedback, artistStats)
        + (preferredType && c.type === preferredType ? 65 : 0) + Math.random() * 4
    }))
    .sort((a, b) => b._s - a._s)
    .slice(0, CFG.manualPoolSize);

  const resolved = await parallel(candidates, c => resolveManualCandidate(c, feedback));

  let final = resolved.filter(Boolean).filter(it => {
    const names = it.artists || [it.artist];
    if (names.some(a => feedback.blockedArtists.has(norm(a)))) return false;
    if (state.manualFilters.excludeCatalogArtists && names.some(catalogContainsArtist)) return false;
    return !seen.has(candidateKey(it)) && !isKnown(it);
  });

  final = dedupe(final);
  await enrichAlbums(final);

  // Cota suave de 2/3 para o tipo de referência. Se faltarem candidatos,
  // preenche com outros tipos sem desperdiçar resultados.
  let selected;
  if (preferredType) {
    const quota = Math.ceil(CFG.results * 2 / 3);
    const primary = diversify(final.filter(x => x.type === preferredType), {
      limit: quota, maxPerArtist: CFG.manualMaxPerArtist, penalty: .5, typePenalty: 1
    });
    const used = new Set(primary.map(candidateKey));
    const byArtist = new Map();
    for (const it of primary) byArtist.set(norm(it.artist), (byArtist.get(norm(it.artist)) || 0) + 1);
    const rest = diversify(final.filter(x => !used.has(candidateKey(x))), {
      limit: CFG.results - primary.length, maxPerArtist: it =>
        Math.max(0, CFG.manualMaxPerArtist - (byArtist.get(norm(it.artist)) || 0)),
      penalty: .5, typePenalty: .85
    });
    selected = [...primary, ...rest];
  } else {
    // Tags: seleção mista de álbuns, artistas e músicas, com preenchimento
    // caso alguma categoria não ofereça resultados suficientes.
    const byType = { album: [], artist: [], track: [] };
    for (const it of final) if (byType[it.type]) byType[it.type].push(it);
    const used = new Set();
    const counts = new Map();
    selected = [];
    for (const type of ["album", "track", "artist"]) {
      for (const it of diversify(byType[type], { limit: 2, maxPerArtist: CFG.manualMaxPerArtist, penalty: .5 })) {
        if (selected.length >= CFG.results || used.has(candidateKey(it)) || (counts.get(norm(it.artist)) || 0) >= CFG.manualMaxPerArtist) continue;
        selected.push(it); used.add(candidateKey(it));
        counts.set(norm(it.artist), (counts.get(norm(it.artist)) || 0) + 1);
      }
    }
    if (selected.length < CFG.results) {
      selected.push(...diversify(final.filter(it => !used.has(candidateKey(it))), {
        limit: CFG.results - selected.length,
        maxPerArtist: it => Math.max(0, CFG.manualMaxPerArtist - (counts.get(norm(it.artist)) || 0)),
        penalty: .5, typePenalty: .38
      }));
    }
  }

  remember(state.manualSeen, selected);
  return selected;
}

/* ============================================================
   ENRIQUECIMENTO
   ============================================================ */
async function enrichAlbums(items) {
  const albums = items.filter(x => x.type === "album");
  const details = await parallel(albums, i => albumDetails(i.artist, i.lastfmAlbum || i.album));

  albums.forEach((a, i) => {
    const d = details[i] || {};
    a.genre = d.genre || "";
    a.tags = d.tags || [];
    a.durationMinutes = d.durationMinutes || null;
    a.year = Number(String(a.releaseDate || "").slice(0, 4)) || d.year || null;
  });

  return items;
}

/* ============================================================
   FEEDBACK — GRAVAÇÃO
   ============================================================ */
// Serializa gravações para não perder uma avaliação quando dois botões são
// acionados rapidamente. Se disponível, vault.process faz append atômico.
let feedbackQueue = Promise.resolve();
function appendFeedback(item, action) {
  const write = feedbackQueue.catch(() => {}).then(async () => {
    await ensureVaultParent(CFG.feedback);
    let file = app.vault.getAbstractFileByPath(CFG.feedback);
    if (!file) file = await app.vault.create(CFG.feedback, "# Feedback da Central\n\n");

    const date = new Date().toLocaleDateString("pt-BR");
    const artist = String(item.artist || "").replace(/[|\r\n]/g, " ").trim();
    const album = String(item.type === "album" ? item.album || "" : "").replace(/[|\r\n]/g, " ").trim();
    const track = String(item.type === "track" ? item.track || "" : "").replace(/[|\r\n]/g, " ").trim();
    const mode = state.section === "personalized" ? state.personalizedMode : "";
    const line = `- ${date} | feedback: ${action} | type: ${item.type || "album"} | artist: ${artist} | album: ${album} | track: ${track} | source: ${state.section} | mode: ${mode}\n`;

    if (typeof app.vault.process === "function") {
      await app.vault.process(file, contents => contents + line);
    } else {
      await app.vault.modify(file, (await app.vault.read(file)) + line);
    }
    notice(`Feedback registrado: ${action}`);
  });
  feedbackQueue = write.catch(() => {});
  return write;
}

/* ============================================================
   SPOTIFY — AÇÕES
   ============================================================ */
async function spotifySaveAlbum(item) {
  const sdk = getSpotify();
  if (!sdk || !item.spotifyId) throw new Error("Spotify API não conectado.");

  await sdk.makeRequest(
    "PUT",
    `me/library?uris=${encodeURIComponent(item.spotifyUri || `spotify:album:${item.spotifyId}`)}`
  );

  notice(`Salvo no Spotify: ${item.album}`);

  if (Array.isArray(SPOTIFY_SAVED_ALBUMS)) {
    SPOTIFY_SAVED_ALBUMS.push({ name: item.album, artists: [{ name: item.artist }] });
  }
  if (OWNED) { OWNED = null; OWNED_TITLES = null; }
}

// Um URI spotify:track pode ser interpretado pelo SO como o álbum da faixa.
// URL canônica HTTPS aponta explicitamente para o tipo e ID corretos.
function spotifyOpenUrl(item) {
  const type = ["track", "album", "artist"].includes(item?.type) ? item.type : "";
  const id = String(item?.spotifyId || "").trim();
  if (type && /^[a-zA-Z0-9]{16,24}$/.test(id))
    return `https://open.spotify.com/${type}/${id}`;
  const uri = String(item?.spotifyUri || "");
  const match = uri.match(/^spotify:(track|album|artist):([a-zA-Z0-9]+)$/);
  if (match && (!type || type === match[1]))
    return `https://open.spotify.com/${match[1]}/${match[2]}`;
  const url = String(item?.spotifyUrl || "");
  return /^https:\/\/open\.spotify\.com\/(track|album|artist)\/[^\s]+/i.test(url) ? url : "";
}
function openSpotify(item) {
  const url = spotifyOpenUrl(item);
  if (!url) {
    notice("Link do Spotify indisponível para este item.");
    return;
  }
  // Acionado diretamente pelo clique, sem timeout ou popup duplicado.
  // O Spotify controla se a página abre no aplicativo e se reproduz automaticamente.
  try { window.open(url, "_blank"); }
  catch (error) {
    console.error("Central: falha ao abrir o Spotify", error);
    notice("Não foi possível abrir o link do Spotify.");
  }
}

/* ============================================================
   INTERFACE — CSS
   ============================================================ */
const root = dv.container;
root.innerHTML = "";

const style = document.createElement("style");
style.textContent = `
/* NOTE TO NOTE — INTERFACE — V1.8 */
.c12 {
  --nt-bg: #191d23; --nt-surface: #22272e; --nt-surface-2: #292f38;
  --nt-line: #383f48; --nt-ink: #e9edf0; --nt-muted: #a0aab5;
  --nt-accent: #8ca9c7; --nt-accent-bg: #2a3949;
  display:flex; flex-direction:column; gap:18px; width:100%; max-width:990px;
  min-width:0; margin:0 auto; padding:24px 26px 34px;
  background:var(--nt-bg); color:var(--nt-ink);
  border:1px solid var(--nt-line); border-radius:10px;
  font-family:var(--font-interface),system-ui,sans-serif;
  font-size:14px; line-height:1.5;
}
.c12, .c12 * {box-sizing:border-box}
.c12 > * {min-width:0;max-width:100%}
.c12 button,.c12 input,.c12 select {font:inherit}
.c12 button {box-shadow:none!important; height:auto;}
.c12 button:focus-visible,.c12 input:focus-visible,.c12 select:focus-visible {outline:2px solid var(--nt-accent);outline-offset:2px}
.c12-hero {padding:8px 2px 14px;border-bottom:1px solid var(--nt-line)}
.c12-eyebrow,.c12-input-label {font-size:10px;letter-spacing:.19em;font-weight:750;color:var(--nt-accent);text-transform:uppercase}
.c12-title {font-size:clamp(25px,4vw,35px);font-weight:750;letter-spacing:-.045em;line-height:1.16;margin:9px 0 7px;color:var(--nt-ink)}
.c12-subtitle {font-size:12px;color:var(--nt-muted);line-height:1.65;max-width:670px}
.c12-tabs {display:flex;gap:6px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--nt-line)}
.c12-tab {background:transparent!important;color:var(--nt-muted)!important;border:1px solid transparent!important;border-radius:5px;padding:9px 15px;min-height:38px;cursor:pointer;font-weight:600;font-size:12px;white-space:normal}
.c12-tab:hover {background:var(--nt-surface)!important;color:var(--nt-ink)!important}
.c12-tab.active {background:var(--nt-accent-bg)!important;color:#c4d8eb!important;border-color:#4b647d!important}
.c12-panel {padding:20px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);overflow:hidden}
.c12-panel-title {font-size:16px;font-weight:750;letter-spacing:-.02em;color:var(--nt-ink);margin-bottom:9px}
.c12-mode-desc,.c12-hint,.c12-reason {color:var(--nt-muted);font-size:12px;line-height:1.65}
.c12-modes {display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px;margin:17px 0 20px;align-items:stretch}
.c12-modes > button.c12-mode {
  display:flex!important;flex-direction:column!important;align-items:flex-start!important;
  justify-content:flex-start!important;position:relative!important;float:none!important;
  width:100%!important;min-width:0!important;max-width:none!important;
  height:auto!important;min-height:102px!important;margin:0!important;
  padding:14px 13px!important;text-align:left!important;
  white-space:normal!important;line-height:1.4!important;overflow:visible!important;
  background:var(--nt-bg)!important;border:1px solid var(--nt-line)!important;
  color:var(--nt-ink)!important;border-radius:6px!important;box-sizing:border-box!important;
  cursor:pointer;transition:border-color .16s,background .16s
}
.c12-modes > button.c12-mode:hover {border-color:#5c7187!important}
.c12-modes > button.c12-mode.active {border-color:var(--nt-accent)!important;background:var(--nt-accent-bg)!important}
.c12-mode-title {display:block!important;width:100%;font-size:14px;font-weight:750;margin:0 0 6px!important;line-height:1.35!important;white-space:normal!important;overflow-wrap:break-word}
.c12-mode .c12-mode-desc {display:block!important;width:100%;font-size:11px;line-height:1.5!important;white-space:normal!important;overflow-wrap:break-word}
.c12-input-label {display:block;margin-top:3px}
.c12-seed-input,.c12-liked-search,.c12-search input,.c12-search select {
  width:100%;min-width:0;background:var(--nt-bg)!important;color:var(--nt-ink)!important;
  border:1px solid var(--nt-line)!important;border-radius:5px;padding:10px 12px;
}
.c12-seed-input {margin:9px 0 3px}
.c12 input::placeholder {color:#808c98}
.c12-toolbar,.c12-selected,.c12-filters {display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
.c12-btn {border-radius:5px!important;padding:8px 13px!important;min-height:35px;line-height:1.3;font-size:12px!important;font-weight:650;cursor:pointer;white-space:normal;max-width:100%;background:var(--nt-accent)!important;color:#101b25!important;border:1px solid var(--nt-accent)!important}
.c12-btn:hover:not(:disabled) {filter:brightness(1.08)}
.c12-btn.secondary {background:transparent!important;color:var(--nt-muted)!important;border:1px solid var(--nt-line)!important}
.c12-btn.secondary:hover {color:var(--nt-ink)!important;border-color:#70859a!important}
.c12-btn:disabled {opacity:.5;cursor:default}
.c12-section-heading {display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--nt-line);padding:0 2px 8px}
.c12-section-heading .c12-panel-title {margin:0}
.c12-result-count {font-size:11px;color:var(--nt-muted)}
.c12-results,.c12-liked-grid {display:flex;flex-direction:column;gap:9px;margin-top:4px}
.c12-card {display:flex;gap:16px;align-items:flex-start;padding:15px;border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-surface);min-width:0;overflow:hidden;transition:border-color .16s}
.c12-card:hover {border-color:#586676}
.c12-cover {width:106px;height:106px;flex:0 0 106px;object-fit:cover;border-radius:4px;background:var(--nt-surface-2);display:flex;align-items:center;justify-content:center;color:var(--nt-muted);font-size:22px}
.c12-body {min-width:0;flex:1}
.c12-card-title {font-size:16px;font-weight:750;letter-spacing:-.025em;color:var(--nt-ink);line-height:1.25;overflow-wrap:anywhere}
.c12-card-artist {font-size:12px;color:var(--nt-accent);margin-top:5px;overflow-wrap:anywhere}
.c12-meta {display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.c12-badge {font-size:10px;color:var(--nt-muted);border:1px solid var(--nt-line);padding:2px 7px;border-radius:3px;background:var(--nt-bg)}
.c12-reason {margin-top:10px;overflow-wrap:anywhere}
.c12-actions,.c12-feedback {display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.c12-actions .c12-btn,.c12-feedback .c12-btn {font-size:11px!important;padding:6px 10px!important;min-height:31px}
.c12-feedback {padding-top:10px;border-top:1px solid var(--nt-line)}
.c12-heart.active {background:var(--nt-accent-bg)!important;border-color:var(--nt-accent)!important;color:#c4d8eb!important}
.c12-liked-panel {display:flex;flex-direction:column;gap:14px}
.c12-liked-heading {font-size:20px;font-weight:750;letter-spacing:-.03em}
.c12-liked-search {margin-top:4px}
.c12-search {display:flex;flex-wrap:wrap;gap:8px}
.c12-search select {flex:0 0 190px!important;width:190px!important;min-width:190px!important;height:42px!important;padding:8px 32px 8px 12px!important;box-sizing:border-box!important;font-size:13px!important;line-height:normal!important;text-align:left!important;text-indent:0!important;appearance:auto!important;-webkit-appearance:auto!important}
.c12-search input {flex:1 1 190px;min-width:150px;width:auto}
.c12-search .c12-btn {flex:0 0 auto}
.c12-filter {display:inline-flex;align-items:center;gap:7px;padding:8px 10px;background:var(--nt-bg);border:1px solid var(--nt-line);border-radius:5px;color:var(--nt-muted);font-size:11px;cursor:pointer}
.c12-filter input {margin:0;accent-color:var(--nt-accent)}

/* V1.8 — resultados compactos, Curtidos e Já Conheço */
.c12-search-heading {display:flex;justify-content:space-between;align-items:center;gap:10px;margin:18px 0 8px;font-size:12px;color:var(--nt-ink)}
.c12-search-heading span {color:var(--nt-muted);font-size:11px}
.c12-search-results {display:flex;flex-direction:column;gap:5px;max-width:100%}
.c12 button.c12-search-result {display:flex!important;align-items:center!important;gap:11px!important;width:100%!important;min-height:55px!important;padding:8px 11px!important;margin:0!important;text-align:left!important;background:var(--nt-bg)!important;border:1px solid var(--nt-line)!important;border-radius:5px!important;color:var(--nt-ink)!important;cursor:pointer;white-space:normal!important;min-width:0!important}
.c12 button.c12-search-result:hover {border-color:#657c93!important;background:var(--nt-surface-2)!important}
.c12 button.c12-search-result.selected {background:var(--nt-accent-bg)!important;border-color:var(--nt-accent)!important}
.c12-search-result-icon {display:flex;align-items:center;justify-content:center;flex:0 0 34px;width:34px;height:34px;border-radius:4px;background:var(--nt-surface-2);color:var(--nt-accent);font-size:18px}
.c12-search-result-copy {display:flex;flex:1 1 auto;flex-direction:column;min-width:0;gap:1px;line-height:1.3}
.c12-search-result-copy strong {font-size:12px;overflow-wrap:anywhere;font-weight:650}
.c12-search-result-copy small {font-size:10px;color:var(--nt-muted);overflow-wrap:anywhere}
.c12-search-result-check {flex:0 0 19px;text-align:center;color:var(--nt-accent);font-size:17px}
.c12 .c12-more {align-self:flex-start;margin-top:5px}
.c12-liked-tabs {display:flex;flex-wrap:wrap;gap:7px;border-bottom:1px solid var(--nt-line);padding-bottom:10px}
.c12 button.c12-liked-tab {padding:8px 12px!important;background:transparent!important;border:1px solid var(--nt-line)!important;border-radius:5px!important;color:var(--nt-muted)!important;font-size:12px!important;cursor:pointer}
.c12 button.c12-liked-tab.active {background:var(--nt-accent-bg)!important;color:#c4d8eb!important;border-color:var(--nt-accent)!important}
.c12-ref {padding:11px;border-radius:5px;cursor:pointer;border:1px solid var(--nt-line);background:var(--nt-bg);overflow-wrap:anywhere}
.c12-ref.selected {border-color:var(--nt-accent);background:var(--nt-accent-bg)}
.c12-chip {display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:4px;max-width:100%;background:var(--nt-bg);border:1px solid var(--nt-line);font-size:11px;overflow-wrap:anywhere}
.c12-chip button {border:0;background:transparent;cursor:pointer;color:var(--nt-muted);padding:0 3px;box-shadow:none}
.c12-loading,.c12-empty {padding:22px;text-align:center;border:1px dashed var(--nt-line);border-radius:5px;color:var(--nt-muted);font-size:12px;background:var(--nt-surface)}
/* V1.9 Beta 3 — etapas: configuração OU resultados, nunca ambas. */
.c12.c12-results-stage {max-width:1200px;gap:15px}
.c12-results-stage .c12-hero {padding:2px 2px 9px}
.c12-results-stage .c12-title {font-size:clamp(20px,3vw,27px);margin:5px 0 2px}
.c12-results-stage .c12-subtitle {display:none}
.c12-stage-top {display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:1px 1px 14px;border-bottom:1px solid var(--nt-line)}
.c12-stage-copy {display:flex;flex-direction:column;gap:2px;min-width:0}
.c12-stage-kicker {font-size:10px;font-weight:750;letter-spacing:.12em;text-transform:uppercase;color:var(--nt-accent)}
.c12-stage-title {font-size:clamp(17px,2.7vw,23px);font-weight:750;letter-spacing:-.025em;line-height:1.25}
.c12-stage-detail {font-size:11px;color:var(--nt-muted)}
.c12-stage-actions {display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.c12-stage-actions .c12-btn {font-size:11px!important}
.c12-results-stage .c12-gallery {margin-top:2px}
.c12-results-stage .c12-section-heading {margin-top:0}
.c12-stage-loading {animation:c12-appear .16s ease both}
@media(max-width:600px) {
 .c12-stage-top {align-items:stretch}
 .c12-stage-actions {width:100%}
 .c12-stage-actions .c12-btn {flex:1 1 auto}
}
/* V1.9 Beta 1 — galeria como padrão; modo foco com ações originais */
.c12-gallery {display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,165px),1fr));gap:13px;min-width:0}
.c12 button.c12-gallery-card {display:flex!important;flex-direction:column;align-items:stretch;text-align:left;min-width:0;width:100%;padding:0!important;overflow:hidden;border:1px solid var(--nt-line)!important;border-radius:7px!important;background:var(--nt-surface)!important;color:var(--nt-ink)!important;cursor:pointer;white-space:normal!important;animation:c12-appear .18s ease both}
.c12 button.c12-gallery-card:hover {border-color:var(--nt-accent)!important;background:var(--nt-surface-2)!important}
.c12 button.c12-gallery-card:focus-visible {outline:2px solid var(--nt-accent);outline-offset:2px}
.c12-gallery-cover {display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1/1;object-fit:cover;background:var(--nt-surface-2);font-size:30px}
.c12-gallery-info {padding:11px 12px 13px;min-width:0;flex:1}
.c12-gallery-type {font-size:9px;letter-spacing:.11em;font-weight:750;color:var(--nt-accent);margin-bottom:6px}
.c12-gallery-title {font-size:13px;font-weight:750;line-height:1.32;overflow-wrap:anywhere}
.c12-gallery-artist {font-size:11px;color:var(--nt-muted);margin-top:5px;overflow-wrap:anywhere}
.c12-focus {min-width:0;animation:c12-appear .17s ease both}
.c12-focus > .c12-card {display:grid;grid-template-columns:minmax(0, 290px) minmax(0,1fr);gap:22px;padding:22px;align-items:start}
.c12-focus > .c12-card > .c12-cover {width:100%;height:auto;aspect-ratio:1/1;max-width:290px;flex:auto;font-size:42px}
.c12-focus > .c12-card .c12-card-title {font-size:clamp(19px,2.5vw,26px)}
.c12-focus-nav {display:flex;justify-content:space-between;gap:9px;margin-top:12px}
@keyframes c12-appear {from {opacity:0;transform:translateY(5px)} to {opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce) {.c12 button.c12-gallery-card,.c12-focus {animation:none!important}}
@media(max-width:600px) {
 .c12-gallery {grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .c12-gallery-info {padding:9px 10px 11px}
 .c12-focus > .c12-card {grid-template-columns:minmax(0,1fr);padding:13px;gap:12px}
 .c12-focus > .c12-card > .c12-cover {width:min(100%,290px);max-width:290px;margin-inline:auto}
 .c12-focus-nav .c12-btn {flex:1;min-width:0}
}
@media(max-width:720px){
 .c12 {padding:17px 14px;gap:14px}
 .c12-modes {grid-template-columns:1fr;gap:7px}
 .c12-modes > button.c12-mode {min-height:0!important;padding:12px 13px!important}
 .c12-cover {width:82px;height:82px;flex-basis:82px}
 .c12-card {padding:12px;gap:12px}
 .c12-search select,.c12-search input,.c12-search .c12-btn {flex:1 1 100%!important;width:100%!important;max-width:100%!important}
}
@media(max-width:430px){
 .c12 {padding:12px 10px;border-radius:5px}
 .c12-tabs {gap:2px}
 .c12-tab {padding:8px 9px;font-size:11px}
 .c12-cover {width:68px;height:68px;flex-basis:68px}
 .c12-card-title {font-size:14px}
 .c12-card {gap:9px;padding:10px}
}
`;
root.appendChild(style);

const appRoot = el("div", "c12");
root.appendChild(appRoot);

const header = el("div");
header.className = "c12-hero";
header.appendChild(el("div", "c12-eyebrow", "NOTE TO NOTE  /  DISCOVERY"));
header.appendChild(el("div", "c12-title", "Descoberta Musical"));
header.appendChild(el("div", "c12-subtitle", "Uma seleção guiada pelo seu gosto. Explore sem pressa, salve o que interessar."));
appRoot.appendChild(header);

/* ============================================================
   RENDER
   ============================================================ */
function hasSectionResults(section = state.section) {
  return ["manual", "personalized"].includes(section) &&
    state.recommendationSection === section &&
    Array.isArray(state.recommendations) && state.recommendations.length > 0;
}

function showResults() {
  if (!hasSectionResults() || busy) return;
  state.resultsView = true;
  discoveryFocusKey = null;
  saveState();
  render();
}

function showSettings() {
  state.resultsView = false;
  discoveryFocusKey = null;
  saveState();
  render();
}

function render() {
  while (appRoot.children.length > 1) appRoot.removeChild(appRoot.lastChild);

  // Na etapa de resultados, não montamos nem escondemos com CSS os formulários:
  // eles simplesmente não existem na tela até o usuário voltar.
  const resultsStage = state.resultsView &&
    ["manual", "personalized"].includes(state.section) &&
    state.recommendationSection === state.section &&
    (busy || hasSectionResults());
  appRoot.classList.toggle("c12-results-stage", resultsStage);
  if (resultsStage) {
    renderRecommendations();
    return;
  }

  const tabs = el("div", "c12-tabs");
  const mkTab = (label, section) => {
    const b = el("button", "c12-tab" + (state.section === section ? " active" : ""), label);
    b.onclick = () => { state.section = section; state.resultsView = false; discoveryFocusKey = null; saveState(); render(); };
    return b;
  };

  tabs.appendChild(mkTab("Descoberta", "personalized"));
  tabs.appendChild(mkTab("Pesquisa manual", "manual"));
  tabs.appendChild(mkTab(`Curtidos · ${likedAlbums.length}`, "liked"));
  tabs.appendChild(mkTab(`Já conheço · ${state.knownItems.length}`, "known"));
  appRoot.appendChild(tabs);

  if (state.section === "manual") renderManual();
  else if (state.section === "liked") renderLiked();
  else if (state.section === "known") renderKnown();
  else renderPersonalized();
}

/* ============================================================
   PARA VOCÊ — PERFIL HÍBRIDO ADAPTATIVO V1.6
   Reutiliza o pipeline de candidatos, exclusões, Spotify e feedback.
   Não gerencia filas de audição nem modifica avaliações.
   ============================================================ */
function personalizedProfile() {
  const rated = LIBRARY.filter(a => a.rating > 0 && a.rating <= 10);
  const uniqueArtists = new Set(rated.flatMap(a => a.artists.map(norm))).size;
  const coverage = Math.min(1, rated.length / 25);
  const diversity = rated.length ? Math.min(1, uniqueArtists / Math.max(5, rated.length * .65)) : 0;
  const confidence = coverage * (.65 + .35 * diversity);
  const level = rated.length < 5 ? "Inicial" : rated.length < 20 ? "Em formação" : rated.length < 50 ? "Consolidado" : "Avançado";
  return { rated, uniqueArtists, confidence, level };
}

// Tags de fonte identificada são indícios, não classificação definitiva de sonoridade.
function musicalTags(tags) {
  return [...new Set(list(tags).map(norm).filter(t => t &&
    !/^(music|albums?|favorites?|favourites?|seen live|spotify|male vocalists|female vocalists|american|british|english|\d{4}|\d{4}s)$/.test(t)))].slice(0, 12);
}
async function albumTasteProfile(feedback) {
  const works = new Map();
  const add = (artist, album, signal, tags = []) => {
    if (!artist || !album) return;
    works.set(albumKey(artist, album), {artist, album, signal, tags: musicalTags(tags)});
  };
  for (const a of LIBRARY) if (a.rating > 0 && a.rating <= 10)
    add(a.artists[0], a.title, (a.rating - 5.5) / 4.5, a.tags);
  for (const a of likedAlbums) if (a.type === "album" && !works.has(albumKey(a.artist, a.album)))
    add(a.artist, a.album, .4, a.genre ? [a.genre] : []);
  for (const a of feedback.albums.values())
    add(a.artist, a.album, Math.max(-1, Math.min(1, a.score / 3)) * .8, works.get(albumKey(a.artist, a.album))?.tags || []);
  // Rodadas por artista evitam que discografias extensas consumam todo o orçamento.
  const grouped = new Map();
  for (const a of works.values()) {
    const key = norm(a.artist);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(a);
  }
  for (const group of grouped.values()) group.sort((a,b) => Math.abs(b.signal)-Math.abs(a.signal) || a.album.localeCompare(b.album));
  const sample = [];
  for (let round = 0; round < 3 && sample.length < 30; round++) for (const group of grouped.values()) {
    if (group[round] && sample.length < 30) sample.push(group[round]);
  }
  await parallel(sample.filter(a => !a.tags.length), async a => { a.tags = musicalTags((await albumDetails(a.artist, a.album)).tags); });
  const tags = new Map();
  for (const a of sample) for (const tag of a.tags) {
    if (!tags.has(tag)) tags.set(tag, new Map());
    const artist = norm(a.artist), signals = tags.get(tag);
    if (!signals.has(artist)) signals.set(artist, []);
    signals.get(artist).push(a.signal);
  }
  const affinity = new Map();
  for (const [tag, artists] of tags) {
    const values = [...artists.values()].map(signals => signals.reduce((a,b) => a+b, 0) / signals.length);
    affinity.set(tag, values.reduce((a,b) => a+b, 0) / (values.length + 2));
  }
  return { works: sample, affinity };
}
function scoreAlbumTaste(candidate, taste) {
  const tags = musicalTags(candidate.tags);
  const shared = tags.filter(t => taste.affinity.has(t));
  const tagAffinity = shared.length ? shared.reduce((sum,t) => sum + taste.affinity.get(t), 0) / Math.sqrt(tags.length * shared.length) : 0;
  // Uma conexão por artista + conjunto de tags; obras redundantes não multiplicam afinidade.
  const matches = new Map();
  for (const work of taste.works) {
    if (work.signal <= 0 || !work.tags.length || !tags.length) continue;
    const common = tags.filter(t => work.tags.includes(t));
    const overlap = common.length / Math.sqrt(tags.length * work.tags.length);
    if (!overlap) continue;
    const key = norm(work.artist) + "::" + [...common].sort().join("|");
    const evidence = { work, score: overlap * work.signal };
    if (!matches.has(key) || evidence.score > matches.get(key).score) matches.set(key, evidence);
  }
  const links = [...matches.values()].sort((a,b) => b.score-a.score).slice(0, 3);
  // Mesmo sinal de tags: conexões explicam, mas não somam novamente à pontuação.
  const base = Math.min(10, Math.max(0, candidate.discoveryScore || 0));
  const adjustment = 4 * tagAffinity;
  const score = Math.max(0, base + adjustment);
  const reasons = [candidate.reason];
  if (shared.length) reasons.push(`${tagAffinity >= 0 ? "afinidade" : "menor afinidade"} de tags: ${shared.slice(0,2).join(", ")}`);
  if (links.length && tagAffinity > 0) reasons.push(`tags em comum com ${links.slice(0,2).map(x => x.work.album).join(" e ")}`);
  return { ...candidate, discoveryScore: score, reason: reasons.filter(Boolean).join(" · "), scoreComponents: {artist:base, tags:adjustment}, albumConnections:links.length };
}

async function personalizedSeeds(feedback) {
  const profile = personalizedProfile();
  const byArtist = new Map();
  const add = (artist, weight, origin) => {
    const key = norm(artist);
    if (!key || !Number.isFinite(weight) || weight <= 0) return;
    const existing = byArtist.get(key);
    if (!existing || existing.weight < weight) byArtist.set(key, { artist, weight, origin });
  };
  // Média regularizada: duas avaliações neutras reduzem confiança em uma única nota;
  // mais álbuns aumentam confiança sem multiplicar indefinidamente o peso.
  for (const e of catalogArtistStats().values()) {
    const n = e.ratings.length;
    if (!n) continue;
    const mean = (e.ratings.reduce((a,b) => a+b, 0) + 11) / (n + 2);
    const positive = Math.max(0, (mean - 5.5) / 4.5);
    if (positive) add(e.artist, 2 + positive * 8, "avaliações");
  }
  // Curtidas são sinais próprios; uma obra não equivale a curtir o artista.
  for (const item of likedAlbums) add(item.artist, item.type === "artist" ? 5 : 2, "curtidos");
  for (const entry of feedback.artists.values()) {
    if (entry.score > 0) add(entry.artist, Math.min(5, 1 + entry.score), "feedback");
  }
  // Calibração opcional, sem criar avaliações fictícias.
  for (const artist of String(state.personalizedSeeds || "").split(/[;\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 12)) {
    add(artist, profile.rated.length ? 5 : 8, "preferências informadas");
  }
  // Feedback negativo reduz o peso, mas não altera avaliações pessoais.
  for (const [key, entry] of byArtist) {
    const penalty = Math.max(-8, Math.min(8, artistFeedbackScore(feedback, entry.artist)));
    entry.weight = Math.max(0, entry.weight + Math.min(0, penalty) * 0.6);
    if (entry.weight <= 0 || feedback.blockedArtists.has(key)) byArtist.delete(key);
  }
  return { profile, seeds: [...byArtist.values()].sort((a,b)=>b.weight-a.weight).slice(0, 20) };
}

/* Exploratório: cada recomendação deve vir de um território musical distinto.
   Não começa por artistas similares (isso repetia hip-hop/rap). */
const EXPLORATION_FAMILIES = [
  ["jazz", "jazz", "bebop", "free jazz"],
  ["classical", "classical", "baroque", "opera"],
  ["folk", "folk", "bluegrass", "country"],
  ["reggae", "reggae", "dub", "ska"],
  ["ambient", "ambient", "drone", "minimalism"],
  ["metal", "metal", "doom metal", "black metal"],
  ["punk", "punk", "post punk", "hardcore"],
  ["electronic", "techno", "house", "drum and bass"],
  ["global", "afrobeat", "bossa nova", "flamenco"],
  ["soul", "soul", "funk", "gospel"],
  ["rock", "shoegaze", "post rock", "psychedelic rock"],
  ["soundtrack", "soundtrack", "film score", "new age"],
  ["blues", "blues", "delta blues", "rhythm and blues"],
  ["experimental", "industrial", "noise", "experimental"]
];

async function discoverGenreExploration(feedback, seen) {
  const taste = await albumTasteProfile(feedback);
  const libraryTags = new Map([...taste.affinity].filter(([, value]) => value > 0));
  // Penaliza famílias já representadas no acervo; não as proíbe para sempre.
  const families = EXPLORATION_FAMILIES.map(([family, ...tags]) => ({
    family, tags,
    presence: tags.reduce((sum, tag) => sum + (libraryTags.get(norm(tag)) || 0), 0)
  }));
  // Tags fora das famílias predefinidas (por exemplo, hip hop) também ancoram exploração.
  for (const [tag, value] of libraryTags) if (!families.some(f => f.tags.some(t => norm(t) === tag)))
    families.push({family: tag, tags: [tag], presence: value});
  // Famílias com evidência positiva vêm primeiro; uma família distante é
  // reservada para exploração, sem interpretar ausência como preferência.
  const near = families.filter(f => f.presence > 0).sort((a,b) => b.presence-a.presence);
  if (!near.length) throw new Error("Avalie álbuns e obtenha tags Last.fm para orientar a exploração de gêneros.");
  const anchors = [...libraryTags.entries()].sort((a,b) => b[1]-a[1]).slice(0, 4);
  const relatedLists = await parallel(anchors, async ([tag]) => {
    const data = await lastfm("tag.getSimilar", {tag});
    return list(data?.similartags?.tag).map(t => norm(t?.name));
  });
  const relatedTags = new Set(relatedLists.flatMap(x => x || []));
  for (const tag of relatedTags) if (tag && !families.some(f => f.tags.some(t => norm(t) === tag)))
    families.push({family: tag, tags: [tag], presence: 0});
  const related = families.filter(f => !f.presence && f.tags.some(t => relatedTags.has(norm(t))));
  const distant = shuffle(families.filter(f => !f.presence && !related.includes(f)));
  const adjacent = shuffle(related);
  const chosen = [...near.slice(0, 3), ...adjacent.slice(0, 2), ...distant.slice(0, 1), ...near.slice(3,4), ...adjacent.slice(2,3)].slice(0, 8);
  const searches = await parallel(chosen, async f => {
    // Tenta uma subtag diferente por rodada para não repetir sempre o mesmo topo.
    const tags = shuffle(f.tags);
    for (const tag of tags.slice(0, 2)) {
      const albums = await tagTopAlbums(tag);
      if (albums?.length) return {tag, albums};
    }
    return {tag: tags[0], albums: []};
  });
  const groups = [];
  chosen.forEach((f,i) => {
    const result = searches[i];
    if (!result) return;
    const candidates = [];
    for (const album of shuffle((result.albums || []).slice(0, 28))) {
      if (!album?.artist || !album?.album || invalidAlbum(album.album)) continue;
      if (ownedAlbum(album.artist, album.album)) { countDiagnostic("excludedOwned"); continue; }
      if (isKnown({type:"album", artist:album.artist, album:album.album})) { countDiagnostic("excludedKnown"); continue; }
      if (feedback.blockedArtists?.has(norm(album.artist))) { countDiagnostic("excludedBlocked"); continue; }
      const fb = feedbackAlbumState(feedback, album.artist, album.album);
      if (fb === "block" || fb === "dislike") { countDiagnostic("excludedFeedback"); continue; }
      const c = {
        type:"album", artist:album.artist, album:album.album,
        genreFamily:f.family, tags: [result.tag], discoveryScore:f.presence ? 6 : related.includes(f) ? 5 : 3,
        distance:f.presence ? "near" : related.includes(f) ? "adjacent" : "distant",
        reason:f.presence ? `Exploração de ${result.tag}: relacionado às tags de álbuns bem avaliados` : related.includes(f) ? `Exploração de ${result.tag}: tag relacionada pelo Last.fm` : `Exploração ocasional de ${result.tag}: estilo sem evidência no perfil`,
        mode:"explore"
      };
      if (!seen.has(candidateKey(c))) candidates.push(c);
      else countDiagnostic("excludedRepeated");
    }
    countDiagnostic("source:exploration", candidates.length);
    groups.push({family:f.family, distant:!f.presence && !related.includes(f), candidates:dedupe(candidates).slice(0, 8)});
  });
  // Famílias próximas mantêm prioridade; a distância é uma opção ocasional.
  // Resolve alternativas de cada família; só depois escolhe o resultado final.
  const resolved = await parallel(groups, async g => {
    const items = await parallel(g.candidates, async c => {
      const sp = await resolveSpotifyAlbum(c.artist, c.album);
      if (!sp || sp.artists.some(a => feedback.blockedArtists.has(norm(a))) || ownedSpotifyAlbum(sp) || ownedAlbum(c.artist, c.album) || isKnown(c) || isKnown(sp)) return null;
      return {...c, ...sp, lastfmAlbum:c.album};
    });
    const valid = items.filter(Boolean);
    await enrichAlbums(valid);
    return {family:g.family, distant:g.distant, items:valid.map(c => scoreAlbumTaste(c, taste)).sort((a,b) => b.discoveryScore-a.discoveryScore)};
  });
  const output = [], ids = new Set(), artists = new Set();
  // Primeira passagem: no máximo UM álbum por família e artista.
  for (const group of resolved.filter(Boolean)) {
    const pick = group.items.find(c => !ids.has(c.spotifyId) && !artists.has(norm(c.artist)));
    if (!pick) continue;
    output.push(pick); ids.add(pick.spotifyId); artists.add(norm(pick.artist));
    if (output.length >= CFG.results) break;
  }
  // Se menos famílias estiverem disponíveis, preenche sem duplicar álbuns/artistas.
  if (output.length < CFG.results) {
    for (const group of resolved.filter(g => g && !g.distant)) {
      for (const c of group.items) {
        if (ids.has(c.spotifyId) || artists.has(norm(c.artist))) continue;
        output.push(c); ids.add(c.spotifyId); artists.add(norm(c.artist));
        if (output.length >= CFG.results) break;
      }
      if (output.length >= CFG.results) break;
    }
  }
  return output;
}

async function discoverPersonalized(feedback, seen) {
  const mode = state.personalizedMode || "balanced";
  if (mode === "explore") return discoverGenreExploration(feedback, seen);
  const { profile, seeds } = await personalizedSeeds(feedback);
  if (!seeds.length && mode !== "explore") throw new Error("Para começar, avalie álbuns, curta itens ou informe artistas favoritos abaixo.");
  const chosen = weightedSample(seeds, Math.min(mode === "explore" ? 8 : 10, seeds.length));
  const similar = await parallel(chosen, s => similarArtists(s.artist));
  const candidates = new Map();
  chosen.forEach((seed, i) => {
    for (const rel of similar[i] || []) {
      const key = norm(rel.name);
      if (!key) continue;
      const similarity = Math.max(0, Number(rel.match) || 0);
      if (feedback.blockedArtists?.has(key)) continue;
      const known = catalogContainsArtist(rel.name);
      const noveltyFactor = mode === "explore" ? (known ? .2 : 1.5) : mode === "familiar" ? (known ? 1.15 : .85) : (known ? .6 : 1.1);
      const score = seed.weight * similarity * noveltyFactor;
      if (!candidates.has(key)) candidates.set(key, { artist: rel.name, score: 0, known, via: [] });
      const c = candidates.get(key);
      c.score += score;
      c.via.push({ artist: seed.artist, score, origin: seed.origin });
    }
  });
  if (mode !== "explore") for (const seed of chosen) {
    const key = norm(seed.artist);
    if (!candidates.has(key)) candidates.set(key, { artist: seed.artist, score: seed.weight * .65, known: catalogContainsArtist(seed.artist), via: [{ artist: seed.artist, score: seed.weight, origin: seed.origin }] });
  }
  for (const c of candidates.values()) {
    const bridges = new Set(c.via.map(v => norm(v.artist))).size;
    const independent = [...new Map(c.via.map(v => [norm(v.artist), v.score])).values()].sort((a,b) => b-a).slice(0,3);
    c.score = independent[0] + (independent.slice(1).reduce((a,b) => a+b,0) / Math.max(1, independent.length-1)) * .25;
  }
  const artists = [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0, CFG.maxDiscoveryArtists);
  const lists = await parallel(artists, a => topAlbums(a.artist));
  const raw = [];
  artists.forEach((a,i) => {
    const best = [...a.via].sort((x,y)=>y.score-x.score)[0];
    for (const album of lists[i] || []) {
      if (feedback.blockedArtists?.has(norm(album.artist))) { countDiagnostic("excludedBlocked"); continue; }
      countDiagnostic("source:similarArtists");
      if (invalidAlbum(album.album)) { countDiagnostic("excludedInvalid"); continue; }
      if (ownedAlbum(album.artist, album.album)) { countDiagnostic("excludedOwned"); continue; }
      if (isKnown({type:"album", artist:album.artist, album:album.album})) { countDiagnostic("excludedKnown"); continue; }
      const fb = feedbackAlbumState(feedback, album.artist, album.album);
      if (fb === "block" || fb === "dislike") { countDiagnostic("excludedFeedback"); continue; }
      const candidate = {
        type: "album", artist: album.artist, album: album.album, known: a.known,
        discoveryScore: Math.max(0, a.score + Math.max(0, 16-album.rank) * .01 + Math.min(0, artistFeedbackScore(feedback, album.artist))),
        connections: [...new Set(a.via.map(v => v.artist))],
        reason: `Afinidade com ${best?.artist || "seu perfil"} (${best?.origin || "descoberta"})` + (profile.rated.length < 5 ? " · perfil inicial" : ""),
        mode: "personalized"
      };
      if (!seen.has(candidateKey(candidate)) && !isKnown(candidate)) raw.push(candidate);
      else countDiagnostic("excludedRepeated");
    }
  });
  // Equilibrado mantém artistas novos, inclusive dentro de gêneros conhecidos.
  // Exploratório é tratado separadamente: diversidade REAL de gêneros.
  countDiagnostic("generated", raw.length);
  const maxPerArtist = mode === "familiar" ? 2 : 1;
  const taste = await albumTasteProfile(feedback);
  // Retém alternativas de uma mesma discografia até avaliar tags por álbum.
  const pool = diversify(dedupe(raw), {limit: CFG.results * CFG.resolvePoolFactor * 2, maxPerArtist: 3, penalty: .8});
  return resolveAlbumPool(pool, {maxPerArtist, penalty: .5}, feedback, taste);
}

async function runPersonalized() {
  if (busy) return;
  const previous = hasSectionResults("personalized") ? [...state.recommendations] : [];
  const wasResultsView = state.resultsView;
  busy = true;
  beginDiagnostics();
  let delivered = [];
  state.recommendations = [];
  discoveryFocusKey = null;
  render();
  try {
    const feedback = await parseFeedback();
    await getSpotifySavedAlbums();
    buildOwnedIndex();
    let results = await discoverPersonalized(feedback, new Set(state.personalizedSeen));
    delivered = results;
    if (results.length) {
      results = await enrichAlbums(results);
      remember(state.personalizedSeen, results);
    } else if (!apiIssues.size) notice("Nenhuma recomendação nova encontrada. Tente outro modo ou limpe o histórico.");
    const visible = results.filter(it => !isKnown(it));
    state.recommendations = visible.length ? visible : previous;
    state.recommendationSection = "personalized";
    state.resultsView = visible.length > 0 || (wasResultsView && previous.length > 0);
  } catch (e) {
    console.error(e);
    notice(e?.message || "Não foi possível gerar recomendações personalizadas.");
    state.recommendations = previous;
    state.resultsView = wasResultsView && previous.length > 0;
  } finally { finishDiagnostics(delivered); reportApiIssues(delivered.length); busy = false; saveState(); render(); }
}

function renderPersonalized() {
  const p = personalizedProfile();
  const panel = el("div", "c12-panel");
  panel.appendChild(el("div", "c12-panel-title", "Seu próximo álbum"));
  if (!CFG.lastfmKey) panel.appendChild(el("div", "c12-reason", "Configure sua chave Last.fm para habilitar a descoberta. Suas avaliações continuam disponíveis como base do perfil."));
  panel.appendChild(el("div", "c12-mode-desc", `${p.level} · ${p.rated.length} avaliações válidas · ${p.uniqueArtists} artistas avaliados · confiança estimada ${Math.round(p.confidence * 100)}%`));
  panel.appendChild(el("div", "c12-reason", p.rated.length < 5
    ? "Perfil inicial: usamos avaliações, curtidas, feedback e referências informadas."
    : "Avaliações, curtidas e feedback orientam o perfil; o Last.fm fornece relações e tags."));
  const modes = el("div", "c12-modes");
  for (const [mode, label, desc] of [
    ["familiar", "Familiar", "Uma extensão natural dos seus favoritos"],
    ["balanced", "Equilibrado", "Afinidade, artistas menos óbvios e alguma novidade"],
    ["explore", "Exploratório", "Gêneros diferentes, com variedade entre os resultados"]
  ]) {
    const b = el("button", "c12-mode" + (state.personalizedMode === mode ? " active" : ""));
    b.appendChild(el("div", "c12-mode-title", label));
    b.appendChild(el("div", "c12-mode-desc", desc));
    b.onclick = () => { state.personalizedMode = mode; saveState(); render(); };
    modes.appendChild(b);
  }
  panel.appendChild(modes);
  const label = el("div", "c12-input-label", "REFERÊNCIAS ADICIONAIS  ·  OPCIONAL");
  panel.appendChild(label);
  const seedInput = el("input", "", null, {type:"text", value:state.personalizedSeeds || "", placeholder:"Ex.: Radiohead; Tyler, the Creator; Portishead"});
  seedInput.className = "c12-seed-input";
  seedInput.onchange = () => { state.personalizedSeeds = seedInput.value; saveState(); };
  panel.appendChild(seedInput);
  const toolbar = el("div", "c12-toolbar");
  const go = el("button", "c12-btn", busy ? "Pesquisando..." : "Gerar recomendações", {disabled:busy});
  go.onclick = () => { state.personalizedSeeds = seedInput.value; saveState(); runPersonalized(); };
  toolbar.appendChild(go);
  if (hasSectionResults("personalized")) {
    const resume = el("button", "c12-btn secondary", "Ver resultados anteriores", {disabled:busy});
    resume.onclick = showResults;
    toolbar.appendChild(resume);
  }
  if (state.personalizedSeen.length) {
    const reset = el("button", "c12-btn secondary", "Limpar histórico de sugestões");
    reset.onclick = () => { state.personalizedSeen = []; saveState(); render(); };
    toolbar.appendChild(reset);
  }
  panel.appendChild(toolbar);
  appRoot.appendChild(panel);
}

/* ============================================================
   MANUAL — UI
   ============================================================ */
function mapSearchResult(type, item) {
  if (type === "artist") return { type, name: text(item?.name ?? item) };
  if (type === "album" || type === "track") return { type, artist: text(item?.artist), name: text(item?.name) };
  return { type: "tag", name: text(item?.name ?? item) };
}

/* V1.7: normaliza variantes, penaliza colaborações espúrias e prioriza
   correspondência textual. Preferências do Diário desempatarão artistas próximos,
   mas nunca ocultam resultados de uma pesquisa explícita. */
function manualSearchRank(type, item, query) {
  const q = norm(query), name = norm(item.name), artist = norm(item.artist);
  const label = type === "artist" ? name : `${name} ${artist}`;
  const similarity = name === q ? 130 : name.startsWith(q) ? 90 : name.includes(q) ? 55 : label.includes(q) ? 25 : 0;
  const collaborations = type === "artist" && name !== q && /[,;&]|\b(feat\.?|ft\.?|with| x )\b/i.test(item.name) ? -65 : 0;
  const catalog = catalogArtistStats().get(artist || name);
  const taste = catalog?.ratings?.length ? Math.max(-10, Math.min(15, (catalog.average - 5) * 2.5)) : 0;
  const listeners = Math.min(12, Math.log1p(Number(item.listeners || 0)) * 1.1);
  return similarity + collaborations + taste + listeners;
}
function cleanManualSearchResults(type, results, query) {
  const found = new Map();
  for (const raw of results) {
    const item = mapSearchResult(type, raw);
    if (!item.name || ((type === "album" || type === "track") && !item.artist)) continue;
    const key = referenceKey(item);
    const score = manualSearchRank(type, { ...item, listeners: raw?.listeners }, query);
    if (!found.has(key) || found.get(key).rank < score) found.set(key, { ...item, rank: score });
  }
  return [...found.values()].sort((a,b) => b.rank - a.rank).map(({rank,...item}) => item);
}
function manualPreferredType(refs) {
  const counts = { album: 0, track: 0, artist: 0, tag: 0 };
  for (const ref of refs) if (counts[ref.type] != null) counts[ref.type]++;
  // Tags dominantes não recebem cota: gêneros devem continuar variados.
  if (counts.tag >= Math.max(counts.album, counts.track, counts.artist)) return null;
  const others = ["album", "track", "artist"].sort((a,b) => counts[b]-counts[a]);
  return counts[others[0]] ? others[0] : null;
}
function manualTasteScore(candidate, feedback, stats) {
  const artist = norm(candidate.artist);
  const own = stats.get(artist);
  const rating = own?.ratings?.length ? Math.max(-18, Math.min(22, (own.average - 5.5) * 5)) : 0;
  const fb = Math.max(-25, Math.min(20, artistFeedbackScore(feedback, candidate.artist) * 2));
  return rating + fb;
}

async function runManualSearch(isRetry) {
  if (!state.manualSelected.length || busy) return;

  const previous = hasSectionResults("manual") ? [...state.recommendations] : [];
  const wasResultsView = state.resultsView;
  busy = true;
  beginDiagnostics();
  let delivered = [];
  state.recommendations = [];
  discoveryFocusKey = null;

  /* Pesquisa nova começa do zero; "Refazer" preserva o histórico. */
  if (!isRetry) state.manualSeen = [];

  render();

  try {
    await getSpotifySavedAlbums();
    buildOwnedIndex();

    const feedback = await parseFeedback();
    const results = await generateManual(state.manualSelected, feedback);
    delivered = results;

    if (!results.length) {
      if (!apiIssues.size) notice(isRetry
        ? "Não encontrei novidades sem repetir as anteriores. Tente outras referências."
        : "Não encontrei recomendações com os filtros atuais.");
      state.recommendations = previous;
      state.resultsView = wasResultsView && previous.length > 0;
    } else {
      const visible = (await enrichAlbums(results)).filter(it => !isKnown(it));
      state.recommendations = visible.length ? visible : previous;
      state.recommendationSection = "manual";
      state.resultsView = visible.length > 0 || (wasResultsView && previous.length > 0);
    }
  } catch (error) {
    console.error(error);
    notice(error?.message || "Não foi possível gerar recomendações.");
    state.recommendations = previous;
    state.resultsView = wasResultsView && previous.length > 0;
  } finally {
    finishDiagnostics(delivered);
    reportApiIssues(delivered.length);
    busy = false;
    saveState();
    render();
  }
}

function clearManual() {
  state.manualType = DEFAULT_STATE.manualType;
  state.manualQuery = "";
  state.manualResults = [];
  state.manualExpanded = false;
  state.manualSelected = [];
  state.manualSeen = [];
  state.manualFilters = { ...DEFAULT_FILTERS };
  state.recommendations = [];
  state.resultsView = false;
  discoveryFocusKey = null;
  saveState();
  render();
}

function renderManual() {
  const panel = el("div", "c12-panel");
  panel.appendChild(el("div", "c12-panel-title", "Pesquisa manual"));

  /* ---- busca ---- */
  const search = el("div", "c12-search");

  const select = el("select", "c12-search-type");
  for (const [value, label] of [
    ["artist", "👤 Artista"], ["album", "💿 Álbum"],
    ["track", "🎵 Música"], ["tag", "🏷️ Gênero / Tag"]
  ]) {
    select.appendChild(el("option", "", label, { value, selected: state.manualType === value }));
  }
  select.onchange = () => {
    state.manualType = select.value;
    state.manualQuery = "";
    state.manualResults = [];
    state.manualExpanded = false;
    saveState();
    render();
  };

  const input = el("input", "", null, {
    type: "text",
    placeholder: state.manualType === "tag" ? "Ex.: alternative hip hop" : "Digite uma referência...",
    value: state.manualQuery
  });
  input.oninput = () => { state.manualQuery = input.value; saveState(); };

  const searchBtn = el("button", "c12-btn", "Pesquisar");
  searchBtn.onclick = async () => {
    const query = state.manualQuery.trim();
    if (!query) return notice("Digite alguma coisa para pesquisar.");

    searchBtn.disabled = true;
    searchBtn.textContent = "Pesquisando...";

    apiIssues = new Set();
    try {
      const results = await lastfmSearch(state.manualType, query);
      state.manualResults = cleanManualSearchResults(state.manualType, results, query);
      state.manualExpanded = false;
      if (!state.manualResults.length && !apiIssues.size) notice("Nenhum resultado no Last.fm para essa busca.");
      reportApiIssues();
      saveState();
      render();
    } catch (error) {
      console.error(error);
      notice(error?.message || "Erro na pesquisa.");
      searchBtn.disabled = false;
      searchBtn.textContent = "Pesquisar";
    }
  };

  input.onkeydown = e => { if (e.key === "Enter") searchBtn.click(); };

  search.append(select, input, searchBtn);
  panel.appendChild(search);

  /* ---- filtros ---- */
  const filters = el("div", "c12-filters");

  const mkFilter = (prop, label) => {
    const wrap = el("label", "c12-filter");
    const box = el("input", "", null, { type: "checkbox", checked: !!state.manualFilters[prop] });
    box.onchange = () => { state.manualFilters[prop] = box.checked; saveState(); };
    wrap.appendChild(box);
    wrap.append(label);
    return wrap;
  };

  filters.appendChild(mkFilter("excludeCatalogArtists", "Excluir artistas já catalogados"));
  filters.appendChild(mkFilter("excludeCatalogAlbumTracks", "Excluir faixas de álbuns que você já tem"));
  panel.appendChild(filters);

  /* ---- resultados do Last.fm: lista editorial compacta ---- */
  if (state.manualResults.length) {
    const heading = el("div", "c12-search-heading");
    heading.appendChild(el("strong", "", "Resultados da pesquisa"));
    heading.appendChild(el("span", "", `${state.manualResults.length} encontrados`));
    panel.appendChild(heading);
    const results = el("div", "c12-search-results");
    const visible = state.manualExpanded ? state.manualResults : state.manualResults.slice(0, 8);
    for (const item of visible) {
      const selected = isReferenceSelected(item);
      const row = el("button", "c12-search-result" + (selected ? " selected" : ""));
      row.type = "button";
      const ico = el("span", "c12-search-result-icon", item.type === "artist" ? "♟" : item.type === "album" ? "▣" : item.type === "track" ? "♫" : "#");
      const copy = el("span", "c12-search-result-copy");
      copy.appendChild(el("strong", "", item.name));
      copy.appendChild(el("small", "", item.type === "artist" ? "Artista" : item.type === "album" ? `Álbum · ${item.artist}` : item.type === "track" ? `Música · ${item.artist}` : "Gênero / tag"));
      row.append(ico, copy, el("span", "c12-search-result-check", selected ? "✓" : "+"));
      row.onclick = () => {
        if (isReferenceSelected(item)) state.manualSelected = state.manualSelected.filter(s => referenceKey(s) !== referenceKey(item));
        else state.manualSelected.push(item);
        saveState(); render();
      };
      results.appendChild(row);
    }
    panel.appendChild(results);
    if (state.manualResults.length > 8) {
      const more = el("button", "c12-btn secondary c12-more", state.manualExpanded ? "Mostrar menos" : `Mostrar mais ${state.manualResults.length - 8} resultados`);
      more.onclick = () => { state.manualExpanded = !state.manualExpanded; saveState(); render(); };
      panel.appendChild(more);
    }
    panel.appendChild(el("div", "c12-hint", "Selecione uma ou mais referências para gerar recomendações."));
  }

  /* ---- referências escolhidas ---- */
  if (state.manualSelected.length) {
    const selected = el("div", "c12-selected");

    for (const item of state.manualSelected) {
      const chip = el("div", "c12-chip");
      chip.appendChild(el("span", "", referenceLabel(item)));

      const remove = el("button", "", "×");
      remove.onclick = e => {
        e.stopPropagation();
        state.manualSelected = state.manualSelected.filter(s => referenceKey(s) !== referenceKey(item));
        saveState();
        render();
      };

      chip.appendChild(remove);
      selected.appendChild(chip);
    }

    panel.appendChild(selected);
  }

  /* ---- controles ---- */
  const controls = el("div", "c12-toolbar");

  const clear = el("button", "c12-btn secondary", "🧹 Limpar pesquisa e filtros");
  clear.onclick = clearManual;
  controls.appendChild(clear);

  if (state.manualSelected.length) {
    const find = el("button", "c12-btn", busy ? "Pesquisando..." : "🔎 Encontrar recomendações", { disabled: busy });
    find.onclick = () => runManualSearch(false);
    controls.appendChild(find);

    if (hasSectionResults("manual")) {
      const resume = el("button", "c12-btn secondary", "Ver resultados anteriores", {disabled:busy});
      resume.onclick = showResults;
      controls.appendChild(resume);
    }

    if (state.manualSeen.length) {
      const again = el("button", "c12-btn secondary", "↻ Refazer pesquisa", { disabled: busy });
      again.onclick = () => runManualSearch(true);
      controls.appendChild(again);
    }
  }

  panel.appendChild(controls);
  appRoot.appendChild(panel);

}

/* ============================================================
   RECOMENDAÇÕES — UI
   ============================================================ */
function renderRecommendations() {
  const stage = el("div", "c12-stage-top");
  const copy = el("div", "c12-stage-copy");
  copy.appendChild(el("div", "c12-stage-kicker", state.section === "manual" ? "Pesquisa manual" : "Descoberta automática"));
  copy.appendChild(el("div", "c12-stage-title", "Suas descobertas"));
  const count = state.recommendations?.filter(it => !isKnown(it)).length || 0;
  copy.appendChild(el("div", "c12-stage-detail", busy ? "Preparando outra seleção…" : `${count} descoberta${count === 1 ? "" : "s"} · seus ajustes foram preservados`));
  stage.appendChild(copy);
  const stageActions = el("div", "c12-stage-actions");
  const settings = el("button", "c12-btn secondary", "← Voltar às configurações", {disabled:busy});
  settings.onclick = showSettings;
  stageActions.appendChild(settings);
  if (!busy && count) {
    const another = el("button", "c12-btn", "↻ Novas descobertas");
    another.onclick = () => state.section === "manual" ? runManualSearch(true) : runPersonalized();
    stageActions.appendChild(another);
    const clear = el("button", "c12-btn secondary", "Limpar resultados");
    clear.onclick = () => {
      state.recommendations = [];
      state.resultsView = false;
      discoveryFocusKey = null;
      saveState(); render();
    };
    stageActions.appendChild(clear);
  }
  stage.appendChild(stageActions);
  appRoot.appendChild(stage);

  if (busy) {
    appRoot.appendChild(el("div", "c12-loading c12-stage-loading", "Buscando novas descobertas…"));
    return;
  }
  if (!hasSectionResults()) return;
  const visible = state.recommendations.filter(it => !isKnown(it));
  if (!visible.length) {
    appRoot.appendChild(el("div", "c12-empty", "Todas as descobertas foram marcadas como conhecidas. Volte às configurações para pesquisar novamente."));
    return;
  }
  const focusIndex = discoveryFocusKey == null ? -1 : visible.findIndex(it => candidateKey(it) === discoveryFocusKey);
  const focused = focusIndex >= 0;
  if (!focused) discoveryFocusKey = null;

  const heading = el("div", "c12-section-heading");
  heading.appendChild(el("div", "c12-panel-title", focused ? "Explorar descoberta" : "Seleção para você"));
  heading.appendChild(el("div", "c12-result-count", focused ? `${focusIndex + 1} de ${visible.length}` : `${visible.length} descobertas`));
  appRoot.appendChild(heading);

  if (focused) {
    const toolbar = el("div", "c12-toolbar");
    toolbar.style.marginTop = "0";
    const back = el("button", "c12-btn secondary", "← Voltar à grade");
    back.onclick = () => { discoveryFocusKey = null; render(); };
    toolbar.appendChild(back);
    appRoot.appendChild(toolbar);
  }

  if (focused) {
    const focus = el("div", "c12-focus");
    focus.appendChild(renderCard(visible[focusIndex]));
    const nav = el("div", "c12-focus-nav");
    const prev = el("button", "c12-btn secondary", "← Anterior", {disabled:focusIndex === 0});
    const next = el("button", "c12-btn", "Próxima →", {disabled:focusIndex === visible.length - 1});
    prev.onclick = () => { discoveryFocusKey = candidateKey(visible[focusIndex - 1]); render(); };
    next.onclick = () => { discoveryFocusKey = candidateKey(visible[focusIndex + 1]); render(); };
    nav.append(prev, next);
    focus.appendChild(nav);
    appRoot.appendChild(focus);
    return;
  }

  const gallery = el("div", "c12-gallery");
  visible.forEach((item, index) => {
    const card = el("button", "c12-gallery-card");
    card.type = "button";
    card.setAttribute("aria-label", `Explorar ${item.type === "track" ? item.track : item.type === "album" ? item.album : item.artist}`);
    const cover = item.image
      ? el("img", "c12-gallery-cover", null, {src:item.image, loading:"lazy", alt:""})
      : el("div", "c12-gallery-cover c12-gallery-placeholder", item.type === "artist" ? "👤" : "💿");
    if (item.image) cover.onerror = () => cover.replaceWith(el("div", "c12-gallery-cover c12-gallery-placeholder", "💿"));
    card.appendChild(cover);
    const info = el("div", "c12-gallery-info");
    info.appendChild(el("div", "c12-gallery-type", item.type === "artist" ? "ARTISTA" : item.type === "track" ? "MÚSICA" : "ÁLBUM"));
    info.appendChild(el("div", "c12-gallery-title", item.type === "track" ? item.track : item.type === "album" ? item.album : item.artist));
    if (item.type !== "artist") info.appendChild(el("div", "c12-gallery-artist", item.artist || ""));
    card.appendChild(info);
    card.onclick = () => { discoveryFocusKey = candidateKey(item); render(); };
    card.style.animationDelay = `${Math.min(index, 8) * 25}ms`;
    gallery.appendChild(card);
  });
  appRoot.appendChild(gallery);
}

function renderLiked() {
  const panel = el("div", "c12-liked-panel");
  panel.appendChild(el("div", "c12-liked-heading", "Curtidos"));
  panel.appendChild(el("div", "c12-subtitle", "Guarde o que chamou sua atenção. Sem fila, sem compromisso."));
  if (!likedReady) {
    panel.appendChild(el("div", "c12-empty", "Não foi possível carregar a coleção."));
  } else {
    const tabs = el("div", "c12-liked-tabs");
    const labels = { album: "Álbuns", artist: "Artistas", track: "Músicas" };
    if (!LIKED_TYPES.includes(state.likedCategory)) state.likedCategory = "album";
    for (const type of LIKED_TYPES) {
      const count = likedAlbums.filter(a => a.type === type).length;
      const btn = el("button", "c12-liked-tab" + (state.likedCategory === type ? " active" : ""), `${labels[type]} · ${count}`);
      btn.onclick = () => { state.likedCategory = type; saveState(); render(); };
      tabs.appendChild(btn);
    }
    panel.appendChild(tabs);
    const search = el("input", "c12-liked-search", null, { type: "search", placeholder: "Filtrar nesta categoria..." });
    const list = el("div", "c12-liked-grid");
    const draw = () => {
      list.replaceChildren();
      const query = norm(search.value);
      const items = [...likedAlbums].reverse().filter(a => a.type === state.likedCategory && norm(`${a.artist} ${a.album || ""} ${a.track || ""}`).includes(query));
      if (!items.length) list.appendChild(el("div", "c12-empty", query ? "Nenhum resultado para esse filtro." : `Nenhum item salvo em ${labels[state.likedCategory].toLowerCase()} ainda.`));
      for (const item of items) list.appendChild(renderCard(item, true));
    };
    search.oninput = draw;
    panel.appendChild(search);
    panel.appendChild(list);
    draw();
  }
  appRoot.appendChild(panel);
}

function renderKnown() {
  const panel = el("div", "c12-liked-panel");
  panel.appendChild(el("div", "c12-liked-heading", "Já conheço"));
  panel.appendChild(el("div", "c12-subtitle", "Itens familiares não aparecem novamente nas recomendações. Isso não bloqueia artistas, álbuns ou músicas semelhantes. Nenhuma nota é catalogada."));
  const tabs = el("div", "c12-liked-tabs");
  const labels = { album: "Álbuns", artist: "Artistas", track: "Músicas" };
  for (const type of LIKED_TYPES) {
    const count = state.knownItems.filter(item => item.type === type).length;
    const btn = el("button", "c12-liked-tab" + (state.knownCategory === type ? " active" : ""), `${labels[type]} · ${count}`);
    btn.onclick = () => { state.knownCategory = type; saveState(); render(); };
    tabs.appendChild(btn);
  }
  panel.appendChild(tabs);
  const search = el("input", "c12-liked-search", null, {type:"search", placeholder:"Filtrar itens conhecidos..."});
  const results = el("div", "c12-liked-grid");
  const draw = () => {
    results.replaceChildren();
    const query = norm(search.value);
    const items = [...state.knownItems].reverse().filter(item => item.type === state.knownCategory && norm(`${item.artist} ${item.album || ""} ${item.track || ""}`).includes(query));
    if (!items.length) results.appendChild(el("div", "c12-empty", query ? "Nenhum item encontrado." : "Nenhum item marcado nesta categoria."));
    for (const item of items) {
      const card = renderCard(item, true);
      const body = card.querySelector(".c12-body");
      const btn = el("button", "c12-btn secondary", "Desfazer Já Conheço");
      btn.onclick = () => unmarkKnown(item);
      const row = el("div", "c12-actions");
      row.appendChild(btn);
      body.appendChild(row);
      results.appendChild(card);
    }
  };
  search.oninput = draw;
  panel.appendChild(search);
  panel.appendChild(results);
  draw();
  appRoot.appendChild(panel);
}

function renderCard(item, fromLiked = false) {
  const card = el("div", "c12-card");

  /* capa (sempre ocupa o espaço, para o layout não pular) */
  if (item.image) {
    const cover = el("img", "c12-cover", null, {
      src: item.image,
      loading: "lazy",
      alt: (item.type === "track" ? item.track : item.type === "album" ? item.album : item.artist) || ""
    });
    cover.onerror = () => cover.replaceWith(el("div", "c12-cover", item.type === "artist" ? "👤" : "💿"));
    card.appendChild(cover);
  } else {
    card.appendChild(el("div", "c12-cover", item.type === "artist" ? "👤" : "💿"));
  }

  const body = el("div", "c12-body");

  const title = item.type === "album" ? item.album
    : item.type === "track" ? item.track
    : item.artist;

  body.appendChild(el("div", "c12-card-title", title));

  if (item.type !== "artist" && item.artist) {
    body.appendChild(el("div", "c12-card-artist", item.artist));
  }

  const meta = el("div", "c12-meta");
  const badge = v => { if (v) meta.appendChild(el("span", "c12-badge", String(v))); };

  badge(item.genre);
  badge(item.year);
  if (item.durationMinutes) badge(`${item.durationMinutes} min`);
  if (item.totalTracks) badge(`${item.totalTracks} faixas`);
  if (item.type === "track" && item.album) badge(`em ${item.album}`);
  if (meta.children.length) body.appendChild(meta);

  if (item.reason) body.appendChild(el("div", "c12-reason", item.reason));

  /* ações do Spotify */
  const actions = el("div", "c12-actions");

  if (item.spotifyUrl || item.spotifyUri) {
    const open = el("button", "c12-btn secondary", "Abrir no Spotify ↗");
    open.title = item.type === "track" ? "Abrir a página desta faixa (reprodução automática depende do Spotify)" : "Abrir no Spotify";
    open.onclick = e => { e.stopPropagation(); openSpotify(item); };
    actions.appendChild(open);
  }

  if (item.type === "album" && item.spotifyId) {
    const save = el("button", "c12-btn", "Salvar no Spotify");
    save.onclick = async e => {
      e.stopPropagation();
      save.disabled = true;
      try {
        await spotifySaveAlbum(item);
        save.textContent = "✓ Salvo";
      } catch (error) {
        console.error(error);
        notice(error?.message || "Não foi possível salvar no Spotify.");
        save.disabled = false;
      }
    };
    actions.appendChild(save);
  }

  if (actions.children.length) body.appendChild(actions);

  /* Curtidos: apenas o coração altera a coleção; feedback não salva itens. */
  if (LIKED_TYPES.includes(item.type)) {
    const heart = el("button", "c12-btn secondary c12-heart" + (isLiked(item) ? " active" : ""), isLiked(item) ? "♥ Curtido" : "♡ Curtir");
    heart.disabled = !likedReady;
    heart.onclick = async e => {
      e.stopPropagation();
      heart.disabled = true;
      try { await toggleLiked(item); }
      catch (error) { console.error(error); notice("Não foi possível atualizar Curtidos."); heart.disabled = false; }
    };
    actions.appendChild(heart);
    if (!actions.parentNode) body.appendChild(actions);
  }

  if (fromLiked) {
    card.appendChild(body);
    return card;
  }

  /* Familiaridade: não cria nota, não altera Curtidos ou feedback. */
  if (LIKED_TYPES.includes(item.type) && !isKnown(item)) {
    const known = el("button", "c12-btn secondary", "✓ Já conheço");
    known.title = "Não recomendar este item novamente, mas continuar sugerindo semelhantes";
    known.onclick = e => { e.stopPropagation(); markKnown(item); };
    actions.appendChild(known);
    if (!actions.parentNode) body.appendChild(actions);
  }

  /* feedback */
  const fb = el("div", "c12-feedback");

  for (const [label, action] of [
    ["Interessante", "interesting"], ["Talvez", "maybe"],
    ["Não gostei", "dislike"], ["Bloquear", "block"]
  ]) {
    const b = el("button", "c12-btn secondary", label);
    b.onclick = async e => {
      e.stopPropagation();
      if (b.disabled) return;
      b.disabled = true;
      try {
        await appendFeedback(item, action);
      } catch (error) {
        console.error(error);
        notice("Não foi possível salvar o feedback.");
        b.disabled = false;
      }
    };
    fb.appendChild(b);
  }

  body.appendChild(fb);
  card.appendChild(body);
  return card;
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
render();
await loadLiked();
```