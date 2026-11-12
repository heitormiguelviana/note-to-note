```dataviewjs
// ============================================================
// RELATÓRIO MUSICAL V3.7.0 — INTERFACE UNIFICADA
// Last.fm + Deezer + catálogo MediaDB
//
// BASE:
// - Relatório Musical V3 (exportação PNG Wrapped)
//
// NOVO NESTA VERSÃO (somente exportação + Topster):
// - Wrapped redesenhado: altura calculada pelo conteúdo, sem sobreposição,
//   largura total aproveitada, mais detalhes (datas, dia mais intenso,
//   top faixas, gêneros, evolução, acervo)
// - Foto de artista em branco/preta -> usa a capa do álbum mais ouvido
// - Capas em alta resolução via Deezer (com cache)
// - Nova aba "Topster" com prévia e exportação PNG
//
// NÃO ALTERADO: coleta Last.fm, sessões, lançamentos, acervo,
// gêneros, imagens de artistas e as demais abas.
// ============================================================

// ============================================================
// CONFIGURAÇÃO
// ============================================================

// Integração com a Central de Configurações Musical V2.2.
// Os demais parâmetros e chaves de estado permanecem inalterados.
const MUSICAL_CONFIG_PATH = "Musicas/Sistema/Configuracoes.json";
const musicalConfigFile = dv.app.vault.getAbstractFileByPath(MUSICAL_CONFIG_PATH);
if (!musicalConfigFile) {
  throw new Error("Relatório Musical: configure o Musical primeiro (Musicas/Sistema/Configuracoes.json não encontrado).");
}
let musicalConfig;
try {
  musicalConfig = JSON.parse(await dv.app.vault.read(musicalConfigFile));
} catch (error) {
  throw new Error("Relatório Musical: não foi possível ler Configuracoes.json: " + error.message);
}
const musicalLastfmKey = String(musicalConfig?.lastfm?.apiKey || "").trim();
const musicalLastfmUser = String(musicalConfig?.lastfm?.username || "").trim();
if (!musicalLastfmKey || !musicalLastfmUser) {
  throw new Error("Relatório Musical: configure o usuário e a API Key do Last.fm no Musical.");
}

const CFG = {
  root: String(musicalConfig?.paths?.musicRoot || "Musicas").replace(/\/$/, ""),
  central: String(musicalConfig?.paths?.central || "Musicas/Central").replace(/\/$/, ""),

  lastfmKey: musicalLastfmKey,
  lastfmUser: musicalLastfmUser,
  lastfmURL: "https://ws.audioscrobbler.com/2.0/",
  deezerURL: "https://api.deezer.com",

  pageSize: 200,
  maxPages: 250, // limite de segurança; avisar se a coleta ficar incompleta
  delay: 50,

  stateKey: "relatorio-musical-v30",

  minSessionTracks: 2,
  maxSessionGapMinutes: 45,

  artistCacheKey: "relatorio-musical-artists-v30",
  genreCacheKey: "relatorio-musical-genres-v30",
  coverCacheKey: "relatorio-musical-covers-v33",

  artistImageLimit: 30,
  genreArtistLimit: 12,
  deezerConcurrency: 3,
  deezerDelay: 150,

  // EXPORTAÇÃO (a altura do Wrapped agora é calculada)
  exportWidth: 1400,
  exportScale: 2,
  exportMaxPixels: 16000000,
  mobileExportMaxPixels: 3500000,
  mobileExportMaxSide: 4096,
  exportFolder: "Exportacoes",
  exportArtistLimit: 8,
  exportTrackLimit: 8,
  exportAlbumLimit: 6
};

// ============================================================
// PERÍODOS
// ============================================================

const PERIODS = {
  week: "Esta semana",
  month: "Este mês",
  quarter: "3 meses",
  year: "Este ano",
  custom: "Personalizado"
};

// ============================================================
// ESTADO
// ============================================================

let state = {
  period: localStorage.getItem(CFG.stateKey + ":period") || "month",
  tab: localStorage.getItem(CFG.stateKey + ":tab") || "overview",
  customFrom: localStorage.getItem(CFG.stateKey + ":customFrom") || "",
  customTo: localStorage.getItem(CFG.stateKey + ":customTo") || ""
};

const TOPSTER_DEFAULTS = {
  source: "albums",
  size: 4,
  list: "side",
  counts: true,
  gap: false,
  theme: "dark",
  hq: true
};

let topsterOpts = (() => {
  try {
    return {
      ...TOPSTER_DEFAULTS,
      ...JSON.parse(localStorage.getItem(CFG.stateKey + ":topster") || "{}")
    };
  } catch (_) {
    return { ...TOPSTER_DEFAULTS };
  }
})();

function saveTopsterOpts() {
  try {
    localStorage.setItem(CFG.stateKey + ":topster", JSON.stringify(topsterOpts));
  } catch (_) {}
}

// ============================================================
// UTILIDADES
// ============================================================

function arr(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && typeof value.array === "function") return value.array();
  return [value];
}

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value.path) return value.path;
  if (value.value != null) return textValue(value.value);
  if (value.display != null) return String(value.display);
  return String(value);
}

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function artistKey(value) {
  return norm(value).replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, "").trim();
}

function trackKey(artist, track) {
  return artistKey(artist) + "::" + norm(track).replace(/\s*(feat\.?|ft\.?|featuring)\s+.*$/i, "");
}

function albumKey(artist, album) {
  return (
    artistKey(artist) +
    "::" +
    norm(album)
      .replace(/\b(deluxe|expanded|special|limited|anniversary|remastered|reissue|bonus|extended)\b/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pct(value) {
  return Math.round(Number(value || 0) * 100) + "%";
}

function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function sortedMap(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

// ============================================================
// CACHE
// ============================================================

function loadCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch (error) {
    console.warn("Relatório V3.5: falha ao ler cache", key, error);
    return {};
  }
}

function saveCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) { console.warn("Relatório V3.5: falha ao salvar cache", key, error); }
}

const artistCache = loadCache(CFG.artistCacheKey);
const genreCache = loadCache(CFG.genreCacheKey);
const coverCache = loadCache(CFG.coverCacheKey);

// ============================================================
// PLACEHOLDER LAST.FM
// ============================================================

const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

function isPlaceholderImage(url) {
  if (!url) return true;
  return String(url).toLowerCase().includes(LASTFM_PLACEHOLDER);
}

function validImage(url) {
  if (!url) return "";
  if (isPlaceholderImage(url)) return "";
  return String(url);
}

// ============================================================
// MAIOR IMAGEM
// ============================================================

function largestImage(images) {
  const list = arr(images)
    .map(item => {
      if (typeof item === "string") return { size: "", url: item };
      return {
        size: String(item?.size || "").toLowerCase(),
        url: textValue(item?.["#text"] || item?.url || "")
      };
    })
    .filter(item => validImage(item.url));

  const order = { mega: 5, extralarge: 4, large: 3, medium: 2, small: 1 };

  list.sort((a, b) => (order[b.size] || 0) - (order[a.size] || 0));

  return validImage(list[0]?.url) || "";
}

// ============================================================
// LAST.FM
// ============================================================

async function lastfm(method, params = {}) {
  const query = new URLSearchParams({
    method,
    api_key: CFG.lastfmKey,
    format: "json",
    ...params
  });

  // Falhas transitórias da API (429/500/502/503/504): até duas novas tentativas.
  // Erros de credenciais, parâmetros ou resposta inválida não são repetidos.
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await window.requestUrl({
        url: CFG.lastfmURL + "?" + query.toString(),
        method: "GET"
      });
      break;
    } catch (error) {
      const message = String(error?.message || error);
      const status = Number(error?.status || error?.statusCode || 0);
      const transient = [429,500,502,503,504].includes(status) || /(?:^|\D)(?:429|500|502|503|504)(?:\D|$)/.test(message);
      if (!transient || attempt === 2) {
        console.warn("Relatório Musical — Last.fm", { method, attempt: attempt + 1, status, message });
        throw new Error(`Falha na consulta Last.fm (${method}): ${message}`);
      }
      await sleep(800 * (2 ** attempt));
    }
  }

  const data = JSON.parse(response.text);

  if (data.error) {
    throw new Error(`Last.fm: ${data.message || data.error}`);
  }

  await sleep(CFG.delay);

  return data;
}

// ============================================================
// DEEZER
// ============================================================

async function deezerSearchArtist(artist) {
  try {
    const query = encodeURIComponent(artist);

    const response = await window.requestUrl({
      url: `${CFG.deezerURL}/search/artist?q=${query}&limit=5`,
      method: "GET"
    });

    const data = JSON.parse(response.text);
    const results = arr(data.data);

    if (!results.length) return "";

    const wanted = norm(artist);
    const exact = results.find(item => norm(item.name) === wanted);
    const match = exact || results[0];

    return (
      validImage(match?.picture_xl) ||
      validImage(match?.picture_big) ||
      validImage(match?.picture_medium) ||
      ""
    );
  } catch (error) {
    console.warn("Deezer artist:", artist, error);
    return "";
  }
}

// NOVO: capa de álbum em alta resolução (somente exportações).
// Só aceita resultado cujo artista + título coincidam, para nunca
// trocar a capa por a de outro álbum. "" = sem resultado confiável.
async function deezerAlbumCover(artist, album) {
  const key = albumKey(artist, album);

  if (coverCache[key]) return coverCache[key];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const q = encodeURIComponent(`artist:"${artist}" album:"${album}"`);

      const response = await window.requestUrl({
        url: `${CFG.deezerURL}/search/album?q=${q}&limit=5`,
        method: "GET"
      });

      const data = JSON.parse(response.text);

      // limite de requisições da Deezer: espera e tenta de novo
      if (data.error) {
        await sleep(1500);
        continue;
      }

      const wanted = albumKey(artist, album);

      const match = arr(data.data).find(
        item => albumKey(item.artist?.name, item.title) === wanted
      );

      const url =
        validImage(match?.cover_xl) ||
        validImage(match?.cover_big) ||
        "";

      if (url) {
        coverCache[key] = url;
        saveCache(CFG.coverCacheKey, coverCache);
      }

      await sleep(CFG.deezerDelay);

      return url;
    } catch (error) {
      console.warn("Deezer album:", artist, album, error);
      return "";
    }
  }

  return "";
}

// ============================================================
// PERÍODO
// ============================================================

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [y,m,d] = value.split("-").map(Number);
  const date = new Date(y,m-1,d);
  return date.getFullYear() === y && date.getMonth() === m-1 && date.getDate() === d ? date : null;
}
function periodBounds(period) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  let from, to = now;
  if (period === "custom") {
    const start = parseLocalDate(state.customFrom), end = parseLocalDate(state.customTo);
    if (!start || !end || start > end || start > now) throw new Error("Selecione um intervalo personalizado válido.");
    from = start;
    to = new Date(Math.min(now.getTime(), new Date(end.getFullYear(),end.getMonth(),end.getDate()+1).getTime()-1));
  } else if (period === "week") {
    const mondayOffset = (now.getDay()+6)%7;
    from = new Date(year,month,now.getDate()-mondayOffset);
  } else if (period === "quarter") {
    from = new Date(year,month-2,1);
  } else if (period === "year") {
    from = new Date(year,0,1);
  } else {
    from = new Date(year,month,1);
  }
  return {from:Math.floor(from.getTime()/1000),to:Math.floor(to.getTime()/1000)};
}
function periodLabel() {
  if (state.period !== "custom") return PERIODS[state.period] || PERIODS.month;
  try { return rangeText(periodBounds("custom")); } catch (_) { return "Período personalizado"; }
}

// ============================================================
// SCROBBLES
// ============================================================

function parseTrack(item) {
  return {
    artist: textValue(item.artist?.["#text"] || item.artist),
    album: textValue(item.album?.["#text"] || item.album),
    name: textValue(item.name),
    uts: Number(item.date?.uts || 0),
    image: largestImage(item.image),
    nowplaying: item["@attr"]?.nowplaying === "true"
  };
}

async function getScrobbles(from, to) {
  const cacheKey=`relatorio-v36-scrobbles:${CFG.lastfmUser}:${from}:${to}`;
  const isHistoric=to < Math.floor(Date.now()/1000)-3*86400;
  if(isHistoric){try{const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");if(Array.isArray(cached))return cached;}catch(_){}}
  const result = [];
  let truncated = false;
  const seen = new Set();

  for (let page = 1; page <= CFG.maxPages; page++) {
    const data = await lastfm("user.getRecentTracks", {
      user: CFG.lastfmUser,
      from,
      to,
      limit: CFG.pageSize,
      page
    });

    const tracks = arr(data.recenttracks?.track);

    if (!tracks.length) break;

    for (const item of tracks) {
      const track = parseTrack(item);

      if (!track.artist || !track.name || !track.uts || track.nowplaying) continue;

      const id = `${track.uts}::${trackKey(track.artist, track.name)}`;

      if (seen.has(id)) continue;

      seen.add(id);
      result.push(track);
    }

    const totalPages = Number(data.recenttracks?.["@attr"]?.totalPages || page);

    if (page >= totalPages) break;
    if (page === CFG.maxPages) truncated = true;
  }

  if (truncated) {
    console.warn("Relatório V3.5: o limite de páginas foi atingido. Os dados podem estar incompletos.");
    try { new Notice("Last.fm: limite de coleta atingido. Estatísticas podem estar incompletas.", 6500); } catch (_) {}
  }
  result.sort((a, b) => a.uts - b.uts);
  // Apenas períodos históricos completos são armazenados. Nunca guardar consultas truncadas.
  if(isHistoric && !truncated && result.length < 3500){
    try {
      const indexKey="relatorio-v36-cache-index";
      const index=JSON.parse(localStorage.getItem(indexKey)||"[]");
      localStorage.setItem(cacheKey,JSON.stringify(result));
      const updated=[...index.filter(x=>x!==cacheKey),cacheKey];
      while(updated.length>5){localStorage.removeItem(updated.shift());}
      localStorage.setItem(indexKey,JSON.stringify(updated));
    }catch(e){console.warn("Cache Last.fm indisponível:",e);}
  }
  return result;
}

// ============================================================
// CATÁLOGO
// ============================================================

function getLibrary() {
  const pages = dv.pages().where(page => page.file.path.startsWith(CFG.root + "/"));

  const result = [];

  for (const page of pages) {
    const path = page.file.path;

    if (path === CFG.central || path.startsWith(CFG.central + "/")) continue;

    if (page.file.name.toLowerCase().includes("template")) continue;

    const type = textValue(page.type).toLowerCase();

    const tags = arr(page.file.tags).map(textValue).map(norm);

    if (type !== "musicrelease" && !tags.includes("mediadb/music/album")) continue;

    const artists = arr(page.artists || page.artist).map(textValue).filter(Boolean);

    const album = textValue(page.title || page.album || page.name || page.file.name);

    if (!artists.length || !album) continue;

    result.push({
      artists,
      album,
      rating: Number(page.personalRating || 0),
      path
    });
  }

  return result;
}

function buildCatalog(library) {
  const exact = new Set();
  const albumArtists = new Map();

  for (const item of library) {
    for (const artist of item.artists) {
      exact.add(albumKey(artist, item.album));

      const key = norm(item.album)
        .replace(/\b(deluxe|expanded|special|limited|anniversary|remastered|reissue|bonus|extended)\b/g, "")
        .replace(/\([^)]*\)/g, "")
        .trim();

      if (!albumArtists.has(key)) albumArtists.set(key, new Set());

      albumArtists.get(key).add(artistKey(artist));
    }
  }

  return { exact, albumArtists };
}

function catalogHas(catalog, artist, album) {
  if (catalog.exact.has(albumKey(artist, album))) return true;

  const key = norm(album)
    .replace(/\b(deluxe|expanded|special|limited|anniversary|remastered|reissue|bonus|extended)\b/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();

  const artists = catalog.albumArtists.get(key);

  return Boolean(artists && artists.has(artistKey(artist)));
}

// ============================================================
// CONTAGENS
// ============================================================

function buildCounts(scrobbles) {
  const artists = new Map();
  const artistLabels = new Map();
  const tracks = new Map();
  const albums = new Map();

  for (const track of scrobbles) {
    const canonical = artistKey(track.artist);
    const display = artistLabels.get(canonical) || track.artist;
    if (!artistLabels.has(canonical)) artistLabels.set(canonical, display);
    artists.set(display, (artists.get(display) || 0) + 1);

    const tk = trackKey(track.artist, track.name);

    if (!tracks.has(tk)) {
      tracks.set(tk, {
        artist: track.artist,
        name: track.name,
        image: track.image,
        count: 0
      });
    }

    const t = tracks.get(tk);
    t.count++;

    if (track.image && !t.image) t.image = track.image;

    const ak = albumKey(track.artist, track.album);

    if (!albums.has(ak)) {
      albums.set(ak, {
        artist: track.artist,
        album: track.album,
        image: track.image,
        count: 0
      });
    }

    const a = albums.get(ak);
    a.count++;

    if (track.image && !a.image) a.image = track.image;
  }

  return {
    artists: sortedMap(artists),
    tracks: [...tracks.values()].sort((a, b) => b.count - a.count),
    albums: [...albums.values()].sort((a, b) => b.count - a.count)
  };
}

// ============================================================
// SESSÕES
// ============================================================

function compatibleArtists(a, b) {
  const aa = artistKey(a);
  const bb = artistKey(b);

  if (aa === bb) return true;

  const partsA = aa.split(/\s*(?:,|&|and)\s*/);
  const partsB = bb.split(/\s*(?:,|&|and)\s*/);

  return partsA.some(part => part.length >= 4 && partsB.includes(part));
}

function groupSessions(tracks) {
  const sessions = [];

  let current = [];

  for (const track of tracks) {
    if (!current.length) {
      current = [track];
      continue;
    }

    const previous = current[current.length - 1];

    const gap = (track.uts - previous.uts) / 60;

    const sameAlbum =
      albumKey(track.artist, track.album) === albumKey(previous.artist, previous.album);

    const compatible = compatibleArtists(track.artist, previous.artist);

    if (gap >= 0 && gap <= CFG.maxSessionGapMinutes && sameAlbum && Boolean(track.album) && Boolean(previous.album) && compatible) {
      current.push(track);
    } else {
      if (current.length >= CFG.minSessionTracks) sessions.push(current);
      current = [track];
    }
  }

  if (current.length >= CFG.minSessionTracks) sessions.push(current);

  return sessions.map(tracks => ({
    tracks,
    artist: tracks[0].artist,
    album: tracks[0].album,
    start: tracks[0].uts,
    end: tracks[tracks.length - 1].uts
  }));
}

// ============================================================
// LANÇAMENTOS
// ============================================================

function analyzeReleases(scrobbles, sessions) {
  const map = new Map();

  for (const track of scrobbles) {
    if (!track.album) continue;
    const key = albumKey(track.artist, track.album);

    if (!map.has(key)) {
      map.set(key, {
        key,
        artist: track.artist,
        album: track.album,
        scrobbles: 0,
        tracks: new Set(),
        sessions: [],
        image: track.image
      });
    }

    const release = map.get(key);

    release.scrobbles++;
    release.tracks.add(trackKey(track.artist, track.name));

    if (track.image && !release.image) release.image = track.image;
  }

  for (const session of sessions) {
    const key = albumKey(session.artist, session.album);
    const release = map.get(key);

    if (release) release.sessions.push(session);
  }

  return [...map.values()].map(release => {
    const distinct = release.tracks.size;

    const bestSession = [...release.sessions].sort((a, b) => b.tracks.length - a.tracks.length)[0];

    let interaction = "contact";

    if (distinct <= 1) {
      interaction = "isolated";
    } else if (bestSession && new Set(bestSession.tracks.map(t=>trackKey(t.artist,t.name))).size >= 3) {
      interaction = "session";
    } else if (distinct >= 3) {
      interaction = "exploration";
    }

    return {
      ...release,
      distinctTracks: distinct,
      bestSession,
      interaction,
      // A quantidade ouvida não revela o tipo real do lançamento.
      type: "unknown"
    };
  });
}

// Metadados oficiais: sem tracklist validada, nunca declarar álbum completo.
const releaseMetaCacheKey = "relatorio-musical-release-tracklists-v36";
const releaseMetaCache = loadCache(releaseMetaCacheKey);
async function enrichReleaseMetadata(releases) {
  for (const release of [...releases].sort((a,b)=>b.scrobbles-a.scrobbles).slice(0,24)) {
    const key=release.key;
    let meta=releaseMetaCache[key];
    if (!meta) {
      try {
        const info=(await lastfm("album.getInfo",{artist:release.artist,album:release.album,autocorrect:0})).album;
        if (artistKey(info?.artist) !== artistKey(release.artist) || norm(info?.name) !== norm(release.album)) continue;
        const tracks=arr(info?.tracks?.track).map(t=>norm(t.name)).filter(Boolean);
        if (tracks.length < 2 || new Set(tracks).size !== tracks.length) continue;
        meta={tracks,checkedAt:Date.now()};
        releaseMetaCache[key]=meta;
      } catch (_) {continue;}
    }
    if (!Array.isArray(meta.tracks)||!meta.tracks.length) continue;
    const allowed=new Set(meta.tracks);
    release.officialTrackCount=allowed.size;
    const qualifying=release.sessions.filter(session=>{
      const heard=new Set(session.tracks.map(t=>norm(t.name)).filter(name=>allowed.has(name)));
      return heard.size / allowed.size >= .9;
    });
    release.completeSessions=qualifying.length;
    if(qualifying.length) release.interaction="complete";
  }
  saveCache(releaseMetaCacheKey,releaseMetaCache);
}

// ============================================================
// ARTISTAS — IMAGENS
// ============================================================

function artistPeriod(period) {
  if (period === "week") return "7day";
  if (period === "month") return "1month";
  if (period === "quarter") return "3month";
  return "12month";
}

function cleanArtistCache() {
  let changed = false;

  for (const key of Object.keys(artistCache)) {
    if (isPlaceholderImage(artistCache[key])) {
      delete artistCache[key];
      changed = true;
    }
  }

  if (changed) saveCache(CFG.artistCacheKey, artistCache);
}

async function loadLastFmArtistImages(artists) {
  try {
    const data = await lastfm("user.getTopArtists", {
      user: CFG.lastfmUser,
      period: artistPeriod(state.period),
      limit: CFG.artistImageLimit
    });

    const apiArtists = arr(data.topartists?.artist);

    for (const artist of apiArtists) {
      const name = textValue(artist.name);
      const image = largestImage(artist.image);

      if (name && image) artistCache[artistKey(name)] = image;
    }

    saveCache(CFG.artistCacheKey, artistCache);
  } catch (error) {
    console.warn("Last.fm artist images:", error);
  }
}

async function loadDeezerFallback(artists) {
  const missing = artists
    .slice(0, CFG.artistImageLimit)
    .filter(([artist]) => !validImage(artistCache[artistKey(artist)]));

  for (let i = 0; i < missing.length; i += CFG.deezerConcurrency) {
    const batch = missing.slice(i, i + CFG.deezerConcurrency);

    await Promise.all(
      batch.map(async ([artist]) => {
        const image = await deezerSearchArtist(artist);

        if (image) artistCache[artistKey(artist)] = image;
      })
    );

    saveCache(CFG.artistCacheKey, artistCache);
  }
}

async function loadArtistImages(artists) {
  cleanArtistCache();
  await loadLastFmArtistImages(artists);
  cleanArtistCache();
  await loadDeezerFallback(artists);
  cleanArtistCache();
  return artistCache;
}

// ============================================================
// GÊNEROS
// ============================================================

function genreBucket(tag) {
  const t = norm(tag);

  if (/hip hop|hip-hop|rap|trap/.test(t)) return "Hip-Hop / Rap";
  if (/r&b|rnb|soul|neo soul|funk/.test(t)) return "R&B / Soul";
  if (/rock|metal|punk|grunge/.test(t)) return "Rock / Metal";
  if (/pop|dance pop|electropop/.test(t)) return "Pop";
  if (/electronic|electronica|house|techno|edm|ambient/.test(t)) return "Eletrônica";
  if (/jazz|blues/.test(t)) return "Jazz / Blues";
  if (/folk|country|americana/.test(t)) return "Folk / Country";
  if (/indie|alternative|shoegaze/.test(t)) return "Indie / Alternative";

  return "Outros";
}

async function loadGenres(artists) {
  const selected = artists.slice(0, CFG.genreArtistLimit);

  const result = new Map();

  const missing = selected.filter(([artist]) => !genreCache[artistKey(artist)]);

  for (const [artist, count] of selected) {
    const tags = genreCache[artistKey(artist)];

    if (!tags) continue;

    for (const bucket of new Set(tags.map(genreBucket))) {
      result.set(bucket, (result.get(bucket) || 0) + count);
    }
  }

  for (const [artist, count] of missing) {
    try {
      const data = await lastfm("artist.getTopTags", { artist, limit: 6 });

      const tags = arr(data.toptags?.tag)
        .map(tag => textValue(tag.name))
        .filter(Boolean);

      genreCache[artistKey(artist)] = tags;

      for (const bucket of new Set(tags.map(genreBucket))) {
        result.set(bucket, (result.get(bucket) || 0) + count);
      }
    } catch (_) {}
  }

  saveCache(CFG.genreCacheKey, genreCache);

  return sortedMap(result);
}

// ============================================================
// EVOLUÇÃO
// ============================================================

function evolution(scrobbles) {
  const map = new Map();

  for (const track of scrobbles) {
    const date = new Date(track.uts * 1000);

    let key;

    if (state.period === "year") {
      key = date.toLocaleDateString("pt-BR", { month: "short" });
    } else {
      key = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }

    map.set(key, (map.get(key) || 0) + 1);
  }

  return [...map.entries()];
}

// ============================================================
// TEMPO
// ============================================================

function listeningTime(scrobbles) {
  // Sem duração por faixa no user.getRecentTracks, estimativa explícita de 3 min/scrobble.
  const seconds = scrobbles.length * 180;

  return { estimated: seconds, known: 0 };
}

// ============================================================
// CSS
// ============================================================

const CSS = `
.music-report { width: 100%; max-width: 1050px; margin: 0 auto; font-size: 14px; }
.music-report * { box-sizing: border-box; }

.music-report .hero { margin-bottom: 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.music-report .hero-main { min-width: 0; }
.music-report h1 { margin: 0; font-size: 1.65em; font-weight: 800; }
.music-report .subtitle { margin-top: 4px; color: var(--text-muted); font-size: .9em; }
.music-report .export-button { flex: 0 0 auto; font-weight: 750; padding: 8px 13px; }

.music-report .periods, .music-report .tabs { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 0; }

.music-report button {
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  color: var(--text-normal);
  border-radius: 8px;
  padding: 7px 11px;
  cursor: pointer;
  font-size: .82em;
}
.music-report button:hover { border-color: var(--interactive-accent); }
.music-report button.active { background: var(--interactive-accent); color: var(--text-on-accent); border-color: var(--interactive-accent); }
.music-report button:disabled { opacity: .6; cursor: default; }

.music-report .panel { padding: 17px; margin-bottom: 12px; border-radius: 15px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); }
.music-report .section-title { font-size: 1.1em; font-weight: 800; margin-bottom: 3px; }
.music-report .section-subtitle { color: var(--text-muted); font-size: .78em; margin-bottom: 13px; }

.music-report .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
.music-report .stat { padding: 14px; border-radius: 12px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); }
.music-report .stat-value { color: var(--text-accent); font-size: 1.35em; font-weight: 800; }
.music-report .stat-label { color: var(--text-muted); font-size: .73em; margin-top: 3px; }

.music-report .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.music-report .card { overflow: hidden; border-radius: 13px; background: var(--background-secondary); border: 1px solid var(--background-modifier-border); transition: transform .12s ease, border-color .12s ease; }
.music-report .card:hover { border-color: var(--background-modifier-border-hover); transform: translateY(-1px); }
.music-report .cover { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.music-report .card-body { padding: 10px; }
.music-report .card-title { font-weight: 750; line-height: 1.2; }
.music-report .card-subtitle { color: var(--text-muted); font-size: .78em; margin-top: 3px; }
.music-report .card-meta { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; }
.music-report .badge { padding: 3px 6px; border-radius: 5px; background: var(--background-primary); color: var(--text-muted); font-size: .68em; }

.music-report .artist-list, .music-report .track-list { display: flex; flex-direction: column; gap: 7px; }
.music-report .row { display: flex; align-items: center; gap: 11px; padding: 8px; border-radius: 10px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); }
.music-report .row-cover { width: 68px; height: 68px; flex: 0 0 68px; object-fit: cover; border-radius: 9px; display: block; }
.music-report .artist-cover { width: 68px; height: 68px; flex: 0 0 68px; object-fit: cover; border-radius: 50%; display: block; background: var(--background-primary); }
.music-report .row-info { min-width: 0; flex: 1; }
.music-report .row-title { font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.music-report .row-subtitle { color: var(--text-muted); font-size: .77em; margin-top: 2px; }
.music-report .row-count { color: var(--text-accent); font-weight: 800; font-size: .85em; }

.music-report .bars { display: flex; flex-direction: column; gap: 9px; }
.music-report .bar-row { display: grid; grid-template-columns: 125px 1fr 40px; align-items: center; gap: 8px; }
.music-report .bar-name { font-size: .78em; }
.music-report .bar-bg { height: 8px; overflow: hidden; border-radius: 5px; background: var(--background-primary); }
.music-report .bar-fill { height: 100%; border-radius: 5px; background: var(--interactive-accent); }
.music-report .bar-value { text-align: right; color: var(--text-muted); font-size: .72em; }

.music-report .loading { padding: 30px; text-align: center; color: var(--text-muted); }
.music-report .empty { padding: 25px; text-align: center; color: var(--text-muted); }

/* TOPSTER */
.music-report .tp-controls { display: flex; flex-direction: column; gap: 9px; margin-bottom: 12px; }
.music-report .tp-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.music-report .tp-label { flex: 0 0 74px; color: var(--text-muted); font-size: .76em; font-weight: 700; }
.music-report .tp-choices { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.music-report .tp-status { color: var(--text-muted); font-size: .78em; min-height: 1.4em; margin-bottom: 8px; }
.music-report .tp-preview { min-height: 80px; margin-bottom: 12px; }
.music-report .tp-preview canvas { width: 100%; height: auto; display: block; border-radius: 12px; border: 1px solid var(--background-modifier-border); }

@media (max-width: 700px) {
  .music-report .hero { align-items: stretch; flex-direction: column; }
  .music-report .export-button { width: 100%; }
  .music-report .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .music-report .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .music-report .tp-label { flex-basis: 100%; }
}

@media (max-width: 430px) {
  .music-report .grid { grid-template-columns: 1fr; }
  .music-report .bar-row { grid-template-columns: 95px 1fr 35px; }
  .music-report .row-cover, .music-report .artist-cover { width: 58px; height: 58px; flex-basis: 58px; }
}

/* V3.5 — identidade Note to Note / Central V1.7 */
.music-report { --nr-bg:#191d23;--nr-panel:#22272e;--nr-border:#39424d;--nr-accent:#8ca9c7;--nr-muted:#a6b0bd; max-width:800px!important; background:var(--nr-bg); color:#e5e7eb; border:1px solid var(--nr-border); border-radius:11px; padding:24px 26px; font-family:var(--font-interface); }
.music-report .hero {padding-bottom:17px; border-bottom:1px solid var(--nr-border); margin-bottom:12px;}
.music-report h1 {font-size:21px;letter-spacing:-.02em;}
.music-report .hero-main:before {content:"NOTE TO NOTE / RELATÓRIO";display:block;font-size:10px;font-weight:800;letter-spacing:2px;color:var(--nr-accent);margin-bottom:8px;}
.music-report .subtitle,.music-report .section-subtitle,.music-report .stat-label,.music-report .tp-label,.music-report .tp-status {color:var(--nr-muted)!important;}
.music-report .panel,.music-report .stat,.music-report .card {background:var(--nr-panel)!important;border:1px solid var(--nr-border)!important;border-radius:7px!important;}
.music-report .panel {padding:15px!important;}
.music-report button {background:var(--nr-bg)!important;border:1px solid var(--nr-border)!important;border-radius:5px!important;color:var(--nr-muted)!important;}
.music-report button.active,.music-report .export-button {background:var(--nr-accent)!important;border-color:var(--nr-accent)!important;color:var(--nr-bg)!important;}
.music-report .periods,.music-report .tabs {gap:5px;margin:10px 0;min-width:0;}
.music-report .periods button,.music-report .tabs button {padding:7px 9px;font-size:11px;}
.music-report .stat-value {color:var(--nr-accent)!important;}
.music-report .tp-preview canvas {border-radius:6px!important;border:1px solid var(--nr-border)!important;}
.music-report .tp-choices {gap:5px;}
@media(max-width:600px){.music-report{padding:14px 12px!important}.music-report .hero{gap:9px}.music-report .periods button,.music-report .tabs button{font-size:10px;padding:7px 8px}}


/* V3.6 — controles unificados, consistentes com a Central V1.7 */
.music-report {--nr-bg:#191d23;--nr-panel:#22272e;--nr-border:#39424d;--nr-accent:#8ca9c7;--nr-muted:#a6b0bd;}
.music-report .hero-actions button,.music-report .periods button,.music-report .tabs button,.music-report .tp-choices button,.music-report .tp-actions button,.music-report .nr-custom-range button {
  appearance:none;min-height:32px;padding:7px 11px!important;border:1px solid var(--nr-border)!important;
  border-radius:6px!important;background:var(--nr-panel)!important;color:#c7d1dc!important;
  font-family:inherit;font-size:11.5px!important;font-weight:600!important;line-height:1.35;
  letter-spacing:0;box-shadow:none!important;transition:background .15s,border-color .15s,color .15s;
}
.music-report .hero-actions button:hover,.music-report .periods button:hover,.music-report .tabs button:hover,.music-report .tp-choices button:hover,.music-report .tp-actions button:hover {background:#2a313b!important;border-color:#60768d!important;color:#edf3f8!important;}
.music-report .periods button.active,.music-report .tabs button.active,.music-report .tp-choices button.active,.music-report .nr-apply {background:var(--nr-accent)!important;color:#191d23!important;border-color:var(--nr-accent)!important;}
.music-report .hero-actions .export-button {background:var(--nr-accent)!important;color:#191d23!important;border-color:var(--nr-accent)!important;}
.music-report .hero-actions {gap:6px;justify-content:flex-end;}
.music-report .periods {margin:12px 0 7px!important;gap:6px!important;}
.music-report .tabs {margin:8px 0 15px!important;gap:6px!important;}
.music-report .nr-custom-range {display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:7px 0 11px;}
.music-report .nr-custom-range input {min-width:0;max-width:170px;flex:1 1 130px;padding:6px 9px;background:var(--nr-panel);color:#e5e7eb;border:1px solid var(--nr-border);border-radius:6px;font-size:12px;color-scheme:dark;}
.music-report .bar-row {grid-template-columns:minmax(95px,145px) minmax(0,1fr) 52px;}
@media(max-width:600px){.music-report .hero-actions{justify-content:flex-start}.music-report .hero-actions button{flex:1 1 125px}.music-report .periods button,.music-report .tabs button{font-size:11px!important;padding:7px 9px!important}.music-report .bar-row{grid-template-columns:95px minmax(0,1fr) 48px}}

.music-report .nr-album-details,.music-report .nr-missing{margin-top:9px;color:var(--nr-muted);font-size:11px;line-height:1.7;}
.music-report .nr-album-details summary,.music-report .nr-missing summary{cursor:pointer;color:var(--nr-accent);}
/* Janela de exportação: inserida no body, independente do layout da nota. */
.nr-export-overlay { position:fixed; inset:0; z-index:99999; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(7,10,14,.84); backdrop-filter:blur(6px); overflow-y:auto; }
.nr-export-dialog { width:min(100%,460px); background:#22272e; color:#e7ecf2; border:1px solid #455160; border-radius:12px; padding:23px; box-shadow:0 18px 65px rgba(0,0,0,.42); font-family:var(--font-interface); }
.nr-export-eyebrow { font-size:10px; letter-spacing:1.7px; font-weight:800; color:#8ca9c7; margin-bottom:12px; }
.nr-export-dialog h2 { margin:0; font-size:21px; font-weight:800; letter-spacing:-.025em; }
.nr-export-dialog p { margin:9px 0 20px; font-size:13px; color:#abb8c6; line-height:1.5; }
.nr-export-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
.nr-export-actions button { min-width:0; min-height:44px; padding:10px; font-size:12px; font-weight:750; border-radius:7px; cursor:pointer; white-space:normal; }
.nr-export-primary { background:#8ca9c7!important; color:#191d23!important; border:1px solid #8ca9c7!important; }
.nr-export-secondary { background:#191d23!important; color:#dbe4ef!important; border:1px solid #455160!important; }
.nr-export-actions button:disabled { opacity:.55; }
.nr-export-status { min-height:38px; margin-top:15px; padding:11px 12px; background:#191d23; border:1px solid #39424d; border-radius:6px; font-size:12px; color:#b5c2cf; line-height:1.45; overflow-wrap:anywhere; }
.nr-export-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:15px; padding-top:13px; border-top:1px solid #39424d; }
.nr-export-footer span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#8795a5; font-size:11px; }
.nr-export-footer button { flex-shrink:0; background:transparent; border:1px solid #455160; color:#c9d4e0; border-radius:6px; padding:7px 12px; cursor:pointer; }
.music-report .nr-export-copy { background:var(--nr-panel)!important; color:#dce6f0!important; border-color:var(--nr-border)!important; }
.music-report .nr-export-copy:hover { border-color:var(--nr-accent)!important; }
.music-report .tp-actions,.music-report .hero-actions { display:flex; align-items:center; flex-wrap:wrap; gap:7px; }
@media(max-width:460px) { .nr-export-dialog { padding:18px; } .nr-export-actions { grid-template-columns:1fr; } .music-report .hero-actions { width:100%; } .music-report .hero-actions button { flex:1 1 auto; } }

/* NTN VISUAL — START */
.music-report.ntn-visual-beta {
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
.music-report.ntn-visual-beta, .music-report.ntn-visual-beta * {box-sizing:border-box;}
.music-report.ntn-visual-beta > * {min-width:0;}
.music-report.ntn-visual-beta button {min-height:var(--ntn-ui-control)!important; max-width:100%; height:auto; white-space:normal!important; overflow-wrap:anywhere;
 font-family:inherit; font-size:12px!important; font-weight:600; line-height:1.35; padding:8px 12px!important;
 border-radius:6px!important; border:1px solid var(--ntn-ui-border)!important;
 background:var(--ntn-ui-surface)!important; color:var(--ntn-ui-text)!important; box-shadow:none!important;
 touch-action:manipulation;}
.music-report.ntn-visual-beta button:hover:not(:disabled) {border-color:var(--ntn-ui-accent)!important;}
.music-report.ntn-visual-beta .export-button,.music-report.ntn-visual-beta .nr-apply, .music-report.ntn-visual-beta button.active, .music-report.ntn-visual-beta button.is-active {background:var(--ntn-ui-selected)!important; border-color:var(--ntn-ui-accent)!important; color:var(--ntn-ui-text)!important;}
.music-report.ntn-visual-beta button:disabled {opacity:.5; cursor:default;}
.music-report.ntn-visual-beta :is(button,input,select,textarea,a,summary):focus-visible {outline:2px solid var(--ntn-ui-accent); outline-offset:3px;}
.music-report.ntn-visual-beta :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea) {
 min-height:var(--ntn-ui-control); min-width:0; max-width:100%; padding:8px 10px; border-radius:6px!important;
 background:var(--ntn-ui-bg)!important; color:var(--ntn-ui-text)!important; border:1px solid var(--ntn-ui-border)!important; font-family:inherit; font-size:12px;}
.music-report.ntn-visual-beta :is(input[type=checkbox],input[type=radio],input[type=range]) {accent-color:var(--ntn-ui-accent);}
.music-report.ntn-visual-beta .panel,.music-report.ntn-visual-beta .stat,.music-report.ntn-visual-beta .card {border-radius:var(--ntn-ui-radius)!important; border-color:var(--ntn-ui-border)!important;}
.music-report.ntn-visual-beta h1 {font-size:clamp(25px,3.5vw,34px); line-height:1.18; letter-spacing:-.035em; font-weight:750; overflow-wrap:anywhere;}
.music-report.ntn-visual-beta :is(h2,h3) {line-height:1.3; overflow-wrap:anywhere;}
.music-report.ntn-visual-beta :is(summary,label) {overflow-wrap:anywhere;}
.music-report.ntn-visual-beta summary {min-height:32px; cursor:pointer;}
.music-report.ntn-visual-beta :is(table,pre) {max-width:100%;}
.music-report.ntn-visual-beta pre {white-space:pre-wrap; overflow-wrap:anywhere;}
.music-report.ntn-visual-beta :is(.stat-value,.mm-stat-value,.music-diary-stat-value) {font-variant-numeric:tabular-nums;}
@media (max-width:650px) {
 .music-report.ntn-visual-beta {padding:16px 12px 24px!important;}
 .music-report.ntn-visual-beta button {min-height:44px!important;}
 .music-report.ntn-visual-beta :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select) {min-height:42px;}
}
@media (prefers-reduced-motion:reduce) {
 .music-report.ntn-visual-beta *, .music-report.ntn-visual-beta *::before, .music-report.ntn-visual-beta *::after {animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; scroll-behavior:auto!important;}
}
.music-report.ntn-visual-beta {background:var(--ntn-ui-bg)!important;color:var(--ntn-ui-text)!important;padding:24px!important;border:1px solid var(--ntn-ui-border);border-radius:10px}.music-report.ntn-visual-beta .panel {padding:20px}.music-report.ntn-visual-beta .stat {border-radius:8px}.music-report.ntn-visual-beta .stat-value {color:var(--ntn-ui-accent)}.music-report.ntn-visual-beta .subtitle,.music-report.ntn-visual-beta .section-subtitle,.music-report.ntn-visual-beta .stat-label {color:var(--ntn-ui-muted)}.music-report.ntn-visual-beta .section-title {font-size:17px}.music-report.ntn-visual-beta .tabs,.music-report.ntn-visual-beta .periods {gap:8px}.music-report.ntn-visual-beta .tp-preview {max-width:100%;overflow:auto}
@media(max-width:650px) { .music-report.ntn-visual-beta :is(.mc-grid,.mm-diagnostics) {grid-template-columns:repeat(2,minmax(0,1fr));} .music-report.ntn-visual-beta .mc-shell {padding:16px 12px;} }
@media(max-width:420px) { .music-report.ntn-visual-beta :is(.mc-grid,.mm-diagnostics) {grid-template-columns:1fr;} }
/* NTN VISUAL — END */
`;

// ============================================================
// COMPONENTES
// ============================================================

function addStyles(root) {
  const style = root.createEl("style");
  style.textContent = CSS;
}

function panel(root, title, subtitle) {
  const box = root.createDiv({ cls: "panel" });

  if (title) box.createDiv({ cls: "section-title", text: title });
  if (subtitle) box.createDiv({ cls: "section-subtitle", text: subtitle });

  return box;
}

function addImage(root, url, cls) {
  const valid = validImage(url);

  if (!valid) return null;

  const img = root.createEl("img", { cls });

  img.src = valid;
  img.loading = "lazy";
  img.onerror = () => {
    img.remove();
  };

  return img;
}

function stat(root, value, label) {
  const box = root.createDiv({ cls: "stat" });

  box.createDiv({ cls: "stat-value", text: String(value) });
  box.createDiv({ cls: "stat-label", text: label });
}

function badge(root, text) {
  root.createSpan({ cls: "badge", text: String(text) });
}

// ============================================================
// VISÃO GERAL
// ============================================================

function renderOverview(root, data) {
  const stats = root.createDiv({ cls: "stats" });

  stat(stats, data.scrobbles.length, "Scrobbles");
  stat(stats, data.artists.length, "Artistas");
  stat(stats, data.tracks.length, "Faixas");
  stat(stats, data.releases.length, "Lançamentos");

  const summary = panel(root, "Resumo da escuta", "Principais números do período");

  const list = summary.createDiv({ cls: "artist-list" });

  const items = [
    ["Artista mais ouvido", data.artists[0]?.[0] || "—"],
    ["Faixa mais ouvida", data.tracks[0] ? `${data.tracks[0].artist} — ${data.tracks[0].name}` : "—"],
    ["Álbum mais ouvido", data.albums[0] ? `${data.albums[0].artist} — ${data.albums[0].album}` : "—"],
    ["Tempo estimado", formatDuration(data.listening.estimated)]
  ];

  for (const [label, value] of items) {
    const row = list.createDiv({ cls: "row" });
    const info = row.createDiv({ cls: "row-info" });

    info.createDiv({ cls: "row-subtitle", text: label });
    info.createDiv({ cls: "row-title", text: value });
  }

  renderEvolution(root, data);
}

// ============================================================
// EVOLUÇÃO
// ============================================================

function renderEvolution(root, data) {
  const box = panel(root, "Evolução da escuta", "Scrobbles ao longo do período");

  if (!data.evolution.length) {
    box.createDiv({ cls: "empty", text: "Sem dados." });
    return;
  }

  const max = Math.max(...data.evolution.map(x => x[1]));

  const bars = box.createDiv({ cls: "bars" });

  for (const [label, value] of data.evolution) {
    const row = bars.createDiv({ cls: "bar-row" });

    row.createDiv({ cls: "bar-name", text: label });

    const bg = row.createDiv({ cls: "bar-bg" });
    const fill = bg.createDiv({ cls: "bar-fill" });

    fill.style.width = `${(value / max) * 100}%`;

    row.createDiv({ cls: "bar-value", text: Number(value).toLocaleString("pt-BR") });
  }
}

// ============================================================
// ARTISTAS
// ============================================================

function renderArtists(root, data) {
  const box = panel(root, "Artistas mais ouvidos", "Principais artistas do período");

  const list = box.createDiv({ cls: "artist-list" });

  for (let i = 0; i < Math.min(data.artists.length, 30); i++) {
    const [artist, count] = data.artists[i];

    const row = list.createDiv({ cls: "row" });

    const image = data.artistImages[artistKey(artist)];

    addImage(row, image, "artist-cover");

    const info = row.createDiv({ cls: "row-info" });

    info.createDiv({ cls: "row-title", text: artist });
    info.createDiv({ cls: "row-subtitle", text: `${count} scrobbles` });

    row.createDiv({ cls: "row-count", text: `#${i + 1}` });
  }
}

// ============================================================
// MÚSICAS
// ============================================================

function renderTracks(root, data) {
  const box = panel(root, "Faixas mais ouvidas", "Capas em alta resolução quando fornecidas pelo Last.fm");

  const list = box.createDiv({ cls: "track-list" });

  for (const track of data.tracks.slice(0, 30)) {
    const row = list.createDiv({ cls: "row" });

    addImage(row, track.image, "row-cover");

    const info = row.createDiv({ cls: "row-info" });

    info.createDiv({ cls: "row-title", text: track.name });
    info.createDiv({ cls: "row-subtitle", text: track.artist });

    row.createDiv({ cls: "row-count", text: String(track.count) });
  }
}

// ============================================================
// ÁLBUNS
// ============================================================

function renderAlbums(root, data) {
  const box = panel(root, "Álbuns e lançamentos", "Principais lançamentos ouvidos");

  const grid = box.createDiv({ cls: "grid" });

  const releases = [...data.releases]
    .sort((a, b) => b.scrobbles - a.scrobbles)
    .filter(x => x.album && x.type !== "single")
    .slice(0, 24);

  for (const release of releases) {
    const card = grid.createDiv({ cls: "card" });

    addImage(card, release.image, "cover");

    const body = card.createDiv({ cls: "card-body" });

    body.createDiv({ cls: "card-title", text: release.album });
    body.createDiv({ cls: "card-subtitle", text: release.artist });

    const meta = body.createDiv({ cls: "card-meta" });

    badge(meta, `${release.scrobbles} plays`);
    badge(meta, `${release.distinctTracks} faixas`);
    badge(meta, release.interaction === "complete" ? "Sessão completa" : release.interaction);
    const details=body.createEl("details",{cls:"nr-album-details"});
    details.createEl("summary",{text:"Detalhes da escuta"});
    const best=release.bestSession;
    const distinctInSession=best ? new Set(best.tracks.map(t=>trackKey(t.artist,t.name))).size : 0;
    details.createDiv({text:`Sessões: ${release.sessions.length} · Maior sessão: ${distinctInSession} faixas distintas`});
    details.createDiv({text:release.officialTrackCount ? `Cobertura da maior sessão: ${Math.round(100*distinctInSession/release.officialTrackCount)}%` : "Cobertura oficial: metadados indisponíveis"});
  }
}

// ============================================================
// ACERVO
// ============================================================

function renderCatalog(root, data) {
  const box = panel(root, "Relação com o acervo", "Como sua escuta se relaciona com Musicas/");

  const stats = box.createDiv({ cls: "stats" });

  stat(stats, data.catalog.total, "Álbuns no acervo");
  stat(stats, data.catalog.heard, "Ouvidos");
  stat(stats, data.catalog.new, "Fora do acervo");
  stat(stats, data.catalog.rate, "Correspondência no período");

  const playedCatalog = new Set(data.releases.filter(x=>x.inCatalog).map(x=>x.key)).size;
  const totalScrobbles=data.releases.reduce((n,x)=>n+x.scrobbles,0);
  const catalogScrobbles=data.releases.filter(x=>x.inCatalog).reduce((n,x)=>n+x.scrobbles,0);
  const summary=box.createDiv({cls:"section-subtitle",text:`Escutas em lançamentos catalogados: ${totalScrobbles?pct(catalogScrobbles/totalScrobbles):"0%"}. Lançamentos do acervo ouvidos: ${data.catalog.total?pct(playedCatalog/data.catalog.total):"0%"}.`});
  const missing=data.releases.filter(x=>!x.inCatalog).sort((a,b)=>b.scrobbles-a.scrobbles).slice(0,12);
  if(missing.length){const section=box.createEl("details",{cls:"nr-missing"});section.createEl("summary",{text:`Não catalogados (${data.releases.filter(x=>!x.inCatalog).length})`});for(const r of missing){section.createDiv({text:`${r.album} — ${r.artist} · ${r.scrobbles} scrobbles`});}}
  const list = box.createDiv({ cls: "artist-list" });

  const groups = [
    ["Álbum completo", "complete"],
    ["Sessão de álbum", "session"],
    ["Exploração", "exploration"],
    ["Contato", "contact"],
    ["Faixa isolada", "isolated"]
  ];

  for (const [label, key] of groups) {
    const count = data.releases.filter(x => x.interaction === key).length;

    const row = list.createDiv({ cls: "row" });

    row.createDiv({ cls: "row-info", text: label });
    row.createDiv({ cls: "row-count", text: String(count) });
  }
}

// ============================================================
// GÊNEROS
// ============================================================

function renderGenres(root, data) {
  const box = panel(root, "Gêneros", "Participação percentual estimada das tags; um artista pode pertencer a vários gêneros");

  if (!data.genres.length) {
    box.createDiv({ cls: "empty", text: "Os gêneros ainda não foram carregados." });
    return;
  }

  const max = data.genres[0][1];
  const total = data.genres.reduce((sum, item) => sum + item[1], 0);

  const bars = box.createDiv({ cls: "bars" });

  for (const [genre, value] of data.genres) {
    const row = bars.createDiv({ cls: "bar-row" });

    row.createDiv({ cls: "bar-name", text: genre });

    const bg = row.createDiv({ cls: "bar-bg" });
    const fill = bg.createDiv({ cls: "bar-fill" });

    fill.style.width = `${(value / max) * 100}%`;

    row.createDiv({ cls: "bar-value", text: total > 0 ? `${(100 * value / total).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%" });
  }
}

// ============================================================
// INSIGHTS
// ============================================================

function renderInsights(root, data) {
  const box = panel(root,"Insights","Padrões de escuta do período selecionado");
  const plays = data.scrobbles.length;
  const uniqueTracks = new Set(data.scrobbles.map(t=>trackKey(t.artist,t.name))).size;
  const topFive = data.artists.slice(0,5).reduce((sum,[,n])=>sum+n,0);
  const stats = box.createDiv({cls:"stats"});
  stat(stats, plays ? pct(uniqueTracks/plays) : "0%","Diversidade de faixas");
  stat(stats, plays ? pct(topFive/plays) : "0%","Concentração Top 5");
  stat(stats, uniqueTracks,"Faixas diferentes");
  stat(stats, data.releases.filter(x=>x.interaction==="complete").length,"Sessões completas identificadas");
  const hours = new Array(24).fill(0), days = new Array(7).fill(0);
  for (const t of data.scrobbles) {const d=new Date(t.uts*1000);hours[d.getHours()]++;days[(d.getDay()+6)%7]++;}
  const dayNames=["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
  const maxDay=Math.max(...days),maxHour=Math.max(...hours);
  const list=box.createDiv({cls:"artist-list"});
  const items=[
    ["Dia com mais escutas",maxDay ? `${dayNames[days.indexOf(maxDay)]} · ${maxDay}` : "—"],
    ["Horário de maior atividade",maxHour ? `${String(hours.indexOf(maxHour)).padStart(2,"0")}:00 · ${maxHour}` : "—"],
    ["Faixa mais recorrente",data.tracks[0] ? `${data.tracks[0].name} · ${data.tracks[0].count} plays` : "—"],
    ["Tempo estimado",formatDuration(data.listening.estimated)]
  ];
  for(const [label,value] of items){const row=list.createDiv({cls:"row"});row.createDiv({cls:"row-info",text:label});row.createDiv({cls:"row-count",text:String(value)});}
  box.createDiv({cls:"section-subtitle",text:"Diversidade = faixas distintas ÷ scrobbles. Os horários seguem o fuso local do dispositivo."});
}

// ============================================================
// TABS
// ============================================================

function renderTab(root, data) {
  root.empty();

  if (state.tab === "overview") renderOverview(root, data);
  else if (state.tab === "artists") renderArtists(root, data);
  else if (state.tab === "tracks") renderTracks(root, data);
  else if (state.tab === "albums") renderAlbums(root, data);
  else if (state.tab === "topster") renderTopster(root, data);
  else if (state.tab === "catalog") renderCatalog(root, data);
  else if (state.tab === "genres") renderGenres(root, data);
  else renderInsights(root, data);
}

// ============================================================
// EXPORTAÇÃO — IMAGENS
// ============================================================

async function fetchImageForCanvas(url) {
  const valid = validImage(url);

  if (!valid) return null;

  try {
    const response = await window.requestUrl({ url: valid, method: "GET" });

    let blob = null;

    if (response.arrayBuffer) {
      blob = new Blob([response.arrayBuffer], {
        type: response.headers?.["content-type"] || ""
      });
    } else if (response.text) {
      const text = response.text;

      if (text.startsWith("data:image")) {
        const image = new Image();

        image.src = text;

        await new Promise(resolve => (image.onload = resolve));

        return image;
      }

      return null;
    }

    if (!blob) return null;

    const objectURL = URL.createObjectURL(blob);

    try {
      const image = new Image();

      image.src = objectURL;

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      return image;
    } finally {
      URL.revokeObjectURL(objectURL);
    }
  } catch (error) {
    console.warn("Exportação — imagem:", valid, error);
    return null;
  }
}

// Cache de imagens já carregadas (Wrapped e Topster compartilham).
const imageCache = new Map();

function loadImage(url) {
  const valid = validImage(url);

  if (!valid) return Promise.resolve(null);

  if (!imageCache.has(valid)) {
    const promise = fetchImageForCanvas(valid).catch(error => { imageCache.delete(valid); throw error; });
    imageCache.set(valid, promise);
  }

  return imageCache.get(valid);
}

// Estatística 16x16 da imagem: cor média e desvio de luminosidade.
function imageStats(img) {
  if (!img) return null;
  if (img.__stats !== undefined) return img.__stats;

  let stats = null;

  try {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;

    const x = c.getContext("2d", { willReadFrequently: true });

    x.drawImage(img, 0, 0, 16, 16);

    const d = x.getImageData(0, 0, 16, 16).data;
    const n = d.length / 4;

    let r = 0, g = 0, b = 0, lum = 0;

    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }

    r /= n; g /= n; b /= n; lum /= n;

    let variance = 0;

    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      variance += (l - lum) * (l - lum);
    }

    stats = { r, g, b, lum, stdev: Math.sqrt(variance / n) };
  } catch (_) {}

  try { img.__stats = stats; } catch (_) {}

  return stats;
}

// Imagem praticamente de uma cor só (ex.: foto de artista toda preta).
function isBlankImage(img) {
  const s = imageStats(img);

  return !!s && s.stdev < 6;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;

  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));

    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return [h, s, l];
}

// Matiz de destaque a partir da capa principal (padrão: laranja quente).
function themeFromImage(img) {
  let hue = 24;

  const s = img && !isBlankImage(img) ? imageStats(img) : null;

  if (s) {
    const [h, sat] = rgbToHsl(s.r, s.g, s.b);
    if (sat > 0.12) hue = h;
  }

  return {
    hue,
    accent: `hsl(${hue}, 78%, 66%)`,
    accentSoft: `hsla(${hue}, 78%, 66%, 0.55)`
  };
}

// Capa do álbum: Deezer em alta resolução (se ligado) ou imagem do Last.fm.
async function albumCoverImage(artist, album, fallbackUrl, hq = true) {
  if (hq && album) {
    const url = await deezerAlbumCover(artist, album);

    if (url) {
      const img = await loadImage(url);
      if (img) return img;
    }
  }

  return loadImage(fallbackUrl);
}

function bestAlbumOf(data, artist) {
  const key = artistKey(artist);

  return (
    data.releases
      .filter(r => r.album && artistKey(r.artist) === key)
      .sort((a, b) => b.scrobbles - a.scrobbles)[0] || null
  );
}

// Foto do artista; se vier em branco/preta, usa a capa do álbum mais ouvido dele.
async function artistPhotoImage(artist, data) {
  const img = await loadImage(data.artistImages?.[artistKey(artist)]);

  if (img && !isBlankImage(img)) return img;

  const release = bestAlbumOf(data, artist);

  if (release) {
    const cover = await albumCoverImage(release.artist, release.album, release.image, false);
    if (cover) return cover;
  }

  return null;
}

async function runLimited(items, limit, worker) {
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const k = next++;

        if (k >= items.length) return;

        try {
          await worker(items[k], k);
        } catch (error) {
          console.warn(error);
        }
      }
    })
  );
}

// ============================================================
// EXPORTAÇÃO — PRIMITIVAS DE CANVAS
// ============================================================

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;

const PAL = {
  bg: "#111113",
  card: "#1b1b1e",
  line: "rgba(255,255,255,0.10)",
  text: "#ffffff",
  muted: "#9b9ba3",
  faint: "#6d6d75"
};

function setFont(ctx, size, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function setSpacing(ctx, px) {
  try { ctx.letterSpacing = `${px}px`; } catch (_) {}
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let lo = 0;
  let hi = text.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);

    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }

  return text.slice(0, lo).trimEnd() + "…";
}

function drawText(ctx, text, x, y, o = {}) {
  const {
    size = 16,
    weight = 400,
    color = PAL.text,
    align = "left",
    spacing = 0,
    maxWidth = 0
  } = o;

  setFont(ctx, size, weight);
  setSpacing(ctx, spacing);

  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  let value = String(text ?? "");

  if (maxWidth) value = ellipsize(ctx, value, maxWidth);

  ctx.fillText(value, x, y);

  setSpacing(ctx, 0);
}

// A fonte precisa estar definida (setFont) antes de chamar.
function wrapLines(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];

  let current = "";

  for (let i = 0; i < words.length; i++) {
    const test = current ? `${current} ${words[i]}` : words[i];

    if (!current || ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (lines.length === maxLines - 1) {
        current = [current, ...words.slice(i)].join(" ");
        break;
      }

      lines.push(current);
      current = words[i];
    }
  }

  if (current) lines.push(current);

  return lines
    .slice(0, maxLines)
    .map(line => (ctx.measureText(line).width > maxWidth ? ellipsize(ctx, line, maxWidth) : line));
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawImageCover(ctx, image, x, y, width, height, radius = 0) {
  if (!image) return;

  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;

  if (!iw || !ih) return;

  const scale = Math.max(width / iw, height / ih);

  const sw = width / scale;
  const sh = height / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;

  ctx.save();

  if (radius > 0) {
    roundedRect(ctx, x, y, width, height, radius);
    ctx.clip();
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);

  ctx.restore();
}

function hueFrom(text) {
  let h = 0;

  for (const c of String(text || "")) h = (h * 31 + c.charCodeAt(0)) % 360;

  return h;
}

function initials(text) {
  const words = String(text || "").replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);

  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

// Quadro de reserva quando não existe imagem.
function drawPlaceholder(ctx, x, y, w, h, radius, label) {
  const hue = hueFrom(label);

  const g = ctx.createLinearGradient(x, y, x + w, y + h);

  g.addColorStop(0, `hsl(${hue}, 32%, 30%)`);
  g.addColorStop(1, `hsl(${hue}, 32%, 16%)`);

  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = g;
  ctx.fill();

  const size = Math.max(12, Math.min(w, h) * 0.34);

  drawText(ctx, initials(label), x + w / 2, y + h / 2 + size * 0.35, {
    size,
    weight: 800,
    color: "rgba(255,255,255,0.75)",
    align: "center"
  });
}

// Imagem ou quadro de reserva; radius >= w/2 gera círculo.
function drawPicture(ctx, img, x, y, w, h, radius, label) {
  if (img) drawImageCover(ctx, img, x, y, w, h, radius);
  else drawPlaceholder(ctx, x, y, w, h, radius, label);
}

function drawCard(ctx, x, y, w, h, radius = 20, fill = PAL.card, stroke = PAL.line) {
  roundedRect(ctx, x, y, w, h, radius);

  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function paintBackground(ctx, W, H, theme, base = PAL.bg) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(W, 900) * 0.95);

  glow.addColorStop(0, `hsla(${theme.hue}, 55%, 24%, 0.85)`);
  glow.addColorStop(1, `hsla(${theme.hue}, 55%, 12%, 0)`);

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

// ============================================================
// EXPORTAÇÃO — DOWNLOAD
// ============================================================

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function isMobileReport() {
  return Boolean(app?.isMobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));
}

function exportCanvasScale(W, H, preferred = 1) {
  const mobile = isMobileReport();
  const maxPixels = mobile ? CFG.mobileExportMaxPixels : CFG.exportMaxPixels;
  const maxSide = mobile ? CFG.mobileExportMaxSide : 8192;
  return Math.min(preferred, Math.sqrt(maxPixels / Math.max(1, W * H)),
    maxSide / Math.max(1, W), maxSide / Math.max(1, H));
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    try {
      if (!canvas.width || !canvas.height) throw new Error("Canvas vazio");
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Falha ao codificar PNG")), "image/png");
      } else {
        const data = canvas.toDataURL("image/png");
        const bin = atob(data.split(",")[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: "image/png" }));
      }
    } catch (error) { reject(error); }
  });
}

// V3.5.1 estável — mantém os dois métodos que funcionaram no Android.
// A cópia também pode ser usada no computador sem modificar o download.
async function copyExportImage(blob) {
  if (typeof navigator.clipboard?.write !== "function" || typeof globalThis.ClipboardItem !== "function")
    throw new Error("Este ambiente não disponibiliza a cópia de imagens.");
  // Importante: iniciar a escrita diretamente no clique, sem awaits anteriores.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function showMobileShareDialog(blob, filename) {
  const overlay = document.createElement("div");
  overlay.className = "nr-export-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Exportar imagem");
  const dialog = document.createElement("div");
  dialog.className = "nr-export-dialog";
  const eyebrow = document.createElement("div");
  eyebrow.className = "nr-export-eyebrow";
  eyebrow.textContent = "NOTE TO NOTE  /  EXPORTAÇÃO";
  const title = document.createElement("h2");
  title.textContent = "Imagem pronta";
  const hint = document.createElement("p");
  hint.textContent = "Escolha como usar seu PNG. A cópia não cria arquivos no cofre.";
  const actions = document.createElement("div");
  actions.className = "nr-export-actions";
  const status = document.createElement("div");
  status.className = "nr-export-status";
  status.setAttribute("role", "status");
  status.textContent = "A imagem está pronta para exportação.";
  const close = () => overlay.remove();
  const mk = (label, primary, handler) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.className = primary ? "nr-export-primary" : "nr-export-secondary";
    button.addEventListener("click", handler);
    actions.appendChild(button);
    return button;
  };
  const copy = mk("Copiar imagem", true, async () => {
    copy.disabled = true;
    try {
      await copyExportImage(blob);
      status.textContent = "Imagem copiada! Cole em um aplicativo que aceite imagens.";
      new Notice("PNG copiado para a área de transferência", 2500);
    } catch (error) {
      status.textContent = `Não foi possível copiar: ${error?.message || String(error)}`;
      console.error("Relatório Musical — cópia:", error);
    } finally { copy.disabled = false; }
  });
  const external = mk("Abrir em outro app", false, async () => {
    external.disabled = true;
    let created = null;
    try {
      if (typeof app?.openWithDefaultApp !== "function") throw new Error("Abertura externa indisponível.");
      if (typeof app?.vault?.createBinary !== "function") throw new Error("Gravação de PNG indisponível.");
      // Método já validado no Android: não alterar o caminho nem a abertura.
      const dir = "Musicas/Exportacoes/Temporarios";
      if (!app.vault.getAbstractFileByPath("Musicas/Exportacoes")) await app.vault.createFolder("Musicas/Exportacoes");
      if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
      const clean = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${dir}/${Date.now()}-${clean}`;
      created = await app.vault.createBinary(path, await blob.arrayBuffer());
      await app.openWithDefaultApp(created.path);
      status.textContent = "Imagem aberta no aplicativo externo. Use a opção de compartilhar ou salvar dele. Uma cópia permanece em Musicas/Exportacoes/Temporarios.";
    } catch (error) {
      status.textContent = `Não foi possível abrir: ${error?.message || String(error)}` + (created ? ` Arquivo mantido: ${created.path}` : "");
      console.error("Relatório Musical — abertura externa:", error);
    } finally { external.disabled = false; }
  });
  const footer = document.createElement("div");
  footer.className = "nr-export-footer";
  const filenameLabel = document.createElement("span");
  filenameLabel.textContent = filename;
  const closeButton = document.createElement("button");
  closeButton.textContent = "Fechar";
  closeButton.addEventListener("click", close);
  footer.append(filenameLabel, closeButton);
  dialog.append(eyebrow, title, hint, actions, status, footer);
  overlay.appendChild(dialog);
  overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
  document.body.appendChild(overlay);
}
async function saveExportBlob(blob, filename) {
  if(!isMobileReport()) {downloadBlob(blob,filename);return {method:"download",path:filename};}
  showMobileShareDialog(blob,filename);
  return {method:"dialog",path:null};
}

function fmtShort(ts) {
  return new Date(ts * 1000)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(".", "");
}

function rangeText(bounds) {
  const a = new Date(bounds.from * 1000);
  const b = new Date(bounds.to * 1000);

  if (a.getFullYear() === b.getFullYear()) {
    return `${fmtShort(bounds.from)} – ${fmtShort(bounds.to)} de ${b.getFullYear()}`;
  }

  return `${fmtShort(bounds.from)} ${a.getFullYear()} – ${fmtShort(bounds.to)} ${b.getFullYear()}`;
}

function fileSlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9áéíóúãõç-]/gi, "");
}

// ============================================================
// EXPORTAÇÃO — WRAPPED: DADOS
// ============================================================

// Carrega o que o relatório normalmente busca em segundo plano.
async function ensureExportData(data) {
  if (!Object.keys(data.artistImages || {}).length) {
    try { data.artistImages = await loadArtistImages(data.artists); } catch (_) {}
  }

  if (!(data.genres || []).length) {
    try { data.genres = await loadGenres(data.artists); } catch (_) {}
  }
}

function buildWrappedModel(data) {
  const bounds = periodBounds(state.period);
  const total = data.scrobbles.length;

  const days = new Map();

  for (const s of data.scrobbles) {
    const d = new Date(s.uts * 1000);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const e = days.get(k) || { count: 0, ts: s.uts };

    e.count++;
    days.set(k, e);
  }

  let peak = null;

  for (const e of days.values()) if (!peak || e.count > peak.count) peak = e;

  const daysInPeriod = Math.max(1, Math.ceil((bounds.to - bounds.from) / 86400));

  const albums = [...data.releases]
    .filter(r => r.album && r.type !== "single")
    .sort((a, b) => b.scrobbles - a.scrobbles);

  const countOf = key => data.releases.filter(r => r.interaction === key).length;

  const genres = (data.genres || []).slice(0, 6);

  return {
    bounds,
    range: rangeText(bounds),
    total,
    artistsCount: data.artists.length,
    tracksCount: data.tracks.length,
    releasesCount: data.releases.length,
    listening: data.listening.estimated,
    activeDays: days.size,
    daysInPeriod,
    avgPerDay: total / daysInPeriod,
    peak,
    hero: albums[0] || null,
    albums: albums.slice(1, 1 + CFG.exportAlbumLimit),
    artists: data.artists.slice(0, CFG.exportArtistLimit),
    tracks: data.tracks.slice(0, CFG.exportTrackLimit),
    genres,
    genresTotal: genres.reduce((s, g) => s + g[1], 0),
    evolution: data.evolution,
    complete: countOf("complete"),
    session: countOf("session"),
    exploration: countOf("exploration"),
    heard: data.catalog.heard,
    rate: data.catalog.rate
  };
}

async function loadWrappedAssets(m, data) {
  const assets = {
    heroCover: null,
    albumCovers: [],
    artistPhotos: [],
    trackCovers: []
  };

  const jobs = [];

  if (m.hero) {
    jobs.push(async () => {
      assets.heroCover = await albumCoverImage(m.hero.artist, m.hero.album, m.hero.image, true);
    });
  }

  m.albums.forEach((r, i) => {
    jobs.push(async () => {
      assets.albumCovers[i] = await albumCoverImage(r.artist, r.album, r.image, true);
    });
  });

  m.artists.forEach(([artist], i) => {
    jobs.push(async () => {
      assets.artistPhotos[i] = await artistPhotoImage(artist, data);
    });
  });

  m.tracks.forEach((t, i) => {
    jobs.push(async () => {
      assets.trackCovers[i] = await loadImage(t.image);
    });
  });

  await runLimited(jobs, 4, job => job());

  return assets;
}

// ============================================================
// EXPORTAÇÃO — WRAPPED: DESENHO
// ============================================================

function drawLabel(ctx, text, x, y, theme) {
  drawText(ctx, text, x, y + 14, { size: 14, weight: 800, color: PAL.muted, spacing: 2.5 });

  ctx.fillStyle = theme.accent;
  ctx.fillRect(x, y + 24, 32, 3);
}

function drawStatCard(ctx, x, y, w, h, value, label, theme) {
  drawCard(ctx, x, y, w, h, 18);

  drawText(ctx, value, x + 24, y + 58, { size: 40, weight: 800, maxWidth: w - 48 });
  drawText(ctx, label, x + 24, y + h - 22, {
    size: 12,
    weight: 700,
    color: PAL.muted,
    spacing: 1.5,
    maxWidth: w - 48
  });
}

function buildWrappedSections(m, a, theme, W, M, CW) {
  const S = [];
  const nf = n => Number(n).toLocaleString("pt-BR");

  // ---------------------------------------------------- CABEÇALHO
  S.push({
    h: 190,
    draw(ctx, y) {
      drawText(ctx, "RELATÓRIO MUSICAL", M, y + 24, { size: 16, weight: 800, color: theme.accent, spacing: 5 });
      drawText(ctx, periodLabel(), M, y + 106, { size: 88, weight: 800, maxWidth: CW });
      drawText(ctx, `${m.range}  ·  @${CFG.lastfmUser}  ·  Last.fm`, M, y + 152, {
        size: 22,
        weight: 500,
        color: PAL.muted,
        maxWidth: CW
      });

      ctx.fillStyle = PAL.line;
      ctx.fillRect(M, y + 182, CW, 1);
    }
  });

  // ---------------------------------------------------- NÚMEROS
  S.push({
    h: 244,
    draw(ctx, y) {
      const w = (CW - 60) / 4;

      const row1 = [
        [nf(m.total), "SCROBBLES"],
        [nf(m.artistsCount), "ARTISTAS"],
        [nf(m.tracksCount), "FAIXAS"],
        [nf(m.releasesCount), "LANÇAMENTOS"]
      ];

      const row2 = [
        [formatDuration(m.listening), "TEMPO ESTIMADO"],
        [`${m.activeDays}/${m.daysInPeriod}`, "DIAS COM ESCUTA"],
        [m.avgPerDay.toFixed(1).replace(".", ","), "MÉDIA POR DIA"],
        [m.peak ? fmtShort(m.peak.ts) : "—", m.peak ? `DIA MAIS INTENSO · ${m.peak.count}` : "DIA MAIS INTENSO"]
      ];

      row1.forEach(([v, l], i) => drawStatCard(ctx, M + i * (w + 20), y, w, 112, v, l, theme));
      row2.forEach(([v, l], i) => drawStatCard(ctx, M + i * (w + 20), y + 132, w, 112, v, l, theme));
    }
  });

  // ---------------------------------------------------- DESTAQUES
  S.push({
    h: 204,
    draw(ctx, y) {
      drawLabel(ctx, "SEUS DESTAQUES", M, y, theme);

      const w = (CW - 20) / 2;
      const cy = y + 44;

      // artista #1
      const ta = m.artists[0];

      drawCard(ctx, M, cy, w, 160, 20);
      drawPicture(ctx, a.artistPhotos[0], M + 25, cy + 25, 110, 110, 55, ta ? ta[0] : "?");

      drawText(ctx, "ARTISTA #1", M + 160, cy + 54, { size: 13, weight: 800, color: PAL.muted, spacing: 2 });
      drawText(ctx, ta ? ta[0] : "—", M + 160, cy + 96, { size: 34, weight: 800, maxWidth: w - 184 });
      drawText(
        ctx,
        ta ? `${nf(ta[1])} scrobbles · ${pct(ta[1] / Math.max(1, m.total))} do total` : "—",
        M + 160,
        cy + 128,
        { size: 18, color: PAL.muted, maxWidth: w - 184 }
      );

      // faixa #1
      const tt = m.tracks[0];
      const x2 = M + w + 20;

      drawCard(ctx, x2, cy, w, 160, 20);
      drawPicture(ctx, a.trackCovers[0], x2 + 25, cy + 25, 110, 110, 14, tt ? tt.name : "?");

      drawText(ctx, "FAIXA #1", x2 + 160, cy + 54, { size: 13, weight: 800, color: PAL.muted, spacing: 2 });
      drawText(ctx, tt ? tt.name : "—", x2 + 160, cy + 96, { size: 30, weight: 800, maxWidth: w - 184 });
      drawText(ctx, tt ? tt.artist : "—", x2 + 160, cy + 128, { size: 19, color: PAL.muted, maxWidth: w - 184 });
      drawText(ctx, tt ? `${nf(tt.count)} scrobbles` : "", x2 + 160, cy + 150 - 2, {
        size: 14,
        weight: 700,
        color: theme.accent
      });
    }
  });

  // ---------------------------------------------------- ÁLBUM #1
  S.push({
    h: 384,
    draw(ctx, y) {
      drawLabel(ctx, "ÁLBUM MAIS OUVIDO", M, y, theme);

      const cy = y + 44;

      drawCard(ctx, M, cy, CW, 340, 24);

      const r = m.hero;

      if (!r) {
        drawText(ctx, "Nenhum álbum completo ouvido neste período.", M + 32, cy + 180, {
          size: 22,
          color: PAL.muted
        });
        return;
      }

      drawPicture(ctx, a.heroCover, M + 20, cy + 20, 300, 300, 16, r.album);

      const tx = M + 350;
      const tw = CW - 350 - 30;

      drawText(ctx, "ÁLBUM #1", tx, cy + 58, { size: 13, weight: 800, color: theme.accent, spacing: 2.5 });

      setFont(ctx, 46, 800);

      const lines = wrapLines(ctx, r.album, tw, 2);

      lines.forEach((line, i) => drawText(ctx, line, tx, cy + 108 + i * 52, { size: 46, weight: 800 }));

      drawText(ctx, r.artist, tx, cy + 108 + (lines.length - 1) * 52 + 44, {
        size: 26,
        color: PAL.muted,
        maxWidth: tw
      });

      const boxes = [
        [nf(r.scrobbles), "SCROBBLES"],
        [String(r.distinctTracks), "FAIXAS DIFERENTES"],
        [formatDuration(r.scrobbles * 180), "TEMPO ESTIMADO"]
      ];

      boxes.forEach(([v, l], i) => {
        const bx = tx + i * 196;
        const by = cy + 232;

        drawCard(ctx, bx, by, 180, 76, 14, PAL.bg, PAL.line);
        drawText(ctx, v, bx + 16, by + 38, { size: 28, weight: 800, maxWidth: 150 });
        drawText(ctx, l, bx + 16, by + 62, { size: 11, weight: 700, color: PAL.muted, spacing: 1.2, maxWidth: 150 });
      });

      // situação no acervo
      const label = r.inCatalog ? "NO ACERVO" : "FORA DO ACERVO";

      setFont(ctx, 13, 800);
      setSpacing(ctx, 1.5);

      const pw = ctx.measureText(label).width + 52;

      setSpacing(ctx, 0);

      const px = tx + 3 * 196 + 6;

      roundedRect(ctx, px, cy + 252, pw, 36, 18);
      ctx.fillStyle = r.inCatalog ? theme.accentSoft : "rgba(255,255,255,0.08)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px + 20, cy + 270, 5, 0, Math.PI * 2);
      ctx.fillStyle = r.inCatalog ? "#ffffff" : PAL.muted;
      ctx.fill();

      drawText(ctx, label, px + 36, cy + 275, { size: 13, weight: 800, spacing: 1.5 });
    }
  });

  // ---------------------------------------------------- TOP ARTISTAS / FAIXAS
  const rows = Math.max(m.artists.length, m.tracks.length, 1);

  S.push({
    h: 44 + rows * 86,
    draw(ctx, y) {
      const colW = (CW - 60) / 2;
      const xr = M + colW + 60;
      const maxArtist = m.artists[0] ? m.artists[0][1] : 1;

      drawLabel(ctx, "TOP ARTISTAS", M, y, theme);
      drawLabel(ctx, "TOP FAIXAS", xr, y, theme);

      m.artists.forEach(([artist, count], i) => {
        const ry = y + 44 + i * 86;

        drawText(ctx, `#${i + 1}`, M, ry + 40, { size: 16, weight: 800, color: PAL.faint });
        drawPicture(ctx, a.artistPhotos[i], M + 46, ry + 4, 64, 64, 32, artist);

        const tx = M + 128;

        drawText(ctx, artist, tx, ry + 30, { size: 22, weight: 800, maxWidth: colW - 128 });
        drawText(ctx, `${nf(count)} scrobbles`, tx, ry + 52, { size: 15, color: PAL.muted });

        ctx.fillStyle = "rgba(255,255,255,0.08)";
        roundedRect(ctx, tx, ry + 62, colW - 128, 5, 3);
        ctx.fill();

        ctx.fillStyle = i === 0 ? theme.accent : theme.accentSoft;
        roundedRect(ctx, tx, ry + 62, Math.max(8, (colW - 128) * (count / maxArtist)), 5, 3);
        ctx.fill();
      });

      m.tracks.forEach((t, i) => {
        const ry = y + 44 + i * 86;

        drawText(ctx, `#${i + 1}`, xr, ry + 40, { size: 16, weight: 800, color: PAL.faint });
        drawPicture(ctx, a.trackCovers[i], xr + 46, ry + 4, 64, 64, 10, t.name);

        const tx = xr + 128;

        drawText(ctx, t.name, tx, ry + 30, { size: 21, weight: 800, maxWidth: colW - 128 - 90 });
        drawText(ctx, t.artist, tx, ry + 54, { size: 15, color: PAL.muted, maxWidth: colW - 128 - 90 });
        drawText(ctx, `${nf(t.count)}×`, xr + colW, ry + 40, {
          size: 20,
          weight: 800,
          color: theme.accent,
          align: "right"
        });
      });
    }
  });

  // ---------------------------------------------------- ÁLBUNS EM DESTAQUE
  if (m.albums.length) {
    const n = m.albums.length;
    const s = Math.min(190, Math.floor((CW - (n - 1) * 20) / n));

    S.push({
      h: 44 + s + 104,
      draw(ctx, y) {
        drawLabel(ctx, "ÁLBUNS EM DESTAQUE", M, y, theme);

        m.albums.forEach((r, i) => {
          const x = M + i * (s + 20);
          const cy = y + 44;

          drawPicture(ctx, a.albumCovers[i], x, cy, s, s, 14, r.album);

          // selo de posição
          roundedRect(ctx, x + 10, cy + 10, 46, 28, 14);
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fill();

          drawText(ctx, `#${i + 2}`, x + 33, cy + 30, { size: 15, weight: 800, align: "center" });

          setFont(ctx, 16, 800);

          wrapLines(ctx, r.album, s, 2).forEach((line, li) =>
            drawText(ctx, line, x, cy + s + 26 + li * 20, { size: 16, weight: 800 })
          );

          drawText(ctx, r.artist, x, cy + s + 70, { size: 14, color: PAL.muted, maxWidth: s });
          drawText(ctx, `${nf(r.scrobbles)} scrobbles`, x, cy + s + 92, {
            size: 14,
            weight: 700,
            color: theme.accent
          });
        });
      }
    });
  }

  // ---------------------------------------------------- GÊNEROS / EVOLUÇÃO
  S.push({
    h: 44 + 300,
    draw(ctx, y) {
      const hasGenres = m.genres.length > 0;
      const gw = hasGenres ? (CW - 20) / 2 : 0;
      const ew = hasGenres ? gw : CW;
      const ex = hasGenres ? M + gw + 20 : M;
      const cy = y + 44;

      if (hasGenres) {
        drawLabel(ctx, "GÊNEROS", M, y, theme);
        drawCard(ctx, M, cy, gw, 300, 20);

        const maxG = m.genres[0][1];

        m.genres.forEach(([name, value], i) => {
          const ry = cy + 36 + i * 42;
          const bx = M + 28 + 190;
          const bw = gw - 56 - 190 - 64;

          drawText(ctx, name, M + 28, ry + 18, { size: 18, weight: 700, maxWidth: 180 });

          ctx.fillStyle = "rgba(255,255,255,0.08)";
          roundedRect(ctx, bx, ry + 6, bw, 12, 6);
          ctx.fill();

          ctx.fillStyle = i === 0 ? theme.accent : theme.accentSoft;
          roundedRect(ctx, bx, ry + 6, Math.max(10, bw * (value / maxG)), 12, 6);
          ctx.fill();

          drawText(ctx, pct(value / Math.max(1, m.genresTotal)), M + gw - 28, ry + 18, {
            size: 16,
            weight: 700,
            color: PAL.muted,
            align: "right"
          });
        });
      }

      drawLabel(ctx, "EVOLUÇÃO DA ESCUTA", ex, y, theme);
      drawCard(ctx, ex, cy, ew, 300, 20);

      const ev = m.evolution;

      if (!ev.length) {
        drawText(ctx, "Sem dados.", ex + 28, cy + 150, { size: 18, color: PAL.muted });
        return;
      }

      const max = Math.max(...ev.map(e => e[1]));
      const ch = 170;
      const cx0 = ex + 28;
      const cw = ew - 56;
      const gapBar = ev.length > 45 ? 1 : 3;
      const barW = Math.max(2, (cw - (ev.length - 1) * gapBar) / ev.length);
      const baseY = cy + 60 + ch;

      ev.forEach(([label, value], i) => {
        const bh = Math.max(3, (value / max) * ch);
        const bx = cx0 + i * (barW + gapBar);

        ctx.fillStyle = value === max ? theme.accent : theme.accentSoft;
        roundedRect(ctx, bx, baseY - bh, barW, bh, Math.min(3, barW / 2));
        ctx.fill();
      });

      drawText(ctx, ev[0][0], cx0, baseY + 30, { size: 14, color: PAL.muted });
      drawText(ctx, ev[ev.length - 1][0], cx0 + cw, baseY + 30, { size: 14, color: PAL.muted, align: "right" });
      drawText(ctx, `pico: ${nf(max)} por ${state.period === "year" ? "mês" : "dia"}`, cx0 + cw, cy + 40, {
        size: 14,
        weight: 700,
        color: PAL.muted,
        align: "right"
      });
    }
  });

  // ---------------------------------------------------- ACERVO / INSIGHTS
  S.push({
    h: 44 + 112,
    draw(ctx, y) {
      drawLabel(ctx, "SUA ESCUTA E O ACERVO", M, y, theme);

      const w = (CW - 60) / 4;

      const items = [
        [nf(m.complete), "ÁLBUNS COMPLETOS"],
        [nf(m.session), "SESSÕES DE ÁLBUM"],
        [nf(m.exploration), "EXPLORAÇÕES"],
        [`${nf(m.heard)} de ${nf(m.releasesCount)}`, `NO ACERVO · ${m.rate}`]
      ];

      items.forEach(([v, l], i) => drawStatCard(ctx, M + i * (w + 20), y + 44, w, 112, v, l, theme));
    }
  });

  return S;
}

// ============================================================
// EXPORTAÇÃO — WRAPPED
// ============================================================

async function exportWrapped(data, button, copyOnly = false) {
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "⏳ Preparando dados...";

  const restore = delay =>
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, delay);

  try {
    await ensureExportData(data);

    const model = buildWrappedModel(data);

    button.textContent = "⏳ Carregando imagens...";

    const assets = await loadWrappedAssets(model, data);

    const theme = themeFromImage(assets.heroCover);

    button.textContent = "⏳ Montando imagem...";

    const W = CFG.exportWidth;
    const M = 80;
    const CW = W - 2 * M;

    const sections = buildWrappedSections(model, assets, theme, W, M, CW);

    const TOP = 70;
    const GAP = 48;
    const BOTTOM = 120;

    const H = TOP + sections.reduce((sum, s) => sum + s.h, 0) + GAP * (sections.length - 1) + BOTTOM;

    // limita o tamanho total em pixels (celulares têm limite de canvas)
    const scale = exportCanvasScale(W, H, CFG.exportScale);

    const canvas = document.createElement("canvas");

    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);

    const ctx = canvas.getContext("2d");

    ctx.scale(scale, scale);

    paintBackground(ctx, W, H, theme);

    let y = TOP;

    for (const section of sections) {
      section.draw(ctx, y);
      y += section.h + GAP;
    }

    // rodapé em espaço reservado
    ctx.fillStyle = PAL.line;
    ctx.fillRect(M, H - 78, CW, 1);

    drawText(ctx, `RELATÓRIO MUSICAL  ·  @${CFG.lastfmUser}`, M, H - 40, {
      size: 14,
      weight: 800,
      color: PAL.faint,
      spacing: 2
    });

    drawText(ctx, `Last.fm  ·  gerado em ${new Date().toLocaleDateString("pt-BR")}`, W - M, H - 40, {
      size: 14,
      weight: 500,
      color: PAL.faint,
      align: "right"
    });

    const blob = await canvasToBlob(canvas);

    if (!blob) throw new Error("Não foi possível gerar o PNG.");

    const saved = copyOnly ? (await copyExportImage(blob), {method:"copy"}) : await saveExportBlob(blob, `relatorio-musical-${fileSlug(periodLabel())}.png`);
    
    if (saved.method === "cancelled") { button.textContent = "Exportação cancelada"; restore(1800); return; }
    button.textContent = saved.method === "copy" ? "✓ Imagem copiada" : "✓ Imagem exportada";

    restore(1800);
  } catch (error) {
    console.error("Relatório Musical V3 — exportação:", error);

    button.textContent = "⚠️ Erro na exportação";

    restore(2500);

    new Notice("Não foi possível gerar a imagem do Wrapped. Veja o console para mais detalhes.", 5000);
  }
}

// ============================================================
// TOPSTER — DADOS
// ============================================================

const TOPSTER_SOURCES = {
  albums: "Álbuns",
  artists: "Artistas",
  tracks: "Faixas"
};

const TOPSTER_THEMES = {
  dark: { bg: "#121214", text: "#ffffff", muted: "#9b9ba3", tile: "#1f1f23", line: "rgba(255,255,255,0.12)" },
  black: { bg: "#000000", text: "#ffffff", muted: "#8d8d95", tile: "#161616", line: "rgba(255,255,255,0.12)" },
  light: { bg: "#f3f1ec", text: "#141414", muted: "#6b6b70", tile: "#e1ded7", line: "rgba(0,0,0,0.12)" }
};

function buildTopsterItems(data, source) {
  if (source === "artists") {
    return data.artists.map(([artist, count]) => ({
      kind: "artist",
      title: artist,
      subtitle: "",
      artist,
      count
    }));
  }

  if (source === "tracks") {
    return data.tracks.map(t => ({
      kind: "track",
      title: t.name,
      subtitle: t.artist,
      artist: t.artist,
      count: t.count,
      imageUrl: t.image
    }));
  }

  return [...data.releases]
    .filter(r => r.album && r.type !== "single")
    .sort((a, b) => b.scrobbles - a.scrobbles)
    .map(r => ({
      kind: "album",
      title: r.album,
      subtitle: r.artist,
      artist: r.artist,
      album: r.album,
      count: r.scrobbles,
      imageUrl: r.image
    }));
}

async function resolveTopsterImages(items, opts, data, onProgress) {
  const out = new Array(items.length).fill(null);

  let done = 0;

  const limit = opts.hq ? CFG.deezerConcurrency : 6;

  await runLimited(items, limit, async (item, i) => {
    if (item.kind === "album") {
      out[i] = await albumCoverImage(item.artist, item.album, item.imageUrl, opts.hq);
    } else if (item.kind === "artist") {
      out[i] = await artistPhotoImage(item.title, data);
    } else {
      out[i] = await loadImage(item.imageUrl);
    }

    done++;
    onProgress(done, items.length);
  });

  return out;
}

// ============================================================
// TOPSTER — DESENHO
// ============================================================

function renderTopsterCanvas(items, images, opts, meta) {
  const T = TOPSTER_THEMES[opts.theme] || TOPSTER_THEMES.dark;

  const N = opts.size;
  const M = 70;
  const HEADER = 190;
  const FOOTER = 90;

  const gridPx = { 3: 1500, 4: 1600, 5: 1750, 7: 1750, 10: 1800 }[N] || 1700;
  const gap = opts.gap ? (N <= 5 ? 10 : 6) : 0;
  const cell = Math.floor((gridPx - gap * (N - 1)) / N);
  const gridW = cell * N + gap * (N - 1);

  // lista lateral
  const withList = opts.list === "side" && items.length > 0;
  const listFont = N <= 4 ? 30 : N <= 5 ? 26 : 20;
  const rowH = Math.round(listFont * 1.7);
  const colW = N <= 5 ? 600 : 440;
  const rowsPerCol = Math.max(1, Math.floor(gridW / rowH));
  const cols = withList ? Math.ceil(items.length / rowsPerCol) : 0;
  const listW = withList ? 60 + cols * colW : 0;

  const W = Math.max(1400, M * 2 + gridW + listW);
  const H = M + HEADER + gridW + FOOTER;

  const canvas = document.createElement("canvas");

  const scale = exportCanvasScale(W, H, 1);
  canvas.width = Math.max(1, Math.floor(W * scale));
  canvas.height = Math.max(1, Math.floor(H * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste dispositivo");
  ctx.scale(scale, scale);

  const theme = themeFromImage(images.find(Boolean) || null);

  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  if (opts.theme !== "black") {
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(W, 900) * 0.8);

    const alpha = opts.theme === "light" ? 0.22 : 0.7;

    glow.addColorStop(0, `hsla(${theme.hue}, 55%, ${opts.theme === "light" ? 70 : 24}%, ${alpha})`);
    glow.addColorStop(1, `hsla(${theme.hue}, 55%, ${opts.theme === "light" ? 70 : 12}%, 0)`);

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  const accent = opts.theme === "light" ? `hsl(${theme.hue}, 70%, 40%)` : theme.accent;

  // cabeçalho
  drawText(ctx, "TOPSTER", M, M + 24, { size: 17, weight: 800, color: accent, spacing: 6 });
  drawText(ctx, `${TOPSTER_SOURCES[opts.source]} · ${periodLabel()}`, M, M + 98, {
    size: 60,
    weight: 800,
    color: T.text,
    maxWidth: W - 2 * M
  });
  drawText(ctx, `${meta.range}  ·  @${CFG.lastfmUser}  ·  Last.fm`, M, M + 144, {
    size: 22,
    weight: 500,
    color: T.muted,
    maxWidth: W - 2 * M
  });

  // grade
  const gx = M;
  const gy = M + HEADER;
  const radius = gap ? 8 : 0;

  for (let i = 0; i < N * N; i++) {
    const x = gx + (i % N) * (cell + gap);
    const y = gy + Math.floor(i / N) * (cell + gap);
    const item = items[i];

    if (!item) {
      roundedRect(ctx, x, y, cell, cell, radius);
      ctx.fillStyle = T.tile;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }

    drawPicture(ctx, images[i], x, y, cell, cell, radius, item.title);

    if (opts.counts) {
      const fs = Math.max(12, Math.min(26, Math.round(cell * 0.1)));
      const pad = Math.max(5, Math.round(cell * 0.04));

      setFont(ctx, fs, 800);

      const label = String(item.count);
      const pw = ctx.measureText(label).width + fs * 0.9;
      const ph = fs * 1.7;

      roundedRect(ctx, x + cell - pad - pw, y + cell - pad - ph, pw, ph, ph / 2);
      ctx.fillStyle = "rgba(0,0,0,0.68)";
      ctx.fill();

      drawText(ctx, label, x + cell - pad - pw / 2, y + cell - pad - ph / 2 + fs * 0.35, {
        size: fs,
        weight: 800,
        color: "#ffffff",
        align: "center"
      });
    }
  }

  // lista lateral
  if (withList) {
    const lx = gx + gridW + 60;
    const numW = listFont * 2;

    items.forEach((item, i) => {
      const col = Math.floor(i / rowsPerCol);
      const row = i % rowsPerCol;
      const x = lx + col * colW;
      const y = gy + row * rowH + listFont * 1.2;

      const label = item.subtitle ? `${item.subtitle} — ${item.title}` : item.title;
      const reserve = opts.counts ? listFont * 3 : 0;

      drawText(ctx, `${i + 1}`, x + numW, y, { size: listFont, weight: 800, color: T.muted, align: "right" });
      drawText(ctx, label, x + numW + 16, y, {
        size: listFont,
        weight: 600,
        color: T.text,
        maxWidth: colW - numW - 16 - 28 - reserve
      });

      if (opts.counts) {
        drawText(ctx, String(item.count), x + colW - 28, y, {
          size: listFont,
          weight: 700,
          color: accent,
          align: "right"
        });
      }
    });
  }

  // rodapé
  drawText(ctx, `RELATÓRIO MUSICAL  ·  @${CFG.lastfmUser}`, M, H - 38, {
    size: 15,
    weight: 800,
    color: T.muted,
    spacing: 2
  });

  drawText(ctx, `Last.fm  ·  gerado em ${new Date().toLocaleDateString("pt-BR")}`, W - M, H - 38, {
    size: 15,
    weight: 500,
    color: T.muted,
    align: "right"
  });

  return canvas;
}

// ============================================================
// TOPSTER — ABA
// ============================================================

let topsterToken = 0;

function renderTopster(root, data) {
  const token = ++topsterToken;

  let seq = 0;
  let currentCanvas = null;

  const box = panel(root, "Topster", "Grade com o que você mais ouviu no período, pronta para exportar");

  const controls = box.createDiv({ cls: "tp-controls" });
  const status = box.createDiv({ cls: "tp-status" });
  const preview = box.createDiv({ cls: "tp-preview" });
  const actions = box.createDiv({ cls: "tp-actions" });

  const exportButton = actions.createEl("button", {
    cls: "export-button",
    text: "🖼️ Exportar Topster (PNG)"
  });

  if (!isMobileReport()) {
    const copyButton = actions.createEl("button", {cls:"nr-export-copy", text:"Copiar imagem"});
    copyButton.onclick = async () => {
      if (!currentCanvas) { new Notice("Aguarde a prévia do Topster.", 2500); return; }
      copyButton.disabled = true;
      const old = copyButton.textContent;
      try {
        // ClipboardItem aceita promessa do PNG, preservando a ativação do clique.
        if (typeof navigator.clipboard?.write !== "function" || typeof globalThis.ClipboardItem !== "function") throw new Error("Clipboard de imagens indisponível.");
        const pendingBlob = canvasToBlob(currentCanvas);
        await navigator.clipboard.write([new ClipboardItem({"image/png": pendingBlob})]);
        copyButton.textContent = "✓ Copiado";
      } catch (error) { console.error("Topster — cópia:", error); new Notice(`Não foi possível copiar: ${error.message}`, 3500); }
      setTimeout(() => {copyButton.disabled=false;copyButton.textContent=old;},1600);
    };
  }

  const isCurrent = mySeq => token === topsterToken && mySeq === seq;

  function choice(label, key, options) {
    const row = controls.createDiv({ cls: "tp-row" });

    row.createSpan({ cls: "tp-label", text: label });

    const wrap = row.createDiv({ cls: "tp-choices" });

    for (const [value, text] of options) {
      const button = wrap.createEl("button", { text });

      if (String(topsterOpts[key]) === String(value)) button.addClass("active");

      button.onclick = () => {
        topsterOpts[key] = typeof TOPSTER_DEFAULTS[key] === "number" ? Number(value) : value;
        saveTopsterOpts();

        [...wrap.children].forEach(c => c.removeClass("active"));
        button.addClass("active");

        refresh();
      };
    }
  }

  function toggles(label, defs) {
    const row = controls.createDiv({ cls: "tp-row" });

    row.createSpan({ cls: "tp-label", text: label });

    const wrap = row.createDiv({ cls: "tp-choices" });

    for (const [key, text] of defs) {
      const button = wrap.createEl("button", { text });

      if (topsterOpts[key]) button.addClass("active");

      button.onclick = () => {
        topsterOpts[key] = !topsterOpts[key];
        saveTopsterOpts();

        if (topsterOpts[key]) button.addClass("active");
        else button.removeClass("active");

        refresh();
      };
    }
  }

  choice("Fonte", "source", Object.entries(TOPSTER_SOURCES));
  choice("Tamanho", "size", [[3, "3×3"], [4, "4×4"], [5, "5×5"], [7, "7×7"], [10, "10×10"]]);
  choice("Lista", "list", [["side", "Lateral"], ["none", "Sem lista"]]);
  choice("Fundo", "theme", [["dark", "Escuro"], ["black", "Preto"], ["light", "Claro"]]);
  toggles("Opções", [["counts", "Contagens"], ["gap", "Espaçamento"], ["hq", "Capas HD"]]);

  async function refresh() {
    const mySeq = ++seq;

    currentCanvas = null;

    const opts = { ...topsterOpts };

    try {
      status.setText("Preparando...");

      if (opts.source === "artists" && !Object.keys(data.artistImages || {}).length) {
        data.artistImages = await loadArtistImages(data.artists);
        if (!isCurrent(mySeq)) return;
      }

      const items = buildTopsterItems(data, opts.source).slice(0, opts.size * opts.size);

      if (!items.length) {
        preview.empty();
        preview.createDiv({ cls: "empty", text: "Sem itens suficientes neste período." });
        status.setText("");
        return;
      }

      const images = await resolveTopsterImages(items, opts, data, (done, total) => {
        if (isCurrent(mySeq)) status.setText(`Carregando capas ${done}/${total}...`);
      });

      if (!isCurrent(mySeq)) return;

      const canvas = renderTopsterCanvas(items, images, opts, {
        range: rangeText(periodBounds(state.period))
      });

      currentCanvas = canvas;

      preview.empty();
      preview.appendChild(canvas);

      status.setText(
        `${items.length} de ${opts.size * opts.size} posições · ${canvas.width}×${canvas.height}px`
      );
    } catch (error) {
      console.error("Topster:", error);

      if (isCurrent(mySeq)) status.setText("Não foi possível montar o Topster. Veja o console.");
    }
  }

  exportButton.onclick = async () => {
    if (!currentCanvas) {
      new Notice("Aguarde a prévia terminar de carregar.", 3000);
      return;
    }

    const original = exportButton.textContent;

    exportButton.disabled = true;

    try {
      const blob = await canvasToBlob(currentCanvas);

      if (!blob) throw new Error("Não foi possível gerar o PNG.");

      const saved = await saveExportBlob(
        blob,
        `topster-${topsterOpts.source}-${topsterOpts.size}x${topsterOpts.size}-${fileSlug(periodLabel())}.png`
      );
      

      exportButton.textContent = saved.method === "cancelled" ? "Exportação cancelada" : (saved.method === "preview" ? "✓ Prévia aberta" : "✓ Imagem exportada");
    } catch (error) {
      console.error("Topster — exportação:", error);

      exportButton.textContent = "⚠️ Erro na exportação";

      new Notice("Não foi possível exportar o Topster. Veja o console.", 4000);
    }

    setTimeout(() => {
      exportButton.textContent = original;
      exportButton.disabled = false;
    }, 1800);
  };

  refresh();
}

// ============================================================
// INTERFACE
// ============================================================

function render(root, data) {
  root.empty();

  root.addClass("music-report"); root.addClass("ntn-visual-beta");

  addStyles(root);

  const hero = root.createDiv({ cls: "hero" });

  const heroMain = hero.createDiv({ cls: "hero-main" });

  heroMain.createEl("h1", { text: "RELATÓRIO MUSICAL" });

  heroMain.createDiv({ cls: "subtitle", text: `${periodLabel()} · Last.fm` });

  // --------------------------------------------------------
  // BOTÃO DE EXPORTAÇÃO
  // --------------------------------------------------------

  const heroActions = hero.createDiv({cls:"hero-actions"});
  const exportButton = heroActions.createEl("button", {
    cls: "export-button",
    text: "🖼️ Exportar Wrapped"
  });

  exportButton.onclick = async () => {
    await exportWrapped(data, exportButton);
  };
  if (!isMobileReport()) {
    const copyButton = heroActions.createEl("button", {cls:"nr-export-copy",text:"Copiar imagem"});
    copyButton.onclick = async () => { await exportWrapped(data, copyButton, true); };
  }

  const cleanup = heroActions.createEl("button",{text:"Limpar temporários",cls:"nr-cleanup"});
  cleanup.onclick = async () => {
    const folder=app.vault.getAbstractFileByPath("Musicas/Exportacoes/Temporarios");
    const files=(folder?.children||[]).filter(f=>/^\d{13}-.*\.png$/i.test(f.name));
    if(!files.length){new Notice("Nenhum PNG temporário encontrado.",3000);return;}
    const confirmed=window.confirm(`Excluir ${files.length} PNG(s) temporário(s) do Relatório? Esta ação não pode ser desfeita.`);
    if(!confirmed)return;
    let deleted=0;
    for(const f of files){try{await app.fileManager.trashFile(f);deleted++;}catch(e){console.warn("Limpeza de PNG",e);}}
    new Notice(`${deleted} arquivo(s) enviado(s) à lixeira.`,4000);
  };
  // --------------------------------------------------------
  // PERÍODOS
  // --------------------------------------------------------

  const periods = root.createDiv({ cls: "periods" });
  periods.setAttribute("aria-label", "Período do relatório");

  for (const [key, label] of Object.entries(PERIODS)) {
    const button = periods.createEl("button", { text: label });

    if (state.period === key) button.addClass("active");

    button.onclick = async () => {
      state.period = key;
      if (key === "custom" && (!state.customFrom || !state.customTo)) {
        const d = new Date();
        const fmt = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
        state.customFrom = fmt(new Date(d.getFullYear(),d.getMonth(),1));
        state.customTo = fmt(d);
      }
      localStorage.setItem(CFG.stateKey + ":period", key);

      await build(root);
    };
  }

  if (state.period === "custom") {
    const range = root.createDiv({cls:"nr-custom-range"});
    const start = range.createEl("input",{type:"date",attr:{"aria-label":"Data inicial"}});
    const end = range.createEl("input",{type:"date",attr:{"aria-label":"Data final"}});
    const today = new Date();
    const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    start.value = state.customFrom || localISO(new Date(today.getFullYear(),today.getMonth(),1));
    end.value = state.customTo || localISO(today);
    end.max = localISO(today); start.max = localISO(today);
    const apply = range.createEl("button",{text:"Aplicar período",cls:"nr-apply"});
    apply.onclick = async () => {
      const a=parseLocalDate(start.value),b=parseLocalDate(end.value);
      if (!a || !b || a>b || a>today) {new Notice("Confira as datas selecionadas.",3500);return;}
      state.customFrom=start.value;state.customTo=end.value;
      localStorage.setItem(CFG.stateKey+":customFrom",start.value);
      localStorage.setItem(CFG.stateKey+":customTo",end.value);
      await build(root);
    };
  }
  // --------------------------------------------------------
  // ABAS
  // --------------------------------------------------------

  const tabs = root.createDiv({ cls: "tabs" });

  const definitions = [
    ["overview", "Visão geral"],
    ["artists", "Artistas"],
    ["tracks", "Músicas"],
    ["albums", "Álbuns"],
    ["topster", "Topster"],
    ["catalog", "Acervo"],
    ["genres", "Gêneros"],
    ["insights", "Insights"]
  ];

  const content = root.createDiv();

  for (const [key, label] of definitions) {
    const button = tabs.createEl("button", { text: label });

    if (state.tab === key) button.addClass("active");

    button.onclick = () => {
      state.tab = key;

      localStorage.setItem(CFG.stateKey + ":tab", key);

      [...tabs.children].forEach(element => element.removeClass("active"));

      button.addClass("active");

      renderTab(content, data);
    };
  }

  renderTab(content, data);
}

// ============================================================
// BUILD
// ============================================================

let reportBuildToken = 0;
async function build(root) {
  const myBuildToken = ++reportBuildToken;
  root.empty();

  root.addClass("music-report"); root.addClass("ntn-visual-beta");

  addStyles(root);

  root.createDiv({ cls: "loading", text: "⏳ Carregando relatório..." });

  try {
    // ====================================================
    // DADOS PRINCIPAIS
    // ====================================================

    const bounds = periodBounds(state.period);

    const scrobbles = await getScrobbles(bounds.from, bounds.to);
    if (myBuildToken !== reportBuildToken) return;

    const library = getLibrary();

    const catalog = buildCatalog(library);

    const counts = buildCounts(scrobbles);

    const sessions = groupSessions(scrobbles);

    const releases = analyzeReleases(scrobbles, sessions);

    for (const release of releases) {
      release.inCatalog = catalogHas(catalog, release.artist, release.album);
    }

    // ====================================================
    // OBJETO PRINCIPAL
    // ====================================================

    const data = {
      scrobbles,
      sessions,
      library,
      releases,
      artists: counts.artists,
      tracks: counts.tracks,
      albums: counts.albums,
      artistImages: {},
      genres: [],
      evolution: evolution(scrobbles),
      listening: listeningTime(scrobbles),
      catalog: {
        total: library.length,
        heard: releases.filter(x => x.inCatalog).length,
        new: releases.filter(x => !x.inCatalog).length,
        rate: releases.length ? pct(releases.filter(x => x.inCatalog).length / releases.length) : "0%"
      }
    };

    // ====================================================
    // PRIMEIRO RENDER
    // ====================================================

    render(root, data);

    // ====================================================
    // CONTEÚDO DAS ABAS
    // ====================================================

    const content = root.querySelector(".music-report > div:last-child");

    enrichReleaseMetadata(data.releases).then(()=>{
      if(myBuildToken!==reportBuildToken)return;
      if(["albums","catalog","insights"].includes(state.tab))renderTab(content,data);
    }).catch(e=>console.warn("Metadados de álbuns:",e));

    // ====================================================
    // IMAGENS DOS ARTISTAS
    // ====================================================

    loadArtistImages(data.artists)
      .then(images => {
        if (myBuildToken !== reportBuildToken) return;
        data.artistImages = images;

        if (state.tab === "artists") renderTab(content, data);
      })
      .catch(error => {
        console.warn("Relatório V3 — artistas:", error);
      });

    // ====================================================
    // GÊNEROS
    // ====================================================

    loadGenres(data.artists)
      .then(genres => {
        if (myBuildToken !== reportBuildToken) return;
        data.genres = genres;

        if (state.tab === "genres") renderTab(content, data);
      })
      .catch(error => {
        console.warn("Relatório V3 — gêneros:", error);
      });
  } catch (error) {
    if (myBuildToken !== reportBuildToken) return;
    console.error("Relatório Musical V3.6:", error);

    root.empty();

    addStyles(root);

    const box = root.createDiv({ cls: "panel" });

    box.createDiv({ cls: "section-title", text: "Erro ao carregar o relatório" });

    box.createDiv({ cls: "section-subtitle", text: error?.message || String(error) });

    // Recuperação sem recarregar o Obsidian: os controles continuam acessíveis
    // mesmo quando as datas ou a consulta ao Last.fm são inválidas.
    const recovery = root.createDiv({ cls: "periods" });
    recovery.setAttribute("aria-label", "Escolher outro período após erro");
    for (const [key, label] of Object.entries(PERIODS)) {
      const button = recovery.createEl("button", { text: label });
      if (state.period === key) button.addClass("active");
      button.onclick = async () => {
        state.period = key;
        if (key === "custom") {
          const now = new Date();
          const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          const from = parseLocalDate(state.customFrom);
          const to = parseLocalDate(state.customTo);
          if (!from || !to || from > to || from > now) {
            state.customFrom = fmt(new Date(now.getFullYear(),now.getMonth(),1));
            state.customTo = fmt(now);
            localStorage.setItem(CFG.stateKey + ":customFrom", state.customFrom);
            localStorage.setItem(CFG.stateKey + ":customTo", state.customTo);
          }
        }
        localStorage.setItem(CFG.stateKey + ":period", key);
        await build(root);
      };
    }
    const retry = root.createDiv({ cls: "nr-custom-range" });
    retry.createEl("button", { cls: "nr-apply", text: "Tentar novamente" }).onclick = () => build(root);
    if (state.period === "custom") {
      const hint = root.createDiv({ cls: "section-subtitle", text: "Se o intervalo personalizado estiver inválido, selecione Personalizado acima para restaurar as datas ou escolha outro período." });
    }
  }
}

// ============================================================
// EXECUÇÃO
// ============================================================

await build(dv.container);
```