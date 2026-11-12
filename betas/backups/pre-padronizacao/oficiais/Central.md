```dataviewjs
/* ============================================================
   CENTRAL DE DESCOBERTA MUSICAL — V1.8 (EDITORIAL · EXPLORAÇÃO REVISADA)

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
  root: "Musicas",
  central: "Musicas/Central",
  feedback: "Musicas/Central/Feedback.md",
  likedPath: "Musicas/Sistema/NoteToNote-Curtidos.json",

  lastfmKey: "",
  lastfmUser: "",
  lastfmURL: "https://ws.audioscrobbler.com/2.0/",

  stateKey: "central-descoberta-v12",

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
  recommendations: []
};

function loadState() {
  try {
    const raw = localStorage.getItem(CFG.stateKey);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    const s = { ...structuredClone(DEFAULT_STATE), ...p };
    s.manualFilters = { ...DEFAULT_FILTERS, ...(p.manualFilters || {}) };
    if (s.section === "automatic") s.section = "personalized";
    if (!["manual", "personalized", "liked", "known"].includes(s.section)) s.section = "personalized";
    if (s.recommendationSection === "automatic") s.recommendationSection = "personalized";
    if (Array.isArray(p.autoSeen) && p.autoSeen.length) s.personalizedSeen = [...new Set([...(Array.isArray(p.personalizedSeen) ? p.personalizedSeen : []), ...p.autoSeen])].slice(-CFG.seenLimit);
    if (!s.recommendationSection && s.recommendations.length) s.recommendationSection = s.section;
    if (!["familiar", "balanced", "explore"].includes(s.personalizedMode)) s.personalizedMode = "balanced";
    for (const k of ["manualResults", "manualSelected", "manualSeen", "personalizedSeen", "recommendations"]) {
      if (!Array.isArray(s[k])) s[k] = [];
    }
    s.knownItems = Array.isArray(p.knownItems) ? p.knownItems.filter(i => i && ["album", "artist", "track"].includes(i.type) && typeof i.artist === "string" && i.artist.trim() && (i.type === "artist" || (i.type === "album" ? typeof i.album === "string" && i.album.trim() : typeof i.track === "string" && i.track.trim()))).slice(-5000) : [];
    if (!["album", "artist", "track"].includes(s.knownCategory)) s.knownCategory = "album";
    return s;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

let state = loadState();

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
      catch (e) { console.error(e); results[i] = null; }
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
    if (!old || (item.discoveryScore || item.score || 0) > (old.discoveryScore || old.score || 0)) {
      map.set(k, item);
    }
  }
  return [...map.values()];
}

function remember(target, items) {
  for (const item of items) {
    const k = candidateKey(item);
    if (k && !target.includes(k)) target.push(k);
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
  notice(`Marcado como já conhecido: ${item.album || item.track || item.artist}`);
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
const lastfmCache = new Map();
async function lastfm(method, params = {}) {
  if (!CFG.lastfmKey) throw new Error("Configure sua chave do Last.fm na Central de Configurações.");
  const query = new URLSearchParams({ method, api_key: CFG.lastfmKey, format: "json", ...params });
  const cacheKey = query.toString();
  const cached = lastfmCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CFG.cacheTTL) return cached.promise;
  if (cached) lastfmCache.delete(cacheKey);
  const request = (async () => {
    const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(15000) : undefined;
    const response = await fetch(`${CFG.lastfmURL}?${query}`, signal ? { signal } : {});
    if (!response.ok) throw new Error(`Last.fm HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.message || "Erro do Last.fm.");
    await sleep(CFG.lastfmDelay);
    return data;
  })();
  lastfmCache.set(cacheKey, { at: Date.now(), promise: request });
  if (lastfmCache.size > CFG.cacheMax) lastfmCache.delete(lastfmCache.keys().next().value);
  try { return await request; }
  catch (error) { lastfmCache.delete(cacheKey); throw error; }
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
  if (!sdk) return {};
  try {
    try {
      return (await sdk.search(query, types)) || {};
    } catch {
      return (await sdk.search(query, Array.isArray(types) ? types[0] : types)) || {};
    }
  } catch (e) {
    console.error("Spotify search:", e);
    return {};
  }
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
      const items = body?.items || [];
      if (!items.length) break;
      for (const entry of items) if (entry?.album) albums.push(entry.album);
      if (items.length < limit) break;
      offset += limit;
      if (offset > 5000) break;
    }
    SPOTIFY_SAVED_ALBUMS = albums;
    return albums;
  } catch (e) {
    console.error("Spotify biblioteca:", e);
    throw new Error("Não foi possível ler sua biblioteca do Spotify.");
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
    result.push({ path, title, artists, rating: Number.isFinite(rating) ? rating : 0 });
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
  const albums = new Map(), artists = new Map(), tracks = new Map();
  const blockedArtists = new Set();
  if (!file) return { albums, artists, tracks, blockedArtists };
  const raw = await app.vault.read(file);
  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.includes("feedback:")) continue;
    const fields = {};
    for (const part of line.split("|")) {
      const match = part.trim().match(/(?:^|\s)(feedback|action|artist|album|track|type|source|mode):\s*(.*)$/i);
      if (match) fields[match[1].toLowerCase()] = match[2].trim();
    }
    const artist = fields.artist || "";
    const album = fields.album || "";
    const track = fields.track || "";
    const action = (fields.action || fields.feedback || "").toLowerCase();
    const type = fields.type || (track ? "track" : album ? "album" : "artist");
    if (!artist || !action) continue;
    const weight = FEEDBACK_WEIGHTS[action] || 0;
    const artistId = norm(artist);
    if (!artists.has(artistId)) artists.set(artistId, { artist, score: 0 });
    artists.get(artistId).score += weight;
    if (type === "artist") {
      if (action === "block") blockedArtists.add(artistId);
      else if (action === "interesting" || action === "maybe") blockedArtists.delete(artistId);
    }
    if (type === "album" && album) {
      const key = feedbackKey(artist, album);
      if (!albums.has(key)) albums.set(key, { artist, album, score: 0, actions: [] });
      albums.get(key).score += weight;
      albums.get(key).actions.push(action);
    }
    if (type === "track" && track) {
      const key = trackKey(artist, track);
      if (!tracks.has(key)) tracks.set(key, { artist, track, score: 0, actions: [] });
      tracks.get(key).score += weight;
      tracks.get(key).actions.push(action);
    }
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
      const s = base * Math.pow(penalty, c) * Math.pow(typePenalty, byType.get(it.type) || 0);

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
  if (spotifyAlbumCache.has(ck)) return spotifyAlbumCache.get(ck);

  const results = await spotifySearchAlbums(`"${album}" "${artist}"`);

  const valid = results
    .filter(isValidSpotifyAlbum)
    .map(item => {
      let score = 0;
      const wanted = norm(album);
      const got = norm(item.name);

      if (got === wanted) score += 120;
      else if (got.includes(wanted) || wanted.includes(got)) score += 60;

      if (spotifyArtistMatches(item, artist)) score += 80;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  let resolved = null;

  if (valid.length && valid[0].score >= 100) {
    const item = valid[0].item;
    resolved = {
      type: "album",
      artist,
      artists: list(item.artists).map(a => text(a?.name)).filter(Boolean),
      album: item.name,
      spotifyId: item.id,
      spotifyUri: item.uri || `spotify:album:${item.id}`,
      spotifyUrl: item.external_urls?.spotify || `https://open.spotify.com/album/${item.id}`,
      image: item.images?.[1]?.url || item.images?.[0]?.url || "",
      totalTracks: Number(item.total_tracks || 0),
      releaseDate: item.release_date || ""
    };
  }

  spotifyAlbumCache.set(ck, resolved);
  return resolved;
}

async function resolveSpotifyTrack(artist, track) {
  const results = await spotifySearchTracks(`"${track}" "${artist}"`);

  const valid = results.filter(item =>
    item?.id && item?.name &&
    list(item?.artists).some(a => norm(a?.name) === norm(artist))
  );

  if (!valid.length) return null;
  const item = valid[0];
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
async function resolveAlbumPool(pool, divOpts) {
  const resolved = await parallel(pool, async c => {
    const sp = await resolveSpotifyAlbum(c.artist, c.album);
    if (!sp) return null;
    if (ownedSpotifyAlbum(sp) || ownedAlbum(c.artist, c.album) || isKnown(c) || isKnown(sp)) return null;
    return { ...c, ...sp, lastfmAlbum: c.album };
  });

  const seenIds = new Set();
  const unique = [];
  for (const r of resolved) {
    if (!r || seenIds.has(r.spotifyId)) continue;
    seenIds.add(r.spotifyId);
    unique.push(r);
  }

  return diversify(unique, { ...divOpts, limit: CFG.results });
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
  const sample = LIBRARY.slice().sort((a, b) => b.rating - a.rating).slice(0, 15);
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

async function manualFromTrack(artist, track) {
  const results = [];
  const similar = await similarTracks(artist, track);

  for (const rel of similar) {
    results.push({
      type: "track", artist: rel.artist, track: rel.name, name: rel.name,
      score: rel.match * 100, reason: `Música relacionada a ${artist} — ${track}`
    });
  }

  for (const name of [...new Set(similar.map(x => x.artist))].slice(0, 12)) {
    results.push({
      type: "artist", artist: name, name,
      score: 40, reason: `Artista relacionado à música ${track}`
    });
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
  if (isKnown(c)) return false;
  if (feedback.blockedArtists?.has(norm(c.artist))) return false;
  if (c.type === "track" && feedbackTrackState(feedback, c.artist, c.track)) return false;
  if (state.manualFilters.excludeCatalogArtists && catalogContainsArtist(c.artist)) return false;
  if (seen.has(candidateKey(c))) return false;

  if (c.type === "album") {
    if (ownedAlbum(c.artist, c.album)) return false;
    const fb = feedbackAlbumState(feedback, c.artist, c.album);
    if (fb === "block" || fb === "dislike") return false;
  }
  return true;
}

async function resolveManualCandidate(c) {
  if (c.type === "artist") {
    const a = await resolveSpotifyArtist(c.artist);
    return a && !isKnown(a) ? { ...a, discoveryScore: c._s, reason: c.reason } : null;
  }

  if (c.type === "album") {
    const sp = await resolveSpotifyAlbum(c.artist, c.album);
    if (!sp) return null;
    if (ownedSpotifyAlbum(sp) || ownedAlbum(c.artist, c.album)) return null;
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

  const resolved = await parallel(candidates, resolveManualCandidate);

  let final = resolved.filter(Boolean).filter(it => {
    const names = it.artists || [it.artist];
    if (state.manualFilters.excludeCatalogArtists && names.some(catalogContainsArtist)) return false;
    return !seen.has(candidateKey(it)) && !isKnown(it);
  });

  final = dedupe(final);

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
async function appendFeedback(item, action) {
  let file = app.vault.getAbstractFileByPath(CFG.feedback);

  if (!file) {
    const parent = CFG.feedback.split("/").slice(0, -1);
    let current = "";
    for (const part of parent) {
      current = current ? `${current}/${part}` : part;
      if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
    }
    await app.vault.create(CFG.feedback, "# Feedback da Central\n\n");
    file = app.vault.getAbstractFileByPath(CFG.feedback);
  }

  const date = new Date().toLocaleDateString("pt-BR");
  const artist = String(item.artist || "").replace(/[|\r\n]/g, " ").trim();
  const album = String(item.type === "album" ? item.album || "" : "").replace(/[|\r\n]/g, " ").trim();
  const track = String(item.type === "track" ? item.track || "" : "").replace(/[|\r\n]/g, " ").trim();
  const mode = state.section === "personalized" ? state.personalizedMode : "";

  const line = `- ${date} | feedback: ${action} | type: ${item.type || "album"} | artist: ${artist} | album: ${album} | track: ${track} | source: ${state.section} | mode: ${mode}\n`;

  await app.vault.modify(file, (await app.vault.read(file)) + line);
  notice(`Feedback registrado: ${action}`);
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

function openSpotify(item) {
  const uri = item.spotifyUri;
  const url = item.spotifyUrl;

  if (uri) {
    let left = false;
    const onBlur = () => { left = true; };
    window.addEventListener("blur", onBlur, { once: true });

    const a = el("a", "", null, { href: uri });
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    /* Só abre a versão web se o aplicativo não tomou o foco. */
    setTimeout(() => {
      window.removeEventListener("blur", onBlur);
      if (!left && !document.hidden && url) window.open(url, "_blank");
    }, 900);
    return;
  }

  if (url) window.open(url, "_blank");
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
function render() {
  while (appRoot.children.length > 1) appRoot.removeChild(appRoot.lastChild);

  const tabs = el("div", "c12-tabs");

  const mkTab = (label, section) => {
    const b = el("button", "c12-tab" + (state.section === section ? " active" : ""), label);
    b.onclick = () => { state.section = section; saveState(); render(); };
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

async function personalizedSeeds(feedback) {
  const profile = personalizedProfile();
  const byArtist = new Map();
  const add = (artist, weight, origin) => {
    const key = norm(artist);
    if (!key || !Number.isFinite(weight) || weight <= 0) return;
    const existing = byArtist.get(key);
    if (!existing || existing.weight < weight) byArtist.set(key, { artist, weight, origin });
  };
  // Notas têm prioridade; notas baixas não viram sementes positivas.
  for (const item of profile.rated) {
    const positive = Math.max(0, (item.rating - 5.5) / 4.5);
    if (positive > 0) for (const artist of item.artists) add(artist, 2 + positive * 8, "avaliações");
  }
  // Last.fm complementa perfis pequenos. Username é opcional.
  if (profile.confidence < .85 && CFG.lastfmUser && CFG.lastfmKey) {
    try {
      const data = await lastfm("user.getTopArtists", { user: CFG.lastfmUser, period: "6month", limit: 25 });
      for (const artist of list(data?.topartists?.artist)) {
        const plays = Number(artist?.playcount || 0);
        add(text(artist?.name), Math.min(5, 1 + Math.log1p(Math.max(0, plays))) * (1 - .75 * profile.confidence), "Last.fm");
      }
    } catch (e) { console.warn("Central: não foi possível complementar perfil pelo Last.fm", e); }
  }
  // Calibração opcional, sem criar avaliações fictícias.
  for (const artist of String(state.personalizedSeeds || "").split(/[;\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 12)) {
    add(artist, profile.rated.length ? 5 : 8, "preferências informadas");
  }
  // Sem username Last.fm, os artistas catalogados ajudam no início.
  if (profile.rated.length < 5) {
    for (const e of catalogArtistStats().values()) add(e.artist, 1.5, "catálogo");
  }
  // Feedback negativo reduz o peso, mas não altera avaliações pessoais.
  for (const [key, entry] of byArtist) {
    const penalty = Math.max(-8, Math.min(8, artistFeedbackScore(feedback, entry.artist)));
    entry.weight = Math.max(0, entry.weight + penalty * 0.6);
    if (entry.weight <= 0) byArtist.delete(key);
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
  const libraryTags = await getLibraryTags();
  // Penaliza famílias já representadas no acervo; não as proíbe para sempre.
  const families = EXPLORATION_FAMILIES.map(([family, ...tags]) => ({
    family, tags,
    presence: tags.reduce((sum, tag) => sum + (libraryTags.get(norm(tag)) || 0), 0)
  }));
  const rare = families.filter(f => f.presence === 0);
  const other = families.filter(f => f.presence !== 0).sort((a,b) => a.presence-b.presence);
  // Cada rodada usa até oito famílias diferentes, sem depender de artistas similares.
  const chosen = [...shuffle(rare), ...shuffle(other)].slice(0, 8);
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
      if (ownedAlbum(album.artist, album.album) || isKnown({type:"album", artist:album.artist, album:album.album})) continue;
      if (feedback.blockedArtists?.has(norm(album.artist))) continue;
      const fb = feedbackAlbumState(feedback, album.artist, album.album);
      if (fb === "block" || fb === "dislike") continue;
      const c = {
        type:"album", artist:album.artist, album:album.album,
        genreFamily:f.family, discoveryScore:30 - f.presence * 3,
        reason:`Exploração de ${result.tag}: um estilo pouco presente no seu acervo`,
        mode:"explore"
      };
      if (!seen.has(candidateKey(c))) candidates.push(c);
    }
    groups.push({family:f.family, candidates:dedupe(candidates).slice(0, 8)});
  });
  // Resolve alternativas de cada família; só depois escolhe o resultado final.
  const resolved = await parallel(groups, async g => {
    const items = await parallel(g.candidates, async c => {
      const sp = await resolveSpotifyAlbum(c.artist, c.album);
      if (!sp || ownedSpotifyAlbum(sp) || ownedAlbum(c.artist, c.album) || isKnown(c) || isKnown(sp)) return null;
      return {...c, ...sp, lastfmAlbum:c.album};
    });
    return {family:g.family, items:items.filter(Boolean)};
  });
  const output = [], ids = new Set(), artists = new Set();
  // Primeira passagem: no máximo UM álbum por família e artista.
  for (const group of shuffle(resolved.filter(Boolean))) {
    const pick = group.items.find(c => !ids.has(c.spotifyId) && !artists.has(norm(c.artist)));
    if (!pick) continue;
    output.push(pick); ids.add(pick.spotifyId); artists.add(norm(pick.artist));
    if (output.length >= CFG.results) break;
  }
  // Se menos famílias estiverem disponíveis, preenche sem duplicar álbuns/artistas.
  if (output.length < CFG.results) {
    for (const group of shuffle(resolved.filter(Boolean))) {
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
  if (!seeds.length && mode !== "explore") throw new Error("Para começar, informe alguns artistas favoritos abaixo ou conecte seu Last.fm nas Configurações.");
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
    c.score *= 1 + Math.min(0.45, Math.max(0, bridges - 1) * .15);
  }
  const artists = [...candidates.values()].sort((a,b)=>b.score-a.score).slice(0, CFG.maxDiscoveryArtists);
  const lists = await parallel(artists, a => topAlbums(a.artist));
  const raw = [];
  artists.forEach((a,i) => {
    const best = [...a.via].sort((x,y)=>y.score-x.score)[0];
    for (const album of lists[i] || []) {
      if (feedback.blockedArtists?.has(norm(album.artist))) continue;
      if (invalidAlbum(album.album) || ownedAlbum(album.artist, album.album) || isKnown({type:"album", artist:album.artist, album:album.album})) continue;
      const fb = feedbackAlbumState(feedback, album.artist, album.album);
      if (fb === "block" || fb === "dislike") continue;
      const candidate = {
        type: "album", artist: album.artist, album: album.album, known: a.known,
        discoveryScore: a.score + Math.max(0, 16-album.rank) * .45,
        reason: `Afinidade com ${best?.artist || "seu perfil"} (${best?.origin || "descoberta"})` + (profile.rated.length < 5 ? " · perfil inicial" : ""),
        mode: "personalized"
      };
      if (!seen.has(candidateKey(candidate)) && !isKnown(candidate)) raw.push(candidate);
    }
  });
  // Equilibrado mantém artistas novos, inclusive dentro de gêneros conhecidos.
  // Exploratório é tratado separadamente: diversidade REAL de gêneros.
  const maxPerArtist = mode === "explore" ? 1 : 2;
  const pool = diversify(dedupe(raw), {limit: CFG.results * CFG.resolvePoolFactor, maxPerArtist, penalty: .5});
  return resolveAlbumPool(pool, {maxPerArtist, penalty: .5});
}

async function runPersonalized() {
  if (busy) return;
  busy = true;
  state.recommendations = [];
  render();
  try {
    const feedback = await parseFeedback();
    await getSpotifySavedAlbums();
    buildOwnedIndex();
    let results = await discoverPersonalized(feedback, new Set(state.personalizedSeen));
    if (results.length) {
      results = await enrichAlbums(results);
      remember(state.personalizedSeen, results);
    } else notice("Nenhuma recomendação nova encontrada. Tente outro modo ou limpe o histórico.");
    state.recommendations = results.filter(it => !isKnown(it));
    state.recommendationSection = "personalized";
  } catch (e) {
    console.error(e);
    notice(e?.message || "Não foi possível gerar recomendações personalizadas.");
  } finally { busy = false; saveState(); render(); }
}

function renderPersonalized() {
  const p = personalizedProfile();
  const panel = el("div", "c12-panel");
  panel.appendChild(el("div", "c12-panel-title", "Seu próximo álbum"));
  if (!CFG.lastfmKey) panel.appendChild(el("div", "c12-reason", "Configure sua chave Last.fm para habilitar a descoberta. Suas avaliações continuam disponíveis como base do perfil."));
  panel.appendChild(el("div", "c12-mode-desc", `${p.level} · ${p.rated.length} avaliações válidas · ${p.uniqueArtists} artistas avaliados · confiança estimada ${Math.round(p.confidence * 100)}%`));
  panel.appendChild(el("div", "c12-reason", p.rated.length < 5
    ? "Perfil inicial: usamos suas preferências informadas, artistas do catálogo e, quando configurado, histórico do Last.fm."
    : "Suas avaliações orientam as recomendações. O Last.fm complementa o perfil quando há poucos dados."));
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
  if (state.personalizedSeen.length) {
    const reset = el("button", "c12-btn secondary", "Limpar histórico de sugestões");
    reset.onclick = () => { state.personalizedSeen = []; saveState(); render(); };
    toolbar.appendChild(reset);
  }
  panel.appendChild(toolbar);
  appRoot.appendChild(panel);
  renderRecommendations();
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

  busy = true;
  state.recommendations = [];

  /* Pesquisa nova começa do zero; "Refazer" preserva o histórico. */
  if (!isRetry) state.manualSeen = [];

  render();

  try {
    await getSpotifySavedAlbums();
    buildOwnedIndex();

    const feedback = await parseFeedback();
    const results = await generateManual(state.manualSelected, feedback);

    if (!results.length) {
      notice(isRetry
        ? "Não encontrei novidades sem repetir as anteriores. Tente outras referências."
        : "Não encontrei recomendações com os filtros atuais.");
    } else {
      state.recommendations = (await enrichAlbums(results)).filter(it => !isKnown(it));
      state.recommendationSection = "manual";
    }
  } catch (error) {
    console.error(error);
    notice(error?.message || "Não foi possível gerar recomendações.");
  } finally {
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
  input.oninput = () => { state.manualQuery = input.value; };

  const searchBtn = el("button", "c12-btn", "Pesquisar");
  searchBtn.onclick = async () => {
    const query = state.manualQuery.trim();
    if (!query) return notice("Digite alguma coisa para pesquisar.");

    searchBtn.disabled = true;
    searchBtn.textContent = "Pesquisando...";

    try {
      const results = await lastfmSearch(state.manualType, query);
      state.manualResults = cleanManualSearchResults(state.manualType, results, query);
      state.manualExpanded = false;
      if (!state.manualResults.length) notice("Nenhum resultado no Last.fm para essa busca.");
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

  const clear = el("button", "c12-btn secondary", "🧹 Limpar filtros");
  clear.onclick = clearManual;
  controls.appendChild(clear);

  if (state.manualSelected.length) {
    const find = el("button", "c12-btn", busy ? "Pesquisando..." : "🔎 Encontrar recomendações", { disabled: busy });
    find.onclick = () => runManualSearch(false);
    controls.appendChild(find);

    if (state.manualSeen.length) {
      const again = el("button", "c12-btn secondary", "↻ Refazer pesquisa", { disabled: busy });
      again.onclick = () => runManualSearch(true);
      controls.appendChild(again);
    }
  }

  panel.appendChild(controls);
  appRoot.appendChild(panel);

  renderRecommendations();
}

/* ============================================================
   RECOMENDAÇÕES — UI
   ============================================================ */
function renderRecommendations() {
  if (busy) {
    appRoot.appendChild(el("div", "c12-loading", "Buscando novas descobertas…"));
    return;
  }

  if (!state.recommendations?.length || state.recommendationSection !== state.section) return;
  // Proteção adicional para listas restauradas de sessões anteriores.
  const visibleRecommendations = state.recommendations.filter(it => !isKnown(it));
  if (!visibleRecommendations.length) return;

  const resultsHeader = el("div", "c12-section-heading");
  resultsHeader.appendChild(el("div", "c12-panel-title", "Seleção para você"));
  resultsHeader.appendChild(el("div", "c12-result-count", `${visibleRecommendations.length} descobertas`));
  appRoot.appendChild(resultsHeader);

  const toolbar = el("div", "c12-toolbar");
  toolbar.style.marginTop = "0";

  const clearResults = el("button", "c12-btn secondary", "Limpar resultados");
  clearResults.onclick = () => { state.recommendations = []; saveState(); render(); };
  toolbar.appendChild(clearResults);
  appRoot.appendChild(toolbar);

  const container = el("div", "c12-results");
  container.style.marginTop = "0";
  for (const item of visibleRecommendations) container.appendChild(renderCard(item));
  appRoot.appendChild(container);
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
    card.appendChild(el("img", "c12-cover", null, {
      src: item.image,
      loading: "lazy",
      alt: item.album || item.track || item.artist || ""
    }));
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
      try {
        await appendFeedback(item, action);
        b.disabled = true;
      } catch (error) {
        console.error(error);
        notice("Não foi possível salvar o feedback.");
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