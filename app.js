// =====================
// Konfigurasi API
// =====================
const API_BASE = "https://api.sansekai.my.id/api/anime";

// Endpoint kamu (sesuai yang kamu kirim)
const ENDPOINT_LATEST = `${API_BASE}/latest`;
const ENDPOINT_SEARCH = `${API_BASE}/search`; // ?query=
const ENDPOINT_DETAIL = `${API_BASE}/detail`; // ?urlId=

// Endpoint streaming (di swagger kamu terlihat /api/anime/ge...)
// Jika error 404, ganti sesuai endpoint di Swagger kamu.
const STREAM_ENDPOINT = `${API_BASE}/getvideo`; // ?chapterUrlId= // ?chapterUrlId=...&reso=480p

// =====================
// Helper DOM
// =====================
const $ = (q) => document.querySelector(q);

const pageHome = $("#pageHome");
const pageDetail = $("#pageDetail");
const pageWatch = $("#pageWatch");

const grid = $("#grid");
const statusEl = $("#status");

const qInput = $("#q");
const btnSearch = $("#btnSearch");
const btnRefresh = $("#btnRefresh");
const btnHome = $("#btnHome");
const tabs = document.querySelectorAll(".tab");

const btnBackFromDetail = $("#btnBackFromDetail");
const btnBackFromWatch = $("#btnBackFromWatch");

const detailCover = $("#detailCover");
const detailTitle = $("#detailTitle");
const detailMeta = $("#detailMeta");
const detailSynopsis = $("#detailSynopsis");
const episodeList = $("#episodeList");
const detailStatus = $("#detailStatus");
const resoSelect = $("#reso");

const watchTitle = $("#watchTitle");
const watchStatus = $("#watchStatus");
const video = $("#video");

let currentHomeMode = "latest";
let lastHomeData = [];

// =====================
// Router sederhana (hash)
// #/detail/<urlId>
// #/watch/<chapterUrlId>
// =====================
window.addEventListener("hashchange", handleRoute);
btnHome.addEventListener("click", () => (location.hash = ""));
btnBackFromDetail.addEventListener("click", () => history.back());
btnBackFromWatch.addEventListener("click", () => history.back());

btnSearch.addEventListener("click", () => doSearch());
qInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

btnRefresh.addEventListener("click", () => loadHome(currentHomeMode));

tabs.forEach((t) => {
  t.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");

    // Karena kamu belum kasih endpoint trending/rekomendasi,
    // aku map semua ke latest biar UI tetap sama.
    currentHomeMode = t.dataset.tab; // latest/latest2/latest3
    $("#homeTitle").textContent =
      currentHomeMode === "latest2"
        ? "Episode Terbaru"
        : currentHomeMode === "latest3"
        ? "Rekomendasi"
        : "Trending";

    loadHome(currentHomeMode);
  });
});

// =====================
// Fetch wrapper
// =====================
async function getJSON(url) {
  const r = await fetch(url, { headers: { accept: "*/*" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} - ${url}`);
  return await r.json();
}

function looksLikeMediaUrl(s) {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (!/^https?:\/\//i.test(v)) return false;
  return (
    v.includes(".m3u8") ||
    v.includes(".mp4") ||
    v.includes(".mpd") ||
    v.includes("/m3u8") ||
    v.includes("playlist") ||
    v.includes("manifest")
  );
}

function findFirstMediaUrlDeep(obj, depth = 0) {
  if (depth > 8) return null; // biar aman
  if (!obj) return null;

  // Kalau response string langsung
  if (typeof obj === "string") return looksLikeMediaUrl(obj) ? obj : null;

  // Kalau array
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findFirstMediaUrlDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Kalau object
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      // Kadang fieldnya "url", "file", "src", "video", "link", "iframe", dll
      if (typeof val === "string" && looksLikeMediaUrl(val)) return val;

      const found = findFirstMediaUrlDeep(val, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

async function resolveFinalUrl(url) {
  try {
    // method HEAD kadang ditolak, jadi fallback ke GET
    const r = await fetch(url, { method: "GET", redirect: "follow" });
    return r.url || url; // r.url adalah final setelah redirect
  } catch {
    return url;
  }
}

// =====================
// Render Card Grid
// =====================
function renderCards(items) {
  grid.innerHTML = "";
  if (!items || !items.length) {
    statusEl.textContent = "Data kosong.";
    return;
  }

  items.forEach((it) => {
    const card = document.createElement("div");
    card.className = "card";

    const cover = it.cover || it.thumbnail || "";
    const title = it.judul || it.title || "Tanpa Judul";
    const urlId = (it.url || it.urlId || "").replace(/^\//, "");

    // badge episode / total_episode jika ada
    const badgeText = it.total_episode ? `${it.total_episode} eps` : it.episodes ? `${it.episodes} eps` : "";

    card.innerHTML = `
      <div class="cardThumb">
        ${badgeText ? `<div class="badge">${badgeText}</div>` : ""}
        <img src="${cover}" alt="${escapeHtml(title)}" loading="lazy"/>
      </div>
      <div class="cardBody">
        <p class="cardTitle">${escapeHtml(title)}</p>
        <div class="cardMeta">${escapeHtml(it.status || it.lastup || it.rilis || "")}</div>
      </div>
    `;

    card.addEventListener("click", () => {
      // detail pakai urlId (dari field "url" di response latest/search)
      if (!urlId) {
        alert("urlId tidak ditemukan pada item ini.");
        return;
      }
      location.hash = `#/detail/${encodeURIComponent(urlId)}`;
    });

    grid.appendChild(card);
  });

  statusEl.textContent = "";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// =====================
// Home
// =====================
async function loadHome(mode) {
  showPage("home");
  statusEl.textContent = "Memuat...";
  grid.innerHTML = "";

  try {
    // Kamu belum kirim endpoint trending/rekomendasi.
    // Jadi semua mode pakai /latest biar UI sama.
    const data = await getJSON(ENDPOINT_LATEST);
    lastHomeData = Array.isArray(data) ? data : data?.data || [];

    renderCards(lastHomeData);
  } catch (e) {
    statusEl.textContent = `Gagal load: ${e.message}`;
  }
}

// =====================
// Search
// =====================
async function doSearch() {
  const query = (qInput.value || "").trim();
  if (!query) {
    loadHome(currentHomeMode);
    return;
  }

  showPage("home");
  statusEl.textContent = `Mencari "${query}"...`;
  grid.innerHTML = "";

  try {
    const url = `${ENDPOINT_SEARCH}?query=${encodeURIComponent(query)}`;
    const res = await getJSON(url);

    // Berdasarkan hasil real API: res.data[0].result berisi list
    const items = res?.data?.[0]?.result || res?.data || [];
    renderCards(items);
    if (!items.length) statusEl.textContent = `Tidak ada hasil untuk "${query}".`;
  } catch (e) {
    statusEl.textContent = `Gagal search: ${e.message}`;
  }
}

// =====================
// Detail
// =====================
async function loadDetail(urlId) {
  showPage("detail");
  detailStatus.textContent = "Memuat detail...";
  episodeList.innerHTML = "";
  detailMeta.innerHTML = "";
  detailSynopsis.textContent = "";
  detailTitle.textContent = "";

  try {
    const url = `${ENDPOINT_DETAIL}?urlId=${encodeURIComponent(urlId)}`;
    const res = await getJSON(url);

    // API kadang bungkus: {data:[{...}]}
    const info = Array.isArray(res) ? res[0] : res?.data?.[0] || res?.data || res;

    const title = info?.judul || info?.title || urlId;
    const cover = info?.cover || info?.thumbnail || "";

    detailTitle.textContent = title;
    detailCover.src = cover || "https://via.placeholder.com/300x400?text=No+Cover";

    // meta chips
    const chips = [];
    if (info?.status) chips.push(info.status);
    if (info?.type) chips.push(info.type);
    if (info?.studio) chips.push(info.studio);
    if (info?.score) chips.push(`⭐ ${info.score}`);
    if (info?.published || info?.rilis) chips.push(info.published || info.rilis);

    // genre array
    const genres = Array.isArray(info?.genre) ? info.genre : [];
    genres.slice(0, 10).forEach((g) => chips.push(g));

    detailMeta.innerHTML = chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("");

    detailSynopsis.textContent = info?.sinopsis || info?.synopsis || "Tidak ada sinopsis.";

    // episode list: biasanya ada di info.chapter (sesuai swagger)
    const chapters = Array.isArray(info?.chapter) ? info.chapter : Array.isArray(info?.episodes) ? info.episodes : [];

    if (!chapters.length) {
      detailStatus.textContent = "Episode tidak ditemukan di response detail (field chapter/episodes kosong).";
      return;
    }

    detailStatus.textContent = "";
    renderEpisodes(chapters, title);
  } catch (e) {
    detailStatus.textContent = `Gagal load detail: ${e.message}

Catatan: jika urlId 'naruto' error, pakai urlId yang valid dari hasil /search (misal: 'naruto-alredy-fixed' atau 'naruto-shippuuden-all-fixed').`;
  }
}

function renderEpisodes(chapters, animeTitle) {
  episodeList.innerHTML = "";
  chapters.forEach((ch, idx) => {
    // Di swagger: chapterUrlId diambil dari chapter[].url (contoh al-150441-1135)
    const chapterUrlId = ch?.url || ch?.urlId || ch?.id || ch?.slug;
    const name = ch?.judul || ch?.title || ch?.episode || `Episode ${idx + 1}`;
    const extra = ch?.rilis || ch?.release || ch?.durasi ? `${ch?.rilis || ""} ${ch?.durasi ? "• " + ch.durasi : ""}` : "";

    const btn = document.createElement("div");
    btn.className = "episodeBtn";
    btn.innerHTML = `
      <div>
        <div class="episodeName">${escapeHtml(name)}</div>
        <div class="episodeSmall">${escapeHtml(extra)}</div>
      </div>
      <div class="episodeSmall">▶</div>
    `;

    btn.addEventListener("click", () => {
      if (!chapterUrlId) {
        alert("chapterUrlId tidak ditemukan di item episode ini (butuh field url/urlId).");
        return;
      }
      // simpan judul buat halaman watch
      sessionStorage.setItem("watch_anime_title", animeTitle);
      location.hash = `#/watch/${encodeURIComponent(chapterUrlId)}`;
    });

    episodeList.appendChild(btn);
  });
}

// =====================
// Watch / Player
// =====================
let hls;

async function loadWatch(chapterUrlId) {
  showPage("watch");

  const animeTitle = sessionStorage.getItem("watch_anime_title") || "Anime";
  watchTitle.textContent = `${animeTitle} • Player`;
  watchStatus.textContent = "Mengambil link streaming...";

  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.pause();
  video.removeAttribute("src");
  video.load();

  try {
    const apiUrl = `${STREAM_ENDPOINT}?chapterUrlId=${encodeURIComponent(chapterUrlId)}`;
    const res = await getJSON(apiUrl);

    console.log("getvideo response:", res);

    const streamUrl = findFirstMediaUrlDeep(res);

    if (!streamUrl) {
      watchStatus.textContent =
        "Gagal: tidak menemukan link video di JSON /getvideo.\n" +
        "Buka DevTools > Console dan lihat log: 'getvideo response'.";
      return;
    }

    console.log("Before resolve:", streamUrl);

    const finalUrl = await resolveFinalUrl(streamUrl);

    console.log("After resolve:", finalUrl);

    watchStatus.textContent = `Memutar dari: ${finalUrl.slice(0, 60)}...`;
    playVideo(finalUrl);
  } catch (e) {
    watchStatus.textContent = `Gagal memutar: ${e.message}`;
  }
}

function playVideo(streamUrl) {
  // Jika m3u8 => pakai hls.js (untuk browser yang tidak native HLS)
  if (streamUrl.includes(".m3u8")) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      video.play().catch(() => {});
      return;
    }

    if (window.Hls && window.Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      return;
    }
  }

  // selain itu (mp4, dll)
  video.src = streamUrl;
  video.play().catch(() => {});
}

// =====================
// Route handler
// =====================
function showPage(which) {
  pageHome.classList.toggle("hidden", which !== "home");
  pageDetail.classList.toggle("hidden", which !== "detail");
  pageWatch.classList.toggle("hidden", which !== "watch");
}

function handleRoute() {
  const hash = location.hash || "";
  if (!hash || hash === "#") {
    loadHome(currentHomeMode);
    return;
  }

  const parts = hash.replace(/^#\/?/, "").split("/");
  const route = parts[0];
  const param = decodeURIComponent(parts.slice(1).join("/"));

  if (route === "detail") {
    loadDetail(param);
  } else if (route === "watch") {
    loadWatch(param);
  } else {
    loadHome(currentHomeMode);
  }
}

// init
handleRoute();
