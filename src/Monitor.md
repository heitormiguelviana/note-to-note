```dataviewjs
// ============================================================
// MONITOR LAST.FM → MEDIADB
// V1.30 — NOVA INTERFACE, MOTOR V1.29
// ============================================================
//
// Novo na V1.27:
// - Filtro "Mostrar apenas sessões de álbuns já catalogados":
//   exibe as sessões da última consulta que correspondem a notas
//   do acervo. É só visualização: não altera a fila persistente,
//   não ignora sessões e não cria notas.
// - Catálogo: qualquer nota em Musicas/ conta como álbum
//   catalogado, exceto Musicas/Central/ e arquivos com
//   "(ignore)" no nome (ex.: template(ignore).md).
// - A propriedade "scrobbles" das notas NÃO é lida nem alterada
//   pelo Monitor.
// ============================================================

const CFG = {
  version: "1.30",

  // ========================================================
  // LAST.FM
  // ========================================================

  lastfmKey: "",
  lastfmUser: "",

  lastfmUrl: "https://ws.audioscrobbler.com/2.0/",

  // ========================================================
  // MONITOR
  // ========================================================

  pollMs: 45 * 1000,

  bootstrapLookbackHours: 72,

  pageSize: 200,
  maxPages: 10,

  minSessionTracks: 2,

  maxSessionGapMinutes: 45,

  // ========================================================
  // OBSIDIAN
  // ========================================================

  musicRoot: "Musicas",
  centralPath: "Musicas/Central",

  stateKey: "central-scrobble-monitor-v126-stable",

  controllerKey: "__centralScrobbleMonitorV126Stable"
};


// ============================================================
// V1.28 — CARREGAMENTO DA CONFIGURAÇÃO DO INSTALADOR
// ============================================================
// Mantém stateKey e controllerKey originais para preservar
// fila, sessões processadas e demais dados já existentes.
// Não usa credenciais embutidas como fallback.

const MONITOR_CONFIG_PATH = "Musicas/Sistema/Configuracoes.json";
let monitorConfigError = "";

async function loadMusicalConfig() {
  try {
    const file = dv.app.vault.getAbstractFileByPath(MONITOR_CONFIG_PATH);

    if (!file || Array.isArray(file.children)) {
      throw new Error("Configuração não encontrada. Execute o Instalador Musical.");
    }

    const config = JSON.parse(await dv.app.vault.read(file));

    if (config?.schemaVersion !== 1) {
      throw new Error("Versão do arquivo de configuração não reconhecida.");
    }

    const user = String(config.lastfm?.username ?? "").trim();
    const key = String(config.lastfm?.apiKey ?? "").trim();
    const root = String(config.paths?.musicRoot ?? "").trim();
    const central = String(config.paths?.central ?? "").trim();

    if (!/^[A-Za-z0-9_-]{2,40}$/.test(user) ||
        !/^[a-fA-F0-9]{32}$/.test(key)) {
      throw new Error("Credenciais Last.fm ausentes ou inválidas no instalador.");
    }

    const validPath = value =>
      !!value && !value.startsWith("/") &&
      !value.split("/").some(part => !part || part === "." || part === "..");

    if (!validPath(root) || !validPath(central) ||
        !central.startsWith(root + "/")) {
      throw new Error("Caminhos de músicas ou Central inválidos no instalador.");
    }

    CFG.lastfmUser = user;
    CFG.lastfmKey = key;
    CFG.musicRoot = root;
    CFG.centralPath = central;
    monitorConfigError = "";
  } catch (error) {
    CFG.lastfmUser = "";
    CFG.lastfmKey = "";
    monitorConfigError = error?.message || "Falha ao ler a configuração Musical.";
  }
}

await loadMusicalConfig();


// ============================================================
// ESTADO
// ============================================================

function createEmptyState() {
  return {
    version: CFG.version,

    running: false,
    initialized: false,

    queue: [],

    processedSessions: [],
    ignoredSessions: [],

    lastPollAt: null,

    // V1.27 — preferência de visualização (não faz parte da fila)
    showCatalogedOnly: false,

    diagnostics: {
      lastFetchAt: null,
      lastFetchCount: 0,

      lastTrack: "",
      lastAlbum: "",
      lastArtist: "",

      lastSessionCount: 0,
      lastEligibleSessionCount: 0,
      lastNewSessionCount: 0,

      lastApiStatus: "Ainda não consultado",
      lastApiMessage: ""
    }
  };
}


function loadState() {
  try {
    const raw = localStorage.getItem(CFG.stateKey);

    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw);

    const base = createEmptyState();

    return {
      ...base,
      ...parsed,

      diagnostics: {
        ...base.diagnostics,
        ...(parsed.diagnostics || {})
      },

      queue: Array.isArray(parsed.queue)
        ? parsed.queue
        : [],

      processedSessions: Array.isArray(parsed.processedSessions)
        ? parsed.processedSessions
        : [],

      ignoredSessions: Array.isArray(parsed.ignoredSessions)
        ? parsed.ignoredSessions
        : [],

      // V1.27 — estado antigo sem o campo recebe o padrão (desligado)
      showCatalogedOnly: parsed.showCatalogedOnly === true
    };

  } catch (e) {
    return createEmptyState();
  }
}


const state = loadState();

// V1.27 — sessões catalogadas da ÚLTIMA consulta (só em memória; derivado
// do Last.fm + notas, nunca persistido e nunca misturado com a fila)
let catalogedSessions = [];
let catalogedViewReady = false;


// ============================================================
// UTILIDADES GERAIS
// ============================================================

function now() {
  return Date.now();
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function safeString(value) {

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {

    if (typeof value["#text"] === "string") {
      return value["#text"].trim();
    }

    if (typeof value.name === "string") {
      return value.name.trim();
    }

    if (typeof value.title === "string") {
      return value.title.trim();
    }
  }

  return "";
}


function normalizeText(value) {

  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['"`´’]/g, "")
    .replace(/[‐-‒–—―]/g, "-")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ============================================================
// NORMALIZAÇÃO DE EDIÇÕES
// ============================================================

function normalizeAlbumBase(value) {

  let s = safeString(value);

  if (!s) {
    return "";
  }

  s = s
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [

    /\s*[\(\[]\s*deluxe(?:\s+edition)?\s*[\)\]]$/i,
    /\s*[\(\[]\s*expanded(?:\s+edition)?\s*[\)\]]$/i,
    /\s*[\(\[]\s*special(?:\s+edition)?\s*[\)\]]$/i,
    /\s*[\(\[]\s*limited(?:\s+edition)?\s*[\)\]]$/i,
    /\s*[\(\[]\s*anniversary(?:\s+edition)?\s*[\)\]]$/i,
    /\s*[\(\[]\s*collector(?:'s)?(?:\s+edition)?\s*[\)\]]$/i,
    /\s*[\(\[]\s*remaster(?:ed)?\s*[\)\]]$/i,
    /\s*[\(\[]\s*reissue\s*[\)\]]$/i,
    /\s*[\(\[]\s*bonus\s+tracks?\s*[\)\]]$/i,
    /\s*[\(\[]\s*extended(?:\s+edition)?\s*[\)\]]$/i,

    /\s*-\s*deluxe(?:\s+edition)?$/i,
    /\s*-\s*expanded(?:\s+edition)?$/i,
    /\s*-\s*special(?:\s+edition)?$/i,
    /\s*-\s*limited(?:\s+edition)?$/i,
    /\s*-\s*anniversary(?:\s+edition)?$/i,
    /\s*-\s*remaster(?:ed)?$/i,
    /\s*-\s*reissue$/i,
    /\s*-\s*bonus\s+tracks?$/i,
    /\s*-\s*extended(?:\s+edition)?$/i,

    /\s+deluxe(?:\s+edition)?$/i,
    /\s+expanded(?:\s+edition)?$/i,
    /\s+special(?:\s+edition)?$/i,
    /\s+limited(?:\s+edition)?$/i,
    /\s+anniversary(?:\s+edition)?$/i,
    /\s+remaster(?:ed)?$/i,
    /\s+reissue$/i,
    /\s+bonus\s+tracks?$/i,
    /\s+extended(?:\s+edition)?$/i
  ];

  // Remove sufixos encadeados (ex.: Deluxe Edition - Remastered).
  let previous;
  do {
    previous = s;
    for (const regex of patterns) s = s.replace(regex, "").trim();
  } while (s !== previous);

  return s;
}


function albumKey(album) {
  return normalizeText(
    normalizeAlbumBase(album)
  );
}


function artistKey(artist) {
  return normalizeText(artist);
}


function releaseKey(album, artist) {

  return `${artistKey(artist)}|||${albumKey(album)}`;
}


// ============================================================
// LAST.FM — EXTRAÇÃO
// ============================================================

function extractArtist(track) {

  if (!track) {
    return "";
  }

  return safeString(track.artist);
}


function extractAlbum(track) {

  if (!track) {
    return "";
  }

  return safeString(track.album);
}


function extractTrackName(track) {

  if (!track) {
    return "";
  }

  return safeString(track.name);
}


function extractTimestamp(track) {

  if (!track) {
    return null;
  }

  if (track.date) {

    if (track.date.uts !== undefined) {

      const n = Number(track.date.uts);

      if (Number.isFinite(n)) {
        return n * 1000;
      }
    }

    if (track.date["#text"]) {

      const parsed = Date.parse(track.date["#text"]);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  if (track.uts !== undefined) {

    const n = Number(track.uts);

    if (Number.isFinite(n)) {
      return n * 1000;
    }
  }

  return null;
}


function extractImage(track) {

  if (!track) {
    return "";
  }

  const images = track.image;

  if (Array.isArray(images)) {

    const preferred = [
      "extralarge",
      "mega",
      "large",
      "medium",
      "small"
    ];

    for (const size of preferred) {

      const img = images.find(
        x => x && x.size === size
      );

      const url = safeString(img);

      if (url) {
        return url;
      }
    }

    for (const img of images) {

      const url = safeString(img);

      if (url) {
        return url;
      }
    }
  }

  return "";
}


function isNowPlaying(track) {

  if (!track) {
    return false;
  }

  return (
    track["@attr"] &&
    (
      track["@attr"].nowplaying === "true" ||
      track["@attr"].nowplaying === true
    )
  );
}


// ============================================================
// LAST.FM — CREDENCIAIS
// ============================================================

function hasLastFmCredentials() {

  const key = safeString(CFG.lastfmKey);

  const user = safeString(CFG.lastfmUser);

  if (!key || !user) {
    return false;
  }

  if (
    key === "COLOQUE_SUA_LASTFM_KEY_AQUI" ||
    user === "COLOQUE_SEU_USUARIO_LASTFM_AQUI"
  ) {
    return false;
  }

  return true;
}


// ============================================================
// LAST.FM — REQUEST
// ============================================================

async function lastFmRequest(method, params = {}) {

  const url = new URL(CFG.lastfmUrl);

  url.searchParams.set("method", method);

  url.searchParams.set("api_key", CFG.lastfmKey);

  url.searchParams.set("format", "json");

  for (const [key, value] of Object.entries(params)) {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString());

  if (!response.ok) {

    throw new Error(`Last.fm HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {

    throw new Error(
      `Last.fm ${data.error}: ${data.message || "erro desconhecido"}`
    );
  }

  return data;
}


// ============================================================
// LAST.FM — RECENT TRACKS
// ============================================================

function getTrackArray(data) {

  if (!data) {
    return [];
  }

  if (
    data.recenttracks &&
    Array.isArray(data.recenttracks.track)
  ) {

    return data.recenttracks.track;
  }

  if (
    data.recenttracks &&
    data.recenttracks.track
  ) {

    return [data.recenttracks.track];
  }

  return [];
}


async function fetchRecentTracks() {

  if (!hasLastFmCredentials()) {

    throw new Error(
      "Last.fm não configurado. Verifique o Instalador Musical."
    );
  }

  const tracks = [];

  const fromSeconds = Math.floor(
    (
      Date.now() -
      CFG.bootstrapLookbackHours *
      60 *
      60 *
      1000
    ) / 1000
  );

  const toSeconds = Math.floor(Date.now() / 1000);

  for (let page = 1; page <= CFG.maxPages; page++) {

    const data = await lastFmRequest(
      "user.getrecenttracks",
      {
        user: CFG.lastfmUser,

        limit: CFG.pageSize,

        page,

        from: fromSeconds,

        to: toSeconds
      }
    );

    const batch = getTrackArray(data);

    if (!batch.length) {
      break;
    }

    for (const raw of batch) {

      if (isNowPlaying(raw)) {
        continue;
      }

      const trackName = extractTrackName(raw);

      const artist = extractArtist(raw);

      const album = extractAlbum(raw);

      const timestamp = extractTimestamp(raw);

      if (
        !trackName ||
        !artist ||
        !album ||
        !timestamp
      ) {
        continue;
      }

      tracks.push({
        track: trackName,

        artist,

        album,

        timestamp,

        imageUrl: extractImage(raw),

        artistKey: artistKey(artist),

        albumKey: albumKey(album)
      });
    }

    const attr =
      data.recenttracks &&
      data.recenttracks["@attr"];

    const totalPages =
      attr &&
      Number(attr.totalPages);

    if (
      Number.isFinite(totalPages) &&
      page >= totalPages
    ) {
      break;
    }

    if (batch.length < CFG.pageSize) {
      break;
    }
  }

  const unique = new Map();

  for (const item of tracks) {

    const key = [
      item.artistKey,
      item.albumKey,
      normalizeText(item.track),
      item.timestamp
    ].join("|||");

    if (!unique.has(key)) {

      unique.set(key, item);
    }
  }

  return Array
    .from(unique.values())
    .sort(
      (a, b) => a.timestamp - b.timestamp
    );
}


// ============================================================
// SESSÕES — V1.26
// ============================================================

function artistVariants(value) {
  const raw = safeString(value);
  if (!raw) return [];
  // Preserva o nome completo; divide apenas separadores explícitos de colaboração.
  // Vírgulas e "&" isolados podem fazer parte do nome oficial do artista.
  const pieces = raw.split(/\s+(?:feat\.?|ft\.?|featuring|with|vs\.?|x)\s+|\s*;\s*|\s+&\s+/i);
  return [...new Set([normalizeText(raw), ...pieces.map(normalizeText)].filter(Boolean))];
}

function artistsCompatible(a, b) {
  const av = artistVariants(a);
  const bv = artistVariants(b);
  if (!av.length || !bv.length) return false;
  return av.some(part => bv.includes(part));
}


function groupIntoSessions(tracks) {

  const valid = tracks
    .filter(
      t =>
        t.artistKey &&
        t.albumKey &&
        t.timestamp
    )
    .sort(
      (a, b) => a.timestamp - b.timestamp
    );

  const active = new Map();

  const finished = [];

  for (const track of valid) {

    const albumSessions = active.get(track.albumKey) || [];

    let session = albumSessions
      .filter(
        candidate => {

          const gap =
            (
              track.timestamp -
              candidate.lastTimestamp
            ) / 60000;

          return (
            gap >= 0 &&
            gap <= CFG.maxSessionGapMinutes &&
            artistsCompatible(
              track.artist,
              candidate.artist
            )
          );
        }
      )
      .sort(
        (a, b) => b.lastTimestamp - a.lastTimestamp
      )[0];


    if (!session) {

      session = {
        artist: track.artist,

        album: track.album,

        artistKey: track.artistKey,

        albumKey: track.albumKey,

        tracks: [],

        firstTimestamp: track.timestamp,

        lastTimestamp: track.timestamp,

        imageUrl: track.imageUrl || ""
      };

      session.tracks.push(track);

      albumSessions.push(session);

      active.set(track.albumKey, albumSessions);

      continue;
    }

    session.tracks.push(track);

    session.lastTimestamp = track.timestamp;

    if (
      !session.imageUrl &&
      track.imageUrl
    ) {

      session.imageUrl = track.imageUrl;
    }
  }

  for (const albumSessions of active.values()) {

    for (const session of albumSessions) {

      finished.push(session);
    }
  }

  return finished.sort(
    (a, b) => a.firstTimestamp - b.firstTimestamp
  );
}


// ============================================================
// CATÁLOGO MEDIADB
// ============================================================

function getCatalogTitle(page) {

  if (!page) {
    return "";
  }

  const candidates = [
    page.title,
    page.Title,
    page.album,
    page.Album,
    page["Album Name"],
    page["album name"],
    page.releaseTitle,
    page["Release Title"]
  ];

  for (const value of candidates) {

    const result = safeString(value);

    if (result) {
      return result;
    }
  }

  return "";
}


function getCatalogArtists(page) {

  if (!page) {
    return [];
  }

  const candidates = [
    page.artists,
    page.artist,
    page.Artists,
    page.Artist,
    page["Album Artist"],
    page["Álbum Artist"]
  ];

  for (const value of candidates) {

    if (Array.isArray(value)) {

      const result = value
        .map(safeString)
        .filter(Boolean);

      if (result.length) {
        return result;
      }
    }

    const result = safeString(value);

    if (result) {
      return [result];
    }
  }

  return [];
}


// V1.27 — arquivos internos que nunca contam como álbum catalogado:
// qualquer nota com "(ignore)" no nome (ex.: template(ignore).md)
function isIgnoredCatalogFile(fileName, path) {

  const name = (
    fileName ||
    String(path || "")
      .split("/")
      .pop()
      .replace(/\.md$/i, "")
  ).toLowerCase();

  return name.includes("(ignore)");
}


function getCatalogEntries() {

  const entries = [];

  const pages = dv.pages(`"${CFG.musicRoot}"`);

  for (const page of pages) {

    const path = safeString(page.file?.path);

    if (!path) {
      continue;
    }

    if (
      path === CFG.centralPath ||
      path.startsWith(CFG.centralPath + "/")
    ) {
      continue;
    }

    // V1.27 — ignora arquivos marcados com (ignore) no nome
    if (
      isIgnoredCatalogFile(
        safeString(page.file?.name),
        path
      )
    ) {
      continue;
    }

    let title = getCatalogTitle(page);

    let artists = getCatalogArtists(page);

    if (
      !title ||
      !artists.length
    ) {

      const fileName = safeString(page.file?.name);

      const separator = fileName.lastIndexOf(" - ");

      if (separator > 0) {

        const parsedTitle = fileName
          .slice(0, separator)
          .trim();

        const parsedArtist = fileName
          .slice(separator + 3)
          .trim();

        if (!title) {
          title = parsedTitle;
        }

        if (!artists.length) {
          artists = [parsedArtist];
        }
      }
    }

    if (
      !title ||
      !artists.length
    ) {
      continue;
    }

    for (const artist of artists) {

      if (!artist) {
        continue;
      }

      entries.push({
        title,
        artist,

        key: releaseKey(title, artist),

        baseTitle: normalizeAlbumBase(title),

        baseKey: albumKey(title),

        artistKey: artistKey(artist),

        path
      });
    }
  }

  return entries;
}


// ============================================================
// VERIFICAÇÃO DO CATÁLOGO
// ============================================================

// V1.27 — mesma lógica de sempre, mas devolvendo a nota encontrada
// (ou null). isAlbumCataloged() passa a ser um atalho para ela.
function findCatalogedEntry(album, artist, catalog) {
  const wantedBase = albumKey(album);
  if (!wantedBase) return null;
  for (const entry of catalog) {
    if (entry.baseKey !== wantedBase) continue;
    if (artistsCompatible(entry.artist, artist)) return entry;
  }
  return null;
}


function isAlbumCataloged(album, artist, catalog) {

  return findCatalogedEntry(album, artist, catalog) !== null;
}


// ============================================================
// IDENTIFICAÇÃO DE SESSÃO
// ============================================================

function makeSessionId(session) {

  return [
    session.artistKey,
    session.albumKey,
    session.firstTimestamp,
    session.lastTimestamp
  ].join("|||");
}


function sessionAlbumKey(session) {

  return releaseKey(
    session.album,
    session.artist
  );
}


// ============================================================
// FILA
// ============================================================

function queueContainsAlbum(album, artist) {

  const key = albumKey(album);
  return state.queue.some(item =>
    albumKey(item.album) === key && artistsCompatible(item.artist, artist)
  );
}


function addToQueue(session) {

  if (
    queueContainsAlbum(
      session.album,
      session.artist
    )
  ) {
    return false;
  }

  const item = {

    id: `${session.artistKey}-${session.albumKey}-${Date.now()}`,

    sessionId: makeSessionId(session),

    album: session.album,

    artist: session.artist,

    imageUrl: session.imageUrl || "",

    distinctTracks: new Set(
      session.tracks.map(
        t => normalizeText(t.track)
      )
    ).size,

    scrobbles: session.tracks.length,

    firstTimestamp: session.firstTimestamp,

    lastTimestamp: session.lastTimestamp,

    addedAt: Date.now()
  };

  state.queue.push(item);

  return true;
}


function removeQueueItem(id) {

  state.queue = state.queue.filter(
    item => item.id !== id
  );
}


function ignoreQueueItem(id) {

  const item = state.queue.find(
    x => x.id === id
  );

  if (!item) {
    return;
  }

  if (
    item.sessionId &&
    !state.ignoredSessions.includes(item.sessionId)
  ) {

    state.ignoredSessions.push(item.sessionId);
  }

  removeQueueItem(id);

  saveState();
  render();
}


// ============================================================
// RECONCILIAÇÃO COM O CATÁLOGO
// ============================================================

function reconcileCatalog() {

  const catalog = getCatalogEntries();

  const before = state.queue.length;

  state.queue = state.queue.filter(
    item =>
      !isAlbumCataloged(
        item.album,
        item.artist,
        catalog
      )
  );

  return before - state.queue.length;
}


// ============================================================
// PROCESSAMENTO DAS SESSÕES
// ============================================================

function processSessions(sessions) {

  const catalog = getCatalogEntries();

  let eligible = 0;
  let added = 0;

  for (const session of sessions) {

    const distinctTracks = new Set(
      session.tracks.map(
        t => normalizeText(t.track)
      )
    ).size;

    if (distinctTracks < CFG.minSessionTracks) {
      continue;
    }

    eligible++;

    const sessionId = makeSessionId(session);

    if (state.ignoredSessions.includes(sessionId)) {
      continue;
    }

    if (state.processedSessions.includes(sessionId)) {
      continue;
    }

    if (
      isAlbumCataloged(
        session.album,
        session.artist,
        catalog
      )
    ) {

      state.processedSessions.push(sessionId);

      continue;
    }

    if (
      !queueContainsAlbum(
        session.album,
        session.artist
      )
    ) {

      if (addToQueue(session)) {
        added++;
      }
    }

    state.processedSessions.push(sessionId);
  }

  if (state.processedSessions.length > 1000) {

    state.processedSessions = state.processedSessions.slice(-1000);
  }

  return {
    eligible,
    added
  };
}


// ============================================================
// SESSÕES DE ÁLBUNS CATALOGADOS (V1.27)
// ============================================================
//
// Só visualização. Usa as mesmas regras de elegibilidade
// (faixas distintas) e a mesma identificação de catálogo do
// restante do Monitor. Não consulta nem altera "scrobbles".
// Inclui a sessão mesmo que já tenha sido processada ou ignorada
// antes: aqui a pergunta é só "este álbum já tem nota?".
// ============================================================

function buildCatalogedSessionView(sessions) {

  const catalog = getCatalogEntries();

  const view = [];

  for (const session of sessions) {

    const distinctTracks = new Set(
      session.tracks.map(
        t => normalizeText(t.track)
      )
    ).size;

    if (distinctTracks < CFG.minSessionTracks) {
      continue;
    }

    const entry = findCatalogedEntry(
      session.album,
      session.artist,
      catalog
    );

    if (!entry) {
      continue;
    }

    view.push({
      id: makeSessionId(session),

      album: session.album,

      artist: session.artist,

      imageUrl: session.imageUrl || "",

      distinctTracks,

      scrobbles: session.tracks.length,

      firstTimestamp: session.firstTimestamp,

      lastTimestamp: session.lastTimestamp,

      notePath: entry.path
    });
  }

  return view.sort(
    (a, b) => b.lastTimestamp - a.lastTimestamp
  );
}


// ============================================================
// POLL
// ============================================================

let pollInProgress = false;
let pollGeneration = 0;

async function poll() {
  if (pollInProgress) return false;
  pollInProgress = true;
  const generation = pollGeneration;
  try {

    state.diagnostics.lastApiStatus = "Consultando Last.fm...";

    state.diagnostics.lastApiMessage = "";

    render();

    const tracks = await fetchRecentTracks();
    if (generation !== pollGeneration) return false;

    state.diagnostics.lastFetchAt = Date.now();

    state.diagnostics.lastFetchCount = tracks.length;

    if (tracks.length) {

      const last = tracks[tracks.length - 1];

      state.diagnostics.lastTrack = last.track;

      state.diagnostics.lastAlbum = last.album;

      state.diagnostics.lastArtist = last.artist;

    } else {

      state.diagnostics.lastTrack = "";

      state.diagnostics.lastAlbum = "";

      state.diagnostics.lastArtist = "";
    }

    state.diagnostics.lastApiStatus = "OK";

    state.diagnostics.lastApiMessage = `${tracks.length} scrobbles encontrados`;

    const sessions = groupIntoSessions(tracks);

    state.diagnostics.lastSessionCount = sessions.length;

    // V1.27 — sessões de álbuns já catalogados (só visualização)
    catalogedSessions = buildCatalogedSessionView(sessions);
    catalogedViewReady = true;

    const result = processSessions(sessions);

    state.diagnostics.lastEligibleSessionCount = result.eligible;

    state.diagnostics.lastNewSessionCount = result.added;

    reconcileCatalog();

    state.lastPollAt = Date.now();

    state.initialized = true;

    saveState();
    render();

  } catch (error) {
    if (generation !== pollGeneration) return false;
    console.error("Monitor V1.29:", error);

    state.diagnostics.lastApiStatus = "ERRO";

    state.diagnostics.lastApiMessage = error?.message || String(error);

    state.lastPollAt = Date.now();

    saveState();
    render();
  } finally {
    pollInProgress = false;
  }
  return true;
}


// ============================================================
// MEDIADB
// ============================================================

function findMediaDBMusicReleaseCommand() {

  try {

    if (
      !app.commands ||
      typeof app.commands.listCommands !== "function"
    ) {
      return null;
    }

    const commands = app.commands.listCommands();

    const exact = Object.entries(commands).find(
      ([id, command]) =>
        command &&
        command.name === "Media DB: Create Media DB entry (Music Release)"
    );

    if (exact) {

      return {
        id: exact[0],
        ...exact[1]
      };
    }

    const flexible = Object.entries(commands).find(
      ([id, command]) => {

        if (!command?.name) {
          return false;
        }

        const name = command.name.toLowerCase();

        return (
          name.includes("media db") &&
          name.includes("music release")
        );
      }
    );

    if (flexible) {

      return {
        id: flexible[0],
        ...flexible[1]
      };
    }

  } catch (e) {

    console.error("Erro procurando comando MediaDB:", e);
  }

  return null;
}


function findVisibleModal() {

  const modals = Array.from(
    document.querySelectorAll(".modal-container, .modal")
  );

  return modals
    .filter(
      el => el.offsetParent !== null
    )
    .at(-1);
}


function findTitleInput(modal) {

  if (!modal) {
    return null;
  }

  const inputs = Array.from(
    modal.querySelectorAll("input, textarea")
  );

  const keywords = [
    "title",
    "titulo",
    "título",
    "album",
    "álbum",
    "name",
    "nome"
  ];

  for (const input of inputs) {

    const text = [
      input.placeholder,
      input.name,
      input.id,
      input.getAttribute("aria-label")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (
      keywords.some(
        key => text.includes(key)
      )
    ) {
      return input;
    }
  }

  return null;
}


async function createMediaDBEntry(album, artist) {

  const command = findMediaDBMusicReleaseCommand();

  if (!command) {

    new Notice("Comando de Music Release do MediaDB não encontrado.");

    return;
  }

  try {

    await app.commands.executeCommandById(command.id);

    // O MediaDB pode levar mais tempo para abrir, especialmente no celular.
    let modal = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      modal = findVisibleModal();
      if (modal && findTitleInput(modal)) break;
      await sleep(100);
    }

    if (!modal) {

      new Notice("MediaDB abriu, mas a janela não foi encontrada.");

      return;
    }

    const input = findTitleInput(modal);

    const desired = `${album} - ${artist}`;

    if (!input) {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(desired);
          new Notice(`Campo não localizado. Pesquisa copiada: ${desired}`);
        } else {
          new Notice(`Digite no MediaDB: ${desired}`);
        }
      } catch (error) {
        new Notice(`Digite no MediaDB: ${desired}`);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(input);

    const descriptor = Object.getOwnPropertyDescriptor(
      prototype,
      "value"
    );

    if (
      descriptor &&
      descriptor.set
    ) {

      descriptor.set.call(input, desired);

    } else {

      input.value = desired;
    }

    input.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    input.dispatchEvent(
      new Event("change", { bubbles: true })
    );

    new Notice("Pesquisa preenchida. Confirme a catalogação no MediaDB.");

  } catch (error) {

    console.error("Erro MediaDB:", error);

    new Notice("Erro ao abrir/preencher o MediaDB.");
  }
}


// ============================================================
// FORMATAÇÃO
// ============================================================

function formatTime(timestamp) {

  if (!timestamp) {
    return "—";
  }

  return new Date(timestamp).toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


function formatDateTime(timestamp) {

  if (!timestamp) {
    return "—";
  }

  return new Date(timestamp).toLocaleString(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


// ============================================================
// RENDER
// ============================================================

const container = dv.container;

container.innerHTML = "";


function saveState() {

  try {

    localStorage.setItem(
      CFG.stateKey,
      JSON.stringify(state)
    );

  } catch (e) {

    console.error("Erro salvando estado:", e);
  }
}


// V1.27 — lista de sessões de álbuns catalogados (só visualização)
function renderCatalogedSessions(section) {

  if (!catalogedViewReady) {

    const waiting = section.createDiv({ cls: "mm-empty" });

    waiting.createDiv({
      cls: "mm-empty-title",
      text: "Aguardando a primeira consulta ao Last.fm"
    });

    waiting.createDiv({
      cls: "mm-empty-text",
      text: "As sessões de álbuns catalogados aparecem assim que a consulta terminar."
    });

    return;
  }

  if (!catalogedSessions.length) {

    const empty = section.createDiv({ cls: "mm-empty" });

    empty.createDiv({
      cls: "mm-empty-title",
      text: "Nenhuma sessão de álbum catalogado"
    });

    empty.createDiv({
      cls: "mm-empty-text",
      text:
        `Não há sessões elegíveis de álbuns já catalogados ` +
        `nas últimas ${CFG.bootstrapLookbackHours} horas.`
    });

    return;
  }

  const list = section.createDiv({ cls: "mm-queue" });

  for (const item of catalogedSessions) {

    const card = list.createDiv({ cls: "mm-card" });

    if (item.imageUrl) {

      const img = card.createEl("img", { cls: "mm-cover" });

      img.src = item.imageUrl;

      img.alt = item.album;

    } else {

      card.createDiv({
        cls: "mm-cover-empty",
        text: "Sem capa"
      });
    }

    const info = card.createDiv({ cls: "mm-info" });

    info.createDiv({
      cls: "mm-album",
      text: item.album
    });

    info.createDiv({
      cls: "mm-artist",
      text: item.artist
    });

    const metaRow = info.createDiv({ cls: "mm-meta-row" });

    metaRow.createDiv({
      cls: "mm-meta",
      text: "Já catalogado"
    });

    metaRow.createDiv({
      cls: "mm-meta",
      text: `${item.distinctTracks} faixas distintas`
    });

    metaRow.createDiv({
      cls: "mm-meta",
      text: `${item.scrobbles} scrobbles na sessão`
    });

    metaRow.createDiv({
      cls: "mm-meta",
      text: `Ouvido em ${formatDateTime(item.firstTimestamp)}`
    });

    const actions = info.createDiv({ cls: "mm-actions" });

    const noteButton = actions.createEl("button", { text: "Abrir nota" });

    noteButton.dataset.action = "open-note";

    noteButton.dataset.id = item.id;

    noteButton.dataset.path = item.notePath;
  }
}


function render() {

  container.innerHTML = "";

  const root = container.createEl(
    "div",
    { cls: "music-monitor-v126" }
  );

  // ========================================================
  // ESTILO
  // ========================================================

  const style = document.createElement("style");

  style.textContent = `
/* NOTE TO NOTE — IDENTIDADE VISUAL DA CENTRAL V1.7 */
.music-monitor-v126 {
  --nt-bg:#191d23; --nt-surface:#22272e; --nt-surface-2:#292f38;
  --nt-line:#383f48; --nt-ink:#e9edf0; --nt-muted:#a0aab5;
  --nt-accent:#8ca9c7; --nt-accent-bg:#2a3949;
  --mm-bg:var(--nt-bg); --mm-panel:var(--nt-surface); --mm-panel-alt:var(--nt-surface-2);
  --mm-line:var(--nt-line); --mm-ink:var(--nt-ink); --mm-muted:var(--nt-muted);
  --mm-accent:var(--nt-accent); --mm-accent-soft:var(--nt-accent-bg);
  display:flex;flex-direction:column;gap:18px;width:100%;max-width:990px;min-width:0;
  margin:0 auto;padding:24px 26px 34px;background:var(--nt-bg);color:var(--nt-ink);
  border:1px solid var(--nt-line);border-radius:10px;
  font-family:var(--font-interface),system-ui,sans-serif;font-size:14px;line-height:1.5;
}
.music-monitor-v126,.music-monitor-v126 * {box-sizing:border-box}
.music-monitor-v126 > * {min-width:0;max-width:100%}
.music-monitor-v126 button {font:inherit;box-shadow:none!important;height:auto;cursor:pointer}
.music-monitor-v126 button:focus-visible {outline:2px solid var(--nt-accent);outline-offset:2px}
.music-monitor-v126 button:disabled {opacity:.5;cursor:default}
.music-monitor-v126 .mm-hero {padding:8px 2px 14px;border-bottom:1px solid var(--nt-line);background:transparent;border-radius:0;margin:0}
.music-monitor-v126 .mm-eyebrow {font-size:10px;letter-spacing:.19em;font-weight:750;color:var(--nt-accent);text-transform:uppercase}
.music-monitor-v126 .mm-title-row {display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.music-monitor-v126 .mm-title {font-size:clamp(25px,4vw,35px);font-weight:750;letter-spacing:-.045em;line-height:1.16;margin:9px 0 7px;color:var(--nt-ink)}
.music-monitor-v126 .mm-version {font-size:10px;font-weight:650;border:1px solid var(--nt-line);border-radius:3px;padding:3px 7px;color:var(--nt-muted)}
.music-monitor-v126 .mm-subtitle {font-size:12px;color:var(--nt-muted);line-height:1.65;max-width:670px}
.music-monitor-v126 .mm-overview {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
.music-monitor-v126 .mm-overview-item {padding:20px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);min-width:0}
.music-monitor-v126 .mm-overview-value {font-size:25px;font-weight:750;letter-spacing:-.04em;line-height:1.2;color:var(--nt-ink)}
.music-monitor-v126 .mm-overview-label {margin-top:8px;font-size:11px;color:var(--nt-muted)}
.music-monitor-v126 .mm-control-panel {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:0 0 13px;border-bottom:1px solid var(--nt-line);background:transparent;margin:0}
.music-monitor-v126 .mm-controls {display:flex;gap:8px;flex-wrap:wrap}
.music-monitor-v126 .mm-controls button,.music-monitor-v126 .mm-actions button {
  border-radius:5px!important;padding:8px 13px!important;min-height:35px;
  line-height:1.3;font-size:12px!important;font-weight:650;white-space:normal;
  max-width:100%;background:transparent!important;color:var(--nt-muted)!important;
  border:1px solid var(--nt-line)!important;
}
.music-monitor-v126 .mm-controls button:hover,.music-monitor-v126 .mm-actions button:hover {color:var(--nt-ink)!important;border-color:#70859a!important}
.music-monitor-v126 .mm-controls button:first-child,.music-monitor-v126 .mm-actions button:first-child {background:var(--nt-accent)!important;color:#101b25!important;border-color:var(--nt-accent)!important}
.music-monitor-v126 .mm-controls button:first-child:hover,.music-monitor-v126 .mm-actions button:first-child:hover {filter:brightness(1.08)}
.music-monitor-v126 .mm-control-info {font-size:11px;color:var(--nt-muted)}
.music-monitor-v126 .mm-status {display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:13px 15px;border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);margin:0}
.music-monitor-v126 .mm-status-line {display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700}
.music-monitor-v126 .mm-status-detail {font-size:11px;color:var(--nt-muted)}
.music-monitor-v126 .mm-dot {display:inline-block;width:8px;height:8px;border-radius:50%;background:#768395}
.music-monitor-v126 .mm-dot.running {background:#81c4a3;box-shadow:0 0 0 3px rgba(129,196,163,.12)}
.music-monitor-v126 .mm-dot.error {background:#e08f8f}
.music-monitor-v126 .mm-section {margin:0}
.music-monitor-v126 .mm-section-heading {display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--nt-line);padding:0 2px 8px;margin-bottom:10px}
.music-monitor-v126 .mm-section-title {font-size:16px;font-weight:750;letter-spacing:-.02em;color:var(--nt-ink)}
.music-monitor-v126 .mm-section-count {font-size:11px;color:var(--nt-muted)}
.music-monitor-v126 .mm-diagnostic-details {border:1px solid var(--nt-line);border-radius:7px;background:var(--nt-surface);overflow:hidden;margin:0}
.music-monitor-v126 .mm-diagnostic-details > summary {cursor:pointer;list-style:none;padding:13px 15px;font-weight:700;font-size:12px;color:var(--nt-muted);display:flex;justify-content:space-between;align-items:center}
.music-monitor-v126 .mm-diagnostic-details > summary::-webkit-details-marker {display:none}
.music-monitor-v126 .mm-diagnostic-details > summary::after {content:'▾';color:var(--nt-accent)}
.music-monitor-v126 .mm-diagnostic-details[open] > summary::after {content:'▴'}
.music-monitor-v126 .mm-diagnostics {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:0 12px 12px}
.music-monitor-v126 .mm-stat {padding:13px;border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-bg);min-width:0}
.music-monitor-v126 .mm-stat-label {color:var(--nt-muted);font-size:10px;margin-bottom:5px}
.music-monitor-v126 .mm-stat-value {font-size:13px;font-weight:750;overflow-wrap:anywhere}
.music-monitor-v126 .mm-debug {color:var(--nt-muted);font-size:11px;padding:10px 12px;border-left:2px solid var(--nt-accent);background:var(--nt-surface);border-radius:4px;overflow-wrap:anywhere;margin:0}
.music-monitor-v126 .mm-error {border:1px solid rgba(224,143,143,.45);background:rgba(224,143,143,.07);padding:12px;border-radius:7px;margin:0}
.music-monitor-v126 .mm-error-title {font-size:12px;color:#f0aaaa;font-weight:750;margin-bottom:4px}
.music-monitor-v126 .mm-error-message {font-size:11px;color:#e6b6b6}
.music-monitor-v126 .mm-tabs {display:flex;gap:6px;flex-wrap:wrap;padding:0 0 12px;border-bottom:1px solid var(--nt-line);background:transparent;border-radius:0;margin:0;width:100%}
.music-monitor-v126 .mm-tabs button {background:transparent!important;color:var(--nt-muted)!important;border:1px solid transparent!important;border-radius:5px!important;padding:9px 15px!important;min-height:38px;font-weight:600;font-size:12px!important;white-space:normal}
.music-monitor-v126 .mm-tabs button:hover {background:var(--nt-surface)!important;color:var(--nt-ink)!important}
.music-monitor-v126 .mm-tabs button.is-active {background:var(--nt-accent-bg)!important;color:#c4d8eb!important;border-color:#4b647d!important}
.music-monitor-v126 .mm-filter-hint {color:var(--nt-muted);font-size:11px;margin:0 0 10px;line-height:1.5}
.music-monitor-v126 .mm-queue {display:flex;flex-direction:column;gap:9px}
.music-monitor-v126 .mm-card {display:flex;align-items:flex-start;gap:16px;padding:15px;border:1px solid var(--nt-line);border-radius:6px;background:var(--nt-surface);min-width:0;overflow:hidden;transition:border-color .16s}
.music-monitor-v126 .mm-card:hover {border-color:#586676}
.music-monitor-v126 .mm-cover,.music-monitor-v126 .mm-cover-empty {width:88px;height:88px;flex:0 0 88px;border-radius:4px}
.music-monitor-v126 .mm-cover {display:block;object-fit:cover;background:var(--nt-surface-2)}
.music-monitor-v126 .mm-cover-empty {display:flex;align-items:center;justify-content:center;text-align:center;background:var(--nt-surface-2);color:var(--nt-muted);font-size:10px}
.music-monitor-v126 .mm-info {min-width:0;flex:1}
.music-monitor-v126 .mm-album {font-size:16px;font-weight:750;letter-spacing:-.025em;color:var(--nt-ink);line-height:1.25;overflow-wrap:anywhere}
.music-monitor-v126 .mm-artist {font-size:12px;color:var(--nt-accent);margin-top:5px;overflow-wrap:anywhere}
.music-monitor-v126 .mm-meta-row {display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.music-monitor-v126 .mm-meta {font-size:10px;color:var(--nt-muted);border:1px solid var(--nt-line);padding:2px 7px;border-radius:3px;background:var(--nt-bg)}
.music-monitor-v126 .mm-actions {display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
.music-monitor-v126 .mm-actions button {font-size:11px!important;padding:6px 10px!important;min-height:31px}
.music-monitor-v126 .mm-empty {border:1px solid var(--nt-line);border-radius:7px;padding:28px 18px;text-align:center;background:var(--nt-surface)}
.music-monitor-v126 .mm-empty-title {font-size:13px;font-weight:700;margin-bottom:5px}
.music-monitor-v126 .mm-empty-text {font-size:11px;color:var(--nt-muted);line-height:1.5}
@media(max-width:650px) {
  .music-monitor-v126 {padding:18px 14px 26px;gap:14px}
  .music-monitor-v126 .mm-overview {gap:7px}
  .music-monitor-v126 .mm-overview-item {padding:12px 9px}
  .music-monitor-v126 .mm-overview-value {font-size:20px}
  .music-monitor-v126 .mm-overview-label {font-size:10px}
  .music-monitor-v126 .mm-diagnostics {grid-template-columns:repeat(2,minmax(0,1fr))}
  .music-monitor-v126 .mm-card {padding:11px;gap:11px}
  .music-monitor-v126 .mm-cover,.music-monitor-v126 .mm-cover-empty {width:68px;height:68px;flex-basis:68px}
  .music-monitor-v126 .mm-album {font-size:14px}
  .music-monitor-v126 .mm-tabs button {flex:1}
}
`;

  root.appendChild(style);


  // ========================================================
  // HERO
  // ========================================================

  const hero = root.createDiv({ cls: "mm-hero" });

  const heroContent = hero.createDiv({ cls: "mm-hero-content" });

  heroContent.createDiv({
    cls: "mm-eyebrow",
    text: "NOTE TO NOTE  /  ACOMPANHAMENTO"
  });

  const titleRow = heroContent.createDiv({ cls: "mm-title-row" });

  titleRow.createDiv({
    cls: "mm-title",
    text: "Monitor"
  });

  titleRow.createDiv({
    cls: "mm-version",
    text: `V${CFG.version}`
  });

  heroContent.createDiv({
    cls: "mm-subtitle",
    text:
      "Sessões de audição e catalogação, em um só lugar."
  });


  // Resumo da última consulta e da fila, sem modificar o estado.
  const overview = root.createDiv({ cls: "mm-overview" });
  for (const [label, value] of [
    ["Álbuns na fila", state.queue.length],
    ["Sessões elegíveis", state.diagnostics.lastEligibleSessionCount],
    ["Scrobbles recentes", state.diagnostics.lastFetchCount]
  ]) {
    const tile = overview.createDiv({ cls: "mm-overview-item" });
    tile.createDiv({ cls: "mm-overview-value", text: String(value ?? 0) });
    tile.createDiv({ cls: "mm-overview-label", text: label });
  }

  // ========================================================
  // CONTROLES
  // ========================================================

  const controlPanel = root.createDiv({ cls: "mm-control-panel" });

  const controls = controlPanel.createDiv({ cls: "mm-controls" });

  const startButton = controls.createEl("button", { text: "Iniciar" });

  const stopButton = controls.createEl("button", { text: "Parar" });

  const updateButton = controls.createEl("button", { text: "Atualizar agora" });

  const resetButton = controls.createEl("button", { text: "Resetar" });

  const controlInfo = controlPanel.createDiv({ cls: "mm-control-info" });

  controlInfo.createSpan({
    text: `Consulta automática a cada ${CFG.pollMs / 1000}s`
  });


  // ========================================================
  // STATUS
  // ========================================================

  const status = root.createDiv({ cls: "mm-status" });

  const statusLine = status.createDiv({ cls: "mm-status-line" });

  const dot = statusLine.createSpan({
    cls:
      "mm-dot" +
      (
        state.diagnostics.lastApiStatus === "ERRO"
          ? " error"
          : state.running
            ? " running"
            : ""
      )
  });

  statusLine.createSpan({
    text: state.running
      ? "Monitor ativo"
      : "Monitor parado"
  });

  status.createDiv({
    cls: "mm-status-detail",
    text:
      state.diagnostics.lastApiStatus === "OK"
        ? state.diagnostics.lastApiMessage ||
          "Last.fm conectado"
        : state.diagnostics.lastApiStatus
  });


  // ========================================================
  // DIAGNÓSTICO
  // ========================================================

  const diagnosticSection = root.createEl("details", { cls: "mm-diagnostic-details" });
  diagnosticSection.createEl("summary", { text: "Detalhes da última consulta" });
  const diagnostics = diagnosticSection.createDiv({ cls: "mm-diagnostics" });

  function addStat(label, value) {

    const box = diagnostics.createDiv({ cls: "mm-stat" });

    box.createDiv({
      cls: "mm-stat-label",
      text: label
    });

    box.createDiv({
      cls: "mm-stat-value",
      text:
        value === undefined ||
        value === null ||
        value === ""
          ? "—"
          : String(value)
    });
  }


  addStat("Last.fm", state.diagnostics.lastApiStatus);

  addStat("Scrobbles lidos", state.diagnostics.lastFetchCount);

  addStat("Sessões encontradas", state.diagnostics.lastSessionCount);

  addStat("Sessões elegíveis", state.diagnostics.lastEligibleSessionCount);

  addStat("Novas nesta atualização", state.diagnostics.lastNewSessionCount);

  addStat("Itens na fila", state.queue.length);

  addStat("Última consulta", formatDateTime(state.diagnostics.lastFetchAt));

  addStat("Última atualização", formatDateTime(state.lastPollAt));


  // ========================================================
  // ÚLTIMO SCROBBLE
  // ========================================================

  if (
    state.diagnostics.lastTrack ||
    state.diagnostics.lastAlbum ||
    state.diagnostics.lastArtist
  ) {

    const debug = root.createDiv({ cls: "mm-debug" });

    debug.createDiv({
      text:
        `Último scrobble: ` +
        `${state.diagnostics.lastTrack || "?"} — ` +
        `${state.diagnostics.lastAlbum || "?"} — ` +
        `${state.diagnostics.lastArtist || "?"}`
    });
  }


  // ========================================================
  // ERRO
  // ========================================================

  if (state.diagnostics.lastApiStatus === "ERRO") {

    const error = root.createDiv({ cls: "mm-error" });

    error.createDiv({
      cls: "mm-error-title",
      text: "Last.fm retornou um erro"
    });

    error.createDiv({
      cls: "mm-error-message",
      text: state.diagnostics.lastApiMessage || "Erro desconhecido"
    });
  }


  // ========================================================
  // FILA
  // ========================================================

  const queueSection = root.createDiv({ cls: "mm-section" });

  const queueHeading = queueSection.createDiv({
    cls: "mm-section-heading"
  });

  // V1.27 — com o filtro ligado a seção mostra as sessões catalogadas
  const showCataloged = state.showCatalogedOnly === true;

  queueHeading.createDiv({
    cls: "mm-section-title",
    text: showCataloged
      ? "Sessões de álbuns catalogados"
      : "Álbuns guardados"
  });

  queueHeading.createDiv({
    cls: "mm-section-count",
    text: showCataloged
      ? `${catalogedSessions.length} ${
          catalogedSessions.length === 1
            ? "sessão"
            : "sessões"
        }`
      : `${state.queue.length} ${
          state.queue.length === 1
            ? "álbum"
            : "álbuns"
        }`
  });


  // Abas apenas de visualização: a fila persistente permanece intacta.
  const tabs = queueSection.createDiv({ cls: "mm-tabs" });
  const queueTab = tabs.createEl("button", {
    text: `Para catalogar (${state.queue.length})`,
    cls: showCataloged ? "" : "is-active"
  });
  const catalogTab = tabs.createEl("button", {
    text: `Já catalogados (${catalogedSessions.length})`,
    cls: showCataloged ? "is-active" : ""
  });
  queueTab.setAttribute("aria-pressed", String(!showCataloged));
  catalogTab.setAttribute("aria-pressed", String(showCataloged));
  queueTab.addEventListener("click", () => {
    state.showCatalogedOnly = false;
    saveState();
    render();
  });
  catalogTab.addEventListener("click", () => {
    state.showCatalogedOnly = true;
    saveState();
    render();
  });
  if (showCataloged) {
    queueSection.createDiv({
      cls: "mm-filter-hint",
      text: "Sessões de álbuns já presentes no catálogo. A fila de catalogação não é alterada."
    });
  }

  if (showCataloged) {

    renderCatalogedSessions(queueSection);

  } else if (!state.queue.length) {

    const empty = queueSection.createDiv({ cls: "mm-empty" });

    empty.createDiv({
      cls: "mm-empty-title",
      text: "Nenhum álbum aguardando catalogação"
    });

    empty.createDiv({
      cls: "mm-empty-text",
      text: "Quando o monitor identificar uma sessão elegível, ela aparecerá aqui."
    });

  } else {

    const queue = queueSection.createDiv({ cls: "mm-queue" });

    for (const item of state.queue) {

      const card = queue.createDiv({ cls: "mm-card" });

      if (item.imageUrl) {

        const img = card.createEl("img", { cls: "mm-cover" });

        img.src = item.imageUrl;

        img.alt = item.album;

      } else {

        card.createDiv({
          cls: "mm-cover-empty",
          text: "Sem capa"
        });
      }


      const info = card.createDiv({ cls: "mm-info" });

      info.createDiv({
        cls: "mm-album",
        text: item.album
      });

      info.createDiv({
        cls: "mm-artist",
        text: item.artist
      });


      const metaRow = info.createDiv({ cls: "mm-meta-row" });


      const totalText = item.totalTracks
        ? ` / ${item.totalTracks}`
        : "";

      metaRow.createDiv({
        cls: "mm-meta",
        text:
          `${item.distinctTracks || 0}` +
          `${totalText} faixas distintas`
      });

      metaRow.createDiv({
        cls: "mm-meta",
        text: `${item.scrobbles || 0} scrobbles`
      });

      metaRow.createDiv({
        cls: "mm-meta",
        text: `Detectado às ${formatTime(item.addedAt)}`
      });


      const actions = info.createDiv({ cls: "mm-actions" });


      const mediaButton = actions.createEl(
        "button",
        { text: "Adicionar ao MediaDB" }
      );

      mediaButton.dataset.action = "mediadb";

      mediaButton.dataset.id = item.id;


      const ignoreButton = actions.createEl(
        "button",
        { text: "Ignorar" }
      );

      ignoreButton.dataset.action = "ignore";

      ignoreButton.dataset.id = item.id;
    }
  }


  // ========================================================
  // EVENTOS
  // ========================================================

  startButton.onclick = async () => {

    await controller.start();
  };


  stopButton.onclick = () => {

    controller.stop();
  };


  updateButton.onclick = async () => {

    updateButton.disabled = true;

    try {

      await controller.update();

    } finally {

      updateButton.disabled = false;
    }
  };


  resetButton.onclick = () => {

    controller.reset();
  };


  root.addEventListener(
    "click",
    async event => {

      const target = event.target.closest("button");

      if (!target) {
        return;
      }

      const action = target.dataset.action;

      const id = target.dataset.id;

      if (!action || !id) {
        return;
      }

      if (action === "ignore") {

        ignoreQueueItem(id);

        return;
      }

      // V1.27 — abrir a nota de uma sessão catalogada
      if (action === "open-note") {

        const path = target.dataset.path;

        if (path) {
          app.workspace.openLinkText(path, "", false);
        }

        return;
      }

      if (action === "mediadb") {

        const item = state.queue.find(
          x => x.id === id
        );

        if (!item) {
          return;
        }

        await createMediaDBEntry(
          item.album,
          item.artist
        );
      }
    }
  );
}


// ============================================================
// CONTROLLER
// ============================================================

function createController() {

  let intervalId = null;
  let destroyed = false;


  async function start() {

    if (destroyed) {
      return;
    }

    if (
      state.running &&
      intervalId
    ) {
      return;
    }

    state.running = true;

    saveState();
    render();

    await poll();

    if (
      destroyed ||
      !state.running
    ) {
      return;
    }

    if (!intervalId) {

      intervalId = setInterval(
        async () => {

          if (
            destroyed ||
            !state.running
          ) {
            return;
          }

          await poll();

        },
        CFG.pollMs
      );
    }
  }


  function stop() {

    state.running = false;

    if (intervalId) {

      clearInterval(intervalId);

      intervalId = null;
    }

    saveState();
    render();
  }


  async function update() {

    if (destroyed) {
      return;
    }

    await poll();
  }


  function reset() {

    if (intervalId) {

      clearInterval(intervalId);

      intervalId = null;
    }

    pollGeneration++; // Invalida o resultado de consultas iniciadas antes do reset.
    const fresh = createEmptyState();

    state.running = false;

    state.initialized = false;

    state.queue = fresh.queue;

    state.processedSessions = fresh.processedSessions;

    state.ignoredSessions = fresh.ignoredSessions;

    state.lastPollAt = null;

    state.diagnostics = fresh.diagnostics;

    saveState();
    render();

    new Notice("Monitor resetado.");
  }


  function destroy() {

    destroyed = true;
    pollGeneration++; // Impede que controladores antigos alterem o estado.

    if (intervalId) {

      clearInterval(intervalId);

      intervalId = null;
    }
  }


  return {
    start,
    stop,
    update,
    reset,
    destroy
  };
}


// ============================================================
// CONTROLLER GLOBAL
// ============================================================

let controller = createController();


try {

  const old = window[CFG.controllerKey];

  if (
    old &&
    typeof old.destroy === "function"
  ) {

    old.destroy();
  }

} catch (e) {

  console.error(e);
}


window[CFG.controllerKey] = controller;


// ============================================================
// RENDER INICIAL
// ============================================================

render();


// ============================================================
// AUTO START
// ============================================================

if (hasLastFmCredentials()) {

  await controller.start();

} else {

  state.diagnostics.lastApiStatus = "Last.fm não configurado";

  state.diagnostics.lastApiMessage = monitorConfigError || "Configure o Last.fm no Instalador Musical.";

  saveState();
  render();
}
```