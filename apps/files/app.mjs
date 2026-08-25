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

const vaultBase = new URL('v/', import.meta.url);

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
  box.innerHTML = `<form class="gate" id="gate"><p>${esc(msg || '노트북 공유 비밀번호')}</p>` +
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
  box.innerHTML = `<form class="gate" id="gate"><p>${esc(msg || '금고 열쇠 · 픽스처는 fixture')}</p>` +
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

function loadLaptop() {
  const p = laptopPath();
  const auth = laptopAuth();
  if (!auth) {
    showLaptopGate();
    return;
  }
  box.innerHTML = '<p class="none">서랍을 여는 중</p>';
  fetch(LAPTOP + '/files/api/list?p=' + encodeURIComponent(p), {
    headers: { Authorization: auth },
  }).then((r) => {
    if (r.status === 401 || r.status === 403) {
      sessionStorage.removeItem(LAPTOP_KEY);
      showLaptopGate('비밀번호가 틀렸거나 만료됐다.');
      return null;
    }
    if (!r.ok) throw new Error('list ' + r.status);
    return r.json();
  }).then((data) => {
    if (!data) return;
    if (!data.ok) {
      box.innerHTML = '<p class="err">그 경로는 열 수 없다.</p>';
      return;
    }
    const bits = ['<a href="#laptop/">노트북</a>'];
    if (data.path) {
      const acc = [];
      data.path.split('/').forEach((part) => {
        acc.push(part);
        bits.push('<a href="#laptop/' + encodeURIComponent(acc.join('/')) + '">' + esc(part) + '</a>');
      });
    }
    crumb.innerHTML = bits.join(' · ');
    if (!data.entries.length) {
      box.innerHTML = '<p class="none">이 서랍은 비어 있다.</p>';
      return;
    }
    box.innerHTML = data.entries.map((e) => {
      if (e.dir) {
        return '<div class="row"><div class="mark"></div><div><div class="name"><a href="#laptop/' +
          encodeURIComponent(e.rel) + '" style="color:inherit;text-decoration:none">' + esc(e.name) +
          '</a></div><div class="meta">폴더 · ' + fmtTime(e.at) + '</div></div><div></div></div>';
      }
      let acts = '';
      if (e.view) acts += '<a href="' + abs(e.view) + '">보기</a>';
      if (e.get) acts += '<a href="' + abs(e.get) + '">받기</a>';
      return '<div class="row"><div class="mark file"></div><div><div class="name">' + esc(e.name) +
        '</div><div class="meta">' + fmtSize(e.size) + ' · ' + fmtTime(e.at) + '</div></div><div class="acts">' +
        acts + '</div></div>';
    }).join('');
  }).catch(() => {
    box.innerHTML = '<p class="err">노트북 확장이 안 붙는다. 화면은 여기 있고, 공유만 노트북에 있다.</p>';
  });
}

async function ensureVault() {
  if (vaultSession && vaultListing) return vaultSession;
  const pass = sessionStorage.getItem(VAULT_KEY) || '';
  if (!pass) return null;
  const store = fetchStore(vaultBase.href);
  vaultSession = await unlockVault(store, pass);
  vaultListing = await listFiles(vaultSession);
  return vaultSession;
}

function vaultCrumbs(dir) {
  const bits = ['<a href="#vault/">금고</a>'];
  if (!dir) return bits.join(' · ');
  const acc = [];
  dir.split('/').forEach((part) => {
    acc.push(part);
    bits.push('<a href="#vault/' + encodeURIComponent(acc.join('/')) + '">' + esc(part) + '</a>');
  });
  return bits.join(' · ');
}

function renderVaultDir(dir) {
  const listed = listDir(vaultListing, dir);
  crumb.innerHTML = vaultCrumbs(listed.dir);
  const rows = [];
  for (const name of listed.folders) {
    const rel = listed.dir ? listed.dir + '/' + name : name;
    rows.push('<div class="row"><div class="mark"></div><div><div class="name"><a href="#vault/' +
      encodeURIComponent(rel) + '" style="color:inherit;text-decoration:none">' + esc(name) +
      '</a></div><div class="meta">폴더</div></div><div></div></div>');
  }
  for (const f of listed.files) {
    const name = f.path.split('/').pop();
    rows.push('<div class="row"><div class="mark file"></div><div><div class="name"><a href="#vault/' +
      encodeURIComponent(f.path) + '" style="color:inherit;text-decoration:none">' + esc(name) +
      '</a></div><div class="meta">' + fmtSize(f.size) + '</div></div><div class="acts"><a href="#vault/' +
      encodeURIComponent(f.path) + '">보기</a></div></div>');
  }
  box.innerHTML = rows.length ? rows.join('') : '<p class="none">이 서랍은 비어 있다.</p>';
}

async function renderVaultFile(path) {
  crumb.innerHTML = vaultCrumbs(path.split('/').slice(0, -1).join('/')) +
    ' · ' + esc(path.split('/').pop());
  box.innerHTML = '<p class="none">여는 중</p>';
  const got = await getFile(vaultSession, path);
  if (!got) {
    box.innerHTML = '<p class="err">그 경로는 열 수 없다.</p>';
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
  a.textContent = '받기';
  const wrap = document.createElement('p');
  wrap.className = 'none';
  wrap.appendChild(a);
  box.replaceChildren(wrap);
}

async function loadVault() {
  const pass = sessionStorage.getItem(VAULT_KEY) || '';
  if (!pass) {
    showVaultGate();
    return;
  }
  box.innerHTML = '<p class="none">서랍을 여는 중</p>';
  try {
    await ensureVault();
  } catch (e) {
    sessionStorage.removeItem(VAULT_KEY);
    vaultSession = null;
    vaultListing = null;
    const msg = e instanceof VaultUnlockError ? '열쇠가 틀렸다.' : '금고 암호문을 못 읽는다.';
    showVaultGate(msg);
    return;
  }
  const p = vaultPath();
  const file = vaultListing.find((f) => f.path === p);
  try {
    if (file) await renderVaultFile(p);
    else renderVaultDir(p);
  } catch {
    box.innerHTML = '<p class="err">미리보기를 못 열었다. 평문 폴더는 만들지 않는다.</p>';
  }
}

function load() {
  setTabs();
  revokeBlob();
  if (extFromHash() === 'vault') loadVault();
  else loadLaptop();
}

window.addEventListener('hashchange', load);
if (!location.hash) location.hash = '#laptop/';
else load();
