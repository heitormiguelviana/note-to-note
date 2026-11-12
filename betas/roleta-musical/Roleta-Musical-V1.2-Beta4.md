```dataviewjs
// ============================================================
// 🎲 ROLETA MUSICAL — V1.2 BETA 4 (ESTABILIZAÇÃO)
// ============================================================
// V0.43: caminhos e chave Last.fm vindos da Central de Configurações.
// Modo "Já catalogado": sorteia direto das notas de Musicas/
// (funciona offline). O Spotify serve só para abrir o álbum.
// Demais modos: biblioteca de álbuns salvos no Spotify.
// Duração: Spotify → Last.fm (fallback)
//
// Novo na V0.42:
// - Filtro por quantidade de scrobbles (propriedade "scrobbles" das
//   notas): igual, maior, maior ou igual, menor, menor ou igual
// - Vale no modo "Já catalogado" (candidatos = notas), junto com os
//   demais filtros do acervo; leitura apenas, nada é escrito nas notas
// - Modos "Qualquer" e "Não catalogado" (candidatos vindos do Spotify)
//   não usam o filtro: álbuns sem nota não têm contagem
//
// Novo na V0.41:
// - Filtro de gêneros musicais (tags do Last.fm), em todos os modos
// - Seleção múltipla, combinação OR/AND e opção p/ álbuns sem gênero
// - Cache próprio de gêneros (roleta-albuns-genres-v041)
// - Consulta incremental com concorrência limitada
//
// Novo na V0.40:
// - Filtro de nota por intervalo (slider 1–10, liga/desliga)
// - Filtro de tempo por cataloguedAt (há mais de / nos últimos)
// - Filtros de acervo só aparecem em "Já catalogado"
// - Detecção de álbuns catalogados reescrita (links, listas,
//   edições, artistas, IDs do Spotify nas notas)
//
// Dependência (opcional no modo catalogado):
// Community Plugin → Spotify API (window.spotifysdk)
// ============================================================


// ============================================================
// CONFIGURAÇÃO
// ============================================================

// Configurações compartilhadas do Musical (mantém valores padrão se ausentes).
const MUSICAL_CONFIG_PATH = "Musicas/Sistema/Configuracoes.json";
let musicalConfig = {};
try {
  const configFile = dv.app.vault.getAbstractFileByPath(MUSICAL_CONFIG_PATH);
  if (configFile) {
    musicalConfig = JSON.parse(await dv.app.vault.cachedRead(configFile));
  }
} catch (error) {
  console.warn("[Roleta V0.43] Não foi possível ler configurações compartilhadas; usando padrões.", error);
}

const CFG = {
  root: musicalConfig?.paths?.musicRoot || "Musicas",
  central: musicalConfig?.paths?.central || "Musicas/Central",

  // mantido da V0.3 para preservar suas escolhas salvas
  stateKey: "roleta-albuns-v03",

  pageSize: 50,
  maxLibraryPages: 100,

  durationConcurrency: 4,

  durationCacheKey: "roleta-albuns-duration-v03",
  linkCacheKey: "roleta-albuns-links-v04",

  // V0.41 — cache próprio de gêneros (separado dos demais)
  genreCacheKey: "roleta-albuns-genres-v041",

  ratingMin: 1,
  ratingMax: 10,
  ratingStep: 0.5,

  // LAST.FM — fallback de duração e fonte das tags de gênero (V0.41)
  lastfmURL: "https://ws.audioscrobbler.com/2.0/",
  lastfmKey: musicalConfig?.lastfm?.apiKey || "",

  // V0.41 — consulta de gêneros
  genreConcurrency: 3,          // requisições simultâneas (valor inicial a testar)
  genreMinCount: 10,            // tags com contagem (0–100) abaixo disso são ignoradas
  genreMaxTags: 8,              // máximo de tags guardadas por álbum/artista
  genreFoundTTLDays: 180,       // quando "com tags" volta a ser consultado
  genreNoneTTLDays: 30,         // quando "sem tags úteis" volta a ser consultado
  genreMaxConsecutiveFailures: 6, // interrompe a carga se a API/rede cair
  genreListLimit: 250           // máximo de chips desenhados de uma vez
};

// Campos aceitos nas notas (frontmatter)
const ARTIST_FIELDS = ["artists", "artist", "artistas", "artista", "Artista", "Artists", "Artist"];
const ALBUM_FIELDS = ["album", "álbum", "Álbum", "title", "titulo", "título", "Title", "name"];
const RATING_FIELDS = ["personalRating", "rating", "nota", "nota_musical", "avaliacao", "avaliação", "score"];
const CATALOGUED_FIELDS = ["cataloguedAt", "catalogued_at", "catalogedAt", "cataloguedat"];
const COVER_FIELDS = ["cover", "coverUrl", "cover_url", "image", "imageUrl", "poster", "capa", "thumbnail", "artwork", "albumArt"];
const SCROBBLES_FIELDS = ["scrobbles"];

// V0.41 — Normalização de tags de gênero (constantes ficam aqui em cima
// porque loadState() roda logo abaixo)

// Variações de escrita do MESMO gênero. Agrupamento explícito e pequeno:
// nunca junta gêneros diferentes (Rock ≠ Post-Rock ≠ Alternative Rock).
const GENRE_ALIASES = {
  "hiphop": "hip hop",
  "rnb": "r and b",
  "r n b": "r and b",
  "drumnbass": "drum and bass",
  "drum n bass": "drum and bass",
  "dnb": "drum and bass",
  "lofi": "lo fi",
  "postrock": "post rock",
  "postpunk": "post punk",
  "triphop": "trip hop"
};

// Nome de exibição para chaves normalizadas (o resto vira Title Case)
const GENRE_LABELS = {
  "hip hop": "Hip-Hop",
  "r and b": "R&B",
  "idm": "IDM",
  "edm": "EDM",
  "ost": "OST",
  "mpb": "MPB",
  "k pop": "K-Pop",
  "j pop": "J-Pop",
  "uk garage": "UK Garage",
  "lo fi": "Lo-Fi",
  "post rock": "Post-Rock",
  "post punk": "Post-Punk",
  "trip hop": "Trip-Hop",
  "drum and bass": "Drum and Bass"
};

// Tags evidentemente não-gênero (rótulos de organização, opinião, formato…).
// Compara a chave normalizada. Edite à vontade.
const GENRE_JUNK = new Set([
  "seen live", "favorites", "favourites", "favorite", "favourite",
  "favorite albums", "favourite albums", "favorite songs", "favourite songs",
  "albums i own", "albums i love", "owned", "own", "love", "loved",
  "awesome", "amazing", "beautiful", "good", "great", "best", "cool",
  "all", "albums", "album", "ep", "lp", "single", "singles", "mixtape",
  "spotify", "unknown", "check out", "to listen",
  "male vocalists", "female vocalists", "male vocalist", "female vocalist", "vocalists"
]);

const GENRE_JUNK_PATTERNS = [
  /^\d+$/,                 // anos: "2015"
  /^\d{2,4}s$/,            // décadas: "90s", "1990s"
  /favou?rite/,
  /\blisteners\b/,         // "under 2000 listeners"
  /\bseen live\b/,
  /\bowned?\b/,
  /^(?:my|i|to) /          // "my music", "i love", "to listen"
];


// ============================================================
// ESTADO
// ============================================================

const DEFAULT_STATE = {
  duration: "any",
  catalog: "any",
  type: "album",
  artist: "all",

  ratingEnabled: false,
  ratingMin: 1,
  ratingMax: 10,

  timeEnabled: false,
  timeMode: "older",
  timeValue: 1,
  timeUnit: "months",

  // V0.42 — filtro de scrobbles (só no modo "Já catalogado")
  scrobblesEnabled: false,
  scrobblesOp: "gte",          // eq | gt | gte | lt | lte
  scrobblesValue: 1,
  scrobblesMin: 1,
  scrobblesMax: null,
  drawMode: "random",
  animationEnabled: true,
  soundMode: "full", // efeitos elaborados fixos
  soundVolume: 30, // volume moderado fixo

  // V0.41 — filtro de gêneros
  genres: [],                  // chaves normalizadas dos gêneros selecionados
  genreMatch: "any",           // "any" (OR) | "all" (AND)
  includeUnknownGenres: false  // incluir álbuns sem gênero identificado
};

let state = loadState();

let spotifyLibrary = [];
let spotifyLoaded = false;
let catalogEntries = [];

let durationCache = loadJSON(CFG.durationCacheKey);
let linkCache = loadJSON(CFG.linkCacheKey);

// V0.41 — cache de gêneros: { albums: {"artista|título": reg}, artists: {"artista": reg} }
// reg = { status: "found" | "none", tags: [{key, name, count}], at: timestamp }
let genreCache = loadGenreCache();

let approxMatches = 0;

// V0.41 — estado volátil da consulta de gêneros (não persiste)
let genreRun = 0;                         // "geração": invalida cargas antigas
let genreBusy = false;
let genreProgress = null;                 // { done, total, failed }
let genreMessage = "";
let genreSearch = "";
let genreUI = null;                       // referências do bloco de interface
let genreSaveTimer = null;
const genreFailures = new Set();          // álbuns com falha TEMPORÁRIA nesta sessão
const genreArtistInflight = new Map();    // evita consultar o mesmo artista 2x ao mesmo tempo


// ============================================================
// UTILITÁRIOS
// ============================================================

function arr(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

// Aceita array comum e DataArray do Dataview.
function listOf(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && typeof value.array === "function") return value.array();
  return [value];
}

function baseName(path) {
  return String(path || "").split("/").pop().replace(/\.md$/i, "");
}

// "[[Kanye West]]" → "Kanye West" | "[[x|Ye]]" → "Ye"
function stripWikilink(text) {
  const m = String(text).trim().match(/^!?\[\[([^\]]*)\]\]$/);

  if (!m) return String(text);

  const [target, alias] = m[1].split("|");

  return (alias || target.split("#")[0].split("/").pop() || "").trim();
}

function textValue(value) {
  if (value == null) return "";

  if (typeof value === "string") return stripWikilink(value);
  if (typeof value === "number") return String(value);

  if (Array.isArray(value) || typeof value.array === "function") {
    return listOf(value).map(textValue).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    if (typeof value.display === "string" && value.display) return value.display;
    if (typeof value.path === "string") return baseName(value.path);
    if (typeof value.value === "string") return value.value;
    if (typeof value.name === "string") return value.name;
  }

  return String(value);
}

function norm(value) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function esc(value) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "—";

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;

  return `${minutes} min`;
}

function durationBucket(ms) {
  if (!ms || ms <= 0) return "unknown";

  const minutes = ms / 60000;

  if (minutes <= 30) return "short";
  if (minutes <= 55) return "medium";
  if (minutes <= 89) return "long";

  return "epic";
}

function loadJSON(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const saveDurationCache = () => saveJSON(CFG.durationCacheKey, durationCache);
const saveLinkCache = () => saveJSON(CFG.linkCacheKey, linkCache);

function openURL(url) {
  if (!url) return;
  window.open(url, "_blank");
}

function openNote(path) {
  if (!path) return;
  app.workspace.openLinkText(path, "", false);
}


// ============================================================
// DATAS
// ============================================================

// Aceita DateTime (Dataview/Luxon), Date, timestamp, ISO e dd/mm/aaaa.
function parseDateValue(value) {
  if (value == null || value === "") return null;

  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toJSDate === "function") return value.toJSDate().getTime();
  if (value instanceof Date) return value.getTime();

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e11 ? value * 1000 : value;
  }

  const s = textValue(value).trim();

  if (!s) return null;

  // dd/mm/aaaa primeiro: Date.parse() leria "06/10/2026" como mês/dia (EUA)
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);

  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
  }

  const t = Date.parse(s);

  return Number.isNaN(t) ? null : t;
}

function relativeTime(ms) {
  const days = Math.floor((Date.now() - ms) / 86400000);

  if (days < 1) return "hoje";
  if (days < 14) return `há ${days} dia${days === 1 ? "" : "s"}`;
  if (days < 60) return `há ${Math.round(days / 7)} semanas`;
  if (days < 730) return `há ${Math.round(days / 30.44)} meses`;

  return `há ${Math.round(days / 365.25)} anos`;
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString("pt-BR");
}


// ============================================================
// ESTADO / CACHE
// ============================================================

// V0.41 — valida a lista de gêneros salva (sempre devolve um array NOVO)
function sanitizeGenreList(value) {
  if (!Array.isArray(value)) return [];

  const out = [];

  for (const item of value) {
    if (typeof item !== "string") continue;

    const key = item.trim();

    if (key && !out.includes(key)) out.push(key);
    if (out.length >= 60) break;
  }

  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(CFG.stateKey);

    if (!raw) return { ...DEFAULT_STATE, genres: [] };

    const parsed = JSON.parse(raw);
    const s = { ...DEFAULT_STATE, ...parsed };

    // migra o filtro de nota antigo (any / rated / 8plus / 9plus)
    if (parsed.rating && parsed.ratingEnabled === undefined) {
      if (parsed.rating === "rated") { s.ratingEnabled = true; s.ratingMin = 1; }
      if (parsed.rating === "8plus") { s.ratingEnabled = true; s.ratingMin = 8; }
      if (parsed.rating === "9plus") { s.ratingEnabled = true; s.ratingMin = 9; }
    }

    delete s.rating;

    const clamp = n => Math.min(CFG.ratingMax, Math.max(CFG.ratingMin, Number(n) || 0));

    s.ratingMin = clamp(s.ratingMin);
    s.ratingMax = clamp(s.ratingMax);

    if (s.ratingMin > s.ratingMax) s.ratingMin = s.ratingMax;

    s.timeValue = Math.max(1, Math.round(Number(s.timeValue) || 1));

    if (!["days", "weeks", "months", "years"].includes(s.timeUnit)) s.timeUnit = "months";
    if (!["older", "recent"].includes(s.timeMode)) s.timeMode = "older";

    // V0.42 — estado antigo sem os campos de scrobbles recebe os padrões
    s.scrobblesEnabled = s.scrobblesEnabled === true;

    if (!["eq", "gt", "gte", "lt", "lte"].includes(s.scrobblesOp)) s.scrobblesOp = "gte";

    s.scrobblesValue = Math.max(1, Math.round(Number(s.scrobblesValue) || 1));
    // Migração sem perder o filtro da V0.43: operadores antigos viram limites.
    if (!Object.prototype.hasOwnProperty.call(parsed, "scrobblesMin")) {
      const n = s.scrobblesValue;
      const old = s.scrobblesOp;
      s.scrobblesMin = old === "eq" || old === "gte" ? n : old === "gt" ? n + 1 : null;
      s.scrobblesMax = old === "eq" || old === "lte" ? n : old === "lt" ? n - 1 : null;
    }
    const limit = value => value === null || value === "" || value === undefined
      ? null : Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : null;
    s.scrobblesMin = limit(s.scrobblesMin);
    s.scrobblesMax = limit(s.scrobblesMax);
    if (!["random", "surprise"].includes(s.drawMode)) s.drawMode = "random";
    // V1.1 definitiva: substitui também preferências salvas da versão experimental.
    s.animationEnabled = true;
    s.soundMode = "full";
    s.soundVolume = 30;

    // V0.41 — estado antigo sem os campos novos recebe os padrões
    s.genres = sanitizeGenreList(parsed.genres);

    if (!["any", "all"].includes(s.genreMatch)) s.genreMatch = "any";

    s.includeUnknownGenres = s.includeUnknownGenres === true;

    return s;
  } catch {
    return { ...DEFAULT_STATE, genres: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(CFG.stateKey, JSON.stringify(state));
  } catch {}
}

// V0.41 — cache de gêneros
function loadGenreCache() {
  const raw = loadJSON(CFG.genreCacheKey);

  return {
    albums: raw.albums && typeof raw.albums === "object" ? raw.albums : {},
    artists: raw.artists && typeof raw.artists === "object" ? raw.artists : {}
  };
}

// now = true grava na hora; senão agrupa gravações (evita reescrever a cada requisição)
function saveGenreCache(now = false) {
  if (now) {
    if (genreSaveTimer) clearTimeout(genreSaveTimer);

    genreSaveTimer = null;
    saveJSON(CFG.genreCacheKey, genreCache);

    return;
  }

  if (genreSaveTimer) return;

  genreSaveTimer = setTimeout(() => {
    genreSaveTimer = null;
    saveJSON(CFG.genreCacheKey, genreCache);
  }, 1000);
}


// ============================================================
// CORRESPONDÊNCIA DE ÁLBUNS (nota ↔ Spotify)
// ============================================================

// Dentro de (parênteses) ou [colchetes]: aceita bastante coisa.
const EDITION_LOOSE =
  /\b(deluxe|expanded|remaster(?:ed)?|anniversary|special|limited|collector'?s?|bonus|extended|re-?issue|complete|international|standard|platinum|edition|version|mono|stereo|explicit|clean)\b/i;

// Depois de " - " ou ": ": mais rígido, para não cortar subtítulos legítimos.
const EDITION_STRICT =
  /\b(deluxe|expanded|remaster(?:ed)?|anniversary|re-?issue|bonus|collector'?s?|edition|version)\b/i;

function stripEdition(title) {
  let v = textValue(title).normalize("NFC").trim();
  let prev;

  do {
    prev = v;

    // "(Deluxe Edition)", "[2011 Remaster]", "(2015)"
    v = v.replace(/\s*[\(\[]([^\)\]]*)[\)\]]\s*$/, (m, inner) =>
      EDITION_LOOSE.test(inner) || /^\s*\d{4}\s*$/.test(inner) ? "" : m
    );

    // "Blonde - Expanded", "Album: Deluxe Edition"
    v = v.replace(/\s+[-–—:]\s+([^-–—:]*)$/, (m, tail) =>
      EDITION_STRICT.test(tail) ? "" : m
    );

    // sufixos soltos: "Blonde Deluxe", "Album Special Edition"
    v = v.replace(/\s+(?:super\s+)?(?:deluxe|expanded|remastered|re-?issue)(?:\s+(?:edition|version))?\s*$/i, "");
    v = v.replace(/\s+(?:special|limited|anniversary|collector'?s?|extended|complete|international|standard)\s+(?:edition|version)\s*$/i, "");

    v = v.trim();
  } while (v !== prev && v);

  return v;
}

// Texto comparável: sem acentos, "$"→"s", "&"→"and", sem pontuação.
function normText(value) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\$/g, "s")
    .replace(/&/g, " and ")
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKeyOf(title) {
  const t = normText(stripEdition(title))
    .replace(/\bvolume\b/g, "vol")
    .replace(/\bpart\b/g, "pt")
    .replace(/^(the|a|an)\s+/, "")
    .trim();

  return t || normText(title);
}

function artistKeyOf(name) {
  return normText(name)
    .replace(/\s+(feat|ft|featuring)\s+.*$/, "")
    .replace(/^the\s+/, "")
    .trim();
}

const STOP_TOKENS = new Set(["the", "and", "feat", "ft", "featuring"]);

function sortedTokenKey(key) {
  return key
    .split(" ")
    .filter(t => t && !STOP_TOKENS.has(t))
    .sort()
    .join(" ");
}

// Variações de um artista: nome completo, partes ("A feat. B", "A & B")
// e versão com palavras em qualquer ordem.
function artistVariants(name) {
  const keys = new Set();

  const add = n => {
    const k = artistKeyOf(n);

    if (!k) return;

    keys.add(k);
    keys.add("~" + sortedTokenKey(k));
  };

  add(name);

  String(name)
    .split(/\s+(?:feat\.?|ft\.?|featuring|x|&)\s+|\s\/\s/i)
    .forEach(add);

  return keys;
}

function entryKey(entry) {
  return `${artistKeyOf(entry.artists[0] || "")}|${entry.titleKey}`;
}

// Preenche os campos usados na comparação.
function prepareEntry(entry) {
  entry.titleKey = titleKeyOf(entry.name);
  entry.artistKeys = new Set();
  entry.artistTokens = new Set();

  for (const artist of entry.artists) {
    for (const k of artistVariants(artist)) entry.artistKeys.add(k);

    for (const t of normText(artist).split(" ")) {
      if (t.length >= 3 && !STOP_TOKENS.has(t)) entry.artistTokens.add(t);
    }
  }

  entry.key = entryKey(entry);

  return entry;
}

function buildMatchIndex(entries) {
  const byId = new Map();
  const exact = new Map();
  const byTitle = new Map();

  for (const entry of entries) {
    for (const id of entry.ids || []) byId.set(id, entry);

    if (!byTitle.has(entry.titleKey)) byTitle.set(entry.titleKey, []);
    byTitle.get(entry.titleKey).push(entry);

    for (const a of entry.artistKeys) {
      const k = `${a}|${entry.titleKey}`;

      if (!exact.has(k)) exact.set(k, []);
      exact.get(k).push(entry);
    }
  }

  return { byId, exact, byTitle };
}

// Camadas, da mais confiável para a mais permissiva:
// 1) ID do Spotify 2) artista + título 3) mesmo título + artista parecido
function findMatch(index, entry) {
  for (const id of entry.ids || []) {
    if (index.byId.has(id)) return { entry: index.byId.get(id), tier: "id" };
  }

  for (const a of entry.artistKeys) {
    const hit = index.exact.get(`${a}|${entry.titleKey}`);

    if (hit?.length) return { entry: hit[0], tier: "exact" };
  }

  const sameTitle = index.byTitle.get(entry.titleKey) || [];

  const similar = sameTitle.filter(candidate =>
    [...candidate.artistTokens].some(t => entry.artistTokens.has(t))
  );

  if (similar.length) return { entry: similar[0], tier: "approx" };

  return null;
}


// ============================================================
// SPOTIFY SDK
// ============================================================

function getSpotifySDK() {
  const sdk = window.spotifysdk;

  if (!sdk) {
    throw new Error(
      "Spotify API não está disponível. " +
      "Verifique se o plugin Spotify API está instalado, ativo e autenticado."
    );
  }

  return sdk;
}

function extractItems(response) {
  if (!response) return [];

  if (Array.isArray(response)) return response;
  if (Array.isArray(response.items)) return response.items;
  if (response.items && Array.isArray(response.items.items)) return response.items.items;
  if (response.albums?.items) return arr(response.albums.items);
  if (response.tracks?.items) return arr(response.tracks.items);
  if (response.data?.items) return arr(response.data.items);

  return [];
}

function responseTotal(response) {
  if (!response) return 0;

  const candidates = [
    response.total,
    response.items?.total,
    response.albums?.total,
    response.tracks?.total,
    response.data?.total
  ];

  for (const value of candidates) {
    const n = Number(value);

    if (Number.isFinite(n) && n > 0) return n;
  }

  return 0;
}


// ============================================================
// SPOTIFY — BIBLIOTECA
// ============================================================

async function spotifySavedAlbums(offset = 0) {
  const sdk = getSpotifySDK();

  const candidates = [
    () => sdk.currentUser?.albums?.savedAlbums?.(CFG.pageSize, offset),
    () => sdk.currentUser?.albums?.getSavedAlbums?.(CFG.pageSize, offset),
    () => sdk.currentUser?.getSavedAlbums?.(CFG.pageSize, offset),
    () => sdk.users?.currentUser?.albums?.(CFG.pageSize, offset),
    () => sdk.getSavedAlbums?.(CFG.pageSize, offset)
  ];

  let lastError = null;

  for (const attempt of candidates) {
    try {
      const result = await attempt();

      if (result) return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.error("[Roleta V0.42] Erro ao obter biblioteca do Spotify:", lastError);
  }

  return null;
}


// ============================================================
// SPOTIFY — FAIXAS DO ÁLBUM
// ============================================================
// O SDK oficial usa: albums.tracks(albumId, market?, limit?, offset?)

async function spotifyAlbumTracks(id, offset = 0) {
  const sdk = getSpotifySDK();

  const limit = CFG.pageSize;

  const methods = [
    sdk.albums?.tracks,
    sdk.albums?.getTracks,
    sdk.albums?.getAlbumTracks,
    sdk.getAlbumTracks
  ];

  let lastError = null;

  for (const originalMethod of methods) {
    if (typeof originalMethod !== "function") continue;

    const method = originalMethod.bind(
      originalMethod === sdk.albums?.tracks ||
      originalMethod === sdk.albums?.getTracks ||
      originalMethod === sdk.albums?.getAlbumTracks
        ? sdk.albums
        : sdk
    );

    for (const args of [
      [id, undefined, limit, offset],
      [id, limit, offset],
      [id, offset]
    ]) {
      try {
        const response = await method(...args);

        if (response) return response;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (lastError) {
    console.warn(`[Roleta V0.42] Spotify não conseguiu carregar faixas do álbum ${id}:`, lastError);
  }

  return null;
}


// ============================================================
// SPOTIFY — ÁLBUM COMPLETO
// ============================================================

async function spotifyAlbum(id) {
  const sdk = getSpotifySDK();

  for (const originalMethod of [sdk.albums?.get, sdk.albums?.getAlbum]) {
    if (typeof originalMethod !== "function") continue;

    try {
      const response = await originalMethod.bind(sdk.albums)(id);

      if (response) return response;
    } catch (error) {
      console.warn(`[Roleta V0.42] Falha ao obter álbum ${id} pelo Spotify:`, error);
    }
  }

  return null;
}


// ============================================================
// DURAÇÃO
// ============================================================

function extractSpotifyTrackDurationMs(track) {
  if (!track) return 0;

  const candidates = [
    track.duration_ms,
    track.durationMs,
    track.data?.duration_ms,
    track.data?.durationMs,
    track.raw?.duration_ms,
    track.raw?.durationMs,
    track.track?.duration_ms,
    track.track?.durationMs
  ];

  for (const value of candidates) {
    const number = Number(value);

    if (Number.isFinite(number) && number > 0) return number;
  }

  return 0;
}

async function loadSpotifyAlbumDuration(album) {
  if (!album?.id) return 0;

  let total = 0;
  let offset = 0;

  try {
    const fullAlbum = await spotifyAlbum(album.id);

    if (fullAlbum) {
      for (const track of extractItems(fullAlbum.tracks)) {
        total += extractSpotifyTrackDurationMs(track);
      }

      if (total > 0) return total;
    }
  } catch (error) {
    console.warn(`[Roleta V0.42] Erro ao obter duração via álbum completo: ${album.name}`, error);
  }

  total = 0;

  for (let page = 0; page < 100; page++) {
    const response = await spotifyAlbumTracks(album.id, offset);

    if (!response) break;

    const tracks = extractItems(response);

    if (!tracks.length) break;

    for (const track of tracks) total += extractSpotifyTrackDurationMs(track);

    offset += tracks.length;

    const totalTracks = responseTotal(response);

    if (totalTracks > 0 && offset >= totalTracks) break;
    if (tracks.length < CFG.pageSize) break;
  }

  return total;
}

function lastfmEnabled() {
  return CFG.lastfmKey && CFG.lastfmKey.trim() && CFG.lastfmKey !== "COLOQUE_SUA_LASTFM_KEY_AQUI";
}

async function lastfmAlbumDuration(artist, album) {
  if (!lastfmEnabled()) return 0;

  const params = new URLSearchParams({
    method: "album.getInfo",
    api_key: CFG.lastfmKey,
    artist,
    album,
    autocorrect: "1",
    format: "json"
  });

  try {
    const response = await fetch(`${CFG.lastfmURL}?${params.toString()}`);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (data?.error) throw new Error(data.message || `Last.fm error ${data.error}`);

    const tracks = arr(data?.album?.tracks?.track);

    let totalSeconds = 0;

    for (const track of tracks) {
      const seconds = Number(track?.duration || 0);

      if (Number.isFinite(seconds) && seconds > 0) totalSeconds += seconds;
    }

    return totalSeconds > 0 ? totalSeconds * 1000 : 0;
  } catch (error) {
    console.warn(`[Roleta V0.42] Last.fm não conseguiu obter duração de "${album}" — ${artist}:`, error);

    return 0;
  }
}

function cachedDuration(album) {
  const byId = album.id ? Number(durationCache[album.id]) : 0;
  const byKey = Number(durationCache["k:" + album.key]);

  return byId > 0 ? byId : byKey > 0 ? byKey : 0;
}

function storeDuration(album, ms, source) {
  album.durationMs = ms;
  album.durationLoaded = true;
  album.durationSource = source;

  if (album.id) durationCache[album.id] = ms;

  durationCache["k:" + album.key] = ms;

  saveDurationCache();
}

// cache → Spotify (se houver ID) → Last.fm
async function loadAlbumDuration(album) {
  if (!album) return 0;

  if (album.durationLoaded && album.durationMs > 0) return album.durationMs;

  const cached = cachedDuration(album);

  if (cached > 0) {
    album.durationMs = cached;
    album.durationLoaded = true;
    album.durationSource = "cache";

    return cached;
  }

  if (album.id && window.spotifysdk) {
    try {
      const ms = await loadSpotifyAlbumDuration(album);

      if (ms > 0) {
        storeDuration(album, ms, "spotify");
        return ms;
      }
    } catch (error) {
      console.warn(`[Roleta V0.42] Falha geral no Spotify para "${album.name}":`, error);
    }
  }

  try {
    const ms = await lastfmAlbumDuration(album.artists[0] || album.artist, album.name);

    if (ms > 0) {
      storeDuration(album, ms, "lastfm");
      return ms;
    }
  } catch (error) {
    console.warn(`[Roleta V0.42] Falha geral no Last.fm para "${album.name}":`, error);
  }

  album.durationMs = 0;
  album.durationLoaded = false;
  album.durationSource = "none";

  return 0;
}

async function enrichDurations(albums) {
  if (!albums.length) return;

  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;

      if (index >= albums.length) break;

      await loadAlbumDuration(albums[index]);
    }
  }

  const amount = Math.min(CFG.durationConcurrency, albums.length);

  await Promise.all(Array.from({ length: amount }, worker));
}

// Aproveita durações já conhecidas (cache) sem rede.
function hydrateDurations(entries) {
  for (const album of entries) {
    if (album.durationMs > 0) continue;

    const cached = cachedDuration(album);

    if (cached > 0) {
      album.durationMs = cached;
      album.durationLoaded = true;
      album.durationSource = "cache";
    }
  }
}


// ============================================================
// SPOTIFY — NORMALIZAÇÃO E BIBLIOTECA
// ============================================================

function normalizeSpotifyAlbum(item) {
  if (!item) return null;

  const raw = item.album || item;

  if (!raw?.id) return null;

  const names = arr(raw.artists).map(a => textValue(a?.name)).filter(Boolean);
  const artists = names.length ? names : ["Artista desconhecido"];
  const id = textValue(raw.id);

  const entry = {
    source: "spotify",
    id,
    ids: [id],

    name: textValue(raw.name) || "Álbum sem nome",
    artist: artists.join(", "),
    artists,

    albumType: norm(raw.album_type || "album"),
    releaseDate: textValue(raw.release_date),
    totalTracks: Number(raw.total_tracks || 0),

    spotifyUrl: textValue(raw.external_urls?.spotify) || `https://open.spotify.com/album/${id}`,
    image: raw.images?.[0]?.url || "",

    durationMs: 0,
    durationLoaded: false,
    durationSource: null,

    catalogued: false,
    catalogPath: null,
    rating: null,
    cataloguedAt: null,
    scrobbles: null // álbuns do Spotify não têm contagem própria
  };

  prepareEntry(entry);

  const tracks = extractItems(raw.tracks);

  if (tracks.length) {
    let total = 0;

    for (const track of tracks) total += extractSpotifyTrackDurationMs(track);

    if (total > 0) {
      entry.durationMs = total;
      entry.durationLoaded = true;
      entry.durationSource = "spotify";
    }
  }

  return entry;
}

async function loadSpotifyLibrary() {
  const map = new Map();

  for (let page = 0; page < CFG.maxLibraryPages; page++) {
    const offset = page * CFG.pageSize;

    const response = await spotifySavedAlbums(offset);

    if (!response) break;

    const items = extractItems(response);

    if (!items.length) break;

    for (const item of items) {
      const album = normalizeSpotifyAlbum(item);

      if (album && !map.has(album.id)) map.set(album.id, album);
    }

    const total = responseTotal(response);

    if (total > 0 && offset + items.length >= total) break;
    if (items.length < CFG.pageSize) break;
  }

  spotifyLibrary = Array.from(map.values());
  spotifyLoaded = true;

  hydrateDurations(spotifyLibrary);

  return spotifyLibrary;
}

async function ensureSpotifyLibrary(force = false) {
  if (spotifyLoaded && !force) return;

  await loadSpotifyLibrary();
}


// ============================================================
// CATÁLOGO — MUSICAS/
// ============================================================

function isInsideCentral(path) {
  const p = String(path || "").replace(/\\/g, "/");
  const central = CFG.central.replace(/\\/g, "/");

  return p === central || p.startsWith(`${central}/`);
}

function firstValue(page, fields) {
  for (const field of fields) {
    const value = page[field];

    if (value != null && value !== "") return value;
  }

  return null;
}

function extractCatalogArtists(page) {
  for (const field of ARTIST_FIELDS) {
    const list = listOf(page[field]).map(textValue).map(s => s.trim()).filter(Boolean);

    if (list.length) return list;
  }

  return [];
}

function extractCatalogAlbum(page) {
  for (const field of ALBUM_FIELDS) {
    const text = textValue(page[field]).trim();

    if (text) return text;
  }

  return "";
}

// Nota ≤ 0 ou vazia = sem nota.
function extractCatalogRating(page) {
  for (const field of RATING_FIELDS) {
    const raw = page[field];

    if (raw == null || raw === "") continue;

    const n = parseFloat(textValue(raw).replace(",", "."));

    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

// V0.42 — scrobbles: SOMENTE número inteiro >= 1.
// Ausente, texto ("3"), 0, negativo ou decimal = desconhecido (null).
function validScrobbles(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function extractCatalogScrobbles(page) {
  for (const field of SCROBBLES_FIELDS) {
    const n = validScrobbles(page[field]);

    if (n !== null) return n;
  }

  return null;
}

function extractCataloguedAt(page) {
  for (const field of CATALOGUED_FIELDS) {
    const t = parseDateValue(page[field]);

    if (t) return t;
  }

  return null;
}

// Procura links/URIs de álbum do Spotify em qualquer campo da nota.
function extractSpotifyIds(page) {
  const ids = new Set();
  const regex = /(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/|spotify:album:)([A-Za-z0-9]{22})/g;

  try {
    for (const key of Object.keys(page)) {
      if (key === "file") continue;

      for (const item of listOf(page[key])) {
        const text = typeof item === "string" ? item : textValue(item);

        for (const m of text.matchAll(regex)) ids.add(m[1]);
      }
    }
  } catch {}

  return [...ids];
}

// Capa da nota: URL externa ou imagem do vault.
function extractCatalogCover(page, path) {
  for (const field of COVER_FIELDS) {
    const raw = firstValue(page, [field]);

    if (!raw) continue;

    const value = typeof raw === "string" ? raw.trim() : textValue(raw).trim();

    if (/^https?:\/\//i.test(value)) return value;

    try {
      const link = (typeof raw === "string" ? raw : value)
        .replace(/^!?\[\[|\]\]$/g, "")
        .split("|")[0]
        .split("#")[0];

      const file = app.metadataCache.getFirstLinkpathDest(link, path);

      if (file) return app.vault.getResourcePath(file);
    } catch {}
  }

  return "";
}

// Último recurso: "Artista - Álbum" no nome do arquivo (só em notas de música).
function parseFileName(name) {
  const m = String(name || "").match(/^(.+?)\s+[-–—]\s+(.+)$/);

  return m ? { artist: m[1].trim(), album: m[2].trim() } : null;
}

function loadCatalog() {
  const result = [];

  for (const page of dv.pages(`"${CFG.root}"`)) {
    const path = textValue(page.file?.path);

    if (!path || isInsideCentral(path)) continue;
    if (norm(page.file?.name).includes("template")) continue;

    const type = norm(textValue(page.type));

    if (/artist|track|song|person|label|playlist/.test(type)) continue;

    let artists = extractCatalogArtists(page);
    let album = extractCatalogAlbum(page);

    if (!artists.length || !album) {
      const musicTag = listOf(page.file?.tags).some(t => norm(textValue(t)).includes("mediadb/music"));

      if (/release|album/.test(type) || musicTag) {
        const parsed = parseFileName(page.file?.name);

        if (parsed) {
          if (!artists.length) artists = [parsed.artist];
          if (!album) album = parsed.album;
        }
      }
    }

    if (!artists.length || !album) continue;

    result.push(prepareEntry({
      source: "catalog",
      id: null,
      ids: extractSpotifyIds(page),

      name: album,
      artist: artists.join(", "),
      artists,

      albumType: "",
      releaseDate: "",
      totalTracks: 0,

      spotifyUrl: "",
      image: extractCatalogCover(page, path),

      durationMs: 0,
      durationLoaded: false,
      durationSource: null,

      catalogued: true,
      catalogPath: path,
      rating: extractCatalogRating(page),
      cataloguedAt: extractCataloguedAt(page),
      scrobbles: extractCatalogScrobbles(page)
    }));
  }

  catalogEntries = result;

  hydrateDurations(catalogEntries);

  return catalogEntries;
}


// ============================================================
// CRUZAMENTO: NOTAS ↔ SPOTIFY
// ============================================================

function applyCachedLink(entry) {
  const cached = linkCache[entry.key];

  if (!cached) return;

  if (!entry.id && cached.id) entry.id = cached.id;
  if (!entry.spotifyUrl && cached.url) entry.spotifyUrl = cached.url;
  if (!entry.image && cached.image) entry.image = cached.image;
  if (!entry.albumType && cached.albumType) entry.albumType = cached.albumType;
}

function rememberLink(entry) {
  if (!entry.id) return;

  linkCache[entry.key] = {
    id: entry.id,
    url: entry.spotifyUrl,
    image: entry.image || "",
    albumType: entry.albumType || ""
  };
}

function linkCatalogWithSpotify() {
  approxMatches = 0;

  // links já descobertos (funciona offline)
  for (const entry of catalogEntries) {
    // ID escrito na própria nota
    if (!entry.id && entry.ids.length) {
      entry.id = entry.ids[0];
      entry.spotifyUrl = `https://open.spotify.com/album/${entry.id}`;
    }

    applyCachedLink(entry);
  }

  if (spotifyLibrary.length) {
    const catalogIndex = buildMatchIndex(catalogEntries);
    const spotifyIndex = buildMatchIndex(spotifyLibrary);

    // Spotify → nota
    for (const album of spotifyLibrary) {
      const match = findMatch(catalogIndex, album);

      if (match) {
        album.catalogued = true;
        album.catalogPath = match.entry.catalogPath;
        album.rating = match.entry.rating;
        album.cataloguedAt = match.entry.cataloguedAt;

        if (match.tier === "approx") approxMatches++;
      } else {
        album.catalogued = false;
        album.catalogPath = null;
        album.rating = null;
        album.cataloguedAt = null;
      }
    }

    // nota → Spotify (link, capa, tipo)
    for (const entry of catalogEntries) {
      const match = findMatch(spotifyIndex, entry);

      if (!match) continue;

      const sp = match.entry;

      entry.id = sp.id;
      entry.spotifyUrl = sp.spotifyUrl;
      entry.albumType = sp.albumType;
      entry.totalTracks = sp.totalTracks;
      entry.releaseDate = sp.releaseDate;
      entry.matchTier = match.tier;

      if (!entry.image) entry.image = sp.image;

      if (sp.durationMs > 0 && !(entry.durationMs > 0)) {
        entry.durationMs = sp.durationMs;
        entry.durationLoaded = true;
        entry.durationSource = sp.durationSource;
      }
    }
  }

  for (const entry of catalogEntries) rememberLink(entry);

  saveLinkCache();
  hydrateDurations(catalogEntries);
}

// Link do álbum no Spotify: conhecido → busca pontual → página de busca.
async function findSpotifyLink(entry) {
  if (entry.spotifyUrl) return entry.spotifyUrl;

  const fallback =
    "https://open.spotify.com/search/" +
    encodeURIComponent(`${entry.artists[0] || ""} ${entry.name}`.trim());

  const sdk = window.spotifysdk;

  if (!sdk || typeof sdk.search !== "function") return fallback;

  try {
    const q = `album:${entry.name} artist:${entry.artists[0] || ""}`;

    let response = null;

    try {
      response = await sdk.search(q, ["album"], undefined, 10);
    } catch {
      response = await sdk.search(q, ["album"]);
    }

    const candidates = extractItems(response)
      .map(normalizeSpotifyAlbum)
      .filter(Boolean);

    const match = findMatch(buildMatchIndex(candidates), entry);

    if (match) {
      entry.id = match.entry.id;
      entry.spotifyUrl = match.entry.spotifyUrl;
      entry.albumType = entry.albumType || match.entry.albumType;

      if (!entry.image) entry.image = match.entry.image;

      rememberLink(entry);
      saveLinkCache();

      return entry.spotifyUrl;
    }
  } catch (error) {
    console.warn("[Roleta V0.42] Busca pontual no Spotify falhou:", error);
  }

  return fallback;
}


// ============================================================
// GÊNEROS (Last.fm) — V0.41
// ============================================================
// Estados de um álbum quanto a gênero (função genreInfo):
//   found   → há tags úteis (do álbum; ou do artista, como aproximação)
//   none    → consulta feita, sem tags úteis
//   pending → consulta ainda não realizada
//   error   → falha TEMPORÁRIA nesta sessão (nunca vira "none" no cache)

const DAY_MS = 86400000;

// Chave normalizada p/ comparar e deduplicar ("Hip-Hop" = "hip hop" = "hiphop").
function genreKey(value) {
  const k = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return GENRE_ALIASES[k] || k;
}

function titleCaseGenre(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-\/(])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

// Nome legível para exibição (a chave serve só para comparação).
function genreLabel(key, name) {
  return GENRE_LABELS[key] || titleCaseGenre(name || key);
}

function isJunkGenre(key) {
  if (!key || key.length > 40) return true;
  if (GENRE_JUNK.has(key)) return true;

  return GENRE_JUNK_PATTERNS.some(rx => rx.test(key));
}

// Tags brutas do Last.fm → [{ key, name, count }] limpas, sem duplicatas.
function cleanGenreTags(rawTags, ctx = {}) {
  const artistKey = genreKey(ctx.artist);
  const best = new Map();

  for (const t of arr(rawTags)) {
    const name = String(t?.name ?? "").replace(/\s+/g, " ").trim();
    const count = Number(t?.count);
    const key = genreKey(name);

    if (!key || isJunkGenre(key)) continue;
    if (artistKey && key === artistKey) continue; // tag que é só o nome do artista
    if (Number.isFinite(count) && count < CFG.genreMinCount) continue;

    const c = Number.isFinite(count) ? count : 0;
    const prev = best.get(key);

    if (!prev || c > prev.count) best.set(key, { key, name, count: c });
  }

  return [...best.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, CFG.genreMaxTags);
}

const recTags = rec => (Array.isArray(rec?.tags) ? rec.tags : []);

function genreRecordFresh(rec) {
  if (!rec || !rec.at) return false;

  const days = rec.status === "found" ? CFG.genreFoundTTLDays : CFG.genreNoneTTLDays;

  return Date.now() - rec.at < days * DAY_MS;
}

// Resolve o estado de gênero de um álbum SÓ pelo cache (sem rede).
function genreInfo(entry) {
  const failed = genreFailures.has(entry.key);
  const missing = { state: failed ? "error" : "pending", tags: [], source: null };

  const albumRec = genreCache.albums[entry.key];

  if (!albumRec) return missing;

  if (albumRec.status === "found" && recTags(albumRec).length) {
    return { state: "found", tags: recTags(albumRec), source: "album" };
  }

  // álbum sem tags úteis → tags do artista (aproximação)
  const akey = artistKeyOf(entry.artists?.[0] || "");

  if (!akey) return { state: "none", tags: [], source: null };

  const artistRec = genreCache.artists[akey];

  if (!artistRec) return missing;

  if (artistRec.status === "found" && recTags(artistRec).length) {
    return { state: "found", tags: recTags(artistRec), source: "artist" };
  }

  return { state: "none", tags: [], source: null };
}

// Precisa de consulta? (includeStale: também registros vencidos)
function needsGenreFetch(entry, includeStale = false) {
  const a = genreCache.albums[entry.key];

  if (!a) return true;
  if (includeStale && !genreRecordFresh(a)) return true;
  if (a.status === "found" && recTags(a).length) return false;

  const akey = artistKeyOf(entry.artists?.[0] || "");

  if (!akey) return false;

  const r = genreCache.artists[akey];

  if (!r) return true;

  return includeStale && !genreRecordFresh(r);
}

// Uma chamada ao Last.fm. Devolve { notFound, tags } ou LANÇA erro (falha temporária).
async function lastfmTopTags(method, params) {
  const query = new URLSearchParams({
    method,
    api_key: CFG.lastfmKey,
    autocorrect: "1",
    format: "json",
    ...params
  });

  const response = await fetch(`${CFG.lastfmURL}?${query.toString()}`);

  let data = null;

  try {
    data = await response.json();
  } catch {}

  if (data && data.error) {
    // 6 = álbum/artista não encontrado → resposta definitiva
    if (Number(data.error) === 6) return { notFound: true, tags: [] };

    const err = new Error(data.message || `Last.fm error ${data.error}`);

    err.rateLimited = Number(data.error) === 29;

    throw err;
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);

    err.rateLimited = response.status === 429;

    throw err;
  }

  if (!data || typeof data !== "object" || !data.toptags) {
    throw new Error("Resposta inválida do Last.fm");
  }

  return { notFound: false, tags: arr(data.toptags.tag) };
}

// album.getTopTags; se não achar, tenta de novo sem "(Deluxe Edition)" etc.
async function fetchAlbumTags(artist, albumName) {
  const names = [albumName];
  const stripped = stripEdition(albumName);

  if (stripped && stripped !== albumName) names.push(stripped);

  let last = { notFound: true, tags: [] };

  for (const name of names) {
    const res = await lastfmTopTags("album.getTopTags", { artist, album: name });

    if (!res.notFound && res.tags.length) return res;

    last = res;
  }

  return last;
}

// artist.getTopTags (compartilhado entre os álbuns do mesmo artista)
function ensureArtistGenres(akey, artist, run) {
  const rec = genreCache.artists[akey];
  const needs = !rec || !genreRecordFresh(rec) || (run.force && !run.refreshedArtists.has(akey));

  if (!needs) return Promise.resolve(rec);
  if (genreArtistInflight.has(akey)) return genreArtistInflight.get(akey);

  const promise = (async () => {
    const res = await lastfmTopTags("artist.getTopTags", { artist });
    const tags = cleanGenreTags(res.tags, { artist });

    const next = { status: tags.length ? "found" : "none", tags, at: Date.now() };

    genreCache.artists[akey] = next;
    run.refreshedArtists.add(akey);
    saveGenreCache();

    return next;
  })().finally(() => genreArtistInflight.delete(akey));

  genreArtistInflight.set(akey, promise);

  return promise;
}

// Consulta um álbum: tags do álbum e, se não houver, as do artista.
// Falha de rede/API LANÇA erro e NÃO grava nada como "sem gênero".
async function loadEntryGenres(entry, run) {
  const artist = entry.artists?.[0] || "";

  if (!artist) return;

  const akey = artistKeyOf(artist);

  let albumRec = genreCache.albums[entry.key];

  if (run.force || !albumRec || !genreRecordFresh(albumRec)) {
    const res = await fetchAlbumTags(artist, entry.name);
    const tags = cleanGenreTags(res.tags, { artist });

    albumRec = { status: tags.length ? "found" : "none", tags, at: Date.now() };

    genreCache.albums[entry.key] = albumRec;
    saveGenreCache();
  }

  if (albumRec.status === "found" && recTags(albumRec).length) return;
  if (!akey) return;

  await ensureArtistGenres(akey, artist, run);
}

function cancelGenreLoad(message = "") {
  genreRun++;
  genreBusy = false;
  genreProgress = null;
  genreMessage = message;
}

// Carga incremental com concorrência limitada.
// Uma nova carga (ou cancelamento) invalida a anterior: ela para no próximo item
// e não mexe mais na interface (o cache já gravado continua válido).
async function loadGenres(entries, { force = false, onProgress = null } = {}) {
  const token = ++genreRun;
  const run = { token, force, refreshedArtists: new Set() };

  const seen = new Set();
  const todo = [];

  for (const entry of entries) {
    if (!entry.artists?.length || seen.has(entry.key)) continue;

    seen.add(entry.key);

    if (force || needsGenreFetch(entry, true)) todo.push(entry);
  }

  const outcome = { total: todo.length, done: 0, failed: 0, aborted: false, cancelled: false };

  if (!todo.length) return outcome;

  genreBusy = true;
  genreProgress = { done: 0, total: todo.length, failed: 0 };
  paintGenreMeta();

  let cursor = 0;
  let consecutive = 0;

  async function worker() {
    while (token === genreRun && !outcome.aborted) {
      const index = cursor++;

      if (index >= todo.length) break;

      const entry = todo[index];

      try {
        await loadEntryGenres(entry, run);

        genreFailures.delete(entry.key);
        consecutive = 0;
      } catch (error) {
        outcome.failed++;
        consecutive++;

        genreFailures.add(entry.key);

        console.warn(`[Roleta V0.42] Falha temporária ao consultar gêneros de "${entry.name}" — ${entry.artists[0]}:`, error);

        if (consecutive >= CFG.genreMaxConsecutiveFailures) outcome.aborted = true;
        if (error?.rateLimited) await sleep(4000);
      }

      outcome.done++;

      if (token !== genreRun) break;

      genreProgress = { done: outcome.done, total: todo.length, failed: outcome.failed };

      if (onProgress) onProgress(outcome.done, todo.length, outcome.failed);

      paintGenreMeta();

      // atualização incremental da lista e das estatísticas
      if (outcome.done % 10 === 0) {
        paintGenreList();
        refreshStats();
      }
    }
  }

  const amount = Math.min(CFG.genreConcurrency, todo.length);

  await Promise.all(Array.from({ length: amount }, worker));

  saveGenreCache(true);

  if (token === genreRun) {
    genreBusy = false;
    genreProgress = null;
  } else {
    outcome.cancelled = true;
  }

  return outcome;
}

function describeGenreOutcome(outcome) {
  if (outcome.cancelled) return "";

  if (outcome.aborted) {
    return `⚠️ Carga interrompida após falhas seguidas no Last.fm (${outcome.failed} falha${outcome.failed === 1 ? "" : "s"}). ` +
      "Verifique a conexão e tente de novo — falhas não são gravadas como “sem gênero”.";
  }

  if (outcome.failed > 0) {
    return `⚠️ ${outcome.failed} de ${outcome.total} álbuns falharam. Clique em “Carregar gêneros” para tentar de novo — ` +
      "falhas não são gravadas como “sem gênero”.";
  }

  if (!outcome.total) return "Todos os álbuns do conjunto atual já tinham gêneros em cache.";

  return `✅ ${outcome.done} álbum${outcome.done === 1 ? "" : "s"} consultado${outcome.done === 1 ? "" : "s"}.`;
}

function genreCoverage(list) {
  const cov = { total: 0, found: 0, none: 0, pending: 0, error: 0 };

  for (const entry of list) {
    cov.total++;
    cov[genreInfo(entry).state]++;
  }

  return cov;
}

// gênero → { key, label, count } para os álbuns de uma lista
function buildGenreIndex(list) {
  const map = new Map();

  for (const entry of list) {
    const info = genreInfo(entry);

    if (info.state !== "found") continue;

    for (const t of info.tags) {
      let g = map.get(t.key);

      if (!g) {
        g = { key: t.key, label: genreLabel(t.key, t.name), count: 0 };
        map.set(t.key, g);
      }

      g.count++;
    }
  }

  return map;
}


// ============================================================
// FILTROS
// ============================================================

// Filtros do acervo só valem quando "Já catalogado" está selecionado.
const catalogMode = () => state.catalog === "catalogued";
const ratingActive = () => catalogMode() && state.ratingEnabled;
const timeActive = () => catalogMode() && state.timeEnabled;
const scrobblesActive = () => catalogMode() && state.scrobblesEnabled; // V0.42

// V0.41 — o filtro de gêneros vale em TODOS os modos
const genreActive = () => Array.isArray(state.genres) && state.genres.length > 0;

function currentPool() {
  return catalogMode() ? catalogEntries : spotifyLibrary;
}

function timeThreshold() {
  const d = new Date();
  const n = Math.max(1, Number(state.timeValue) || 1);

  if (state.timeUnit === "days") d.setDate(d.getDate() - n);
  else if (state.timeUnit === "weeks") d.setDate(d.getDate() - 7 * n);
  else if (state.timeUnit === "years") d.setFullYear(d.getFullYear() - n);
  else d.setMonth(d.getMonth() - n);

  return d.getTime();
}

function matchesDurationFilter(album) {
  if (state.duration === "any") return true;

  return durationBucket(album.durationMs) === state.duration;
}

function matchesCatalogFilter(album) {
  if (state.catalog === "catalogued") return album.catalogued;
  if (state.catalog === "uncatalogued") return !album.catalogued;

  return true;
}

// Sem tipo conhecido (nota sem ligação com o Spotify) = passa.
function matchesTypeFilter(album) {
  if (state.type === "any") return true;
  if (!album.albumType) return true;

  return norm(album.albumType) === norm(state.type);
}

function matchesRatingFilter(album) {
  if (!ratingActive()) return true;

  const rating = Number(album.rating);

  if (!(rating > 0)) return false;

  return rating >= state.ratingMin && rating <= state.ratingMax;
}

function matchesTimeFilter(album) {
  if (!timeActive()) return true;

  if (!album.cataloguedAt) return false;

  const threshold = timeThreshold();

  return state.timeMode === "older"
    ? album.cataloguedAt <= threshold
    : album.cataloguedAt >= threshold;
}

// V1.0 — audições por intervalo inclusivo; campo vazio = sem limite.
function matchesScrobblesFilter(album) {
  if (!scrobblesActive()) return true;
  const n = validScrobbles(album.scrobbles);
  if (n === null) return false;
  if (state.scrobblesMin !== null && n < state.scrobblesMin) return false;
  if (state.scrobblesMax !== null && n > state.scrobblesMax) return false;
  return true;
}

function matchesArtistFilter(album) {
  if (state.artist === "all") return true;

  const wanted = norm(state.artist);

  return album.artists.some(a => norm(a) === wanted);
}

// V0.41 — OR ("any") ou AND ("all") sobre os gêneros selecionados.
// Sem gênero identificado (none / pending / error): depende de includeUnknownGenres.
function matchesGenreFilter(album) {
  if (!genreActive()) return true;

  const info = genreInfo(album);

  if (info.state !== "found") return state.includeUnknownGenres === true;

  const have = new Set(info.tags.map(t => t.key));

  return state.genreMatch === "all"
    ? state.genres.every(g => have.has(g))
    : state.genres.some(g => have.has(g));
}

function applyFilters({ skipDuration = false, skipGenre = false } = {}) {
  return currentPool().filter(
    album =>
      (skipDuration || matchesDurationFilter(album)) &&
      matchesCatalogFilter(album) &&
      matchesTypeFilter(album) &&
      matchesRatingFilter(album) &&
      matchesTimeFilter(album) &&
      matchesScrobblesFilter(album) &&
      matchesArtistFilter(album) &&
      (skipGenre || matchesGenreFilter(album))
  );
}

// V0.41 — álbuns que passam em tudo, exceto duração e gênero
// (é sobre eles que a lista de gêneros e a carga de tags trabalham)
const genrePool = () => applyFilters({ skipDuration: true, skipGenre: true });


// ============================================================
// ESTATÍSTICAS
// ============================================================

const countDurations = () => currentPool().filter(a => a.durationMs > 0).length;
const countBySource = source => currentPool().filter(a => a.durationSource === source).length;
const countCatalogued = () => spotifyLibrary.filter(a => a.catalogued).length;

function unitLabel(n, unit) {
  const one = { days: "dia", weeks: "semana", months: "mês", years: "ano" }[unit];
  const many = { days: "dias", weeks: "semanas", months: "meses", years: "anos" }[unit];

  return n === 1 ? one : many;
}

function describeTime() {
  const n = Math.max(1, Number(state.timeValue) || 1);
  const unit = `${n} ${unitLabel(n, state.timeUnit)}`;

  return state.timeMode === "older"
    ? `Catalogados há mais de ${unit}.`
    : `Catalogados nos últimos ${unit}.`;
}

// ============================================================
// VISUAL
// ============================================================

document.getElementById("roleta-v04-style")?.remove();

const style = document.createElement("style");

style.id = "roleta-v04-style";

style.textContent = `
.roleta-v04 {
 --nt-bg:#191d23; --nt-surface:#22272e; --nt-surface-2:#292f38;
 --nt-line:#383f48; --nt-ink:#e9edf0; --nt-muted:#a0aab5;
 --nt-accent:#8ca9c7; --nt-accent-bg:#2a3949;
 display:flex; flex-direction:column; gap:15px; width:100%; max-width:990px;
 min-width:0; margin:0 auto; padding:24px 26px 34px; background:var(--nt-bg);
 color:var(--nt-ink); border:1px solid var(--nt-line); border-radius:10px;
 font-family:var(--font-interface),system-ui,sans-serif; font-size:14px; line-height:1.5;
}
.roleta-v04,.roleta-v04 * {box-sizing:border-box}
.roleta-v04 > * {min-width:0;max-width:100%}
.roleta-v04 button,.roleta-v04 input,.roleta-v04 select {font:inherit;box-shadow:none!important}
.roleta-v04 button:focus-visible,.roleta-v04 input:focus-visible,.roleta-v04 select:focus-visible,.roleta-v04 summary:focus-visible {outline:2px solid var(--nt-accent);outline-offset:2px}
.roleta-hero {padding:8px 2px 14px;border-bottom:1px solid var(--nt-line)}
.roleta-eyebrow {font-size:10px;letter-spacing:.19em;font-weight:750;color:var(--nt-accent)}
.roleta-hero-title {font-size:clamp(25px,4vw,35px);font-weight:750;letter-spacing:-.045em;line-height:1.16;margin:9px 0 7px}
.roleta-hero-subtitle {font-size:12px;color:var(--nt-muted);line-height:1.65}
.roleta-panel {padding:19px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);min-width:0}
.roleta-section-title {margin-bottom:13px}
.roleta-section-title-main {font-size:16px;font-weight:750;letter-spacing:-.02em}
.roleta-section-title-sub {font-size:12px;color:var(--nt-muted);margin-top:4px}
.roleta-modes {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:16px}
.roleta-modes .roleta-mode {display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;min-height:65px;padding:11px 13px;text-align:left;background:var(--nt-bg)!important;border:1px solid var(--nt-line)!important;border-radius:5px!important;color:var(--nt-ink)!important;cursor:pointer}
.roleta-modes .roleta-mode.active {background:var(--nt-accent-bg)!important;border-color:var(--nt-accent)!important}
.roleta-mode-name {font-size:13px;font-weight:750}
.roleta-mode-desc {font-size:11px;color:var(--nt-muted);line-height:1.4}
/* Beta 3.1: Obsidian Mobile pode impor white-space:nowrap aos botoes. */
.roleta-modes .roleta-mode {width:100%;max-width:100%;height:auto;box-sizing:border-box;white-space:normal!important;overflow-wrap:anywhere;word-break:normal}
.roleta-modes .roleta-mode .roleta-mode-name,
.roleta-modes .roleta-mode .roleta-mode-desc {display:block;width:100%;max-width:100%;min-width:0;white-space:normal!important;overflow-wrap:anywhere;word-break:normal;text-overflow:clip;}

.roleta-controls {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.roleta-control {display:flex;flex-direction:column;gap:5px;min-width:0}
.roleta-control label {font-size:10px;letter-spacing:.06em;font-weight:700;color:var(--nt-muted)}
.roleta-control select,.roleta-control input,.roleta-time-row select,.roleta-time-row input,.roleta-genre-options select,.roleta-genre-search {width:100%;min-width:0;min-height:37px;padding:8px 10px;background:var(--nt-bg)!important;color:var(--nt-ink)!important;border:1px solid var(--nt-line)!important;border-radius:5px!important;font-size:12px}
.roleta-control select:focus,.roleta-control input:focus {border-color:var(--nt-accent)!important}
.roleta-source {margin-top:12px;font-size:11px;color:var(--nt-muted)}
.roleta-fold {margin-top:11px;border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-bg);min-width:0;overflow:hidden}
.roleta-fold > summary {display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;cursor:pointer;font-size:12px;font-weight:750;list-style:none}
.roleta-fold > summary::-webkit-details-marker {display:none}
.roleta-fold > summary::after {content:'⌄';color:var(--nt-muted);font-size:15px;margin-left:8px}
.roleta-fold[open] > summary::after {transform:rotate(180deg)}
.roleta-fold[open] > summary {border-bottom:1px solid var(--nt-line)}
.roleta-fold-count {margin-left:auto;font-size:10px;color:var(--nt-muted);font-weight:500}
.roleta-acervo,.roleta-genre-content {padding:14px;display:flex;flex-direction:column;gap:12px;min-width:0}
.roleta-acervo > div + div {border-top:1px solid var(--nt-line);padding-top:12px}
.roleta-group-head {display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.roleta-switch {display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650;cursor:pointer}
.roleta-switch input {accent-color:var(--nt-accent);margin:0}
.roleta-group-value {font-size:11px;font-weight:700;color:var(--nt-accent)}
.roleta-group-value.is-off {color:var(--nt-muted)}
.roleta-group-body {margin-top:10px}
.roleta-group-body.is-off {opacity:.42;pointer-events:none}
.roleta-range {position:relative;height:30px;margin:0 8px}
.roleta-range-track,.roleta-range-fill {position:absolute;top:12px;height:6px;border-radius:3px}
.roleta-range-track {left:0;right:0;background:var(--nt-line)}
.roleta-range-fill {background:var(--nt-accent)}
.roleta-range input[type=range] {position:absolute;left:-8px;width:calc(100% + 16px);top:0;height:30px;margin:0;background:none;pointer-events:none;-webkit-appearance:none;appearance:none}
.roleta-range input[type=range]::-webkit-slider-runnable-track {background:none;border:0;height:30px}
.roleta-range input[type=range]::-webkit-slider-thumb {-webkit-appearance:none;pointer-events:auto;width:18px;height:18px;margin-top:6px;border-radius:50%;background:var(--nt-accent);border:2px solid var(--nt-bg);cursor:pointer}
.roleta-range input[type=range]::-moz-range-track {background:none;border:0}
.roleta-range input[type=range]::-moz-range-thumb {pointer-events:auto;width:16px;height:16px;border-radius:50%;background:var(--nt-accent);border:2px solid var(--nt-bg);cursor:pointer}
.roleta-range-scale {display:flex;justify-content:space-between;font-size:10px;color:var(--nt-muted)}
.roleta-time-row {display:flex;gap:8px;flex-wrap:wrap}
.roleta-time-row select {flex:1;min-width:130px}
.roleta-time-row input {width:90px;flex:0 0 90px}
.roleta-scrob-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.roleta-hint {margin-top:7px;font-size:11px;color:var(--nt-muted);line-height:1.5}
.roleta-genre-toolbar {display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.roleta-genre-toolbar button,.roleta-buttons button,.roleta-result-buttons button {padding:8px 12px!important;min-height:34px;background:transparent!important;color:var(--nt-muted)!important;border:1px solid var(--nt-line)!important;border-radius:5px!important;font-size:12px!important;font-weight:650;cursor:pointer}
.roleta-genre-toolbar button:hover,.roleta-buttons button:hover,.roleta-result-buttons button:hover {color:var(--nt-ink)!important;border-color:var(--nt-accent)!important}
.roleta-genre-toolbar button:disabled,.roleta-buttons button:disabled,.roleta-result-buttons button:disabled {opacity:.5;cursor:default}
.roleta-genre-count-label {margin-left:auto;font-size:11px;color:var(--nt-accent)}
.roleta-genre-status {font-size:11px;color:var(--nt-muted);overflow-wrap:anywhere}
.roleta-genre-status.is-warn {color:#d7a1a1}
.roleta-genre-advanced {border:1px solid var(--nt-line);border-radius:5px;padding:9px 11px}
.roleta-genre-advanced summary {font-size:11px;color:var(--nt-muted);cursor:pointer}
.roleta-genre-options {display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px}
.roleta-genre-options select {width:auto;max-width:100%}
.roleta-genre-list {display:flex;flex-wrap:wrap;align-content:flex-start;gap:6px;max-height:190px;overflow-y:auto;padding:9px;border:1px solid var(--nt-line);border-radius:5px;background:var(--nt-surface)}
.roleta-genre-chip {display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:5px 9px!important;border:1px solid var(--nt-line)!important;border-radius:4px!important;background:var(--nt-bg)!important;color:var(--nt-ink)!important;font-size:11px!important;font-weight:650;cursor:pointer;overflow-wrap:anywhere}
.roleta-genre-chip.is-selected {background:var(--nt-accent-bg)!important;border-color:var(--nt-accent)!important;color:#c4d8eb!important}
.roleta-genre-count {font-size:10px;opacity:.7}
.roleta-genre-empty {padding:7px;font-size:11px;color:var(--nt-muted)}
.roleta-buttons {display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}
.roleta-buttons button:first-child {background:var(--nt-accent)!important;border-color:var(--nt-accent)!important;color:#101b25!important}
.roleta-stats {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.roleta-stat {padding:12px 14px;border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-surface)}
.roleta-stat-value {font-size:21px;font-weight:750;letter-spacing:-.035em}
.roleta-stat-label {font-size:11px;color:var(--nt-muted);margin-top:4px}
.roleta-result-empty {padding:19px;background:var(--nt-bg);border:1px dashed var(--nt-line);border-radius:5px;color:var(--nt-muted);font-size:12px}
.roleta-result-card {display:flex;gap:17px;align-items:center}
.roleta-cover {width:135px;height:135px;flex:0 0 135px;border-radius:5px;overflow:hidden;background:var(--nt-surface-2);display:flex;align-items:center;justify-content:center;color:var(--nt-muted);font-size:28px}
.roleta-cover img {width:100%;height:100%;object-fit:cover;display:block}
.roleta-result-body {min-width:0;flex:1}
.roleta-result-eyebrow {font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--nt-accent);font-weight:750}
.roleta-result-title {margin-top:5px;font-size:20px;font-weight:750;letter-spacing:-.03em;overflow-wrap:anywhere}
.roleta-result-artist {font-size:12px;color:var(--nt-accent);margin-top:4px}
.roleta-result-meta {display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.roleta-tag {padding:3px 7px;border:1px solid var(--nt-line);border-radius:4px;background:var(--nt-bg);color:var(--nt-muted);font-size:10px}
.roleta-result-buttons {display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}
.roleta-loading {padding:12px 0;color:var(--nt-muted);font-size:12px}
.roleta-error {padding:12px;border:1px solid #915d5d;border-radius:5px;color:#e4b1b1;font-size:12px}
@media(max-width:600px){
 .roleta-v04 {padding:17px 14px 24px}
 .roleta-panel {padding:14px}
 .roleta-modes {grid-template-columns:repeat(2,minmax(0,1fr))}
 .roleta-mode-desc {font-size:10px}
 .roleta-stats {grid-template-columns:repeat(2,minmax(0,1fr))}
 .roleta-result-card {flex-direction:column;align-items:stretch}
 .roleta-cover {width:125px;height:125px;flex-basis:125px}
 .roleta-genre-count-label {margin-left:0}
}
@media(max-width:380px){.roleta-controls{grid-template-columns:1fr}}
`;

style.textContent += `
/* V1.2 Beta 3 — navegação em duas etapas e painel adaptativo */
.roleta-beta-adaptive-status{font-size:12px;color:var(--nt-muted);padding:8px 10px;border:1px solid var(--nt-line);border-radius:6px}
.roleta-v04.roleta-beta-play {max-width:1100px;width:100%;min-height:72vh}
.roleta-beta-play .roleta-controls-panel,.roleta-beta-play .roleta-stats,.roleta-beta-play .roleta-hero {display:none!important}
.roleta-beta-config .roleta-result-panel {display:none!important}
.roleta-beta-play .roleta-result-panel {flex:1;display:flex;flex-direction:column;gap:16px}
.roleta-beta-play .roleta-result-panel > .roleta-section-title {display:none}
.roleta-beta-play .roleta-result-card {align-items:center;gap:25px}
.roleta-beta-play .roleta-cover {width:min(29vw,310px);height:min(29vw,310px);flex:0 0 min(29vw,310px)}
.roleta-beta-play .roleta-result-title {font-size:clamp(23px,3vw,35px)}
.roleta-beta-toolbar {display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.roleta-beta-toolbar-title {font-size:19px;font-weight:750}
.roleta-beta-toolbar button,.roleta-beta-actions button,.roleta-beta-feedback button {background:transparent!important;color:var(--nt-ink)!important;border:1px solid var(--nt-line)!important;border-radius:6px!important;padding:9px 12px!important;cursor:pointer;font-size:12px!important}
.roleta-beta-toolbar button:hover,.roleta-beta-actions button:hover,.roleta-beta-feedback button:hover {border-color:var(--nt-accent)!important}
.roleta-beta-actions {display:flex;gap:9px;flex-wrap:wrap}
.roleta-beta-actions .roleta-beta-primary {background:var(--nt-accent)!important;color:#101b25!important;border-color:var(--nt-accent)!important;font-weight:750}
.roleta-beta-actions button:disabled {opacity:.45;cursor:default}
.roleta-beta-feedback,.roleta-beta-history {border:1px solid var(--nt-line);border-radius:7px;padding:13px;background:var(--nt-bg)}
.roleta-beta-feedback summary,.roleta-beta-history summary {cursor:pointer;font-size:13px;font-weight:700}
.roleta-beta-feedback-body {display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.roleta-beta-feedback-note {color:var(--nt-muted);font-size:11px;margin-top:10px}
.roleta-beta-history-list {display:flex;flex-direction:column;gap:8px;margin-top:12px}
.roleta-beta-history-item {display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px;border:1px solid var(--nt-line);border-radius:5px}
.roleta-beta-history-item span {font-size:12px;overflow-wrap:anywhere}
.roleta-beta-history-item button {background:transparent!important;border:1px solid var(--nt-line)!important;border-radius:4px!important;color:var(--nt-ink)!important;padding:5px 8px!important;cursor:pointer;font-size:11px!important}
.roleta-beta-session-note {font-size:11px;color:var(--nt-muted)}
@media(max-width:650px){.roleta-beta-play .roleta-result-card {flex-direction:column;align-items:stretch}.roleta-beta-play .roleta-cover {width:min(75vw,280px);height:min(75vw,280px);flex:0 0 auto}.roleta-beta-actions button {flex:1}}
`;
document.head.appendChild(style);


// ============================================================
// INTERFACE
// ============================================================

const root = dv.container;

root.innerHTML = "";

const wrapper = root.createDiv({ cls: "roleta-v04" });

const hero = wrapper.createDiv({ cls: "roleta-hero" });

hero.createDiv({ cls: "roleta-eyebrow", text: "NOTE TO NOTE / ROULETTE" });
hero.createDiv({ cls: "roleta-hero-title", text: "Roleta Musical" });

hero.createDiv({
  cls: "roleta-hero-subtitle",
  text: "Deixe o acaso escolher seu próximo álbum."
});


// ------------------------------------------------------------
// PAINEL DE FILTROS
// ------------------------------------------------------------

const controlsPanel = wrapper.createDiv({ cls: "roleta-panel roleta-controls-panel" });

const sectionTitle = controlsPanel.createDiv({ cls: "roleta-section-title" });

sectionTitle.createDiv({ cls: "roleta-section-title-main", text: "Filtros" });
sectionTitle.createDiv({ cls: "roleta-section-title-sub", text: "Escolha o modo e ajuste os critérios de seleção." });

const modes = controlsPanel.createDiv({ cls: "roleta-modes" });
function renderModes() {
  modes.innerHTML = "";
  for (const option of [
    { id: "random", name: "Aleatório", desc: "Chances iguais para todos os candidatos" },
    { id: "surprise", name: "Surpresa", desc: "Mais variedade de artistas e gêneros" }
  ]) {
    const button = modes.createEl("button", { cls: "roleta-mode" + (state.drawMode === option.id ? " active" : "") });
    button.createSpan({ cls: "roleta-mode-name", text: option.name });
    button.createSpan({ cls: "roleta-mode-desc", text: option.desc });
    button.addEventListener("click", async () => {
      state.drawMode = option.id; saveState(); renderModes(); await refreshStats();
    });
  }
}
renderModes();
const controls = controlsPanel.createDiv({ cls: "roleta-controls" });

function createSelect(label, options, value, onChange) {
  const container = controls.createDiv({ cls: "roleta-control" });

  container.createEl("label", { text: label });

  const select = container.createEl("select");

  for (const option of options) {
    const el = select.createEl("option", { text: option.label, value: option.value });

    if (option.value === value) el.selected = true;
  }

  select.addEventListener("change", async () => {
    await onChange(select.value);
  });

  return select;
}

createSelect(
  "Duração",
  [
    { label: "Qualquer duração", value: "any" },
    { label: "Curto — até 30 min", value: "short" },
    { label: "Médio — 31–55 min", value: "medium" },
    { label: "Longo — 56–89 min", value: "long" },
    { label: "Épico — 90+ min", value: "epic" }
  ],
  state.duration,
  async value => {
    state.duration = value;
    saveState();
    await refreshStats();
  }
);

createSelect(
  "Catálogo",
  [
    { label: "Qualquer", value: "any" },
    { label: "Catalogado", value: "catalogued" },
    { label: "Não catalogado", value: "uncatalogued" }
  ],
  state.catalog,
  async value => {
    await onCatalogChange(value);
  }
);

createSelect(
  "Tipo",
  [
    { label: "Álbum", value: "album" },
    { label: "Qualquer tipo", value: "any" },
    { label: "Single", value: "single" },
    { label: "Compilação", value: "compilation" }
  ],
  state.type,
  async value => {
    state.type = value;
    saveState();
    await refreshStats();
  }
);

let artistSelect = createSelect(
  "Artista",
  [{ label: "Todos os artistas", value: "all" }],
  "all",
  async value => {
    state.artist = value;
    saveState();
    await refreshStats();
  }
);

const sourceLine = controlsPanel.createDiv({ cls: "roleta-source" });

// Filtros do acervo: só existem no modo "Já catalogado"
const acervoDetails = controlsPanel.createEl("details", { cls: "roleta-fold" });
acervoDetails.createEl("summary", { text: "Filtros do acervo" });
const acervoBox = acervoDetails.createDiv({ cls: "roleta-acervo" });

// Filtro de gêneros (V0.41): vale em todos os modos
const genreDetails = controlsPanel.createEl("details", { cls: "roleta-fold" });
const genreSummary = genreDetails.createEl("summary", { text: "Gêneros musicais" });
const genreSummaryCount = genreSummary.createSpan({ cls: "roleta-fold-count" });
const genreBox = genreDetails.createDiv({ cls: "roleta-genre-content" });


// ------------------------------------------------------------
// FILTRO DE NOTA (intervalo 1–10) + TEMPO (cataloguedAt)
// ------------------------------------------------------------

const fmtRating = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function renderAcervoFilters() {
  acervoBox.innerHTML = "";
  acervoDetails.style.display = catalogMode() ? "" : "none";

  if (!catalogMode()) return;



  // ---------------- NOTA ----------------
  const rating = acervoBox.createDiv();
  const ratingHead = rating.createDiv({ cls: "roleta-group-head" });

  const ratingSwitch = ratingHead.createEl("label", { cls: "roleta-switch" });
  const ratingCheck = ratingSwitch.createEl("input", { type: "checkbox" });

  ratingCheck.checked = state.ratingEnabled;
  ratingSwitch.createSpan({ text: "Filtrar por nota" });

  const ratingValue = ratingHead.createDiv({ cls: "roleta-group-value" });
  const ratingBody = rating.createDiv({ cls: "roleta-group-body" });

  const range = ratingBody.createDiv({ cls: "roleta-range" });

  range.createDiv({ cls: "roleta-range-track" });

  const fill = range.createDiv({ cls: "roleta-range-fill" });

  const makeSlider = value => {
    const input = range.createEl("input", { type: "range" });

    input.min = String(CFG.ratingMin);
    input.max = String(CFG.ratingMax);
    input.step = String(CFG.ratingStep);
    input.value = String(value);

    return input;
  };

  const minInput = makeSlider(state.ratingMin);
  const maxInput = makeSlider(state.ratingMax);

  const scale = ratingBody.createDiv({ cls: "roleta-range-scale" });

  for (let i = CFG.ratingMin; i <= CFG.ratingMax; i++) scale.createSpan({ text: String(i) });

  const span = CFG.ratingMax - CFG.ratingMin;

  function paintRating() {
    const a = ((state.ratingMin - CFG.ratingMin) / span) * 100;
    const b = ((state.ratingMax - CFG.ratingMin) / span) * 100;

    fill.style.left = `${a}%`;
    fill.style.width = `${b - a}%`;

    // quando os dois polegares ficam juntos no fim, o mínimo precisa ficar por cima
    minInput.style.zIndex = state.ratingMin >= CFG.ratingMax - 1 ? "5" : "3";
    maxInput.style.zIndex = "4";

    ratingValue.textContent = state.ratingEnabled
      ? `${fmtRating(state.ratingMin)} – ${fmtRating(state.ratingMax)}`
      : "desativado";

    ratingValue.classList.toggle("is-off", !state.ratingEnabled);
    ratingBody.classList.toggle("is-off", !state.ratingEnabled);
  }

  minInput.addEventListener("input", async () => {
    state.ratingMin = Math.min(Number(minInput.value), state.ratingMax);
    minInput.value = String(state.ratingMin);
    saveState();
    paintRating();
    await refreshStats();
  });

  maxInput.addEventListener("input", async () => {
    state.ratingMax = Math.max(Number(maxInput.value), state.ratingMin);
    maxInput.value = String(state.ratingMax);
    saveState();
    paintRating();
    await refreshStats();
  });

  ratingCheck.addEventListener("change", async () => {
    state.ratingEnabled = ratingCheck.checked;
    saveState();
    paintRating();
    await refreshStats();
  });

  paintRating();

  // ---------------- TEMPO ----------------
  const time = acervoBox.createDiv();
  const timeHead = time.createDiv({ cls: "roleta-group-head" });

  const timeSwitch = timeHead.createEl("label", { cls: "roleta-switch" });
  const timeCheck = timeSwitch.createEl("input", { type: "checkbox" });

  timeCheck.checked = state.timeEnabled;
  timeSwitch.createSpan({ text: "Filtrar por tempo de catalogação" });

  const timeValueLabel = timeHead.createDiv({ cls: "roleta-group-value" });
  const timeBody = time.createDiv({ cls: "roleta-group-body" });
  const row = timeBody.createDiv({ cls: "roleta-time-row" });

  const modeSelect = row.createEl("select");

  for (const [value, label] of [["older", "Catalogados há mais de"], ["recent", "Catalogados nos últimos"]]) {
    const o = modeSelect.createEl("option", { text: label, value });

    if (state.timeMode === value) o.selected = true;
  }

  const numberInput = row.createEl("input", { type: "number" });

  numberInput.min = "1";
  numberInput.max = "999";
  numberInput.value = String(state.timeValue);

  const unitSelect = row.createEl("select");

  const buildUnits = () => {
    unitSelect.innerHTML = "";

    for (const unit of ["days", "weeks", "months", "years"]) {
      const o = unitSelect.createEl("option", {
        text: unitLabel(state.timeValue, unit),
        value: unit
      });

      if (state.timeUnit === unit) o.selected = true;
    }
  };

  buildUnits();

  const hint = timeBody.createDiv({ cls: "roleta-hint" });

  function paintTime() {
    timeValueLabel.textContent = state.timeEnabled ? describeTime().replace(/\.$/, "") : "desativado";
    timeValueLabel.classList.toggle("is-off", !state.timeEnabled);
    timeBody.classList.toggle("is-off", !state.timeEnabled);

    const missing = catalogEntries.filter(a => !a.cataloguedAt).length;

    hint.textContent = missing
      ? `${describeTime()} ${missing} nota${missing === 1 ? "" : "s"} sem cataloguedAt ficam de fora.`
      : describeTime();
  }

  const onTimeChange = async () => {
    saveState();
    paintTime();
    await refreshStats();
  };

  modeSelect.addEventListener("change", async () => {
    state.timeMode = modeSelect.value;
    await onTimeChange();
  });

  numberInput.addEventListener("input", async () => {
    const n = Math.max(1, Math.round(Number(numberInput.value) || 1));

    state.timeValue = n;
    buildUnits();
    await onTimeChange();
  });

  unitSelect.addEventListener("change", async () => {
    state.timeUnit = unitSelect.value;
    await onTimeChange();
  });

  timeCheck.addEventListener("change", async () => {
    state.timeEnabled = timeCheck.checked;
    await onTimeChange();
  });

  paintTime();

  // ---------------- AUDIÇÕES (V1.0) ----------------
  const scrobbles = acervoBox.createDiv({ cls: "roleta-filter-group" });
  const scrobblesHead = scrobbles.createDiv({ cls: "roleta-group-head" });
  const scrobblesSwitch = scrobblesHead.createEl("label", { cls: "roleta-switch" });
  const scrobblesCheck = scrobblesSwitch.createEl("input", { type: "checkbox" });
  scrobblesCheck.checked = state.scrobblesEnabled;
  scrobblesSwitch.createSpan({ text: "Filtrar por audições" });
  const scrobblesValueLabel = scrobblesHead.createDiv({ cls: "roleta-group-value" });
  const scrobblesBody = scrobbles.createDiv({ cls: "roleta-group-body" });
  const limits = scrobblesBody.createDiv({ cls: "roleta-scrob-grid" });
  const createLimit = (label, key) => {
    const field = limits.createDiv({ cls: "roleta-control" });
    field.createEl("label", { text: label });
    const input = field.createEl("input", { type: "number" });
    input.min = "0";
    input.step = "1";
    input.placeholder = "Sem limite";
    input.value = state[key] === null ? "" : String(state[key]);
    input.addEventListener("change", async () => {
      const raw = input.value.trim();
      state[key] = raw === "" ? null : Math.max(0, Math.round(Number(raw) || 0));
      input.value = state[key] === null ? "" : String(state[key]);
      saveState(); paintScrobbles(); await refreshStats();
    });
    return input;
  };
  createLimit("Mínimo", "scrobblesMin");
  createLimit("Máximo", "scrobblesMax");
  const scrobblesHint = scrobblesBody.createDiv({ cls: "roleta-hint" });
  function paintScrobbles() {
    const { scrobblesMin: min, scrobblesMax: max } = state;
    const invalid = min !== null && max !== null && min > max;
    scrobblesValueLabel.textContent = !state.scrobblesEnabled ? "desativado"
      : invalid ? "intervalo inválido"
      : min === null && max === null ? "qualquer quantidade"
      : min !== null && max !== null ? `${min}–${max}`
      : min !== null ? `a partir de ${min}` : `até ${max}`;
    scrobblesValueLabel.classList.toggle("is-off", !state.scrobblesEnabled);
    scrobblesBody.classList.toggle("is-off", !state.scrobblesEnabled);
    scrobblesHint.textContent = invalid
      ? "O mínimo não pode ser maior que o máximo."
      : "Limites inclusivos; deixe um campo vazio para não limitar. Notas sem scrobbles válidos ficam de fora.";
  }
  scrobblesCheck.addEventListener("change", async () => {
    state.scrobblesEnabled = scrobblesCheck.checked;
    saveState(); paintScrobbles(); await refreshStats();
  });
  paintScrobbles();
}

// ------------------------------------------------------------
// FILTRO DE GÊNEROS (V0.41)
// ------------------------------------------------------------
// O bloco é montado UMA vez por initialize(); depois só o texto de status
// (paintGenreMeta) e a lista de chips (paintGenreList) são repintados —
// assim o campo de busca não perde o foco a cada clique.

function renderGenreFilters() {
  genreBox.innerHTML = "";
  genreUI = null;



  genreBox.createDiv({
    cls: "roleta-hint",
    text:
      "Restringe o sorteio a álbuns com os gêneros escolhidos, usando as tags do Last.fm. " +
      "Se o álbum não tiver tags próprias, usa as do artista (aproximação). " +
      "Vale em todos os modos e junto com os demais filtros."
  });

  const toolbar = genreBox.createDiv({ cls: "roleta-genre-toolbar" });

  const loadBtn = toolbar.createEl("button", { text: "🏷️ Carregar gêneros" });
  const refreshBtn = toolbar.createEl("button", { text: "↻ Atualizar metadados" });
  const clearBtn = toolbar.createEl("button", { text: "✕ Limpar seleção" });
  const countLabel = toolbar.createDiv({ cls: "roleta-genre-count-label" });

  const status = genreBox.createDiv({ cls: "roleta-genre-status" });

  const advanced = genreBox.createEl("details", { cls: "roleta-genre-advanced" });
  advanced.createEl("summary", { text: "Opções de combinação" });
  const options = advanced.createDiv({ cls: "roleta-genre-options" });

  const matchSelect = options.createEl("select");

  for (const [value, label] of [
    ["any", "Qualquer gênero selecionado (OR)"],
    ["all", "Todos os gêneros selecionados (AND)"]
  ]) {
    const o = matchSelect.createEl("option", { text: label, value });

    if (state.genreMatch === value) o.selected = true;
  }

  const unknownSwitch = options.createEl("label", { cls: "roleta-switch" });
  const unknownCheck = unknownSwitch.createEl("input", { type: "checkbox" });

  unknownCheck.checked = state.includeUnknownGenres;
  unknownSwitch.createSpan({ text: "Incluir álbuns sem gênero identificado" });

  const search = genreBox.createEl("input", { type: "text", cls: "roleta-genre-search" });

  search.placeholder = "Pesquisar gênero…";
  search.value = genreSearch;

  const list = genreBox.createDiv({ cls: "roleta-genre-list" });

  genreUI = { loadBtn, refreshBtn, clearBtn, countLabel, status, matchSelect, unknownCheck, search, list };

  loadBtn.addEventListener("click", async () => {
    // durante uma carga, o mesmo botão vira "Parar"
    if (genreBusy) {
      cancelGenreLoad("Carregamento interrompido. O que já foi consultado ficou salvo.");
      paintGenreMeta();
      await refreshStats();

      return;
    }

    await runGenreLoad(false);
  });

  refreshBtn.addEventListener("click", async () => {
    if (genreBusy) return;

    await runGenreLoad(true);
  });

  clearBtn.addEventListener("click", async () => {
    state.genres = [];
    saveState();
    paintGenreMeta();
    await refreshStats();
  });

  matchSelect.addEventListener("change", async () => {
    state.genreMatch = matchSelect.value === "all" ? "all" : "any";
    saveState();
    await refreshStats();
  });

  unknownCheck.addEventListener("change", async () => {
    state.includeUnknownGenres = unknownCheck.checked;
    saveState();
    await refreshStats();
  });

  search.addEventListener("input", () => {
    genreSearch = search.value;
    paintGenreList();
  });

  paintGenreMeta();
  paintGenreList();
}

async function toggleGenre(key) {
  const set = new Set(state.genres);

  if (set.has(key)) set.delete(key);
  else set.add(key);

  state.genres = [...set];

  saveState();
  paintGenreMeta();

  // refreshStats também repinta a lista de gêneros
  await refreshStats();
}

// Carga manual (botões "Carregar gêneros" / "Atualizar metadados")
async function runGenreLoad(force) {
  if (!lastfmEnabled()) {
    genreMessage = "⚠️ Last.fm não está configurado (CFG.lastfmKey).";
    paintGenreMeta();

    return;
  }

  const entries = genrePool();

  if (!entries.length) {
    genreMessage = "Não há álbuns no conjunto atual para consultar.";
    paintGenreMeta();

    return;
  }

  genreMessage = "";

  const outcome = await loadGenres(entries, { force });

  // se foi cancelada (Parar, troca de modo, nova carga), quem cancelou cuida da mensagem
  if (!outcome.cancelled) genreMessage = describeGenreOutcome(outcome);

  paintGenreMeta();
  paintGenreList();

  await refreshStats();
}

function paintGenreMeta() {
  const ui = genreUI;

  if (!ui || !ui.status.isConnected) return;

  const n = state.genres.length;

  genreSummaryCount.textContent = n ? `${n} selecionado${n === 1 ? "" : "s"}` : "Nenhum selecionado";
  ui.countLabel.textContent = n
    ? `${n} gênero${n === 1 ? "" : "s"} selecionado${n === 1 ? "" : "s"}`
    : "nenhum gênero selecionado";

  ui.clearBtn.disabled = n === 0;
  ui.loadBtn.textContent = genreBusy ? "⏹ Parar" : "🏷️ Carregar gêneros";
  ui.refreshBtn.disabled = genreBusy;

  ui.matchSelect.value = state.genreMatch;
  ui.unknownCheck.checked = state.includeUnknownGenres;

  let text;

  if (genreBusy && genreProgress) {
    const p = genreProgress;

    text = `⏳ Consultando o Last.fm: ${p.done}/${p.total}` +
      (p.failed ? ` · ${p.failed} falha${p.failed === 1 ? "" : "s"}` : "");
  } else if (genreMessage) {
    text = genreMessage;
  } else {
    const cov = genreCoverage(genrePool());

    text = `${cov.found} com gêneros · ${cov.none} sem tags úteis · ${cov.pending} ainda não consultados` +
      (cov.error ? ` · ${cov.error} com falha` : "") +
      ` (de ${cov.total} no conjunto atual).`;

    if (!lastfmEnabled()) text += " Last.fm não configurado.";
  }

  ui.status.textContent = text;
  ui.status.classList.toggle("is-warn", text.startsWith("⚠️"));
}

function paintGenreList() {
  const ui = genreUI;

  if (!ui || !ui.list.isConnected) return;

  const list = ui.list;
  const top = list.scrollTop;

  const index = buildGenreIndex(genrePool());
  const q = genreKey(genreSearch);
  const selected = new Set(state.genres);

  list.innerHTML = "";

  const chip = g => {
    const on = selected.has(g.key);
    const el = list.createEl("button", { cls: "roleta-genre-chip" + (on ? " is-selected" : "") });

    el.setAttribute("type", "button");
    el.setAttribute("aria-pressed", String(on));
    el.setAttribute("title", on ? "Clique para remover" : "Clique para selecionar");

    el.createSpan({ text: g.label });
    el.createSpan({ cls: "roleta-genre-count", text: String(g.count) });

    el.addEventListener("click", () => toggleGenre(g.key));
  };

  // selecionados primeiro (sempre visíveis, mesmo sem álbuns no conjunto atual)
  for (const key of state.genres) {
    chip(index.get(key) || { key, label: genreLabel(key), count: 0 });
  }

  const rest = [...index.values()]
    .filter(g => !selected.has(g.key) && (!q || g.key.includes(q) || genreKey(g.label).includes(q)))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));

  for (const g of rest.slice(0, CFG.genreListLimit)) chip(g);

  if (rest.length > CFG.genreListLimit) {
    list.createDiv({
      cls: "roleta-genre-empty",
      text: `Mostrando ${CFG.genreListLimit} de ${rest.length} gêneros — use a busca para refinar.`
    });
  }

  if (!index.size && !state.genres.length) {
    list.createDiv({
      cls: "roleta-genre-empty",
      text: lastfmEnabled()
        ? "Nenhum gênero disponível ainda. Clique em “🏷️ Carregar gêneros” para consultar o Last.fm."
        : "Nenhum gênero disponível: o Last.fm não está configurado."
    });
  } else if (q && !rest.length) {
    list.createDiv({ cls: "roleta-genre-empty", text: "Nenhum gênero corresponde à busca." });
  }

  list.scrollTop = top;
}


// ------------------------------------------------------------
// BOTÕES
// ------------------------------------------------------------

const buttons = controlsPanel.createDiv({ cls: "roleta-buttons" });

const drawButton = buttons.createEl("button", { text: "Sortear álbum" });
const reloadButton = buttons.createEl("button", { text: "Atualizar biblioteca" });
// A animação e os efeitos elaborados integram a interface da V1.1 definitiva.
// Sem seletores de tipo, volume ou desativação da animação.
const skipButton = buttons.createEl("button", { cls: "roleta-skip-button", text: "Pular animação" });
skipButton.style.display = "none";
let skipAnimation = false;
let animationInProgress = false;
skipButton.addEventListener("click", () => { skipAnimation = true; });


// ------------------------------------------------------------
// ESTATÍSTICAS / RESULTADO
// ------------------------------------------------------------

const stats = wrapper.createDiv({ cls: "roleta-stats" });

const resultPanel = wrapper.createDiv({ cls: "roleta-panel roleta-result-panel" });

const resultTitle = resultPanel.createDiv({ cls: "roleta-section-title" });

resultTitle.createDiv({ cls: "roleta-section-title-main", text: "Resultado" });
resultTitle.createDiv({ cls: "roleta-section-title-sub", text: "O álbum sorteado respeita os filtros selecionados." });

const result = resultPanel.createDiv();

// Beta 2: estado de sessão apenas em memória (não altera filtros persistidos).
let betaScreen = "config";
let betaCurrent = null;
let betaHistory = [];
let betaBusy = false;
let betaFeedback = null;
let betaPreferenceAnchor = null;
let betaLastDecision = null;
let betaDrawPreference = null;
const betaAdaptiveStatus = resultPanel.createDiv({ cls: "roleta-beta-adaptive-status" });
const betaDiagnostics = resultPanel.createEl("details", { cls: "roleta-beta-feedback" });
betaDiagnostics.createEl("summary", { text: "Por que este álbum foi sorteado?" });
const betaDiagnosticsBody = betaDiagnostics.createDiv({ cls: "roleta-beta-feedback-note" });
const betaToolbar = resultPanel.createDiv({ cls: "roleta-beta-toolbar" });
betaToolbar.createDiv({ cls: "roleta-beta-toolbar-title", text: "Roleta Musical · Sorteio" });
const betaBack = betaToolbar.createEl("button", { text: "⚙ Voltar às configurações" });
const betaActions = resultPanel.createDiv({ cls: "roleta-beta-actions" });
const betaAgain = betaActions.createEl("button", { cls: "roleta-beta-primary", text: "🎲 Roletar novamente" });
const betaReset = betaActions.createEl("button", { text: "↺ Reiniciar sessão" });
const betaFeedbackPanel = resultPanel.createEl("details", { cls: "roleta-beta-feedback" });
betaFeedbackPanel.createEl("summary", { text: "⚙ Ajustar próximo sorteio (experimental)" });
const betaFeedbackBody = betaFeedbackPanel.createDiv({ cls: "roleta-beta-feedback-body" });
const betaFeedbackNote = betaFeedbackPanel.createDiv({ cls: "roleta-beta-feedback-note" });
const betaHistoryPanel = resultPanel.createEl("details", { cls: "roleta-beta-history" });
const betaHistorySummary = betaHistoryPanel.createEl("summary", { text: "Histórico da sessão (0)" });
const betaHistoryList = betaHistoryPanel.createDiv({ cls: "roleta-beta-history-list" });
resultPanel.insertBefore(betaToolbar, resultPanel.firstChild);
resultPanel.insertBefore(result, betaActions);

function betaWorkKey(a) { return `${norm(a?.artists?.[0] || a?.artist || "")}::${norm(stripEdition(a?.name || ""))}`; }
function betaIds(a) { return [...new Set([a?.id, ...(a?.ids || [])].filter(Boolean))]; }
function betaAlbumKey(a) { return betaIds(a)[0] ? `spotify:${betaIds(a)[0]}` : betaWorkKey(a); }
function betaSameAlbum(a,b) {
  return betaIds(a).some(id => betaIds(b).includes(id)) || betaWorkKey(a) === betaWorkKey(b);
}
function betaSetScreen(screen) {
  betaScreen = screen;
  wrapper.classList.toggle("roleta-beta-play", screen === "play");
  wrapper.classList.toggle("roleta-beta-config", screen !== "play");
  betaToolbar.style.display = screen === "play" ? "" : "none";
  betaActions.style.display = screen === "play" ? "" : "none";
  betaFeedbackPanel.style.display = screen === "play" ? "" : "none";
  betaAdaptiveStatus.style.display = screen === "play" ? "" : "none";
  betaDiagnostics.style.display = screen === "play" ? "" : "none";
  betaHistoryPanel.style.display = screen === "play" ? "" : "none";
  skipButton.style.display = "none";
}
function betaRenderHistory() {
  betaHistorySummary.textContent = `Histórico da sessão (${betaHistory.length})`;
  betaHistoryList.innerHTML = "";
  for (let i = betaHistory.length - 1; i >= 0; i--) {
    const album = betaHistory[i];
    const item = betaHistoryList.createDiv({ cls: "roleta-beta-history-item" });
    item.createSpan({ text: `${album.name} — ${album.artist}` });
    const view = item.createEl("button", { text: "Rever" });
    view.addEventListener("click", () => {
      if (betaBusy) return;
      betaCurrent = album;
      betaLastDecision = null; betaRenderDiagnostics();
      betaFeedback = null; betaPreferenceAnchor = null; betaRenderFeedback();
      renderResult(album);
    });
  }
}
function betaRecord(album) {
  betaCurrent = album;
  betaRenderFeedback();
  if (!betaHistory.some(a => betaSameAlbum(a,album))) betaHistory.push(album);
  betaRenderHistory();
}
// As tags são evidências aproximadas, não descrições definitivas do som.
const betaSoundGroups = {
  energetic: /\b(energetic|upbeat|fast|aggressive|danceable)\b/i,
  calm: /\b(calm|chill|soft|acoustic|smooth|mellow|relaxing|minimal|slow|easy listening)\b/i,
  melancholic: /\b(sad|melancholic|melancholy|nostalgic|gloomy)\b/i,
  dark: /\b(dark|gloom|horror)\b/i,
  experimental: /\b(experimental|avant garde|abstract|improvisation)\b/i,
  bright: /\b(happy|uplifting|sunny|joyful|bright)\b/i
};
function betaGenreTags(tags) {
  return tags.filter(t => !Object.values(betaSoundGroups).some(re => re.exec(t)?.[0].toLowerCase() === t.toLowerCase()));
}
const betaGenericTags = new Set(["music","albums","favorites","favourite","favorite","seen live","american","english","male vocalists","female vocalists","2020s","2010s","2000s"]);
function betaTags(album) {
  const info = genreInfo(album);
  if (info.state !== "found") return [];
  return [...new Set(info.tags.map(t => norm(t.key || t.name || "")).filter(t => t && !betaGenericTags.has(t)))].slice(0, 25);
}
function betaSoundVector(tags) {
  return Object.fromEntries(Object.entries(betaSoundGroups).map(([key, re]) => [key, tags.some(t => re.exec(t)?.[0].toLowerCase() === t.toLowerCase()) ? 1 : 0]));
}
function betaOverlap(a, b) {
  if (!a.length || !b.length) return null;
  const aa = new Set(a), bb = new Set(b);
  let intersection = 0;
  for (const t of aa) if (bb.has(t)) intersection++;
  return intersection / Math.sqrt(aa.size * bb.size);
}
function betaSoundSimilarity(a, b) {
  const aa = betaSoundVector(a), bb = betaSoundVector(b);
  const activeA = Object.keys(aa).filter(k => aa[k]);
  const activeB = Object.keys(bb).filter(k => bb[k]);
  if (!activeA.length || !activeB.length) return null;
  return betaOverlap(activeA, activeB);
}
function betaSimilarity(album, anchor, mode) {
  const tags = betaTags(album);
  const reference = anchor.tags;
  const genre = betaOverlap(betaGenreTags(tags), betaGenreTags(reference));
  const sound = betaSoundSimilarity(tags, reference);
  if (mode === "genre") return genre;
  if (mode === "sound") return sound;
  if (genre === null && sound === null) return null;
  if (mode === "both") return genre !== null && sound !== null ? .5 * genre + .5 * sound : (genre ?? sound);
  return genre !== null && sound !== null ? 0.65 * genre + 0.35 * sound : (genre ?? sound);
}
function betaEvidence(album,pref) {
  const genre = betaSimilarity(album,pref.anchor,"genre"), sound = betaSimilarity(album,pref.anchor,"sound");
  if (pref.mode === "genre") return genre === null ? "unknown" : "sufficient";
  if (pref.mode === "sound") return sound === null ? "unknown" : "sufficient";
  return genre !== null && sound !== null ? "sufficient" : genre !== null || sound !== null ? "partial" : "unknown";
}
function betaAffinity(sim) {
  return sim === null ? "Informações insuficientes" : sim >= .65 ? "Afinidade alta por tags" : sim >= .3 ? "Afinidade moderada por tags" : "Afinidade baixa por tags";
}
function betaWeight(album, pref) {
  if (!pref) return 1;
  const sim = betaSimilarity(album, pref.anchor, pref.mode);
  if (sim === null) return .05;
  const strength = pref.mode === "similar" ? 3.5 : pref.mode === "both" ? 2.2 : 1.7;
  const evidence = betaEvidence(album,pref);
  return (evidence === "partial" ? .25 : 1) * Math.max(0.12, Math.min(16, Math.exp((pref.mode === "similar" ? 1 : -1) * strength * sim)));
}
function betaPick(candidates, pref = null) {
  const unseen = candidates.filter(a => !betaHistory.some(h => betaSameAlbum(h,a)));
  const pool = unseen.length ? unseen : candidates;
  if (!pool.length) return null;
  let exploratory = false;
  let winner;
  if (!pref) {
    winner = state.drawMode === "surprise" ? pickSurprise(pool) : pool[Math.floor(Math.random() * pool.length)];
  } else {
    const weights = pool.map(a => betaWeight(a, pref));
    let r = Math.random() * weights.reduce((sum, w) => sum + w, 0);
    winner = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) <= 0) { winner = pool[i]; break; }
  }
  betaLastDecision = { pref, exploratory, winner, poolSize: pool.length,
    similarity: pref ? betaSimilarity(winner, pref.anchor, pref.mode) : null,
    evidence: pref ? betaEvidence(winner,pref) : null };
  return winner;
}
function betaRenderDiagnostics() {
  const d = betaLastDecision;
  if (!d || !d.winner) {
    betaDiagnosticsBody.textContent = "Nenhum sorteio concluído nesta sessão.";
    return;
  }
  if (!d.pref) {
    betaDiagnosticsBody.textContent = `Sorteio livre entre ${d.poolSize} álbuns elegíveis. Nenhuma referência adaptativa foi utilizada.`;
    return;
  }
  const labels = {similar:"Mais parecido",genre:"Outro gênero",sound:"Outra sonoridade",both:"Mudar ambos"};
  const anchor = d.pref.anchor;
  const shared = betaTags(d.winner).filter(t => anchor.tags.includes(t));
  const score = betaAffinity(d.similarity);
  betaDiagnosticsBody.innerHTML = "";
  const lines = [
    `Referência: ${anchor.name} · ${anchor.entry?.artist || "artista desconhecido"}`,
    `Ajuste utilizado: ${labels[d.pref.mode] || d.pref.mode}`,
    `Afinidade heurística: ${score}`,
    `Cobertura: ${d.evidence === "sufficient" ? "evidências na dimensão solicitada" : d.evidence === "partial" ? "evidências parciais; ajuste aproximado" : "fallback por informações insuficientes"}`,
    "Gênero/estilo e descritores de atmosfera vêm de tags; não há análise de áudio.",
    `Tags compartilhadas: ${shared.length ? shared.slice(0, 7).join(", ") : "nenhuma identificada"}`,
    `Tipo de sorteio: ponderado pelo ajuste solicitado`,
    `Candidatos elegíveis: ${d.poolSize}`
  ];
  for (const line of lines) betaDiagnosticsBody.createDiv({ text: line });
}
function betaRenderStatus() {
  betaAdaptiveStatus.textContent = betaFeedback && betaPreferenceAnchor
    ? `Próximo sorteio: ${betaFeedback} · referência: ${betaPreferenceAnchor.name} (uso único)`
    : "Sorteio livre · nenhum ajuste pendente";
}
function betaRenderFeedback() {
  betaFeedbackBody.innerHTML = "";
  const options = [
    ["similar", "👍 Mais parecido"], ["genre", "↗ Outro gênero"],
    ["sound", "♫ Outra sonoridade"], ["both", "↗ Mudar ambos"],
    ["clear", "✕ Limpar preferências"]
  ];
  for (const [id, label] of options) {
    const b = betaFeedbackBody.createEl("button", { text: label + (betaFeedback === id ? " ✓" : "") });
    b.disabled = betaBusy || (id !== "clear" && !betaCurrent);
    b.addEventListener("click", () => {
      if (betaBusy) return;
      if (id === "clear") {
        betaFeedback = null; betaPreferenceAnchor = null; betaLastDecision = null;
      } else if (betaFeedback === id && betaPreferenceAnchor?.key === betaAlbumKey(betaCurrent)) {
        betaFeedback = null; betaPreferenceAnchor = null;
      } else {
        betaFeedback = id;
        betaPreferenceAnchor = { key: betaAlbumKey(betaCurrent), name: betaCurrent.name, entry: betaCurrent, tags: betaTags(betaCurrent) };
      }
      betaRenderFeedback();
    });
  }
  betaFeedbackNote.textContent = betaFeedback
    ? `Ajuste pendente para “${betaPreferenceAnchor?.name || "álbum"}”. Será aplicado SOMENTE ao clicar em Roletar novamente. Clique na mesma opção para cancelar.`
    : "Nenhum ajuste pendente. Cada ajuste vale somente para o próximo sorteio. Tags ausentes são tratadas como desconhecidas.";
  betaRenderStatus();
}
function betaPendingPreference() {
  return betaFeedback && betaPreferenceAnchor
    ? { mode: betaFeedback, anchor: { ...betaPreferenceAnchor } } : null;
}
betaBack.addEventListener("click", () => { if (!betaBusy) betaSetScreen("config"); });
betaAgain.addEventListener("click", () => { if (!betaBusy) { prepareSpinAudio(); drawAlbum(); } });
betaReset.addEventListener("click", () => {
  if (betaBusy) return;
  betaHistory = []; betaCurrent = null; betaFeedback = null; betaPreferenceAnchor = null; betaLastDecision = null;
  betaRenderHistory(); betaRenderFeedback(); betaRenderDiagnostics();
  result.innerHTML = "";
  result.createDiv({ cls: "roleta-result-empty", text: "Sessão reiniciada. Clique em Roletar novamente para começar." });
});
betaRenderFeedback();
betaRenderDiagnostics();
betaSetScreen("config");


function paintSourceLine() {
  sourceLine.textContent = catalogMode()
    ? "Origem: notas do acervo. Funciona mesmo sem Spotify."
    : state.catalog === "uncatalogued"
      ? "Origem: álbuns não catalogados da biblioteca Spotify."
      : "Origem: biblioteca Spotify, incluindo os álbuns já catalogados.";
}

async function refreshStats() {
  const candidates = applyFilters();
  const pool = currentPool();

  stats.innerHTML = "";

  const add = (value, label) => {
    const el = stats.createDiv({ cls: "roleta-stat" });

    el.innerHTML = `<div class="roleta-stat-value">${esc(value)}</div><div class="roleta-stat-label">${esc(label)}</div>`;
  };

  add(catalogEntries.length, "álbuns no acervo");
  if (spotifyLoaded) add(spotifyLibrary.length, "álbuns no Spotify");
  add(candidates.length, "candidatos elegíveis");
  if (genreActive()) {
    const cov = genreCoverage(genrePool());
    if (cov.pending || cov.error) add(cov.pending + cov.error, "gêneros pendentes");
  }

  // V0.41 — mantém o bloco de gêneros em sincronia com os demais filtros
  paintGenreMeta();
  paintGenreList();
}


// ------------------------------------------------------------
// SELECT DE ARTISTAS
// ------------------------------------------------------------

function rebuildArtistSelect() {
  const current = state.artist;

  const artists = [...new Set(currentPool().flatMap(a => a.artists).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  artistSelect.parentElement?.remove();

  artistSelect = createSelect(
    "Artista",
    [
      { label: "Todos os artistas", value: "all" },
      ...artists.map(artist => ({ label: artist, value: artist }))
    ],
    artists.includes(current) ? current : "all",
    async value => {
      state.artist = value;
      saveState();
      await refreshStats();
    }
  );

  if (!artists.includes(current)) {
    state.artist = "all";
    saveState();
  }
}


// ------------------------------------------------------------
// RESULTADO
// ------------------------------------------------------------

function tag(parent, text) {
  parent.createDiv({ cls: "roleta-tag", text });
}

function renderResult(album) {
  result.innerHTML = "";

  if (!album) {
    result.createDiv({
      cls: "roleta-result-empty",
      text: genreActive()
        ? "Nenhum álbum compatível com os gêneros selecionados e os demais filtros. " +
          "Carregue os gêneros, ajuste a seleção/combinação ou inclua álbuns sem gênero identificado."
        : "Nenhum álbum encontrado com os filtros atuais."
    });

    return;
  }

  const card = result.createDiv({ cls: "roleta-result-card" });

  const cover = card.createDiv({ cls: "roleta-cover" });

  // A capa da nota pode apontar para um recurso local lento ou indisponível.
  // Tenta a imagem do Spotify já carregada antes de exibir o placeholder.
  const fallbackImage = spotifyLibrary.find(a => betaSameAlbum(a,album))?.image || "";
  const imageCandidates = [...new Set([album.image, fallbackImage].filter(Boolean))];
  function showCoverCandidate(index) {
    cover.innerHTML = "";
    if (index >= imageCandidates.length) { cover.textContent = "💿"; return; }
    const img = document.createElement("img");
    img.alt = `Capa de ${album.name}`;
    img.decoding = "async";
    let settled = false;
    const timeout = setTimeout(() => fail(), 12000);
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      img.remove();
      if (cover.isConnected) showCoverCandidate(index + 1);
    }
    img.onload = () => { settled = true; clearTimeout(timeout); };
    img.onerror = fail;
    cover.appendChild(img);
    img.src = imageCandidates[index];
  }
  showCoverCandidate(0);

  const body = card.createDiv({ cls: "roleta-result-body" });

  body.createDiv({ cls: "roleta-result-eyebrow", text: "Álbum sorteado" });
  body.createDiv({ cls: "roleta-result-title", text: album.name });
  body.createDiv({ cls: "roleta-result-artist", text: album.artist });

  const meta = body.createDiv({ cls: "roleta-result-meta" });

  tag(meta, `⏱️ ${album.durationMs > 0 ? formatDuration(album.durationMs) : "Duração indisponível"}`);

  if (album.durationSource === "spotify") tag(meta, "Spotify");
  if (album.durationSource === "lastfm") tag(meta, "Last.fm");

  tag(meta, album.catalogued ? "📚 Catalogado" : "📭 Não catalogado");

  if (album.albumType) tag(meta, `💿 ${album.albumType}`);

  // V0.41 — com o filtro de gêneros ligado, mostra os gêneros e a origem das tags
  if (genreActive()) {
    const info = genreInfo(album);

    if (info.state === "found") {
      for (const t of info.tags.slice(0, 4)) tag(meta, `🏷️ ${genreLabel(t.key, t.name)}`);

      if (info.source === "artist") tag(meta, "gêneros do artista (aproximado)");
    } else {
      tag(meta, "🏷️ sem gênero identificado");
    }
  }

  if (Number(album.rating) > 0) tag(meta, `⭐ ${fmtRating(Number(album.rating))}`);

  // V0.42 — com o filtro de scrobbles ligado, mostra a contagem da nota
  if (scrobblesActive() && validScrobbles(album.scrobbles) !== null) {
    tag(meta, `🎧 ${album.scrobbles} scrobble${album.scrobbles === 1 ? "" : "s"}`);
  }

  if (album.cataloguedAt) {
    tag(meta, `🗓️ catalogado ${relativeTime(album.cataloguedAt)} (${formatDate(album.cataloguedAt)})`);
  }

  const actions = body.createDiv({ cls: "roleta-result-buttons" });

  // Spotify: link direto quando conhecido; senão busca pontual ao clicar
  const spotifyButton = actions.createEl("button", {
    text: album.spotifyUrl ? "🎧 Abrir no Spotify" : "🔎 Procurar no Spotify"
  });

  spotifyButton.addEventListener("click", async () => {
    spotifyButton.disabled = true;

    try {
      const url = await findSpotifyLink(album);

      if (album.spotifyUrl) spotifyButton.textContent = "🎧 Abrir no Spotify";

      openURL(url);
    } finally {
      spotifyButton.disabled = false;
    }
  });

  if (album.catalogued && album.catalogPath) {
    const noteButton = actions.createEl("button", { text: "📖 Abrir nota" });

    noteButton.addEventListener("click", () => openNote(album.catalogPath));
  }
}


// V1.1 — som sintetizado, sem arquivos externos.
let spinAudioContext = null;
function prepareSpinAudio() {
  if (state.soundMode === "off" || state.soundVolume <= 0) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!spinAudioContext || spinAudioContext.state === "closed") spinAudioContext = new AudioCtor();
    if (spinAudioContext.state === "suspended") spinAudioContext.resume().catch(() => {});
  } catch (e) { console.warn("[Roleta V1.1] Áudio indisponível", e); }
}
function spinTone(freq, duration, delay = 0, type = "sine", intensity = 1) {
  if (state.soundMode === "off" || state.soundVolume <= 0 || !wrapper.isConnected) return;
  const ctx = spinAudioContext;
  if (!ctx || ctx.state !== "running") return;
  try {
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, state.soundVolume / 100 * 0.13 * intensity), at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(at); osc.stop(at + duration + 0.015);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  } catch (e) { console.warn("[Roleta V1.1] Falha no som", e); }
}
function playSpinTick(i) {
  if (state.soundMode === "full") {
    spinTone(i % 2 ? 530 : 650, 0.048, 0, "triangle", 0.8);
    spinTone(130, 0.045, 0, "sine", 0.25);
  } else if (state.soundMode === "ticks") {
    spinTone(i % 2 ? 740 : 820, 0.035, 0, "sine", 0.55);
  }
}
function playSpinReveal() {
  if (state.soundMode === "full") {
    spinTone(523.25, 0.17, 0, "triangle", 0.7);
    spinTone(659.25, 0.20, 0.11, "triangle", 0.7);
    spinTone(783.99, 0.35, 0.23, "sine", 0.9);
  } else if (state.soundMode === "ticks") {
    spinTone(659.25, 0.13, 0, "sine", 0.65);
    spinTone(880, 0.23, 0.12, "sine", 0.65);
  }
}

// V1.1 — animação visual. O vencedor é definido antes da animação;
// os álbuns intermediários não influenciam as probabilidades do sorteio.
const animationCSS = document.createElement("style");
animationCSS.textContent = `
.roleta-skip-button{color:var(--nt-ink)!important}
.roleta-spin-stage{display:flex;gap:17px;align-items:center;min-height:150px;padding:12px;border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-bg);overflow:hidden}
.roleta-spin-stage .roleta-cover{transition:transform .13s ease,opacity .13s ease;box-shadow:0 0 0 2px var(--nt-accent-bg)}
.roleta-spin-stage.is-changing .roleta-cover{transform:scale(.94);opacity:.65}
.roleta-spin-stage .roleta-result-title{font-size:19px}
.roleta-spin-progress{height:3px;background:var(--nt-line);border-radius:3px;overflow:hidden;margin-top:12px}
.roleta-spin-progress>div{height:100%;background:var(--nt-accent);transition:width .14s linear}
.roleta-spin-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--nt-accent);font-weight:750}
@media(max-width:600px){.roleta-spin-stage{flex-direction:column;align-items:flex-start}.roleta-spin-stage .roleta-cover{width:120px;height:120px;flex-basis:120px}}
@media(prefers-reduced-motion:reduce){.roleta-spin-stage .roleta-cover,.roleta-spin-progress>div{transition:none!important}}
`;
document.head.appendChild(animationCSS);

function renderSpinFrame(album, progress) {
  result.innerHTML = "";
  const stage = result.createDiv({ cls: "roleta-spin-stage" });
  const cover = stage.createDiv({ cls: "roleta-cover" });
  if (album?.image) {
    const img = cover.createEl("img");
    img.src = album.image;
    img.alt = "";
    img.onerror = () => { img.remove(); cover.textContent = "💿"; };
  } else cover.textContent = "💿";
  const body = stage.createDiv({ cls: "roleta-result-body" });
  body.createDiv({ cls: "roleta-spin-label", text: "Sorteando álbum…" });
  body.createDiv({ cls: "roleta-result-title", text: album?.name || "—" });
  body.createDiv({ cls: "roleta-result-artist", text: album?.artist || "" });
  const bar = result.createDiv({ cls: "roleta-spin-progress" });
  const fill = bar.createDiv();
  fill.style.width = `${Math.round(progress * 100)}%`;
}

async function animateDraw(candidates, winner) {
  if (!state.animationEnabled || candidates.length < 2 ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  animationInProgress = true;
  skipAnimation = false;
  skipButton.style.display = "";
  try {
    const steps = 24;
    let previous = null;
    for (let i = 0; i < steps; i++) {
      if (skipAnimation || !wrapper.isConnected) break;
      // A sequência é apenas visual; evita repetir a mesma capa consecutivamente.
      let preview = candidates[Math.floor(Math.random() * candidates.length)];
      if (candidates.length > 1 && preview === previous) {
        preview = candidates[(candidates.indexOf(preview) + 1) % candidates.length];
      }
      previous = preview;
      renderSpinFrame(preview, (i + 1) / steps);
      playSpinTick(i);
      // Desaceleração progressiva, cerca de 3,3 segundos no total.
      const t = i / (steps - 1);
      await new Promise(resolve => setTimeout(resolve, 40 + Math.round(225 * t * t)));
    }
  } finally {
    animationInProgress = false;
    skipButton.style.display = "none";
  }
}

// V1.0 — sorteio ponderado moderado, sem excluir candidatos.
// Gêneros desconhecidos não são tratados como gêneros raros.
function pickSurprise(candidates) {
  if (candidates.length < 2) return candidates[0];
  const artists = new Map(), genres = new Map();
  const names = a => [...new Set((a.artists || [a.artist]).map(norm).filter(Boolean))];
  const tags = a => {
    const info = genreInfo(a);
    return info.state === "found" ? [...new Set(info.tags.map(t => t.key))] : [];
  };
  for (const album of candidates) {
    for (const a of names(album)) artists.set(a, (artists.get(a) || 0) + 1);
    for (const g of tags(album)) genres.set(g, (genres.get(g) || 0) + 1);
  }
  const rarity = (keys, freq) => keys.length
    ? keys.reduce((sum, key) => sum + 1 / Math.sqrt(freq.get(key) || 1), 0) / keys.length
    : null;
  const weights = candidates.map(album => {
    const artistRarity = rarity(names(album), artists);
    const genreRarity = rarity(tags(album), genres);
    // Intensidade moderada: no máximo 3x de peso; gênero 60%, artista 40%.
    const score = genreRarity === null ? (artistRarity ?? 0.5)
      : 0.6 * genreRarity + 0.4 * (artistRarity ?? 0.5);
    return 1 + 2 * Math.max(0, Math.min(1, score));
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let draw = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    draw -= weights[i];
    if (draw < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// ------------------------------------------------------------
// SORTEIO
// ------------------------------------------------------------

async function drawAlbum() {
  if (betaBusy) return;
  betaBusy = true;
  const pendingPreference = betaPendingPreference();
  betaSetScreen("play");
  betaDiagnostics.open = false;
  betaAgain.disabled = true;
  betaRenderFeedback();
  betaBack.disabled = true;
  betaReset.disabled = true;
  drawButton.disabled = true;
  reloadButton.disabled = true;

  try {
    result.innerHTML = "";

    // V0.41 — com filtro de gêneros, consulta (só) quem ainda não foi consultado
    // e já passou nos outros filtros. Falha temporária não vira "sem gênero".
    if (genreActive() && lastfmEnabled()) {
      const pendingGenres = genrePool().filter(a => {
        const s = genreInfo(a).state;

        return s === "pending" || s === "error";
      });

      if (pendingGenres.length) {
        const loading = result.createDiv({
          cls: "roleta-loading",
          text: `🏷️ Buscando gêneros (${pendingGenres.length} álbuns)...`
        });

        const outcome = await loadGenres(pendingGenres, {
          onProgress: (done, total) => {
            if (loading.isConnected) loading.textContent = `🏷️ Buscando gêneros (${done}/${total})...`;
          }
        });

        if (!outcome.cancelled) {
          genreMessage = outcome.failed || outcome.aborted ? describeGenreOutcome(outcome) : "";
        }

        result.innerHTML = "";

        await refreshStats();
      }
    }

    if (state.duration !== "any") {
      // só calcula duração dos álbuns que já passaram nos outros filtros
      const pending = applyFilters({ skipDuration: true }).filter(a => !(a.durationMs > 0));

      if (pending.length) {
        result.createDiv({
          cls: "roleta-loading",
          text: `⏱️ Calculando durações (${pending.length} álbuns)...`
        });

        await enrichDurations(pending);
        await refreshStats();
      }
    }

    const candidates = applyFilters();

    // Busca metadados para a adaptação mesmo quando o filtro manual de gêneros está desligado.
    // Limite por sorteio para evitar consultas excessivas em bibliotecas grandes.
    if (pendingPreference && lastfmEnabled()) {
      const anchors = [pendingPreference.anchor];
      const missingAnchors = anchors.filter(a => a.entry && betaTags(a.entry).length === 0 && needsGenreFetch(a.entry));
      const missingCandidates = candidates.filter(a => betaTags(a).length === 0 && needsGenreFetch(a));
      const queue = [...new Map([...missingAnchors.map(a => a.entry), ...missingCandidates.slice(0, 45)].map(a => [a.key, a])).values()];
      if (queue.length) {
        const loading = result.createDiv({ cls: "roleta-loading", text: `🏷️ Preparando similaridades (${queue.length} álbuns)...` });
        await loadGenres(queue, { onProgress: (done, total) => {
          if (loading.isConnected) loading.textContent = `🏷️ Preparando similaridades (${done}/${total})...`;
        }});
        loading.remove();
      }
      if (pendingPreference.anchor.entry) pendingPreference.anchor.tags = betaTags(pendingPreference.anchor.entry);
    }

    if (!candidates.length) {
      renderResult(null);

      return;
    }

    const winner = betaPick(candidates, pendingPreference);
    await animateDraw(candidates, winner);
    if (wrapper.isConnected) {
      renderResult(winner);
      betaRecord(winner);
      betaRenderDiagnostics();
      // Consome o ajuste somente depois de concluir o sorteio com sucesso.
      if (pendingPreference) { betaFeedback = null; betaPreferenceAnchor = null; betaRenderFeedback(); }
      if (pendingPreference && betaLastDecision?.evidence !== "sufficient")
        betaAdaptiveStatus.textContent = "Ajuste aproximado: cobertura de tags insuficiente. Consulte os detalhes da escolha.";
      playSpinReveal();
    }
  } catch (error) {
    console.error("[Roleta V1.1]", error);

    result.innerHTML = "";

    result.createDiv({ cls: "roleta-error", text: `Erro: ${error?.message || error}` });
  } finally {
    betaBusy = false;
    betaAgain.disabled = false;
    betaRenderFeedback();
    betaBack.disabled = false;
    betaReset.disabled = false;
    drawButton.disabled = false;
    reloadButton.disabled = false;
  }
}


// ------------------------------------------------------------
// TROCA DO FILTRO "CATÁLOGO"
// ------------------------------------------------------------

async function onCatalogChange(value) {
  // V0.41 — a carga de gêneros em andamento era para o conjunto anterior
  cancelGenreLoad();

  // V0.41 — se a inicialização falhou antes de montar o bloco de gêneros, monta agora
  if (!genreUI) renderGenreFilters();

  state.catalog = value;
  saveState();

  paintSourceLine();
  renderAcervoFilters();

  // fora do modo catalogado, o sorteio depende da biblioteca do Spotify
  if (!catalogMode() && !spotifyLoaded) {
    drawButton.disabled = true;
    reloadButton.disabled = true;

    result.innerHTML = "";
    result.createDiv({ cls: "roleta-loading", text: "⏳ Carregando biblioteca do Spotify..." });

    try {
      await ensureSpotifyLibrary();

      linkCatalogWithSpotify();

      result.innerHTML = "";
    } catch (error) {
      console.error("[Roleta V0.42]", error);

      result.innerHTML = "";
      result.createDiv({
        cls: "roleta-error",
        text: `Não foi possível carregar a biblioteca do Spotify: ${error?.message || error}`
      });
    } finally {
      drawButton.disabled = false;
      reloadButton.disabled = false;
    }
  }

  rebuildArtistSelect();

  await refreshStats();
}


// ------------------------------------------------------------
// CARREGAMENTO INICIAL
// ------------------------------------------------------------

async function initialize() {
  drawButton.disabled = true;
  reloadButton.disabled = true;

  // V0.41 — recarregar a biblioteca invalida qualquer carga de gêneros anterior
  cancelGenreLoad();
  genreFailures.clear();

  result.innerHTML = "";
  result.createDiv({ cls: "roleta-loading", text: "📚 Lendo o acervo..." });

  try {
    // acervo de notas: local e rápido
    loadCatalog();

    // Spotify: obrigatório fora do modo catalogado; opcional dentro dele
    if (!catalogMode() || spotifyLoaded) {
      result.innerHTML = "";
      result.createDiv({ cls: "roleta-loading", text: "⏳ Carregando biblioteca do Spotify..." });

      try {
        await ensureSpotifyLibrary(true);
      } catch (error) {
        if (!catalogMode()) throw error;

        console.warn("[Roleta V0.42] Spotify indisponível (modo acervo segue offline):", error);
      }
    }

    linkCatalogWithSpotify();

    paintSourceLine();
    renderAcervoFilters();
    renderGenreFilters(); // V0.41 — usa só o cache; nenhuma requisição aqui
    rebuildArtistSelect();

    await refreshStats();

    result.innerHTML = "";
    result.createDiv({
      cls: "roleta-result-empty",
      text: "Pronto. Configure os filtros e clique em “Sortear álbum”."
    });
  } catch (error) {
    console.error("[Roleta V0.42] Falha na inicialização:", error);

    result.innerHTML = "";
    result.createDiv({
      cls: "roleta-error",
      text: `Não foi possível carregar a biblioteca do Spotify: ${error?.message || error}`
    });
  } finally {
    drawButton.disabled = false;
    reloadButton.disabled = false;
  }
}


// ------------------------------------------------------------
// EVENTOS E INÍCIO
// ------------------------------------------------------------

drawButton.addEventListener("click", () => {
  prepareSpinAudio();
  drawAlbum();
});
reloadButton.addEventListener("click", async () => {
  betaHistory = []; betaCurrent = null; betaFeedback = null; betaPreferenceAnchor = null; betaLastDecision = null;
  betaRenderHistory(); betaRenderFeedback(); betaSetScreen("config");
  await initialize();
});

await initialize();
```