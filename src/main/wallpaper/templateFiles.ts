/** Static Wallpaper Engine Web project files written to the export directory. */

export function buildProjectJson(playlists: { id: string; name: string }[]): string {
  const options = [
    { label: 'All galleries', value: 'all' },
    { label: 'Favorites only', value: 'favorites' },
    ...playlists.map((p) => ({
      label: p.name.slice(0, 64) || p.id,
      value: p.id,
    })),
  ]
  const project = {
    contentrating: 'Everyone',
    description:
      'Random gallery slideshow from local gallery-library. Works offline without the desktop app.',
    file: 'index.html',
    general: {
      properties: {
        schemecolor: {
          order: 0,
          text: 'ui_browse_properties_scheme_color',
          type: 'color',
          value: '0.1 0.1 0.1',
        },
        pool: {
          order: 1,
          text: 'Gallery pool',
          type: 'combo',
          value: 'all',
          options,
        },
        intervalmin: {
          order: 2,
          text: 'Interval min (seconds)',
          type: 'slider',
          value: '3',
          min: 1,
          max: 30,
          fraction: true,
          precision: 1,
        },
        intervalmax: {
          order: 3,
          text: 'Interval max (seconds)',
          type: 'slider',
          value: '5',
          min: 1,
          max: 60,
          fraction: true,
          precision: 1,
        },
        landscapemode: {
          order: 4,
          text: 'Landscape fit',
          type: 'combo',
          value: 'smart',
          options: [
            { label: 'Smart', value: 'smart' },
            { label: 'Cover (crop)', value: 'cover' },
            { label: 'Contain (full)', value: 'contain' },
          ],
        },
        portraitmode: {
          order: 5,
          text: 'Portrait layout',
          type: 'combo',
          value: 'multi',
          options: [
            { label: 'Smart multi (only if mismatch)', value: 'multi' },
            { label: 'Tile same image', value: 'tile' },
            { label: 'Single + blur', value: 'blur' },
          ],
        },
        portraitcolumns: {
          order: 6,
          text: 'Portrait columns (0 = auto)',
          type: 'slider',
          value: '0',
          min: 0,
          max: 4,
          fraction: false,
        },
        cutduration: {
          order: 7,
          text: 'Cut duration (seconds)',
          type: 'slider',
          value: '1',
          min: 0.3,
          max: 2,
          fraction: true,
          precision: 1,
        },
      },
      supportsaudioprocessing: false,
    },
    tags: ['Abstract'],
    title: 'Gallery Library Slideshow',
    type: 'web',
    version: 1,
    visibility: 'private',
  }
  return `${JSON.stringify(project, null, 2)}\n`
}

export const INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gallery Library Slideshow</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0a0a0a;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #ccc;
    }
    #stage {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background: #0a0a0a;
      --cut-ms: 1000ms;
      --cut-ease: cubic-bezier(0.32, 0.72, 0, 1);
    }
    #stage .layer {
      position: absolute;
      inset: 0;
      opacity: 0;
      transform: scale(1.08);
      transform-origin: center center;
      transition-property: opacity, transform;
      transition-duration: var(--cut-ms);
      transition-timing-function: var(--cut-ease);
    }
    #stage .layer.visible {
      opacity: 1;
      transform: scale(1);
    }
    #stage .layer.exit {
      opacity: 0;
      transform: scale(1.055);
    }
    #stage .layer.animating {
      will-change: transform, opacity;
    }
    #stage .bg-blur {
      position: absolute;
      inset: -4%;
      background-size: cover;
      background-position: center;
      filter: blur(12px) brightness(0.72) saturate(0.92);
      transform: scale(1.06);
    }
    #stage .bg-dim {
      position: absolute;
      inset: 0;
      background: rgba(8, 8, 10, 0.18);
      pointer-events: none;
    }
    #stage .row {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: stretch;
      justify-content: center;
      gap: 0;
      z-index: 1;
    }
    #stage .cell {
      flex: 1 1 0;
      min-width: 0;
      height: 100%;
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
    }
    #stage .cell.contain {
      background-size: contain;
    }
    #stage .cell.cover {
      background-size: cover;
    }
    #stage .single {
      position: absolute;
      inset: 0;
      z-index: 1;
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
    }
    #stage .single.cover {
      background-size: cover;
    }
    #status {
      position: fixed;
      left: 16px;
      bottom: 16px;
      font-size: 14px;
      opacity: 0.95;
      pointer-events: none;
      text-shadow: 0 1px 4px #000, 0 0 12px #000;
      max-width: 90%;
      color: #f0f0f0;
      z-index: 10;
    }
  </style>
</head>
<body>
  <div id="stage"></div>
  <div id="status"></div>
  <script src="config.js"></script>
  <script src="main.js"></script>
</body>
</html>
`

// Wallpaper Engine runs this in a Chromium CEF context (not TypeScript).
export const MAIN_JS = String.raw`(() => {
  'use strict';

  const stage = document.getElementById('stage');
  const statusEl = document.getElementById('status');

  const state = {
    pool: 'all',
    intervalMin: 3,
    intervalMax: 5,
    cutMs: 1000,
    fps: 0,
    landscapeMode: 'smart',
    portraitMode: 'multi',
    portraitColumns: 0,
    mediaBase: (typeof window !== 'undefined' && window.__GALLERY_MEDIA_BASE__) || 'http://127.0.0.1:17989',
    playlist: null,
    playlistLoadedAt: 0,
    forcePlaylist: false,
    lastGalleryId: null,
    /** poolKey -> gallery ids already shown this cycle. Memory is source of truth. */
    seenByPool: {},
    seenHydrated: false,
    cursor: 0,
    gallery: null,
    timer: null,
    front: null,
    running: false,
    /** Bumped to abort current gallery without marking it seen. */
    skipToken: 0,
    /** Pending sleep completer — must be called when skipping or await hangs forever. */
    sleepDone: null,
  };

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function skipCurrentGallery() {
    state.skipToken += 1;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    // Do NOT null sleepDone before calling — finish() checks identity.
    if (typeof state.sleepDone === 'function') {
      state.sleepDone(false);
    }
  }

  function pathToUrl(p) {
    if (!p) return '';
    if (/^https?:/i.test(p) || /^file:/i.test(p)) return p;
    const s = String(p).replace(/\\/g, '/').replace(/^\/+/, '');
    const encoded = s.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return state.mediaBase.replace(/\/$/, '') + '/media/' + encoded;
  }

  function randBetween(a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return lo + Math.random() * (hi - lo);
  }

  /** @returns {Promise<boolean>} true if sleep finished normally, false if aborted */
  function sleep(ms) {
    return new Promise((resolve) => {
      const token = state.skipToken;
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (state.sleepDone === finish) state.sleepDone = null;
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        resolve(Boolean(ok) && token === state.skipToken);
      };
      state.sleepDone = finish;
      state.timer = setTimeout(() => finish(true), Math.max(0, ms));
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('load failed'));
      img.src = url;
    });
  }

  function isPortrait(img, screenW, screenH) {
    const ir = img.naturalWidth / img.naturalHeight;
    const sr = screenW / screenH;
    return ir < sr * 0.9 && ir < 0.95;
  }

  /** Width fill ratio if image is fitted to full screen height (contain-by-height). */
  function heightFitWidthRatio(img, screenW, screenH) {
    const fittedW = screenH * (img.naturalWidth / img.naturalHeight);
    return fittedW / screenW;
  }

  /**
   * Only use multi-panel when a single image leaves large empty sides
   * (clear portrait-vs-ultrawide / tall mismatch). Mild mismatch → single + blur.
   */
  function shouldUseMulti(img, screenW, screenH) {
    const fill = heightFitWidthRatio(img, screenW, screenH);
    return fill < 0.58;
  }

  function suggestedColumns(img, screenW, screenH) {
    if (state.portraitColumns > 0) return state.portraitColumns;
    const fill = heightFitWidthRatio(img, screenW, screenH);
    if (fill < 0.38) return screenW >= 2560 ? 3 : 2;
    return 2;
  }

  function autoColumns(screenW) {
    if (screenW >= 2560) return 3;
    if (screenW >= 1600) return 2;
    return 2;
  }

  function getPoolGalleries() {
    const list = (state.playlist && state.playlist.galleries) || [];
    const withImages = list.filter((g) => g.images && g.images.length);
    const pool = resolvePoolValue(state.pool);
    // Keep normalized id so later logic sees pl_*
    if (pool && pool !== state.pool) state.pool = pool;

    if (pool === 'favorites') {
      return withImages.filter((g) => g.favorite);
    }
    if (pool.indexOf('pl_') === 0) {
      const pls = (state.playlist && state.playlist.playlists) || [];
      const pl = pls.find((p) => p.id === pool);
      if (!pl) return [];
      const allow = {};
      for (let i = 0; i < (pl.galleryIds || []).length; i++) {
        allow[pl.galleryIds[i]] = true;
      }
      return withImages.filter((g) => allow[g.id]);
    }
    if (pool === 'all') return withImages;
    // Unknown value must NOT fall through to "all"
    return [];
  }

  function poolOptionsFromConfig() {
    try {
      const opts = window.__GALLERY_POOL_OPTIONS__;
      return Array.isArray(opts) ? opts : [];
    } catch (e) {
      return [];
    }
  }

  /** Normalize WE combo value (id / label / numeric index). */
  function resolvePoolValue(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return 'all';
    if (s === 'all' || s === 'favorites' || s.indexOf('pl_') === 0) return s;
    if (s === 'All galleries') return 'all';
    if (s === 'Favorites only') return 'favorites';

    const cfgOpts = poolOptionsFromConfig();
    for (let i = 0; i < cfgOpts.length; i++) {
      const o = cfgOpts[i];
      if (!o) continue;
      if (String(o.value) === s || String(o.label) === s) return String(o.value);
    }
    if (/^\d+$/.test(s) && cfgOpts[Number(s)] && cfgOpts[Number(s)].value != null) {
      return String(cfgOpts[Number(s)].value);
    }

    const pls = (state.playlist && state.playlist.playlists) || [];
    if (/^\d+$/.test(s)) {
      const opts = ['all', 'favorites'].concat(pls.map((p) => p.id));
      if (opts[Number(s)]) return opts[Number(s)];
    }
    const byName = pls.find((p) => p.name === s || p.id === s);
    if (byName) return byName.id;
    return s;
  }

  function poolLabel(pool) {
    if (pool === 'all') return '全部';
    if (pool === 'favorites') return '收藏';
    const pls = (state.playlist && state.playlist.playlists) || [];
    const pl = pls.find((p) => p.id === pool);
    return (pl && pl.name) || pool;
  }

  function mergeIds(a, b) {
    const out = [];
    const have = {};
    const arr = (a || []).concat(b || []);
    for (let i = 0; i < arr.length; i++) {
      const id = arr[i];
      if (typeof id !== 'string' || !id || have[id]) continue;
      have[id] = true;
      out.push(id);
    }
    return out;
  }

  function seenStorageKey(pool) {
    return 'gallerySeen:' + String(pool || 'all');
  }

  function loadSeenLocal(pool) {
    try {
      const raw = localStorage.getItem(seenStorageKey(pool));
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x) : [];
    } catch (e) {
      return [];
    }
  }

  function saveSeenLocal(pool, ids) {
    try {
      localStorage.setItem(seenStorageKey(pool), JSON.stringify(ids));
    } catch (e) {
      /* ignore quota / file:// */
    }
  }

  function poolSeen(poolKey) {
    if (!state.seenByPool[poolKey]) state.seenByPool[poolKey] = [];
    return state.seenByPool[poolKey];
  }

  async function hydrateSeen() {
    if (state.seenHydrated) return;
    const base = state.mediaBase.replace(/\/$/, '');
    try {
      const res = await fetch(base + '/seen.json?_=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const keys = Object.keys(data);
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (Array.isArray(data[k])) state.seenByPool[k] = mergeIds(state.seenByPool[k], data[k]);
          }
          state.seenHydrated = true;
        }
      }
    } catch (e) {
      /* media server down — in-memory + localStorage still work this session */
    }
    const extra = ['all', 'favorites', String(state.pool || 'all')];
    for (let i = 0; i < extra.length; i++) {
      const k = extra[i];
      state.seenByPool[k] = mergeIds(state.seenByPool[k], loadSeenLocal(k));
    }
    state.seenHydrated = true;
  }

  async function persistSeen(reset) {
    const poolKey = String(state.pool || 'all');
    const ids = poolSeen(poolKey);
    saveSeenLocal(poolKey, ids);
    const base = state.mediaBase.replace(/\/$/, '');
    try {
      await fetch(base + '/seen.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pool: poolKey, ids: ids, reset: !!reset }),
      });
    } catch (e) {}
  }

  function markGallerySeen(pool, id) {
    if (!id) return;
    const key = String(pool || 'all');
    const seen = poolSeen(key);
    if (seen.indexOf(id) >= 0) return;
    seen.push(id);
    void persistSeen(false);
  }

  function pickGallery(pool) {
    if (!pool.length) return null;
    const poolKey = String(state.pool || 'all');
    const alive = {};
    for (let i = 0; i < pool.length; i++) alive[pool[i].id] = true;
    let seen = poolSeen(poolKey).filter((id) => alive[id]);
    state.seenByPool[poolKey] = seen;
    let unseen = pool.filter((g) => seen.indexOf(g.id) < 0);
    if (!unseen.length) {
      seen = [];
      state.seenByPool[poolKey] = seen;
      void persistSeen(true);
      unseen = pool.slice();
    }
    if (unseen.length === 1) return unseen[0];
    let g = unseen[Math.floor(Math.random() * unseen.length)];
    let guard = 0;
    while (g.id === state.lastGalleryId && guard < 6) {
      g = unseen[Math.floor(Math.random() * unseen.length)];
      guard += 1;
    }
    return g;
  }

  function clearTimer() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function applyCutVars() {
    const ms = Math.max(300, Math.min(2000, Number(state.cutMs) || 1000));
    state.cutMs = ms;
    if (stage) stage.style.setProperty('--cut-ms', ms + 'ms');
  }

  function showLayer(nodes) {
    applyCutVars();
    const layer = document.createElement('div');
    layer.className = 'layer animating';
    for (const n of nodes) layer.appendChild(n);
    stage.appendChild(layer);

    const prev = state.front;
    state.front = layer;

    const kids = Array.prototype.slice.call(stage.children);
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (el !== layer && el !== prev) el.remove();
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        layer.classList.add('visible');
      });
    });

    const ttl = (state.cutMs || 1000) + 80;
    if (prev) {
      prev.classList.remove('visible');
      prev.classList.add('exit');
      prev.classList.add('animating');
      setTimeout(function () {
        if (prev.parentNode) prev.remove();
      }, ttl);
    }
    setTimeout(function () {
      if (layer.parentNode) layer.classList.remove('animating');
    }, ttl);
  }

  function makeBlurBg(url) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;z-index:0;overflow:hidden;';
    const el = document.createElement('div');
    el.className = 'bg-blur';
    el.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
    const dim = document.createElement('div');
    dim.className = 'bg-dim';
    wrap.appendChild(el);
    wrap.appendChild(dim);
    return wrap;
  }

  function renderSingle(url, img, modeLandscape) {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const ir = img.naturalWidth / img.naturalHeight;
    const sr = screenW / screenH;
    let fit = modeLandscape || 'smart';
    if (fit === 'smart') {
      // Never crop top/bottom: cover only when image is wider than the screen aspect
      fit = ir >= sr ? 'cover' : 'contain';
    } else if (fit === 'cover' && ir < sr) {
      // Forced cover would crop vertically — fall back to contain
      fit = 'contain';
    }
    const nodes = [];
    if (fit === 'contain') nodes.push(makeBlurBg(url));
    const single = document.createElement('div');
    single.className = 'single' + (fit === 'cover' ? ' cover' : '');
    single.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
    single.style.zIndex = '1';
    nodes.push(single);
    showLayer(nodes);
  }

  function renderTile(url) {
    const cols = state.portraitColumns > 0 ? state.portraitColumns : autoColumns(window.innerWidth);
    const nodes = [makeBlurBg(url)];
    const row = document.createElement('div');
    row.className = 'row';
    for (let i = 0; i < cols; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell contain';
      cell.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
      row.appendChild(cell);
    }
    nodes.push(row);
    showLayer(nodes);
  }

  function renderMulti(urls) {
    const nodes = [makeBlurBg(urls[0])];
    const row = document.createElement('div');
    row.className = 'row';
    for (const url of urls) {
      const cell = document.createElement('div');
      // contain = full image height visible, no vertical crop
      cell.className = 'cell contain';
      cell.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
      row.appendChild(cell);
    }
    nodes.push(row);
    showLayer(nodes);
  }

  async function loadPlaylist(force) {
    const now = Date.now();
    // Short cache so app-side playlist edits apply quickly
    if (!force && state.playlist && now - state.playlistLoadedAt < 8000) {
      return state.playlist;
    }
    const base = state.mediaBase.replace(/\/$/, '');
    try {
      const res = await fetch(base + '/playlist.json?_=' + now, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.playlist = await res.json();
      if (state.playlist.mediaBase) state.mediaBase = state.playlist.mediaBase;
      state.playlistLoadedAt = now;
      const n = (state.playlist.galleries || []).length;
      if (!n) {
        setStatus('playlist 为空：请在图库应用设置里点「立即同步」');
      }
      return state.playlist;
    } catch (err) {
      setStatus(
        '媒体服务未启动 (' +
          base +
          ')：请打开图库应用，或运行 we-media-server。' +
          (err && err.message ? ' ' + err.message : ''),
      );
      return state.playlist;
    }
  }

  async function showFrameFromGallery() {
    const g = state.gallery;
    if (!g || !g.images || state.cursor >= g.images.length) return false;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const firstPath = g.images[state.cursor];
    const firstUrl = pathToUrl(firstPath);

    let img;
    try {
      img = await loadImage(firstUrl);
    } catch {
      state.cursor += 1;
      return showFrameFromGallery();
    }

    const portrait = isPortrait(img, screenW, screenH);

    if (!portrait) {
      renderSingle(firstUrl, img, state.landscapeMode);
      state.cursor += 1;
      return true;
    }

    if (state.portraitMode === 'tile') {
      renderTile(firstUrl);
      state.cursor += 1;
      return true;
    }

    if (state.portraitMode === 'blur') {
      const nodes = [makeBlurBg(firstUrl)];
      const single = document.createElement('div');
      single.className = 'single';
      single.style.backgroundImage = 'url("' + firstUrl.replace(/"/g, '\\"') + '")';
      nodes.push(single);
      showLayer(nodes);
      state.cursor += 1;
      return true;
    }

    // multi (default): only when mismatch is large; otherwise single + blur/cover
    if (!shouldUseMulti(img, screenW, screenH)) {
      renderSingle(firstUrl, img, 'smart');
      state.cursor += 1;
      return true;
    }

    const cols = suggestedColumns(img, screenW, screenH);
    const urls = [firstUrl];
    let advanced = 1;
    for (let i = 1; i < cols; i += 1) {
      const idx = state.cursor + i;
      if (idx >= g.images.length) break;
      const u = pathToUrl(g.images[idx]);
      try {
        const im = await loadImage(u);
        if (!shouldUseMulti(im, screenW, screenH)) break;
        urls.push(u);
        advanced += 1;
      } catch {
        break;
      }
    }

    if (urls.length === 1) {
      // not enough siblings — single with blur, or tile if still very narrow
      if (heightFitWidthRatio(img, screenW, screenH) < 0.45) {
        renderTile(firstUrl);
      } else {
        renderSingle(firstUrl, img, 'smart');
      }
    } else {
      renderMulti(urls);
    }
    state.cursor += advanced;
    return true;
  }

  async function runLoop() {
    if (state.running) return;
    state.running = true;
    setStatus('加载播放列表…');
    await loadPlaylist(true);
    await hydrateSeen();

    while (state.running) {
      const token = state.skipToken;
      const force = state.forcePlaylist;
      state.forcePlaylist = false;
      await loadPlaylist(force);

      // Keep selected custom pool even if playlist was stale at click time
      if (String(state.pool).indexOf('pl_') === 0) {
        const pls = (state.playlist && state.playlist.playlists) || [];
        if (!pls.some((p) => p.id === state.pool)) {
          await loadPlaylist(true);
        }
      }

      if (!state.seenHydrated) await hydrateSeen();

      const pool = getPoolGalleries();
      if (!pool.length) {
        const p = String(state.pool || 'all');
        if (p.indexOf('pl_') === 0) {
          setStatus('播放列表「' + poolLabel(p) + '」为空或未同步：在应用里添加套图并点立即同步');
        } else if (p === 'favorites') {
          setStatus('收藏池为空：先在图库收藏套图');
        } else {
          setStatus('播放池为空：下载套图，或检查媒体服务');
        }
        const ok = await sleep(4000);
        if (!ok || token !== state.skipToken) continue;
        state.forcePlaylist = true;
        continue;
      }

      const g = pickGallery(pool);
      if (!g) {
        await sleep(2000);
        continue;
      }

      state.gallery = g;
      state.lastGalleryId = g.id;
      state.cursor = 0;
      setStatus('[' + poolLabel(state.pool) + '] ' + (g.title || g.id));

      let shown = 0;
      let aborted = false;
      while (state.cursor < g.images.length) {
        if (token !== state.skipToken) {
          aborted = true;
          break;
        }
        const ok = await showFrameFromGallery();
        if (!ok) break;
        shown += 1;
        if (shown === 1) {
          setStatus('');
          markGallerySeen(String(state.pool || 'all'), g.id);
        }
        const waitMs = Math.max(
          state.cutMs || 1000,
          randBetween(state.intervalMin, state.intervalMax) * 1000,
        );
        const stillSame = await sleep(waitMs);
        if (!stillSame || token !== state.skipToken) {
          aborted = true;
          break;
        }
        await loadPlaylist(false);
        const stillInPool = getPoolGalleries().some((x) => x.id === g.id);
        if (!stillInPool) {
          aborted = true;
          skipCurrentGallery();
          break;
        }
      }

      if (!aborted && !shown) {
        setStatus('图片加载失败（检查 library 联接）：' + (g.title || g.id));
        await sleep(2000);
      }
    }
  }

  function clampInterval() {
    if (state.intervalMin > state.intervalMax) {
      const t = state.intervalMin;
      state.intervalMin = state.intervalMax;
      state.intervalMax = t;
    }
  }

  function applyPoolSelection(raw) {
    const next = resolvePoolValue(raw);
    if (next === state.pool) return;
    state.pool = next;
    state.seenByPool[next] = mergeIds(state.seenByPool[next], loadSeenLocal(next));
    state.forcePlaylist = true;
    skipCurrentGallery();
    setStatus('切换播放池：' + poolLabel(next));
  }

  window.wallpaperPropertyListener = {
    applyUserProperties: function (properties) {
      if (properties.pool && properties.pool.value !== undefined && properties.pool.value !== null) {
        applyPoolSelection(properties.pool.value);
      }
      if (properties.intervalmin && properties.intervalmin.value !== undefined) {
        state.intervalMin = Math.max(0.5, Number(properties.intervalmin.value) || 3);
      }
      if (properties.intervalmax && properties.intervalmax.value !== undefined) {
        state.intervalMax = Math.max(0.5, Number(properties.intervalmax.value) || 5);
      }
      if (properties.landscapemode && properties.landscapemode.value !== undefined) {
        state.landscapeMode = String(properties.landscapemode.value);
      }
      if (properties.portraitmode && properties.portraitmode.value !== undefined) {
        state.portraitMode = String(properties.portraitmode.value);
      }
      if (properties.portraitcolumns && properties.portraitcolumns.value !== undefined) {
        state.portraitColumns = Math.max(0, Math.min(4, Math.floor(Number(properties.portraitcolumns.value) || 0)));
      }
      if (properties.cutduration && properties.cutduration.value !== undefined) {
        state.cutMs = Math.round(Math.max(0.3, Number(properties.cutduration.value) || 1) * 1000);
        applyCutVars();
      }
      clampInterval();
    },
    applyGeneralProperties: function (properties) {
      if (properties.fps) {
        state.fps = Number(properties.fps) || 0;
      }
    },
  };

  window.addEventListener('resize', () => {
    /* next frame uses new size */
  });

  function start() {
    applyCutVars();
    void runLoop();
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
`
