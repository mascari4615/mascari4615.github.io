import {
  VaultUnlockError,
  fetchStore,
  getFile,
  listDir,
  listFiles,
  mimeFor,
  previewKind,
  unlockVault,
} from './src/vault.mjs';
import { pickVaultBase } from './src/vault-base.mjs';

const LAPTOP = 'https://laptop.mascari4615.com';
const LAPTOP_KEY = 'files.laptop.pass';
const VAULT_KEY = 'files.vault.pass';
const box = document.getElementById('box');
const crumb = document.getElementById('crumb');
const tabLaptop = document.getElementById('tab-laptop');
const tabVault = document.getElementById('tab-vault');

let lastBlob = '';
let vaultSession = null;
let vaultListing = null;

const fixtureBase = new URL('v/', import.meta.url);
let vaultBase = fixtureBase;

const ICONS = {
  folder: '<path d="M4 6a2 2 0 0 1 2-2h3.2l1.8 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"/>',
  file: '<path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 1.8V9h4.2L13 4.8Z"/>',
  image: '<path d="M4 5h16v14H4V5Zm2.6 11.4h10.8l-3.4-4.6-2.6 3.3-1.8-2.1-3 3.4ZM9 10.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z"/>',
  video: '<path d="M4 6h11v12H4V6Zm13 3.4 4-2.4v10l-4-2.4V9.4Z"/>',
};
function icon(kind) {
  const cls = kind === 'folder' ? 'icon folder' : 'icon';
  return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    (ICONS[kind] || ICONS.file) + '</svg>';
}
function iconFor(name) {
  const kind = previewKind(name);
  if (kind === 'image') return icon('image');
  if (kind === 'video') return icon('video');
  return icon('file');
}
function row(kind, nameHtml, size, when, acts) {
  return '<div class="row"><div>' + kind + '</div><div class="name">' + nameHtml +
    '</div><div class="size">' + (size || '') + '</div><div class="when">' + (when || '') +
    '</div><div class="acts">' + (acts || '') + '</div></div>';
}
function listHead() {
  return '<div class="head"><div></div><div>이름</div><div>크기</div><div>수정한 날짜</div><div></div></div>';
}
function crumbHtml(bits) {
  return bits.join('<span class="sep">/</span>');
}
function link(href, text) {
  return '<a href="' + href + '">' + text + '</a>';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
function fmtSize(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}
function fmtTime(ms) {
  const d = new Date(ms + 9 * 3600000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function abs(u) {
  if (!u) return '';
  if (u.indexOf('http') === 0) return u;
  return LAPTOP + u;
}
function extFromHash() {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('vault')) return 'vault';
  return 'laptop';
}
function laptopPath() {
  const h = location.hash.replace(/^#/, '');
  if (h.indexOf('laptop/') === 0) return decodeURIComponent(h.slice(7));
  return '';
}
function vaultPath() {
  const h = location.hash.replace(/^#/, '');
  if (h.indexOf('vault/') === 0) return decodeURIComponent(h.slice(6));
  return '';
}
function setTabs() {
  const on = extFromHash();
  tabLaptop.classList.toggle('on', on === 'laptop');
  tabVault.classList.toggle('on', on === 'vault');
}
function revokeBlob() {
  if (lastBlob) URL.revokeObjectURL(lastBlob);
  lastBlob = '';
}

tabLaptop.addEventListener('click', () => {
  location.hash = '#laptop/';
});
tabVault.addEventListener('click', () => {
  location.hash = '#vault/';
});

function laptopAuth() {
  const pass = sessionStorage.getItem(LAPTOP_KEY) || '';
  if (!pass) return null;
  return 'Basic ' + btoa('x:' + pass);
}
function showLaptopGate(msg) {
  crumb.textContent = '';
  box.innerHTML = `<form class="gate" id="gate"><p>${esc(msg || '내 PC 비밀번호를 입력하세요')}</p>` +
    '<input type="password" id="pass" autocomplete="current-password">' +
    '<div><button type="submit">열기</button></div></form>';
  document.getElementById('gate').addEventListener('submit', (ev) => {
    ev.preventDefault();
    sessionStorage.setItem(LAPTOP_KEY, document.getElementById('pass').value);
    load();
  });
}
function showVaultGate(msg) {
  crumb.textContent = '';
  box.innerHTML = `<form class="gate" id="gate"><p>${esc(msg || '비밀번호를 입력하세요')}</p>` +
    '<input type="password" id="pass" autocomplete="current-password">' +
    '<div><button type="submit">열기</button></div></form>';
  document.getElementById('gate').addEventListener('submit', (ev) => {
    ev.preventDefault();
    sessionStorage.setItem(VAULT_KEY, document.getElementById('pass').value);
    vaultSession = null;
    vaultListing = null;
    load();
  });
}


// ── PC 업로드 관리 (데스크톱 앱에서만) ───────────────────────────────────────
// 왜 여기 있나: 전송기를 터미널에서 띄우면 그 세션이 죽을 때 같이 죽는다.
// 데스크톱 앱이 붙들면 창을 닫아도 살아 있고, 앱을 껐다 켜도 다시 붙는다.
// 화면에는 집계 수치만 온다 — 원본 경로·파일 이름·비밀번호는 오가지 않는다.
const UPLOAD_TARGET_KEY = 'files.upload.target';

function desktopInvoke(cmd, args) {
  const fn = globalThis.__TAURI__?.core?.invoke;
  if (typeof fn !== 'function') return Promise.reject(new Error('desktop-only'));
  return fn(cmd, args);
}
function isDesktop() {
  return typeof globalThis.__TAURI__?.core?.invoke === 'function';
}

// 데스크톱에서는 이 화면이 카모랩 창을 갈아탄 자리다 — 돌아갈 길과 따로 띄울 길을 준다.
// 웹에서는 둘 다 뜻이 없으므로 아예 안 그린다.
function mountDesktopNav() {
  const el = document.getElementById('desknav');
  if (!el) return;
  if (!isDesktop()) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML =
    '<button type="button" id="nav-back">← KarmoLab</button>' +
    '<button type="button" id="nav-window">새 창으로</button>' +
    '<span class="nav-gap"></span>' +
    '<button type="button" class="wc" id="wc-min" aria-label="최소화">–</button>' +
    '<button type="button" class="wc" id="wc-max" aria-label="최대화">□</button>' +
    '<button type="button" class="wc wc-close" id="wc-close" aria-label="닫기">×</button>';
  document.getElementById('nav-back').addEventListener('click', () => {
    // navigate 로 왔으므로 히스토리에 카모랩이 남아 있다.
    history.back();
  });
  document.getElementById('nav-window').addEventListener('click', () => {
    desktopInvoke('files_window_open').catch(() => {});
  });

  // 창 테두리가 없는 앱이라(decorations:false) 최소화·최대화·닫기를 화면이 그려야 한다.
  // 카모랩 셸에는 이미 있지만 이 화면은 그 셸이 아니다 — 없으면 창을 닫을 길이 없다.
  const getWin = globalThis.__TAURI__?.window?.getCurrentWindow;
  if (typeof getWin !== 'function') return;
  const win = getWin();
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', () => {
    try {
      fn()?.catch?.(() => {});
    } catch {
      /* 창 API 가 없으면 조용히 넘긴다 */
    }
  });
  on('wc-min', () => win.minimize());
  on('wc-max', () => win.toggleMaximize());
  on('wc-close', () => win.close());
}

const UPLOAD_LABEL = {
  idle: '대기',
  preparing: '준비 중',
  running: '올리는 중',
  stopped: '중지됨',
  done: '완료',
  error: '중단됨',
};

let uploadTimer = 0;

function stopUploadPolling() {
  if (uploadTimer) clearInterval(uploadTimer);
  uploadTimer = 0;
}

function renderUploadPanel(st) {
  const el = document.getElementById('uploader');
  if (!el) return;
  const pct = st.total ? Math.floor((st.done / st.total) * 100) : 0;
  const busy = st.status === 'running' || st.status === 'preparing';
  const target = sessionStorage.getItem(UPLOAD_TARGET_KEY) || st.target || '';
  el.innerHTML =
    '<div class="up-head"><span class="up-badge ' + esc(st.status) + '">' +
    esc(UPLOAD_LABEL[st.status] || st.status) + '</span>' +
    (st.total
      ? '<span class="up-num">' + st.done.toLocaleString() + ' / ' + st.total.toLocaleString() +
        ' · ' + pct + '%</span>'
      : '<span class="up-num">' + esc(st.note || '') + '</span>') +
    '</div>' +
    (st.total ? '<div class="up-bar"><i style="width:' + pct + '%"></i></div>' : '') +
    '<div class="up-meta">' +
    (st.total ? '올림 ' + st.uploaded.toLocaleString() + ' · 건너뜀 ' + st.skipped.toLocaleString() : '') +
    (st.startedAt ? ' · 시작 ' + esc(st.startedAt) : '') +
    '</div>' +
    '<div class="up-acts">' +
    '<input id="up-target" type="text" placeholder="올릴 폴더" value="' + esc(target) + '"' +
    (busy ? ' disabled' : '') + '>' +
    (busy
      ? '<button id="up-stop" type="button">중지</button>'
      : '<button id="up-start" type="button">' + (st.status === 'stopped' ? '이어서 올리기' : '올리기') + '</button>') +
    '</div>';

  const startBtn = document.getElementById('up-start');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const v = (document.getElementById('up-target')?.value || '').trim();
      if (!v) return;
      sessionStorage.setItem(UPLOAD_TARGET_KEY, v);
      startBtn.disabled = true;
      try {
        renderUploadPanel(await desktopInvoke('vault_upload_start', { target: v }));
      } catch (e) {
        showUploadError(e);
      }
    });
  }
  const stopBtn = document.getElementById('up-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      stopBtn.disabled = true;
      try {
        renderUploadPanel(await desktopInvoke('vault_upload_stop'));
      } catch (e) {
        showUploadError(e);
      }
    });
  }
}

function showUploadError(e) {
  const el = document.getElementById('uploader');
  if (!el) return;
  const msg = e && e.message ? e.message : String(e);
  el.innerHTML = '<div class="up-note err">' + esc(msg) + '</div>';
}

async function pollUpload() {
  try {
    renderUploadPanel(await desktopInvoke('vault_upload_status'));
  } catch {
    stopUploadPolling();
  }
}

function mountUploader() {
  const el = document.getElementById('uploader');
  if (!el) return;
  el.hidden = false;
  if (!isDesktop()) {
    // 웹·PWA 에서는 설명만. 전송기와 열쇠는 PC 안에서만 산다.
    el.innerHTML = '<div class="up-note">올리기는 PC 앱에서만 됩니다. 여기서는 보기만 가능합니다.</div>';
    return;
  }
  pollUpload();
  stopUploadPolling();
  uploadTimer = setInterval(pollUpload, 5000);
}

function unmountUploader() {
  stopUploadPolling();
  const el = document.getElementById('uploader');
  if (el) el.hidden = true;
}

function loadLaptop() {
  const p = laptopPath();
  const auth = laptopAuth();
  if (!auth) {
    showLaptopGate();
    return;
  }
  box.innerHTML = '<p class="none">불러오는 중…</p>';
  fetch(LAPTOP + '/files/api/list?p=' + encodeURIComponent(p), {
    headers: { Authorization: auth },
  }).then((r) => {
    if (r.status === 401 || r.status === 403) {
      sessionStorage.removeItem(LAPTOP_KEY);
      showLaptopGate('비밀번호가 틀렸거나 만료됐습니다.');
      return null;
    }
    if (!r.ok) throw new Error('list ' + r.status);
    return r.json();
  }).then((data) => {
    if (!data) return;
    if (!data.ok) {
      box.innerHTML = '<p class="err">이 항목을 열 수 없습니다.</p>';
      return;
    }
    const bits = [link('#laptop/', '내 PC')];
    if (data.path) {
      const acc = [];
      data.path.split('/').forEach((part) => {
        acc.push(part);
        bits.push(link('#laptop/' + encodeURIComponent(acc.join('/')), esc(part)));
      });
    }
    crumb.innerHTML = crumbHtml(bits);
    if (!data.entries.length) {
      box.innerHTML = '<p class="none">이 폴더는 비어 있습니다.</p>';
      return;
    }
    box.innerHTML = listHead() + data.entries.map((e) => {
      if (e.dir) {
        return row(
          icon('folder'),
          link('#laptop/' + encodeURIComponent(e.rel), esc(e.name)),
          '',
          fmtTime(e.at),
          '',
        );
      }
      let acts = '';
      if (e.view) acts += link(abs(e.view), '열기');
      if (e.get) acts += link(abs(e.get), '다운로드');
      return row(iconFor(e.name), esc(e.name), fmtSize(e.size), fmtTime(e.at), acts);
    }).join('');
  }).catch(() => {
    box.innerHTML = '<p class="err">내 PC에 연결할 수 없습니다.</p>';
  });
}

async function ensureVault() {
  if (vaultSession && vaultListing) return vaultSession;
  const pass = sessionStorage.getItem(VAULT_KEY) || '';
  if (!pass) return null;
  vaultBase = new URL(
    await pickVaultBase({
      origin: location.origin,
      fixture: fixtureBase.href,
    }),
  );
  const store = fetchStore(vaultBase.href);
  vaultSession = await unlockVault(store, pass);
  vaultListing = await listFiles(vaultSession);
  return vaultSession;
}

function vaultCrumbs(dir) {
  const bits = [link('#vault/', '클라우드')];
  if (!dir) return crumbHtml(bits);
  const acc = [];
  dir.split('/').forEach((part) => {
    acc.push(part);
    bits.push(link('#vault/' + encodeURIComponent(acc.join('/')), esc(part)));
  });
  return crumbHtml(bits);
}

function renderVaultDir(dir) {
  const listed = listDir(vaultListing, dir);
  crumb.innerHTML = vaultCrumbs(listed.dir);
  const rows = [];
  for (const name of listed.folders) {
    const rel = listed.dir ? listed.dir + '/' + name : name;
    rows.push(row(icon('folder'), link('#vault/' + encodeURIComponent(rel), esc(name)), '', '', ''));
  }
  for (const f of listed.files) {
    const name = f.path.split('/').pop();
    const href = '#vault/' + encodeURIComponent(f.path);
    rows.push(row(iconFor(name), link(href, esc(name)), fmtSize(f.size), '', link(href, '열기')));
  }
  box.innerHTML = rows.length
    ? listHead() + rows.join('')
    : '<p class="none">이 폴더는 비어 있습니다.</p>';
}

async function renderVaultFile(path) {
  crumb.innerHTML = vaultCrumbs(path.split('/').slice(0, -1).join('/')) +
    '<span class="sep">/</span><a>' + esc(path.split('/').pop()) + '</a>';
  box.innerHTML = '<p class="none">여는 중…</p>';
  const got = await getFile(vaultSession, path);
  if (!got) {
    box.innerHTML = '<p class="err">이 항목을 열 수 없습니다.</p>';
    return;
  }
  const kind = previewKind(path);
  revokeBlob();
  if (kind === 'text') {
    const pre = document.createElement('pre');
    pre.className = 'preview-text';
    pre.textContent = new TextDecoder().decode(got.bytes);
    box.replaceChildren(pre);
    return;
  }
  const blob = new Blob([got.bytes], { type: mimeFor(path) });
  lastBlob = URL.createObjectURL(blob);
  if (kind === 'image') {
    const img = document.createElement('img');
    img.className = 'preview-img';
    img.alt = path;
    img.src = lastBlob;
    box.replaceChildren(img);
    return;
  }
  if (kind === 'video') {
    const video = document.createElement('video');
    video.className = 'preview-vid';
    video.controls = true;
    video.src = lastBlob;
    box.replaceChildren(video);
    return;
  }
  const a = document.createElement('a');
  a.href = lastBlob;
  a.download = path.split('/').pop();
  a.textContent = '다운로드';
  const wrap = document.createElement('p');
  wrap.className = 'dl';
  wrap.appendChild(a);
  box.replaceChildren(wrap);
}

async function loadVault() {
  const pass = sessionStorage.getItem(VAULT_KEY) || '';
  if (!pass) {
    showVaultGate();
    return;
  }
  box.innerHTML = '<p class="none">불러오는 중…</p>';
  try {
    await ensureVault();
  } catch (e) {
    sessionStorage.removeItem(VAULT_KEY);
    vaultSession = null;
    vaultListing = null;
    const msg = e instanceof VaultUnlockError ? '비밀번호가 틀렸습니다.' : '파일 목록을 읽지 못했습니다.';
    showVaultGate(msg);
    return;
  }
  const p = vaultPath();
  const file = vaultListing.find((f) => f.path === p);
  try {
    if (file) await renderVaultFile(p);
    else renderVaultDir(p);
  } catch {
    box.innerHTML = '<p class="err">미리보기를 열지 못했습니다.</p>';
  }
}

function load() {
  setTabs();
  revokeBlob();
  if (extFromHash() === 'vault') {
    mountUploader();
    loadVault();
  } else {
    unmountUploader();
    loadLaptop();
  }
}

mountDesktopNav();
window.addEventListener('hashchange', load);
if (!location.hash) location.hash = '#laptop/';
else load();
