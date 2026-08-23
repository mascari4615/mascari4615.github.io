#!/usr/bin/env node
/**
 * build-memo-atlas — memo 를 지형도 데이터로 굽는다 (TASK-KAR-233).
 *
 * 하는 일: memo 의 글을 모아 → 임베딩(뜻을 숫자로) → 2차원 자리 → 덩어리로 묶고
 * → 덩어리마다 이름을 AI 가 붙인다. 결과 = apps/karmolab/data/memo-atlas.json.
 *
 * 왜 미리 굽나: 임베딩은 돈과 시간이 든다. 화면 열 때마다 부를 일이 아니다.
 * 글이 바뀌어도 **바뀐 글만** 다시 임베딩한다 (내용 해시로 판단).
 *
 * 쓰기:
 *   node scripts/build-memo-atlas.mjs               # 새로/바뀐 것만
 *   node scripts/build-memo-atlas.mjs --limit 80    # 맛보기
 *   node scripts/build-memo-atlas.mjs --no-embed    # 임베딩 없이 (키 없을 때 자리만)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_MODEL as MEANING_MODEL,
  embedTexts as meaningEmbedTexts,
  embedAll as meaningEmbedAll,
  removeSharedBias as meaningRemoveBias,
  nearest as meaningNearest,
} from '@karmo/meaning';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KARMOLAB = path.resolve(HERE, '..');
/**
 * memo 를 위로 훑어 찾는다. 책상(lane)에서 돌릴 때와 공유 트리에서 돌릴 때
 * 깊이가 다르다 — 고정 상대경로로 잡으면 한쪽에서 조용히 0개가 나온다.
 */
function findMemo(start) {
  if (process.env.MEMO_PATH) return process.env.MEMO_PATH;
  let cur = start;
  for (let i = 0; i < 8; i += 1) {
    const cand = path.join(cur, 'memo');
    if (fs.existsSync(path.join(cand, 'INDEX.md'))) return cand;
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}
const OUT = path.join(KARMOLAB, 'data', 'memo-atlas.json');
const CACHE = path.join(KARMOLAB, 'data', '.memo-atlas-cache.json');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

// ── 소스 — 지도에 올릴 뿌리들 ─────────────────────────────────────────
// memo 전용이 아니다. 소스 = { root, name, prefix, laneBy, exclude, laneAlias, xBookmarks }.
// 해석 순서: `--sources <file>` → `data/atlas.sources.json`(gitignore) → 기본(memo 자동 발견).
// `--root <path>` 는 일회성 소스를 덧붙인다. 폴더 화이트리스트는 안 쓴다 — 2026-08 memo
// 개편 때 화이트리스트 9칸 중 6칸이 조용히 죽어 지도가 1,918편 → 34편이 될 뻔했다.
// 담는 쪽 = 자동 발견 − 제외 목록, 그리고 아래 drift gate 가 급감을 소리 내어 막는다.

/** 기본 제외 — 비밀 그릇과 기계 산출물. 글 폴더는 늘리지 말고 여기서만 뺀다. */
const SOURCE_EXCLUDE = ['.git', '.github', '.claude', 'node_modules', 'private', 'vault', 'dotfiles', 'scripts'];

/** memo 의 낯익은 갈래 이름 — 폴더명 그대로면 낯선 것만 골라 한글을 입힌다. */
const MEMO_LANE_ALIAS = {
  rules: '룰', notes: '노트', systems: '시스템', wm: 'WM', life: '인생',
  'projects/karmolab': 'KarmoLab', 'projects/yawnbot': '욘봇',
};

/**
 * ★ **못 찾았다고 여기서 죽으면 안 된다.** 이 파일은 굽기만 하는 게 아니라 **자들이 함수를
 * 꺼내 쓰려고 import** 한다(예: audit-memo-atlas-fresh). memo 가 옆에 없는 곳(마스터
 * 워크트리·CI)에서 import 만 해도 죽으면 자가 「아무 말도 안 하고 죽었다」가 된다.
 * 그래서 소스 해석 실패는 여기 담아 두고, 실제로 구울 때(requireSources) 소리 내어 죽는다.
 */
let SOURCES_ERROR = null;

function normalizeSource(s, baseDir) {
  const root = path.isAbsolute(s.root) ? s.root : path.resolve(baseDir, s.root);
  const name = s.name || path.basename(root);
  return {
    root,
    name,
    /* memo 는 접두사 없음 — id 가 repo 상대경로 그대로라야 git 지도·캐시·TASK 링크가 이어진다. */
    prefix: s.prefix != null ? s.prefix : (name === 'memo' ? '' : `${name}/`),
    laneBy: s.laneBy || 'top',           // 'top' = 최상위 폴더가 갈래 · 'name' = 소스 하나가 갈래 하나
    exclude: [...new Set([...(s.exclude || []), '.git', '.github', 'node_modules'])],
    laneAlias: s.laneAlias || {},
    xBookmarks: s.xBookmarks || null,    // 소스 root 기준 상대경로 (X 북마크 json)
    /* 글로 칠 확장자. 기본 = 마크다운. `.txt` 같은 평문은 그대로 먹는다 —
       pdf·html 은 본문 추출이 따로 필요해서 여기 못 적는다 (적으면 껍데기가 지도에 오른다). */
    exts: Array.isArray(s.exts) && s.exts.length ? s.exts : ['.md'],
    optional: !!s.optional,              // true = 없어도 안 죽는다 (기계마다 있고 없는 소스)
  };
}

function defaultSources() {
  const memo = findMemo(KARMOLAB);
  if (!memo) return [];
  return [normalizeSource({
    root: memo, name: 'memo', exclude: SOURCE_EXCLUDE, laneAlias: MEMO_LANE_ALIAS,
    xBookmarks: 'brain/x-bookmarks.json',
  }, KARMOLAB)];
}

function loadSources() {
  let sources = [];
  try {
    const cfgPath = opt('--sources', null)
      || (fs.existsSync(path.join(KARMOLAB, 'data', 'atlas.sources.json'))
        ? path.join(KARMOLAB, 'data', 'atlas.sources.json') : null);
    if (cfgPath) {
      /* BOM 관용 — Windows 도구가 UTF-8 에 BOM 을 붙여 저장하는 일이 흔하다. */
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^﻿/, ''));
      sources = (cfg.sources || []).map((s) => normalizeSource(s, path.dirname(cfgPath)));
    } else {
      sources = defaultSources();
    }
    argv.forEach((a, i) => { if (a === '--root' && argv[i + 1]) sources.push(normalizeSource({ root: argv[i + 1] }, process.cwd())); });
  } catch (e) {
    SOURCES_ERROR = e;                   // 삼키지 않는다 — 구울 때 이 오류로 죽는다
  }
  return sources;
}

const SOURCES = loadSources();

/** 실제로 구울 때만 부른다 — config 오류·없는 root 는 무음 0편 대신 여기서 분명히 죽는다. */
function requireSources() {
  if (SOURCES_ERROR) throw new Error(`소스 정의를 못 읽었다: ${SOURCES_ERROR.message}`);
  if (!SOURCES.length) throw new Error('소스가 없다 — memo 자동 발견 실패 · config(--sources / data/atlas.sources.json)도 없다.');
  const missing = SOURCES.filter((s) => !s.optional && !fs.existsSync(s.root));
  if (missing.length) throw new Error(`소스 root 가 없다: ${missing.map((s) => `${s.name}(${s.root})`).join(' · ')}`);
  return SOURCES;
}

/** git 이 있는 소스만 — 생일·손댄 날·편집 자취는 git 에서 나온다. worktree 의 `.git` 파일도 통과. */
function gitSources() {
  return SOURCES.filter((s) => fs.existsSync(path.join(s.root, '.git')));
}

/** 소스마다 git 지도를 재서 **id 접두사를 붙여** 한 그릇에 합친다. */
function mergedGitMap(fn) {
  const map = new Map();
  for (const src of gitSources()) {
    for (const [k, v] of fn(src.root)) map.set(`${src.prefix}${k}`, v);
  }
  return map;
}

/**
 * 글 파일을 모은다.
 *
 * ★ `fs.readdirSync` 순서를 **그대로 쓰면 안 된다.** 그 순서는 파일시스템이 정하고
 * NTFS 와 ext4 가 다르다 — 씨앗을 못 박아도 **입력 행 순서가 바뀌면 지도가 바뀐다.**
 * 게다가 손잡이(nn·md)를 표본으로 매 판 다시 뽑으므로, 순서가 흔들리면 좌표가 조금
 * 밀리는 게 아니라 **손잡이가 통째로 갈릴 수 있다.** 비결정성은 스택 전체에서 잡거나
 * 아예 안 잡는 것만 못하다(Zhuang 외, MLSys 2022 — 도구발 흔들림이 씨앗발과 같은 크기였다).
 */
function walk(dir, depth = 0, exts = ['.md']) {
  if (depth > 3 || !fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { out.push(...walk(p, depth + 1, exts)); continue; }
    if (e.isFile() && exts.some((x) => e.name.endsWith(x)) && e.name !== 'README.md') out.push(p);
  }
  return out;
}

function frontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const meta = {};
  if (!m) return meta;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return meta;
}

function title(raw, file) {
  const meta = frontmatter(raw);
  if (meta.title) return meta.title;
  const h = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  return path.basename(file, '.md');
}

/** 임베딩에 먹일 몸통. 앞부분이 그 글의 정체를 가장 잘 담는다. */
function gist(raw) {
  const body = raw.replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body.slice(0, 1800);
}


/**
 * 링크만 저장된 글에 **펼쳐 둔 본문**을 붙인다.
 *
 * 북마크 글은 본문이 링크뿐이라(38개 중 31개, 중간값 125자) 뽑을 말이 없었다.
 * `unfurl-links.mjs` 가 미리 가져다 둔 것이 있으면 여기서 이어 붙인다.
 * 없으면 그냥 지나간다 — 굽기가 남의 서버를 두드리는 일은 없다.
 */
function attachLinkBodies(docs) {
  let bodies;
  try { bodies = JSON.parse(fs.readFileSync(path.join(KARMOLAB, 'data', '.link-bodies.json'), 'utf8')); }
  catch { return 0; }
  let n = 0;
  for (const d of docs) {
    if (d.text.length >= 300) continue;
    const m = d.text.match(/https?:\/\/[^\s)>\]"']+/);
    if (!m) continue;
    const got = bodies[m[0]];
    if (!got || got.dead || !got.body) continue;      // 죽은 링크는 안 붙인다
    d.text = `${d.text}

${got.title || ''}
${got.body}`.slice(0, 1800);
    d.hash = crypto.createHash('sha1').update(d.text).digest('hex').slice(0, 12);
    n += 1;
  }
  if (n) console.log(`[atlas] 링크에서 가져다 둔 본문 ${n}개를 붙였다`);
  return n;
}

/**
 * 바깥에서 주운 것(X 북마크)을 같은 그릇에 붓는다.
 *
 * 이 지도의 목적은 「내가 쓴 것」과 「바깥에서 주운 것」을 **한 지도에** 놓고
 * 겹치는 자리를 보는 것이다. 확장이 내려 준 파일을 여기서 읽어 합친다.
 *
 * 파일 자리 = 소스 정의의 `xBookmarks` (없으면 그냥 지나간다)
 * 갈래 이름 = 「북마크」 — 갈래가 다르면 모양이 달라지므로 지도에서 바로 갈린다.
 */
function collectBookmarks(file) {
  if (!file || !fs.existsSync(file)) return [];
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
  const items = raw.items || [];
  const docs = [];
  for (const it of items) {
    const text = `${it.text || ''}`.replace(/\s+/g, ' ').trim();
    /* 글이 너무 짧으면 뜻을 못 잰다 — 링크만 있는 것은 안 넣는다(펼치기가 채워 줄 때까지). */
    if (text.length < 30) continue;
    docs.push({
      id: `bookmark/${it.id}`,
      lane: '북마크',
      title: text.slice(0, 60),
      status: '',
      done: false,
      bytes: text.length,
      text,
      /* 그림 주소를 들고 다닌다 — 북마크 갈래에선 점 대신 썸네일을 쓸 수 있다. */
      image: (it.images && it.images[0]) || null,
      url: it.url || null,
      hash: crypto.createHash('sha1').update(text).digest('hex').slice(0, 12),
    });
  }
  if (docs.length) console.log(`[atlas] 바깥에서 주운 것 ${docs.length}개를 같이 붓는다`);
  return docs;
}

/** 소스마다 제 북마크 파일을 붓는다 — 자리는 소스 정의가 안다. */
function collectBookmarksAll() {
  return SOURCES.flatMap((src) => (src.xBookmarks ? collectBookmarks(path.join(src.root, src.xBookmarks)) : []));
}

/**
 * **블로그 글도 같은 판에 놓는다** (사용자 요청, 2026-08-21).
 *
 * 지금까지 지도는 memo(비공개)만 담았다. 그런데 같은 사람이 쓴 글이 **공개(블로그)** 쪽에도
 * 있다 — 「쓴 글 ↔ 메모 ↔ 주운 것」이 한 판에 놓여야 「이건 이미 썼네」가 보인다.
 *
 * 초안(`-DRAFT.md`)도 담는다. 초안과 발행 글은 **거의 같은 글**이라 지도에서 쌍둥이가 되는데,
 * 그건 숨길 게 아니라 **겹치는 글 표시**가 잡아야 할 바로 그 경우다.
 *
 * ⚠ 공개/비공개가 한 판에 놓여도 **나가는 파일에는 아무것도 안 실린다** — 지도 자료는
 * `.gitignore` 이고 커밋되는 건 지어낸 가짜뿐이다(`audit-private-origin` 이 지킨다).
 */
function collectBlog() {
  /* 글 정본이 옮겨 다녔다: Chirpy `apps/blog/_posts` → cutover 후 `content/{posts,drafts}`.
     옛 자리는 사라졌는데 여기가 그대로면 **블로그 갈래가 조용히 0편**이 된다 — 실제로 그랬다. */
  const roots = [path.join(KARMOLAB, 'content', 'posts'), path.join(KARMOLAB, 'content', 'drafts')]
    .filter((r) => fs.existsSync(r));
  const docs = [];
  for (const { root, file } of roots.flatMap((r) => walk(r).map((f) => ({ root: r, file: f })))) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const text = gist(raw);
    if (text.length < 40) continue;
    const rel = path.relative(root, file).split(path.sep).join('/');
    const meta = frontmatter(raw);
    /* **블로그는 생일을 스스로 안다** — 파일 이름의 날짜(또는 앞머리의 `date:`).
       memo 는 git 이 생일을 알려 주는데(저장소가 2026-04 에 생겨 넉 달치뿐),
       블로그는 몇 해치가 앞머리에 적혀 있다. 그걸 안 쓰면 시간 축이 넉 달로 쪼그라든다. */
    /* 달이 00 인 파일이 있다(`2000-00-00-…`) — 그건 「모른다」는 뜻이지 서기 2000년 0월이 아니다.
       01~12 만 생일로 친다(안 걸렀더니 시간 축 맨 앞에 유령 달 둘이 섰다). */
    const dated = /(\d{4})-(0[1-9]|1[0-2])-\d{2}/.exec(rel) || /(\d{4})-(0[1-9]|1[0-2])-\d{2}/.exec(String(meta.date || ''));
    docs.push({
      id: `blog/${path.basename(root)}/${rel}`,
      born: dated ? `${dated[1]}-${dated[2]}` : null,
      lane: '블로그',
      title: meta.title ? String(meta.title).replace(/^["']|["']$/g, '') : title(raw, file),
      status: path.basename(root) === 'drafts' || /DRAFT/i.test(rel) ? 'draft' : '',
      done: false,
      bytes: raw.length,
      text,
      hash: crypto.createHash('sha1').update(text).digest('hex').slice(0, 12),
      /* **사람이 손으로 붙인 분류** — 앞머리의 `categories: [컴퓨터, 프로그래밍]`.
         우리 자는 전부 안쪽 잣대(자기 자신에게만 물어본다)라, 이게 유일한 **바깥 라벨**이다.
         첫 칸만 쓴다 — 둘째 칸까지 쓰면 갈래가 수십 개로 흩어져 견줄 수가 없다. */
      tag: (() => {
        const raw2 = String(meta.categories || '').replace(/^\[|\]$/g, '').trim();
        if (!raw2) return null;
        const first = raw2.split(',')[0].trim().replace(/^["']|["']$/g, '');
        return first || null;
      })(),
    });
  }
  if (docs.length) {
    const draft = docs.filter((d) => d.status === 'draft').length;
    console.log(`[atlas] 블로그 글 ${docs.length}개를 같이 붓는다 (초안 ${draft}개 포함)`);
  }
  return docs;
}

function collect() {
  const docs = [];
  for (const src of SOURCES) {
    if (!fs.existsSync(src.root)) continue;         // requireSources 가 이미 판정 — 여기 오면 optional
    let n = 0;
    /* 화이트리스트가 아니라 **자동 발견 − 제외** — 소스 안에 폴더가 새로 생기면 저절로 든다. */
    const tops = fs.readdirSync(src.root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !src.exclude.includes(e.name))
      .map((e) => e.name)
      .sort();
    for (const top of tops) {
      for (const file of walk(path.join(src.root, top), 0, src.exts)) {
        const raw = fs.readFileSync(file, 'utf8');
        const rel = path.relative(src.root, file).split(path.sep).join('/');
        const meta = frontmatter(raw);
        const text = gist(raw);
        if (text.length < 40) continue;             // 껍데기는 지도에 안 올린다
        const seg = rel.split('/');
        const lane = src.laneBy === 'name' ? src.name
          : (src.laneAlias[`${seg[0]}/${seg[1]}`] || src.laneAlias[seg[0]] || seg[0]);
        docs.push({
          id: `${src.prefix}${rel}`,
          lane,
          title: title(raw, file),
          status: meta.status || '',
          done: /\/done\//.test(rel) || meta.status === 'done' || meta.status === 'sealed',
          bytes: raw.length,
          text,
          hash: crypto.createHash('sha1').update(text).digest('hex').slice(0, 12),
        });
        n += 1;
      }
    }
    /* 소스를 적어 놓고 0편이면 그건 「글이 없다」가 아니라 **정의가 낡았다**는 신호다. */
    if (!n && !src.optional) throw new Error(`소스 ${src.name}(${src.root})에서 글 0편 — 제외 목록이 다 먹었거나 구조가 바뀌었다.`);
    console.log(`[atlas] 소스 ${src.name} — 글 ${n}편 (갈래 후보 ${tops.length}개)`);
  }
  docs.push(...collectBlog());
  return docs;
}

// ── 임베딩 (뜻을 숫자로) ───────────────────────────────────────────────
// 두 층이다.
//   아래층 = 이 기계에서 도는 작은 모델. 열쇠도 돈도 하루치도 없다. **기본값.**
//   위층   = 바깥 API. 더 크고 좋지만 무료 등급 하루치에 걸린다 (--api 로만 쓴다).
// 아래층이 생기기 전에는 1516개 중 195개만 자리를 잡았다. 반쪽 지도는 지도가 아니다.
//
// 작은 모델은 한 번에 긴 글을 못 삼킨다(256 토막 남짓). 그래서 글을 토막 내
// 각각 재고 평균을 낸다 — 글 전체의 뜻이 한 점으로 모인다.

/* 뜻 재는 모델은 **다국어**여야 한다. 처음에 쓴 영어 전용 모델은 한국어에서 뜻을
   전혀 못 갈랐다 — 실측: 완전 무관한 쌍 0.594 가 같은 뜻 쌍 0.592 보다 높고,
   제일 높은 건 낱말만 겹치고 뜻은 다른 쌍(0.642)이었다. 글자를 보고 있었던 것이다.
   (그때 「고양이↔고양이 0.94」로 확인했다고 적었는데, 그건 낱말이 그대로 겹쳐 나온
   값이라 글자만 보는 모델도 통과하는 시험이었다.)
   이 모델로 같은 문장을 다시 재면 순서가 바로잡힌다:
     같은 뜻 0.556 > 낱말만 겹침 0.347 > 완전 무관 0.338 · 한↔영 같은 뜻 0.117 → 0.467 */
/* **2026-08-21 e5-small 로 갈아타려다 되돌렸다.** 우리 자료로 견줘 보고 정했다
   (바깥 벤치 점수로 정하지 않았다 — 저 벤치는 우리 글이 아니다).
   글 1520개를 통째로 다시 구워 우리 자 넷을 견준 결과:
     닮은 글    15.1배 → **63.7배**  (크게 좋아짐 — 손으로 링크 걸어 둔 짝을 훨씬 잘 찾는다)
     뜻 순서    같은 뜻 > 낱말만 겹침 이 **바로 섬**(0.932 > 0.928 > 0.893, 다만 차이가 얇다)
     정직도     안 놓침 0.886 → **0.735**  (나빠짐 — 그 공간은 2차원으로 접기가 더 어렵다)
     만나는 자리 844곳 → **680곳**, 한 갈래뿐인 자리 470 → **605**  (나빠짐)
   **둘 좋아지고 둘 나빠졌다.** 「넷 중 셋 이상」을 결과 보기 전에 박아 뒀으므로 안 갈아탄다.
   지도의 값어치가 「갈래가 만나는 자리」와 「그림이 거짓말 안 하기」에 걸려 있어 더 그렇다.
   ⚠ 그래도 남은 사실: **이 모델은 동음이의를 못 가른다**(낱말만 겹침 0.624 > 같은 뜻 0.537).
   e5-small 은 그걸 바로 세우니, 언젠가 그게 더 아파지면 그때 다시 꺼낸다.
   ⚠ E5 계열을 다시 시험하면 **앞말(passage:)** 을 반드시 붙여라 — 안 붙이면 순서가 도로 뒤집혔다. */
/* ★ **뜻 재기는 이제 KarmoMeaning 이 한다** (`@karmo/meaning`) — 이 스크립트 안에 갇혀 있으면
   북마크 분류·글 추천 같은 다음 쓰임이 같은 코드를 또 짓는다. 여기 남는 것은 **지도 고유**의
   일뿐이다: 무엇을 모으고(collect) 어떻게 그리나(layout). 모델·토막·곳간 열쇠 규칙은 꾸러미 정본. */
const LOCAL_MODEL = MEANING_MODEL;

/* 재는 연장은 **여기서 건넨다** — 꾸러미는 `file:` 링크 너머라 이 앱의 `node_modules` 를 못 본다. */
const loadRunner = () => import('@huggingface/transformers');
const onModelLoad = () => console.log('[atlas] 이 기계에서 도는 모델을 준비한다 (처음 한 번은 내려받는다)');

/** 자들이 꺼내 쓰는 입구 — 안은 꾸러미가 한다 (`audit-atlas-meaning` · `audit-atlas-twins`). */
async function embedLocal(texts) {
  return meaningEmbedTexts(texts, { onLoad: onModelLoad, loadRunner });
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; }
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/* 곳간엔 옛 모델 벡터가 같이 산다(열쇠에 모델이 들어 있다). 지도에 **누가 그렸는지**를
   안 적어 두면, 나중에 재는 쪽이 옛 벡터를 집어 들고 「안 맞는다」고 한다 — 실제로 그랬다. */
let usedTier = null;

async function embedAll(docs) {
  const useApi = flag('--api');
  const cache = loadCache();
  // 층이 다르면 벡터도 다르다. 섞으면 지도가 거짓말을 한다 — 열쇠에 층을 적어 둔다.
  /* 모델이 다르면 벡터도 다르다 — 열쇠에 모델을 넣어 섞이지 않게 한다.
     안 그러면 모델을 갈아도 옛 벡터를 그대로 재사용해 아무것도 안 바뀐다. */
  const tier = useApi ? 'api' : `local:${LOCAL_MODEL.split('/').pop()}`;
  usedTier = tier;   // **어느 모델이 이 지도를 그렸나** — 지도에 적어 보낸다(자가 다시 잰다)
  const keyOf = (d) => `${tier}:${d.hash}`;

  const todo = docs.filter((d) => !cache[keyOf(d)]);
  console.log(`[atlas] 임베딩 필요 ${todo.length} / ${docs.length} (${tier} · 나머지는 지난 것 재사용)`);
  if (!todo.length) return docs.map((d) => cache[keyOf(d)] || null);

  if (!useApi) {
    /* 재는 일은 **KarmoMeaning** 이 한다. 여기 남는 것은 지도 쪽 사정뿐 —
       무엇을 먹일까(제목 + 몸통)와 곳간 파일을 어디에 쓰나. */
    const t0 = Date.now();
    const out = await meaningEmbedAll(
      docs.map((d) => ({ id: d.id, hash: d.hash, text: `${d.title}\n\n${d.text}` })),
      {
        cache,
        loadRunner,
        onLoad: onModelLoad,
        onProgress: (done, all) => console.log(`[atlas]   ${done}/${all}`),
        onFlush: (c) => fs.writeFileSync(CACHE, JSON.stringify(c)),
      },
    );
    console.log(`[atlas] 이 기계에서 ${out.todo}개 재는 데 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
    return out.vectors;
  }

  const { generateEmbedding } = await import('@karmo/ai/node');
  let done = 0;
  let quotaHits = 0;
  const CONCURRENCY = 4;
  /* 하루치를 다 쓰면 남은 것을 계속 때려도 전부 같은 소리만 돌아온다.
     연달아 막히면 멈추고, 지금까지 받은 것만 가지고 지도를 그린다. */
  const QUOTA_GIVEUP = 12;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const slice = todo.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(async (d) => {
      try {
        cache[keyOf(d)] = await generateEmbedding(process.env, `${d.title}\n\n${d.text}`);
        quotaHits = 0;
      } catch (e) {
        const quota = /quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(e.message || '');
        if (quota) quotaHits += 1;
        else console.warn(`[atlas] 임베딩 실패 ${d.id}: ${e.message}`);
      }
    }));
    done += slice.length;
    if (quotaHits >= QUOTA_GIVEUP) {
      console.warn(`[atlas] 하루치를 다 쓴 것 같다 — 여기서 멈춘다 (${done}/${todo.length} 시도).`);
      console.warn('[atlas] 열쇠 없이 도는 쪽을 쓰려면 --api 를 빼고 다시 돌려라.');
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      break;
    }
    if (done % 40 < CONCURRENCY) {
      console.log(`[atlas]   ${done}/${todo.length}`);
      fs.writeFileSync(CACHE, JSON.stringify(cache));
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  return docs.map((d) => cache[keyOf(d)] || null);
}


/**
 * 모두가 공유하는 쏠림을 빼낸다 (평균 빼기 + 다시 정규화).
 *
 * 왜: 뜻이 아니라 **글 길이**로 뭉치고 있었다. 실측 — 벡터가 거의 다 한 방향으로
 * 쏠려 있고(평균 벡터 길이 0.832), 그 쏠림이 글 길이와 상관 0.526.
 * 그래서 짧은 북마크가 서로 완전 다른 주제인데도 한 덩어리가 됐다.
 *
 * 빼면 쏠림은 거의 사라진다(0.832 → 0.037). **다만 절반만 푼다** —
 * 짧은 글끼리 더 닮는 성질이 완전히 없어지진 않는다. 그래서 넣고 끝내지 않고
 * 자 셋(정직도·출신 쏠림·뜻 순서)으로 전후를 잰다. `--no-center` 로 끌 수 있다.
 */
/* **지도는 제 공간을 들고 다닌다.** 뺀 평균을 산출물에 실어야, 나중에 새로 잰 벡터를
   같은 자리로 옮겨 견줄 수 있다 — 안 실었더니 자가 원 벡터로 재고 문턱은 뺀 공간 것이라
   서로 다른 공간을 견주고 있었다(2026-08-23, twins 오탐 2쌍의 진짜 원인). */
let biasMean = null;
function removeSharedBias(vectors) {
  const got = meaningRemoveBias(vectors);
  if (!got.applied) return got.vectors;
  biasMean = got.mean;
  console.log(`[atlas] 모두가 공유하던 쏠림을 뺐다 (평균 벡터 길이 ${got.before.toFixed(3)} → 0 쪽으로)`);
  return got.vectors;
}

// ── 자리 잡기 ──────────────────────────────────────────────────────────
// PCA 2축. 무거운 라이브러리 없이 멱반복(power iteration)으로 주축 둘을 뽑는다.
function pca2(vectors) {
  const n = vectors.length;
  const dim = vectors[0].length;
  const mean = new Float64Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i += 1) mean[i] += v[i];
  for (let i = 0; i < dim; i += 1) mean[i] /= n;
  const X = vectors.map((v) => Float64Array.from(v, (x, i) => x - mean[i]));

  const axis = (exclude) => {
    let a = Float64Array.from({ length: dim }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
    for (let iter = 0; iter < 40; iter += 1) {
      const next = new Float64Array(dim);
      for (const x of X) {
        let dot = 0;
        for (let i = 0; i < dim; i += 1) dot += x[i] * a[i];
        for (let i = 0; i < dim; i += 1) next[i] += dot * x[i];
      }
      if (exclude) {           // 첫 축 성분을 빼서 직교하게 만든다
        let dot = 0;
        for (let i = 0; i < dim; i += 1) dot += next[i] * exclude[i];
        for (let i = 0; i < dim; i += 1) next[i] -= dot * exclude[i];
      }
      let norm = 0;
      for (let i = 0; i < dim; i += 1) norm += next[i] * next[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < dim; i += 1) next[i] /= norm;
      a = next;
    }
    return a;
  };

  const a1 = axis(null);
  const a2 = axis(a1);
  return X.map((x) => {
    let p = 0; let q = 0;
    for (let i = 0; i < dim; i += 1) { p += x[i] * a1[i]; q += x[i] * a2[i]; }
    return [p, q];
  });
}

/**
 * UMAP 2축. 우리 벡터 1510개로 재 봤을 때 덩어리가 PCA 보다 또렷했다
 * (뭉침도 0.360 vs 0.436 — 작을수록 또렷). PCA 는 384축을 둘로 눌러
 * 대부분을 가운데로 뭉갠다. 굽는 때 한 번 3초면 된다.
 *
 * 씨앗을 고정한다 — 안 그러면 같은 글인데 열 때마다 지도가 달라져서
 * 「어제 여기 있던 게 어디 갔나」가 된다.
 */
/**
 * **믿을 만함·안 놓침** — 자리 잡기가 이웃을 지키나 (trustworthiness · continuity).
 *
 * 손잡이를 고르려면 잣대가 있어야 한다. 이미 자(audit-atlas-trust)가 쓰는 그 잣대를
 * 굽는 자리에서도 쓴다: 뜻자리(고차원)의 이웃 k명과 화면 이웃 k명을 견줘,
 * **화면에서만 이웃인 것**(믿을 만함)과 **뜻에서 이웃인데 화면에서 멀어진 것**(안 놓침)을 벌한다.
 */
function trustCont(vecs, pts, k = 10) {
  const n = vecs.length;
  const dim = vecs[0].length;
  const nearOf = (dist) => {
    const idx = Array.from({ length: n }, (_, i) => i);
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const d = idx.filter((j) => j !== i).map((j) => [dist(i, j), j]).sort((a, b) => a[0] - b[0]);
      out.push(d.map(([, j]) => j));
    }
    return out;
  };
  const hi = nearOf((i, j) => {
    let s = 0;
    for (let t = 0; t < dim; t += 1) { const d = vecs[i][t] - vecs[j][t]; s += d * d; }
    return s;
  });
  const lo = nearOf((i, j) => (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2);
  const rankIn = (list, target) => list.indexOf(target) + 1;
  let tSum = 0; let cSum = 0;
  for (let i = 0; i < n; i += 1) {
    const hiK = new Set(hi[i].slice(0, k));
    const loK = new Set(lo[i].slice(0, k));
    for (const j of loK) if (!hiK.has(j)) tSum += rankIn(hi[i], j) - k;
    for (const j of hiK) if (!loK.has(j)) cSum += rankIn(lo[i], j) - k;
  }
  const norm = 2 / (n * k * (2 * n - 3 * k - 1));
  return { trust: 1 - norm * tSum, cont: 1 - norm * cSum };
}

/**
 * **UMAP 손잡이도 쓸어서 고른다** (TASK-KAR-233).
 *
 * 정본 문서가 못 박는다: n_neighbors 는 국소↔전역, min_dist 는 뭉침↔퍼짐을 맞바꾼다.
 * 그리고 **어떤 값도 「맞는 값」이 아니다** — 여러 값에서 살아남는 구조가 믿을 만한 것이다.
 * 우리는 30·0.3 을 손으로 박아 두고 있었다(뼈대 렌즈·손잡이는 쓸어서 골랐으면서).
 *
 * 잣대는 새로 만들지 않는다 — 이미 쓰는 **믿을 만함·안 놓침**. 표본으로 쓸고(전수로 16번
 * 돌리면 굽기가 몇 배가 된다) 고른 자리만 전수로 돌린다. 표는 통째로 실어 보낸다.
 */
const UMAP_NN = [10, 20, 30, 50];
const UMAP_MD = [0, 0.1, 0.3, 0.5];
const UMAP_SAMPLE = 500;

/**
 * **중간거리 짝을 쓰는 자리 잡기** (TASK-KAR-233 · PaCMAP, Wang·Huang·Rudin·Shaposhnik JMLR 2021).
 *
 * 우리 자리 잡기는 **가까운 것만** 본다(UMAP 이웃·최소거리를 쓸 뿐). PaCMAP 의 진단:
 * 힘을 한 눈금으로만 걸면 **안쪽 구조 아니면 전체 모양 중 하나를 잃는다.** 처방은 짝을
 * 세 종류로 나누는 것 — **이웃 짝**(가까운 것) · **중간거리 짝** · **먼 짝** — 을 다르게
 * 당기고 밀되, **중간거리 무게를 처음엔 크게 줬다가 점점 줄인다**.
 *
 * 여기 옮긴 것: 첫 자리는 **PCA**, 이웃 k=10 · 중간거리 k×0.5 · 먼 짝 k×2,
 * 손실은 정본 꼴(`d̃ = 1+‖yi−yj‖²`): 이웃 `d̃/(10+d̃)` · 중간거리 `d̃/(10000+d̃)` · 먼 짝 `1/(1+d̃)`,
 * 무게는 세 단계로 바꾼다(초반 중간거리 1000→3 · 중반 3 · 후반 0).
 *
 * ★ **넣는다고 쓰는 게 아니다** — 지금 쓰는 잣대(믿을 만함+안 놓침 · 화면 채움)로 견줘
 * **이기면만 쓴다**(이름 MMR 때와 같은 규율).
 */
function pacmap2(vectors, opts = {}) {
  const n = vectors.length;
  const dim = vectors[0].length;
  const K = Math.min(opts.k || 10, n - 1);
  const nMN = Math.max(1, Math.round(K * 0.5));
  const nFP = Math.max(1, Math.round(K * 2));
  const iters = opts.iters || 450;
  let seed = opts.seed || 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const d2 = (a, b) => { let t = 0; for (let i = 0; i < dim; i += 1) { const q = vectors[a][i] - vectors[b][i]; t += q * q; } return t; };

  /* 이웃 짝 — 가장 가까운 K개. */
  const nb = [];
  for (let i = 0; i < n; i += 1) {
    const row = [];
    for (let j = 0; j < n; j += 1) if (j !== i) row.push([d2(i, j), j]);
    row.sort((a, b) => a[0] - b[0]);
    for (let t = 0; t < K; t += 1) nb.push([i, row[t][1]]);
  }
  /* 중간거리 짝 — 아무나 여섯을 뽑아 **둘째로 가까운 것**을 쓴다(정본 방식). */
  const mn = [];
  for (let i = 0; i < n; i += 1) {
    for (let t = 0; t < nMN; t += 1) {
      const pick = [];
      for (let q = 0; q < 6; q += 1) { const j = Math.floor(rnd() * n); if (j !== i) pick.push([d2(i, j), j]); }
      if (pick.length < 2) continue;
      pick.sort((a, b) => a[0] - b[0]);
      mn.push([i, pick[1][1]]);
    }
  }
  /* 먼 짝 — 아무나. */
  const fp = [];
  for (let i = 0; i < n; i += 1) {
    for (let t = 0; t < nFP; t += 1) { const j = Math.floor(rnd() * n); if (j !== i) fp.push([i, j]); }
  }

  /* 첫 자리 = PCA (정본이 「첫 자리가 결과를 크게 좌우한다」고 못 박는다). */
  const Y = pca2(vectors).map((p) => [p[0] * 0.01, p[1] * 0.01]);
  const grad = new Float64Array(n * 2);
  const m = new Float64Array(n * 2);
  const v = new Float64Array(n * 2);
  const lr = opts.lr || 1.0;
  const push = (i, j, coef) => {
    const dx = Y[i][0] - Y[j][0]; const dy = Y[i][1] - Y[j][1];
    grad[i * 2] += coef * dx; grad[i * 2 + 1] += coef * dy;
    grad[j * 2] -= coef * dx; grad[j * 2 + 1] -= coef * dy;
  };
  for (let it = 0; it < iters; it += 1) {
    /* 세 단계 무게 — 중간거리를 크게 시작해 0 으로 뺀다. */
    let wNB; let wMN; let wFP;
    if (it < 100) { wNB = 2; wMN = 1000 * (1 - it / 100) + 3 * (it / 100); wFP = 1; }
    else if (it < 200) { wNB = 3; wMN = 3; wFP = 1; }
    else { wNB = 1; wMN = 0; wFP = 1; }
    grad.fill(0);
    for (const [i, j] of nb) {
      const dx = Y[i][0] - Y[j][0]; const dy = Y[i][1] - Y[j][1];
      const dd = 1 + dx * dx + dy * dy;
      push(i, j, wNB * (20 / ((10 + dd) * (10 + dd))));
    }
    if (wMN > 0) {
      for (const [i, j] of mn) {
        const dx = Y[i][0] - Y[j][0]; const dy = Y[i][1] - Y[j][1];
        const dd = 1 + dx * dx + dy * dy;
        push(i, j, wMN * (20000 / ((10000 + dd) * (10000 + dd))));
      }
    }
    for (const [i, j] of fp) {
      const dx = Y[i][0] - Y[j][0]; const dy = Y[i][1] - Y[j][1];
      const dd = 1 + dx * dx + dy * dy;
      push(i, j, -wFP * (2 / ((1 + dd) * (1 + dd))));
    }
    /* Adam — 손으로 걸음을 정하면 손잡이가 또 하나 는다. */
    const b1 = 0.9; const b2 = 0.999; const eps = 1e-7;
    const c1 = 1 - Math.pow(b1, it + 1); const c2 = 1 - Math.pow(b2, it + 1);
    for (let t = 0; t < n * 2; t += 1) {
      m[t] = b1 * m[t] + (1 - b1) * grad[t];
      v[t] = b2 * v[t] + (1 - b2) * grad[t] * grad[t];
      const step = lr * (m[t] / c1) / (Math.sqrt(v[t] / c2) + eps);
      if (t % 2 === 0) Y[t >> 1][0] -= step; else Y[t >> 1][1] -= step;
    }
  }
  return Y;
}

async function pickUmapParams(vectors) {
  const { UMAP } = await import('umap-js');
  const step = Math.max(1, Math.floor(vectors.length / UMAP_SAMPLE));
  const sample = vectors.filter((_, i) => i % step === 0).slice(0, UMAP_SAMPLE);
  if (sample.length < 100) return null;
  const table = [];
  let best = null;
  for (const nn of UMAP_NN) {
    for (const md of UMAP_MD) {
      let seed = 42;
      const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const pts = new UMAP({ nComponents: 2, nNeighbors: Math.min(nn, sample.length - 1), minDist: md, random }).fit(sample);
      const { trust, cont } = trustCont(sample, pts);
      /* **화면 채움율**도 잰다 — 이웃만 보고 고르면 한 귀퉁이에 뭉친 그림이 이긴다.
         예전에 손으로 30·0.3 을 고른 이유가 바로 이거였다(채움 0.161 → 0.383).
         24×24 칸 중 점이 든 칸의 비율. */
      const SIDE = 24;
      const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
      const x0 = Math.min(...xs); const x1 = Math.max(...xs);
      const y0 = Math.min(...ys); const y1 = Math.max(...ys);
      const cells = new Set();
      for (const [x, y] of pts) {
        const i = Math.min(SIDE - 1, Math.floor(((x - x0) / ((x1 - x0) || 1)) * SIDE));
        const j = Math.min(SIDE - 1, Math.floor(((y - y0) / ((y1 - y0) || 1)) * SIDE));
        cells.add(j * SIDE + i);
      }
      const fill = cells.size / (SIDE * SIDE);
      table.push({ nn, md, trust: Number(trust.toFixed(4)), cont: Number(cont.toFixed(4)), fill: Number(fill.toFixed(3)) });
      /* 셈은 아래에서 표를 다 모은 뒤에 한다 — 채움율은 서로 견줘야 뜻이 생긴다. */
    }
  }
  /* **이웃을 지키되 화면을 안 버리는 자리.** 이웃(믿을 만함+안 놓침)만 보면 가장 국소적인
     자리(이웃 10·최소거리 0)가 이기는데, 그건 뭉쳐서 화면을 버리는 쪽이다. 그래서
     채움율이 **가장 넓은 자리의 80% 이상**인 것들만 후보로 두고 그중 이웃이 가장 잘
     지켜지는 자리를 고른다. 문턱 0.8 은 임의값이라 표를 통째로 실어 다시 볼 수 있게 한다. */
  /* **중간거리 짝 방식도 같은 표본·같은 잣대로 견준다** — 이기면만 쓴다. */
  try {
    const t0 = Date.now();
    const pts = pacmap2(sample, { seed: 7 });
    const { trust, cont } = trustCont(sample, pts);
    const SIDE = 24;
    const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs);
    const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const cells = new Set();
    for (const [x, y] of pts) {
      const i = Math.min(SIDE - 1, Math.floor(((x - x0) / ((x1 - x0) || 1)) * SIDE));
      const j = Math.min(SIDE - 1, Math.floor(((y - y0) / ((y1 - y0) || 1)) * SIDE));
      cells.add(j * SIDE + i);
    }
    table.push({ way: '중간거리', nn: 10, md: null, trust: Number(trust.toFixed(4)),
      cont: Number(cont.toFixed(4)), fill: Number((cells.size / (SIDE * SIDE)).toFixed(3)) });
    console.log(`[atlas] 중간거리 짝 방식도 재 봤다 — 믿을 만함 ${trust.toFixed(4)} · 안 놓침 ${cont.toFixed(4)}`
      + ` · 채움 ${(cells.size / (SIDE * SIDE)).toFixed(3)} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  } catch (e) {
    console.warn(`[atlas] 중간거리 짝 방식을 못 돌렸다: ${e.message}`);
  }
  const maxFill = Math.max(...table.map((t) => t.fill));
  const ok = table.filter((t) => t.fill >= maxFill * 0.8);
  const pickFrom = ok.length ? ok : table;
  const bestRow = pickFrom.reduce((a, b) => ((b.trust + b.cont) > (a.trust + a.cont) ? b : a), pickFrom[0]);
  best = { way: bestRow.way || 'UMAP', nn: bestRow.nn, md: bestRow.md, trust: bestRow.trust, cont: bestRow.cont, fill: bestRow.fill, score: bestRow.trust + bestRow.cont };
  best.table = table;
  console.log('[atlas] UMAP 손잡이 표 (이웃합/채움) — ' + table.map((t) => `${t.nn}/${t.md}:${(t.trust + t.cont).toFixed(3)}·${t.fill}`).join(' '));
  console.log(`[atlas] 고른 방식 「${best.way}」 — 이웃 ${best.nn} · 최소거리 ${best.md} (믿을 만함 ${best.trust.toFixed(3)} · 안 놓침 ${best.cont.toFixed(3)} · 채움 ${best.fill}) — 표본 ${sample.length}편, 채움이 최고의 80% 이상인 것 중에서`);
  return best;
}

/**
 * **이어야 할 둘 찾기 — 그리고 그게 맞는지 시간으로 잘라 확인하기**
 * (Swanson 의 ABC 모델 / literature-based discovery).
 *
 * 서로 인용하지 않는 두 문헌을 B 를 통해 잇는 것이 LBD 다. 우리 판으로 옮기면 자명하다 —
 * **뜻으로 가까운데 사람이 쓴 링크가 없는 쌍**이 「이어야 하는데 안 이은 것」이다.
 *
 * ⚠ 다만 이 분야의 **고질병 둘을 그대로 물려받는다**:
 *  · **후보 폭증** — 전문가가 손으로 골라야 할 만큼 많이 나온다. 순위 없이 「찾았다」는 무의미하다
 *  · **평가 불가** — 진짜 발견이면 정답이 아직 없다
 *
 * 그래서 평가를 **시간으로 자른다**(그 분야의 표준 우회): **최근에 쓰인 사람 링크를 숨기고**
 * 그 전 자료만으로 후보를 낸 뒤, **숨긴 링크가 후보 목록의 몇 등에 있었나**를 본다.
 * 잣대는 **P@k · MAP** — 「찾았다」가 아니라 「몇 등」이어야 한다.
 * 그리고 **후보 수를 반드시 함께 적는다.** 너무 많으면 그 자체가 결과다.
 */
const SUG_KS = [1, 5, 10, 50];
const SUG_MAX = 200;          // 한 글당 후보 상한 (순위표는 이 안에서 본다)

function linkSuggest(ok, dist, n, edges, okAt, seed = 1234) {
  const t0 = Date.now();
  /* 사람이 쓴 링크를 ok 번호 공간으로. 링크의 「때」 = 두 끝 중 **늦게 태어난 쪽**
     (링크는 늦은 글보다 먼저 있을 수 없다). */
  const born = ok.map((o) => o.d.born || null);
  const pairs = [];
  for (const [a, b] of edges) {
    const x = okAt.get(a); const y = okAt.get(b);
    if (x == null || y == null || x === y) continue;
    /* ★ 처음엔 **둘 다 달을 알아야** 때를 잡게 짰더니 거의 다 버려졌다(우리 글의 39%가
       달을 모른다). 링크는 늦은 글보다 먼저 있을 수 없으므로, **아는 쪽 중 가장 늦은 달**을
       쓰면 된다. 둘 다 모를 때만 버린다. */
    /* 링크를 **적은 글**의 달이 그 링크의 때다. 그걸 모르면 두 끝 중 아는 쪽으로 물러선다. */
    const w = edgeFrom.get(a < b ? `${a}:${b}` : `${b}:${a}`);
    const wy = w != null ? okAt.get(w) : null;
    const t = (wy != null && born[wy]) ? born[wy]
      : (born[x] && born[y] ? (born[x] > born[y] ? born[x] : born[y]) : (born[x] || born[y] || null));
    pairs.push([x, y, t]);
  }
  const months = [...new Set(pairs.map((p) => p[2]).filter(Boolean))].sort();
  if (months.length < 2) return { skipped: `링크에 달이 거의 없다 (링크 ${pairs.length}개 · 달 ${months.length}가지 · 이음 원본 ${edges.length}개)`, pairs: pairs.length };
  /* 자르는 달 — 뒤에서부터 모아 링크의 20% 를 넘길 때까지가 「최근」. */
  const cnt = new Map();
  for (const p of pairs) if (p[2]) cnt.set(p[2], (cnt.get(p[2]) || 0) + 1);
  const dated = pairs.filter((p) => p[2]).length;
  const recent = new Set();
  let acc = 0;
  for (let t = months.length - 1; t >= 0; t -= 1) {
    if (acc >= dated * 0.2) break;
    recent.add(months[t]);
    acc += cnt.get(months[t]) || 0;
  }
  const known = new Set();     // 자르기 **전**에 이미 이어져 있던 쌍
  const test = [];             // 숨긴 쌍
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const [x, y, t] of pairs) {
    if (t && recent.has(t)) test.push([x, y]);
    else known.add(key(x, y));
  }
  /* ★ 사전 문턱 (자와 같은 수 50) — 미달이면 재지 않고 「자료가 모자란다」로 적는다.
     작은 표본으로 낸 등수·MAP 은 소음이다. 코퍼스가 1918 → 749(링크 877 → 52)로 줄며 실제로 미달했다. */
  if (!(test.length > 50 && known.size > 50)) {
    return { tooFew: { pairs: pairs.length, test: test.length, known: known.size, need: 50 } };
  }

  /** 한 글의 후보 — 뜻으로 가까운 차례, 단 **이미 이어진 쌍은 뺀다**. */
  const candOf = (i, rank) => {
    const row = [];
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      if (known.has(key(i, j))) continue;      // 이미 이은 것은 「이어야 할 것」이 아니다
      row.push([j, rank(i, j)]);
    }
    row.sort((a, b) => a[1] - b[1]);
    return row.slice(0, SUG_MAX).map((q) => q[0]);
  };

  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

  const score = (rank) => {
    const at = SUG_KS.map(() => 0);
    let ap = 0; let tried = 0; let found = 0;
    for (const [x, y] of test) {
      const list = candOf(x, rank);
      const pos = list.indexOf(y);
      tried += 1;
      if (pos < 0) continue;
      found += 1;
      ap += 1 / (pos + 1);
      SUG_KS.forEach((k, i) => { if (pos < k) at[i] += 1; });
    }
    return {
      tried, found,
      p: SUG_KS.map((k, i) => ({ k, hit: at[i], rate: Number((tried ? at[i] / tried : 0).toFixed(4)) })),
      map: Number((tried ? ap / tried : 0).toFixed(4)),
    };
  };

  const real = score((i, j) => dist[i * n + j]);
  /* 대조군 ① 아무 순서 — 「몇 등」이 뜻을 가지려면 이게 바닥이어야 한다. */
  const rand = score(() => rnd());
  /**
   * 후보가 몇 개나 되나 — 「찾았다」가 아니라 **이만큼 중에 몇 등**이라고 말해야 한다.
   * ★ 처음엔 잘라 낸 뒤 길이를 셌더니 늘 상한(200)이 나왔다 — 그건 **내가 자른 수**지
   * 후보 수가 아니다. LBD 의 고질병이 「후보 폭증」인데 그걸 가리는 셈이었다. 안 자른 수를 센다.
   */
  let poolTotal = 0;
  const look = test.slice(0, 50);
  for (const [x] of look) {
    let c = 0;
    for (let j = 0; j < n; j += 1) if (j !== x && !known.has(key(x, j))) c += 1;
    poolTotal += c;
  }
  const pool = look.length ? Math.round(poolTotal / look.length) : 0;
  const pairsAll = Math.round((n * (n - 1)) / 2 - known.size);

  /**
   * **보정 — 「몇 등」을 「맞을 확률」로 바꾸고, 그 확률이 실제와 맞는지 잰다.**
   *
   * 추천 설명의 목표 일곱은 서로 어긋난다(Tintarev & Masthoff) — 특히 **설득력을 올리면
   * 효과가 떨어질 수 있다.** 효과는 「좋은 결정을 돕는가」이지 「수락률」이 아니다.
   * 사람 없이 그 정신을 지키는 길은 **「왜 가까운가」를 그럴듯하게 적는 게 아니라
   * 「얼마나 맞을 것 같은가」를 적고 그 수가 맞는지 재는 것**이다.
   *
   * ⚠ 확률을 **맞힐 자료로 만들고 같은 자료로 채점하면** 늘 잘 맞는다. 그래서 숨겨 둔
   * 링크를 **반으로 갈라** 한쪽으로 확률을 만들고 다른 쪽으로만 채점한다.
   * (후보 순위 자체는 이미 시간으로 잘려 있어 앞날이 안 샌다.)
   */
  const RANK_BINS = [1, 2, 4, 8, 16, 32, 64, 128, SUG_MAX];
  const binOf = (r) => { for (let i = 0; i < RANK_BINS.length; i += 1) if (r < RANK_BINS[i]) return i; return RANK_BINS.length - 1; };
  const half = [];
  for (let i = 0; i < test.length; i += 1) half.push(i % 2);
  const rows = [[], []];        // [맞히는 자료, 채점 자료] — 각 칸은 [등수칸, 정답]
  test.forEach(([x, y], i) => {
    const list = candOf(x, (a2, b2) => dist[a2 * n + b2]);
    const pos = list.indexOf(y);
    for (let r = 0; r < list.length; r += 1) rows[half[i]].push([binOf(r), list[r] === y ? 1 : 0]);
    void pos;
  });
  const rate = new Array(RANK_BINS.length).fill(0);
  {
    const hit = new Array(RANK_BINS.length).fill(0);
    const cnt2 = new Array(RANK_BINS.length).fill(0);
    for (const [b, y] of rows[0]) { cnt2[b] += 1; hit[b] += y; }
    for (let i = 0; i < rate.length; i += 1) rate[i] = cnt2[i] ? hit[i] / cnt2[i] : 0;
  }
  const baseRate = rows[0].length ? rows[0].reduce((a2, r) => a2 + r[1], 0) / rows[0].length : 0;
  /** 채점 — Brier 와 ECE(10칸). 늘 같은 확률을 부르는 예측기를 나란히. */
  const scoreProb = (fn) => {
    /**
     * ★ **칸을 등폭으로 나누면 안 된다.** 우리 확률은 전부 1% 밑이라 열 칸으로 나누면
     * 죄다 첫 칸에 들어가고, ECE 가 어떤 예측기든 0 에 붙어 **아무것도 안 가른다**
     * (실제로 우리 것과 「늘 같은 확률」이 똑같이 0.00007 로 나왔다).
     * 그래서 **같은 수만큼 담기게**(분위) 나눈다 — 보정 문헌의 표준 처방이다.
     */
    const N = rows[1].length || 1;
    const ps = rows[1].map(([b, y]) => [fn(b), y]);
    let brier = 0;
    for (const [p, y] of ps) brier += (p - y) ** 2;
    const sorted = ps.slice().sort((x, z) => x[0] - z[0]);
    const B = 10;
    let ece = 0;
    const curve = [];
    for (let k = 0; k < B; k += 1) {
      const lo = Math.floor((k * sorted.length) / B);
      const hi = Math.floor(((k + 1) * sorted.length) / B);
      if (hi <= lo) continue;
      let sp = 0; let sy = 0;
      for (let i = lo; i < hi; i += 1) { sp += sorted[i][0]; sy += sorted[i][1]; }
      const m = hi - lo;
      ece += (m / N) * Math.abs(sp / m - sy / m);
      curve.push({ n: m, said: Number((sp / m).toFixed(5)), was: Number((sy / m).toFixed(5)) });
    }
    return { brier: Number((brier / N).toFixed(6)), ece: Number(ece.toFixed(6)), n: N, curve };
  };
  const calib = {
    bins: RANK_BINS, rate: rate.map((v) => Number(v.toFixed(4))), baseRate: Number(baseRate.toFixed(5)),
    ours: scoreProb((b) => rate[b]),
    flat: scoreProb(() => baseRate),
  };
  calib.better = calib.ours.ece < calib.flat.ece && calib.ours.brier <= calib.flat.brier;

  return {
    calib,
    pairs: pairs.length, dated, months: months.length,
    cutMonths: [...recent].sort(), known: known.size, test: test.length,
    max: SUG_MAX, pool, pairsAll,
    real, rand,
    /* 판정 — 우연을 뚜렷이 넘어야 「이어야 할 둘」을 화면에 내놓는다. */
    useful: real.map > rand.map * 3 && real.p[1].rate > rand.p[1].rate * 3,
    ms: Date.now() - t0,
  };
}

/**
 * **새로 생긴 관심사가 있나 — 시간 축** (Hamilton 외 ACL 2016 / Dubossarsky 외 2017).
 *
 * 시기별 임베딩은 자연 정렬이 안 돼서 orthogonal Procrustes 로 맞춘 뒤 비교하는 게 정석이다.
 * ★ 그런데 **Dubossarsky 외가 시기를 섞은 대조군을 만들자 기존 연구의 변화량이 대부분
 * 사라지거나 크게 줄었다.** 그래서 여기서는 대조군을 먼저 세운다.
 *
 * ⚠ 우리 자료는 낱말이 아니라 **글**이라 「같은 것이 시기별로 어떻게 변했나」를 물을 수 없다
 * (글은 한 달에 한 번 태어난다). 물을 수 있는 것은 **「새 글이 어디에 떨어지나」** 다 —
 * 최근 글끼리 서로 뭉치면 새 관심사가 생긴 것이고, 옛 글 사이에 고루 흩어지면 아니다.
 *
 * ⚠ 그리고 **좌표로 재지 않는다.** 자리는 절반이 난수임을 이미 쟀다 — 좌표로 변화를 재면
 * 그 난수를 변화로 읽는다. 잰다면 **이웃 목록**으로 잰다(그 분야도 정렬 후 코사인보다
 * 이웃 Jaccard 가 낫다고 보고한다).
 *
 * ⚠ **달을 모르는 글이 39%다.** 그건 숨기지 않고 수로 적는다 — 모르는 것을 최근도 옛것도
 * 아닌 것으로 두면 「최근끼리 뭉친다」가 저절로 부풀 수 있다.
 */
const NOVEL_SHARE = 0.2;     // 「최근」으로 볼 비율 (달을 아는 글 중)
const NOVEL_K = 8;           // 이웃 몇을 보나

function noveltyOf(docs, seed = 606) {
  const t0 = Date.now();
  const n = docs.length;
  const born = docs.map((d) => d.born || null);
  const known = [];
  for (let i = 0; i < n; i += 1) if (born[i]) known.push(i);
  const months = [...new Set(known.map((i) => born[i]))].sort();
  /* 최근 = 뒤에서부터 달을 모아 「달을 아는 글」의 NOVEL_SHARE 를 넘길 때까지. */
  const cnt = new Map();
  for (const i of known) cnt.set(born[i], (cnt.get(born[i]) || 0) + 1);
  const recentMonths = new Set();
  let acc = 0;
  for (let t = months.length - 1; t >= 0; t -= 1) {
    if (acc >= known.length * NOVEL_SHARE) break;
    recentMonths.add(months[t]);
    acc += cnt.get(months[t]) || 0;
  }
  const isRecent = (m) => (m ? recentMonths.has(m) : false);

  /**
   * **뭉침** = 최근 글의 이웃 중 최근 글 비율 ÷ 최근 글이 원래 차지하는 비율.
   * 1 이면 고루 흩어진 것, 크면 최근끼리 뭉친 것.
   * ⚠ 이웃도 **달을 아는 글끼리만** 센다 — 모르는 글을 섞으면 비율의 분모가 흔들린다.
   */
  const lift = (bornAt) => {
    const rec = (i) => isRecent(bornAt[i]);
    let base = 0; let baseOf = 0;
    for (const i of known) { baseOf += 1; if (rec(i)) base += 1; }
    const share = baseOf ? base / baseOf : 0;
    let hit = 0; let seen = 0;
    for (const i of known) {
      if (!rec(i)) continue;
      for (const j of (docs[i].near || []).slice(0, NOVEL_K)) {
        if (j == null || j < 0 || j >= n || !bornAt[j]) continue;
        seen += 1;
        if (rec(j)) hit += 1;
      }
    }
    const got = seen ? hit / seen : 0;
    return { share: Number(share.toFixed(4)), near: Number(got.toFixed(4)), seen, lift: Number((got / Math.max(1e-9, share)).toFixed(3)) };
  };

  const real = lift(born);
  /* ★ **대조군** — 달을 글에 무작위로 다시 붙인다. 여기서도 뭉치면 측정이 헛돈다. */
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const shuffledBorn = born.slice();
  {
    const idx = known.slice();
    for (let i = idx.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const a = idx[i]; const b = idx[j];
      const t = shuffledBorn[a]; shuffledBorn[a] = shuffledBorn[b]; shuffledBorn[b] = t;
    }
  }
  const shuffled = lift(shuffledBorn);

  /* 어느 갈래가 최근에 몰리나 — 뭉침이 진짜일 때만 뜻이 있다. */
  const laneRec = new Map(); const laneAll = new Map();
  for (const i of known) {
    const L = docs[i].lane || '?';
    laneAll.set(L, (laneAll.get(L) || 0) + 1);
    if (isRecent(born[i])) laneRec.set(L, (laneRec.get(L) || 0) + 1);
  }
  const lanes = [...laneAll].map(([L, all]) => ({
    lane: L, all, recent: laneRec.get(L) || 0,
    lift: Number(((laneRec.get(L) || 0) / all / Math.max(1e-9, real.share)).toFixed(2)),
  })).sort((a, b) => b.lift - a.lift).slice(0, 5);

  return {
    months: months.length, known: known.length, unknown: n - known.length,
    recentMonths: [...recentMonths].sort(), k: NOVEL_K,
    real, shuffled, lanes,
    /* 판정 — 대조군을 뚜렷이 넘어야 「새 관심사」라 부른다. */
    clustered: real.lift > shuffled.lift * 1.3 && real.lift > 1.2,
    ms: Date.now() - t0,
  };
}

/**
 * **공유용 일반화 판 — 남에게 줘도 되는 판을 만들 수 있나** (k-익명성, Sweeney).
 *
 * 지난 바퀴에 쟀다: **제목을 가려도 80.3% 드러난다**(이웃만으로 갈래 맞히기, 우연 22%).
 * 이웃 목록을 아예 빼고 **좌표만 줘도 72.5%**. 즉 **억제(가리기)는 방어가 아니다.**
 *
 * k-익명성의 답은 **일반화**다 — 풀어 놓는 항목 하나가 최소 k명을 가리키게 만든다.
 * (앵커: 성별·나이·우편번호 셋만으로 미국인 87%가 유일 식별된다.)
 * 우리 판으로 옮기면: 개별 좌표·이웃 목록을 빼고 **격자 칸**만 준다. 칸이 말하는 것은
 * **글 수와 흔한 갈래**뿐이고, 글이 k개 미만인 칸은 **아예 뺀다.**
 *
 * ⚠ **사생활만 재고 값어치를 안 재면 「아무것도 안 내보내면 완벽」이 된다.** 그래서 k 를
 * 키우며 **두 곡선을 한 표에** 그린다 — 연결 공격 적중률 · 사람이 쓴 링크가 같은/이웃 칸에
 * 남는 비율. 둘 다 우연 수준을 나란히 적는다.
 */
/* k 를 **우연 수준에 닿을 때까지** 늘린다 — 「어느 k 로도 안 된다」를 어림이 아니라
   실측으로 말하려면 곡선이 바닥에 닿는 것을 봐야 한다. */
const SHARE_KS = [1, 2, 5, 10, 20, 50, 150, 500, 1500];
const SHARE_SIDES = [64, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];   // 굵은 격자부터 고른다

/** 좌표를 0~1 로. */
function unitPts(docs) {
  const pts = docs.map((d) => d.xy).filter(Boolean);
  let lo = [Infinity, Infinity]; let hi = [-Infinity, -Infinity];
  for (const p of pts) {
    lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1])];
    hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1])];
  }
  const w = Math.max(1e-9, hi[0] - lo[0]); const h = Math.max(1e-9, hi[1] - lo[1]);
  return docs.map((d) => (d.xy ? [(d.xy[0] - lo[0]) / w, (d.xy[1] - lo[1]) / h] : null));
}

/**
 * k 마다 **가장 촘촘한 격자**를 고른다 — 글의 90% 이상이 「k개 이상 든 칸」에 남는 것 중에서.
 * 격자 굵기를 손으로 안 고른다는 뜻이다.
 */
function pickGrid(u, n, k) {
  for (const side of SHARE_SIDES) {
    const cnt = new Map();
    for (let i = 0; i < n; i += 1) {
      if (!u[i]) continue;
      const c = Math.min(side - 1, Math.floor(u[i][0] * side)) * side
        + Math.min(side - 1, Math.floor(u[i][1] * side));
      cnt.set(c, (cnt.get(c) || 0) + 1);
    }
    let kept = 0;
    for (const [, v] of cnt) if (v >= k) kept += v;
    if (kept >= n * 0.9) return { side, kept, cells: [...cnt].filter(([, v]) => v >= k).length };
  }
  return { side: SHARE_SIDES[SHARE_SIDES.length - 1], kept: 0, cells: 0 };
}

function shareGrid(docs, seed = 909) {
  const t0 = Date.now();
  const n = docs.length;
  const u = unitPts(docs);
  const lane = docs.map((d) => d.lane || '?');
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  /* 지난 바퀴와 **같은 가림**을 쓴다 — 안 그러면 두 수를 못 견준다. */
  const masked = new Uint8Array(n);
  let maskN = 0;
  for (let i = 0; i < n; i += 1) if (rnd() < 0.15) { masked[i] = 1; maskN += 1; }
  /* 우연 수준 — 그냥 제일 흔한 갈래 찍기. */
  const tally = new Map();
  for (let i = 0; i < n; i += 1) if (!masked[i]) tally.set(lane[i], (tally.get(lane[i]) || 0) + 1);
  let top = null; let topN = 0;
  for (const [kk, v] of tally) if (v > topN) { topN = v; top = kk; }
  let common = 0;
  for (let i = 0; i < n; i += 1) if (masked[i] && lane[i] === top) common += 1;
  const chance = maskN ? common / maskN : 0;

  const rows = [];
  for (const k of SHARE_KS) {
    const g = pickGrid(u, n, k);
    /* k 가 글 수를 넘으면 어떤 격자도 못 선다 (칸 0) — 그 행은 잰 것이 아니라 0 을 적은 것이다.
       싣으면 「공격 0% < 우연」이라는 깨진 수가 표에 남는다. 표본이 1918 → 749 로 줄며 실제로 났다. */
    if (!g.cells) continue;
    const side = g.side;
    const cellOf = (i) => (u[i]
      ? Math.min(side - 1, Math.floor(u[i][0] * side)) * side + Math.min(side - 1, Math.floor(u[i][1] * side))
      : -1);
    const cnt = new Map();
    for (let i = 0; i < n; i += 1) { const c = cellOf(i); if (c >= 0) cnt.set(c, (cnt.get(c) || 0) + 1); }
    const alive = (c) => (cnt.get(c) || 0) >= k;
    /* 공격 — 가려진 글의 칸에서 **안 가려진 글들의 흔한 갈래**로 찍는다. */
    const vote = new Map();
    for (let i = 0; i < n; i += 1) {
      if (masked[i]) continue;
      const c = cellOf(i);
      if (c < 0 || !alive(c)) continue;
      if (!vote.has(c)) vote.set(c, new Map());
      const m = vote.get(c);
      m.set(lane[i], (m.get(lane[i]) || 0) + 1);
    }
    let hit = 0; let tried = 0;
    for (let i = 0; i < n; i += 1) {
      if (!masked[i]) continue;
      const c = cellOf(i);
      if (c < 0 || !alive(c) || !vote.has(c)) continue;      // 뺀 칸은 아무 말도 안 한다
      const m = vote.get(c);
      let best = null; let bn = 0;
      for (const [kk, v] of m) if (v > bn) { bn = v; best = kk; }
      tried += 1;
      if (best === lane[i]) hit += 1;
    }
    /* 값어치 — 이웃 목록 없이 칸만 보고도 「닮은 글이 곁에 있나」. 우연은 무작위 짝. */
    let near = 0; let nearOf = 0; let rand = 0;
    const sameOrAdj = (a, b) => {
      const ca = cellOf(a); const cb = cellOf(b);
      if (ca < 0 || cb < 0) return false;
      const ax = Math.floor(ca / side); const ay = ca % side;
      const bx = Math.floor(cb / side); const by = cb % side;
      return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
    };
    for (let i = 0; i < n; i += 1) {
      for (const j of (docs[i].near || []).slice(0, 4)) {
        if (j == null || j < 0 || j >= n) continue;
        nearOf += 1;
        if (alive(cellOf(i)) && alive(cellOf(j)) && sameOrAdj(i, j)) near += 1;
        const r = Math.floor(rnd() * n);
        if (alive(cellOf(i)) && alive(cellOf(r)) && sameOrAdj(i, r)) rand += 1;
      }
    }
    rows.push({
      k, side, cells: g.cells,
      keptDocs: Number((g.kept / n).toFixed(3)),
      guessed: tried,
      attack: Number((tried ? hit / tried : 0).toFixed(4)),
      keepNear: Number((nearOf ? near / nearOf : 0).toFixed(4)),
      randNear: Number((nearOf ? rand / nearOf : 0).toFixed(4)),
    });
  }
  /* **고를 만한 k** — 공격이 우연 수준에 닿으면서 값어치가 우연보다 뚜렷이 남는 가장 작은 k. */
  const ok = rows.find((r) => r.attack <= chance * 1.15 && r.keepNear > r.randNear * 3);
  return {
    chance: Number(chance.toFixed(4)), masked: maskN, ks: SHARE_KS, rows,
    pick: ok ? ok.k : null, usable: !!ok,
    ms: Date.now() - t0,
  };
}

/**
 * **공개 위험 — 제목을 가려도 이웃이 말해 준다** (Morris 외 EMNLP 2023 / arXiv 2507.07700).
 *
 * 임베딩 역변환은 32토큰 입력의 **92%** 를 그대로 복원한다(BLEU 97.3). 재현 연구가 못 박은
 * 대목: **짝거리·저차원 투영 같은 파생 정보도 역변환에 취약하다.** 우리 산출물이 정확히
 * 그 파생 정보다 — 좌표 + 문서마다 이웃 여덟 + 덩어리 이름.
 *
 * 지도 파일은 공개 레포에 안 담긴다(gitignore + 비공개 출신 자). 하지만 **다른 기계에서
 * 보려고 옮기는 순간** 그 파생 정보가 함께 나간다. 계약에 privacy gate 를 걸어 두고도
 * **「무엇이 새는가」는 한 번도 안 쟀다.**
 *
 * 그래서 **연결 공격을 시늉한다**: 글 일부의 제목을 가리고, **가리지 않은 이웃들의 갈래**
 * 만으로 가려진 글의 갈래를 맞혀 본다. 잘 맞으면 「가려도 소용없다」는 뜻이다.
 *
 * ⚠ 우연 수준을 **두 겹**으로 깐다 — (가) 그냥 제일 흔한 갈래를 찍기 (나) 이웃 목록을
 * 마구 섞기. 뒤엣것이 우연 수준으로 안 떨어지면 이 잣대가 헛도는 것이다.
 */
const LEAK_MASK = 0.15;      // 가릴 비율
const LEAK_K = 8;            // 이웃 몇을 보고 맞히나 (우리가 싣는 수와 같게)

function leakOf(docs, seed = 4615) {
  const t0 = Date.now();
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const n = docs.length;
  const lane = docs.map((d) => d.lane || '?');
  const masked = new Uint8Array(n);
  let maskN = 0;
  for (let i = 0; i < n; i += 1) if (rnd() < LEAK_MASK) { masked[i] = 1; maskN += 1; }

  /* (가) 그냥 제일 흔한 갈래를 찍는 우연 수준. */
  const tally = new Map();
  for (let i = 0; i < n; i += 1) if (!masked[i]) tally.set(lane[i], (tally.get(lane[i]) || 0) + 1);
  let top = null; let topN = 0;
  for (const [k, v] of tally) if (v > topN) { topN = v; top = k; }
  let common = 0;
  for (let i = 0; i < n; i += 1) if (masked[i] && lane[i] === top) common += 1;

  /** 이웃들의 갈래로 투표해 맞힌다. `pick` 이 이웃 목록을 주는 함수. */
  const guessWith = (pick) => {
    let hit = 0; let tried = 0;
    for (let i = 0; i < n; i += 1) {
      if (!masked[i]) continue;
      const votes = new Map();
      for (const j of pick(i).slice(0, LEAK_K)) {
        /* **가려진 이웃은 아무 말도 못 한다** — 공격자가 볼 수 있는 건 안 가려진 것뿐이다. */
        if (j == null || j < 0 || j >= n || masked[j]) continue;
        votes.set(lane[j], (votes.get(lane[j]) || 0) + 1);
      }
      if (!votes.size) continue;
      let best = null; let bn = 0;
      for (const [k, v] of votes) if (v > bn) { bn = v; best = k; }
      tried += 1;
      if (best === lane[i]) hit += 1;
    }
    return { hit, tried, rate: tried ? hit / tried : 0 };
  };

  const real = guessWith((i) => docs[i].near || []);
  /**
   * ★ **이웃 목록을 빼면 안전한가** — 아니다. 좌표만 있어도 이웃은 다시 만들어진다.
   * 그게 「파생 정보도 역변환에 취약하다」의 실물이다. 그래서 그 판도 같이 잰다.
   */
  const xyNear = (() => {
    const xy = docs.map((d) => d.xy);
    return (i) => {
      if (!xy[i]) return [];
      const row = [];
      for (let j = 0; j < n; j += 1) {
        if (j === i || !xy[j]) continue;
        row.push([j, (xy[i][0] - xy[j][0]) ** 2 + (xy[i][1] - xy[j][1]) ** 2]);
      }
      row.sort((a, b) => a[1] - b[1]);
      return row.slice(0, LEAK_K * 3).map((q) => q[0]);
    };
  })();
  const byXy = guessWith(xyNear);
  /* (나) 이웃 목록을 마구 섞은 판 — 여기서도 맞으면 잣대가 헛돈다. */
  const shuffled = guessWith(() => Array.from({ length: LEAK_K }, () => Math.floor(rnd() * n)));

  return {
    maskRate: LEAK_MASK, k: LEAK_K, n, masked: maskN,
    guessed: real.tried, hit: real.hit,
    rate: Number(real.rate.toFixed(4)),
    commonRate: Number((maskN ? common / maskN : 0).toFixed(4)),
    shuffledRate: Number(shuffled.rate.toFixed(4)),
    /* 이웃 목록을 아예 빼고 **좌표만** 줬을 때. 이게 안 떨어지면 목록을 빼도 소용없다. */
    xyRate: Number(byXy.rate.toFixed(4)), xyGuessed: byXy.tried,
    /* 우연보다 얼마나 잘 맞히나 — 1 이면 우연, 클수록 많이 샌다. */
    lift: Number((real.rate / Math.max(1e-9, Math.max(shuffled.rate, maskN ? common / maskN : 1e-9))).toFixed(2)),
    ms: Date.now() - t0,
  };
}

/**
 * **자리 정렬 — 산점도가 진 그릇이라면 행렬은 어떤가**
 * (Ghoniem·Fekete·Castagliola InfoVis 2004 / Behrisch 외 CGF 2016 STAR).
 *
 * 통제 실험이 말한다: **마디가 스무 개를 넘으면 대부분의 과제에서 행렬이 점-선을 이긴다.**
 * 일관되게 점-선이 이기는 과제는 **「길 찾기」 하나뿐.** 우리는 **1918개 점에 점-선**이다.
 *
 * 왜 지금 맞물리나 — 점-선은 **자리에 뜻을 싣는 그릇**인데 우리는 자리를 못 믿는다
 * (18차원 · 씨앗이 정한다 · 화면 이웃의 69%가 거짓). 행렬은 **자리 대신 순서**만 쓴다
 * (정렬은 1차원). 즉 우리 자료의 병이 행렬에는 **덜 아프다.**
 *
 * ⚠ 다만 Behrisch 가 대놓고 경고한다 — **어떤 무늬가 자료의 것이고 어떤 무늬가 알고리즘이
 * 만든 것인지 아는 게 관건**이다. 그래서 **그리기 전에 잰다.** 정렬이 섞은 자료에서도
 * 좋아 보이면 그 무늬는 알고리즘의 산물이다.
 *
 * 잣대 셋 (셋 다 **낮을수록 좋다**, 그리고 셋 다 대조군과 나란히 적는다):
 *  · **2-sum** = Σ s_ij (π(i)−π(j))² / Σ s_ij — 닮은 것끼리 가까이 놓였나. O(n²)
 *  · **profile** = 이웃 그래프에서 각 줄의 가장 먼 이웃까지 거리 합 = 「너덜너덜함」. O(nk)
 *  · **anti-Robinson 이탈** = 대각선에서 멀어질수록 닮음이 **단조 감소**해야 한다는
 *    이상형과의 어긋남 비율. O(n³) 이라 **작은 표본에서만** 잰다(몇 개로 쟀는지 적는다).
 */
const SER_AR_N = 260;        // anti-Robinson 은 n³ 이라 이만큼만
const SER_K = 8;             // profile 을 잴 이웃 수 (화면 이웃 수와 같게)

/** 거리 → 닮음. 가까울수록 1 에 가깝게. */
function simOf(d, scale) { return Math.exp(-(d * d) / (2 * scale * scale)); }

/** Σ s_ij (π(i)−π(j))² / Σ s_ij — 낮을수록 닮은 것끼리 붙어 있다. */
function twoSum(order, n, dist, scale) {
  const pos = new Int32Array(n);
  order.forEach((v, i) => { pos[v] = i; });
  let num = 0; let den = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const s = simOf(dist[i * n + j], scale);
      if (s < 1e-6) continue;
      const dp = (pos[i] - pos[j]) / n;
      num += s * dp * dp; den += s;
    }
  }
  return den > 0 ? num / den : 0;
}

/** 이웃 k개가 줄에서 얼마나 멀리 흩어져 있나 (너덜너덜함). 낮을수록 좋다. */
function profileOf(order, n, near) {
  const pos = new Int32Array(n);
  order.forEach((v, i) => { pos[v] = i; });
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    let far = 0;
    for (const j of near[i]) far = Math.max(far, Math.abs(pos[i] - pos[j]));
    acc += far / n;
  }
  return acc / n;
}

/**
 * anti-Robinson 이탈 — 줄에서 멀어질수록 닮음이 **단조 감소**해야 한다.
 * 어긋난 세 짝의 비율을 낸다(0 이면 완벽한 Robinson 행렬).
 */
function antiRobinson(order, dist, scale) {
  const m = order.length;
  let bad2 = 0; let all = 0;
  for (let a = 0; a < m; a += 1) {
    const i = order[a];
    for (let b = a + 1; b < m; b += 1) {
      const sb = simOf(dist.get(i, order[b]), scale);
      for (let c = b + 1; c < m; c += 1) {
        const sc = simOf(dist.get(i, order[c]), scale);
        all += 1;
        if (sc > sb) bad2 += 1;      // 더 먼 자리인데 더 닮았다 = 어긋남
      }
    }
  }
  return all ? bad2 / all : 0;
}

/** 닮음 그래프 라플라스의 두 번째 고유벡터(피들러) 순서 — 자리 정렬의 정본 답. */
function fiedlerOrder(n, near, seed = 31) {
  const adj = near.map((s) => [...s]);
  const deg = adj.map((a) => Math.max(1, a.length));
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const triv = new Float64Array(n);
  { let nn = 0; for (let i = 0; i < n; i += 1) { triv[i] = Math.sqrt(deg[i]); nn += deg[i]; } const q = Math.sqrt(nn); for (let i = 0; i < n; i += 1) triv[i] /= q; }
  const mul = (v) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      let s = 0;
      for (const j of adj[i]) s += v[j] / Math.sqrt(deg[j]);
      out[i] = s / Math.sqrt(deg[i]);
    }
    return out;
  };
  const v = new Float64Array(n);
  for (let i = 0; i < n; i += 1) v[i] = rnd() * 2 - 1;
  for (let it = 0; it < 300; it += 1) {
    let dot = 0;
    for (let i = 0; i < n; i += 1) dot += v[i] * triv[i];
    for (let i = 0; i < n; i += 1) v[i] -= dot * triv[i];
    const w = mul(v);
    let nn = 0;
    for (let i = 0; i < n; i += 1) nn += w[i] * w[i];
    nn = Math.sqrt(nn) || 1;
    let delta = 0;
    for (let i = 0; i < n; i += 1) { const q = w[i] / nn; delta = Math.max(delta, Math.abs(q - v[i])); v[i] = q; }
    if (delta < 1e-9) break;
  }
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b]);
}

/**
 * 정렬 여럿을 **같은 잣대**로 견준다. 그리고 **섞은 자료**에서도 같은 표를 낸다 —
 * 거기서도 좋아지면 그 무늬는 알고리즘이 만든 것이다.
 */
function seriateTable(n, dist, near, scale, extra = {}) {
  let st = 20260822 >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const rand = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [rand[i], rand[j]] = [rand[j], rand[i]]; }
  const orders = { random: rand, fiedler: fiedlerOrder(n, near), ...extra };
  /* anti-Robinson 은 작은 표본에서만 — 고르게 솎아 쓴다. */
  const step = Math.max(1, Math.floor(n / SER_AR_N));
  const get = { get: (a, b) => dist[a * n + b] };
  const rows = [];
  for (const [name, ord] of Object.entries(orders)) {
    const sub = ord.filter((_, i) => i % step === 0).slice(0, SER_AR_N);
    rows.push({
      way: name,
      twoSum: Number(twoSum(ord, n, dist, scale).toFixed(5)),
      profile: Number(profileOf(ord, n, near).toFixed(4)),
      ar: Number(antiRobinson(sub, get, scale).toFixed(4)),
      arOf: sub.length,
    });
  }
  return rows;
}

/** 거리행렬에서 이웃 k개 집합을 만든다(대칭). */
function nearSets(n, dist, k) {
  const out = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i += 1) {
    const row = [];
    for (let j = 0; j < n; j += 1) if (j !== i) row.push([j, dist[i * n + j]]);
    row.sort((a, b) => a[1] - b[1]);
    for (let t = 0; t < k; t += 1) { out[i].add(row[t][0]); out[row[t][0]].add(i); }
  }
  return out;
}

/** 벡터 목록에서 거리행렬을 만든다 (지어낸 자료·섞은 자료용). */
function distOf(vecs) {
  const n = vecs.length; const dim = vecs[0].length;
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let s = 0;
      for (let t = 0; t < dim; t += 1) { const q = vecs[i][t] - vecs[j][t]; s += q * q; }
      const v = Math.sqrt(s);
      d[i * n + j] = v; d[j * n + i] = v;
    }
  }
  return d;
}

/** 거리의 중앙값 — 닮음으로 바꿀 때의 눈금. 손으로 안 고른다. */
function medDist(n, dist, cap = 200000) {
  const vals = [];
  const step = Math.max(1, Math.floor((n * n) / cap));
  for (let t = 0; t < n * n; t += step) { const v = dist[t]; if (v > 0) vals.push(v); }
  vals.sort((a, b) => a - b);
  return vals.length ? vals[Math.floor(vals.length / 2)] : 1;
}

/**
 * **행렬로 그릴 만한가**를 재고, 판정을 낸다.
 * 우리 지도의 **x 축 순서**도 후보에 넣는다 — 「우리 그림이 이미 좋은 정렬인가」가 궁금하니까.
 */
function seriationOf(vectors, dist, n, coords, seed = 88) {
  const t0 = Date.now();
  const dim = vectors[0].length;
  /* 잴 수 있는 크기로 고르게 솎는다 — n³ 자가 하나 있다. 몇 개로 쟀는지 적는다. */
  const step = Math.max(1, Math.ceil(n / 700));
  const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  const m = idx.length;
  const sub = new Float64Array(m * m);
  for (let a = 0; a < m; a += 1) for (let b = 0; b < m; b += 1) sub[a * m + b] = dist[idx[a] * n + idx[b]];
  const near = nearSets(m, sub, SER_K);
  const scale = medDist(m, sub);
  /* 우리 지도의 x 축 순서 — 좌표가 있으면 넣는다. */
  const extra = {};
  if (coords && coords.length === n) {
    extra['우리 지도 x축'] = idx.map((_, a) => a).sort((a, b) => coords[idx[a]][0] - coords[idx[b]][0]);
  }
  const ours = seriateTable(m, sub, near, scale, extra);

  /* ★ **대조군** — 축을 따로 섞어 구조를 없앤 자료. 여기서도 좋아지면 알고리즘의 산물이다. */
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const shuf = idx.map((i) => vectors[i].slice());
  for (let t = 0; t < dim; t += 1) {
    for (let i = m - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = shuf[i][t]; shuf[i][t] = shuf[j][t]; shuf[j][t] = tmp;
    }
  }
  const sd = distOf(shuf);
  const shufRows = seriateTable(m, sd, nearSets(m, sd, SER_K), medDist(m, sd));

  /**
   * ② 눈금 — **정말로 한 줄로 세울 수 있는 자료**.
   *
   * ★ 처음엔 「블록이 뚜렷한 자료」를 눈금으로 썼는데 정렬로 얻는 것이 **−2%** 로 나왔다.
   * 알고리즘 탓이 아니라 **눈금이 틀렸다**: 서로 멀리 떨어진 블록 다섯은 애초에 한 줄로
   * 못 세운다(anti-Robinson 은 「줄에서 멀어질수록 닮음이 **단조** 감소」를 요구하는데,
   * 등거리 블록들에서는 어떤 순서로 놓아도 그게 안 된다). 자리 정렬이 이기라고 만든
   * 자료는 **1차원 기울기** — 곡선 위에 늘어선 점들이다. 그게 Robinson 구조의 정의다.
   */
  const B = 400; const bd = 12;
  const gradient = [];
  {
    const dir = Array.from({ length: bd }, () => rnd() * 2 - 1);
    for (let i = 0; i < B; i += 1) {
      const t = i / B;
      gradient.push(dir.map((v) => v * t * 8 + (rnd() - 0.5) * 0.6));
    }
  }
  const bdist = distOf(gradient);
  const calRows = seriateTable(B, bdist, nearSets(B, bdist, SER_K), medDist(B, bdist));

  /**
   * **주 판정은 anti-Robinson 이탈**이다.
   *
   * ★ 처음엔 2-sum 으로 갈랐는데 잘 안 갈렸다(우리 6% vs 눈금 13% — 마구 정렬 대비). 왜냐하면
   * 2-sum 은 **먼 짝 무더기에 묻힌다**: 닮음을 거리 중앙값 눈금의 가우시안으로 내면 대부분의
   * 짝이 고만고만해서, 몇 안 되는 가까운 짝의 배치가 합계에 거의 안 잡힌다.
   * anti-Robinson 은 **세 짝의 순서만** 보므로 그 함정이 없고, 무엇보다 **우연 수준이
   * 0.5 로 내장**돼 있다(아무 순서나 놓으면 절반은 어긋난다). 잣대에 대조군이 붙어 있는 셈이다.
   * 셋 다 표에 싣는다 — 진 잣대도 남긴다.
   */
  const pick = (rows, way) => rows.find((r) => r.way === way);
  const gainOf = (rows) => {
    const b = rows.filter((r) => r.way !== 'random').sort((x, y) => x.ar - y.ar)[0];
    return { best: b, gain: b ? (0.5 - b.ar) / 0.5 : 0 };
  };
  const go = gainOf(ours); const gs = gainOf(shufRows); const gc = gainOf(calRows);
  const best = go.best; const gain = go.gain;
  const shufGain = gs.gain; const calGain = gc.gain;
  const randOurs = pick(ours, 'random');
  const twoSumGain = randOurs && best ? 1 - best.twoSum / Math.max(1e-12, randOurs.twoSum) : 0;

  /**
   * **판정** — 정렬로 얻는 것이 **섞은 자료에서 얻는 것보다 뚜렷이 커야** 행렬을 그릴 값이 있다.
   * 문턱은 눈금(블록이 뚜렷한 자료)에서 얻는 것의 절반 — 손으로 안 고른다.
   */
  /* ★ **대조군이 음수로 내려갈 수 있다** — 구조 없는 자료에서는 정렬이 아무 순서보다 **못할** 수도
     있다(2026-08-23 실측: 섞은 자료 −5.3%). 그때 「대조군의 두 배」는 저절로 참이 되어 문턱이
     사라진다. 그래서 **절대 바닥(2%)** 을 같이 깐다 — 음수 대조군이 판정을 거저 통과시키지 않게. */
  const worth = gain > Math.max(0.02, shufGain * 2) && gain > calGain * 0.5;
  /**
   * **그릴 값이 있으면 전체 순서를 낸다** — 솎은 표본이 아니라 글 전부.
   * 화면은 이 순서로 **이웃 그래프 행렬**을 그린다(닮음 행렬은 너무 무거워 못 싣는다).
   */
  let order = null;
  if (worth) {
    const fullNear = nearSets(n, dist, SER_K);
    order = fiedlerOrder(n, fullNear);
  }
  return {
    order, n: m, of: n, k: SER_K, arOf: SER_AR_N,
    ours, shuffled: shufRows, calibration: calRows,
    gain: Number(gain.toFixed(4)), shufGain: Number(shufGain.toFixed(4)), calGain: Number(calGain.toFixed(4)),
    twoSumGain: Number(twoSumGain.toFixed(4)), chance: 0.5,
    best: best ? best.way : null, worth,
    ms: Date.now() - t0,
  };
}

/**
 * **δ-쌍곡성 — 굽은 2차원이 우리에게 도움이 될 자료인가** (Gromov / Khrulkov 외 2020).
 *
 * 앞 바퀴에서 우리 자료가 **약 18차원**임을 쟀다. 평평한 2차원이 모자란다는 뜻이다.
 * 정면 대안이 **굽은 2차원**(쌍곡·푸앵카레) — 자리가 지수적으로 많아 2차원 푸앵카레가
 * 100차원 유클리드와 맞먹는다는 보고가 있다(Nickel & Kiela, NIPS 2017).
 *
 * ⚠ **다만 아무 자료에나 듣는 처방이 아니다.** WordNet 만큼 계보가 뚜렷하지 않은 자료가
 * 훨씬 많고, 텍스트 코퍼스는 **여러 계보가 동시에 존재**해서 2차원에 다 못 담는다는 반론이
 * 그 논문 리뷰에 그대로 적혀 있다. 그래서 **쓰기 전에 「우리 자료가 나무 같은가」를 잰다.**
 * 우리 습관 그대로 — 고치기 전에 재기. 아니라고 나오면 **안 만드는 것도 통과다.**
 *
 * 재는 법: 그롬프 곱 `(y,z)_x = ½(d(x,y)+d(x,z)−d(y,z))`. 네 점의 세 거리합
 * `d(x,y)+d(z,w)` · `d(x,z)+d(y,w)` · `d(x,w)+d(y,z)` 를 정렬해 **(최대−둘째)/2** 를 모은다.
 * 크기에 안 흔들리게 **`δ_rel = 2δ/지름`** 으로 정규화한다([0,1], 작을수록 나무 같음).
 * 실측 눈금 — WordNet 명사 4e-4(나무) vs OpenThesaurus 명사 0.307(나무 아님).
 *
 * ⚠ **최대와 평균을 둘 다** 낸다. 최대는 **이상치 네 점 하나에 끌려간다** — 그것만 보면
 * 어떤 자료도 나무가 아니라고 나온다.
 */
const DELTA_TRIALS = 50000;    // 4점을 몇 번 뽑나 (정본 관행값)

/** 거리 얻는 함수 하나만 받는다 — 우리 자료든 지어낸 자료든 같은 셈을 쓴다. */
function deltaHyp(n, d, trials = DELTA_TRIALS, seed = 4615) {
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  let mx = 0; let sum = 0; let cnt = 0; let diam = 0;
  for (let t = 0; t < trials; t += 1) {
    const x = Math.floor(rnd() * n); const y = Math.floor(rnd() * n);
    const z = Math.floor(rnd() * n); const w = Math.floor(rnd() * n);
    if (x === y || x === z || x === w || y === z || y === w || z === w) continue;
    const s1 = d(x, y) + d(z, w);
    const s2 = d(x, z) + d(y, w);
    const s3 = d(x, w) + d(y, z);
    const a = Math.max(s1, s2, s3);
    const b = Math.max(Math.min(s1, s2), Math.min(Math.max(s1, s2), s3));
    const v = (a - b) / 2;
    if (v > mx) mx = v;
    sum += v; cnt += 1;
    /* 지름은 같은 표집에서 얻는다 — 따로 전수 조사하면 n² 이 또 든다. */
    const dm = Math.max(d(x, y), d(x, z), d(x, w), d(y, z), d(y, w), d(z, w));
    if (dm > diam) diam = dm;
  }
  const mean = cnt ? sum / cnt : 0;
  return {
    trials: cnt, diam: Number(diam.toFixed(4)),
    max: Number(mx.toFixed(4)), mean: Number(mean.toFixed(4)),
    relMax: Number((diam > 0 ? (2 * mx) / diam : 0).toFixed(4)),
    relMean: Number((diam > 0 ? (2 * mean) / diam : 0).toFixed(4)),
  };
}

/** 눈금 — 알려진 모양 넷. 나무가 가장 작고 난수·구면이 커야 한다. */
function deltaCalibration(rnd) {
  const out = [];
  /* ① 나무 — 이진 나무의 그래프 거리. δ 는 0 이어야 한다(나무는 정의상 0-쌍곡). */
  {
    const depth = 9; const N = (1 << depth) - 1;
    const parent = (i) => (i - 1) >> 1;
    const depthOf = (i) => Math.floor(Math.log2(i + 1));
    const d = (a, b) => {
      let x = a; let y = b; let s = 0;
      while (x !== y) {
        if (depthOf(x) >= depthOf(y)) { x = parent(x); s += 1; } else { y = parent(y); s += 1; }
      }
      return s;
    };
    out.push({ shape: '나무', ...deltaHyp(N, d, 20000) });
  }
  /* ② 격자 — 평평한 2차원. 나무보다 훨씬 커야 한다. */
  {
    const side = 40; const N = side * side;
    const d = (a, b) => Math.abs((a % side) - (b % side)) + Math.abs(Math.floor(a / side) - Math.floor(b / side));
    out.push({ shape: '격자', ...deltaHyp(N, d, 20000) });
  }
  /* ③ 구면 — 굽었지만 반대쪽으로 굽었다. */
  {
    const N = 800;
    const P = Array.from({ length: N }, () => {
      const u = rnd() * 2 - 1; const th = rnd() * 2 * Math.PI; const r = Math.sqrt(1 - u * u);
      return [r * Math.cos(th), r * Math.sin(th), u];
    });
    const d = (a, b) => Math.acos(Math.max(-1, Math.min(1, P[a][0] * P[b][0] + P[a][1] * P[b][1] + P[a][2] * P[b][2])));
    out.push({ shape: '구면', ...deltaHyp(N, d, 20000) });
  }
  /* ④ 균등 난수 (고차원) — 우리 자료와 같은 축 수에서의 「나무 아님」 기준선. */
  {
    const N = 800; const dim = 20;
    const P = Array.from({ length: N }, () => Array.from({ length: dim }, () => rnd()));
    const d = (a, b) => { let s = 0; for (let i = 0; i < dim; i += 1) { const q = P[a][i] - P[b][i]; s += q * q; } return Math.sqrt(s); };
    out.push({ shape: '균등 난수', ...deltaHyp(N, d, 20000) });
  }
  return out;
}

/**
 * 우리 자료의 δ_rel 을 재고, 눈금 넷과 **섞은 대조군**을 나란히 낸다.
 * 판정은 「굽은 2차원이 도움이 될 자료인가」 — 아니면 **아니라고 적는다.**
 */
function deltaOf(vectors, dist, n, seed = 4615) {
  const t0 = Date.now();
  let st = (seed * 7 + 13) >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const ours = deltaHyp(n, (a, b) => dist[a * n + b]);

  /* 대조군 — 축을 따로 섞어 상관을 없앤 판. 나무 같은 정도가 **더 나빠져야** 한다. */
  const dim = vectors[0].length;
  const shuf = vectors.map((v) => v.slice());
  for (let t = 0; t < dim; t += 1) {
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = shuf[i][t]; shuf[i][t] = shuf[j][t]; shuf[j][t] = tmp;
    }
  }
  const sd = (a, b) => { let s = 0; for (let i = 0; i < dim; i += 1) { const q = shuf[a][i] - shuf[b][i]; s += q * q; } return Math.sqrt(s); };
  const shuffled = deltaHyp(n, sd);

  const cal = deltaCalibration(rnd);
  /**
   * ★ **함정 — 거리가 집중되면 δ_rel 이 작아진다(나무가 돼서가 아니라).**
   *
   * 처음엔 축을 섞은 판이 **더 나빠질** 줄 알았는데 오히려 **더 작게** 나왔다(0.0586 → 0.0265).
   * 고차원에서 상관을 없애면 모든 거리가 서로 비슷해지고, 그러면 네 점의 거리합 차이가
   * 줄어 δ 가 작아진다 — **나무 같아진 게 아니라 잴 것이 사라진 것**이다.
   * 그래서 눈금에 **우리와 같은 축 수·같은 글 수의 순수 잡음**을 넣는다. 그게 진짜
   * 「아무 구조도 없을 때 이 자가 내는 값」이고, 판정은 그것과 견줘야 뜻이 선다.
   */
  {
    const N = Math.min(n, 900);
    const P = Array.from({ length: N }, () => Array.from({ length: dim }, () => {
      const u = Math.max(1e-9, rnd());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
    }));
    const nd = (a, b) => { let s2 = 0; for (let i = 0; i < dim; i += 1) { const q = P[a][i] - P[b][i]; s2 += q * q; } return Math.sqrt(s2); };
    cal.push({ shape: `순수 잡음(축 ${dim}개)`, matched: true, ...deltaHyp(N, nd, 20000) });
  }
  const tree = cal.find((c) => c.shape === '나무');
  const noise = cal.find((c) => c.matched);
  /**
   * **판정.** 나무 쪽이면 굽은 2차원이 도움이 되고, 잡음 쪽이면 안 된다.
   * 문턱을 손으로 안 고른다 — **눈금 둘 사이 어디쯤인가**로 말한다. 그리고 잡음 기준선은
   * 남의 집 20차원이 아니라 **우리 축 수에서 잰 것**을 쓴다.
   */
  const lo = tree ? tree.relMean : 0;
  const hi = noise ? noise.relMean : 1;
  const pos = hi > lo ? (ours.relMean - lo) / (hi - lo) : 0;
  return {
    ours, shuffled, calibration: cal, n, dim,
    matched: noise ? noise.relMean : null,
    /* 0 이면 나무, 1 이면 균등 난수. */
    where: Number(Math.max(0, Math.min(1.5, pos)).toFixed(3)),
    treeLike: pos < 0.5,
    ms: Date.now() - t0,
  };
}

/**
 * **고유차원 — 이 글 무더기가 애초에 2차원에 담길 수 있나**
 * (Levina & Bickel, NIPS 2004 / Facco 외 TwoNN).
 *
 * ★ 우리는 이 질문을 **한 번도 안 물었다.** 그런데 지금까지 쌓인 결론 넷이 전부 여기서
 * 따라 나온다 — 화면 이웃의 **69%가 거짓 이웃** · 씨앗을 바꾸면 이웃 **셋 중 둘이 바뀜** ·
 * **자리의 절반은 난수** · **「구획이지 무리가 아니다」**. 고유차원이 2보다 훨씬 높으면
 * 저건 전부 **당연한 결과**다. 재면 넷을 하나의 원인으로 묶고, 안 재면 증상만 계속 센다.
 *
 * 추정기 둘을 **각각** 구현해 서로의 대조군으로 쓴다:
 *  · **MLE**(Levina–Bickel) — 점마다 m̂_k(x) = [ (1/(k−1)) Σ_{j<k} log(T_k/T_j) ]⁻¹.
 *    ⚠ 전역값은 **추정치를 평균하지 말고 역수를 평균**한다(MacKay–Ghahramani 보정) —
 *    그냥 평균하면 위로 치우친다. 이웃 전체를 쓰므로 고차원에서 분산이 작다.
 *  · **TwoNN** — 가장 가까운 둘의 거리비 μ = r₂/r₁ 만 쓴다. (log μ, −log(1−F)) 위에
 *    **원점을 지나는 직선**을 맞추면 기울기가 곧 차원. 손잡이(k)가 없다는 게 장점.
 *
 * ⚠ **표본이 차원에 비해 적으면 두 추정기 다 과소추정한다.** 그 편향을 모르면 우리 수를
 * 오독한다 — 그래서 눈금 표에 「같은 표본 수에서 알려진 차원을 얼마로 보나」를 같이 싣는다.
 */
const ID_KS = [5, 10, 20, 40];      // MLE 를 재는 이웃 수들 (하나만 보면 k 탓인지 모른다)
const ID_TRIM = 0.05;                // TwoNN 직선맞춤에서 꼬리 5% 는 버린다 (관행)

/** 점마다 가까운 이웃 거리 목록(오름차순, 자기 자신 제외)을 뽑는다. */
function nearDists(dist, n, kmax) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const row = [];
    for (let j = 0; j < n; j += 1) if (j !== i) row.push(dist[i * n + j]);
    row.sort((a, b) => a - b);
    out.push(row.slice(0, kmax));
  }
  return out;
}

/** Levina–Bickel MLE. `inv` 가 참이면 **역수 평균**(MacKay–Ghahramani 보정). */
function mleId(near, k, inv = true) {
  let acc = 0; let cnt = 0;
  const per = [];
  for (const row of near) {
    const Tk = row[k - 1];
    if (!(Tk > 0)) continue;
    let s = 0; let m = 0;
    for (let j = 0; j < k - 1; j += 1) {
      const Tj = row[j];
      if (!(Tj > 0)) continue;
      s += Math.log(Tk / Tj); m += 1;
    }
    if (!m) continue;
    acc += s; cnt += m;
    per.push(m / s);
  }
  if (inv) return cnt ? cnt / acc : 0;
  return per.length ? per.reduce((a, b) => a + b, 0) / per.length : 0;
}

/** TwoNN — μ = r₂/r₁ 의 경험 CDF 에 원점을 지나는 직선을 맞춘다. */
function twoNN(near) {
  const mu = [];
  for (const row of near) {
    if (!(row[0] > 0) || !(row[1] > 0)) continue;
    mu.push(row[1] / row[0]);
  }
  mu.sort((a, b) => a - b);
  const N = mu.length;
  if (N < 20) return 0;
  const cut = Math.floor(N * (1 - ID_TRIM));
  let sxy = 0; let sxx = 0;
  for (let i = 0; i < cut; i += 1) {
    const x = Math.log(mu[i]);
    const F = (i + 1) / (N + 1);
    const y = -Math.log(1 - F);
    sxy += x * y; sxx += x * x;
  }
  return sxx > 0 ? sxy / sxx : 0;
}

/** 벡터 목록에서 거리행렬을 만들어 두 추정기를 다 돌린다. */
function idOf(vecs, ks = ID_KS) {
  const n = vecs.length;
  const dim = vecs[0].length;
  const dist = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let s = 0;
      for (let t = 0; t < dim; t += 1) { const q = vecs[i][t] - vecs[j][t]; s += q * q; }
      const d = Math.sqrt(s);
      dist[i * n + j] = d; dist[j * n + i] = d;
    }
  }
  const near = nearDists(dist, n, Math.max(...ks));
  return {
    twoNN: Number(twoNN(near).toFixed(2)),
    mle: ks.map((k) => ({ k, id: Number(mleId(near, k).toFixed(2)) })),
    naive: Number(mleId(near, ks[1] ?? ks[0], false).toFixed(2)),
  };
}

/**
 * 고유차원을 재고, **눈금**과 **셔플 대조군**을 나란히 낸다.
 * 대조군 = 각 차원을 **따로** 섞어 차원 간 상관을 없앤 판. 구조가 사라지면 고유차원이
 * 주변차원 쪽으로 **올라야** 한다 — 안 오르면 우리 추정기가 구조를 안 보고 있는 것이다.
 */
function intrinsicDim(vectors, dist, n, seed = 777) {
  const t0 = Date.now();
  const dim = vectors[0].length;
  const near = nearDists(dist, n, Math.max(...ID_KS));
  const ours = {
    twoNN: Number(twoNN(near).toFixed(2)),
    mle: ID_KS.map((k) => ({ k, id: Number(mleId(near, k).toFixed(2)) })),
    naive: Number(mleId(near, 10, false).toFixed(2)),
  };

  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const gs = () => { const u = Math.max(1e-9, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

  /* ② 눈금 — **같은 표본 수**에서 알려진 차원을 얼마로 보나. 표본이 차원에 비해 적으면
     과소추정한다는 것까지 같이 보여 준다(그 편향을 모르면 우리 수를 오독한다). */
  const cal = [];
  for (const d of [2, 5, 10, 20, 50]) {
    const pts = Array.from({ length: Math.min(n, 900) }, () => Array.from({ length: d }, () => rnd()));
    const r = idOf(pts);
    cal.push({ truth: d, twoNN: r.twoNN, mle: r.mle.find((m) => m.k === 10)?.id ?? null });
  }

  /* ③ 셔플 대조군 — 차원마다 따로 섞는다(각 축의 분포는 그대로, 상관만 없앤다). */
  const shuf = vectors.map((v) => v.slice());
  for (let t = 0; t < dim; t += 1) {
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = shuf[i][t]; shuf[i][t] = shuf[j][t]; shuf[j][t] = tmp;
    }
  }
  const shufR = idOf(shuf);
  /* 그리고 **구조가 아예 없는 난수 벡터** — 주변차원의 천장이 어디쯤인지 알려 준다. */
  const noise = Array.from({ length: n }, () => Array.from({ length: dim }, () => gs()));
  const noiseR = idOf(noise);

  const at10 = ours.mle.find((m) => m.k === 10)?.id ?? ours.twoNN;
  return {
    ambient: dim, n, ks: ID_KS,
    ours, shuffled: shufR, noise: noiseR, calibration: cal,
    /* 화면이 쓸 한 수 — 이웃 10명으로 잰 값(두 추정기가 어긋나면 자가 잡는다). */
    id: at10,
    ms: Date.now() - t0,
  };
}

/**
 * **초기화 사다리 — 전역 배치는 최적화가 아니라 초기화가 물려준다**
 * (Kobak & Linderman, Nature Biotechnology 39:156-157, 2021).
 *
 * 「UMAP 이 t-SNE 보다 전역 구조를 잘 지킨다」는 알고리즘 차이가 아니라 **초기화 차이
 * 하나**였다 — 같은 초기화를 주면 둘이 똑같이 행동한다. 끌림-밀침 최적화는 초기화가
 * 물려준 전역 배치 **위에서 지역만 다듬는다.** 우리가 잰 「자리의 절반은 난수가 정한다」
 * (씨앗 12판, 이동 4.6% vs 구조 없는 벡터 8.5%)는 그 증상이고, 처방이 여기 있다.
 *
 * ⚠ **우리 umap-js 는 `init=` 인자를 안 받는다.** `umap.js:444` 가
 * `tauRand(random)*20 - 10` 으로 uniform(-10,10) 을 **하드코딩**한다. 그리고
 * `u.embedding = init` 재대입은 **조용히 무시된다** — `initializeFit()` 이 곧바로
 * `initializeOptimization()` 을 불러 `headEmbedding = this.embedding` **참조를**
 * optimizationState 에 박기 때문이다(초록이 뜨는데 아무것도 안 바뀌는 전형).
 * 맞는 이음매 = `initializeFit(X)` → `u.embedding[i][k]` **제자리 덮어쓰기** → `optimizeLayout()`.
 * 이게 진짜 도는지는 자(`audit-atlas-init`)의 0번 물기가 지킨다.
 *
 * ⚠ 논문의 「PCA init 을 분산 1e-4 로 축소」는 **openTSNE 의 난수 init 규약**에 맞춘 값이다.
 * 우리 난수 init 은 uniform(-10,10)(sd≈5.8) 이라 그대로 베끼면 손으로 고른 상수를 하나 더
 * 박는 것이다. **스케일도 재서 고른다.**
 */
const INIT_WAYS = ['random', 'pca', 'spectral'];
/* 스케일 후보 — maxabs 10 은 umap-js 난수 init 의 규약, 나머지 둘은 훨씬 작게. */
const INIT_SCALES = [
  { name: 'maxabs10', kind: 'maxabs', v: 10 },
  { name: 'sd1', kind: 'sd', v: 1 },
  { name: 'sd0.01', kind: 'sd', v: 0.01 },
];

/** 주어진 자리를 스케일 규약에 맞춘다. */
function scaleInit(pts, scale) {
  const n = pts.length;
  if (!n) return pts;
  const mx = [0, 0];
  for (const p of pts) { mx[0] += p[0] / n; mx[1] += p[1] / n; }
  const cen = pts.map((p) => [p[0] - mx[0], p[1] - mx[1]]);
  if (scale.kind === 'maxabs') {
    let m = 0;
    for (const p of cen) m = Math.max(m, Math.abs(p[0]), Math.abs(p[1]));
    const k = m > 1e-12 ? scale.v / m : 1;
    return cen.map((p) => [p[0] * k, p[1] * k]);
  }
  let s2 = 0;
  for (const p of cen) s2 += (p[0] * p[0] + p[1] * p[1]) / (2 * n);
  const k = s2 > 1e-24 ? scale.v / Math.sqrt(s2) : 1;
  return cen.map((p) => [p[0] * k, p[1] * k]);
}

/**
 * **부호 규약** — 주성분의 방향은 부호가 자유로워서, 규약이 없으면 판이 좌우로 뒤집힌다.
 * 각 축의 **절대값이 가장 큰 성분을 양수로** 맞춘다. (물기 하나가 이 줄을 지킨다.)
 */
function fixSigns(pts) {
  for (let k = 0; k < 2; k += 1) {
    let at = 0; let mv = 0;
    for (let i = 0; i < pts.length; i += 1) if (Math.abs(pts[i][k]) > mv) { mv = Math.abs(pts[i][k]); at = i; }
    if (pts[at][k] < 0) for (const p of pts) p[k] = -p[k];
  }
  return pts;
}

/** kNN 그래프 라플라스의 아래쪽 고유벡터 둘 — 스펙트럼 초기화. 멱반복으로 뽑는다. */
function spectralInit(vectors, k = 15, seed = 11) {
  const n = vectors.length;
  const dim = vectors[0].length;
  const d2 = (a, b) => { let t = 0; for (let i = 0; i < dim; i += 1) { const q = vectors[a][i] - vectors[b][i]; t += q * q; } return t; };
  /* 대칭 kNN 그래프. 가중치는 1 로 둔다 — 우리 이음 거리는 중앙값 0.038 이라
     가우시안 커널을 쓰면 폭(σ)이라는 상수를 또 손으로 골라야 한다. */
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i += 1) {
    const row = [];
    for (let j = 0; j < n; j += 1) if (j !== i) row.push([j, d2(i, j)]);
    row.sort((a, b) => a[1] - b[1]);
    for (let t = 0; t < k; t += 1) { adj[i].add(row[t][0]); adj[row[t][0]].add(i); }
  }
  const deg = adj.map((s) => Math.max(1, s.size));
  /* 정규화 라플라스 L = I − D^-1/2 A D^-1/2 의 **작은** 고유벡터가 필요하므로
     M = D^-1/2 A D^-1/2 의 **큰** 고유벡터를 멱반복으로 뽑는다(첫째는 자명해라 버린다). */
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const mul = (v) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      let s = 0;
      for (const j of adj[i]) s += v[j] / Math.sqrt(deg[j]);
      out[i] = s / Math.sqrt(deg[i]);
    }
    return out;
  };
  const trivial = new Float64Array(n);
  { let nn = 0; for (let i = 0; i < n; i += 1) { trivial[i] = Math.sqrt(deg[i]); nn += deg[i]; } const q = Math.sqrt(nn); for (let i = 0; i < n; i += 1) trivial[i] /= q; }
  const found = [trivial];
  const out = [];
  for (let c = 0; c < 2; c += 1) {
    let v = new Float64Array(n);
    for (let i = 0; i < n; i += 1) v[i] = rnd() * 2 - 1;
    for (let it = 0; it < 200; it += 1) {
      for (const f of found) {
        let dot = 0;
        for (let i = 0; i < n; i += 1) dot += v[i] * f[i];
        for (let i = 0; i < n; i += 1) v[i] -= dot * f[i];
      }
      const w = mul(v);
      let nn = 0;
      for (let i = 0; i < n; i += 1) nn += w[i] * w[i];
      nn = Math.sqrt(nn) || 1;
      let delta = 0;
      for (let i = 0; i < n; i += 1) { const q = w[i] / nn; delta = Math.max(delta, Math.abs(q - v[i])); v[i] = q; }
      if (delta < 1e-9) break;
    }
    found.push(v);
    out.push(v);
  }
  return fixSigns(Array.from({ length: n }, (_, i) => [out[0][i], out[1][i]]));
}

/** 앞 두 주성분 — PCA 초기화. 이미 있는 `pca2` 를 쓰고 부호만 못 박는다. */
function pcaInit(vectors) {
  return fixSigns(pca2(vectors).map((p) => [p[0], p[1]]));
}

/** 조건 이름 → 초기 자리. `random` 이면 null(umap-js 기본값 그대로). */
function initPoints(way, vectors, scale) {
  if (way === 'random') return null;
  const raw = way === 'pca' ? pcaInit(vectors) : spectralInit(vectors);
  return scaleInit(raw, scale);
}

/**
 * **전역 거리 상관** — 고차원 짝거리(코사인) vs 2D 짝거리(유클리드) 피어슨.
 * 짝은 **조건마다 같은 표본**을 쓴다(안 그러면 조건 차이가 표본 차이에 묻힌다).
 */
function pairSample(n, count, seed = 233) {
  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const out = [];
  for (let t = 0; t < count; t += 1) {
    const i = Math.floor(rnd() * n);
    let j = Math.floor(rnd() * n);
    if (i === j) j = (j + 1) % n;
    out.push([i, j]);
  }
  return out;
}
function rGlobal(vectors, pts, pairs) {
  const dim = vectors[0].length;
  const cos = (a, b) => {
    let d = 0; let na = 0; let nb = 0;
    for (let i = 0; i < dim; i += 1) { d += vectors[a][i] * vectors[b][i]; na += vectors[a][i] ** 2; nb += vectors[b][i] ** 2; }
    return 1 - d / (Math.sqrt(na * nb) || 1);
  };
  const xs = []; const ys = [];
  for (const [i, j] of pairs) {
    xs.push(cos(i, j));
    ys.push(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  }
  const m = xs.length;
  let mx = 0; let my = 0;
  for (let i = 0; i < m; i += 1) { mx += xs[i] / m; my += ys[i] / m; }
  let sxy = 0; let sx = 0; let sy = 0;
  for (let i = 0; i < m; i += 1) {
    const a = xs[i] - mx; const b = ys[i] - my;
    sxy += a * b; sx += a * a; sy += b * b;
  }
  return sxy / (Math.sqrt(sx * sy) || 1);
}

async function umap2(vectors, opts = {}) {
  const { UMAP } = await import('umap-js');
  /* 씨앗을 **밖에서 줄 수 있게** 해 둔다 — 같은 자료를 여러 판 구워 「이 자리가 자료의
     것인지 씨앗의 것인지」를 재려면 필요하다(MCE, arXiv 2503.08103). 기본값은 그대로. */
  let seed = opts.seed ?? 42;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  /* 손잡이 둘을 우리 벡터로 직접 돌려 보고 골랐다 (1510개 기준).
       이웃·최소거리 | 화면 채움율 | 덩어리 뭉침도(작을수록 또렷)
        15 · 0.1     |    0.161    | 0.348   ← 기본값. 뭉치게 만드는 설정이라 화면이 빈다
        30 · 0.3     |    0.383    | 0.409   ← 고른 값
        30 · 0.5     |    0.441    | 0.443   ← 너무 퍼져 또렷함을 잃는다
     맞바꿈이다 — 퍼뜨리면 반드시 덜 또렷해진다. 공짜는 없었다.
     0.409 는 예전에 버린 방식(0.452)보다 여전히 낫고, 채움은 2.4배가 된다. */
  /* 손잡이는 **재서 고른다**(표본으로 쓸어 믿을 만함+안 놓침이 가장 큰 자리).
     `--umap-fixed` 로 옛 값(30·0.3)에 못 박을 수 있다 — 견줘 볼 때 쓴다. */
  /* 여러 판 구울 때는 손잡이 고르기를 다시 하지 않는다 — 손잡이는 그대로 두고
     **씨앗만** 바꿔야 「씨앗 탓」을 잰 것이 된다. */
  const picked = opts.params !== undefined ? opts.params
    : (flag('--umap-fixed') ? null : await pickUmapParams(vectors));
  if (opts.params === undefined) umapPick = picked ? { way: picked.way || 'UMAP', nn: picked.nn, md: picked.md, trust: Number(picked.trust.toFixed(4)), cont: Number(picked.cont.toFixed(4)), fill: picked.fill, table: picked.table } : null;
  /* **표에서 이긴 방식으로 그린다** — 중간거리 짝이 이기면 그걸로 전부 다시 잡는다.
     (실측에선 안 이겼다: 이웃합 1.804·채움 0.354 vs UMAP 1.819·0.469 — 그래서 UMAP 그대로.) */
  if (picked && picked.way === '중간거리') {
    if (opts.params === undefined) console.log('[atlas] **중간거리 짝 방식으로 자리를 잡는다** (표에서 이겼다)');
    return pacmap2(vectors, { seed: opts.seed ?? 7 });
  }
  const u = new UMAP({
    nComponents: 2,
    nNeighbors: picked ? picked.nn : 30,
    minDist: picked ? picked.md : 0.3,
    random,
  });
  /* ★ **초기 자리를 넣는 유일한 이음매.** `u.embedding = init` 재대입은 조용히 무시된다
     (initializeFit 이 곧바로 참조를 optimizationState 에 박는다) — **제자리 덮어쓰기**여야 한다. */
  if (opts.init) {
    u.initializeFit(vectors);
    const E = u.embedding;
    for (let i = 0; i < E.length && i < opts.init.length; i += 1) {
      E[i][0] = opts.init[i][0];
      E[i][1] = opts.init[i][1];
    }
    u.optimizeLayout();
    return u.embedding;
  }
  return u.fit(vectors);
}

/** 이 판에 고른 UMAP 손잡이 — 지도에 실어 화면이 적게 한다. */
let umapPick = null;

/**
 * 지난번 지도에 새 지도를 겹쳐 맞춘다 (Procrustes).
 *
 * 글이 늘면 자리 잡는 계산이 통째로 다시 돈다 — 씨앗을 고정해도 소용없다.
 * 실측: 1400개에 50개만 더해도 겹치는 점들이 평균 0.946 움직였다(화면 절반).
 * 그러면 매일 「어제 여기 있던 게 어디 갔지」가 된다.
 *
 * 고치는 법은 점끼리의 관계를 건드리지 않는다. 그림 전체를 **옮기고·키우고·
 * 돌리고·뒤집어** 옛 그림에 가장 잘 포개지는 자세를 찾을 뿐이다.
 * 실측: 0.946 → 0.132. 2차원이라 공식이 짧다(무거운 분해 불요).
 */
function procrustes(nowPts, nowIds, prevMap) {
  const pairs = [];
  nowIds.forEach((id, i) => {
    const p = prevMap.get(id);
    if (p) pairs.push([nowPts[i], p]);
  });
  if (pairs.length < 20) return { pts: nowPts, moved: null, shared: pairs.length };

  const mean = (arr, k) => arr.reduce((s, q) => s + q[k], 0) / arr.length;
  const S = pairs.map((p) => p[0]);
  const D = pairs.map((p) => p[1]);
  const sx = mean(S, 0); const sy = mean(S, 1);
  const dx = mean(D, 0); const dy = mean(D, 1);
  const Sc = S.map((q) => [q[0] - sx, q[1] - sy]);
  const Dc = D.map((q) => [q[0] - dx, q[1] - dy]);
  const norm = (a) => Math.sqrt(a.reduce((s, q) => s + q[0] * q[0] + q[1] * q[1], 0)) || 1;
  const k = norm(Dc) / norm(Sc);

  let best = null;
  for (const flip of [1, -1]) {
    let a = 0; let b = 0;
    for (let i = 0; i < Sc.length; i += 1) {
      const x = Sc[i][0] * flip; const y = Sc[i][1];
      a += x * Dc[i][0] + y * Dc[i][1];
      b += x * Dc[i][1] - y * Dc[i][0];
    }
    const th = Math.atan2(b, a);
    const cos = Math.cos(th); const sin = Math.sin(th);
    const put = (q) => {
      const x = (q[0] - sx) * flip; const y = q[1] - sy;
      return [k * (x * cos - y * sin) + dx, k * (x * sin + y * cos) + dy];
    };
    let err = 0;
    for (let i = 0; i < pairs.length; i += 1) {
      const o = put(pairs[i][0]);
      err += Math.hypot(o[0] - D[i][0], o[1] - D[i][1]);
    }
    err /= pairs.length;
    if (!best || err < best.err) best = { err, put };
  }
  return { pts: nowPts.map(best.put), moved: best.err, shared: pairs.length };
}

/** 지난번에 구운 지도에서 글마다의 자리를 읽는다. 없으면 이번이 첫 그림이다. */
/** 지난 판의 자리 + **그때 쓴 자리잡기 손잡이**(손잡이가 바뀌면 자리는 당연히 다 움직인다). */
let prevUmap = null;
/**
 * **비싼 측정은 이어받는다.**
 *
 * 씨앗 떨림(12판)과 초기화 사다리(수십 판)는 한 번에 몇 분이라 매 굽기마다 못 돈다.
 * 그런데 안 돌면 그 칸이 **비어 버려서** 자가 「안 쟀다」로 빨개진다 — 그러면 통짜를
 * 돌릴 때마다 빨강이 뜨고, 빨강이 늘 뜨면 아무도 안 본다.
 *
 * 그래서 플래그 없이 구우면 **지난 판의 값을 그대로 물려받는다.** 대신 그 값이 언제
 * 무엇에서 쟀는지(`n`)를 같이 실어서, **글 수가 크게 달라지면 자가 「다시 재라」로**
 * 빨개지게 한다. 값을 지우는 것과 물려받는 것은 다르다 — 물려받은 값은 **낡을 수는 있어도
 * 없어지지는 않는다.**
 */
function carryOver(file, key, flag) {
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    const got = prev[key] || null;
    /* ★ **이어받기는 되살리지 못한다.** 한 번 빈 채로 구우면 그 뒤로는 계속 빈 채다 —
       실제로 그렇게 사슬이 끊겨 자 둘이 며칠 빨갛게 있을 뻔했다. 그래서 **소리를 낸다.** */
    if (!got) console.warn(`[atlas] ⚠ 「${key}」 를 물려받을 게 없다 — \`${flag}\` 로 한 번 다시 재야 자가 초록이 된다`);
    return got;
  } catch { return null; }
}

function previousPlaces(file) {
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    prevUmap = prev.umap ? { nn: prev.umap.nn, md: prev.umap.md } : null;
    const m = new Map();
    for (const d of prev.docs || []) if (d.xy) m.set(d.id, d.xy);
    return m;
  } catch { return new Map(); }
}

/**
 * -1..1 로 눌러 담는다. 화면 크기와 무관하게 같은 그림이 나오게.
 *
 * 끝값(최소·최대)으로 재면 **저 멀리 홀로 떨어진 점 몇 개가 나머지를 전부
 * 한쪽 구석으로 밀어 넣는다** (실제로 화면 왼쪽 절반이 통째로 비었다).
 * 그래서 위아래 2% 를 잘라 낸 자리로 잰다. 잘린 점은 버리지 않고 가장자리에 붙인다.
 */
function normalize2(pts) {
  const cut = (a) => {
    const sorted = [...a].sort((x, y) => x - y);
    const lo = sorted[Math.floor(sorted.length * 0.02)];
    const hi = sorted[Math.ceil(sorted.length * 0.98) - 1];
    return [lo, (hi - lo) || 1];
  };
  const [lx, wx] = cut(pts.map((p) => p[0]));
  const [ly, wy] = cut(pts.map((p) => p[1]));
  /* **테두리로 접지 않는다.** 접으면 두 가지가 망가진다:
     ① 바깥쪽 점 134개(8.9%)가 테두리 한 줄에 눌러붙어 서로 구별이 안 된다 —
        「저기 몰려 있다」는 그림이 사실은 「자를 넘어갔다」였다.
     ② 접기는 늘이고 줄이는 것과 달라서, 다음 판에 옛 그림へ 포갤 때 딱 안 맞는다.
        그래서 글이 하나도 안 바뀌어도 판마다 0.018 씩 기어갔다(2026-08-21 실측).
     자는 여전히 2%/98% 로 잡는다 — 화면을 채우려는 목적은 그대로다. 자를 넘는 점은
     테두리 밖에 그려질 뿐이고, 그리는 쪽이 알아서 잘라 준다. */
  return pts.map((p) => [
    Number((((p[0] - lx) / wx) * 2 - 1).toFixed(4)),
    Number((((p[1] - ly) / wy) * 2 - 1).toFixed(4)),
  ]);
}

/**
 * 포갠 뒤에 쓰는 마무리 — **자를 다시 재지 않는다.**
 *
 * 왜 따로 두나: 옛 그림에 포개 놓고 다시 `normalize2` 를 돌리면 그 순간 2%/98% 자를
 * **다시 재서** 살짝 늘리거나 줄인다. 그러면 애써 포갠 자세가 조금 어긋나고, 그 어긋남이
 * 판마다 쌓인다. 실측: **글이 하나도 안 바뀐 두 판에서도 중간 0.018 씩 기어갔다.**
 * 포개기의 목적이 「옛 자리에 그대로 얹기」인데 마무리가 그걸 도로 흐트러뜨린 것이다.
 *
 * 그래서 여기서는 자를 안 댄다. 밖으로 나간 점만 접고(clamp), 자릿수만 맞춘다.
 * 포갠 결과가 옛 그림과 같으면 **그대로 같게 나온다**(멱등).
 */
function finishAligned(pts) {
  return pts.map((p) => [Number(p[0].toFixed(4)), Number(p[1].toFixed(4))]);
}

/**
 * 뼈대 (mapper) — 점 구름 말고 **덩어리를 잇는 그림**.
 *
 * 사용자가 본 원본이 쓴 방식이다. 자리 잡기(UMAP)는 점 하나하나를 놓지만,
 * 이건 「무엇이 무엇으로 이어지는가」를 뼈대로 보여준다:
 *   ① 렌즈로 한 줄 세운다(우리는 뜻자리 가로축)
 *   ② 겹치는 구간으로 자른다  ③ 구간마다 묶는다
 *   ④ 같은 글을 나눠 가진 묶음끼리 잇는다
 *
 * 겹치는 구간이 핵심이다 — 안 겹치면 이음이 안 생겨 그냥 막대 그래프가 된다.
 *
 * ⚠ 렌즈·구간 수·겹침을 조금만 바꿔도 그림이 확 달라진다. 그래서 값을 박아 둔다.
 * ⚠ 이건 **다른 그림이지 더 정확한 그림이 아니다.** 정직도 자는 점 자리에만 걸린다.
 */
const MAPPER_BINS = 12;      // 구간 수. 적으면 뭉뚱그려지고 많으면 부스러진다
const MAPPER_OVERLAP = 0.3;  // 구간이 서로 겹치는 정도. 이게 0 이면 이음이 안 생긴다
const MAPPER_MIN = 3;        // 이보다 작은 묶음은 마디로 안 친다 (점 하나짜리 마디는 소음)

/**
 * 뼈대 손잡이를 **안정도로 고른다** (TASK-KAR-233).
 *
 * 구간 수·겹침은 여태 손으로 박아 둔 값(12·0.3)이었다. 흔들어 보니 마디·이음 수는
 * 안정인데 **조각(연결 요소) 수가 튀었다** — 구간 12 면 4조각, 13 이면 1조각, 18 이면 6조각.
 * 즉 「지도가 몇 조각으로 끊겼다」는 말은 데이터가 아니라 **내가 고른 숫자**가 만든 것이었다.
 *
 * 우리가 하는 것 = 그리드를 쓸어 **불안정도가 낮은 고대**를 고르기(brute-force).
 * ⚠ 인용을 바로잡는다: Carrière–Michel–Oudot(JMLR 2018)은 이 방식을 **권고한 게 아니라
 * 대체하려고** 쓴 논문이다 — 초록이 「많은 손잡이를 시험해 가장 안정한 걸 고르는
 * brute-force 를 **피하려고**」라고 못 박는다. 그들은 1차원 mapper 가 Reeb 그래프의 최적
 * 추정량임을 보이고 그로부터 손잡이를 자동으로 정하며 **특징(고리·가지)의 신뢰 구간**까지 낸다.
 * 우리는 아직 그 추정량을 안 쓴다 — 그러니 「문헌의 권고대로 한다」가 아니라
 * 「문헌이 넘어서려 한 방식을 쓰고 있다」가 정확한 말이다.
 * 흔드는 법 세 가지: 구간 ±1 · 겹침 ±0.05 · 글 90%만 다섯 판.
 *
 * 고른 뒤에도 **흔들림 폭을 같이 적는다.** 폭 0 이라야 「3조각이다」라고 말할 수 있고,
 * 폭이 있으면 화면에도 그렇게 적어야 한다 — 안 적으면 손잡이가 만든 모양을 데이터로 읽는다.
 */
/**
 * **렌즈** — mapper 의 나머지 절반 (TASK-KAR-233).
 *
 * mapper 는 「어느 방향으로 자료를 훑을까」로 시작한다. 문헌의 정본 후보는 밀도 ·
 * 괴짜성(eccentricity) · 좌표 투영 · 주성분이고, **자동 탐색으로 고르라**고 못 박는다
 * (「렌즈·덮개·군집 중 하나만 바꿔도 mapper 그래프가 확 달라진다」).
 *
 * 우리는 여태 **가로축 하나로 박아** 두고 손잡이(구간 수·겹침)만 쓸었다. 훑는 방향은
 * 안 고르면서 눈금만 고른 셈이다. 넷을 다 쓸어 **흔들림이 가장 작은 렌즈**를 쓴다.
 *
 * `f` = 구간을 자를 값(렌즈), `g` = 구간 **안에서** 다시 가를 값.
 * 좌표 렌즈면 나머지 좌표가 자연스러운 짝이고, 밀도·괴짜성처럼 자리와 무관한 렌즈는
 * 가로축을 짝으로 둔다(무엇을 쓰든 일관되기만 하면 된다 — 여기 적어 둔다).
 */
const LENSES = ['x', 'y', '밀도', '괴짜성'];

function lensOf(pts, kind) {
  if (kind === 'x') return pts.map((p) => ({ ...p, f: p.x, g: p.y }));
  if (kind === 'y') return pts.map((p) => ({ ...p, f: p.y, g: p.x }));
  const n = pts.length;
  /* 밀도·괴짜성은 모든 쌍을 봐야 한다 — 1908점이면 180만 쌍, 한 판에 몇 백 ms 다. */
  const val = new Float64Array(n);
  if (kind === '괴짜성') {
    /* 괴짜성 = 남들에게서 얼마나 멀리 떨어져 있나(평균 거리). 가운데가 낮고 변두리가 높다. */
    for (let i = 0; i < n; i += 1) {
      let s = 0;
      for (let j = 0; j < n; j += 1) s += Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      val[i] = s / n;
    }
  } else {
    /* 밀도 = 가까운 열 이웃까지 평균 거리의 **역수**. 빽빽할수록 크다. */
    const K = 10;
    for (let i = 0; i < n; i += 1) {
      const near = new Float64Array(K).fill(Infinity);
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d >= near[K - 1]) continue;
        let q = K - 1;
        while (q > 0 && near[q - 1] > d) { near[q] = near[q - 1]; q -= 1; }
        near[q] = d;
      }
      let s = 0; let c = 0;
      for (const d of near) if (Number.isFinite(d)) { s += d; c += 1; }
      val[i] = c ? 1 / (s / c + 1e-9) : 0;
    }
  }
  return pts.map((p, i) => ({ ...p, f: val[i], g: p.x }));
}

const GRID_BINS = [9, 10, 11, 12, 13, 14, 15, 16];
const GRID_OVERLAP = [0.2, 0.25, 0.3, 0.35, 0.4];

/**
 * **이음이 서로 넘나드는 횟수** — 그림이 읽히나.
 *
 * 렌즈를 흔들림·마디 수로만 고르면 「안 흔들리고 마디 많은」 렌즈가 이긴다. 그런데
 * 괴짜성 렌즈는 구간이 **고리**가 돼서 마디 중심이 죄다 가운데로 몰리고, 이음 53개 중
 * 30개가 서로를 가로질렀다(실타래). 자는 그걸 빨갛다고 하는데 굽는 쪽은 그걸 골랐다 —
 * **고르는 잣대와 재는 잣대가 달랐다.** 그래서 여기서도 센다.
 */
/**
 * **그린 거리가 그래프 거리와 맞나** (stress) — 전체 충실도.
 *
 * 자 하나로 그림을 판정하면 안 된다(「같은 자 값, 전혀 다른 그림」, 2025). 그리고 자끼리
 * 싸운다 — **stress 는 전체 충실도, 얽힘은 읽히기**이고 둘은 음의 상관이다(자 지형, 2024).
 * 그래서 얽힘만 보고 렌즈를 고르던 것을 셋으로 늘린다.
 *
 * 크기는 맞춰 준다(자리 단위와 걸음 수는 단위가 다르다) — 가장 잘 맞는 배율 `s` 를 먼저 찾고
 * 그 뒤에 어긋남을 잰다. 0 이면 완벽, 1 이면 「다 한 점에 몰아둔 것」만큼 나쁘다.
 * 이어지지 않은 마디 쌍(조각이 다르면 걸음이 무한)은 셈에서 뺀다 — 몇 쌍을 셌는지 같이 싣는다.
 */
function graphDist(n, links) {
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of links) { adj[i].push(j); adj[j].push(i); }
  const D = Array.from({ length: n }, () => new Float64Array(n).fill(Infinity));
  for (let s0 = 0; s0 < n; s0 += 1) {
    D[s0][s0] = 0;
    const q = [s0];
    for (let h = 0; h < q.length; h += 1) {
      const cur = q[h];
      for (const nx of adj[cur]) if (!Number.isFinite(D[s0][nx])) { D[s0][nx] = D[s0][cur] + 1; q.push(nx); }
    }
  }
  return { D, adj };
}

function stressOf(P, D) {
  const n = P.length;
  let num = 0; let den = 0; let pairs = 0;
  /* 가장 잘 맞는 배율부터 — 무게 1/d² 는 가까운 쌍을 더 중히 본다(정본 관례). */
  let a = 0; let b = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = D[i][j];
      if (!Number.isFinite(d) || d === 0) continue;
      const e = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
      const w = 1 / (d * d);
      a += w * d * e; b += w * e * e; pairs += 1;
    }
  }
  const scale = b > 0 ? a / b : 1;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = D[i][j];
      if (!Number.isFinite(d) || d === 0) continue;
      const e = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) * scale;
      const w = 1 / (d * d);
      num += w * (e - d) * (e - d); den += w * d * d;
    }
  }
  return { stress: den > 0 ? num / den : null, pairs, scale };
}

/**
 * **이웃 지킴** — 그래프에서 이웃인 마디가 그림에서도 이웃인가 (자카드).
 * 마디마다 「그래프 이웃 집합」과 「그림에서 가장 가까운 같은 수의 마디」를 견준다.
 * 1 이면 이웃이 그대로, 0 이면 하나도 안 겹친다.
 */
function neighborKeep(P, adj) {
  const n = P.length;
  let sum = 0; let counted = 0;
  for (let i = 0; i < n; i += 1) {
    const k = adj[i].length;
    if (!k) continue;
    const order = [];
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      order.push([Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]), j]);
    }
    order.sort((x, z) => x[0] - z[0]);
    const drawn = new Set(order.slice(0, k).map((o) => o[1]));
    const graph = new Set(adj[i]);
    let inter = 0;
    for (const j of drawn) if (graph.has(j)) inter += 1;
    sum += inter / (drawn.size + graph.size - inter); counted += 1;
  }
  return counted ? sum / counted : null;
}

/**
 * **매어 둔 채 stress 줄이기** (TASK-KAR-233).
 *
 * 그래프를 잘 그리는 정본은 **stress 줄이기**(SMACOF)다 — 용수철 흉내와 달리 **판마다
 * stress 가 반드시 줄어든다는 보장**이 있다(단조 수렴). 그런데 우리 뼈대는 그냥 다시
 * 그리면 안 된다: 마디 자리가 **지도 자리**라는 약속이 있고, 사람이 뼈대와 점 지도를
 * 겹쳐 읽는다. 그래서 WebCoLa/SetCoLa 의 **guides**(자리에 매기)처럼 **매는 힘**을 같이 건다.
 *
 * 한 마디의 다음 자리 =
 *   ( Σ_j w_ij · (x_j + d_ij·(x_i−x_j)/‖x_i−x_j‖) + λ·(원래 자리) ) / ( Σ_j w_ij + λ )
 * w_ij = 1/d²(가까운 쌍을 더 중히), d = 걸음 수 × 한 걸음 길이.
 * **λ 는 박지 않는다** — 쓸어서 고르고, 세 자(얽힘·stress·이웃 지킴) 중 **둘 이상이 나빠지면
 * 아예 안 쓴다.** 자를 세워 놓고 결과를 안 따르는 것이 가장 나쁘다.
 */
/**
 * **뼈대의 고리(H1)** — 자료 안의 **순환** (TASK-KAR-233).
 *
 * 우리는 H0(조각)만 재 왔다. 그런데 mapper 에서 진짜 자랑거리는 **고리**다 — 「이 갈래로
 * 나갔다가 저 갈래로 돌아온다」는 순환이 자료에 있다는 뜻이니까. 용수철 배치를 지속
 * 호몰로지로 푸는 연구(arXiv 2208.06927)도 H1 을 찾아 **강조하는 힘**을 따로 건다.
 *
 * 세는 법은 오일러: **고리 수 = 이음 − 마디 + 조각**. 고리 하나하나는 **BFS 나무**를 세우고
 * 나무에 안 든 이음마다 **그 이음을 뺀 채 두 끝을 잇는 가장 짧은 길**을 찾아 만든다.
 */
function loopsOf(V, E) {
  const adj = Array.from({ length: V }, () => []);
  E.forEach(([i, j], e) => { adj[i].push([j, e]); adj[j].push([i, e]); });
  /* 조각 수와 나무 밖 이음 — 오일러로 셀 재료. */
  const seen = new Array(V).fill(false);
  const inTree = new Array(E.length).fill(false);
  let comps = 0;
  for (let s = 0; s < V; s += 1) {
    if (seen[s]) continue;
    comps += 1; seen[s] = true;
    const q = [s];
    for (let h = 0; h < q.length; h += 1) {
      for (const [nx, e] of adj[q[h]]) {
        if (seen[nx]) continue;
        seen[nx] = true; inTree[e] = true; q.push(nx);
      }
    }
  }
  const rank = E.length - V + comps;
  /* 나무 밖 이음마다 **그 이음을 뺀 가장 짧은 길**로 고리를 만든다. */
  const loops = [];
  for (let e = 0; e < E.length; e += 1) {
    if (inTree[e]) continue;
    const [u, v] = E[e];
    const prev = new Array(V).fill(-1);
    const dist = new Array(V).fill(-1);
    dist[u] = 0;
    const q = [u];
    for (let h = 0; h < q.length && dist[v] < 0; h += 1) {
      for (const [nx, ee] of adj[q[h]]) {
        if (ee === e || dist[nx] >= 0) continue;
        dist[nx] = dist[q[h]] + 1; prev[nx] = q[h]; q.push(nx);
      }
    }
    if (dist[v] < 0) continue;
    const path = [];
    for (let cur = v; cur !== -1; cur = prev[cur]) path.push(cur);
    path.reverse();
    loops.push(path);
  }
  loops.sort((a, b) => a.length - b.length);
  return { rank, comps, loops };
}

/** 자리와 이음만으로 얽힘을 센다 — 자리를 다시 잡은 뒤에도 같은 손으로 세야 한다. */
function crossingsOf2(P, E) {
  const side = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const hit = (p1, p2, p3, p4) => {
    const d1 = side(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
    const d2 = side(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
    const d3 = side(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    const d4 = side(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  let n = 0;
  for (let i = 0; i < E.length; i += 1) {
    for (let j = i + 1; j < E.length; j += 1) {
      const [a1, b1] = E[i]; const [a2, b2] = E[j];
      if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
      if (hit(P[a1], P[b1], P[a2], P[b2])) n += 1;
    }
  }
  return n;
}

const ANCHOR_LAMBDAS = [0, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6];
const ANCHOR_ITERS = 200;

function smacofAnchored(P0, D, lambda, iters = ANCHOR_ITERS) {
  const n = P0.length;
  /* 걸음 수를 자리 단위로 바꾼다 — 처음 그림에 가장 잘 맞는 한 걸음 길이. */
  let a = 0; let b = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = D[i][j];
      if (!Number.isFinite(d) || d === 0) continue;
      const e = Math.hypot(P0[i][0] - P0[j][0], P0[i][1] - P0[j][1]);
      const w = 1 / (d * d);
      a += w * d * e; b += w * e * e;
    }
  }
  const step = b > 0 ? b / a : 1;            // 한 걸음이 자리 단위로 얼마인가
  const T = Array.from({ length: n }, (_, i) => Array.from({ length: n },
    (_, j) => (Number.isFinite(D[i][j]) ? D[i][j] * step : null)));
  const P = P0.map((p) => [p[0], p[1]]);
  const trail = [];
  const stressNow = () => {
    let num = 0; let den = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const d = T[i][j];
        if (d == null || d === 0) continue;
        const e = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
        const w = 1 / (d * d);
        num += w * (e - d) * (e - d); den += w * d * d;
      }
    }
    return den > 0 ? num / den : 0;
  };
  /**
   * ★ **줄이는 것을 재야 단조성이 뜻을 갖는다.**
   *
   * 갱신은 `stress + λ·‖P−P0‖²` 를 줄이는데 `stressNow()` 는 **평범한 stress 만** 잰다.
   * λ>0 이면 평범한 stress 는 **정당하게 오를 수 있고**(앵커를 지키느라), 그걸 「단조성이
   * 깨졌다」로 읽으면 멀쩡한 셈을 고장이라 부르게 된다 — 실제로 자 하나가 그렇게 빨개졌다.
   * 그래서 자취에는 **실제로 줄이는 값**을 남기고, 평범한 stress 는 표에 따로 적는다.
   */
  const objNow = () => {
    let num = 0; let den = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const d = T[i][j];
        if (d == null || d === 0) continue;
        const e = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
        const w = 1 / (d * d);
        num += w * (e - d) * (e - d); den += w * d * d;
      }
    }
    let anchor = 0;
    for (let i = 0; i < n; i += 1) anchor += (P[i][0] - P0[i][0]) ** 2 + (P[i][1] - P0[i][1]) ** 2;
    return den > 0 ? (num + lambda * anchor) / den : 0;
  };
  trail.push(objNow());
  for (let t = 0; t < iters; t += 1) {
    const next = P.map(() => [0, 0]);
    for (let i = 0; i < n; i += 1) {
      let wsum = lambda; let sx = lambda * P0[i][0]; let sy = lambda * P0[i][1];
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const d = T[i][j];
        if (d == null || d === 0) continue;
        const w = 1 / (d * d);
        const dx = P[i][0] - P[j][0]; const dy = P[i][1] - P[j][1];
        const e = Math.hypot(dx, dy) || 1e-9;
        sx += w * (P[j][0] + (d * dx) / e);
        sy += w * (P[j][1] + (d * dy) / e);
        wsum += w;
      }
      next[i][0] = wsum > 0 ? sx / wsum : P[i][0];
      next[i][1] = wsum > 0 ? sy / wsum : P[i][1];
    }
    for (let i = 0; i < n; i += 1) { P[i][0] = next[i][0]; P[i][1] = next[i][1]; }
    if (t % 10 === 9 || t === iters - 1) trail.push(objNow());
  }
  /* **단조 수렴**을 수로 남긴다 — 늘어난 판이 있으면 셈이 틀린 것이다.
     (자취는 **줄이는 값**(stress + λ·앵커)이다. 평범한 stress 는 표에 따로 적는다.) */
  let rose = 0;
  for (let i = 1; i < trail.length; i += 1) if (trail[i] > trail[i - 1] + 1e-9) rose += 1;
  const span = Math.max(...P0.map((p) => p[0])) - Math.min(...P0.map((p) => p[0]))
    + Math.max(...P0.map((p) => p[1])) - Math.min(...P0.map((p) => p[1]));
  let moved = 0;
  for (let i = 0; i < n; i += 1) moved += Math.hypot(P[i][0] - P0[i][0], P[i][1] - P0[i][1]);
  return {
    P,
    rose,
    trail: trail.map((v) => Number(v.toFixed(4))),
    moved: span > 0 ? Number((moved / n / (span / 2)).toFixed(4)) : 0,
  };
}

function crossingsOf(pts, bins, overlap, min = MAPPER_MIN) {
  const groups = binGroups(pts, bins, overlap, min);
  const P = groups.map((g) => [
    g.reduce((a, q) => a + q.x, 0) / g.length,
    g.reduce((a, q) => a + q.y, 0) / g.length,
  ]);
  const sets = groups.map((g) => new Set(g.map((q) => q.id)));
  const E = [];
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      let shared = 0;
      for (const id of sets[j]) if (sets[i].has(id)) shared += 1;
      if (shared) E.push([i, j]);
    }
  }
  const side = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const cross = (p1, p2, p3, p4) => {
    const d1 = side(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
    const d2 = side(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
    const d3 = side(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    const d4 = side(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  let n = 0;
  for (let i = 0; i < E.length; i += 1) {
    for (let j = i + 1; j < E.length; j += 1) {
      const [a1, b1] = E[i]; const [a2, b2] = E[j];
      if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
      if (cross(P[a1], P[b1], P[a2], P[b2])) n += 1;
    }
  }
  /* **자 하나로는 그림을 판정할 수 없다** — 얽힘과 함께 전체 충실도(stress)와
     이웃 지킴도 같이 낸다. 부르는 쪽이 셋을 다 보고 고른다. */
  const { D, adj } = graphDist(P.length, E);
  const st = stressOf(P, D);
  return {
    cross: n,
    links: E.length,
    nodes: P.length,
    stress: st.stress === null ? null : Number(st.stress.toFixed(4)),
    pairs: st.pairs,
    np: (() => { const v = neighborKeep(P, adj); return v === null ? null : Number(v.toFixed(4)); })(),
  };
}

function pickSkeletonParams(pts) {
  /* 씨앗을 박는다 — 매번 같은 흔들기여야 고른 값이 판마다 안 바뀐다. */
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const keep = pts.map(() => Array.from({ length: 5 }, () => rnd() > 0.1));

  let best = null;
  const table = [];
  const cands = [];
  for (const lens of LENSES) {
    const lp = lensOf(pts, lens);
    const subs = [];
    for (let t = 0; t < 5; t += 1) subs.push(lp.filter((_, i) => keep[i][t]));
    let bestHere = null;
    for (const bins of GRID_BINS) {
      for (const overlap of GRID_OVERLAP) {
        const here = skeletonShape(lp, bins, overlap);
        if (!here.n) continue;
        const shakes = [
          skeletonShape(lp, bins - 1, overlap),
          skeletonShape(lp, bins + 1, overlap),
          skeletonShape(lp, bins, overlap - 0.05),
          skeletonShape(lp, bins, overlap + 0.05),
        ].concat(subs.map((sp) => skeletonShape(sp, bins, overlap)));
        const comps = shakes.map((sh) => sh.comp);
        const spread = Math.max(...comps) - Math.min(...comps);
        const off = comps.filter((c) => c !== here.comp).length / comps.length;
        /* 흔들림이 같으면 **마디가 많은 쪽**을 고른다 — 같은 값이면 자세한 그림이 낫다. */
        const better = !bestHere || spread < bestHere.spread
          || (spread === bestHere.spread && (off < bestHere.off || (off === bestHere.off && here.n > bestHere.n)));
        if (better) {
          bestHere = {
            lens, bins, overlap, spread, off, n: here.n, comp: here.comp,
            lowComp: Math.min(...comps), highComp: Math.max(...comps),
          };
        }
      }
    }
    if (!bestHere) continue;
    /* **그림이 읽히나·맞나를 셋으로 센다** — 얽힘(읽히기)·stress(전체 충실도)·이웃 지킴(가까운 것). */
    const dr = crossingsOf(lensOf(pts, lens), bestHere.bins, bestHere.overlap);
    Object.assign(bestHere, { cross: dr.cross, links: dr.links, stress: dr.stress, np: dr.np, pairs: dr.pairs });
    cands.push(bestHere);
    table.push({ lens, spread: bestHere.spread, off: Number(bestHere.off.toFixed(3)), n: bestHere.n,
      comp: bestHere.comp, cross: dr.cross, stress: dr.stress, np: dr.np });
  }

  /* **렌즈끼리 견주기.** 덜 흔들리는 쪽 → 덜 달라지는 쪽 → **그림 자 셋의 등수 평균** → 마디 많은 쪽.
     셋을 한 수로 더하지 않는다(단위가 다르고, 자끼리 싸운다) — **등수**로 견준다. 표를 같이 실어
     「왜 이 렌즈냐」를 사람이 다시 볼 수 있게 한다. 자 하나만 보면 나쁜 그림도 좋다고 나온다. */
  const rankOf = (key, lowerIsBetter) => {
    const vals = cands.map((c) => (typeof c[key] === 'number' ? c[key] : null));
    const order = cands.map((_, i) => i).filter((i) => vals[i] !== null)
      .sort((x, z) => (lowerIsBetter ? vals[x] - vals[z] : vals[z] - vals[x]));
    const r = new Array(cands.length).fill(cands.length);
    order.forEach((idx, pos) => { r[idx] = pos; });
    return r;
  };
  const rc = rankOf('cross', true);
  const rs = rankOf('stress', true);
  const rn = rankOf('np', false);
  cands.forEach((c, i) => {
    c.rank = Number(((rc[i] + rs[i] + rn[i]) / 3).toFixed(3));
    const row = table.find((t) => t.lens === c.lens);
    if (row) row.rank = c.rank;
  });
  for (const c of cands) {
    const win = !best || c.spread < best.spread
      || (c.spread === best.spread && (c.off < best.off
        || (c.off === best.off && (c.rank < best.rank
          || (c.rank === best.rank && c.n > best.n)))));
    if (win) best = c;
  }
  if (best) best.table = table;
  return best;
}

/** 마디들이 몇 조각으로 이어지나 — 글을 나눠 가지면 이어진 것으로 본다. (이음 수도 같이 센다.) */
function componentsOf(sets) {
  const par = sets.map((_, i) => i);
  const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  let e = 0;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      let shared = false;
      for (const id of sets[j]) if (sets[i].has(id)) { shared = true; break; }
      if (shared) { e += 1; par[find(i)] = find(j); }
    }
  }
  return { comp: new Set(sets.map((_, i) => find(i))).size, e };
}

/** 모양만 센다 (마디 수·이음 수·조각 수). 고르는 데엔 이것이면 충분하다. */
function skeletonShape(pts, bins, overlap, min = MAPPER_MIN) {
  if (bins < 2 || overlap < 0) return { n: 0, e: 0, comp: 0 };
  const groups = binGroups(pts, bins, overlap, min);
  const sets = groups.map((g) => new Set(g.map((p) => p.id)));
  const { comp, e } = componentsOf(sets);
  return { n: sets.length, e, comp };
}

/**
 * **이 마디가 자료의 것인가, 이 한 판의 것인가** (TASK-KAR-233).
 *
 * mapper 의 덤(Carrière–Michel–Oudot)은 손잡이 자동 결정만이 아니다 — **특징의 신뢰 구간**
 * 이 같이 온다. 지금 우리는 손잡이를 고를 때만 흔들어 보고, **다 고른 뒤에 그린 그림은
 * 한 판**이다. 그 그림의 마디 하나하나가 흔들어도 남는지는 아무도 안 물었다.
 *
 * 흔드는 법이 중요하다. 처음엔 **글만 열에 하나씩** 뺐는데, 그러면 마디는 거의 다
 * 살아남는다(평균 0.956) — 그런데 **자리를 마구 섞은 점도 89%가 살아남았다.** 마디를
 * 정하는 것이 자료가 아니라 **눈금 자리**였기 때문이다. 그래서 판마다 **눈금판도 옆으로 민다**
 * (구간 너비의 0~1배). 눈금을 밀어도 같은 자리에 다시 뭉치는 마디만 자료의 것이다.
 *
 * 그래서 글을 열에 하나씩 빼고 눈금을 밀며 스무 판을 다시 짓고 두 가지를 싣는다:
 *  ① **조각 수 분포** — 스무 판 중 몇 판이 같은 조각 수를 냈나
 *  ② **마디마다 살아남은 판 수** — 같은 마디로 볼 짝이 있었나
 *
 * 「같은 마디」의 잣대(자카드 문턱)도 **박지 않고 쓸어서 고른다.** 0.5 로 박아 뒀더니
 * 마구 섞은 점도 0.64 가 살아남았다 — 겹치는 창이 1.7 구간 너비라, 눈금을 밀어도
 * 창끼리 자카드 0.55 쯤은 그냥 나오기 때문이다(문턱이 하필 그 자리였다).
 * 그래서 **자리를 마구 섞은 대조군**을 같이 돌리고, 우리와 대조군의 차가 가장 큰 문턱을 쓴다.
 *
 * 그리고 **대조군 값을 같이 싣는다.** 이게 핵심이다 — 「85% 살아남았다」는 말은
 * 「마구 섞어도 64% 는 살아남는다」와 나란히 놓지 않으면 아무 뜻이 없다.
 * 뺀 글은 셈에서 먼저 지운다(안 지우면 뺀 만큼이 그냥 벌점이 된다).
 */
const CONF_RUNS = 20;
const CONF_KEEP = 0.9;
const CONF_SAMES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];

/** 스무 판을 흔들며 **마디마다 가장 닮은 짝의 자카드**를 모은다 (문턱은 아직 안 건다). */
function shakeJaccard(pts, base, lens, bins, overlap, seed0) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const J = base.map(() => []);
  const comps = new Map();
  for (let t = 0; t < CONF_RUNS; t += 1) {
    const kept = pts.filter(() => rnd() < CONF_KEEP);
    const keepIds = new Set(kept.map((p) => p.id));
    const shift = rnd();
    /* 렌즈 값도 **남은 점으로 다시 매긴다** — 밀도·괴짜성은 누가 남았나에 따라 달라진다. */
    const sets = binGroups(lensOf(kept, lens), bins, overlap, MAPPER_MIN, shift).map((g) => new Set(g.map((p) => p.id)));
    const c = componentsOf(sets).comp;
    comps.set(c, (comps.get(c) || 0) + 1);
    for (let i = 0; i < base.length; i += 1) {
      const A = base[i].filter((id) => keepIds.has(id));
      if (!A.length) { J[i].push(0); continue; }
      let best = 0;
      for (const B of sets) {
        let inter = 0;
        for (const id of A) if (B.has(id)) inter += 1;
        if (!inter) continue;
        const j = inter / (A.length + B.size - inter);
        if (j > best) best = j;
      }
      J[i].push(best);
    }
  }
  return { J, comps };
}

function nodeConfidence(pts, nodes, lens, bins, overlap) {
  /* 씨앗을 박는다 — 손잡이 고르기와 **다른** 씨앗이어야 한다(같으면 같은 흔들기를 두 번 본다). */
  const mine = shakeJaccard(pts, nodes.map((nd) => nd.ids), lens, bins, overlap, 29);

  /* **대조군**: 점 개수도 퍼진 범위도 그대로고 **자리만 마구 섞는다** — 구조만 없앤 지도.
     같은 손잡이로 같은 흔들기를 겪게 한다. */
  let seed = 101;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const lo = [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y))];
  const hi = [Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
  const shuf = pts.map((p) => ({ id: p.id, lane: p.lane,
    x: lo[0] + rnd() * (hi[0] - lo[0]), y: lo[1] + rnd() * (hi[1] - lo[1]) }));
  const shufBase = binGroups(lensOf(shuf, lens), bins, overlap, MAPPER_MIN).map((g) => g.map((p) => p.id));
  const rand = shakeJaccard(shuf, shufBase, lens, bins, overlap, 29);

  /* 문턱을 쓸어 **우리와 대조군의 차가 가장 큰 자리**를 고른다. */
  const rate = (J, t) => { const f = J.flat(); return f.length ? f.filter((v) => v >= t).length / f.length : 0; };
  const curve = CONF_SAMES.map((t) => {
    const a = rate(mine.J, t); const b = rate(rand.J, t);
    return { at: t, mine: Number(a.toFixed(3)), rand: Number(b.toFixed(3)), gap: Number((a - b).toFixed(3)) };
  });
  const pick = curve.reduce((best, c) => (c.gap > best.gap ? c : best), curve[0]);
  const CONF_SAME = pick.at;

  const hits = mine.J.map((row) => row.filter((v) => v >= CONF_SAME).length);
  const comps = mine.comps;
  const dist = [...comps.entries()].sort((a, z) => z[1] - a[1] || a[0] - z[0]);
  const survival = hits.map((h) => Number((h / CONF_RUNS).toFixed(2)));
  /* **문턱을 박지 않는다.** 「반도 못 버틴 마디」로 세니 0개였는데, 스무 판을 다 버티지
     못한 마디는 여덟이었다 — 0.5 는 내가 고른 수일 뿐이고 그 수가 있는 것을 없다고 했다.
     그래서 흔들리는 마디 = **한 판이라도 사라진 적이 있는 마디**(비율 1 미만)로 센다. */
  const shaky = survival.filter((v) => v < 1).length;
  return {
    runs: CONF_RUNS,
    keep: CONF_KEEP,
    /* 「같은 마디」 문턱 — 박은 값이 아니라 대조군과의 차로 **고른** 값이다. */
    same: CONF_SAME,
    curve,
    /* **마구 섞은 지도도 이만큼은 살아남는다.** 우리 값은 이것과 나란히 봐야 뜻이 있다. */
    baseline: pick.rand,
    ratio: pick.mine ? Number((pick.rand / pick.mine).toFixed(2)) : null,
    comps: dist,
    mode: dist.length ? dist[0][0] : null,
    modeRuns: dist.length ? dist[0][1] : 0,
    survival,
    full: survival.length - shaky,
    shaky,
    min: survival.length ? Math.min(...survival) : null,
    mean: survival.length ? Number((survival.reduce((a, v) => a + v, 0) / survival.length).toFixed(3)) : null,
  };
}

/** 구간으로 자르고 구간 안에서 세로로 묶는다 — 뼈대 만들기와 고르기가 **같은 손**을 쓴다. */
function binGroups(pts, bins, overlap, min, shift = 0) {
  /* `f`(렌즈 값)로 자르고 `g`(짝 값)로 다시 가른다. 렌즈를 안 매긴 점이 오면 옛 뜻대로
     가로축을 쓴다 — 부르는 자리가 여럿이라 여기서 받아 준다. */
  const xs = pts.map((p) => (p.f ?? p.x));
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const w = (hi - lo) / bins;
  const ext = w * overlap;
  /* `shift` = **눈금판 자체를 옆으로 민다**(구간 너비의 몇 분의 몇). 0 이면 옛 그대로.
     이걸 안 흔들면 「글을 좀 빼도 마디가 남나」는 늘 「남는다」다 — 마디를 정하는 것이
     자료가 아니라 **눈금 자리**이기 때문이다(실측: 마구 섞은 점도 89% 살아남았다). */
  const start = lo - shift * w;
  const nb = shift > 0 ? bins + 1 : bins;
  const out = [];
  for (let b = 0; b < nb; b += 1) {
    const s = start + b * w - ext;
    const e = start + (b + 1) * w + ext;
    const inBin = pts.filter((p) => (p.f ?? p.x) >= s && (p.f ?? p.x) <= e);
    if (inBin.length < min) continue;
    /* 구간 안에서 세로로 묶는다. 가장 크게 벌어진 두 자리에서 자른다 —
       구간이 좁으므로 이 정도면 충분하고, 무거운 묶기를 또 돌릴 이유가 없다. */
    const ys = inBin.map((p) => (p.g ?? p.y)).sort((a, z) => a - z);
    const gaps = [];
    for (let i = 1; i < ys.length; i += 1) gaps.push([ys[i] - ys[i - 1], i]);
    gaps.sort((a, z) => z[0] - a[0]);
    const cuts = gaps.slice(0, 2).map((g) => ys[g[1]]).sort((a, z) => a - z);
    const parts = [[], [], []];
    for (const p of inBin) {
      const gv = (p.g ?? p.y);
      const g = gv < cuts[0] ? 0 : (cuts[1] !== undefined && gv < cuts[1] ? 1 : 2);
      parts[g].push(p);
    }
    for (const g of parts) if (g.length >= min) out.push(g);
  }
  return out;
}

/**
 * **눈금 사다리 — 한 눈금을 고르지 말고 탑을 쌓는다** (TASK-KAR-233).
 *
 * 보통 mapper 는 덮개를 **한 눈금**으로 잡은 한 장면만 준다. Multiscale Mapper
 * (Dey·Mémoli·Wang, SODA 2016)는 구간 길이를 바꿔 가며 **덮개의 탑**을 쌓고 층 사이를
 * 사상으로 이어, mapper 를 **지속 모듈**로 만든다 — 여러 눈금에 걸쳐 살아남는 특징이
 * 진짜고, **한 눈금에서만 나타나는 특징은 눈금이 만든 것**이다.
 *
 * 우리가 지속을 재던 축은 둘뿐이었다: 반지름(H0)과 표본·눈금 밀기(마디 신뢰도).
 * 정작 mapper 고유의 축인 **눈금 수**로는 한 번도 안 재 봤다 — 구간 16 하나를 골라 그렸다.
 *
 * 층 잇기 = **부모 찾기**. 눈금을 촘촘히 하면 조각이 **갈라진다** — 그러니 촘촘한 층의
 * 조각마다 「제 글을 가장 많이 품은」 성긴 층의 조각을 부모로 삼는다(문턱을 안 박는다,
 * 가장 많이 품은 하나면 된다). 그러면 층들이 **합쳐지는 나무**가 된다.
 *
 * ★ 처음엔 「절반 넘게 겹치면 같은 것」으로 **다 이어 붙였다**. 그러면 갈라짐이 통째로
 * 뭉개져 조각 셋이 막대 둘로 나왔다 — 탑을 쌓아 놓고 다시 한 장면으로 눌러 버린 셈이다.
 * 지금은 **어른 규칙**을 쓴다: 한 부모에 여러 자식이 오면 **큰 자식이 이어 가고 작은 자식은
 * 그 눈금에서 죽는다**(H0·HDBSCAN 에서 쓰는 것과 같은 규칙). 오래 사는 막대가 진짜다.
 */
const TOWER_BINS = [8, 10, 12, 14, 16, 20, 24];

function componentSets(pts, bins, overlap) {
  const groups = binGroups(pts, bins, overlap, MAPPER_MIN);
  const sets = groups.map((g) => new Set(g.map((p) => p.id)));
  const par = sets.map((_, i) => i);
  const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      let shared = false;
      for (const id of sets[j]) if (sets[i].has(id)) { shared = true; break; }
      if (shared) par[find(i)] = find(j);
    }
  }
  const byRoot = new Map();
  sets.forEach((st, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, new Set());
    for (const id of st) byRoot.get(r).add(id);
  });
  return [...byRoot.values()].sort((a, b) => b.size - a.size);
}

function mapperTower(pts, lens, overlap) {
  const lp = lensOf(pts, lens);
  const levels = TOWER_BINS.map((bins) => ({ bins, comps: componentSets(lp, bins, overlap) }));

  /* 촘촘한 층(k)의 조각마다 **제 글을 가장 많이 품은** 성긴 층(k-1)의 조각을 부모로. */
  const parent = levels.map(() => []);
  for (let k = 1; k < levels.length; k += 1) {
    levels[k].comps.forEach((c, i) => {
      let best = -1; let bestN = 0;
      levels[k - 1].comps.forEach((p, j) => {
        let inter = 0;
        for (const id of c) if (p.has(id)) inter += 1;
        if (inter > bestN) { bestN = inter; best = j; }
      });
      parent[k][i] = bestN > 0 ? best : -1;
    });
  }

  /* **어른 규칙**으로 촘촘한 쪽에서 성긴 쪽으로 올라간다. 한 부모에 여럿이 오면
     큰 자식이 이어 가고, 작은 자식은 **그 눈금에서 죽는다**. */
  const bars = [];
  /* chain[k][i] = 그 조각을 지금 이어 가고 있는 막대 번호 (없으면 새로 태어난다) */
  const chain = levels.map((L) => new Array(L.comps.length).fill(-1));
  for (let k = levels.length - 1; k >= 0; k -= 1) {
    levels[k].comps.forEach((c, i) => {
      if (chain[k][i] < 0) {
        chain[k][i] = bars.length;
        bars.push({ from: levels[k].bins, to: levels[k].bins, span: 1, size: c.size, died: null });
      }
    });
    if (k === 0) break;
    /* 부모마다 자식을 모아 큰 자식에게 막대를 넘긴다. */
    const kids = new Map();
    levels[k].comps.forEach((c, i) => {
      const p = parent[k][i];
      if (p < 0) return;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(i);
    });
    for (const [p, list] of kids) {
      list.sort((a, b) => levels[k].comps[b].size - levels[k].comps[a].size);
      const elder = list[0];
      const bar = bars[chain[k][elder]];
      chain[k - 1][p] = chain[k][elder];
      bar.from = levels[k - 1].bins; bar.span += 1;
      bar.size = Math.max(bar.size, levels[k - 1].comps[p].size);
      for (const y of list.slice(1)) {
        /* 작은 자식은 여기서 죽는다 — 「이 눈금부터 갈라져 나온다」는 뜻이다. */
        bars[chain[k][y]].died = levels[k - 1].bins;
      }
    }
  }
  const out = bars
    .map((b) => ({ from: b.from, to: b.to, span: b.span, size: b.size, died: b.died }))
    .sort((x, z) => z.span - x.span || z.size - x.size);
  /* **고리도 눈금마다 센다** — 한 눈금에서만 나오는 고리는 눈금이 만든 것이다. */
  const loopByBins = TOWER_BINS.map((bins) => {
    const groups = binGroups(lp, bins, overlap, MAPPER_MIN);
    const sets = groups.map((g) => new Set(g.map((p) => p.id)));
    const ee = [];
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        let shared = false;
        for (const id of sets[j]) if (sets[i].has(id)) { shared = true; break; }
        if (shared) ee.push([i, j]);
      }
    }
    return { bins, loops: loopsOf(sets.length, ee).rank };
  });
  return {
    overlap,
    lens,
    bins: TOWER_BINS,
    loopByBins,
    counts: levels.map((L) => ({ bins: L.bins, comps: L.comps.length })),
    bars: out,
    full: out.filter((b) => b.span === TOWER_BINS.length).length,
    once: out.filter((b) => b.span === 1).length,
  };
}

/**
 * **있을 법한 결과 그림(HOPs)** — 흔든 판을 **그림째로** 남긴다 (TASK-KAR-233).
 *
 * 우리는 불확실성을 **글로만** 적어 왔다(바탕값·찍기·붓스트랩 띠·섞은 대조군이 전부 문장).
 * Hullman·Resnick·Adar(PLOS One 2015)의 답: **분포에서 뽑은 판들을 그대로 보여 주라** —
 * 오차막대·바이올린보다 순서·비교 판단이 정확해진다. 눈이 여러 판을 저절로 요약하고,
 * **붙들고 볼 「그 하나의 답」이 없어** 불확실성을 안 무시하게 되기 때문이다.
 *
 * 우리는 이미 스무 판을 흔들어 보고 있었다(마디 신뢰도) — 그런데 **그 판들을 버리고
 * 비율만 남겼다.** 이제 판마다 마디 자리·이음을 그대로 싣는다. 흔드는 손은 신뢰도와
 * **같다**(글 열에 하나 빼기 + 눈금판 밀기) — 화면이 보여 주는 흔들림과 화면이 적는
 * 수가 **같은 흔들기에서 나와야** 한다.
 */
function hopDraws(pts, lens, bins, overlap, lambda) {
  let seed = 29;   // 마디 신뢰도와 **같은 씨앗** — 같은 스무 판이어야 한다
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = [];
  for (let t = 0; t < CONF_RUNS; t += 1) {
    const kept = pts.filter(() => rnd() < CONF_KEEP);
    const shift = rnd();
    const groups = binGroups(lensOf(kept, lens), bins, overlap, MAPPER_MIN, shift);
    if (!groups.length) { out.push({ nodes: [], links: [] }); continue; }
    const P = groups.map((g) => [
      g.reduce((a, q) => a + q.x, 0) / g.length,
      g.reduce((a, q) => a + q.y, 0) / g.length,
    ]);
    const sizes = groups.map((g) => g.length);
    const sets = groups.map((g) => new Set(g.map((q) => q.id)));
    const E = [];
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        let shared = false;
        for (const id of sets[j]) if (sets[i].has(id)) { shared = true; break; }
        if (shared) E.push([i, j]);
      }
    }
    /* 진짜 그림과 **같은 손질**을 해야 견줄 수 있다 — 자리를 다시 잡았으면 판들도 그렇게. */
    let Q = P;
    if (lambda != null && P.length > 2) {
      const { D } = graphDist(P.length, E);
      Q = smacofAnchored(P, D, lambda).P;
    }
    out.push({
      nodes: Q.map((q, i) => [Number(q[0].toFixed(3)), Number(q[1].toFixed(3)), sizes[i]]),
      links: E,
    });
  }
  return out;
}

function buildSkeleton(docs, coords) {
  const pts = [];
  for (const d of docs) {
    const xy = coords.get(d.id);
    if (xy) pts.push({ id: d.id, x: xy[0], y: xy[1], lane: d.lane });
  }
  if (pts.length < 30) return null;

  /* 손잡이는 **재서 고른다**. 손으로 박아 둔 12·0.3 은 40자리 중 29위였고, 흔들면
     조각 수가 3까지 벌어졌다 — 그 그림의 「몇 조각」은 데이터가 아니라 그 숫자였다. */
  const best = pickSkeletonParams(pts);
  const bins = best ? best.bins : 12;
  const overlap = best ? best.overlap : 0.3;
  /* **고른 렌즈로 다시 매겨** 그린다 — 고르기와 그리기가 같은 손을 써야 한다. */
  const lens = best ? best.lens : 'x';
  const lpts = lensOf(pts, lens);

  const nodes = [];
  for (const g of binGroups(lpts, bins, overlap, MAPPER_MIN)) {
    const cx = g.reduce((a, p) => a + p.x, 0) / g.length;
    const cy = g.reduce((a, p) => a + p.y, 0) / g.length;
    const lanes = new Map();
    for (const p of g) lanes.set(p.lane, (lanes.get(p.lane) || 0) + 1);
    const who = [...lanes.entries()].sort((a, z) => z[1] - a[1])[0][0];
    nodes.push({ xy: [Number(cx.toFixed(4)), Number(cy.toFixed(4))], n: g.length, lane: who, ids: g.map((p) => p.id) });
  }

  /* 같은 글을 나눠 가진 마디끼리 잇는다 — 겹치는 구간 덕에 생기는 이음이다. */
  const links = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const set = new Set(nodes[i].ids);
    for (let j = i + 1; j < nodes.length; j += 1) {
      let shared = 0;
      for (const id of nodes[j].ids) if (set.has(id)) shared += 1;
      if (shared > 0) links.push([i, j, shared]);
    }
  }
  /* **다 고른 뒤의 한 판**도 흔들어 본다 — 손잡이만 흔들고 그림은 안 흔들면 반쪽이다. */
  const confidence = nodeConfidence(pts, nodes, lens, bins, overlap);
  /* **그린 그림 자체를 잰다** — 고를 때 쓴 값이 아니라 **실제로 그려질 마디·이음**으로 다시.
     (고르기는 표본·손잡이가 조금 다를 수 있다. 화면에 적는 수는 그려진 그림의 것이어야 한다.) */
  const P = nodes.map((nd) => nd.xy);
  const E = links.map(([i, j]) => [i, j]);
  const { D, adj } = graphDist(P.length, E);
  const st = stressOf(P, D);
  const npv = neighborKeep(P, adj);
  const crossHere = crossingsOf2(P, E);
  const before = {
    cross: crossHere,
    stress: st.stress === null ? null : Number(st.stress.toFixed(4)),
    np: npv === null ? null : Number(npv.toFixed(4)),
    /* **원래 자리를 같이 싣는다.** 「옮겼다」는 표시만 실으면 그 표시를 지우는 것으로
       숨길 수 있다(자가 그걸 못 잡는 걸 망가뜨림 판이 보여 줬다). 자리를 실어 두면
       자가 **스스로 재서** 「옮겨 놓고 입 다물었다」를 잡는다. */
    xy: P.map((p) => [Number(p[0].toFixed(4)), Number(p[1].toFixed(4))]),
  };

  /* **매어 둔 채 stress 줄이기** — λ 를 쓸어 보고, 세 자 중 둘 이상이 나빠지면 **안 쓴다**. */
  const anchorTable = [];
  let bestAnchor = null;
  for (const lam of ANCHOR_LAMBDAS) {
    const r = smacofAnchored(P, D, lam);
    const s2 = stressOf(r.P, D);
    const n2 = neighborKeep(r.P, adj);
    const c2v = crossingsOf2(r.P, E);
    const row = {
      lambda: lam,
      cross: c2v,
      stress: s2.stress === null ? null : Number(s2.stress.toFixed(4)),
      np: n2 === null ? null : Number(n2.toFixed(4)),
      moved: r.moved,
      rose: r.rose,
    };
    anchorTable.push(row);
    /* 좋아진 자 수를 센다 — 얽힘은 적을수록, stress 는 낮을수록, 이웃 지킴은 높을수록 좋다. */
    const better = (row.cross < before.cross ? 1 : 0) + (row.stress < before.stress ? 1 : 0)
      + (row.np > before.np ? 1 : 0);
    const worse = (row.cross > before.cross ? 1 : 0) + (row.stress > before.stress ? 1 : 0)
      + (row.np < before.np ? 1 : 0);
    row.better = better; row.worse = worse;
    if (worse < 2 && better >= 2 && (!bestAnchor || row.moved < bestAnchor.moved)) {
      bestAnchor = { ...row, P: r.P, trail: r.trail };
    }
  }
  const usedAnchor = !!bestAnchor;
  if (usedAnchor) {
    bestAnchor.P.forEach((p, i) => { nodes[i].xy = [Number(p[0].toFixed(4)), Number(p[1].toFixed(4))]; });
  }
  /* **고리(H1)** — 자리를 다시 잡기 전후로 안 변한다(이음이 그대로이므로). 한 번만 센다. */
  const h1 = loopsOf(nodes.length, E);
  /* ★ **대조군 없이는 「고리가 있다」가 아무 뜻이 없다.** 겹치는 구간으로 잇는 셈이라
     아무 점 무더기에서도 고리가 날 수 있다. 자리만 마구 섞어 같은 손잡이로 다시 세 본다. */
  const h1Rand = (() => {
    let seed = 313;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const lo = [Math.min(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y))];
    const hi = [Math.max(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.y))];
    const shuf = pts.map((p) => ({ id: p.id, lane: p.lane,
      x: lo[0] + rnd() * (hi[0] - lo[0]), y: lo[1] + rnd() * (hi[1] - lo[1]) }));
    const sets = binGroups(lensOf(shuf, lens), bins, overlap, MAPPER_MIN).map((g) => new Set(g.map((p) => p.id)));
    const ee = [];
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) {
        let shared = false;
        for (const id of sets[j]) if (sets[i].has(id)) { shared = true; break; }
        if (shared) ee.push([i, j]);
      }
    }
    const r = loopsOf(sets.length, ee);
    return { rank: r.rank, nodes: sets.length, links: ee.length };
  })();
  const P2 = nodes.map((nd) => nd.xy);
  const st2 = stressOf(P2, D);
  const np2 = neighborKeep(P2, adj);
  const draw = {
    cross: crossingsOf2(P2, E),
    stress: st2.stress === null ? null : Number(st2.stress.toFixed(4)),
    np: np2 === null ? null : Number(np2.toFixed(4)),
    pairs: st2.pairs,
    links: E.length,
    nodes: P2.length,
    /* **자리를 다시 잡았나, 그대로 뒀나** — 화면이 둘 다 적어야 한다. */
    anchored: {
      used: usedAnchor,
      lambda: usedAnchor ? bestAnchor.lambda : null,
      moved: usedAnchor ? bestAnchor.moved : 0,
      rose: usedAnchor ? bestAnchor.rose : null,
      trail: usedAnchor ? bestAnchor.trail.slice(0, 8) : null,
      before,
      table: anchorTable,
    },
  };
  /* **흔든 판을 그림째로** — 화면이 돌려 보여 준다(HOPs). 신뢰도와 같은 흔들기다. */
  const hops = hopDraws(pts, lens, bins, overlap, usedAnchor ? bestAnchor.lambda : null);
  /* **눈금을 하나 고르지 않고 사다리로도 본다** — 여러 눈금에서 살아남는 조각만 진짜다. */
  const tower = mapperTower(pts, lens, overlap);
  const wobble = best ? { comp: [best.lowComp, best.highComp], off: Number(best.off.toFixed(2)) } : null;
  console.log(`[atlas] 뼈대 — 마디 ${nodes.length}개 · 이음 ${links.length}개 · 렌즈 「${lens}」 · 구간 ${bins} 겹침 ${overlap}`);
  console.log(`[atlas] 뼈대 신뢰도 — 글을 열에 하나씩 빼고 ${confidence.runs}판: 조각 수 `
    + confidence.comps.map(([c, n]) => `${c}개 ${n}판`).join(' · ')
    + ` | 스무 판을 다 버틴 마디 ${confidence.full}/${confidence.survival.length}`
    + ` · 흔들리는 마디 ${confidence.shaky}개 (가장 약한 것 ${Math.round((confidence.min ?? 0) * confidence.runs)}판)`);
  console.log(`[atlas]   문턱은 쓸어서 골랐다 — 자카드 ${confidence.same}`
    + ` (우리 ${confidence.curve.find((c) => c.at === confidence.same).mine} vs 자리를 마구 섞은 지도 ${confidence.baseline}`
    + ` = 대조군이 ${confidence.ratio}배 — **마디의 상당 부분은 눈금이 만든 것이다**)`);
  if (best) {
    console.log(`[atlas] 뼈대 손잡이를 안정도로 골랐다 — 조각 ${best.comp}개, 흔들면 ${best.lowComp}~${best.highComp} (달라짐 ${(best.off * 100).toFixed(0)}%)`);
    if (best.table) {
      console.log('[atlas] 렌즈 표 — ' + best.table.map((t) => `${t.lens}: 흔들림 ${t.spread}·달라짐 ${(t.off * 100).toFixed(0)}%`
        + `·얽힘 ${t.cross}·stress ${t.stress}·이웃 지킴 ${t.np}·등수평균 ${t.rank}·마디 ${t.n}`).join(' | '));
    }
  }
  console.log(`[atlas] 뼈대 그림 자 셋 — 얽힘 ${draw.cross} · stress ${draw.stress} (쌍 ${draw.pairs}개)`
    + ` · 이웃 지킴 ${draw.np}`);
  console.log('[atlas] 매어 둔 채 stress 줄이기 — ' + draw.anchored.table
    .map((r) => `λ${r.lambda}: 얽힘 ${r.cross}·stress ${r.stress}·이웃 ${r.np}·움직임 ${r.moved} (좋아진 자 ${r.better}/나빠진 자 ${r.worse})`)
    .join(' | '));
  console.log(`[atlas]   → ${draw.anchored.used
    ? `**썼다** (λ ${draw.anchored.lambda} · 마디가 반지름의 ${(draw.anchored.moved * 100).toFixed(1)}% 움직임 · 늘어난 판 ${draw.anchored.rose}회)`
    : '**안 썼다** — 어느 λ 도 세 자 중 둘을 좋게 못 만들었다 (원래 자리 그대로)'}`);
  console.log(`[atlas] 흔든 판 ${hops.length}개를 그림째로 실었다 — 마디 `
    + hops.slice(0, 6).map((h) => h.nodes.length).join('·') + ' …'
    + ` (진짜 그림은 마디 ${nodes.length})`);
  console.log(`[atlas] 뼈대 고리(H1) — **${h1.rank}개** (이음 ${E.length} − 마디 ${nodes.length} + 조각 ${h1.comps})`
    + ` · 가장 짧은 고리는 마디 ${h1.loops.length ? h1.loops[0].length : 0}개를 돈다`
    + ` · 길이 ${h1.loops.slice(0, 8).map((l) => l.length).join('·')}`);
  console.log(`[atlas]   자리를 마구 섞으면 — 고리 ${h1Rand.rank}개 (마디 ${h1Rand.nodes} · 이음 ${h1Rand.links})`
    + ` → ${h1.rank > h1Rand.rank * 1.5 ? '우리 고리가 뚜렷이 많다' : '**아무 점 무더기에서도 이만큼 난다 — 고리는 셈이 만든 것이다**'}`);
  console.log(`[atlas] 눈금 사다리 — ` + tower.counts.map((c) => `${c.bins}:${c.comps}조각`).join(' ')
    + ` | 사다리 전 구간을 사는 조각 ${tower.full}개 · 한 눈금에서만 사는 조각 ${tower.once}개`);
  console.log('[atlas]   막대 — ' + tower.bars.slice(0, 6).map((b) => `눈금 ${b.from}~${b.to}(${b.span}층·글 ${b.size})`).join(' · '));
  console.log('[atlas]   눈금마다 고리 — ' + tower.loopByBins.map((c) => `${c.bins}:${c.loops}`).join(' ')
    + ` (고리가 있는 눈금 ${tower.loopByBins.filter((c) => c.loops > 0).length}/${tower.loopByBins.length})`);
  return {
    /* `keep` = 스무 판 중 살아남은 비율. 화면은 이걸로 **약한 마디를 흐리게** 그린다. */
    nodes: nodes.map(({ ids, ...rest }, i) => ({ ...rest, keep: confidence.survival[i] })),
    links,
    confidence,
    /* 고리 — 자료 안의 순환. `loops` 는 마디 번호를 도는 차례로 적는다. */
    h1: {
      rank: h1.rank,
      comps: h1.comps,
      shortest: h1.loops.length ? h1.loops[0].length : 0,
      loops: h1.loops.slice(0, 12),
      /* 자리를 마구 섞은 지도의 고리 수 — 이것 없이 「고리가 있다」는 아무 뜻이 없다. */
      rand: h1Rand,
    },
    /* 어떤 손잡이로 그렸고 흔들면 얼마나 달라지나 — **화면에 같이 적으라고** 싣는다. */
    params: { bins, overlap, min: MAPPER_MIN, lens },
    /* 렌즈 넷을 같은 잣대로 견준 표 — 「왜 이 렌즈냐」를 자가 다시 볼 수 있어야 한다. */
    lensTable: best ? best.table || null : null,
    /* 그린 그림을 잰 자 셋 — **하나만 적으면 나쁜 그림도 좋아 보인다**(2025 논문). */
    draw,
    /* 눈금 사다리 — 조각이 어느 눈금 구간에서 사는가 (Multiscale Mapper). */
    tower,
    /* 흔든 스무 판을 그림째로 — 화면이 400ms 씩 돌려 보여 준다 (HOPs). */
    hops,
    comp: best ? best.comp : null,
    wobble,
  };
}

// ── 덩어리로 묶기 (k-means, 씨앗 고정 = 매번 같은 그림) ────────────────
function kmeans(points, k, rounds = 30) {
  const n = points.length;
  const dim = points[0].length;
  const centers = [];
  for (let i = 0; i < k; i += 1) centers.push(Float64Array.from(points[Math.floor((i + 0.5) * n / k)]));
  const assign = new Int32Array(n);
  for (let r = 0; r < rounds; r += 1) {
    let moved = 0;
    for (let i = 0; i < n; i += 1) {
      let best = 0; let bestD = Infinity;
      for (let c = 0; c < k; c += 1) {
        let d = 0;
        for (let j = 0; j < dim; j += 1) { const t = points[i][j] - centers[c][j]; d += t * t; }
        if (d < bestD) { bestD = d; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; moved += 1; }
    }
    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i += 1) {
      counts[assign[i]] += 1;
      for (let j = 0; j < dim; j += 1) sums[assign[i]][j] += points[i][j];
    }
    for (let c = 0; c < k; c += 1) {
      if (!counts[c]) continue;
      for (let j = 0; j < dim; j += 1) centers[c][j] = sums[c][j] / counts[c];
    }
    if (!moved) break;
  }
  return { assign: Array.from(assign), centers };
}

// ── 덩어리 이름 짓기 ───────────────────────────────────────────────────
// 내가 안 지은 이름이 붙어야 내 쏠림이 남 눈으로 보인다.
//
// 두 층이다. 공짜 층이 먼저 이름을 만들어 두므로 **AI 를 못 불러도 지도는 읽힌다.**
// AI 는 그 위에 더 나은 이름을 덮는다. 하루치가 20번뿐이라(무료 등급) 한 번 지은
// 이름은 캐시에 남긴다 — 같은 식구면 다시 안 부른다.

const NAME_CACHE = path.join(KARMOLAB, 'data', '.memo-atlas-names.json');
function loadNames() {
  try { return JSON.parse(fs.readFileSync(NAME_CACHE, 'utf8')); } catch { return {}; }
}

/**
 * 「아직 안 만난 조합」 — 한 번도 서로를 안 부른 덩어리 짝.
 *
 * 서로 안 이어진 두 무리를 잇는 자리에서 새 생각이 나온다는 것이 정석이다(Burt).
 * 우리 글은 이미 잘 엮여 있다 — 선의 74%가 덩어리를 건너간다. 그래서 굵은 다리를
 * 보여줘 봐야 새로울 게 없다. 값어치는 반대쪽, **한 번도 안 만난 짝**에 있다.
 *
 * 다만 안 만난 짝은 248개나 된다. 다 보여주면 목록이 아니라 소음이다.
 * 그래서 **둘 다 살아 있고(끝난 글만 든 덩어리는 뺀다) 둘 다 큰** 짝부터 추린다 —
 * 작은 덩어리끼리 안 만난 건 당연하고, 큰 덩어리 둘이 한 번도 안 만난 게 눈에 띌 일이다.
 */
function findHoles(docs, edges, level, limit = 12) {
  // 층 배정은 굽는 도중엔 글 객체에 안 붙어 있다 — 지도(of)를 직접 받아 본다.
  const cl = docs.map((d) => (level.of.has(d.id) ? level.of.get(d.id) : null));
  const size = new Map();
  const alive = new Map();
  docs.forEach((d, i) => {
    const c = cl[i];
    if (c == null) return;
    size.set(c, (size.get(c) || 0) + 1);
    if (!d.done) alive.set(c, (alive.get(c) || 0) + 1);
  });
  const met = new Set();
  for (const [a, b] of edges) {
    const ca = cl[a];
    const cb = cl[b];
    if (ca == null || cb == null || ca === cb) continue;
    met.add(ca < cb ? `${ca}-${cb}` : `${cb}-${ca}`);
  }
  const ids = [...size.keys()].sort((a, b) => a - b);
  const holes = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      if (met.has(`${a}-${b}`)) continue;
      if (!alive.get(a) || !alive.get(b)) continue;      // 끝난 것만 든 덩어리는 뺀다
      holes.push({ a, b, weight: Math.min(size.get(a), size.get(b)) });
    }
  }
  holes.sort((x, y) => y.weight - x.weight);
  return holes.slice(0, limit).map((h) => ({
    a: level.names[h.a],
    b: level.names[h.b],
    size: [size.get(h.a), size.get(h.b)],
  }));
}

/**
 * 「묻힌 정도」 — 오래됐고, 아무도 안 부르고, 끝나지도 않은 글.
 *
 * 원래 목적이 「쌓아만 두고 다시 안 봄」이다. 다시 꺼내기의 정석(간격 반복)은
 * 「기억났나?」 라는 사람의 답을 받아야 도는데 메모엔 그 답이 없다 — 흉내만
 * 내게 되므로 안 쓴다. 대신 **진짜 있는 신호**만 쓴다:
 *   ① 마지막으로 손댄 날이 얼마나 됐나   ② 다른 글이 몇 군데서 부르나
 * 끝난 글은 묻힌 게 아니라 끝난 것이다 — 뺀다.
 */
function lastTouched(memoDir) {
  const out = spawnSync('git', ['-c', 'core.quotepath=false', 'log', '--format=%ct', '--name-only', '--since=2025-01-01'],
    { cwd: memoDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const map = new Map();
  let ts = null;
  for (const line of (out.stdout || '').split('\n')) {
    const t = line.trim();
    if (/^\d{9,}$/.test(t)) { ts = Number(t); continue; }
    if (t.endsWith('.md') && ts && !map.has(t)) map.set(t, ts);
  }
  return map;
}


/**
 * 글의 **생일** — 처음 담긴 날. 「관심이 어디로 옮겨갔나」를 보려면 마지막으로
 * 손댄 날이 아니라 처음 쓴 날이어야 한다(고칠 때마다 최근으로 밀리면 안 된다).
 */
function birthdays(memoDir) {
  const out = spawnSync('git', ['-c', 'core.quotepath=false', 'log', '--format=%ct', '--name-only', '--diff-filter=A', '--reverse'],
    { cwd: memoDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const map = new Map();
  let ts = null;
  for (const line of (out.stdout || '').split('\n')) {
    const t = line.trim();
    if (/^\d{9,}$/.test(t)) { ts = Number(t); continue; }
    if (t.endsWith('.md') && ts && !map.has(t)) map.set(t, ts);
  }
  return map;
}

/**
 * **지금 손대는 것 주변 — git 을 상호작용 자취로** (Mylyn/Mylar, Kersten & Murphy FSE 2006).
 *
 * Mylyn 은 요소마다 **얼마나 자주·최근에 건드렸나**로 관심도를 매기고, 다른 것이 오르면
 * 옛것은 **감쇠**시킨다. **편집이 선택보다 무겁다** — 본 것보다 고친 것이 관심이다.
 * 우리에겐 상호작용 로그가 없지만 **git 이 그 자취다**: 커밋이 파일을 건드린 것이 편집이다.
 *
 * ⚠ 후속 연구의 경고: **자취에는 잡음이 있다** — 의도하지 않은 이벤트가 섞이고 그 위에
 * 세운 추천이 흔들린다. 우리 판의 잡음은 뚜렷하다: **한 커밋이 수백 개를 건드리는 것**
 * (이름 바꾸기·일괄 정리·대량 이관). 그건 관심이 아니다. 걸러 내고 **거른 양을 수로 적는다.**
 *
 * ⚠ 그리고 **앞 시기 정보만** 쓴다. 지난 바퀴에 「이웃이 같은 시기에 움직였나」로 80% 를
 * 맞혔지만 그건 예측이 아니라 **번짐**이었다. 여기서는 최근 달 이벤트를 **아예 안 본다.**
 */
const DOI_BULK = 25;         // 한 커밋이 이보다 많이 건드리면 관심이 아니다
const DOI_DECAY = 0.98;      // 이벤트 하나 지날 때마다 곱하는 값 (Mylyn 의 감쇠)
const DOI_TOPK = [10, 50, 100];

/** git 로그에서 **편집 이벤트**를 뽑는다 — [시각, 건드린 파일들]. */
function interactions(memoDir) {
  const out = spawnSync('git', ['-c', 'core.quotepath=false', 'log', '--format=%ct', '--name-only'],
    { cwd: memoDir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const events = [];
  let ts = null; let files = [];
  const flush = () => { if (ts && files.length) events.push({ ts, files }); ts = null; files = []; };
  for (const line of (out.stdout || '').split('\n')) {
    const t = line.trim();
    if (/^\d{9,}$/.test(t)) { flush(); ts = Number(t); continue; }
    if (t.endsWith('.md')) files.push(t);
  }
  flush();
  return events;                 // 최신이 앞
}

/** 소스마다 편집 자취를 뽑아 **id 접두사를 붙여** 합친다. 소비처 약속 = 최신이 앞. */
function mergedInteractions() {
  const events = [];
  for (const src of gitSources()) {
    for (const e of interactions(src.root)) events.push({ ts: e.ts, files: e.files.map((f) => `${src.prefix}${f}`) });
  }
  events.sort((a, b) => b.ts - a.ts);
  return events;
}

/**
 * **상호작용 DOI 로 「곧 다시 손댈 글」을 짚어 본다.**
 * 지난 바퀴에 이 과제에서 0% 가 나왔다 — 그걸 정면으로 다시 친다.
 */
function doiRevisit(docs, events, novelty, seed = 4242) {
  const t0 = Date.now();
  const n = docs.length;
  const idOf = new Map(docs.map((d, i) => [d.id, i]));
  const recent = new Set(novelty?.recentMonths || []);
  if (!recent.size) return { skipped: '최근 달을 모른다' };
  const monthOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 7);

  /* 잡음 거르기 — 한 커밋이 너무 많이 건드리면 관심이 아니다. 거른 양을 적는다. */
  let bulk = 0; let bulkFiles = 0; let kept = 0; let keptFiles = 0;
  const clean = [];
  for (const e of events) {
    if (e.files.length > DOI_BULK) { bulk += 1; bulkFiles += e.files.length; continue; }
    clean.push(e); kept += 1; keptFiles += e.files.length;
  }

  /* **앞 시기만** — 최근 달의 이벤트는 아예 안 본다. */
  const past = clean.filter((e) => !recent.has(monthOf(e.ts)));
  const doi = new Float64Array(n);
  let w = 1;
  for (const e of past) {                      // past 는 최신이 앞 → 뒤로 갈수록 감쇠
    for (const f of e.files) {
      const i = idOf.get(f);
      if (i != null) doi[i] += w;
    }
    w *= DOI_DECAY;
  }
  /* 잦기만 본 판도 같이 — 감쇠가 실제로 일을 하는지 보려면 견줄 것이 있어야 한다. */
  const freq = new Float64Array(n);
  for (const e of past) for (const f of e.files) { const i = idOf.get(f); if (i != null) freq[i] += 1; }

  /* 정답 — 최근 전에 태어났는데 최근에 손대진 글 (지난 바퀴와 같은 정의). */
  const born = docs.map((d) => d.born || null);
  const lastM = new Array(n).fill(null);
  for (const e of clean) {
    const m = monthOf(e.ts);
    for (const f of e.files) { const i = idOf.get(f); if (i != null && !lastM[i]) lastM[i] = m; }
  }
  const older = [];
  for (let i = 0; i < n; i += 1) if (born[i] && !recent.has(born[i])) older.push(i);
  const back = new Set(older.filter((i) => lastM[i] && recent.has(lastM[i])));
  const base = older.length ? back.size / older.length : 0;

  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const scoreOf = (key) => {
    const order = older.slice().sort((a, b) => key(b) - key(a));
    return DOI_TOPK.map((k) => {
      const top = order.slice(0, k);
      const hit = top.filter((i) => back.has(i)).length;
      return { k, hit, rate: Number((top.length ? hit / top.length : 0).toFixed(4)) };
    });
  };
  const withDoi = scoreOf((i) => doi[i] + rnd() * 1e-9);
  const withFreq = scoreOf((i) => freq[i] + rnd() * 1e-9);
  const chance = scoreOf(() => rnd());
  /**
   * ★ **진짜 물어야 할 것 — 지도가 여기에 무엇을 보태나.**
   *
   * 글 자체의 편집 이력만으로 이미 잘 짚힌다면, 이웃·덩어리 같은 **지도의 것**이 거기에
   * 아무것도 못 보탠다는 뜻일 수 있다. 그러면 일깨움에 필요한 건 지도가 아니라 git 이다.
   * 그래서 **이웃의 앞 시기 DOI** 를 얹은 판을 나란히 잰다.
   */
  const nearDoi = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let acc = 0; let c = 0;
    for (const j of (docs[i].near || []).slice(0, 8)) {
      if (j == null || j < 0 || j >= n) continue;
      acc += doi[j]; c += 1;
    }
    nearDoi[i] = c ? acc / c : 0;
  }
  const withNear = scoreOf((i) => nearDoi[i] + rnd() * 1e-9);
  /* 둘을 섞은 판 — 지도가 보태는 게 있으면 여기서 올라야 한다. */
  const maxDoi = Math.max(1e-9, ...doi);
  const maxNear = Math.max(1e-9, ...nearDoi);
  const withBoth = scoreOf((i) => doi[i] / maxDoi + 0.5 * (nearDoi[i] / maxNear) + rnd() * 1e-9);

  return {
    bulkCut: DOI_BULK, decay: DOI_DECAY,
    events: events.length, dropped: bulk, droppedFiles: bulkFiles, kept, keptFiles,
    pastEvents: past.length, older: older.length, back: back.size,
    base: Number(base.toFixed(4)), ks: DOI_TOPK,
    doi: withDoi, freq: withFreq, chance, near: withNear, both: withBoth,
    /* 지도가 보탠 게 있나 — 섞은 판이 글 자체만 쓴 판을 넘나. */
    mapAdds: withBoth[0].rate > withDoi[0].rate + 0.02,
    /* 판정 — 우연·바탕을 뚜렷이 넘어야 「지금 손대는 것 주변」을 내놓는다. */
    useful: withDoi[0].rate > Math.max(chance[0].rate, base) * 1.5,
    ms: Date.now() - t0,
  };
}

/**
 * **쓰이는가 — 지도가 「다시 손댈 글」을 미리 짚나** (Barreau & Nardi, SIGCHI Bulletin 1995).
 *
 * ★ 그 논문의 냉정한 결론: 정보는 셋이고(덧없는 것 · 일하는 것 · **묵힌 것**), **묵힌 것은
 * 거의 안 본다.** 사람들은 **자리로 찾고 검색은 최후 수단**이며, 자리의 진짜 기능은 검색이
 * 아니라 **일깨움**이다. 그리고 **정교한 분류 체계는 번번이 버려졌다.**
 *
 * 우리 지도는 정확히 「묵힌 것을 위한 정교한 분류 체계」다. 문헌대로면 **안 쓰인다.**
 * 그래서 지도를 **일깨움 도구**로 볼 수 있는지 잰다 — 사람 없이, git 이 정답을 준다:
 * **다시 손댄 글**이 곧 「사용자가 실제로 돌아온 글」이다.
 *
 * ⚠ 앞날이 새면 안 된다. **최근 달에 다시 손댄 것**을 정답으로 두고, 예측은 **그 전까지의
 * 정보만** 쓴다. 그리고 우연 수준(그냥 바탕 비율)을 늘 나란히 적는다.
 */
const REV_K = [10, 50, 100];

function revisitCheck(docs, touched, novelty, seed = 77) {
  const t0 = Date.now();
  const n = docs.length;
  const monthOf = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 7) : null);
  const last = docs.map((d) => monthOf(touched.get(d.id)));
  const born = docs.map((d) => d.born || null);
  /* 최근 = 새 관심사에서 고른 그 달들(같은 자를 쓴다 — 둘이 어긋나면 못 견준다). */
  const recent = new Set(novelty?.recentMonths || []);
  if (!recent.size) return { skipped: '최근 달을 모른다' };

  /* 정답 — **최근 전에 태어났는데 최근에 다시 손댄 글**. */
  const older = [];
  for (let i = 0; i < n; i += 1) {
    if (!born[i] || recent.has(born[i])) continue;    // 최근에 태어난 것은 「다시」가 아니다
    older.push(i);
  }
  const back = new Set(older.filter((i) => last[i] && recent.has(last[i])));
  const base = older.length ? back.size / older.length : 0;

  /**
   * 예측 — **최근 전까지의 정보만** 쓴다.
   *  · 묻힌 글: 오래 안 건드렸는데 이어진 데가 많은 글 (이미 굽는다)
   *  · 이웃이 최근에 움직인 글: 내 이웃이 요즘 손대졌다면 나도 곧 손댈 만하다
   */
  const nearMoved = (i, when) => {
    let hit = 0; let seen = 0;
    for (const j of (docs[i].near || []).slice(0, 8)) {
      if (j == null || j < 0 || j >= n) continue;
      seen += 1;
      if (last[j] && when(last[j])) hit += 1;
    }
    return seen ? hit / seen : 0;
  };
  /**
   * ★ **두 가지를 갈라 적는다.**
   *  · **같은 때** — 이웃이 *최근에* 움직였나. 이건 앞날을 맞히는 게 아니라 「지금 손대는
   *    일이 이웃으로 번진다」는 뜻이다. 높아도 예측력이 아니다
   *  · **앞 때만** — 이웃이 *최근 직전 달들에* 움직였나. 이것만이 진짜 예측이다
   */
  const prev = new Set();
  {
    const all = [...new Set(last.filter(Boolean))].sort();
    const before = all.filter((m) => !recent.has(m));
    for (const m of before.slice(-3)) prev.add(m);      // 최근 직전 석 달
  }
  const rank = (key) => older.slice().sort((a, b) => key(b) - key(a));
  const scoreOf = (order) => {
    const out = { hits: [] };
    for (const k of REV_K) {
      const top = order.slice(0, k);
      const hit = top.filter((i) => back.has(i)).length;
      out.hits.push({ k, hit, rate: Number((top.length ? hit / top.length : 0).toFixed(4)) });
    }
    return out;
  };

  let st = seed >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const ours = scoreOf(rank((i) => nearMoved(i, (m) => recent.has(m))));
  const strict = scoreOf(rank((i) => nearMoved(i, (m) => prev.has(m)) + rnd() * 1e-9));
  const buried = scoreOf(rank((i) => (docs[i].buried ? 1 : 0) + rnd() * 1e-6));
  const chance = scoreOf(rank(() => rnd()));

  /* 나이별 재방문율 — 「묵힌 것은 거의 안 본다」가 우리에게도 맞나. */
  const byAge = new Map();
  for (const i of older) {
    const b = born[i];
    if (!b) continue;
    const y = b.slice(0, 4);
    const e = byAge.get(y) || [0, 0];
    e[1] += 1; if (back.has(i)) e[0] += 1;
    byAge.set(y, e);
  }
  const ages = [...byAge].sort().map(([y, [h, all]]) => ({ year: y, all, back: h, rate: Number((h / all).toFixed(4)) }));

  return {
    recentMonths: [...recent].sort(), older: older.length, back: back.size,
    base: Number(base.toFixed(4)), ks: REV_K, ours, strict, buried, chance, ages,
    prevMonths: [...prev].sort(),
    /* 판정 — 이웃이 움직였나가 우연을 뚜렷이 넘어야 「일깨움에 쓸 만하다」. */
    /* 판정은 **엄격판**으로 한다 — 같은 때 신호는 예측이 아니다. */
    useful: strict.hits[0].rate > Math.max(chance.hits[0].rate, base) * 1.5,
    ms: Date.now() - t0,
  };
}

function markBuried(docs, edges) {
  const touched = mergedGitMap(lastTouched);
  const links = new Array(docs.length).fill(0);
  for (const [a, b] of edges) { links[a] += 1; links[b] += 1; }
  const now = Math.floor(Date.now() / 1000);
  const ages = [];
  docs.forEach((d, i) => {
    const t = touched.get(d.id);
    d.days = t ? Math.floor((now - t) / 86400) : null;
    d.links = links[i];
    if (d.days != null) ages.push(d.days);
  });
  if (!ages.length) { console.warn('[atlas] 손댄 날을 하나도 못 읽었다 — 묻힌 표시 없이 간다'); return 0; }
  ages.sort((a, b) => a - b);
  /* 위 25% 만 「오래된」 것으로 본다. 다만 **바닥을 깐다** — 대부분이 최근이면
     넉넉잡아 여드레짜리도 「오래됐다」가 되어 버린다(실제로 8일이 나왔다).
     여드레 안 본 글을 묻혔다고 하면 87개가 전부 헛울림이다. */
  const oldCut = Math.max(30, ages[Math.floor(ages.length * 0.75)]);
  let n = 0;
  for (const d of docs) {
    d.buried = !d.done && d.days != null && d.days >= oldCut && d.links === 0;
    if (d.buried) n += 1;
  }
  console.log(`[atlas] 묻힌 글 ${n}개 (${oldCut}일 넘게 안 건드렸고 아무도 안 부름)`);
  return n;
}

/**
 * 글끼리 서로를 부르는 짝을 뽑는다.
 *
 * 글 안에 이미 관계가 적혀 있다 — 일감 번호(`TASK-WM-181`)와 대괄호 링크(`[[이름]]`).
 * 실측: 일감 874개에 짝 877개, 문서당 평균 3.07. 성겨서 다 그려도 털뭉치가 안 된다.
 * 그래서 솎아내기·선 묶기 같은 무거운 기법은 안 쓴다 — 없는 문제다.
 */
let edgeFrom = new Map();
function findEdges(docs) {
  const byTask = new Map();     // 일감 번호 → 글 번호
  const byName = new Map();     // 파일 이름(확장자 뺀 것) → 글 번호
  const byId = new Map();       // id(상대경로) → 글 번호 — 마크다운 상대링크가 이걸로 맞는다
  const dupName = new Set();    // 같은 파일 이름이 여럿 — 이름만으로는 못 잇는다 (오연결 방지)
  docs.forEach((d, i) => {
    const m = d.id.match(/TASK-[A-Z]+-\d+(?:-[A-Z])?/);
    if (m && !byTask.has(m[0])) byTask.set(m[0], i);
    const base = d.id.split('/').pop().replace(/\.md$/, '');
    if (byName.has(base)) dupName.add(base); else byName.set(base, i);
    byId.set(d.id, i);
  });

  const seen = new Set();
  const edges = [];
  /* ★ **누가 쓴 링크인지 남긴다.** 링크의 「때」는 두 끝의 생일이 아니라 **그 링크를 적은
     글의 달**이다. 처음엔 늦은 쪽 생일로 잡았더니 달이 셋으로 뭉개져 시간으로 자를 수가
     없었다(우리 글의 절반이 2026-08 에 몰려 있다). */
  edgeFrom = new Map();
  const taskPat = /TASK-[A-Z]+-\d+/g;
  const wikiPat = /\[\[([^\]|]+)/g;
  /* ★ **마크다운 상대링크가 지금 정본의 링크 체계다.** 2026-08 memo 개편 후 TASK 문서가
     사라지고 글끼리는 `[이름](../systems/x.md)` 로 잇는다 — 이걸 못 읽으면 사람 링크가
     0개가 되고, 그 위에 선 자들(이어야 할 둘·DOI·제안)이 통째로 죽는다(실제로 그랬다). */
  const mdPat = /\]\(([^)#?\s]+\.md)\)?/g;
  docs.forEach((d, i) => {
    const hits = new Set();
    for (const m of d.text.matchAll(taskPat)) {
      const t = byTask.get(m[0]);
      if (t !== undefined) hits.add(t);
    }
    for (const m of d.text.matchAll(wikiPat)) {
      const t = byName.get(m[1].trim());
      if (t !== undefined) hits.add(t);
    }
    for (const m of d.text.matchAll(mdPat)) {
      const target = m[1];
      if (/^[a-z]+:/i.test(target)) continue;      // http(s) 등 바깥 주소는 사람 링크가 아니다
      const baseDir = d.id.split('/').slice(0, -1).join('/');
      const resolved = path.posix.normalize(baseDir ? `${baseDir}/${target}` : target);
      const base = target.split('/').pop().replace(/\.md$/, '');
      const t = byId.get(resolved) ?? (dupName.has(base) ? undefined : byName.get(base));
      if (t !== undefined) hits.add(t);
    }
    for (const j of hits) {
      if (j === i) continue;                       // 자기가 자기를 부르는 건 뺀다
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edgeFrom.set(key, i);              // 이 링크를 적은 글
      edges.push(i < j ? [i, j] : [j, i]);
    }
  });
  return edges;
}

/**
 * 층을 맞물리게 만든다 — 촘촘한 나눔의 **중심끼리** 합쳐 성긴 층을 만든다.
 *
 * 층마다 따로 나누면 작은 덩어리가 큰 덩어리에 안 들어간다. 당겼을 때 점이
 * 딴 데로 튀어 「방금 저기 있던 게 어디 갔지」가 된다. 나무여야 지도다.
 *
 * 합치는 법 = 묶었을 때 **덩어리가 가장 덜 흐트러지는** 짝을 고른다(Ward).
 * 그냥 가까운 짝만 고르면 큰 덩어리가 옆의 작은 것을 계속 삼켜서, 층을 올릴수록
 * 하나가 1358/1516 을 먹는다(실제로 그랬다). 크기를 셈에 넣으면 고르게 갈린다.
 * 30개짜리라 몇 밀리초면 끝난다.
 */
function mergeCenters(centers, sizes, targetK) {
  const alive = centers.map((c, i) => ({ c: Array.from(c), n: sizes[i], members: [i] }));
  const dist = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 1) { const t = a[i] - b[i]; s += t * t; }
    return s;
  };
  while (alive.length > targetK) {
    let bi = 0; let bj = 1; let bd = Infinity;
    for (let i = 0; i < alive.length; i += 1) {
      for (let j = i + 1; j < alive.length; j += 1) {
        // Ward: 거리² 에 크기를 곱한다 — 큰 덩어리끼리 붙는 값이 비싸진다
        const a = alive[i]; const b = alive[j];
        const d = (a.n * b.n / (a.n + b.n)) * dist(a.c, b.c);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    const a = alive[bi]; const b = alive[bj];
    const n = a.n + b.n;
    const c = a.c.map((v, i) => (v * a.n + b.c[i] * b.n) / n);
    alive.splice(bj, 1);
    alive[bi] = { c, n, members: a.members.concat(b.members) };
  }
  // 촘촘 덩어리 번호 → 이 층의 덩어리 번호
  const map = new Map();
  alive.forEach((g, gi) => { for (const m of g.members) map.set(m, gi); });
  return map;
}

/**
 * 덩어리를 몇 개로 나눌지 **스스로 정한다.**
 *
 * 14 는 내가 손으로 박은 숫자였다. 근거가 없으면 지도가 거짓말을 한다 —
 * 원래 다섯 덩어리인 것을 열넷으로 쪼개면 없는 경계가 생긴다.
 *
 * 잣대 = 실루엣. 「제 덩어리 안에서 얼마나 가깝고, 남의 덩어리와 얼마나 먼가」.
 * 1 에 가까울수록 그 나눔이 옳다. 전부 재면 오래 걸리니 표본으로 잰다.
 */
/* 표본 400 은 **자기 값이 흔들렸다** — 같은 자료·같은 층인데 뽑는 자리만 바꾸면
   0.046 / 0.031 / 0.033 (값의 3분의 1이 표본 잡음). 그 숫자로 층을 고르면 잡음을 고르는 것이다.
   1200 으로 올리니 뽑는 자리를 바꿔도 0.037 / 0.037 로 붙는다. 값은 1초 — 아낄 자리가 아니었다.
   전수(n²)는 여전히 안 한다. */
const SIL_SAMPLE = 1200;
/**
 * ★ **뽑은 자리를 밖에 알린다.**
 *
 * 굽는 쪽과 자가 「같은 1200개」를 쓴다고 믿었는데 실은 **서로 다른 1200개**였다 —
 * 굽기는 자기 차례대로, 자는 벡터가 캐시에 있는 것만 걸러 낸 차례대로 앞 1200개를 집었다.
 * 그래서 실루엣이 0.041 대 0.031 로 갈렸고, 그건 표본을 옮겨도 안 없어졌다(폭 0).
 * 이제 굽기가 **집은 번호를 그대로 싣고** 자가 그 번호로 잰다. 고르는 잣대와 재는 잣대는 하나여야 한다.
 */
let silPicked = null;
function silhouette(points, assign, sampleN = SIL_SAMPLE, offset = 0) {
  const n = points.length;
  const step = Math.max(1, Math.floor(n / sampleN));
  const byC = new Map();
  points.forEach((p, i) => {
    const a = byC.get(assign[i]) || [];
    a.push(p);
    byC.set(assign[i], a);
  });
  const dist = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 1) { const t = a[i] - b[i]; s += t * t; }
    return Math.sqrt(s);
  };
  /* **자기 자신을 빼고 잰다.** 안 빼면 제 무리 안 거리에 0 이 한 개 섞여 값이 낮아지고,
     그만큼 실루엣이 높아 보인다 — 촘촘한 층(30개, 한 무리 50편)에서 0.057 vs 0.040 으로
     갈렸다. 자가 따로 재서 잡아냈다. 정의대로 i 를 뺀다. */
  const meanTo = (p, arr) => {
    if (!arr.length) return Infinity;
    let s = 0;
    const st = Math.max(1, Math.floor(arr.length / 60));
    let c = 0;
    for (let i = 0; i < arr.length; i += st) {
      if (arr[i] === p) continue;
      s += dist(p, arr[i]); c += 1;
    }
    return c ? s / c : Infinity;
  };
  let total = 0;
  let count = 0;
  const picked = [];
  for (let i = offset % step; i < n; i += step) {
    picked.push(i);
    const own = byC.get(assign[i]) || [];
    if (own.length < 2) continue;
    const a = meanTo(points[i], own);
    let b = Infinity;
    for (const [c, arr] of byC) {
      if (c === assign[i]) continue;
      b = Math.min(b, meanTo(points[i], arr));
    }
    if (!Number.isFinite(b)) continue;
    total += (b - a) / Math.max(a, b);
    count += 1;
  }
  silPicked = picked;
  return count ? total / count : -1;
}

/** 후보 개수를 훑어 가장 옳은 나눔을 고른다. 자리(2축)에서 재면 싸고 충분하다. */
function chooseK(vectors, flat, candidates) {
  let best = { k: candidates[0], score: -Infinity, assign: null };
  for (const k of candidates) {
    if (k >= vectors.length) continue;
    const km = kmeans(vectors, k);
    const score = silhouette(flat, km.assign);
    console.log(`[atlas]   덩어리 ${k}개 → 나눔 점수 ${score.toFixed(3)}`);
    if (score > best.score) best = { k, score, assign: km.assign };
  }
  return best;
}

/* 어느 덩어리에나 나오는 말은 그 덩어리를 가리키지 못한다.
   레포 이름·일감 머리글자 같은 것이 그렇다 — 빼지 않으면 이름이 전부
   「WM feedback」 이 된다(실제로 세 덩어리가 같은 이름을 받았다). */
const NAME_STOP = new Set([
  'TASK', 'WM', 'KL', 'KAR', 'YB', 'LIFE', 'HOBBY', 'SUB',
  'md', 'https', 'http', 'www', 'com', 'io', 'github', 'json', 'ts', 'js',
  'done', 'todo', 'status', 'title', 'feedback', 'note', 'notes',
  // 영어 뼈대 말 — 어느 글에나 나오고 아무것도 안 가리킨다
  'the', 'and', 'not', 'any', 'all', 'for', 'with', 'from', 'this', 'that',
  'are', 'was', 'has', 'have', 'can', 'will', 'you', 'use', 'used', 'using',
  'new', 'old', 'get', 'set', 'add', 'apply', 'run', 'one', 'two', 'via',
  'out', 'off', 'now', 'but', 'his', 'her', 'its', 'our', 'per', 'may',
  // 한국어 뼈대 말
  '것', '수', '때', '그', '이', '저', '있다', '없다', '한다', '된다', '하기', '되기',
  '있는', '없는', '하는', '되는', '한', '안', '더', '못', '다', '거', '건', '게',
  '에서', '으로', '까지', '부터', '보다', '만큼', '처럼', '한다는', '이다',
  '같은', '아니라', '아니다', '위해', '대해', '통해', '따라', '만든', '만들',
  '해야', '하면', '되면', '이제', '아직', '전부', '모든', '어떤', '무슨',
]);

/** 문장부호에서 끊는다 — 넘어서 이어 붙이면 글에 없는 말이 만들어진다. */
const SPLIT_AT = /[^0-9A-Za-z가-힣\s]+/;

/**
 * 이름 후보를 **이어진 말**로 뽑는다 (TASK-KAR-233).
 *
 * 전에는 낱말을 따로따로 뽑아 둘을 붙였다. 그래서 `wav nocheck` · `autostart w32time` ·
 * `PAT apex` 같은 **세상에 없는 말**이 나왔다 — 이름 50개 중 글에 그 순서 그대로 나오는
 * 것이 1개(2%)뿐이었다. 읽어도 뜻이 안 서는 게 당연했다.
 *
 * 정본(YAKE! · KeyBERT)의 공통점은 **후보가 구(句)라는 것**이다. 낱말마다 점수를 매기더라도
 * 최종 후보는 붙어 다니는 1~3 낱말이고, 그래야 사람이 읽을 수 있는 말이 나온다.
 *
 * 여기서는 문장부호에서 끊고 그 안에서만 이어 붙인다. 뼈대 말(불용어)이 하나라도 낀
 * 후보는 버린다 — 「것을 하는」 같은 게 이름이 되면 안 된다.
 */
function phrasesOf(text, maxN = 3) {
  const out = [];
  for (const run of String(text).split(SPLIT_AT)) {
    const words = run.split(/\s+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
    for (let i = 0; i < words.length; i += 1) {
      for (let n = 1; n <= maxN && i + n <= words.length; n += 1) {
        const parts = words.slice(i, i + n);
        if (parts.some((w) => NAME_STOP.has(w))) continue;
        /* 조사로 끝나는 말은 이름이 못 된다 — 「오늘의」 는 뒤에 뭐가 와야 말이 된다.
           뒤에 낱말이 더 붙는 후보(「오늘의 판」)는 살아남으므로 잃는 게 없다. */
        if (/[의를을에와과도만]$/.test(parts[parts.length - 1])) continue;
        out.push(parts.join(' '));
      }
    }
  }
  return out;
}

/**
 * 덩어리마다 **그 덩어리가 즐겨 쓰는 말** 몇 개를 뽑아 둔다 (TASK-KAR-233).
 *
 * 왜: 과업 유형론(Brehmer & Munzner 2013)에 지도를 대 보니 「찾기」 네 칸은 다 찼는데
 * **견주기(compare)** 한 칸이 비어 있었다 — 두 덩어리가 뭐가 다른지 알 길이 이름뿐이다.
 * 「관문 세계가」와 「청크 BT」가 어떻게 다르냐고 물으면 지도가 답을 못 했다.
 *
 * 견주려면 각자가 쓰는 말이 있어야 한다. 이름 뽑는 데 쓰는 c-TF-IDF 순위를 그대로
 * 몇 개 더 실어 두면 된다 — 보는 쪽에서 두 목록의 **차집합·교집합**만 내면 견주기가 된다.
 * 새 계산이 아니라 이미 하던 계산을 버리지 않는 것뿐이다.
 */
/**
 * **낱말 침입자 — 이 이름이 사람에게 읽히나** (TASK-KAR-233).
 *
 * Reading Tea Leaves(Chang·Boyd-Graber·Wang·Gerrish·Blei, NIPS 2009)의 요점:
 * **자동 점수가 높은 모델일수록 사람이 읽기엔 오히려 나쁠 수 있다.** 우리 자는 전부
 * 「나눔이 좋은가」를 잰다(실루엣·DBCV·HDBSCAN·H0·눈금 사다리·이름 적합도) —
 * **「이 무리의 말을 보고 남의 말을 골라낼 수 있나」**는 한 번도 안 물었다.
 *
 * 시험: 무리마다 제 낱말 다섯에 **침입자 하나**(다른 무리에서 두드러지고 여기선 안 쓰는 말)를
 * 섞고, 판정자가 여섯 중 하나를 고른다. 맞춘 비율이 **찍기(1/6 ≈ 0.167)** 보다 얼마나
 * 높은가가 답이다.
 *
 * 두 가지를 못 박는다:
 *  · **침입자는 전체 빈도를 맞춰 뽑는다.** 안 그러면 「드문 것 고르기」로 풀려 시험이 순환한다
 *    (침입자를 「여기선 드문 말」로 뽑아 놓고 「드문 것」을 답으로 받는 셈).
 *  · **판정자는 임베딩**이다 — 낱말과 무리 중심의 닮음. 빈도로 풀면 위와 같은 순환이 된다.
 */
const INTRUDE_OWN = 5;
const INTRUDE_PER = 3;

function docFreq(words, docs) {
  /* **양쪽 다 낮춰야 한다.** 짚더미만 낮추고 바늘은 그대로 뒀더니 「Mouse」·「VRChat」 같은
     말이 전부 0 으로 나왔다 — 빈도 맞추기도, 순환 검사도 통째로 무효였다(자가 아니라
     0 이 두 번 나온 게 이상해서 잡았다). */
  const low = words.map((w) => w.toLowerCase());
  const df = new Map(words.map((w) => [w, 0]));
  for (const d of docs) {
    const hay = `${d.title}
${d.text}`.toLowerCase();
    words.forEach((w, i) => { if (hay.includes(low[i])) df.set(w, df.get(w) + 1); });
  }
  return df;
}

async function wordIntrusion(level, ok, vecs, embed) {
  const kk = level.k;
  const idx = Array.from({ length: kk }, () => []);
  ok.forEach((o, i) => {
    const c = level.of.get(o.d.id);
    if (c != null) idx[c].push(i);
  });
  const own = level.words.map((ws) => (ws || []).slice(0, INTRUDE_OWN));
  const usable = [];
  for (let i = 0; i < kk; i += 1) if (own[i].length === INTRUDE_OWN && idx[i].length >= 3) usable.push(i);
  if (usable.length < 4) return null;

  /* 후보 전체의 전체-빈도를 잰다 — 침입자를 **빈도가 비슷한 것**으로 고르기 위해. */
  const allWords = [...new Set(level.words.flat())];
  const df = docFreq(allWords, ok.map((o) => o.d));

  const trials = [];
  for (const i of usable) {
    const mine = own[i];
    const target = mine.map((w) => df.get(w) || 0).sort((a, b) => a - b)[Math.floor(mine.length / 2)];
    const banned = new Set((level.words[i] || []));
    const pool = [];
    for (const j of usable) {
      if (j === i) continue;
      for (const w of (level.words[j] || []).slice(0, 6)) {
        if (banned.has(w)) continue;
        if (mine.some((m) => m.includes(w) || w.includes(m))) continue;
        pool.push(w);
      }
    }
    /* **빈도가 가장 비슷한 것부터.** 여기서 순환을 끊는다. */
    pool.sort((a, b) => Math.abs((df.get(a) || 0) - target) - Math.abs((df.get(b) || 0) - target));
    const seen = new Set();
    for (const w of pool) {
      if (seen.has(w)) continue;
      seen.add(w);
      trials.push({ group: i, intruder: w, words: [...mine, w] });
      if (seen.size >= INTRUDE_PER) break;
    }
  }
  if (trials.length < 8) return null;

  const vocab = [...new Set(trials.flatMap((t) => t.words))];
  console.log(`[atlas] 낱말 침입자 — 무리 ${usable.length}개 · 시험 ${trials.length}판 · 낱말 ${vocab.length}개를 잰다`);
  const wv = await embed(vocab);
  const at = new Map(vocab.map((w, i) => [w, wv[i]]));

  const dim = vecs[0].length;
  const center = idx.map((list) => {
    if (!list.length) return null;
    const acc = new Array(dim).fill(0);
    for (const i of list) for (let t = 0; t < dim; t += 1) acc[t] += vecs[i][t];
    let n = 0;
    for (let t = 0; t < dim; t += 1) { acc[t] /= list.length; n += acc[t] * acc[t]; }
    n = Math.sqrt(n) || 1;
    return acc.map((v) => v / n);
  });
  const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]; return s; };
  const pickOdd = (words, c) => {
    let worst = null; let low = Infinity;
    for (const w of words) {
      const v = at.get(w);
      if (!v || v.length !== c.length) continue;
      const sim = cos(v, c);
      if (sim < low) { low = sim; worst = w; }
    }
    return worst;
  };

  let hit = 0; let judged = 0; let hitRand = 0; let hitDf = 0; let hitHi = 0;
  let seed = 77;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const misses = [];
  for (const t of trials) {
    const c = center[t.group];
    if (!c) continue;
    judged += 1;
    const got = pickOdd(t.words, c);
    if (got === t.intruder) hit += 1; else misses.push(`${level.names[t.group]}: 「${t.intruder}」 대신 「${got}」`);
    /* **대조군** — 아무 무리의 중심에 대고 물으면 찍기 수준이어야 한다. */
    let r = t.group;
    while (r === t.group && usable.length > 1) r = usable[Math.floor(rnd() * usable.length)];
    const gotR = pickOdd(t.words, center[r] || c);
    if (gotR === t.intruder) hitRand += 1;
    /* **순환 검사** — 「빈도가 가장 낮은 것」으로 풀면 몇 판이나 맞나. 여기가 높으면
       이 시험은 뜻을 재는 게 아니라 「드문 것 고르기」다. */
    let byDf = null; let lowDf = Infinity; let byHi = null; let hiDf = -1;
    for (const w of t.words) {
      const v = df.get(w) || 0;
      if (v < lowDf) { lowDf = v; byDf = w; }
      if (v > hiDf) { hiDf = v; byHi = w; }
    }
    if (byDf === t.intruder) hitDf += 1;
    /* 반대 방향도 본다 — 빈도가 **0** 이면 「드문 것 고르기」로는 안 풀린다는 뜻이지만,
       그 자리에 「흔한 것 고르기」가 들어앉았을 수 있다. 둘 다 찍기 근처여야 한다. */
    if (byHi === t.intruder) hitHi += 1;
  }
  if (!judged) return null;
  return {
    k: kk,
    trials: judged,
    groups: usable.length,
    words: INTRUDE_OWN,
    mp: Number((hit / judged).toFixed(3)),
    chance: Number((1 / (INTRUDE_OWN + 1)).toFixed(3)),
    randMp: Number((hitRand / judged).toFixed(3)),
    /* 빈도만으로 푸는 판정자 — 찍기 근처여야 시험이 순환하지 않는다. */
    dfMp: Number((hitDf / judged).toFixed(3)),
    dfHiMp: Number((hitHi / judged).toFixed(3)),
    misses: misses.slice(0, 5),
  };
}

/**
 * **바깥 잣대 — 사람이 붙인 분류와 얼마나 맞나** (TASK-KAR-233).
 *
 * 우리 자 일곱(실루엣·DBCV·HDBSCAN·H0·눈금 사다리·이름 적합도·낱말 침입자)은 **전부
 * 안쪽**이다 — 자기 자신에게만 물어본다. TopicGPT(Pham 외, NAACL 2024)가 쓰는 잣대는
 * 바깥 것이다: **사람이 붙인 분류**와의 조화 순도·ARI·NMI.
 *
 * 우리에게도 공짜 바깥 라벨이 있다 — 글의 **갈래**와 블로그 앞머리의 **categories**.
 * 셋을 다 싣는다(하나만 적으면 **고르기**가 된다). 그리고 **라벨을 마구 섞은 대조군**을
 * 나란히 놓는다 — ARI 는 이미 우연을 보정하지만 순도·NMI 는 아니다(무리를 잘게 쪼갤수록
 * 순도가 저절로 오른다). 낮게 나오면 **낮은 대로 적는다.**
 */
function externalFit(assign, labels) {
  /* assign·labels = 같은 길이의 배열. labels 가 null 인 자리는 뺀다. */
  const pairs = [];
  for (let i = 0; i < assign.length; i += 1) {
    if (assign[i] == null || labels[i] == null) continue;
    pairs.push([assign[i], String(labels[i])]);
  }
  const n = pairs.length;
  if (n < 20) return null;
  const cs = [...new Set(pairs.map((p) => p[0]))];
  const ls = [...new Set(pairs.map((p) => p[1]))];
  const ci = new Map(cs.map((c, i) => [c, i]));
  const li = new Map(ls.map((l, i) => [l, i]));
  const m = cs.map(() => new Array(ls.length).fill(0));
  const a = new Array(cs.length).fill(0);
  const b = new Array(ls.length).fill(0);
  for (const [c, l] of pairs) { m[ci.get(c)][li.get(l)] += 1; a[ci.get(c)] += 1; b[li.get(l)] += 1; }

  /* 순도 = 무리마다 가장 많은 라벨을 그 무리의 답으로 쳤을 때 맞은 비율.
     거꾸로 순도 = 라벨마다 가장 많이 든 무리. 잘게 쪼개면 순도만 오르므로 **조화 평균**을 쓴다. */
  let pur = 0;
  for (let i = 0; i < cs.length; i += 1) pur += Math.max(...m[i]);
  pur /= n;
  let inv = 0;
  for (let j = 0; j < ls.length; j += 1) { let mx = 0; for (let i = 0; i < cs.length; i += 1) if (m[i][j] > mx) mx = m[i][j]; inv += mx; }
  inv /= n;
  const harmonic = pur + inv > 0 ? (2 * pur * inv) / (pur + inv) : 0;

  const c2 = (x) => (x * (x - 1)) / 2;
  let A = 0;
  for (let i = 0; i < cs.length; i += 1) for (let j = 0; j < ls.length; j += 1) A += c2(m[i][j]);
  const B = a.reduce((s, x) => s + c2(x), 0);
  const C = b.reduce((s, x) => s + c2(x), 0);
  const D = c2(n);
  const exp = D ? (B * C) / D : 0;
  const maxv = 0.5 * (B + C);
  const ari = maxv - exp !== 0 ? (A - exp) / (maxv - exp) : 0;

  let hu = 0; let hv = 0; let mi = 0;
  for (let i = 0; i < cs.length; i += 1) if (a[i]) hu -= (a[i] / n) * Math.log(a[i] / n);
  for (let j = 0; j < ls.length; j += 1) if (b[j]) hv -= (b[j] / n) * Math.log(b[j] / n);
  for (let i = 0; i < cs.length; i += 1) {
    for (let j = 0; j < ls.length; j += 1) {
      if (!m[i][j]) continue;
      mi += (m[i][j] / n) * Math.log((m[i][j] * n) / (a[i] * b[j]));
    }
  }
  const nmi = hu > 0 && hv > 0 ? mi / Math.sqrt(hu * hv) : 0;
  return {
    n,
    groups: cs.length,
    classes: ls.length,
    purity: Number(pur.toFixed(3)),
    inverse: Number(inv.toFixed(3)),
    harmonic: Number(harmonic.toFixed(3)),
    ari: Number(ari.toFixed(3)),
    nmi: Number(nmi.toFixed(3)),
  };
}

/** 라벨을 마구 섞은 대조군 — 순도·NMI 는 우연 보정이 안 되므로 옆에 놓아야 뜻이 산다. */
function externalRandom(assign, labels, seed0 = 909) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shuffled = labels.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
  }
  return externalFit(assign, shuffled);
}

/**
 * **써 보는 잣대 — 이 덩어리를 보고 새 글이 여기 속하는지 알아맞힐 수 있나** (TASK-KAR-233).
 *
 * ProxAnn(ACL 2025)의 결론: **응집도·NPMI·순도 같은 자동 잣대는 「쓸모」와 상관이 약하다.**
 * 우리는 그런 잣대를 여덟 개 쌓아 놓고, 정작 지도를 **쓰는 방식**은 안 재고 있었다.
 *
 * 규약을 그대로 옮긴다(판정자만 사람/LLM 대신 임베딩):
 *  ① **갈래 정하기** — 무리마다 **대표 글 다섯 편**(한가운데에 가까운 것)만 보고 갈래를 잡는다
 *  ② **맞음** — **남겨 둔 글**(대표에 안 쓴 글)에 그 갈래를 적용해 「여기 드나」를 가른다.
 *     제 무리 글과 남의 무리 글을 같은 수로 섞어 놓고 가려낸 정도 = **AUC**(찍기 0.5)
 *  ③ **차례** — 남겨 둔 제 무리 글을 대표성 순으로 세워, **모델 자신의 차례**(한가운데와의 거리)와
 *     **켄달 τ** 로 견준다
 *
 * ★ **대표 글은 판단에서 뺀다.** 안 빼면 「제가 만든 갈래로 저를 맞히는」 순환이 된다.
 */
const PROX_REP = 5;

function kendall(a, b) {
  let con = 0; let dis = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + 1; j < a.length; j += 1) {
      const s = Math.sign(a[i] - a[j]) * Math.sign(b[i] - b[j]);
      if (s > 0) con += 1; else if (s < 0) dis += 1;
    }
  }
  return con + dis > 0 ? (con - dis) / (con + dis) : 0;
}

function proxUse(assign, vecs, seed0 = 555) {
  const dim = vecs[0].length;
  const cos = (x, y) => { let s = 0; for (let i = 0; i < dim; i += 1) s += x[i] * y[i]; return s; };
  const unit = (v) => { let n = 0; for (const t of v) n += t * t; n = Math.sqrt(n) || 1; return v.map((t) => t / n); };
  const groups = new Map();
  assign.forEach((c, i) => {
    if (c == null) return;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(i);
  });
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const aucs = []; const taus = []; let judged = 0;
  for (const [c, idx] of groups) {
    if (idx.length < PROX_REP + 3) continue;
    const center = unit(idx.reduce((acc, i) => { for (let t = 0; t < dim; t += 1) acc[t] += vecs[i][t]; return acc; },
      new Array(dim).fill(0)));
    const byCenter = idx.slice().sort((x, y) => cos(vecs[y], center) - cos(vecs[x], center));
    const reps = byCenter.slice(0, PROX_REP);
    const held = byCenter.slice(PROX_REP);
    if (held.length < 3) continue;
    /* ① 갈래 = **대표 글 다섯 편만**으로 만든 것. */
    const cat = unit(reps.reduce((acc, i) => { for (let t = 0; t < dim; t += 1) acc[t] += vecs[i][t]; return acc; },
      new Array(dim).fill(0)));
    /* ② 남의 무리에서 같은 수만큼 뽑아 섞는다. */
    const others = [];
    for (const [c2, idx2] of groups) { if (c2 !== c) others.push(...idx2); }
    if (others.length < held.length) continue;
    const negs = [];
    const taken = new Set();
    while (negs.length < held.length && taken.size < others.length) {
      const pick = others[Math.floor(rnd() * others.length)];
      if (taken.has(pick)) continue;
      taken.add(pick); negs.push(pick);
    }
    const pos = held.map((i) => cos(vecs[i], cat));
    const neg = negs.map((i) => cos(vecs[i], cat));
    let win = 0;
    for (const pv of pos) for (const nv of neg) win += pv > nv ? 1 : (pv === nv ? 0.5 : 0);
    aucs.push(win / (pos.length * neg.length));
    /* ③ 차례 — 대표 다섯으로 세운 차례 vs 한가운데로 세운 차례. */
    taus.push(kendall(held.map((i) => cos(vecs[i], cat)), held.map((i) => cos(vecs[i], center))));
    judged += 1;
  }
  if (!judged) return null;
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    groups: judged,
    reps: PROX_REP,
    auc: Number(mean(aucs).toFixed(3)),
    tau: Number(mean(taus).toFixed(3)),
    worst: Number(Math.min(...aucs).toFixed(3)),
  };
}

function topWordsByGroup(groups, k = 10) {
  const n = groups.length;
  const tf = groups.map((docs) => {
    const c = new Map();
    for (const d of docs) {
      for (const p of phrasesOf(d.title)) c.set(p, (c.get(p) || 0) + 3);
      for (const p of phrasesOf(d.text)) c.set(p, (c.get(p) || 0) + 1);
    }
    return c;
  });
  const total = tf.map((c) => [...c.values()].reduce((a, b) => a + b, 0) || 1);
  const inHowMany = new Map();
  tf.forEach((c) => { for (const w of c.keys()) inHowMany.set(w, (inHowMany.get(w) || 0) + 1); });
  /**
   * ★ **「이쪽만 쓰는 말」은 재서 거른다** (2026-08-23).
   *
   * 전에는 c-TF-IDF 점수와 「절반 넘는 덩어리에 나오면 버린다」만으로 골랐다. 그건 **덩어리 수**를
   * 셀 뿐 **얼마나 자주 나오는지**를 안 본다 — 그래서 화면의 견주기 칸에 「이쪽만 쓴다」고 올려
   * 놓은 말이 저쪽 글에서 오히려 더 자주 나오는 일이 생겼다(실측: "Programming" 이쪽 18% vs
   * 저쪽 36%). 그건 견준 게 아니라 이름 두 개를 늘어놓은 것이다.
   *
   * 그래서 **자와 같은 기준으로** 뽑는 자리에서 미리 거른다: 제 덩어리에서 글 한 편당 나오는
   * 비율이 **다른 어느 덩어리보다도 두 배 이상** 높아야 남긴다. 셈이 비싸므로 점수 순으로
   * 훑다가 k 개가 차면 멈춘다.
   */
  const WORD_TIMES = 2;
  const texts = groups.map((docs) => docs.map((d) => `${d.title}\n${d.text}`));
  const rateIn = (gi, w) => {
    const list = texts[gi];
    if (!list.length) return 0;
    let hit = 0;
    for (const t of list) if (t.includes(w)) hit += 1;
    return hit / list.length;
  };
  const standsOut = (gi, w) => {
    const mine = rateIn(gi, w);
    if (mine <= 0) return false;
    for (let o = 0; o < n; o += 1) {
      if (o === gi) continue;
      if (rateIn(o, w) * WORD_TIMES > mine) return false;
    }
    return true;
  };
  return tf.map((c, gi) => {
    const ranked = [...c.entries()]
      .filter(([, cnt]) => cnt >= 2)
      .filter(([w]) => (inHowMany.get(w) || 0) <= Math.max(2, Math.floor(n * 0.5)))
      .map(([w, cnt]) => [w, (cnt / total[gi]) * Math.log(n / (inHowMany.get(w) || 1))])
      .sort((a, b) => b[1] - a[1]);
    const out = [];
    for (const [w] of ranked) {
      if (out.length >= k) break;
      /* 겹치는 말은 하나만 — 「근본 코어」·「다음 근본」·「다음 근본 코어」가 다 뜨면
         여섯 자리를 한 말이 차지한다. 긴 쪽이 더 많이 말해 주므로 먼저 온 것을 남긴다. */
      if (out.some((x) => x.includes(w) || w.includes(x))) continue;
      if (!standsOut(gi, w)) continue;
      out.push(w);
    }
    return out;
  });
}

/**
 * **이름이 그 무리와 어울리나** — 응집도 c_npmi (Röder 외 WSDM 2015).
 *
 * 우리는 이름을 c-TF-IDF 로 뽑고 「글에 실제로 나오는 말인가」(98%)만 쟀다. 그런데
 * 글에 있는 말이어도 **그 무리를 대표하지 않을 수** 있다. 응집도가 그 자리를 잰다.
 *
 * 셈법(c_npmi 조합): 미끄러지는 창 10 · 한 쌍씩(ONE_ONE) · NPMI · 평균.
 *   NPMI(a,b) = log((P(ab)+ε) / (P(a)P(b))) / −log(P(ab)+ε)   (−1 ~ 1)
 * 쌍은 **이름의 말 × 그 무리 대표어 열 개**로 잡는다 — 「이 이름이 이 무리의 말들과
 * 같이 다니나」가 곧 우리가 묻고 싶은 것이다.
 *
 * ★ 값 하나만 보면 아무 뜻이 없다(말뭉치마다 눈금이 다르다). 그래서 **같은 이름을
 * 남의 무리 글로도 재서 견준다** — 제 무리에서 더 높아야 그 이름이 제 무리 것이다.
 * (c_v 는 사람 평가 상관이 제일 높다지만 이상 동작 지적이 여러 번 나왔고 창 110·간접
 *  코사인이라 해석이 어렵다. 셈이 단순한 c_npmi 를 쓴다 — 자가 다시 재기 쉽다.)
 */
const FIT_WIN = 10;      // 미끄러지는 창 (c_npmi 정본 값)
const FIT_EPS = 1e-12;

/** 창에 걸린 낱말을 센다 — 한 창에 여러 번 나와도 한 번(불리언 창). */
function windowStats(docs, vocab) {
  const single = new Map(); const pair = new Map();
  let windows = 0;
  for (const d of docs) {
    const toks = [];
    for (const run of String(`${d.title} ${d.text}`).split(SPLIT_AT)) {
      for (const w of run.split(/\s+/)) if (w.length >= 2 && !/^\d+$/.test(w)) toks.push(w);
    }
    if (!toks.length) continue;
    const last = Math.max(1, toks.length - FIT_WIN + 1);
    for (let i = 0; i < last; i += 1) {
      const seen = new Set();
      for (let j = i; j < Math.min(i + FIT_WIN, toks.length); j += 1) {
        if (vocab.has(toks[j])) seen.add(toks[j]);
      }
      windows += 1;
      const arr = [...seen];
      for (const w of arr) single.set(w, (single.get(w) || 0) + 1);
      for (let a = 0; a < arr.length; a += 1) {
        for (let b = a + 1; b < arr.length; b += 1) {
          const key = arr[a] < arr[b] ? `${arr[a]}|${arr[b]}` : `${arr[b]}|${arr[a]}`;
          pair.set(key, (pair.get(key) || 0) + 1);
        }
      }
    }
  }
  return { windows: windows || 1, single, pair };
}

function npmiOf(st, a, b) {
  if (a === b) return null;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const pa = (st.single.get(a) || 0) / st.windows;
  const pb = (st.single.get(b) || 0) / st.windows;
  if (!pa || !pb) return null;                 // 한쪽이 아예 안 나오면 잴 게 없다
  const pab = (st.pair.get(key) || 0) / st.windows;
  if (!pab) return -1;                          // 절대 같이 안 나온다 = 최악
  return Math.log((pab + FIT_EPS) / (pa * pb)) / -Math.log(pab + FIT_EPS);
}

const wordsIn = (s2) => String(s2).split(/\s+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w));

/**
 * 층 하나의 이름들을 잰다. 이름마다 `own`(제 무리 글로 잰 값)과 `other`(남의 무리 글로
 * 잰 값)를 낸다 — **견줌이 곧 판정**이다.
 */
function nameFit(groups, names, words) {
  const out = [];
  for (let i = 0; i < groups.length; i += 1) {
    const nameWords = wordsIn(names[i] || '');
    const topWords = [...new Set((words[i] || []).flatMap(wordsIn))].filter((w) => !nameWords.includes(w)).slice(0, 10);
    if (!nameWords.length || topWords.length < 2 || groups[i].length < 3) { out.push(null); continue; }
    const vocab = new Set([...nameWords, ...topWords]);
    const mine = windowStats(groups[i], vocab);
    /* 남의 무리 = 나머지 전부에서 **내 무리와 같은 편수만** 고르게 뽑는다 — 글 수가
       다르면 확률 추정이 흔들려 견줌이 안 된다. */
    const rest = groups.filter((_, j) => j !== i).flat();
    const step = Math.max(1, Math.floor(rest.length / groups[i].length));
    const sample = rest.filter((_, k) => k % step === 0).slice(0, groups[i].length);
    const theirs = sample.length >= 3 ? windowStats(sample, vocab) : null;
    const mean = (st) => {
      if (!st) return null;
      const vals = [];
      for (const a of nameWords) for (const b of topWords) { const v = npmiOf(st, a, b); if (v != null) vals.push(v); }
      return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    };
    let own = mean(mine); let other = mean(theirs);
    /* **둘 다 -1 이면 못 잰 것이다** — 이름 말과 무리 말이 어디서도 같은 창에 안 든다는
       뜻이라, 「제 무리가 더 낫다/아니다」를 말할 근거가 없다. 통과로도 실패로도 세지 않는다.
       (이걸 실패로 세면 잴 수 없는 것을 벌주는 자가 된다.) */
    if (own === -1 && other === -1) { own = null; other = null; }
    out.push({
      name: names[i],
      own: own == null ? null : Number(own.toFixed(4)),
      other: other == null ? null : Number(other.toFixed(4)),
      /* ★ **뽑은 글을 싣는다** (실루엣의 `silOn` 과 같은 관례). 남의 무리는 표본이라
         자가 제 나름대로 다시 뽑으면 **다른 표본을 견주게** 된다 — 실측으로 남의 무리 값이
         0.842 vs 0.476 로 갈렸고, 그건 자료가 아니라 뽑기가 만든 차이였다(2026-08-23). */
      otherIds: sample.map((d) => d.id),
    });
  }
  const real = out.filter((x) => x && x.own != null);
  const better = real.filter((x) => x.other == null || x.own > x.other).length;
  const mean = real.length ? Number((real.reduce((a, x) => a + x.own, 0) / real.length).toFixed(4)) : null;
  return { names: out, mean, better, judged: real.length };
}

/**
 * **이름을 적합도로 다시 고른다** — 두드러지기만 한 말 대신, 그 무리 말들과 **같이 다니는** 말.
 *
 * c-TF-IDF 는 「이 무리에서만 자주 나오는 말」을 고른다. 그것만으로는 그 무리를 대표하지
 * 못할 수 있다 — 실측: 옆 무리 이름으로 바꿔치기해도 값이 안 떨어지는 무리가 18곳 중 6곳
 * (「const float」 은 제 무리 대표어와 **한 번도** 같은 창에 안 들었다).
 *
 * 그래서 후보를 **c-TF-IDF 상위 다섯**으로 좁히고(두드러짐은 지킨다) 그중 **적합도가 가장
 * 높은 것**을 고른다. 두 조건을 다 만족하는 이름이 된다.
 *
 * ⚠ 이러면 적합도는 더 이상 이름을 **독립적으로** 판정하는 수가 아니다(고르는 잣대가 됐다).
 * 그래서 자는 다른 두 가지로 본다: ③ 같은 이름을 **남의 무리 글로** 재서 견주기,
 * ④ **옆 무리 이름**과 바꿔치기. 둘 다 이 최적화가 못 건드리는 자리다.
 */
/**
 * **이름을 임베딩으로도 고른다 — MMR** (TASK-KAR-233 · KeyBERT, Grootendorst).
 *
 * 우리 이름은 c-TF-IDF 로 뽑아 c_npmi(글 안 동시출현)로 다시 고를 뿐 — **지도를 만든
 * 임베딩을 한 번도 안 본다.** KeyBERT 는 이름을 **낱말↔중심 임베딩 닮음**으로 고르고,
 * **MMR** 로 겹침을 막는다: `점수 = (1−λ)·(중심 닮음) − λ·(이미 고른 것과의 최대 닮음)`.
 *
 * 우리에게 겹침이 문제되는 자리는 **무리끼리**다(「다음 근본 코어」·「다음 근본」이 자리를
 * 나눠 먹는다). 그래서 MMR 을 **무리를 가로질러** 건다 — 큰 무리부터, 제 중심과 닮되
 * **이미 다른 무리가 가져간 이름과는 멀게**.
 *
 * ★ **λ 는 박지 않는다** — 쓸어서 고르고, **이름 적합도(c_npmi)가 안 오르면 안 쓴다.**
 *   (앞 바퀴에 「낱말 침입자로 재겠다」고 적어 뒀는데 **그 자는 이름이 아니라 낱말을 잰다** —
 *    이름을 재는 자는 적합도다. 잘못 적은 것을 여기서 바로잡는다.)
 */
const MMR_LAMBDAS = [0, 0.2, 0.4, 0.6, 0.8];

async function mmrNames(groups, names, words, centerOf, embed) {
  const cands = groups.map((_, i) => (words[i] || []).slice(0, 8));
  const vocab = [...new Set(cands.flat().concat(names).filter(Boolean))];
  if (vocab.length < 4) return null;
  const wv = await embed(vocab);
  const at = new Map(vocab.map((w, i) => [w, wv[i]]));
  const cos = (a, b) => { let t = 0; for (let i = 0; i < Math.min(a.length, b.length); i += 1) t += a[i] * b[i]; return t; };
  const order = groups.map((g, i) => [i, g.length]).sort((a, b) => b[1] - a[1]).map(([i]) => i);
  const picks = {};
  for (const lam of MMR_LAMBDAS) {
    const out = names.slice();
    const used = [];
    for (const i of order) {
      const c = centerOf(i);
      const pool = [names[i], ...cands[i]].filter((x) => x && at.has(x));
      if (!c || !pool.length) { if (out[i]) used.push(out[i]); continue; }
      let best = null;
      for (const w of pool) {
        const v = at.get(w);
        if (!v || v.length !== c.length) continue;
        let maxSim = 0;
        for (const u of used) { const uv = at.get(u); if (uv) maxSim = Math.max(maxSim, cos(v, uv)); }
        const score = (1 - lam) * cos(v, c) - lam * maxSim;
        if (!best || score > best.score) best = { w, score };
      }
      if (best) { out[i] = best.w; used.push(best.w); }
    }
    picks[lam] = out;
  }
  return picks;
}

function refineNames(groups, names, words) {
  const taken = new Set();
  const out = names.slice();
  const order = groups.map((g, i) => [i, g.length]).sort((a, b) => b[1] - a[1]).map(([i]) => i);
  for (const i of order) {
    const pool = (words[i] || []).slice(0, 5);
    if (groups[i].length < 3 || pool.length < 2) { taken.add(out[i]); continue; }
    const topWords = [...new Set((words[i] || []).flatMap(wordsIn))];
    let best = null;
    /* **찜한 이름은 후보에서 뺀다 — 제 원래 이름도 예외가 아니다.** 처음엔 원래 이름만
       봐주게 뒀더니 층 하나에서 「관문」이 두 무리에 붙었다(이름이 겹치면 지도를 봐도 소용없다).
       큰 무리부터 고르므로, 겹치면 작은 쪽이 다음 후보로 밀린다. */
    for (const cand of [names[i], ...pool]) {
      if (!cand || taken.has(cand)) continue;
      const nameWords = wordsIn(cand);
      const rest = topWords.filter((w) => !nameWords.includes(w)).slice(0, 10);
      if (!nameWords.length || rest.length < 2) continue;
      const st = windowStats(groups[i], new Set([...nameWords, ...rest]));
      const vals = [];
      for (const a of nameWords) for (const b of rest) { const v = npmiOf(st, a, b); if (v != null) vals.push(v); }
      if (!vals.length) continue;
      const score = vals.reduce((x, y) => x + y, 0) / vals.length;
      if (!best || score > best.score) best = { cand, score };
    }
    if (best && best.cand !== out[i]) {
      console.log(`[atlas]   이름 바꿈: 「${out[i]}」 → 「${best.cand}」 (적합도 ${best.score.toFixed(3)})`);
      out[i] = best.cand;
    } else if (!best && taken.has(out[i])) {
      /* 다 찜당했으면 남은 후보 아무거나 — 겹친 이름보다는 낫다. */
      const free = pool.find((c) => c && !taken.has(c));
      if (free) { console.log(`[atlas]   이름 겹침 피함: 「${out[i]}」 → 「${free}」`); out[i] = free; }
    }
    taken.add(out[i]);
  }
  return out;
}

/**
 * 덩어리마다 **이어진 말** 하나를 이름으로 고른다 (c-TF-IDF).
 *
 * 「이 덩어리에서만 자주 나오는 말」을 고른다. 두 낱말짜리가 한 낱말짜리와 점수가
 * 비슷하면 **두 낱말짜리를 고른다** — 「관문」보다 「국경 관문」이 어디인지 말해 준다.
 * 고른 말은 다른 덩어리가 못 쓰게 찜한다(같은 이름이 둘이면 지도를 봐도 소용없다).
 */
function nameAllByWords(groups) {
  const n = groups.length;
  const tf = groups.map((docs) => {
    const c = new Map();
    for (const d of docs) {
      for (const p of phrasesOf(d.title)) c.set(p, (c.get(p) || 0) + 3);   // 제목은 세 번 친다
      for (const p of phrasesOf(d.text)) c.set(p, (c.get(p) || 0) + 1);
    }
    return c;
  });
  const total = tf.map((c) => [...c.values()].reduce((a, b) => a + b, 0) || 1);
  const inHowMany = new Map();
  tf.forEach((c) => { for (const w of c.keys()) inHowMany.set(w, (inHowMany.get(w) || 0) + 1); });

  const ranked = tf.map((c, gi) => [...c.entries()]
    .filter(([, cnt]) => cnt >= 2)                       // 한 번뿐인 말은 우연이다
    // 절반 넘는 덩어리에 나오는 말은 그 덩어리를 못 가리킨다
    .filter(([w]) => (inHowMany.get(w) || 0) <= Math.max(2, Math.floor(n * 0.5)))
    .map(([w, cnt]) => {
      /* 긴 말에 웃돈을 준다. 잦기만 보면 늘 한 낱말이 이긴다 — 짧을수록 자주 나오니까. */
      const bonus = 1 + 0.45 * (w.split(' ').length - 1);
      return [w, (cnt / total[gi]) * Math.log(n / (inHowMany.get(w) || 1)) * bonus];
    })
    .sort((a, b) => b[1] - a[1]));

  // 자신만만한 덩어리(1등 점수가 높은 쪽)부터 말을 가져간다.
  const order = ranked.map((r, i) => [i, r[0] ? r[0][1] : 0]).sort((a, b) => b[1] - a[1]);
  const taken = new Set();
  const names = new Array(n).fill('이름 없음');
  for (const [gi] of order) {
    if (!groups[gi].length) { names[gi] = '빈 덩어리'; continue; }
    for (const [w] of ranked[gi]) {
      const words = w.toLowerCase().split(' ');
      /* 앞선 덩어리가 쓴 낱말이 끼면 넘어간다 — 「국경 관문」과 「관문 세계」가 나란히
         있으면 어느 쪽이 어딘지 모른다. */
      if (words.some((x) => taken.has(x))) continue;
      names[gi] = w;
      for (const x of words) taken.add(x);
      break;
    }
  }
  return names;
}


/**
 * 층마다 **정말 무리인가**를 잰다 — 실루엣 (TASK-KAR-233).
 *
 * 층 수 6·14·30 은 박아 둔 숫자였다. 재 보니:
 *   4→0.244 · **6→0.242** · 8→0.061 · 14→0.042 · 30→0.026  (1 이 완벽, 0 이면 무리랄 게 없음)
 * 성긴 층은 봉우리에 서 있었지만, **촘촘한 층은 통계적으로 무리가 아니다** — 연속된 구름을
 * 그냥 자른 것이다. 그런데도 화면은 그걸 「덩어리」라 부르고 견주기까지 붙여 놨다.
 *
 * 그래서 두 가지를 한다: ① 성긴 층을 **봉우리에서 고른다**(박아 두지 않는다)
 * ② 층마다 실루엣을 **실어 보낸다** — 낮은 층에서는 화면이 「덩어리」 대신 「구획」이라 말한다.
 * 기능은 그대로 두고 **말만 정직하게** 한다.
 *
 * ⚠ 실루엣은 볼록한 무리를 전제하고 고차원에서 약해진다(문헌 명시). **절대 판정이 아니라
 * 상대 신호**로 쓴다 — 봉우리를 고르는 데 쓰고, 「0.03 이니 나쁘다」로 단정하지 않는다.
 */
/** 이보다 낮으면 「덩어리」가 아니라 **구획**이라 부른다 — 화면도 그 말을 쓴다. */
const SIL_REAL = 0.15;


/**
 * **DBCV** — 밀도로 재는 자 (Moulavi 외 2014, SDM).
 *
 * 왜 하나 더 다나: 실루엣은 **거리** 기반이라 밀도 기반 구조에는 직접 쓸 수 없다고
 * 문헌이 못 박는다(그게 DBCV 논문의 출발점이다). 우리 지도가 딱 그 모양 —
 * 연속된 구름에 빽빽한 자리. 실루엣 0.03~0.06 이 「무리가 없다」가 아니라
 * **「이 자로는 못 잰다」** 일 수 있어서, 성질이 다른 자를 나란히 단다.
 *
 * 셈법: ① 전점 핵심거리 = 같은 무리 안 거리들의 역수 평균의 역수 = **밀도의 역수**
 * ② 상호도달거리 = max(핵심거리 둘, 실제 거리) ③ 무리 **안** 최소신장나무의 가장
 * 무거운 가지 = 밀도 성김(DSC) ④ 두 무리 **내부 마디**(나무 차수 2 이상) 사이 최소
 * 상호도달거리 = 밀도 갈림(DSPC) ⑤ 무리마다 (갈림-성김)/max ⑥ 크기 가중평균. -1~1.
 *
 * ⚠ 384차에서는 지수(차원)가 커서 전점 핵심거리가 사실상 **가장 가까운 이웃까지 거리**로
 * 수렴한다 — 로그자리에서 세지 않으면 그냥 넘친다. 그래서 log-sum-exp 로 센다.
 * ⚠ DBCV 는 구현마다 값이 갈린다고 알려져 있다. **남의 숫자와 직접 견주지 않는다** —
 * 지어낸 눈금 자료(갈린 세 덩어리 0.91 · 자른 구름 -0.04)와 우리 층끼리만 견준다.
 */
function distMatrix(vecs) {
  const n = vecs.length; const dim = vecs[0].length;
  const D = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) {
    const a = vecs[i];
    for (let j = i + 1; j < n; j += 1) {
      const b = vecs[j];
      let s = 0;
      for (let k = 0; k < dim; k += 1) { const t = a[k] - b[k]; s += t * t; }
      const d = Math.sqrt(s);
      D[i * n + j] = d; D[j * n + i] = d;
    }
  }
  return D;
}

function aptsCore(D, n, members, dim) {
  const out = new Map();
  for (const o of members) {
    let max = -Infinity; const logs = [];
    for (const q of members) {
      if (q === o) continue;
      const d = D[o * n + q];
      const l = -dim * Math.log(d > 0 ? d : 1e-12);
      logs.push(l); if (l > max) max = l;
    }
    if (!logs.length) { out.set(o, Infinity); continue; }
    let s = 0; for (const l of logs) s += Math.exp(l - max);
    out.set(o, Math.exp(-(max + Math.log(s) - Math.log(logs.length)) / dim));
  }
  return out;
}

/** 무리 안 최소신장나무 (Prim, 가지 무게 = 상호도달거리). */
function reachMst(D, n, members, core) {
  const inT = new Set([members[0]]);
  const rest = new Set(members.slice(1));
  const edges = [];
  while (rest.size) {
    let best = null; let bw = Infinity;
    for (const a of inT) {
      for (const b of rest) {
        const w = Math.max(core.get(a), core.get(b), D[a * n + b]);
        if (w < bw) { bw = w; best = [a, b]; }
      }
    }
    if (!best) break;
    edges.push([best[0], best[1], bw]);
    inT.add(best[1]); rest.delete(best[1]);
  }
  return edges;
}

function dbcv(vecs, assign, D = null) {
  const n = vecs.length; const dim = vecs[0].length;
  const dist = D || distMatrix(vecs);
  const k = Math.max(...assign) + 1;
  const groups = Array.from({ length: k }, () => []);
  assign.forEach((c, i) => { if (c >= 0) groups[c].push(i); });
  const info = groups.map((members) => {
    if (members.length < 3) return null;              // 3점 미만은 잡음으로 본다
    const core = aptsCore(dist, n, members, dim);
    const edges = reachMst(dist, n, members, core);
    const deg = new Map(members.map((m) => [m, 0]));
    for (const [a, b] of edges) { deg.set(a, deg.get(a) + 1); deg.set(b, deg.get(b) + 1); }
    const internal = members.filter((m) => deg.get(m) > 1);
    const pool = new Set(internal.length >= 2 ? internal : members);
    let dsc = 0;
    for (const [a, b, w] of edges) if (pool.has(a) && pool.has(b) && w > dsc) dsc = w;
    if (!dsc) for (const [, , w] of edges) if (w > dsc) dsc = w;
    return { members, core, pool: [...pool], dsc };
  });
  let total = 0;
  for (let i = 0; i < k; i += 1) {
    const ci = info[i]; if (!ci) continue;
    let dspc = Infinity;
    for (let j = 0; j < k; j += 1) {
      if (i === j || !info[j]) continue;
      for (const a of ci.pool) {
        for (const b of info[j].pool) {
          const w = Math.max(ci.core.get(a), info[j].core.get(b), dist[a * n + b]);
          if (w < dspc) dspc = w;
        }
      }
    }
    if (dspc === Infinity) continue;
    /* **잡음은 분모에만 들어간다** — 어디에도 안 붙는 글이 많으면 점수가 내려간다. */
    total += (ci.members.length / n) * ((dspc - ci.dsc) / Math.max(dspc, ci.dsc));
  }
  return total;
}

/**
 * **HDBSCAN** — 「어디에도 안 붙는다」는 답이 있는 나눔 (Campello 외 · hdbscan 문서).
 *
 * k-means 는 모든 글을 억지로 어딘가에 넣는다. 자 둘(실루엣·DBCV)이 「우리 층은 무리가
 * 아니라 구획」이라 말했으니, 진짜로 **뭉쳐 있는 자리만** 따로 뽑아 보는 게 맞다.
 *
 * 셈법: ① 핵심거리 core_k(x) = k번째 이웃까지 거리(싸구려 밀도 추정) ② 상호도달거리로
 * 성긴 점을 밀어내 「수위를 낮춘다」 ③ 전체 최소신장나무 ④ 무거운 가지부터 끊어 나무
 * ⑤ **min_cluster_size 보다 작게 떨어진 쪽은 「갈라짐」이 아니라 「떨어져 나간 점」**
 * ⑥ λ=1/거리, 안정성 S=Σ(λ_p−λ_birth)·크기 ⑦ EOM: 밑에서 위로, 자식 합 > 부모면 자식.
 * 안 뽑힌 점은 **-1(어디에도 안 붙음)**.
 *
 * ⚠ **뿌리는 후보에서 뺀다.** 안 빼면 뿌리에서 떨어져 나간 점(=잡음)까지 한 덩어리에
 * 들어간다 — 시제품에서 실제로 그랬다(중심에서 12~15 떨어진 점이 반지름 1.0 짜리
 * 무리 안에 들었다).
 * ⚠ 일찍 떨어진 점도 **정본은 그 무리 식구로 센다.** 그래서 소속 확신(λ_p/λ_max)을
 * 같이 낸다 — 지어낸 눈금에서 붙어 있던 잡음 12개가 전부 확신 0.04~0.06 이었고
 * 진짜 식구 300개는 하나도 0.2 밑이 아니었다.
 */
function coreDist(D, n, k) {
  const core = new Float64Array(n);
  const buf = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) buf[j] = D[i * n + j];
    const arr = Array.from(buf).sort((a, b) => a - b);
    core[i] = arr[Math.min(k, n - 1)];      // arr[0] = 자기 자신(0)
  }
  return core;
}

function reachTree(D, n, core) {
  const inT = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const edges = [];
  let cur = 0; inT[0] = 1;
  for (let step = 1; step < n; step += 1) {
    let pick = -1; let pw = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (inT[j]) continue;
      const w = Math.max(core[cur], core[j], D[cur * n + j]);
      if (w < best[j]) { best[j] = w; from[j] = cur; }
      if (best[j] < pw) { pw = best[j]; pick = j; }
    }
    if (pick < 0) break;
    inT[pick] = 1;
    edges.push([from[pick], pick, best[pick]]);
    cur = pick;
  }
  return edges.sort((a, b) => a[2] - b[2]);
}

function singleLinkage(edges, n) {
  const parent = new Int32Array(2 * n - 1).fill(-1);
  const size = new Int32Array(2 * n - 1).fill(1);
  const find = (x) => { while (parent[x] >= 0) x = parent[x]; return x; };
  const rows = [];
  let next = n;
  for (const [a, b, w] of edges) {
    const ra = find(a); const rb = find(b);
    if (ra === rb) continue;
    rows.push([ra, rb, w, size[ra] + size[rb]]);
    parent[ra] = next; parent[rb] = next;
    size[next] = size[ra] + size[rb];
    next += 1;
  }
  return rows;
}

function condenseTree(rows, n, minSize) {
  const root = 2 * n - 2;
  const sizeOf = (node) => (node < n ? 1 : rows[node - n][3]);
  const leavesOf = (node) => {
    const out = []; const st = [node];
    while (st.length) {
      const x = st.pop();
      if (x < n) { out.push(x); continue; }
      const [l, r] = rows[x - n]; st.push(l, r);
    }
    return out;
  };
  const relabel = new Int32Array(2 * n - 1).fill(-1);
  relabel[root] = n;
  let nextLabel = n + 1;
  const out = [];
  const ignore = new Uint8Array(2 * n - 1);
  const drop = (node) => {
    const st = [node];
    while (st.length) { const x = st.pop(); ignore[x] = 1; if (x >= n) { const [a, b] = rows[x - n]; st.push(a, b); } }
  };
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node < n || ignore[node]) continue;
    const [l, r, dist] = rows[node - n];
    const lam = dist > 0 ? 1 / dist : Infinity;
    const ls = sizeOf(l); const rs = sizeOf(r);
    if (ls >= minSize && rs >= minSize) {
      relabel[l] = nextLabel; nextLabel += 1;
      out.push([relabel[node], relabel[l], lam, ls]);
      relabel[r] = nextLabel; nextLabel += 1;
      out.push([relabel[node], relabel[r], lam, rs]);
      stack.push(l, r);
    } else if (ls < minSize && rs < minSize) {
      for (const q of leavesOf(node)) out.push([relabel[node], q, lam, 1]);
      drop(l); drop(r);
    } else {
      const big = ls >= minSize ? l : r;
      const small = ls >= minSize ? r : l;
      relabel[big] = relabel[node];
      for (const q of leavesOf(small)) out.push([relabel[node], q, lam, 1]);
      drop(small);
      stack.push(big);
    }
  }
  return out;
}

function hdbscan(vecs, { minSamples = 4, minSize = 10, D = null } = {}) {
  const n = vecs.length;
  const dist = D || distMatrix(vecs);
  const core = coreDist(dist, n, minSamples);
  const tree = condenseTree(singleLinkage(reachTree(dist, n, core), n), n, minSize);
  const birth = new Map();
  for (const [, child, lam] of tree) if (child >= n) birth.set(child, lam);
  const st = new Map();
  for (const [parent, , lam, sz] of tree) st.set(parent, (st.get(parent) || 0) + (lam - (birth.get(parent) ?? 0)) * sz);
  const kids = new Map(); const pts = new Map();
  for (const [p, c] of tree) {
    if (c >= n) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(c); }
    else { if (!pts.has(p)) pts.set(p, []); pts.get(p).push(c); }
  }
  const order = [...st.keys()].filter((c) => c !== n).sort((a, b) => b - a);
  const isCluster = new Map(order.map((c) => [c, true]));
  const score = new Map(st);
  for (const c of order) {
    const kk = kids.get(c) || [];
    if (!kk.length) continue;
    const sum = kk.reduce((a, x) => a + (score.get(x) || 0), 0);
    if (sum > (st.get(c) || 0)) { isCluster.set(c, false); score.set(c, sum); } else {
      score.set(c, st.get(c) || 0);
      const s2 = [...kk];
      while (s2.length) { const x = s2.pop(); isCluster.set(x, false); for (const y of kids.get(x) || []) s2.push(y); }
    }
  }
  const chosen = order.filter((c) => isCluster.get(c));
  const label = new Int32Array(n).fill(-1);
  const prob = new Float64Array(n);
  const lamOf = new Map();
  for (const [, ch, lam] of tree) if (ch < n) lamOf.set(ch, lam);
  chosen.forEach((c, i) => {
    const mine = []; const s2 = [c];
    while (s2.length) {
      const x = s2.pop();
      for (const q of pts.get(x) || []) mine.push(q);
      for (const y of kids.get(x) || []) s2.push(y);
    }
    const lmax = Math.max(...mine.map((q) => lamOf.get(q) ?? 0));
    for (const q of mine) { label[q] = i; prob[q] = lmax > 0 ? Math.min(1, (lamOf.get(q) ?? 0) / lmax) : 1; }
  });
  return { label: Array.from(label), prob: Array.from(prob), k: chosen.length };
}

/**
 * **진짜로 뭉친 자리**를 찾는다 — 손잡이를 박지 않고 쓸어서 고른다.
 *
 * DBCV 논문이 「손잡이 고르기에 이 지표를 쓸 수 있다」고 못 박아 뒀다. 그래서 손으로
 * 고르지 않고 **DBCV 가 가장 높은 자리**를 쓴다(뼈대 손잡이 때와 같은 규율).
 * 곡선을 통째로 실어 보낸다 — 자가 다시 볼 수 있어야 「골랐다」가 된다.
 */
function densePockets(vecs, D) {
  const curve = [];
  let best = null;
  for (const ms of [2, 3, 4, 5]) {
    for (const mc of [5, 8, 10, 15]) {
      const r = hdbscan(vecs, { minSamples: ms, minSize: mc, D });
      if (r.k < 2) { curve.push({ ms, mc, k: r.k, dbcv: null }); continue; }
      const v = dbcv(vecs, r.label, D);
      const noise = r.label.filter((x) => x < 0).length;
      curve.push({ ms, mc, k: r.k, noise, dbcv: Number(v.toFixed(4)) });
      if (!best || v > best.dbcv) best = { ms, mc, dbcv: v, r };
    }
  }
  if (!best) return null;
  return { params: { minSamples: best.ms, minSize: best.mc }, dbcv: Number(best.dbcv.toFixed(4)), label: best.r.label, prob: best.r.prob, k: best.r.k, curve };
}

/**
 * **H0 지속 막대** — 「진짜 덩어리가 몇 개냐」를 **나누지 않고** 답한다 (지속 호몰로지).
 *
 * 실루엣(거리)·DBCV(밀도)·HDBSCAN(안정성)은 다 「이 **나눔**이 좋은가」를 잰다. 지속
 * 호몰로지는 나누지 않는다 — 반지름을 0 에서 키우며 점을 이어 붙이고, 조각(H0)이 **언제
 * 합쳐지는지**를 그대로 적는다. 오래 버티는 조각(막대가 긴 것)이 진짜 구조이고,
 * 대각선에 붙은 짧은 막대는 잡음이다(정본: 대각선에서 먼 점이 진짜다).
 *
 * 셈법이 짧다: 거리 위의 **최소신장나무**를 만들고 가지 무게를 정렬하면, 그게 곧 H0 의
 * 죽는 때다(가지 하나가 조각 둘을 잇는다 = 조각 하나가 죽는다). 나무는 이미 쓰는 손이다.
 *
 * ⚠ **문턱은 박지 않는다.** 막대를 긴 것부터 늘어놓고 **뚝 떨어지는 자리**를 찾는다.
 * 그 위가 「오래 버틴 조각」이다. 곡선을 통째로 실어 자가 다시 볼 수 있게 한다.
 */
/**
 * **붓스트랩 띠 — 긴 막대를 눈대중이 아니라 통계로 가른다** (TASK-KAR-233).
 *
 * 지속 다이어그램의 신뢰 집합(Fasy·Lecci·Rinaldo·Wasserman·Chazal·Singh, Ann. Statist. 2014):
 * 재표본을 B번 뽑아 매번 **원래 다이어그램과의 병목 거리**를 재고, 그 (1−α) 분위수 `c` 로
 * 대각선 둘레에 폭 **2c** 의 띠를 두른다. **띠 밖으로 나온 것만 신호**다.
 *
 * 우리 판정은 여태 **「낙차 1.5배 이상」** 이었다 — 이 세션 내내 「문턱은 재서 고르라」고
 * 해 놓고 정작 여기만 손으로 박혀 있었다. 이제 **자료가 문턱을 정한다.**
 *
 * H0 는 태어남이 모두 0 이라 다이어그램이 **죽는 때의 다중집합**이다. 두 다이어그램의
 * 병목 거리는 **길이순으로 짝지어 가장 큰 차이**를 쓴다 — 이건 참값의 **위쪽 어림**이다
 * (대각선으로 보내는 짝이 더 쌀 수 있으므로). 위쪽 어림이면 띠가 넓어지고, 넓은 띠는
 * **신호를 덜 주장한다** — 틀릴 때 조심하는 쪽으로 틀리는 게 맞다. 그렇게 적어 둔다.
 */
function mstDeaths(idx, dist, n) {
  const m = idx.length;
  const inT = new Uint8Array(m);
  const best = new Float64Array(m).fill(Infinity);
  const out = [];
  let cur = 0; inT[0] = 1;
  for (let step = 1; step < m; step += 1) {
    let pick = -1; let pw = Infinity;
    for (let j = 0; j < m; j += 1) {
      if (inT[j]) continue;
      const w = dist[idx[cur] * n + idx[j]];
      if (w < best[j]) best[j] = w;
      if (best[j] < pw) { pw = best[j]; pick = j; }
    }
    if (pick < 0) break;
    inT[pick] = 1; out.push(best[pick]); cur = pick;
  }
  return out.sort((a, b) => b - a);
}

/**
 * **재는 것까지의 거리(DTM)** — 이상치에 덜 흔들리는 여과 (TASK-KAR-233).
 *
 * 립스·체흐 여과는 **이상치에 아주 약하다**(Chazal·Cohen-Steiner·Mérigot, SoCG 2019).
 * 점 하나가 엉뚱한 데 있으면 막대가 통째로 바뀐다. DTM 은 「그 점이 **빽빽한 데서 얼마나
 * 먼가**」를 잰다: 손잡이 m 에 대해 **k = ⌈mN⌉** 최근접 이웃까지 거리의 **제곱평균제곱근**.
 * 이상치는 값이 크게 나오고, 그 값으로 무게를 준 여과는 막대가 안정하다.
 *
 * ★ 우리 H0 는 여태 **순수 거리**였다 — 주석에 「상호도달거리가 아니다」라고 일부러 적어
 * 두기까지 했다. 그런데 우리 자료는 HDBSCAN 이 **75%를 「어디에도 안 붙는다」**고 하는
 * 이상치 투성이다. 정본이 「이럴 땐 쓰지 마라」는 바로 그 상황이었다.
 *
 * **m 은 하나로 안 박는다** — 쓸어서 **사다리로 싣는다**(눈금 사다리와 같은 규율).
 * 어느 m 에서도 안 갈리면 그건 자료의 답이고, 특정 m 에서만 갈리면 그건 손잡이의 답이다.
 */
const DTM_MS = [0.005, 0.01, 0.02, 0.05, 0.1];

function dtmOf(dist, n, m) {
  const k = Math.max(1, Math.ceil(m * n));
  const out = new Float64Array(n);
  const near = new Float64Array(k);
  for (let i = 0; i < n; i += 1) {
    near.fill(Infinity);
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const d = dist[i * n + j];
      if (d >= near[k - 1]) continue;
      let q = k - 1;
      while (q > 0 && near[q - 1] > d) { near[q] = near[q - 1]; q -= 1; }
      near[q] = d;
    }
    let s = 0; let c = 0;
    for (const d of near) if (Number.isFinite(d)) { s += d * d; c += 1; }
    out[i] = c ? Math.sqrt(s / c) : 0;
  }
  return out;
}

/**
 * DTM 무게 여과의 H0 막대. w = max(dtm x, dtm y, 거리).
 *
 * ★ **태어남을 빼먹으면 DTM 은 아무 일도 안 한다.** 처음엔 죽는 때만 모았다(순수 거리 H0
 * 와 같은 꼴). 그러면 이상치는 **여전히 제 조각**으로 남아 긴 막대를 만든다 — 눈금으로
 * 확인했다: 이상치 열 개를 뿌리니 순수 거리도 DTM 도 똑같이 **자리 12**(조각 13)라 했다.
 * DTM 여과에서 점은 **제 DTM 값에서 태어난다** — 그게 바로 이상치를 죽이는 장치다.
 * 수명 = 합쳐진 때 − 제 태어남, 어른 규칙(늦게 난 쪽이 죽는다).
 * 고치고 다시 재니: 이상치 10개 — 순수 거리 자리 12(틀림) vs **DTM 자리 2**(맞음),
 * 이상치 30개 — 순수 거리 자리 1(틀림) vs **DTM 자리 2**(맞음).
 */
function dtmBars(idx, dist, n, dtm) {
  const mLen = idx.length;
  /* 먼저 무게 최소신장나무 — H0 의 합쳐지는 사건은 그 가지들이 전부다. */
  const inT = new Uint8Array(mLen);
  const best = new Float64Array(mLen).fill(Infinity);
  const from = new Int32Array(mLen).fill(-1);
  const edges = [];
  let cur = 0; inT[0] = 1;
  for (let step = 1; step < mLen; step += 1) {
    let pick = -1; let pw = Infinity;
    for (let j = 0; j < mLen; j += 1) {
      if (inT[j]) continue;
      const a = idx[cur]; const b = idx[j];
      const w = Math.max(dtm[a], dtm[b], dist[a * n + b]);
      if (w < best[j]) { best[j] = w; from[j] = cur; }
      if (best[j] < pw) { pw = best[j]; pick = j; }
    }
    if (pick < 0) break;
    inT[pick] = 1;
    edges.push([best[pick], from[pick], pick]);
    cur = pick;
  }
  edges.sort((a, b) => a[0] - b[0]);
  const par = new Int32Array(mLen);
  const birth = new Float64Array(mLen);
  for (let i = 0; i < mLen; i += 1) { par[i] = i; birth[i] = dtm[idx[i]]; }
  const find = (x) => { let r = x; while (par[r] !== r) { par[r] = par[par[r]]; r = par[r]; } return r; };
  const bars = [];
  for (const [w, a, b] of edges) {
    const ra = find(a); const rb = find(b);
    if (ra === rb) continue;
    const young = birth[ra] > birth[rb] ? ra : rb;
    const old = young === ra ? rb : ra;
    bars.push(w - birth[young]);
    par[young] = old;
    if (birth[young] < birth[old]) birth[old] = birth[young];
  }
  return bars.sort((a, b) => b - a);
}

const BOOT_B = 30;
const BOOT_ALPHA = 0.05;

function bootBand(bars, dist, n, seed0 = 8123) {
  let seed = seed0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dists = [];
  for (let b = 0; b < BOOT_B; b += 1) {
    const idx = new Array(n);
    for (let i = 0; i < n; i += 1) idx[i] = Math.floor(rnd() * n);
    const dd = mstDeaths(idx, dist, n);
    /* ★ **수명 0 인 점은 대각선 위에 있다 — 짝짓기에서 빼야 한다.**
       재표본은 같은 글을 여러 번 뽑으므로 거리 0 인 가지가 700개쯤 생긴다. 그걸 안 빼고
       길이순으로 짝지었더니 우리 막대들이 통째로 그 0 들과 짝지어져 띠가 1.8 로 부풀었다
       (막대 최대가 1.16 인데!). 대각선 점은 병목 거리에 아무 값도 안 보탠다. */
    const mine = bars.filter((v) => v > 1e-9);
    const theirs = dd.filter((v) => v > 1e-9);
    let far = 0;
    const shared = Math.min(mine.length, theirs.length);
    for (let i = 0; i < shared; i += 1) {
      const gap = Math.abs(mine[i] - theirs[i]);
      if (gap > far) far = gap;
    }
    /* 짝이 없어 남는 점은 **대각선으로 보낸다** — 그 값은 수명의 절반이다. */
    const rest = mine.length > theirs.length ? mine.slice(shared) : theirs.slice(shared);
    for (const v of rest) if (v / 2 > far) far = v / 2;
    dists.push(far);
  }
  dists.sort((a, z) => a - z);
  const q = Math.min(dists.length - 1, Math.ceil((1 - BOOT_ALPHA) * dists.length) - 1);
  const c = dists[Math.max(0, q)];
  const band = 2 * c;
  /* ★ **띠를 그대로 「대각선에서 얼마나 먼가」로 쓰면 우리 자료에선 안 된다.**
     재 봤다: 지어낸 세 덩어리에서도, 아무 구름에서도 **똑같이 185개**가 띠 밖으로 나온다.
     까닭 = 우리 H0 는 **최소신장나무의 가지**라, 점마다 「가장 가까운 이웃까지의 거리」만큼
     막대가 하나씩 생긴다 — 그 뭉치가 애초에 0 근처가 아니다(정본이 다루는 그림과 다르다).
     그래서 띠는 **판정선**이 아니라 **잡음의 크기**로 쓴다: **막대 사이 낙차가 띠보다 크면**
     그 자리가 진짜 갈림이다. 눈금으로 확인 — 갈린 셋 → 조각 3, 구름 → 조각 1. */
  const head = bars.slice(0, 30);
  let gap = 0; let at = 0;
  for (let i = 0; i < head.length - 1; i += 1) {
    const g = head[i] - head[i + 1];
    if (g > gap) { gap = g; at = i + 1; }
  }
  const long = gap > band ? at : 0;
  return {
    B: BOOT_B,
    alpha: BOOT_ALPHA,
    c: Number(c.toFixed(4)),
    band: Number(band.toFixed(4)),
    gap: Number(gap.toFixed(4)),
    long,
    /* 띠 밖 점을 그냥 센 값 — **왜 그걸 안 쓰는지** 화면·자가 볼 수 있게 같이 남긴다. */
    naive: bars.filter((v) => v > band).length,
    upperBound: true,
    spread: [Number(dists[0].toFixed(4)), Number(dists[dists.length - 1].toFixed(4))],
  };
}

function h0Bars(vecs, D = null) {
  const n = vecs.length;
  if (n < 20) return null;
  const dist = D || distMatrix(vecs);
  /* Prim — 순수 거리 위의 최소신장나무(상호도달거리가 아니다: 여긴 밀도가 아니라 거리 이야기다). */
  const inT = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const edges = [];
  let cur = 0; inT[0] = 1;
  for (let step = 1; step < n; step += 1) {
    let pick = -1; let pw = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (inT[j]) continue;
      const w = dist[cur * n + j];
      if (w < best[j]) best[j] = w;
      if (best[j] < pw) { pw = best[j]; pick = j; }
    }
    if (pick < 0) break;
    inT[pick] = 1; edges.push(best[pick]); cur = pick;
  }
  const bars = edges.slice().sort((a, b) => b - a);       // 긴 막대부터
  /* **뚝 떨어지는 자리**: 이웃한 막대의 비(比)가 가장 큰 곳. 길이 자체가 아니라 **떨어지는
     정도**를 보므로 말뭉치가 달라도 같은 규칙이 선다. 앞쪽 서른만 본다(뒤는 다 잡음이다). */
  const head = bars.slice(0, 30);
  let cutAt = 0; let bestDrop = 1;
  for (let i = 0; i < head.length - 1; i += 1) {
    const drop = head[i] / (head[i + 1] || 1e-9);
    if (drop > bestDrop) { bestDrop = drop; cutAt = i + 1; }
  }
  /* **떨어지는 자리가 없으면 「조각이 없다」고 말한다.** 가장 큰 낙차가 1.5배도 안 되면
     긴 막대와 짧은 막대가 이어져 있다는 뜻 — 어느 반지름에서도 지도가 또렷이 안 갈린다.
     그때 「조각 1개」라고 적으면 규칙이 뱉은 수를 구조인 양 말하는 것이다. */
  const CLEAR = 1.5;
  const clear = bestDrop >= CLEAR;
  const long = clear ? cutAt : 0;
  /* **조각 수 = 긴 막대 수 + 1.** 조각 셋을 이으려면 가지가 둘 필요하다 — 막대는 「합쳐지는
     사건」이지 「조각」이 아니다. 지어낸 세 덩어리를 자가 2개로 세면서 잡았다. */
  const pieces = clear ? cutAt + 1 : null;
  /* **문턱을 자료가 정한다** — 붓스트랩 띠. 옛 낙차 규칙도 **같이 남긴다**(바뀐 걸 감추지 않는다). */
  const boot = bootBand(bars, dist, n);

  /* **이상치에 덜 흔들리는 답도 같이 낸다** — DTM 무게 최소신장나무. m 은 사다리로 쓴다. */
  const gapOf = (list) => {
    const h = list.slice(0, 30);
    let g = 0; let at = 0;
    for (let i = 0; i < h.length - 1; i += 1) { const d = h[i] - h[i + 1]; if (d > g) { g = d; at = i + 1; } }
    return { gap: g, at };
  };
  const all = Array.from({ length: n }, (_, i) => i);
  const dtmRows = [];
  let midBoot = null;
  for (const mm of DTM_MS) {
    const dtm = dtmOf(dist, n, mm);
    const dd = dtmBars(all, dist, n, dtm);
    const g = gapOf(dd);
    /* 띠는 가운데 손잡이 하나에서만 잰다 — 재표본 서른 판을 다섯 번 돌릴 값은 아니다. */
    let band = null;
    if (mm === DTM_MS[Math.floor(DTM_MS.length / 2)]) {
      let seed = 5501;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const ds = [];
      for (let b = 0; b < BOOT_B; b += 1) {
        const idx = new Array(n);
        for (let i = 0; i < n; i += 1) idx[i] = Math.floor(rnd() * n);
        const rr = dtmBars(idx, dist, n, dtm).filter((v) => v > 1e-9);
        const mine = dd.filter((v) => v > 1e-9);
        let far = 0;
        const sh = Math.min(mine.length, rr.length);
        for (let i = 0; i < sh; i += 1) { const gp = Math.abs(mine[i] - rr[i]); if (gp > far) far = gp; }
        const rest = mine.length > rr.length ? mine.slice(sh) : rr.slice(sh);
        for (const v of rest) if (v / 2 > far) far = v / 2;
        ds.push(far);
      }
      ds.sort((a, z) => a - z);
      const q = Math.min(ds.length - 1, Math.ceil((1 - BOOT_ALPHA) * ds.length) - 1);
      band = Number((2 * ds[Math.max(0, q)]).toFixed(4));
      midBoot = { m: mm, band };
    }
    dtmRows.push({
      m: mm,
      k: Math.max(1, Math.ceil(mm * n)),
      top: Number((dd[0] || 0).toFixed(4)),
      gap: Number(g.gap.toFixed(4)),
      at: g.at,
      band,
      long: band != null ? (g.gap > band ? g.at : 0) : null,
    });
  }
  /* 띠는 하나만 쟀으니 나머지 손잡이도 **그 띠**로 판정한다 — 어느 손잡이에서도 갈리는지 본다. */
  const useBand = midBoot ? midBoot.band : null;
  for (const r of dtmRows) if (r.long == null && useBand != null) r.long = r.gap > useBand ? r.at : 0;
  const dtmSplit = dtmRows.filter((r) => (r.long || 0) > 0).length;
  const stat = {
    long,
    pieces,
    clear,
    drop: Number(bestDrop.toFixed(3)),
    at: Number((head[cutAt] || 0).toFixed(4)),
    bars: head.slice(0, 12).map((x) => Number(x.toFixed(4))),
    /* 붓스트랩 띠 — 이제 **이쪽이 판정**이고 위의 낙차는 견줌용으로 남는다. */
    boot,
    /* 이상치에 덜 흔들리는 답 — 손잡이 m 사다리. 「거리로 본 답」과 **둘 다** 싣는다. */
    dtm: { ms: DTM_MS, rows: dtmRows, band: useBand, split: dtmSplit },
    signal: boot.long,
    bootPieces: boot.long > 0 ? boot.long + 1 : null,
  };
  console.log(clear
    ? `[atlas] H0 지속(옛 낙차 규칙) — 오래 버틴 조각 ${pieces}개 (긴 막대 ${long}개 · 떨어지는 정도 ${stat.drop}배 · 문턱 ${stat.at})`
    : `[atlas] H0 지속(옛 낙차 규칙) — 또렷이 갈리는 자리가 없다 (가장 큰 낙차 ${stat.drop}배 < ${CLEAR})`);
  console.log(`[atlas] H0 붓스트랩 띠 — 재표본 ${boot.B}판 · 병목 거리 ${boot.spread[0]}~${boot.spread[1]}`
    + ` · 95% 분위수 ${boot.c} → **띠 ${boot.band}**(잡음 크기)`);
  console.log(`[atlas]   판정 — 막대 사이 가장 큰 낙차 ${boot.gap} ${boot.gap > boot.band ? '>' : '≤'} 띠 ${boot.band}`
    + ` → **긴 막대 ${boot.long}개**${boot.long > 0 ? ` (조각 ${boot.long + 1}개)` : ' — 어느 자리도 잡음과 못 가른다'}`
    + ` [띠 밖 점을 그냥 세면 ${boot.naive}개 — 그건 이 그림엔 안 맞는 셈이다]`);
  console.log('[atlas]   막대 열둘: ' + stat.bars.join(' '));
  console.log('[atlas] H0(이상치에 덜 흔들리는 · DTM) — ' + dtmRows
    .map((r) => `m${r.m}(k${r.k}): 맨 위 ${r.top}·낙차 ${r.gap}${r.long ? ` → 긴 막대 ${r.long}` : ''}`).join(' | '));
  console.log(`[atlas]   띠 ${useBand} (m ${midBoot ? midBoot.m : '?'} 에서 잼) → 갈린다고 나온 손잡이 ${dtmSplit}/${dtmRows.length}`
    + (dtmSplit === 0 ? ' — **어느 손잡이에서도 안 갈린다**(거리로 본 답과 같다)' : ''));
  return stat;
}

/** 이보다 낮으면 밀도로 봐도 「덩어리」가 아니다. 지어낸 눈금에서 갈린 셋 0.91 · 자른 구름 -0.04. */
const DBCV_REAL = 0.3;

/** 성긴 층을 봉우리에서 고른다. 후보를 다 돌려 보고 실루엣이 가장 높은 수를 쓴다. */
function pickCoarse(vecs, fine, sizes, fallback = 6, candidates = [4, 5, 6, 7, 8]) {
  const scored = [];
  for (const k of candidates) {
    const map = mergeCenters(fine.centers, sizes, k);
    const assign = fine.assign.map((c) => map.get(c) ?? 0);
    /* **글을 반씩 갈라 두 번 잰다** — 짝수 번째로 한 번, 홀수 번째로 한 번. 겹치지 않는
       두 무리에서 같은 봉우리가 나와야 그게 자료의 봉우리다.
       (처음엔 「표본 자리를 1 옮겨」 두 번 쟀는데, 표본이 글 수보다 커서 **같은 표본**이
        나왔다 — 안전장치인 척하는 no-op 이었다. 반씩 가르면 실제로 겹치지 않는다.) */
    const halfN = Math.floor(vecs.length / 2);
    scored.push({
      k: Math.max(...assign) + 1,
      sil: silhouette(vecs, assign),
      a: silhouette(vecs, assign, halfN, 0),
      b: silhouette(vecs, assign, halfN, 1),
    });
  }
  const peak = (key) => {
    const sorted = [...scored].sort((a, b) => b[key] - a[key]);
    const mid = sorted[Math.floor(sorted.length / 2)][key];
    return { k: sorted[0].k, clear: sorted[0][key] > mid * 1.2 + 0.01 };
  };
  const p1 = peak('a'); const p2 = peak('b');
  /* **두 표본이 같은 자리를 가리키고, 둘 다 뚜렷할 때만** 층을 옮긴다. 아니면 손대지 않는다.
     평평한 곡선에서 봉우리를 고르는 건 잡음을 좇는 것이고, 숫자를 바꿔 놓고 「재서 골랐다」고
     말하는 게 더 나쁘다. 실측: 쏠림을 뺀 벡터에서 후보들이 0.03~0.06 로 다 붙어 있다
     (빼기 전 원 벡터로는 0.24 로 보이지만 그건 「모두가 공유하던 방향」이 만든 착시다). */
  const clear = p1.clear && p2.clear && p1.k === p2.k;
  return { k: clear ? p1.k : fallback, sil: scored.find((c) => c.k === (clear ? p1.k : fallback))?.sil ?? null, clear, curve: scored };
}

/**
 * 글마다 **뜻으로 가까운 글 몇**을 미리 구해 둔다 (TASK-KAR-233).
 *
 * 지도에 점이 1516개인데 점을 눌러서 할 수 있는 것이 「원본 열기」 하나뿐이었다.
 * 이음(edges)은 서로 링크로 **부르는** 짝일 뿐이라 뜻으로 가까운 것과 다르다 —
 * 같은 이야기를 따로 적은 두 글은 서로를 안 부른다.
 *
 * 벡터는 이미 있다 — 굽는 자리에서 한 번 구해 두면 보는 쪽에 모델이 필요 없다.
 * 코사인은 길이를 1 로 맞춘 뒤의 내적이다.
 */
function nearestByMeaning(ok, docs, k = 8) {
  const n = ok.length;
  if (n < 2) return;
  const t0 = Date.now();
  /* 셈은 **KarmoMeaning** 이 한다 — 번호로 답한다. 여기서 그 번호를 **글 목록의 자리**로
     옮겨 붙인다(지도는 ok 번호가 아니라 docs 번호로 그린다). */
  const { idx, sim } = meaningNearest(ok.map((o) => o.v), k);
  const at = new Map(docs.map((d, i) => [d.id, i]));
  for (let i = 0; i < n; i += 1) {
    ok[i].d.near = idx[i].map((x) => at.get(ok[x].d.id)).filter((x) => x != null);
    /* 가장 닮은 하나의 **닮은 정도**도 챙긴다 — 겹치는 글(쌍둥이)을 이걸로 찾는다. */
    ok[i].topSim = sim[i].length ? sim[i][0] : -2;
    ok[i].topIdx = idx[i].length ? idx[i][0] : -1;
  }
  console.log(`[atlas] 닮은 글 ${k}개씩 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}

/**
 * **겹치는 글**(쌍둥이)을 찾는다 — Nomic Atlas 가 주제 라벨과 나란히 다는 그 주석.
 *
 * 왜 지금: 블로그 글을 같은 판에 부으면 **같은 생각이 두세 번** 놓인다(발행 글 ↔ 초안 ↔
 * 북마크한 원문). 표시 안 하면 지도가 **없는 밀도**를 만들어 「두 개의 생각」처럼 보인다.
 *
 * 문턱은 **박지 않는다.** 가장 닮은 하나의 닮은 정도를 다 모아 놓고, 문턱을 0.99 에서
 * 내리며 쌍이 몇 개 잡히는지 센다. 처음엔 천천히 늘다가 어느 지점에서 **터진다** —
 * 그 직전이 「진짜 겹침」과 「그냥 비슷함」의 경계다. 곡선을 통째로 실어 보낸다.
 */
function twinsOf(ok, docs) {
  const pairs = new Map();
  for (let i = 0; i < ok.length; i += 1) {
    const j = ok[i].topIdx;
    if (j == null || j < 0) continue;
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
    const sim = ok[i].topSim;
    if (!pairs.has(key) || pairs.get(key) < sim) pairs.set(key, sim);
  }
  const all = [...pairs.entries()].map(([k, sim]) => [...k.split('|').map(Number), sim]);
  const curve = [];
  for (let t = 0.99; t >= 0.895; t -= 0.005) {
    curve.push({ t: Number(t.toFixed(3)), n: all.filter(([, , s]) => s >= t).length });
  }
  /* **터지는 자리 직전**을 고른다. 한 칸 내릴 때 늘어난 수가 그 전 칸의 세 배를 넘으면
     거기서부터는 「그냥 비슷한 글」이 쏟아지는 구간이다. */
  let chosen = curve[0].t;
  let prevGrow = Math.max(1, curve[1].n - curve[0].n);
  for (let i = 2; i < curve.length; i += 1) {
    const grow = curve[i].n - curve[i - 1].n;
    if (grow > prevGrow * 3 && grow > 5) break;
    chosen = curve[i].t;
    prevGrow = Math.max(1, grow);
  }
  /**
   * ★ **바닥을 재서 깐다** — 곡선이 평평하면 위 규칙은 끝값(0.9)까지 걸어 내려간다.
   * 그 자리가 **남남끼리도 닿는 높이**면 겹침이 아닌 것을 겹침이라 하게 된다.
   * 그래서 아무 쌍이나 뽑아 **남남의 최고 닮음**을 재고, 문턱은 그보다 위에서만 고른다.
   * (실측 2026-08-23: 글이 749→757 로 늘자 남남 최고가 0.883 → 0.911 로 올라 0.9 를 넘겼다.
   *  코드는 그대로였는데 자료가 움직여 오탐 2쌍이 생겼다 — 박은 값이 아니라 재는 값이어야 한다.)
   */
  let st = 20260823;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const dot = (a, b) => {
    let s = 0;
    for (let t = 0; t < a.length; t += 1) s += a[t] * b[t];
    return s;
  };
  let strangers = -1;
  const TRIES = 2000;
  for (let t = 0; t < TRIES && ok.length > 2; t += 1) {
    const i = Math.floor(rnd() * ok.length);
    const j = Math.floor(rnd() * ok.length);
    if (i === j) continue;
    /* 진짜 겹침 쌍은 「남남」이 아니다 — 표본에서 뺀다. */
    if (ok[i].topIdx === j || ok[j].topIdx === i) continue;
    const s = dot(ok[i].v, ok[j].v);
    if (s > strangers) strangers = s;
  }
  const floorAt = strangers > 0 ? Math.ceil((strangers + 0.005) * 200) / 200 : null;
  const raised = floorAt != null && chosen < floorAt;
  if (raised) chosen = Number(floorAt.toFixed(3));
  /* 이어진 것끼리 한 무리로 묶고(초안↔발행↔재발행) **가장 긴 글을 대표**로 둔다. */
  const parent = new Array(ok.length).fill(-1);
  const find = (x) => { while (parent[x] >= 0) x = parent[x]; return x; };
  let marked = 0;
  for (const [i, j, sim] of all) {
    if (sim < chosen) continue;
    const a = find(i); const b = find(j);
    if (a !== b) parent[a] = b;
  }
  /* **뿌리도 무리의 식구다.** 처음엔 「부모가 없으면 혼자」로 걸렀는데 그게 무리마다
     대표(뿌리)를 통째로 빼 버려서, 쌍 17개가 무리 2개로 줄었다. 먼저 다 담고
     **식구가 둘 이상인 무리만** 남긴다. */
  const groups = new Map();
  for (let i = 0; i < ok.length; i += 1) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  for (const [r, m] of [...groups]) if (m.length < 2) groups.delete(r);
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const rep = members.reduce((a, b) => (ok[a].d.bytes >= ok[b].d.bytes ? a : b));
    for (const m of members) {
      if (m === rep) continue;
      ok[m].d.twin = ok[rep].d.id;
      marked += 1;
    }
  }
  const stat = {
    at: chosen, pairs: all.filter(([, , s]) => s >= chosen).length, marked,
    groups: [...groups.values()].filter((g) => g.length >= 2).length, curve,
    /* 남남 최고 닮음(잰 바닥)과 그 바닥이 문턱을 밀어 올렸나 — 화면·자가 그대로 읽는다. */
    strangers: strangers > 0 ? Number(strangers.toFixed(4)) : null, floorAt, raised, strangerTries: TRIES,
  };
  console.log(`[atlas] 겹침 곡선 ` + curve.filter((_, i) => i % 4 === 0).map((c) => `${c.t}:${c.n}`).join(' '));
  console.log(`[atlas] 겹치는 글 — 문턱 ${chosen}`
    + (raised ? ` (**남남 최고 ${stat.strangers} 이 곡선 값보다 높아 밀어 올렸다**)` : ' (곡선에서 터지기 직전)')
    + ` · 남남 최고 ${stat.strangers} (아무 쌍 ${TRIES}번)`
    + ` · 쌍 ${stat.pairs}개 · 무리 ${stat.groups}개 · 대표 아닌 글 ${marked}개`);
  return stat;
}


/**
 * **어디에도 안 붙는 글**을 찾는다 (TASK-KAR-233).
 *
 * 이미 있는 「묻힌 글」은 *시간* 기준이다 — 오래 안 건드렸고 아무도 안 부른다.
 * 이건 *뜻* 기준이다: 어제 쓴 글이라도 이웃이 없으면 걸린다. 새 씨앗이거나 잘못 쓴 글.
 *
 * 식 = LOF(Local Outlier Factor · Breunig 외 2000). 내 이웃 밀도를 **그 이웃들의
 * 밀도와 견준다** — 밀도를 절대값으로 재면 성긴 동네가 통째로 이상해 보인다.
 *   닿는 거리 = max(k번째 이웃까지 거리(B), d(A,B))   ← 통계적 흔들림을 눌러 준다
 *   국소 밀도 lrd = k / Σ닿는거리
 *   LOF = 평균(이웃의 lrd / 내 lrd)   ← 1 쯤이면 보통, 크면 혼자 떨어져 있다
 *
 * ⚠ **본문이 얇은 글은 후보에서 뺀다.** 그냥 돌리면 상위 12개 중 6개가 링크뿐인
 * 외장뇌 글이었다 — 재료가 없으니 당연히 혼자 떨어진다. 그건 「본문이 없다」를 다시
 * 찾아낸 것이지 새 렌즈가 아니다. 400자로 자르니 「묻힌 글」과 겹침이 6/12 → 1/12 로
 * 떨어졌다(2026-08-21 실측).
 *
 * 문턱은 절대값으로 안 박는다 — 자료마다 다르다(어떤 자료는 1.1 이 이미 이상치).
 * 후보 중 **위 2%** 만 「혼자」로 친다.
 */
const LONELY_K = 20;
const LONELY_MIN_BYTES = 400;
const LONELY_TOP = 0.02;

function lonelyPerDoc(ok, docs) {
  const cand = ok.filter((o) => (o.d.bytes || 0) >= LONELY_MIN_BYTES);
  if (cand.length < LONELY_K * 3) return null;
  const dim = cand[0].v.length;
  const n = cand.length;
  const M = new Float32Array(n * dim);
  for (let i = 0; i < n; i += 1) {
    const v = cand[i].v;
    let s = 0;
    for (let j = 0; j < dim; j += 1) s += v[j] * v[j];
    s = Math.sqrt(s) || 1;
    for (let j = 0; j < dim; j += 1) M[i * dim + j] = v[j] / s;
  }
  const K = LONELY_K;
  const idx = new Int32Array(n * K);
  const dist = new Float64Array(n * K);
  const t0 = Date.now();
  for (let i = 0; i < n; i += 1) {
    const bd = new Float64Array(K).fill(Infinity);
    const bi = new Int32Array(K).fill(-1);
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      let dot = 0;
      const p = i * dim; const q = j * dim;
      for (let t = 0; t < dim; t += 1) dot += M[p + t] * M[q + t];
      const dd = 1 - dot;                       // 코사인 거리
      if (dd >= bd[K - 1]) continue;
      let k = K - 1;
      while (k > 0 && bd[k - 1] > dd) { bd[k] = bd[k - 1]; bi[k] = bi[k - 1]; k -= 1; }
      bd[k] = dd; bi[k] = j;
    }
    for (let k = 0; k < K; k += 1) { idx[i * K + k] = bi[k]; dist[i * K + k] = bd[k]; }
  }
  const kdist = new Float64Array(n);
  for (let i = 0; i < n; i += 1) kdist[i] = dist[i * K + K - 1];
  const lrd = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let k = 0; k < K; k += 1) s += Math.max(kdist[idx[i * K + k]], dist[i * K + k]);
    lrd[i] = K / (s || 1e-9);
  }
  const lof = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let k = 0; k < K; k += 1) s += lrd[idx[i * K + k]] / lrd[i];
    lof[i] = s / K;
  }
  const sorted = [...lof].sort((a, b) => a - b);
  const cut = sorted[Math.max(0, Math.floor(n * (1 - LONELY_TOP)) - 1)];
  let marked = 0;
  for (let i = 0; i < n; i += 1) {
    cand[i].d.alone = Number(lof[i].toFixed(2));
    if (lof[i] >= cut) { cand[i].d.lonely = true; marked += 1; }
  }
  const top = [...cand.keys()].sort((a, b) => lof[b] - lof[a]).slice(0, 5);
  console.log(`[atlas] 혼자 있는 글 ${marked}개 (후보 ${n}개 중 위 ${LONELY_TOP * 100}% · 문턱 ${cut.toFixed(2)}) · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  for (const i of top) console.log(`[atlas]     ${lof[i].toFixed(2)} ${cand[i].d.lane} · ${cand[i].d.title.slice(0, 40)}`);
  /* 시간 기준(묻힌 글)과 얼마나 겹치나 — 겹치면 새 렌즈가 아니다. 굽는 자리에서 알려 준다. */
  const both = cand.filter((o, i) => lof[i] >= cut && o.d.buried).length;
  /* ★ 겹침이 1/3 을 넘으면 **렌즈를 접는다** (자와 같은 문턱) — 묻힌 글을 다시 비추는
     단추는 단추만 하나 는 것이다. 표시를 지우고 접었다는 사실과 수를 남긴다.
     코퍼스 개편(1918→749·링크 877→52)으로 「부르는 글 없음」이 흔해지자 실제로 넘었다. */
  if (marked && both / marked > 1 / 3) {
    for (const o of cand) if (o.d.lonely) delete o.d.lonely;
    console.log(`[atlas]   혼자 있는 글 렌즈 **접음** — 묻힌 글과 ${both}/${marked} 겹침 (문턱 1/3)`);
    return { marked: 0, folded: { marked, overlapBuried: both, share: Number((both / marked).toFixed(2)) },
      cut: Number(cut.toFixed(2)), candidates: n, overlapBuried: both, k: K, minBytes: LONELY_MIN_BYTES };
  }
  return { marked, cut: Number(cut.toFixed(2)), candidates: n, overlapBuried: both, k: K, minBytes: LONELY_MIN_BYTES };
}

/**
 * 점마다 **여기가 갈래가 만나는 자리인가**를 잰다 (TASK-KAR-233).
 *
 * 이 지도의 목적은 「주운 것과 쓴 것이 겹치는 자리」다. 그런데 겹침을 재는 자가
 * 덩어리 순도밖에 없었다 — 덩어리를 어떻게 나누느냐에 딸려 있고, 경계에서 튄다
 * (실제로 한 번 뒤집혔다: 89·86% → 54·53% 인데 「나빠졌다」로 읽혔다).
 *
 * 정본은 **iLISI**(Local Inverse Simpson's Index · Harmony/scib). 이웃 안 라벨의
 * **유효 개수** = 1 / Σ(비율²). 한 갈래뿐이면 1, 두 갈래가 반반이면 2, 넷이 고르면 4.
 * **덩어리를 안 나눠도 점마다 재진다** — 그래서 경계에서 안 튄다.
 *
 * 이웃은 **뜻으로 가까운 글**(near)을 쓴다. 화면 이웃을 쓰면 줄여 그리며 생긴 거짓말이
 * 그대로 섞여 들어온다 — 재려는 건 그림이 아니라 뜻이다.
 *
 * 주운 것이 들어오는 날 라벨만 갈래 → 주운것/쓴것 으로 바꾸면 **그대로 목적 지표**가 된다.
 */
function mixPerDoc(docs) {
  let sum = 0; let counted = 0; let alone = 0; let meet = 0;
  for (const d of docs) {
    const near = d.near || [];
    if (!near.length) continue;
    const c = new Map();
    let n = 0;
    for (const j of near) {
      const lane = docs[j] && docs[j].lane;
      if (!lane) continue;
      c.set(lane, (c.get(lane) || 0) + 1);
      n += 1;
    }
    if (!n) continue;
    let s = 0;
    for (const v of c.values()) s += (v / n) ** 2;
    d.mix = Number((1 / s).toFixed(2));
    sum += d.mix; counted += 1;
    if (d.mix < 1.01) alone += 1;
    if (d.mix >= MEET_AT) meet += 1;
  }
  if (!counted) return null;
  const mean = sum / counted;
  console.log(`[atlas] 갈래가 만나는 자리 — 평균 ${mean.toFixed(2)}종 · 한 갈래뿐 ${(alone / counted * 100).toFixed(0)}% · 만나는 자리 ${meet}개`);
  return { mean: Number(mean.toFixed(2)), alone, meet, counted };
}

/** 이웃 갈래가 이만큼 되면 「만나는 자리」로 친다. 1.5 = 8개 중 둘째 갈래가 두엇 이상. */
const MEET_AT = 1.5;

/**
 * 자리마다 **이 지도가 여기서 얼마나 정직한가**를 매긴다 (TASK-KAR-233).
 *
 * 384차원을 2차원으로 줄여 그리면 **반드시** 거짓말이 생긴다. 문제는 「거짓말을 하나」가
 * 아니라 **어디서 하나**다 — 재 보니 고르지 않았다: 평균 3.55/8 인데 5%는 0개고 6%는 8개다.
 * 그림만 보면 그 차이를 알 길이 없어서, 안 닮은 것을 닮았다고 읽게 된다.
 * (CheckViz, Lespinats & Aupetit 2011 — 왜곡을 그 자리에 그려 넣어라.)
 *
 * 재는 법은 **사람에게 설명되는 수**로 골랐다: 「닮은 8개 중 지도에서도 가까운 게 몇 개」.
 * 벌점·순위 같은 수는 값이 맞아도 사람이 못 읽는다. 0~8 은 읽는다.
 */
/**
 * **어긋남은 두 종류뿐이다** (TASK-KAR-233 · CheckViz, Lespinats·Aupetit CGF 2011).
 *
 *  · **찢김** — 원래 가까운데 화면에서 멀어진 것 (닮은 글이 지도에서 흩어졌다)
 *  · **거짓 이웃** — 원래 먼데 화면에서 붙은 것 (옆에 있어도 남남이다)
 *
 * ★ 우리는 **찢김만 재고 있었고, 그걸 「옆에 있어도 남남」이라 불렀다.** `honest` =
 * 「닮은 글 여덟 중 지도에서도 가까운 수」 — 낮으면 **닮은 글이 흩어진** 것이지 옆 사람이
 * 남남이라는 뜻이 아니다. 말과 수가 어긋나 있었다. 이제 나머지 반쪽도 잰다:
 * 화면 이웃 스물넷 중 **닮음이 여덟째 이웃보다도 낮은 것**이 몇인가 = 거짓 이웃.
 * (닮음은 임베딩으로 그 자리에서 잰다 — 순위표를 새로 만들 것 없이 스물넷만 재면 된다.)
 */
/**
 * **허브 — 몇 편이 모두의 이웃 자리를 먹나** (TASK-KAR-233 · Radovanović 외, JMLR 2010).
 *
 * 차원이 높아지면 **몇몇 점이 모두의 이웃 목록에 끼어든다**. 원인은 성김이 아니라
 * **본질 차원**: 자료의 평균에 가까운 점은 남들까지의 거리가 천천히 늘어 어디서 봐도
 * 가까워 보인다. 그러면 **나머지는 이웃이 없어진다** — 우리 증상과 겹친다(거짓 이웃 69% ·
 * HDBSCAN 이 75%를 「어디에도 안 붙는다」· 혼자 있는 글 39편).
 *
 * 재는 법 = **N_k 분포의 비뚤어짐** `S = E[(N_k−E)³]/σ³`. 처방 = **거리 다시 재기**
 * (NICDM: 제 이웃까지 평균 거리 μ 로 나눈다). 여기선 **재기만** 한다 — 고칠지는 수를 보고 정한다.
 */
function hubness(dist, n, k, scale = null) {
  const cnt = new Int32Array(n);
  const row = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      row[j] = j === i ? Infinity
        : (scale ? dist[i * n + j] / Math.sqrt(scale[i] * scale[j]) : dist[i * n + j]);
    }
    const idx = Array.from({ length: n }, (_, j) => j);
    idx.sort((a, b) => row[a] - row[b]);
    for (let t = 0; t < k; t += 1) cnt[idx[t]] += 1;
  }
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += cnt[i];
  mean /= n;
  let m2 = 0; let m3 = 0;
  for (let i = 0; i < n; i += 1) { const d = cnt[i] - mean; m2 += d * d; m3 += d * d * d; }
  m2 /= n; m3 /= n;
  const skew = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const sorted = Array.from(cnt).sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0) || 1;
  const topN = Math.max(1, Math.round(n * 0.01));
  return {
    k,
    skew: Number(skew.toFixed(3)),
    max: sorted[0],
    mean: Number(mean.toFixed(2)),
    top1: Number((sorted.slice(0, topN).reduce((a, b) => a + b, 0) / total).toFixed(3)),
    orphans: Array.from(cnt).filter((c) => c === 0).length,
  };
}

/**
 * **왜 안 갈리는지를 요인 이름으로 말한다** (TASK-KAR-233 · Sedlmair·Tatu·Munzner·Tory, EuroVis 2012).
 *
 * 우리는 「안 갈린다」를 **한 수**로만 말해 왔다(실루엣 0.042 · DBCV −0.235 · 꿋꿋함 0.121).
 * 정본은 갈려 보이느냐가 **여러 요인의 결과**라고 한다 — **무리 안**(크기·퍼짐·밀도·
 * **늘어짐**·이상치)과 **무리 사이**(**겹침**·굽음). 고치려면 「겹쳐서」인지 「퍼져서」인지를
 * 알아야 한다.
 *
 * ★ 같은 논문이 매섭게 덧붙인다: 그림 800장을 눈으로 대조했더니 **분리 자동 잣대가 절반 넘게
 * 틀렸다**(진짜 자료에선 3분의 2). 그래서 이 수들도 화면에 **그 경고와 함께** 적는다.
 *
 * 재는 자리는 **화면 좌표**다 — 「갈려 **보이느냐**」가 물음이므로.
 */
/**
 * **초기화 사다리를 굽고 재서 고른다.**
 *
 * 주 판정은 **전역 거리 상관 r_global** 이지 「떨림이 줄었다」가 아니다 — init 을 못 박으면
 * 떨림은 **당연히** 준다(구조 없는 난수 벡터 대조군도 같이 내려간다). 그건 공짜 초록이라
 * 보고만 하고 판정에 안 쓴다.
 *
 * 상한선도 손으로 안 고른다. **같은 벡터를 선형 PCA 로 2차원에 눕힌 판**의 r 을 천장으로
 * 삼는다 — 텍스트 임베딩은 거리 집중 때문에 절대값이 낮게 나올 수 있어서, 「0.55 이상」
 * 같은 남의 집 상수를 쓰면 거짓 실패가 난다.
 */
const LADDER_PICK_SEEDS = [42, 7, 1009];      // 1차 선별용 (조건 9개 × 3판)
const LADDER_PAIRS = 50000;                    // r_global 을 잴 짝 수

async function initLadder(vectors, params, opts = {}) {
  const t0 = Date.now();
  const n = vectors.length;
  const pairs = pairSample(n, LADDER_PAIRS);
  /* 천장 — 선형 PCA 로 눕힌 판. 최적화가 없으니 전역 보존의 실질 상한이다. */
  const flat = normalize2(pca2(vectors).map((p) => [p[0], p[1]]));
  const ceiling = Number(rGlobal(vectors, flat, pairs).toFixed(4));

  /* 사전 등록 — 조건 목록·씨앗을 굽기 전에 못 박고 사후에 안 바꾼다. */
  const conds = [];
  for (const way of INIT_WAYS) {
    if (way === 'random') { conds.push({ way, scale: null, name: 'random' }); continue; }
    for (const sc of INIT_SCALES) conds.push({ way, scale: sc, name: `${way}/${sc.name}` });
  }
  /* 초기 자리는 조건마다 한 번만 계산한다 (씨앗이 바뀌어도 같은 자리). */
  const initOf = new Map();
  for (const c of conds) initOf.set(c.name, initPoints(c.way, vectors, c.scale));

  const runOne = async (c, seed) => {
    const pts = normalize2(await umap2(vectors, { seed, params, init: initOf.get(c.name) }));
    return { pts, r: rGlobal(vectors, pts, pairs) };
  };

  /* ① 1차 선별 — 씨앗 3개 평균 r_global 로 상위 둘만 통과. */
  const first = [];
  for (const c of conds) {
    const rs = [];
    for (const sd of LADDER_PICK_SEEDS) rs.push((await runOne(c, sd)).r);
    first.push({ name: c.name, r: Number((rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(4)), rs: rs.map((v) => Number(v.toFixed(4))) });
  }
  first.sort((a, b) => b.r - a.r);
  const base = first.find((f) => f.name === 'random');
  const top = first.filter((f) => f.name !== 'random').slice(0, 2);

  /* ② 사보타주 — 자가 아무거나 재고 있지 않은지. 둘 다 0 에 붙어야 한다. */
  let st = 909 >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const shufPts = flat.slice();
  for (let i = shufPts.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [shufPts[i], shufPts[j]] = [shufPts[j], shufPts[i]]; }
  const sabPts = Number(rGlobal(vectors, shufPts, pairs).toFixed(4));
  const shufVec = vectors.slice();
  for (let i = shufVec.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [shufVec[i], shufVec[j]] = [shufVec[j], shufVec[i]]; }
  const sabVec = Number(rGlobal(shufVec, flat, pairs).toFixed(4));

  /**
   * ③ **본선** — 이긴 조건을 씨앗 12판으로 굽고, 난수 init 12판과 나란히 놓는다.
   * 문턱을 못 넘어도 **무엇을 샀고 무엇을 팔았는지**는 재야 한다(떨림·이웃 유지·전역 상관).
   */
  const finalOf = async (name) => {
    const init = initOf.get(name);
    const runs = [];
    const rs = [];
    for (const sd of WOB_SEEDS.slice(0, opts.m ?? 12)) {
      const pts = normalize2(await umap2(vectors, { seed: sd, params, init }));
      runs.push(pts);
      rs.push(rGlobal(vectors, pts, pairs));
    }
    const fitted = runs.map((r, i) => (i === 0 ? r : fitTo(r, runs[0])));
    const mid = [];
    for (let i = 0; i < n; i += 1) mid.push([medOf(fitted.map((r) => r[i][0])), medOf(fitted.map((r) => r[i][1]))]);
    const rad = [];
    for (let i = 0; i < n; i += 1) rad.push(medOf(fitted.map((r) => Math.hypot(r[i][0] - mid[i][0], r[i][1] - mid[i][1]))));
    /* 이웃 유지 — 판마다 화면 이웃 8명이 얼마나 그대로인가. */
    const K = 8;
    const nearOf = (P) => {
      const out = [];
      for (let i = 0; i < n; i += 1) {
        const row = [];
        for (let j = 0; j < n; j += 1) if (j !== i) row.push([j, (P[i][0] - P[j][0]) ** 2 + (P[i][1] - P[j][1]) ** 2]);
        row.sort((a, b) => a[1] - b[1]);
        out.push(new Set(row.slice(0, K).map((q) => q[0])));
      }
      return out;
    };
    const nears = fitted.map(nearOf);
    const keep = [];
    for (let i = 0; i < n; i += 1) {
      let acc = 0; let c = 0;
      for (let a = 0; a < nears.length; a += 1) for (let b = a + 1; b < nears.length; b += 1) {
        let hit = 0;
        for (const q of nears[a][i]) if (nears[b][i].has(q)) hit += 1;
        acc += hit / (2 * K - hit); c += 1;
      }
      keep.push(c ? acc / c : 0);
    }
    const sorted = [...rs].sort((a, b) => a - b);
    return {
      name, runs: rs.length,
      r: Number((rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(4)),
      rLo: Number(sorted[0].toFixed(4)), rHi: Number(sorted[sorted.length - 1].toFixed(4)),
      wobble: Number(medOf(rad).toFixed(5)), keep: Number(medOf(keep).toFixed(4)),
    };
  };
  /**
   * 0) **배관이 실제로 도나** — 이게 거짓이면 아래 표는 전부 헛것이다.
   * init 을 「한 귀퉁이에 몰아넣은 극단 배치」로 주고 구운 판이 난수 init 판과 **달라야** 한다.
   * 같으면 optimizationState 가 옛 배열을 붙들고 있다는 뜻(`u.embedding` 재대입이
   * 조용히 무시되는 그 자리) — 초록이 뜨는데 아무것도 안 바뀌는 전형이다.
   */
  const hashOf = (pts) => {
    let h = 2166136261 >>> 0;
    for (const p of pts) {
      const t = `${p[0].toFixed(5)},${p[1].toFixed(5)};`;
      for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    }
    return h.toString(16);
  };
  const corner = Array.from({ length: n }, (_, i) => [9 + (i % 7) * 0.01, 9 + ((i * 3) % 7) * 0.01]);
  const hCorner = hashOf(normalize2(await umap2(vectors, { seed: 42, params, init: corner })));
  const hRandom = hashOf(normalize2(await umap2(vectors, { seed: 42, params })));
  const plumbing = { differs: hCorner !== hRandom, corner: hCorner, random: hRandom };
  console.log(`[atlas]   0) 배관 — 극단 init 판 ${hCorner} vs 난수 init 판 ${hRandom}`
    + ` → ${plumbing.differs ? '초기 자리가 실제로 먹힌다' : '**안 먹힌다 — 아래 표는 전부 헛것이다**'}`);

  const winner = top.length ? await finalOf(top[0].name) : null;
  const control = await finalOf('random');

  return {
    ceiling, pairs: LADDER_PAIRS, seeds: LADDER_PICK_SEEDS, n,
    table: first, base: base ? base.r : null, top: top.map((t) => t.name),
    sabotage: { points: sabPts, vectors: sabVec },
    winner, control, margin: 0.10, plumbing,
    /* **판정** — 주 문턱은 전역 상관이지 떨림이 아니다(떨림은 init 을 못 박으면 공짜로 준다). */
    used: !!(plumbing.differs && winner && control
      && winner.r >= control.r + 0.10 && winner.r >= 0.8 * ceiling && winner.rLo > control.rHi),
    ms: Date.now() - t0,
  };
}

/**
 * **씨앗 떨림 — 이 자리는 자료가 정한 것인가, 난수가 정한 것인가**
 * (Median Consensus Embedding, arXiv 2503.08103 / 텍스트 공간화 민감도, arXiv 2407.17876).
 *
 * ★ 우리 자 쉰 몇 개는 **전부 씨앗 하나 위의 점추정**이다. 「꿋꿋함 0.121 · 봉우리 2개 ·
 * 거짓 이웃 69%」 — 밴드 없는 소수점 세 자리는 **근거 없는 정밀도**다. 비선형 차원축소는
 * 초기 난수 때문에 같은 설정에서도 매판 다른 국소최적에 빠지므로, 판 하나를 「지도」라
 * 부르는 건 표본 하나를 모집단이라 부르는 것과 같다.
 *
 * 그래서 **같은 손잡이로 씨앗만 바꿔** m판을 굽고,
 *  · 점마다 **떨림 반경 r_i** (판들이 그 점을 얼마나 다른 자리에 놓나)
 *  · 판 수를 늘릴 때 **판끼리 얼마나 모이나** (논문의 꺾이는 지점 m≈10)
 *  · 좌표에 기대는 결론들(봉우리 수·거짓 이웃율)의 **씨앗 밴드**
 * 를 낸다.
 *
 * ⚠ **대조군을 잘못 고르면 아무것도 안 잰다.** 「글↔벡터를 섞기」는 소용없다 — 벡터
 * 집합이 그대로라 지도가 이름표만 바뀐 같은 그림이 된다(떨림도 똑같다). 옳은 대조군은
 * **구조가 없는 벡터**다: 실제 벡터의 평균·분산에 맞춘 난수 벡터로 같은 m판을 굽는다.
 * 거기서 나오는 떨림이 「자료가 아무것도 안 정할 때의 떨림」이다.
 *
 * ⚠ 이 바퀴는 **재기만 한다.** 합의 지도(MCE)를 정본으로 올리는 건 다음 바퀴다 —
 * MCE 의 마지막 단계가 MDS(전역 스트레스)라 **국소 구조를 팔아 안정성을 살 수 있고**,
 * 그걸 막는 비퇴행 게이트를 먼저 세워야 하기 때문이다.
 */
const WOB_M = 12;                 // 판 수. 논문의 꺾이는 지점이 m≈10 이라 그 위로 잡았다
const WOB_SEEDS = [42, 7, 1009, 33, 2718, 8191, 5, 60613, 314, 77, 1234, 999];
const WOB_AT = [1, 2, 3, 6];      // k판짜리 합의 지도를 몇 개씩 만들어 서로 견줄지

/** 두 점 집합을 겹친다 — 돌리기·뒤집기·평행이동·크기까지 맞춘다(Procrustes). */
function fitTo(A, B) {
  const n = A.length;
  const mA = [0, 0]; const mB = [0, 0];
  for (let i = 0; i < n; i += 1) { mA[0] += A[i][0] / n; mA[1] += A[i][1] / n; mB[0] += B[i][0] / n; mB[1] += B[i][1] / n; }
  let sxx = 0; let sxy = 0; let syx = 0; let syy = 0; let na = 0;
  for (let i = 0; i < n; i += 1) {
    const ax = A[i][0] - mA[0]; const ay = A[i][1] - mA[1];
    const bx = B[i][0] - mB[0]; const by = B[i][1] - mB[1];
    sxx += ax * bx; sxy += ax * by; syx += ay * bx; syy += ay * by;
    na += ax * ax + ay * ay;
  }
  /* 2×2 SVD 없이: 최적 회전은 [[c,-s],[s,c]], 뒤집기는 행렬식 부호로 고른다. */
  /* ★ 부호를 틀렸다가 합성 진실 검사(0b)에 걸렸다 — 알려진 배치를 44% 어긋나게
     되돌리고 있었고, 그 위에서 잰 떨림은 전부 무효였다.
     Σ bᵀ R a = c(sxx+syy) + s(**sxy − syx**) 를 최대로 하는 c,s 다. */
  const c = sxx + syy; const s = sxy - syx;
  const norm = Math.hypot(c, s) || 1;
  let R = [[c / norm, -s / norm], [s / norm, c / norm]];
  /* 뒤집은 판도 재 보고 더 잘 맞는 쪽을 쓴다 — 씨앗만 다른 판은 뒤집혀 나오기도 한다. */
  const c2 = sxx - syy; const s2 = syx + sxy;
  const norm2 = Math.hypot(c2, s2) || 1;
  const Rf = [[c2 / norm2, s2 / norm2], [s2 / norm2, -c2 / norm2]];
  const apply = (M) => A.map((p) => {
    const ax = p[0] - mA[0]; const ay = p[1] - mA[1];
    return [M[0][0] * ax + M[0][1] * ay, M[1][0] * ax + M[1][1] * ay];
  });
  const err = (P) => {
    let e = 0;
    for (let i = 0; i < n; i += 1) {
      const bx = B[i][0] - mB[0]; const by = B[i][1] - mB[1];
      e += (P[i][0] - bx) ** 2 + (P[i][1] - by) ** 2;
    }
    return e;
  };
  const P1 = apply(R); const P2 = apply(Rf);
  const use = err(P1) <= err(P2) ? P1 : P2;
  if (err(P2) < err(P1)) R = Rf;
  /* 크기도 맞춘다 — 안 맞추면 「더 크게 그린 판」이 떨림으로 잡힌다. */
  let num = 0;
  for (let i = 0; i < n; i += 1) {
    const bx = B[i][0] - mB[0]; const by = B[i][1] - mB[1];
    num += use[i][0] * bx + use[i][1] * by;
  }
  const k = na > 1e-12 ? num / na : 1;
  return use.map((p) => [p[0] * k + mB[0], p[1] * k + mB[1]]);
}

/** 두 판이 얼마나 다른가 — 겹친 뒤 점마다 거리의 평균. */
function runGap(A, B) {
  const P = fitTo(A, B);
  let s = 0;
  for (let i = 0; i < P.length; i += 1) s += Math.hypot(P[i][0] - B[i][0], P[i][1] - B[i][1]);
  return s / P.length;
}

const medOf = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
const qOf = (a, q) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : 0; };

/** m판을 굽고 겹친 다음, 점마다 **가운데 자리에서 얼마나 떨어지나**를 낸다. */
async function wobbleOf(vectors, params, seeds) {
  const runs = [];
  for (const sd of seeds) runs.push(normalize2(await umap2(vectors, { seed: sd, params })));
  const base = runs[0];
  const fitted = runs.map((r, i) => (i === 0 ? r : fitTo(r, base)));
  const n = base.length;
  /* 가운데 자리 = 판들의 좌표 중앙값(평균이 아니다 — 튄 판 하나에 안 끌려간다). */
  const mid = [];
  for (let i = 0; i < n; i += 1) {
    mid.push([medOf(fitted.map((r) => r[i][0])), medOf(fitted.map((r) => r[i][1]))]);
  }
  const r = [];
  for (let i = 0; i < n; i += 1) {
    r.push(medOf(fitted.map((run) => Math.hypot(run[i][0] - mid[i][0], run[i][1] - mid[i][1]))));
  }
  /**
   * ★ **떨림 반경만 보면 두 가지를 못 가른다** — (가) 점들이 이웃을 바꿔 가며 흩어지는 것
   * (나) 덩어리들이 통째로 **자리를 맞바꾸는** 것. 뒤엣것은 겹치기(Procrustes)로 못 없앤다
   * (전체를 한 번 돌리는 것으로는 조각들의 상대 배치를 못 맞추니까).
   * 그래서 **화면 이웃이 판마다 얼마나 그대로인지**를 따로 잰다. 이 수가 높은데 떨림이
   * 크면 답은 「**이웃 관계는 자료의 것, 큰 배치는 씨앗의 것**」이다.
   */
  const K = 8;
  const nearOf = (P) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const row = [];
      for (let j = 0; j < n; j += 1) if (j !== i) row.push([j, (P[i][0] - P[j][0]) ** 2 + (P[i][1] - P[j][1]) ** 2]);
      row.sort((a, b) => a[1] - b[1]);
      out.push(new Set(row.slice(0, K).map((q) => q[0])));
    }
    return out;
  };
  const nears = fitted.map(nearOf);
  const keep = [];
  for (let i = 0; i < n; i += 1) {
    let s2 = 0; let c = 0;
    for (let a = 0; a < nears.length; a += 1) {
      for (let b = a + 1; b < nears.length; b += 1) {
        let hit = 0;
        for (const q of nears[a][i]) if (nears[b][i].has(q)) hit += 1;
        s2 += hit / (2 * K - hit); c += 1;
      }
    }
    keep.push(c ? s2 / c : 0);
  }
  return { runs: fitted, mid, r, keep };
}

/**
 * 씨앗 밴드. `--씨앗` 없이는 안 돈다 — 판 하나가 26초라 매번 굽기엔 비싸다.
 * 대신 **언제 쟀는지**를 같이 실어서, 자가 「옛날 값으로 말하고 있나」를 볼 수 있게 한다.
 */
async function seedWobble(vectors, params, opts = {}) {
  const t0 = Date.now();
  const m = opts.m ?? WOB_M;
  const seeds = WOB_SEEDS.slice(0, m);
  const real = await wobbleOf(vectors, params, seeds);
  /* ⚠ 대조군 = **구조 없는 벡터**. 실제 벡터의 평균·표준편차에 맞춘 난수로 같은 m판. */
  const dim = vectors[0].length;
  const mean = new Float64Array(dim); const sd = new Float64Array(dim);
  for (const v of vectors) for (let k = 0; k < dim; k += 1) mean[k] += v[k] / vectors.length;
  for (const v of vectors) for (let k = 0; k < dim; k += 1) sd[k] += (v[k] - mean[k]) ** 2 / vectors.length;
  for (let k = 0; k < dim; k += 1) sd[k] = Math.sqrt(sd[k]);
  let st = 20260822 >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const gs = () => { const u = Math.max(1e-9, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const fake = vectors.map(() => Array.from({ length: dim }, (_, k) => mean[k] + gs() * sd[k]));
  const nullRun = await wobbleOf(fake, params, seeds);

  const midOf = (rs) => {
    const out = [];
    for (let i = 0; i < rs[0].length; i += 1) out.push([medOf(rs.map((r) => r[i][0])), medOf(rs.map((r) => r[i][1]))]);
    return out;
  };
  /**
   * 판을 늘리면 **가운데 자리가 모이나**.
   *
   * ★ 처음엔 「앞 k판끼리의 평균 거리」를 쟀는데 그건 **판 수와 무관한 모집단 값**이라
   * k 를 늘려도 안 줄어든다(0.162·0.159·0.127·0.130 — 그냥 잡음이었다). 논문이 말하는 건
   * **k판으로 만든 합의 지도끼리**의 거리다. 그래서 12판을 **겹치지 않는 k판 묶음들**로
   * 갈라 각각의 가운데 자리를 내고, 그 가운데 자리들끼리 견준다.
   */
  const closeness = WOB_AT.filter((k) => k >= 1 && Math.floor(m / k) >= 2).map((k) => {
    const groups = [];
    for (let g = 0; g + k <= m; g += k) groups.push(midOf(real.runs.slice(g, g + k)));
    let s = 0; let c = 0;
    for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) { s += runGap(groups[i], groups[j]); c += 1; }
    return { m: k, groups: groups.length, gap: c ? Number((s / c).toFixed(5)) : 0 };
  });
  /* 반씩 갈라 각각의 가운데 자리를 내고 견준다 — 가운데 자리가 판 뽑기에 안 흔들리나. */
  const halfA = real.runs.slice(0, Math.floor(m / 2));
  const halfB = real.runs.slice(Math.floor(m / 2));
  const splitGap = Number(runGap(midOf(halfA), midOf(halfB)).toFixed(5));

  return {
    m, seeds, at: closeness, splitGap,
    /* **언제 잰 값인지** — `--씨앗` 을 줄 때만 도니까, 자가 「옛날 값으로 말하고 있나」를 봐야 한다. */
    n: vectors.length, dim,
    med: Number(medOf(real.r).toFixed(5)), p90: Number(qOf(real.r, 0.9).toFixed(5)),
    keep: Number(medOf(real.keep).toFixed(4)), keepP10: Number(qOf(real.keep, 0.1).toFixed(4)),
    nullKeep: Number(medOf(nullRun.keep).toFixed(4)),
    nullMed: Number(medOf(nullRun.r).toFixed(5)), nullP90: Number(qOf(nullRun.r, 0.9).toFixed(5)),
    ratio: Number((medOf(real.r) / Math.max(1e-9, medOf(nullRun.r))).toFixed(4)),
    single: Number(runGap(real.runs[0], real.runs[1]).toFixed(5)),
    mid: real.mid, perDoc: real.r.map((v) => Number(v.toFixed(4))),
    ms: Date.now() - t0,
  };
}

/**
 * **우리 표의 수 여러 개는 사실 몇 개인가 — 잣대 중복 재기**
 * (Metric Design != Metric Behavior, arXiv 2507.02225, 2025).
 *
 * 그 논문은 자료 96종에 투영 300개씩(기법 40종 무작위 초매개변수) 얹어 품질 잣대들을
 * 재 봤다. 결론이 매섭다 — **설계 의도(국소·덩어리·전역)가 실제 거동을 못 맞힌다.**
 * 가장 큰 무리에 국소·덩어리·전역이 뒤섞여 있었다. 그리고 위험을 이렇게 적는다:
 * 서로 강하게 상관된 잣대를 여럿 대면 **그 성질만 최적화한 기법 쪽으로 평가가 기운다.**
 *
 * ★ 우리에게 그대로 걸린다. 화면에 수를 여러 개 적고 있지만 **그게 여러 개인지 하나인지
 * 재 본 적이 없다.** 수를 많이 적는 것이 정직해 보이지만, 같은 말을 아홉 번 하면 그건
 * 한 번 말한 것이다.
 *
 * 절차는 논문 그대로 셋: ① 잣대끼리 Spearman ρ ② 1−|ρ| 거리로 계층 군집(average linkage)
 * ③ 무리마다 대표 하나. 다만 **심는 대조군 둘**을 더 넣는다 —
 *  · **쌍둥이**: 같은 잣대를 점 절반만 달리해 두 번 잰 것. 반드시 **같은 무리**여야 한다
 *  · **무작위 수**: 판마다 난수. 어느 잣대와도 |ρ| < 0.2 여야 한다
 * 둘 중 하나라도 어긋나면 셈이 틀린 것이지 발견이 아니다.
 */
const ZOO_N = 700;          // 재는 데 쓸 글 수 — 판 40개를 구우니 전부 쓰면 한참 걸린다
const ZOO_NN = [5, 10, 15, 25, 40, 60];
const ZOO_MD = [0, 0.1, 0.25, 0.5, 0.8, 0.99];
const ZOO_BLUR = [0.05, 0.15, 0.4];     // 선형 판을 흐린 것 — 나쁜 쪽 폭을 만든다
const ZOO_PAIRS = 20000;
const ZOO_K = 10;
const ZOO_DUP = 0.9;        // 이 위면 「같은 말 하는 수」
/**
 * 무작위 수가 「안 붙었다」의 문턱은 **손으로 안 고른다.**
 *
 * ★ 처음에 0.2 로 박았다가 시험판에서 걸렸다 — 판이 40개뿐이면 순위상관의 표준오차가
 * 0.16 이고, 잣대 아홉과 견주며 **최대**를 보니 우연히도 0.3~0.4 가 예사로 나온다.
 * 상수 하나가 자를 상시 빨갛게 만들 뻔했다. 그래서 **섞어서 밴드를 만든다** —
 * 실제 잣대 하나를 판 순서만 섞어 같은 셈을 200번 하고, 그 최대들의 95분위를 문턱으로 쓴다.
 * 그리고 진짜 판정은 수가 아니라 **모양**이다: 무작위 수는 **혼자 무리를 이뤄야** 한다.
 */
const ZOO_NOISE_B = 200;

/** 순위로 바꿔 Pearson — 동점은 평균 순위. */
function ranksOf(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Float64Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let t = i; t <= j; t += 1) r[idx[t][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearsonOf(x, y) {
  const n = x.length;
  let mx = 0; let my = 0;
  for (let i = 0; i < n; i += 1) { mx += x[i] / n; my += y[i] / n; }
  let sxy = 0; let sx = 0; let sy = 0;
  for (let i = 0; i < n; i += 1) { const a = x[i] - mx; const b = y[i] - my; sxy += a * b; sx += a * a; sy += b * b; }
  return sxy / (Math.sqrt(sx * sy) || 1);
}
const spearmanOf = (a, b) => pearsonOf(ranksOf(a), ranksOf(b));

/**
 * average linkage 계층 군집 — 붙은 높이를 그대로 남긴다(팔꿈치는 밖에서 고른다).
 * 소속은 **병합을 앞에서부터 다시 밟아** 만든다 — 그래야 자를 자리를 바꿔도 셈이 안 꼬인다.
 */
function agglomerate(D, n) {
  const alive = new Set(Array.from({ length: n }, (_, i) => i));
  const members = new Map(Array.from({ length: n }, (_, i) => [i, [i]]));
  const d = new Map();
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) d.set(key(i, j), D[i * n + j]);
  const merges = [];
  let next = n;
  while (alive.size > 1) {
    let best = null; let bd = Infinity;
    const ids = [...alive];
    for (let a = 0; a < ids.length; a += 1) {
      for (let b = a + 1; b < ids.length; b += 1) {
        const v = d.get(key(ids[a], ids[b]));
        if (v < bd) { bd = v; best = [ids[a], ids[b]]; }
      }
    }
    const [x, y] = best;
    const mx = members.get(x); const my = members.get(y);
    const z = next; next += 1;
    members.set(z, mx.concat(my));
    for (const o of alive) {
      if (o === x || o === y) continue;
      /* average linkage = 원소끼리 거리의 평균 (합쳐진 크기로 가중) */
      const v = (d.get(key(x, o)) * mx.length + d.get(key(y, o)) * my.length) / (mx.length + my.length);
      d.set(key(z, o), v);
    }
    alive.delete(x); alive.delete(y); alive.add(z);
    merges.push({ pair: [x, y], h: bd });
  }
  return { merges, members };
}

/** 붙은 높이가 가장 크게 뛰는 자리에서 자른다 = 팔꿈치. */
function cutByElbow(D, n) {
  const { merges } = agglomerate(D, n);
  let jump = -Infinity; let at = merges.length;
  for (let i = 1; i < merges.length; i += 1) {
    const g = merges[i].h - merges[i - 1].h;
    if (g > jump) { jump = g; at = i; }
  }
  /* 앞 `at` 개 병합만 인정 → 무리 수 = n − at. 소속은 union-find 로 밟는다. */
  const par = Array.from({ length: 2 * n }, (_, i) => i);
  const find = (x) => { let r = x; while (par[r] !== r) r = par[r]; while (par[x] !== r) { const nx = par[x]; par[x] = r; x = nx; } return r; };
  for (let i = 0; i < at; i += 1) {
    const [x, y] = merges[i].pair;
    par[find(x)] = find(y);
    par[n + i] = find(y);      // 합쳐진 마디의 이름표도 같은 뿌리로
  }
  const byRoot = new Map();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(i);
  }
  return { clusters: [...byRoot.values()], jump: Number.isFinite(jump) ? Number(jump.toFixed(4)) : 0, at };
}

/**
 * 판 마흔 개를 굽고, 잣대를 전부 재고, 잣대끼리 얼마나 **같은 말**을 하는지 본다.
 * `--잣대` 없이는 안 돈다 — 판 하나가 몇 초라 매 굽기마다 못 돈다.
 */
async function metricZoo(vectors, docs, params, opts = {}) {
  const t0 = Date.now();
  const nAll = vectors.length;
  /* 뽑기는 씨앗 고정 — 판마다 같은 글이어야 잣대끼리 견줄 수 있다. */
  let st = 5150 >>> 0;
  const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const pick = Array.from({ length: nAll }, (_, i) => i);
  for (let i = pick.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
  const sel = pick.slice(0, Math.min(opts.n ?? ZOO_N, nAll)).sort((a, b) => a - b);
  const n = sel.length;
  const V = sel.map((i) => vectors[i]);
  const lane = sel.map((i) => (docs[i] && docs[i].lane) || '?');
  const dim = V[0].length;

  /* 원공간 거리 한 번만 (코사인) — 잣대 전부가 이걸 쓴다. */
  const nrm = V.map((v) => Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1);
  const HD = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let dp = 0;
      for (let k = 0; k < dim; k += 1) dp += V[i][k] * V[j][k];
      const v = 1 - dp / (nrm[i] * nrm[j]);
      HD[i * n + j] = v; HD[j * n + i] = v;
    }
  }
  const rankRow = (M) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const idx = [];
      for (let j = 0; j < n; j += 1) if (j !== i) idx.push(j);
      idx.sort((a, b) => M[i * n + a] - M[i * n + b]);
      const r = new Int32Array(n);
      for (let t = 0; t < idx.length; t += 1) r[idx[t]] = t + 1;
      out.push({ idx, r });
    }
    return out;
  };
  const HDR = rankRow(HD);
  const pairs = pairSample(n, ZOO_PAIRS, 4242);
  const hdPair = pairs.map(([i, j]) => HD[i * n + j]);
  /* 쌍둥이 대조군이 쓸 절반 — 「같은 잣대, 다른 표본」이다. */
  const half = [];
  for (let i = 0; i < n; i += 1) if (rnd() < 0.5) half.push(i);

  const jac = (A, B) => { let h = 0; for (const q of A) if (B.has(q)) h += 1; return h / (2 * A.size - h || 1); };
  const knn = (R, i, k) => new Set(R[i].idx.slice(0, k));
  const laneIdx = new Map();
  lane.forEach((l, i) => { if (!laneIdx.has(l)) laneIdx.set(l, []); laneIdx.get(l).push(i); });

  /** 판 하나에 잣대 전부. */
  const measure = (pts, idxSeed) => {
    const LD = new Float64Array(n * n);
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const v = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        LD[i * n + j] = v; LD[j * n + i] = v;
      }
    }
    const LDR = rankRow(LD);
    const ldPair = pairs.map(([i, j]) => LD[i * n + j]);
    const rg = pearsonOf(hdPair, ldPair);
    const sp = spearmanOf(hdPair, ldPair);
    /* stress-1 — 배율을 맞춘 뒤 재야 「더 크게 그린 판」이 늘어남으로 안 잡힌다. */
    let num = 0; let den = 0;
    for (let t = 0; t < hdPair.length; t += 1) { num += hdPair[t] * ldPair[t]; den += ldPair[t] * ldPair[t]; }
    const sc = den > 0 ? num / den : 1;
    let a = 0; let b = 0;
    for (let t = 0; t < hdPair.length; t += 1) { a += (hdPair[t] - sc * ldPair[t]) ** 2; b += hdPair[t] ** 2; }
    const stress = Math.sqrt(a / (b || 1));
    /* 믿음직함 / 이어짐 (k=10) — 국소 잣대의 정본 둘. */
    const k = ZOO_K;
    let tw = 0; let ct = 0;
    for (let i = 0; i < n; i += 1) {
      const hk = knn(HDR, i, k); const lk = knn(LDR, i, k);
      for (const j of lk) if (!hk.has(j)) tw += HDR[i].r[j] - k;
      for (const j of hk) if (!lk.has(j)) ct += LDR[i].r[j] - k;
    }
    const z = 2 / (n * k * (2 * n - 3 * k - 1));
    const trust = 1 - z * tw;
    const cont = 1 - z * ct;
    /* 이웃 유지율 두 벌 (k=10 · k=50) + 쌍둥이(절반 표본) */
    const keepAt = (kk, on) => {
      let s = 0; let c = 0;
      for (const i of on) { s += jac(knn(HDR, i, kk), knn(LDR, i, kk)); c += 1; }
      return c ? s / c : 0;
    };
    const all = Array.from({ length: n }, (_, i) => i);
    const keep10 = keepAt(10, all);
    const keep50 = keepAt(50, all);
    const keep10b = keepAt(10, half);
    /* 갈래가 갈려 **보이나** — 화면 좌표에서 (덩어리 층 잣대 둘) */
    let sil = 0; let silN = 0;
    for (let i = 0; i < n; i += 1) {
      const own = laneIdx.get(lane[i]);
      if (!own || own.length < 2) continue;
      let ai = 0;
      for (const j of own) if (j !== i) ai += LD[i * n + j];
      ai /= (own.length - 1);
      let bi = Infinity;
      for (const [l, list] of laneIdx) {
        if (l === lane[i] || list.length < 2) continue;
        let s2 = 0;
        for (const j of list) s2 += LD[i * n + j];
        bi = Math.min(bi, s2 / list.length);
      }
      if (!Number.isFinite(bi)) continue;
      sil += (bi - ai) / Math.max(ai, bi); silN += 1;
    }
    sil = silN ? sil / silN : 0;
    let same = 0; let sameN = 0;
    for (let i = 0; i < n; i += 1) {
      for (const j of LDR[i].idx.slice(0, 10)) { if (lane[j] === lane[i]) same += 1; sameN += 1; }
    }
    const laneNN = sameN ? same / sameN : 0;
    /* 심는 대조군 ② — 판 번호에서 나온 난수. 어느 잣대와도 안 붙어야 한다.
       ⚠ **잘 섞어야 한다.** 처음엔 곱하기 한 번 + LCG 한 걸음이었는데, 그건 판 번호의
       **등차수열**이라 톱니 모양이 남아 품질 잣대와 |ρ| 0.58 로 붙었다. splitmix 로 바꿨다. */
    let ns = (idxSeed + 0x9E3779B9) >>> 0;
    ns = Math.imul(ns ^ (ns >>> 16), 0x21f0aaad) >>> 0;
    ns = Math.imul(ns ^ (ns >>> 15), 0x735a2d97) >>> 0;
    ns = (ns ^ (ns >>> 15)) >>> 0;
    const noise = ns / 4294967296;
    return { rg, sp, stress, trust, cont, keep10, keep50, sil, laneNN, keep10b, noise };
  };

  /* 판 목록 — 사전 등록: 손잡이 격자 36 + 선형 1 + 흐린 판 3 = 40 */
  const plans = [];
  for (const nn of ZOO_NN) for (const md of ZOO_MD) plans.push({ kind: 'umap', nn, md });
  plans.push({ kind: 'pca' });
  for (const s of ZOO_BLUR) plans.push({ kind: 'blur', s });

  const flatPts = normalize2(pca2(V).map((p) => [p[0], p[1]]));
  const rows = [];
  const made = [];
  for (let t = 0; t < plans.length; t += 1) {
    const p = plans[t];
    let pts;
    if (p.kind === 'umap') {
      pts = normalize2(await umap2(V, { seed: 42 + t, params: { way: 'UMAP', nn: p.nn, md: p.md } }));
    } else if (p.kind === 'pca') {
      pts = flatPts;
    } else {
      let s2 = (9001 + t) >>> 0;
      const r2 = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
      pts = flatPts.map((q) => [q[0] + (r2() - 0.5) * 2 * p.s, q[1] + (r2() - 0.5) * 2 * p.s]);
    }
    rows.push(measure(pts, t + 1));
    made.push(p.kind === 'umap' ? `umap ${p.nn}/${p.md}` : (p.kind === 'pca' ? 'pca' : `흐린 ${p.s}`));
  }

  const names = ['rg', 'sp', 'stress', 'trust', 'cont', 'keep10', 'keep50', 'sil', 'laneNN', 'keep10b', 'noise'];
  const label = {
    rg: '전역 거리 상관', sp: '전역 순위 상관', stress: '늘어남(stress)', trust: '믿음직함 k10',
    cont: '이어짐 k10', keep10: '이웃 유지 k10', keep50: '이웃 유지 k50', sil: '갈래 실루엣',
    laneNN: '이웃 갈래 적중', keep10b: '이웃 유지 k10 · 절반 표본 (심은 쌍둥이)', noise: '무작위 수 (심은 대조군)',
  };
  const cols = names.map((k) => rows.map((r) => r[k]));
  const M = names.length;
  const rho = new Float64Array(M * M);
  for (let i = 0; i < M; i += 1) {
    for (let j = i; j < M; j += 1) {
      const v = i === j ? 1 : spearmanOf(cols[i], cols[j]);
      rho[i * M + j] = v; rho[j * M + i] = v;
    }
  }
  const D = new Float64Array(M * M);
  for (let i = 0; i < M; i += 1) for (let j = 0; j < M; j += 1) D[i * M + j] = 1 - Math.abs(rho[i * M + j]);
  const cut = cutByElbow(D, M);
  const clusters = cut.clusters.map((c) => {
    /* 대표 = 무리 안 평균 유사도가 가장 큰 잣대 (논문의 고르는 법) */
    let bi = c[0]; let bv = -Infinity;
    for (const i of c) {
      let s = 0;
      for (const j of c) if (j !== i) s += Math.abs(rho[i * M + j]);
      const v = c.length > 1 ? s / (c.length - 1) : 1;
      if (v > bv) { bv = v; bi = i; }
    }
    return { members: c.map((i) => names[i]), rep: names[bi] };
  });
  const clusterOf = new Map();
  clusters.forEach((c, ci) => c.members.forEach((m) => clusterOf.set(m, ci)));

  const dup = [];
  for (let i = 0; i < M; i += 1) {
    for (let j = i + 1; j < M; j += 1) {
      if (Math.abs(rho[i * M + j]) >= ZOO_DUP) dup.push({ a: names[i], b: names[j], rho: Number(rho[i * M + j].toFixed(3)) });
    }
  }
  dup.sort((x, y) => Math.abs(y.rho) - Math.abs(x.rho));

  const ni = names.indexOf('noise');
  const realIdx = names.map((k, i) => [k, i]).filter(([k]) => k !== 'noise' && k !== 'keep10b').map(([, i]) => i);
  let noiseMax = 0; let noiseWith = null;
  for (const j of realIdx) {
    const v = Math.abs(rho[ni * M + j]);
    if (v > noiseMax) { noiseMax = v; noiseWith = names[j]; }
  }
  /* 문턱을 **섞어서** 만든다 — 잣대 하나를 판 순서만 섞고 같은 최대를 200번 낸다. */
  let bs = 31337 >>> 0;
  const br = () => { bs = (bs * 1664525 + 1013904223) >>> 0; return bs / 4294967296; };
  const maxes = [];
  for (let b2 = 0; b2 < ZOO_NOISE_B; b2 += 1) {
    const sh = cols[realIdx[0]].slice();
    for (let i = sh.length - 1; i > 0; i -= 1) { const j = Math.floor(br() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    let mx = 0;
    for (const j of realIdx) mx = Math.max(mx, Math.abs(spearmanOf(sh, cols[j])));
    maxes.push(mx);
  }
  maxes.sort((x, y) => x - y);
  const band = Number(maxes[Math.floor(0.95 * (maxes.length - 1))].toFixed(3));
  const twinRho = Number(rho[names.indexOf('keep10') * M + names.indexOf('keep10b')].toFixed(3));
  const twinSame = clusterOf.get('keep10') === clusterOf.get('keep10b');
  const real = names.filter((k) => k !== 'noise' && k !== 'keep10b');
  const eff = new Set(real.map((k) => clusterOf.get(k))).size;

  return {
    n, dim, runs: plans.length, kinds: made, k10: ZOO_K, pairs: ZOO_PAIRS, dupAt: ZOO_DUP,
    names, label, rho: Array.from(rho).map((v) => Number(v.toFixed(3))),
    clusters, k: clusters.length, eff, real: real.length, jump: cut.jump, dup,
    /* 심은 대조군 둘 — 이게 어긋나면 아래 수는 전부 무효다. */
    twin: { a: 'keep10', b: 'keep10b', rho: twinRho, same: twinSame },
    /* 무작위 수의 판정 = **혼자 무리를 이루나**(모양). 수는 섞어 만든 밴드와 나란히 적는다. */
    noiseCtl: {
      max: Number(noiseMax.toFixed(3)), with: noiseWith, limit: band, boots: ZOO_NOISE_B,
      alone: (clusters.find((c) => c.members.includes('noise'))?.members.length ?? 0) === 1,
    },
    sane: twinSame && (clusters.find((c) => c.members.includes('noise'))?.members.length ?? 0) === 1
      && noiseMax <= band,
    ms: Date.now() - t0,
  };
}

/**
 * **관심도(Degree-of-Interest) — 전부 그리고 흐리게 대신, 예산 안에서 연결된 것만**
 * (van Ham & Perer, "Search, Show Context, Expand on Demand", IEEE TVCG 2009).
 *
 * ★ 우리는 지금 1918편을 **다 그리고** 관련 없는 것을 알파 0.10 으로 흐리게만 한다.
 * 그건 사실상 `DOI = D(x,y)` 한 항짜리에, 그것도 **화면에서 지우지 않는** 판이다.
 * 그 알파도 「전부 그리기」도 한 번도 안 쟀다 — 손으로 고른 상수다.
 *
 * 논문의 진단: 그래프에선 DOI 가 트리처럼 중첩되지 않아 **국소 최대**가 생긴다 —
 * 재미없는 마디에 둘러싸인 재미있는 마디는 초점에서 출발한 탐색이 **절대 못 닿는다.**
 * 해법이 **관심 확산**: APIdiff(x) = max(API(x), α·max_{이웃 n} (1/EI)·APIdiff(n)),
 * 0 ≤ α < 1. 멀리 있는 봉우리가 골짜기를 타고 초점 쪽으로 스며온다.
 *
 * ⚠ **동그라미(circularity)를 피한다.**
 *  · 걸어 다니는 그래프 = 뜻으로 가까운 이웃(임베딩에서 나온 것)
 *  · **정답은 사람이 손으로 쓴 링크**(`[[이름]]`·일감 번호) — 임베딩과 무관하다
 *  · 그래서 API 에 **링크 수를 절대 안 쓴다**(글 길이·나이만). 쓰면 정답으로 정답을 맞히는 셈이다
 *  · 그리고 **초점에서 2홉 이상** 떨어진 정답만 센다 — 1홉은 이웃 목록이 이미 준다
 */
const DOI_S = 60;          // 화면 예산 (몇 개만 남길 것인가)
const DOI_K = 8;           // 걸어 다닐 이웃 그래프의 차수
/**
 * 한 홉 멀어질 때 깎는 값 — **이것도 손으로 고르지 않는다.**
 *
 * ★ 처음에 0.35 로 박았더니 α 스윕이 **완전히 평평했다**(전부 22%). 확산이 일을 안 한 게
 * 아니라, 홉 벌점이 API(0~1)를 압도해 고르기가 사실상 **BFS 공**이 돼 있었다 — α 를 아무리
 * 올려도 순서가 안 바뀐다. 상수 하나가 다른 상수의 실험을 죽인 것이다.
 * 그래서 α 와 **같이** 스윕하고, 고른 값을 화면에 적는다.
 */
const DOI_HOPS = [0.01, 0.03, 0.06, 0.12, 0.25, 0.5];
const DOI_ITERS = 20;      // 확산(max-plus) 반복 상한
const DOI_ALPHAS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
const DOI_PICK = 30;       // α 를 고르는 데 쓰는 초점 수 (나머지로만 보고한다)
const DOI_FOCUS = 100;

function doiGraph(dist, n, k) {
  const adj = Array.from({ length: n }, () => []);
  const w = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i += 1) {
    const row = [];
    for (let j = 0; j < n; j += 1) if (j !== i) row.push([j, dist[i * n + j]]);
    row.sort((a, b) => a[1] - b[1]);
    for (let t = 0; t < k; t += 1) {
      const [j, d] = row[t];
      if (!adj[i].includes(j)) { adj[i].push(j); w[i].push(d); }
      if (!adj[j].includes(i)) { adj[j].push(i); w[j].push(d); }
    }
  }
  return { adj, w };
}

/** 초점에서 몇 홉인가. 못 닿으면 Infinity. */
function hopsFrom(adj, n, src) {
  const h = new Float64Array(n).fill(Infinity);
  h[src] = 0;
  const q = [src];
  for (let p = 0; p < q.length; p += 1) {
    const c = q[p];
    for (const nx of adj[c]) if (h[nx] === Infinity) { h[nx] = h[c] + 1; q.push(nx); }
  }
  return h;
}

/** 관심 확산 — max-plus 반복. 수렴 반복 수를 같이 낸다. */
function diffuse(api, adj, w, alpha, iters, medW = 1) {
  const n = api.length;
  const out = Float64Array.from(api);
  let used = 0;
  for (let t = 0; t < iters; t += 1) {
    let delta = 0;
    for (let i = 0; i < n; i += 1) {
      let best = api[i];
      for (let e = 0; e < adj[i].length; e += 1) {
        /* EI = 이 이음을 따라가기 싫은 정도.
           ★ 처음엔 `1 + 거리` 를 썼는데 우리 이음 거리는 중앙값 0.038 이라 1/EI ≈ 0.96 —
           **감쇠가 사실상 없었다.** 그러면 확산은 그냥 α^홉 이 되고, α<0.5 면 아무것도 안
           오르고 α>0.9 면 온 지도가 다 오른다(둘 다 순서를 안 바꾼다). 중앙값으로 나눠
           1/EI 가 [0.5, 1] 쯤에 놓이게 한다 — 그래야 「따라가기 싫은 이음」이 뜻을 갖는다. */
        const ei = 1 + w[i][e] / medW;
        const v = alpha * (1 / ei) * out[adj[i][e]];
        if (v > best) best = v;
      }
      if (best - out[i] > delta) delta = best - out[i];
      out[i] = best;
    }
    used = t + 1;
    if (delta < 1e-9) break;
  }
  return { val: out, iters: used };
}

/** 예산 S 를 안 넘으면서 초점을 포함하는 **연결** 부분집합을 탐욕으로 뽑는다. */
function pickBudget(focus, doi, adj, S) {
  const inF = new Set([focus]);
  const cand = new Map();
  for (const nx of adj[focus]) cand.set(nx, doi[nx]);
  while (inF.size < S && cand.size) {
    let best = -1; let bv = -Infinity;
    /* 동점은 **번호가 작은 쪽**으로 — 안 그러면 같은 입력이 판마다 다른 답을 낸다. */
    for (const [x, v] of cand) if (v > bv || (v === bv && x < best)) { bv = v; best = x; }
    cand.delete(best);
    inF.add(best);
    for (const nx of adj[best]) if (!inF.has(nx) && !cand.has(nx)) cand.set(nx, doi[nx]);
  }
  return inF;
}

/**
 * 사람이 쓴 링크 그래프를 **차수를 지킨 채** 마구 다시 잇는다 — 대조군.
 * 차수를 안 지키면 「많이 링크된 글이 잘 잡힌다」와 구별이 안 된다.
 */
function rewire(pairs, rnd, rounds = 10) {
  const es = pairs.map((p) => [...p]);
  for (let t = 0; t < rounds * es.length; t += 1) {
    const a = Math.floor(rnd() * es.length);
    const b = Math.floor(rnd() * es.length);
    if (a === b) continue;
    const [u1, v1] = es[a]; const [u2, v2] = es[b];
    if (u1 === v2 || u2 === v1 || u1 === u2 || v1 === v2) continue;
    es[a] = [u1, v2]; es[b] = [u2, v1];
  }
  return es;
}

function doiEval(docs, ok, dist, n, edges, okAt, seed = 233) {
  const t0 = Date.now();
  const { adj, w } = doiGraph(dist, n, DOI_K);
  /* 사람이 쓴 링크를 ok 번호 공간으로 옮긴다. */
  const linkPairs = [];
  for (const [a, b] of edges) {
    const x = okAt.get(a); const y = okAt.get(b);
    if (x != null && y != null && x !== y) linkPairs.push([x, y]);
  }
  /* ⚠ API 에 **링크를 안 쓴다** — 정답으로 정답을 맞히면 안 된다. 길이와 나이만. */
  const api = new Float64Array(n);
  {
    /* ★ 처음엔 길이와 **신선도**를 섞었는데 우리 글은 `days` 가 거의 비어 있어서 신선도
       항이 모두에게 같은 상수가 됐다 — API 폭이 0.427~0.850 으로 눌렸다. 폭이 좁으면
       확산이 올려 봐야 순서가 안 바뀐다. 길이만 쓰고 **[0,1] 로 펴 준다.** */
    const bs = ok.map((o) => Math.log1p(o.d.bytes || 0));
    const lo = Math.min(...bs); const hi = Math.max(...bs);
    const span = Math.max(1e-9, hi - lo);
    for (let i = 0; i < n; i += 1) api[i] = (bs[i] - lo) / span;
  }
  /* 이음 무게의 중앙값 — 감쇠를 이 눈금에 맞춘다. */
  let medW = 1;
  {
    const all = [];
    for (let i = 0; i < n; i += 1) for (const v of w[i]) all.push(v);
    all.sort((a, b) => a - b);
    medW = all.length ? Math.max(1e-9, all[Math.floor(all.length / 2)]) : 1;
  }
  const linkOf = Array.from({ length: n }, () => new Set());
  for (const [x, y] of linkPairs) { linkOf[x].add(y); linkOf[y].add(x); }

  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  /* 초점 = **2홉 이상 떨어진 정답이 있는** 글. 없으면 잴 것이 없다. */
  const hopCache = new Map();
  const hopsOf = (y) => { if (!hopCache.has(y)) hopCache.set(y, hopsFrom(adj, n, y)); return hopCache.get(y); };
  const cands = [];
  for (let i = 0; i < n; i += 1) {
    if (!linkOf[i].size) continue;
    const h = hopsOf(i);
    const far = [...linkOf[i]].filter((t) => h[t] >= 2 && Number.isFinite(h[t]));
    if (far.length) cands.push({ y: i, far });
  }
  cands.sort((a, b) => b.far.length - a.far.length || a.y - b.y);
  /* 골고루 뽑는다 — 링크가 제일 많은 것만 보면 그쪽에 맞춘 셈이 된다. */
  const step = Math.max(1, Math.floor(cands.length / DOI_FOCUS));
  const focuses = [];
  for (let i = 0; i < cands.length && focuses.length < DOI_FOCUS; i += step) focuses.push(cands[i]);

  const recallAt = (alpha, list, linkTable, hopCost) => {
    const { val, iters } = diffuse(api, adj, w, alpha, DOI_ITERS, medW);
    let got = 0; let want = 0; let missed = 0; let maxIt = iters;
    let sizeBad = 0;
    for (const { y } of list) {
      const h = hopsOf(y);
      const doi = new Float64Array(n);
      for (let i = 0; i < n; i += 1) doi[i] = val[i] - hopCost * (Number.isFinite(h[i]) ? h[i] : 99);
      const F = pickBudget(y, doi, adj, DOI_S);
      if (F.size > DOI_S) sizeBad += 1;
      const far = [...(linkTable[y] || new Set())].filter((t) => h[t] >= 2 && Number.isFinite(h[t]));
      want += far.length;
      for (const t of far) { if (F.has(t)) got += 1; else missed += 1; }
    }
    return { recall: want ? got / want : 0, want, got, missed, iters: maxIt, sizeBad };
  };

  /* 지금 방식 = **뜻으로 가까운 60개**(전부 그리고 흐리게 하는 것과 같은 고르기). */
  const cosineAt = (list, linkTable) => {
    let got = 0; let want = 0;
    for (const { y } of list) {
      const row = [];
      for (let j = 0; j < n; j += 1) if (j !== y) row.push([j, dist[y * n + j]]);
      row.sort((a, b) => a[1] - b[1]);
      const F = new Set(row.slice(0, DOI_S - 1).map((r) => r[0]));
      const h = hopsOf(y);
      const far = [...(linkTable[y] || new Set())].filter((t) => h[t] >= 2 && Number.isFinite(h[t]));
      want += far.length;
      for (const t of far) if (F.has(t)) got += 1;
    }
    return { recall: want ? got / want : 0, want, got };
  };

  const pickSet = focuses.slice(0, DOI_PICK);
  const testSet = focuses.slice(DOI_PICK);
  /* ★ 사전 문턱 (자와 같은 수: 고르기 20 · 판정 40) — 미달이면 재지 않는다.
     판정 표본이 얇으면 대조군(다시 잇기)과 진짜가 안 갈린다 — 실제로 12.5% vs 11.8% 가 났다. */
  if (!(pickSet.length >= 20 && testSet.length >= 40)) {
    return { tooFew: { focuses: focuses.length, pick: pickSet.length, test: testSet.length, needPick: 20, needTest: 40 } };
  }
  /* ① α·홉 벌점을 **앞 30개로만 고르고** 뒤 70개로만 보고한다. */
  const grid = [];
  for (const hp of DOI_HOPS) {
    for (const a of DOI_ALPHAS) {
      grid.push({ alpha: a, hop: hp, recall: Number(recallAt(a, pickSet, linkOf, hp).recall.toFixed(4)) });
    }
  }
  let best = grid[0];
  for (const r of grid) if (r.recall > best.recall) best = r;
  const bestA = best.alpha; const bestH = best.hop;
  /* 고른 홉 벌점에서의 α 곡선 — **안쪽 최대**가 있나. 단조/평평이면 확산이 아니라 그냥 넓힌 것. */
  const sweep = grid.filter((r) => r.hop === bestH).map((r) => ({ alpha: r.alpha, recall: r.recall }));
  const flat = new Set(sweep.map((r) => r.recall)).size <= 1;
  const inner = !flat && bestA > DOI_ALPHAS[0] && bestA < DOI_ALPHAS[DOI_ALPHAS.length - 1];

  const got = recallAt(bestA, testSet, linkOf, bestH);
  const zero = recallAt(0, testSet, linkOf, bestH);
  const cos = cosineAt(testSet, linkOf);

  /* ② 대조군 — 사람이 쓴 링크를 **차수를 지킨 채** 다시 이으면 무너져야 한다. */
  const rw = rewire(linkPairs, rnd);
  const rwTable = Array.from({ length: n }, () => new Set());
  for (const [x, y] of rw) { rwTable[x].add(y); rwTable[y].add(x); }
  const rand = recallAt(bestA, testSet, rwTable, bestH);

  /* ③ 화면 밖 신호 — 표시한 마디마다 「숨은 이웃 수」가 맞나, 확장 방향 top-3 이 맞나. */
  let hiddenErr = 0; let top3Hit = 0; let top3All = 0; let randHit = 0;
  {
    const { val } = diffuse(api, adj, w, bestA, DOI_ITERS, medW);
    for (const { y } of testSet.slice(0, 20)) {
      const h = hopsOf(y);
      const doi = new Float64Array(n);
      for (let i = 0; i < n; i += 1) doi[i] = val[i] - bestH * (Number.isFinite(h[i]) ? h[i] : 99);
      const F = pickBudget(y, doi, adj, DOI_S);
      for (const x of F) {
        const hidden = adj[x].filter((q) => !F.has(q)).length;
        if (hidden !== adj[x].length - adj[x].filter((q) => F.has(q)).length) hiddenErr += 1;
      }
      /* 다음에 들어올 마디 = 지금 후보 중 DOI 최대. 그걸 top-3 이 담고 있나. */
      const cand = [];
      for (const x of F) for (const q of adj[x]) if (!F.has(q)) cand.push(q);
      const uniq = [...new Set(cand)];
      if (uniq.length >= 4) {
        uniq.sort((a, b) => doi[b] - doi[a] || a - b);
        const top3 = new Set(uniq.slice(0, 3));
        top3All += 1;
        if (top3.has(uniq[0])) top3Hit += 1;
        if (rnd() < 3 / uniq.length) randHit += 1;
      }
    }
  }

  /**
   * ★ **쓸지 말지를 수가 정한다.** 합격선은 재기 전 바퀴에 박아 뒀다:
   * α* 가 지금 방식(가까운 60개)과 α=0 **둘 다** 대비 +15%p 이고 스윕에 **안쪽 최대**가 있을 것.
   * 못 넘으면 안 쓴다 — 그리고 **표를 지우지 않고 그대로 싣는다.** 진 것도 알아야 한다.
   */
  const MARGIN = 0.15;
  const beatsCos = got.recall >= cos.recall + MARGIN;
  const beatsZero = got.recall >= zero.recall + MARGIN;
  const used = beatsCos && beatsZero && inner;
  const why = used ? '지금 방식보다 뚜렷이 낫다'
    : !inner ? (flat ? '확산이 아무 일도 안 한다 (α 를 바꿔도 그대로)' : '가장 좋은 α 가 끝값이다 — 확산이 아니라 그냥 넓힌 것')
      : !beatsCos ? '가까운 60개를 못 이긴다'
        : '확산 없는 판을 못 이긴다';

  return {
    used, why, margin: MARGIN, beatsCos, beatsZero,
    S: DOI_S, k: DOI_K, hopCost: bestH, medW: Number(medW.toFixed(5)), apiSpan: 1, hops: DOI_HOPS, grid: grid.length, flat, focuses: focuses.length,
    pick: pickSet.length, test: testSet.length,
    alpha: bestA, inner, sweep,
    recall: Number(got.recall.toFixed(4)), zero: Number(zero.recall.toFixed(4)),
    cosine: Number(cos.recall.toFixed(4)), rand: Number(rand.recall.toFixed(4)),
    want: got.want, missed: got.missed, iters: got.iters, sizeBad: got.sizeBad,
    hiddenErr, top3: top3All ? Number((top3Hit / top3All).toFixed(3)) : null,
    top3Rand: top3All ? Number((randHit / top3All).toFixed(3)) : null, top3Of: top3All,
    ms: Date.now() - t0,
  };
}

/**
 * **dip 검정 — 「이 둘은 정말 갈리나」에 p 값을 붙인다** (Hartigan & Hartigan 1985).
 *
 * ★ 우리 주장 「구획이지 무리가 아니다」의 근거는 지금까지 전부 **문턱을 손으로 고른 자**
 * (실루엣·DBCV·꿋꿋함)이거나 **섞은 대조군**이었다. p 값이 하나도 없었다.
 *
 * dip = 표본의 계단분포(ECDF)와 **가장 가까운 단봉 함수** 사이 거리. 단봉이면 0 에 가깝고
 * 봉우리가 둘이면 커진다. 두 덩어리의 **중심을 잇는 선에 투영**하면 1차원이 되므로 바로 쓸 수 있다.
 *
 * ⚠ **표를 베끼지 않는다.** 원논문의 p 표는 저자들의 통계량 정의(정규화 상수 포함)에 묶여
 * 있다. 우리는 **우리 통계량으로 우리 N 에서 균등분포를 되뽑아** p 를 낸다 — 그러면 상수배는
 * 분자·분모에서 상쇄된다. 균등분포가 단봉 중 가장 불리한 분포라는 것이 이 검정의 근거다.
 */

/** 점들의 **아래 볼록 껍질**(greatest convex minorant) 까지의 최대 거리. */
function convexGap(xs, fs, lo, hi) {
  if (hi - lo < 2) return 0;
  const st = [lo];
  for (let i = lo + 1; i <= hi; i += 1) {
    while (st.length >= 2) {
      const a = st[st.length - 2]; const b = st[st.length - 1];
      /* b 가 a-i 선분 위(또는 위쪽)면 볼록이 아니다 — 버린다. */
      if ((fs[b] - fs[a]) * (xs[i] - xs[a]) >= (fs[i] - fs[a]) * (xs[b] - xs[a])) st.pop();
      else break;
    }
    st.push(i);
  }
  let d = 0; let k = 0;
  for (let i = lo; i <= hi; i += 1) {
    while (k + 1 < st.length && st[k + 1] < i) k += 1;
    const a = st[k]; const b = st[Math.min(k + 1, st.length - 1)];
    const t = xs[b] === xs[a] ? 0 : (xs[i] - xs[a]) / (xs[b] - xs[a]);
    const on = fs[a] + t * (fs[b] - fs[a]);
    if (fs[i] - on > d) d = fs[i] - on;
  }
  return d;
}

/** 위 오목 껍질(least concave majorant) 까지의 최대 거리 — 뒤집어서 같은 셈. */
function concaveGap(xs, fs, lo, hi) {
  const n = hi - lo + 1;
  if (n < 3) return 0;
  const rx = new Array(n); const rf = new Array(n);
  for (let i = 0; i < n; i += 1) { rx[i] = -xs[hi - i]; rf[i] = -fs[hi - i]; }
  return convexGap(rx, rf, 0, n - 1);
}

/**
 * dip 통계량. xs 는 **오름차순**이어야 한다.
 *
 * 봉우리 자리 m 을 하나씩 놓아 보고, 왼쪽은 볼록·오른쪽은 오목으로 맞췄을 때의
 * 최대 어긋남을 잰다. 그 중 **가장 작은 것**이 dip 이다 — 「가장 잘 맞는 단봉 함수」와의 거리.
 */
function dipStat(xs) {
  const n = xs.length;
  if (n < 8) return 0;
  const fs = new Array(n);
  for (let i = 0; i < n; i += 1) fs[i] = (i + 0.5) / n;
  let best = Infinity;
  /* 봉우리 자리를 다 훑으면 O(n²) 이다. n 을 미리 줄여 두므로 감당된다. */
  for (let m = 0; m < n; m += 1) {
    const d = Math.max(convexGap(xs, fs, 0, m), concaveGap(xs, fs, m, n - 1));
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best / 2;
}

/** 균등분포에서 같은 수만큼 되뽑아 p 를 낸다. 표를 안 베낀다. */
function dipP(xs, runs, rnd) {
  const d = dipStat(xs);
  const n = xs.length;
  let ge = 0;
  for (let b = 0; b < runs; b += 1) {
    const u = new Array(n);
    for (let i = 0; i < n; i += 1) u[i] = rnd();
    u.sort((a, c) => a - c);
    if (dipStat(u) >= d) ge += 1;
  }
  return { dip: Number(d.toFixed(5)), p: Number(((ge + 1) / (runs + 1)).toFixed(4)) };
}

const DIP_RUNS = 99;      // 되뽑기 판 수 — p 의 눈금이 1/100 이 된다
const DIP_MAX = 220;      // 한 검정에 쓰는 점 수 상한 (O(n²) 이라 줄인다)

/**
 * **덩어리 짝마다** 중심을 잇는 선에 투영해 dip-p 를 낸다.
 * 갈리면 투영이 두 봉우리가 되고, 안 갈리면 한 봉우리다.
 */
/**
 * ★ **이 검정에는 함정이 있다.** 두 덩어리 중심을 잇는 선은 **그 자료로 고른 방향**이다 —
 * 아무 점 무더기라도 「가장 갈라 보이는 방향」으로 투영하면 두 봉우리처럼 보인다. 그래서
 * 대조군 둘을 같이 낸다:
 *  · **아무 방향** — 같은 두 덩어리를 마구 고른 방향에 투영
 *  · **거짓 쪼개기** — 한 덩어리를 둘로 **억지로 쪼개고** 그 중심을 잇는 선에 투영.
 *    여기서도 p 가 바닥이면 이 검정은 방향 고르기의 산물이지 자료의 것이 아니다.
 */
function projDip(vecs, idxA, idxB, dim, runs, rnd, dir = null) {
  const ca = new Float64Array(dim); const cb = new Float64Array(dim);
  for (const i of idxA) for (let k = 0; k < dim; k += 1) ca[k] += vecs[i][k] / idxA.length;
  for (const i of idxB) for (let k = 0; k < dim; k += 1) cb[k] += vecs[i][k] / idxB.length;
  const u = new Float64Array(dim);
  let norm = 0;
  for (let k = 0; k < dim; k += 1) { u[k] = dir ? dir[k] : cb[k] - ca[k]; norm += u[k] * u[k]; }
  norm = Math.sqrt(norm) || 1;
  const both = [...idxA, ...idxB];
  const step = Math.max(1, Math.ceil(both.length / DIP_MAX));
  const proj = [];
  for (let i = 0; i < both.length; i += step) {
    let t = 0;
    for (let k = 0; k < dim; k += 1) t += vecs[both[i]][k] * u[k] / norm;
    proj.push(t);
  }
  proj.sort((x, y) => x - y);
  return { ...dipP(proj, runs, rnd), used: proj.length };
}

/** 한 덩어리를 둘로 **억지로 쪼갠다** (2-평균 다섯 바퀴) — 거짓 쪼개기 대조군용. */
function fakeSplit(vecs, list, dim, rnd) {
  let a = list[Math.floor(rnd() * list.length)];
  let b = list[Math.floor(rnd() * list.length)];
  if (a === b) b = list[(list.indexOf(a) + 1) % list.length];
  let ca = Float64Array.from(vecs[a]); let cb = Float64Array.from(vecs[b]);
  let A = []; let B = [];
  for (let it = 0; it < 5; it += 1) {
    A = []; B = [];
    for (const i of list) {
      let da = 0; let db = 0;
      for (let k = 0; k < dim; k += 1) { da += (vecs[i][k] - ca[k]) ** 2; db += (vecs[i][k] - cb[k]) ** 2; }
      (da <= db ? A : B).push(i);
    }
    if (!A.length || !B.length) return null;
    ca = new Float64Array(dim); cb = new Float64Array(dim);
    for (const i of A) for (let k = 0; k < dim; k += 1) ca[k] += vecs[i][k] / A.length;
    for (const i of B) for (let k = 0; k < dim; k += 1) cb[k] += vecs[i][k] / B.length;
  }
  return [A, B];
}

/**
 * **덩어리 짝마다** 중심을 잇는 선에 투영해 dip-p 를 낸다.
 * 갈리면 투영이 두 봉우리가 되고, 안 갈리면 한 봉우리다. 대조군 둘을 나란히 낸다.
 */
function dipPairs(vecs, assign, names, seed = 233) {
  const groups = new Map();
  assign.forEach((c, i) => {
    if (c == null || !vecs[i]) return;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(i);
  });
  const keys = [...groups.keys()].filter((c) => groups.get(c).length >= 12);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const dim = vecs.find(Boolean).length;
  const rows = [];
  for (let a = 0; a < keys.length; a += 1) {
    for (let b = a + 1; b < keys.length; b += 1) {
      const A = groups.get(keys[a]); const B = groups.get(keys[b]);
      const got = projDip(vecs, A, B, dim, DIP_RUNS, rnd);
      /* 대조군 ① 아무 방향 — 같은 두 덩어리를 마구 고른 방향에 투영. */
      const dir = new Float64Array(dim);
      for (let k = 0; k < dim; k += 1) dir[k] = rnd() * 2 - 1;
      const rand = projDip(vecs, A, B, dim, DIP_RUNS, rnd, dir);
      rows.push({ a: names?.[keys[a]] || String(keys[a]), b: names?.[keys[b]] || String(keys[b]),
        na: A.length, nb: B.length, used: got.used, dip: got.dip, p: got.p,
        randDip: rand.dip, randP: rand.p });
    }
  }
  /* 대조군 ② **거짓 쪼개기** — 큰 덩어리를 억지로 둘로 쪼개고 같은 셈을 한다.
     여기서도 p 가 바닥이면 이 검정은 방향 고르기의 산물이다. */
  const fakes = [];
  for (const c of keys.slice().sort((x, y) => groups.get(y).length - groups.get(x).length).slice(0, 5)) {
    const sp = fakeSplit(vecs, groups.get(c), dim, rnd);
    if (!sp) continue;
    const r = projDip(vecs, sp[0], sp[1], dim, DIP_RUNS, rnd);
    fakes.push({ name: names?.[c] || String(c), n: groups.get(c).length, dip: r.dip, p: r.p });
  }
  const ALPHA = 0.01;
  rows.sort((x, y) => x.p - y.p || y.dip - x.dip);
  const split = rows.filter((r) => r.p <= ALPHA).length;
  const randSplit = rows.filter((r) => r.randP <= ALPHA).length;
  const fakeSplitN = fakes.filter((f) => f.p <= ALPHA).length;
  return { runs: DIP_RUNS, alpha: ALPHA, floor: Number((1 / (DIP_RUNS + 1)).toFixed(4)),
    pairs: rows.length, split, randSplit, fakeSplit: fakeSplitN, fakes,
    rows: rows.slice(0, 12), minP: rows.length ? rows[0].p : null,
    medDip: rows.length ? rows[Math.floor(rows.length / 2)].dip : null,
    medRandDip: rows.length ? [...rows].sort((x, y) => x.randDip - y.randDip)[Math.floor(rows.length / 2)].randDip : null };
}

function whyNotSeparated(assign, pts, names) {
  const groups = new Map();
  assign.forEach((c, i) => {
    if (c == null) return;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(i);
  });
  const rows = [];
  for (const [c, list] of groups) {
    if (list.length < 3) continue;
    const cx = list.reduce((a, i) => a + pts[i][0], 0) / list.length;
    const cy = list.reduce((a, i) => a + pts[i][1], 0) / list.length;
    const ds = list.map((i) => Math.hypot(pts[i][0] - cx, pts[i][1] - cy));
    const spread = ds.reduce((a, b) => a + b, 0) / ds.length;
    /* 늘어짐 — 2차원 공분산의 주성분 비(1 이면 동그랗다). */
    let sxx = 0; let syy = 0; let sxy = 0;
    for (const i of list) {
      const dx = pts[i][0] - cx; const dy = pts[i][1] - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    sxx /= list.length; syy /= list.length; sxy /= list.length;
    const tr = sxx + syy; const det = sxx * syy - sxy * sxy;
    const disc = Math.max(0, tr * tr / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc); const l2 = Math.max(1e-12, tr / 2 - Math.sqrt(disc));
    rows.push({
      c,
      name: names?.[c] || String(c),
      n: list.length,
      spread: Number(spread.toFixed(4)),
      density: Number((list.length / (Math.PI * spread * spread || 1e-9)).toFixed(2)),
      elong: Number(Math.sqrt(l1 / l2).toFixed(2)),
      outlier: Number((ds.filter((d) => d > spread * 2).length / list.length).toFixed(3)),
      cx, cy,
    });
  }
  if (rows.length < 2) return null;
  /* **무리 사이** — 중심 거리를 두 퍼짐의 평균으로 나눈다. 1 보다 작으면 겹쳐 보인다. */
  let worst = null;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const d = Math.hypot(rows[i].cx - rows[j].cx, rows[i].cy - rows[j].cy);
      const s = (rows[i].spread + rows[j].spread) / 2 || 1e-9;
      const std = d / s;
      if (!worst || std < worst.std) worst = { a: rows[i].name, b: rows[j].name, std: Number(std.toFixed(2)) };
    }
  }
  const med = (arr) => { const q = arr.slice().sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
  const elongMed = med(rows.map((r) => r.elong));
  const outMed = med(rows.map((r) => r.outlier));
  /* **까닭 한 마디** — 가장 크게 걸리는 요인 이름. 한 수가 아니라 이름으로 말해야 고칠 수 있다. */
  let why = '뚜렷하지 않음';
  if (worst && worst.std < 1) why = '겹침';
  else if (elongMed > 2.2) why = '늘어짐';
  else if (outMed > 0.06) why = '이상치';
  else if (worst && worst.std < 2) why = '가까움';
  return {
    rows: rows.map(({ cx, cy, ...rest }) => rest).sort((a, b) => b.n - a.n).slice(0, 12),
    worst,
    elongMed: Number(elongMed.toFixed(2)),
    outlierMed: Number(outMed.toFixed(3)),
    why,
  };
}

/**
 * **거짓 무리 · 놓친 무리** — 「저기 저 덩어리, 진짜 있는 거야?」 (TASK-KAR-233).
 *
 * Jeon·Ko·Jo·Kim·Seo(TVCG 2022)가 못 박는다: 점 단위 잣대(믿을 만함·안 놓침)로는
 * **덩어리 사이를 못 잰다.** 대신 둘을 본다 —
 *  · **꿋꿋함** = 화면에서 뭉친 무리가 **원래 공간에서도** 뭉치나 (낮으면 **거짓 무리**)
 *  · **뭉침**   = 원래 뭉친 무리가 **화면에서도** 붙어 있나 (낮으면 **놓친 무리**)
 * 셈 = **무작위 걷기로 무리를 거듭 뽑아** 반대편 공간에서 흩어지는 정도를 잰다.
 *
 * ★ 여기 것은 **옮겨 심은 것**이지 논문 추정량 그대로가 아니다. 흩어짐은 「그 무리 안 평균
 * 거리」를 **같은 크기 아무 무리**의 평균 거리로 나눠 본다(1 이면 아무 무리와 다를 바 없다).
 * 그래서 **찍기 대조군(자리를 마구 섞은 지도)** 을 반드시 같이 낸다 — 그것 없이는 뜻이 없다.
 */
function groupTrust(vecs, pts, opts = {}) {
  const n = vecs.length;
  if (n < 60) return null;
  const dim = vecs[0].length;
  const K = Math.max(4, Math.round(Math.sqrt(n)));
  const T = opts.iters || 120;
  const WALK = opts.walk || 0.3;
  let seed = opts.seed || 91;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dHi = (a, b) => { let t = 0; for (let i = 0; i < dim; i += 1) { const q = vecs[a][i] - vecs[b][i]; t += q * q; } return Math.sqrt(t); };
  const dLo = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
  const knn = (dist) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const idx = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i);
      idx.sort((a, b) => dist(i, a) - dist(i, b));
      out.push(idx.slice(0, K));
    }
    return out;
  };
  const gHi = knn(dHi); const gLo = knn(dLo);
  /* 한 무리를 무작위 걷기로 뽑는다 — 걷는 만큼 커진다. */
  const walkFrom = (g) => {
    const steps = Math.max(6, Math.round(n * WALK / 20));
    let cur = Math.floor(rnd() * n);
    const seen = new Set([cur]);
    for (let t = 0; t < steps; t += 1) {
      const nb = g[cur];
      cur = nb[Math.floor(rnd() * nb.length)];
      seen.add(cur);
    }
    return [...seen];
  };
  /* 흩어짐 — 그 무리 안 평균 거리 ÷ 같은 크기 아무 무리의 평균 거리. */
  const meanPair = (list, dist) => {
    let s = 0; let c = 0;
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) { s += dist(list[i], list[j]); c += 1; }
    return c ? s / c : 0;
  };
  const randomLike = (m, dist) => {
    const pick = new Set();
    while (pick.size < m) pick.add(Math.floor(rnd() * n));
    return meanPair([...pick], dist);
  };
  const run = (from, otherDist) => {
    const vals = [];
    for (let t = 0; t < T; t += 1) {
      const cl = walkFrom(from);
      if (cl.length < 4) continue;
      const inside = meanPair(cl, otherDist);
      const base = randomLike(cl.length, otherDist) || 1e-9;
      /* 1 이면 아무 무리와 같다 → 0점. 0 이면 완벽히 뭉쳤다 → 1점. */
      vals.push(Math.max(0, Math.min(1, 1 - inside / base)));
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  return {
    k: K,
    iters: T,
    walk: WALK,
    /* 화면에서 뽑아 원래 공간에서 재면 → 꿋꿋함(거짓 무리가 적을수록 높다) */
    steady: Number(run(gLo, dHi).toFixed(3)),
    /* 원래 공간에서 뽑아 화면에서 재면 → 뭉침(놓친 무리가 적을수록 높다) */
    cohesive: Number(run(gHi, dLo).toFixed(3)),
  };
}

/**
 * **허브 줄이는 법 셋** (Schnitzer·Flexer·Schedl·Widmer, JMLR 2012 · OFAI hub-toolbox).
 * 거리행렬 하나로 셋 다 돈다 — 어느 것이 제일인지는 **재서** 고른다.
 *
 *  · **상호 근접도(정규분포판)** — 「x·y 둘 **다에게서** 이 거리보다 먼 점이 얼마나 되나」를
 *    확률로. 줄마다 거리의 평균·표준편차를 재서 `(1−Φ)·(1−Φ)`. 전역 배율.
 *  · **국소 배율(NICDM)** — 제 이웃까지 평균 거리로 나눈다. (이미 재 봤다.)
 *  · **공유 이웃(SNN)** — 이웃 목록이 얼마나 겹치나.
 *
 * 셋 다 **거리를 다시 매기는** 것이라, 새 거리로 이웃을 다시 뽑아 쏠림을 재면 견줄 수 있다.
 */
function normCdf(z) {
  /* Abramowitz–Stegun 7.1.26 꼴 — 오차 1e-7 이면 충분하다. */
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** 줄마다 평균·표준편차 — 상호 근접도(정규분포판)에 쓴다. */
function rowStats(dist, n) {
  const mu = new Float64Array(n);
  const sd = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let s = 0; let c = 0;
    for (let j = 0; j < n; j += 1) { if (i === j) continue; s += dist[i * n + j]; c += 1; }
    mu[i] = s / c;
    let v = 0;
    for (let j = 0; j < n; j += 1) { if (i === j) continue; const d = dist[i * n + j] - mu[i]; v += d * d; }
    sd[i] = Math.sqrt(v / c) || 1e-9;
  }
  return { mu, sd };
}

/** 새 거리로 이웃을 다시 뽑아 쏠림을 잰다. `at(i,j)` 가 그 거리다. */
function hubnessBy(n, k, at) {
  const cnt = new Int32Array(n);
  const row = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) row[j] = j === i ? Infinity : at(i, j);
    const idx = Array.from({ length: n }, (_, j) => j);
    idx.sort((a, b) => row[a] - row[b]);
    for (let t = 0; t < k; t += 1) cnt[idx[t]] += 1;
  }
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += cnt[i];
  mean /= n;
  let m2 = 0; let m3 = 0;
  for (let i = 0; i < n; i += 1) { const d = cnt[i] - mean; m2 += d * d; m3 += d * d * d; }
  m2 /= n; m3 /= n;
  const sorted = Array.from(cnt).sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0) || 1;
  const topN = Math.max(1, Math.round(n * 0.01));
  return {
    skew: Number((m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0).toFixed(3)),
    max: sorted[0],
    mean: Number(mean.toFixed(2)),
    top1: Number((sorted.slice(0, topN).reduce((a, b) => a + b, 0) / total).toFixed(3)),
    orphans: Array.from(cnt).filter((c) => c === 0).length,
  };
}

/** NICDM 의 배율 — 제 k-이웃까지의 평균 거리. */
function nicdmScale(dist, n, k) {
  const out = new Float64Array(n);
  const row = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) row[j] = j === i ? Infinity : dist[i * n + j];
    const sorted = Array.prototype.slice.call(row).sort((a, b) => a - b);
    let acc = 0;
    for (let t = 0; t < k; t += 1) acc += sorted[t];
    out[i] = (acc / k) || 1e-9;
  }
  return out;
}

function honestyPerDoc(docs, coords, screenK = 24, vecOf = null) {
  const pts = [];
  docs.forEach((d, i) => { if (coords.get(d.id)) pts.push([i, coords.get(d.id)]); });
  if (pts.length < screenK + 2) return;
  /* 지도 위 이웃을 먼저 구한다. 격자로 잘라 후보를 좁힌다 — 전수는 n² 이라
     글이 몇 배 늘면 굽는 시간이 통째로 무너진다. */
  const side = Math.max(4, Math.round(Math.sqrt(pts.length / 12)));
  const cell = new Map();
  const key = (x, y) => `${Math.min(side - 1, Math.max(0, Math.floor(((x + 1) / 2) * side)))},${Math.min(side - 1, Math.max(0, Math.floor(((y + 1) / 2) * side)))}`;
  for (const [i, p] of pts) {
    const k = key(p[0], p[1]);
    if (!cell.has(k)) cell.set(k, []);
    cell.get(k).push([i, p]);
  }
  let sum = 0; let counted = 0;
  const screenNear = new Map();
  for (const [i, p] of pts) {
    const ci = Math.min(side - 1, Math.max(0, Math.floor(((p[0] + 1) / 2) * side)));
    const cj = Math.min(side - 1, Math.max(0, Math.floor(((p[1] + 1) / 2) * side)));
    /* 옆 칸까지 본다. 한 칸만 보면 칸 가장자리에 선 점이 이웃을 잃는다. */
    let cands = [];
    for (let a = -1; a <= 1 && cands.length < screenK * 6; a += 1) {
      for (let b = -1; b <= 1; b += 1) {
        const g = cell.get(`${ci + a},${cj + b}`);
        if (g) cands = cands.concat(g);
      }
    }
    /* 그래도 모자라면 전부 본다 — 성긴 자리에서만 벌어지는 일이라 비싸지 않다. */
    if (cands.length < screenK + 1) cands = pts;
    const near2d = new Set(cands
      .filter(([j]) => j !== i)
      .map(([j, q]) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2])
      .sort((a, b) => a[1] - b[1])
      .slice(0, screenK)
      .map(([j]) => j));
    const near = docs[i].near || [];
    if (!near.length) continue;
    docs[i].honest = near.filter((j) => near2d.has(j)).length;
    sum += docs[i].honest; counted += 1;
    /* **나머지 반쪽은 여기서 못 잰다.** 화면 이웃이 스물넷인데 「여덟째 닮은 글」을 잣대로
       삼으면 **완벽한 지도도 다 걸린다**(재 봤다: 84%). 같은 수의 이웃끼리 견줘야 한다 —
       진짜 순위 스물넷과 화면 순위 스물넷. 그건 거리행렬이 생긴 뒤에 잰다(아래 falseNeighbours). */
    screenNear.set(i, near2d);
  }
  if (counted) {
    const zero = docs.filter((d) => d.honest === 0).length;
    console.log(`[atlas] **찢김** (닮은 글이 지도에서 흩어짐) — 평균 ${(sum / counted).toFixed(2)}/8 남음`
      + ` · 하나도 안 남은 글 ${zero}개 (${(zero / counted * 100).toFixed(0)}%)`);
  }
  return screenNear;
}

/**
 * **거짓 이웃** — 화면에서 이웃인데 진짜로는 먼 것 (CheckViz 의 나머지 반쪽).
 *
 * 잣대는 **같은 수끼리**: 화면 이웃 K개 중, **진짜 순위가 K 밖**인 것이 몇인가.
 * (「여덟째 닮은 글보다 덜 닮았나」로 재면 완벽한 지도도 84% 가 걸린다 — 스물넷을 여덟으로
 * 재는 셈이라 그렇다. 처음에 그렇게 재고 수가 이상해서 잡았다.)
 */
function falseNeighbours(docs, screenNear, dist, n, okAt) {
  if (!screenNear || !dist) return;
  let sum = 0; let counted = 0;
  const row = new Float64Array(n);
  for (const [i, near2d] of screenNear) {
    const a = okAt.get(i);
    if (a == null) continue;
    const K = near2d.size;
    if (!K) continue;
    /* 진짜 거리 K번째 = 순위 문턱. 한 줄만 훑으면 된다. */
    for (let j = 0; j < n; j += 1) row[j] = j === a ? Infinity : dist[a * n + j];
    const sorted = Array.prototype.slice.call(row).sort((x, y) => x - y);
    const cut = sorted[Math.min(K - 1, sorted.length - 1)];
    let fake = 0; let seen2 = 0;
    for (const j of near2d) {
      const b = okAt.get(j);
      if (b == null) continue;
      seen2 += 1;
      if (dist[a * n + b] > cut) fake += 1;
    }
    if (!seen2) continue;
    docs[i].fake = fake;
    docs[i].fakeOf = seen2;
    sum += fake / seen2; counted += 1;
  }
  if (!counted) return null;
  const half = docs.filter((d) => d.fakeOf && d.fake / d.fakeOf > 0.5).length;
  console.log(`[atlas] **거짓 이웃** (옆에 있어도 남남) — 화면 이웃 중 평균 ${(sum / counted * 100).toFixed(0)}%`
    + ` · 절반 넘는 글 ${half}개 (${(half / counted * 100).toFixed(0)}%)`);
  const tears = docs.filter((d) => d.honest != null);
  const tearMean = tears.length ? tears.reduce((a, d) => a + (1 - d.honest / 8), 0) / tears.length : null;
  return {
    k: 24,
    fakeMean: Number((sum / counted).toFixed(3)),
    fakeHalf: half,
    counted,
    tearMean: tearMean === null ? null : Number(tearMean.toFixed(3)),
    tearAll: tears.filter((d) => d.honest === 0).length,
  };
}

/**
 * 칸마다 이름을 달아 둔다 — 당겼을 때 이름이 사라지지 않게.
 *
 * 덩어리 이름은 덩어리 **한가운데 한 점**에만 붙는다. 멀리서는 그게 맞는데,
 * 당기면 그 한 점이 화면 밖으로 나가 버린다 — 8배 당김 기준 글 10개 이상 들은
 * 화면 47칸 중 **23칸이 이름 0개**였다(측정). 점만 보이고 여기가 어디인지 모른다.
 *
 * WizMap(arXiv 2306.09328) 은 이름을 **자리로** 만든다 — 판을 네 칸씩 재귀로 갈라
 * 칸마다 그 안 글을 합쳐 말을 뽑고, 배율에 따라 칸 크기를 바꾼다. 같은 것을 한다.
 * 재귀 분할 깊이 d = 2^d 격자라 격자로 직접 센다.
 *
 * 이름은 이미 있는 c-TF-IDF 를 그대로 쓴다 — AI 호출 0회(하루 20번 제한과 무관).
 */
function tileNames(docs, coords, side) {
  const MIN = 6;                       // 글이 이보다 적은 칸은 이름을 안 달는다 — 한두 개로 지은 이름은 우연이다
  const cells = new Map();
  for (const d of docs) {
    const xy = coords.get(d.id);
    if (!xy) continue;
    /* 자리는 -1..1 이다. 0..1 로 알고 재면 절반이 음수 칸으로 가 숫자가 통째
       틀린다(2026-08-21 그렇게 한 번 틀렸다). */
    const i = Math.min(side - 1, Math.max(0, Math.floor(((xy[0] + 1) / 2) * side)));
    const j = Math.min(side - 1, Math.max(0, Math.floor(((xy[1] + 1) / 2) * side)));
    const k = `${i},${j}`;
    if (!cells.has(k)) cells.set(k, { i, j, docs: [] });
    cells.get(k).docs.push(d);
  }
  const big = [...cells.values()].filter((c) => c.docs.length >= MIN);
  if (!big.length) return [];
  const names = nameAllByWords(big.map((c) => c.docs));
  return big.map((c, idx) => ({ i: c.i, j: c.j, n: c.docs.length, name: names[idx] }))
    .filter((t) => t.name && t.name !== '이름 없음' && t.name !== '빈 덩어리');
}

/** 이름인가, 아니면 「못 하겠다」는 문장인가. */
function isRealName(n) {
  if (/없습니다|없음|죄송|제공할 수|알 수 없|불가능|해당 없/.test(n)) return false;
  if (/(입니다|습니다|합니다|됩니다)[.!]?$/.test(n)) return false;   // 문장 끝맺음
  if (n.length > 20) return false;
  return true;
}

/** 지난번에 잘못 박힌 이름을 걷어낸다 — 캐시는 안 지우면 영원히 남는다. */
function pruneNames(cache) {
  let n = 0;
  for (const [k, v] of Object.entries(cache)) {
    if (!isRealName(v)) { delete cache[k]; n += 1; }
  }
  if (n) console.log(`[atlas] 이름 아닌 것 ${n}개를 캐시에서 걷어냈다`);
  return n;
}

async function nameClusters(groups) {
  const names = nameAllByWords(groups);

  /* **기본은 AI 안 부른다.** 이름 후보를 이어진 말(구)로 바꾼 뒤로 글에 실제로 나오는
     말이 98% 가 됐다 — 하루 20번 제한에 매달릴 이유가 없어졌다. AI 이름은 캐시에
     남아 있어도 그게 어느 글에서 나온 말인지 확인할 길이 없다(못 믿는 이름이 낫지 않다).
     굽기가 판마다 같은 결과를 내는 것도 덤이다.
     그래도 시켜 보고 싶으면 `--ai-names` 를 준다. */
  if (!flag('--ai-names')) {
    console.log('[atlas] 이름은 글에서 뽑는다 (AI 안 부름 — `--ai-names` 로 켤 수 있다)');
    return names;
  }
  const cache = loadNames();
  pruneNames(cache);

  let ai = null;
  let quotaDone = false;
  /* **큰 덩어리부터 이름을 청한다.** 하루치가 20번뿐이라 한 번에 다 못 채운다 —
     늘 0번부터 돌면 뒤쪽 덩어리는 영영 이름을 못 받는다. 큰 것부터 채우면
     눈에 많이 띄는 이름이 먼저 좋아지고, 며칠 굽는 동안 캐시에 쌓여 결국 다 찬다.
     (작은 로컬 모델은 한국어에 빈 값을 뱉어 못 쓴다 — 2026-08-21 시험함.) */
  const order = groups
    .map((g, i) => [i, g.length])
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i);
  for (const i of order) {
    const titles = groups[i];
    if (!titles.length) continue;
    // 같은 식구면 지난번 이름을 그대로 쓴다 — 하루치를 아낀다.
    const key = crypto.createHash('sha1').update(titles.map((d) => d.id).sort().join('|')).digest('hex').slice(0, 16);
    if (cache[key]) { names[i] = cache[key]; continue; }
    if (quotaDone) continue;
    try {
      if (!ai) ({ generateAssistantText: ai } = await import('@karmo/ai/node'));
      const sample = titles.slice(0, 18).map((t) => `- ${t}`).join('\n');
      const { text } = await ai(process.env,
        '다음 글 제목들이 한 덩어리로 묶였다. 이 덩어리를 부를 이름을 지어라.\n'
        + '규칙: 한국어 12자 이내 · 명사구 · 설명 X · 따옴표 X · 이름만 한 줄로.\n\n'
        + sample);
      const name = text.trim().split('\n')[0].replace(/^["'「]|["'」]$/g, '').slice(0, 20);
      /* **답이 아닌 답을 이름으로 받지 않는다.** AI 가 「글 제목 내용이 없습니다」 같은
         문장을 돌려줄 때가 있는데, 그걸 이름으로 쓰고 캐시에 박으면 영원히 남는다
         (실제로 그랬다 — 북마크 덩어리 이름이 석 달치 그 문장이었다). 이름은 짧은
         명사구여야 한다. 문장 끝맺음이 붙었거나 못 하겠다는 말이면 버리고, 제목에서
         뽑은 이름을 그대로 둔다. */
      if (name && isRealName(name)) { names[i] = name; cache[key] = name; }
      else if (name) console.warn(`[atlas] AI 가 이름 대신 문장을 줬다 — 버린다: ${name}`);
    } catch (e) {
      if (/quota|rate.?limit|429/i.test(e.message || '')) {
        console.warn('[atlas] 이름 짓기 하루치를 다 썼다 — 나머지는 제목에서 뽑은 이름으로 둔다.');
        quotaDone = true;                       // 남은 덩어리는 헛치지 않는다
      } else {
        console.warn(`[atlas] 이름 짓기 실패: ${e.message}`);
      }
    }
  }
  fs.writeFileSync(NAME_CACHE, JSON.stringify(cache, null, 1));
  return names;
}

export { collect, gist, title, frontmatter, embedLocal, LOCAL_MODEL, attachLinkBodies };

async function main() {
  requireSources();   // 굽기는 소스가 있어야 한다 — config 오류·없는 root 는 여기서 분명히 죽는다
  const limit = Number(opt('--limit', '0')) || 0;
  // 기본 = 스스로 고르기. `--clusters N` 을 주면 그 수로 박는다.
  const k = Number(opt('--clusters', '0')) || 0;
  const memoSrc = SOURCES.find((s) => s.name === 'memo');
  if (memoSrc) loadEnvFile(path.join(path.dirname(memoSrc.root), 'Mascari4615.github.io', '.env.txt'));
  loadEnvFile(path.resolve(KARMOLAB, '../../.env.txt'));

  let docs = collect().concat(collectBookmarksAll());
  attachLinkBodies(docs);
  docs.sort((a, b) => a.id.localeCompare(b.id));
  if (limit) docs = docs.slice(0, limit);
  console.log(`[atlas] 글 ${docs.length}개 · 갈래 ${new Set(docs.map((d) => d.lane)).size}개`);

  /* ★ drift gate — 지난 판보다 30% 넘게 줄면 죽는다. 폴더 개편이 소스 정의를 비껴가면
     지도는 **조용히** 쪼그라든다(2026-08 개편 때 1,918편 → 34편이 될 뻔했다).
     일부러 줄인 거면 `--shrink-ok` 로 지나간다. `--limit` 는 맛보기라 재지 않는다. */
  if (!limit && !flag('--shrink-ok')) {
    let prevCount = 0;
    try { prevCount = JSON.parse(fs.readFileSync(OUT, 'utf8')).count || 0; } catch { /* 첫 굽기 */ }
    if (prevCount >= 100 && docs.length < prevCount * 0.7) {
      throw new Error(`글 ${prevCount} → ${docs.length}편 (${Math.round((1 - docs.length / prevCount) * 100)}% 감소)`
        + ' — 소스 정의가 낡았을 가능성이 크다. 의도한 축소면 --shrink-ok.');
    }
  }

  let mixStat = null;    // 갈래가 만나는 자리 요약 (iLISI)
  let twinStat = null;   // 겹치는 글(쌍둥이) 요약 — 문턱·곡선·잡힌 수
  let coarsePick = null; // 성긴 층을 어떻게 골랐나 (실루엣 곡선 + 판단) — 자가 다시 본다
  let denseOut = null;   // 밀도로 진짜 뭉친 자리 (HDBSCAN) + 어디에도 안 붙는 글
  let h0Out = null;      // H0 지속 막대 — 나누지 않고 본 「조각 몇 개」
  let intrusionOut = null;  // 낱말 침입자 — 이 말들이 읽히나 (Reading Tea Leaves)
  let externalOut = null;   // 바깥 잣대 — 사람이 붙인 분류와 맞나 (TopicGPT 가 쓰는 잣대)
  let proxOut = null;       // 써 보는 잣대 — 새 글이 여기 속하는지 알아맞힐 수 있나 (ProxAnn)
  let alignInfo = null;  // 지난 판에 포갠 결과 (얼마나 움직였나)
  let lonelyStat = null; // 어디에도 안 붙는 글 요약 (LOF)
  let okVecs = null;     // 벡터 붙은 글 — 묻힌 글 표시 뒤에 한 번 더 쓴다
  let groupOut = null;    // 거짓 무리·놓친 무리 — 저 덩어리 진짜 있나 (Jeon 2022)
  let hubOut = null;      // 허브 — 몇 편이 모두의 이웃 자리를 먹나 (Radovanović 2010)
  let warpOut = null;
let doiOut = null;
let wobbleOut = null;
let ladderOut = null;
let zooOut = null;
let idimOut = null;
let deltaOut = null;
let sugOut = null;
let revisitOut = null;
let serOut = null;     // 어긋남 요약 — 찢김·거짓 이웃 (CheckViz)
  let screenNear = null;  // 글마다 화면 이웃 스물넷 — 거짓 이웃을 나중에 재려고 쥐고 있는다
  let coords = null;      // 뜻자리 (UMAP)
  let axisCoords = null;  // 축 (PCA)
  let clusters = null;
  let levelsOut = null;

  /**
   * ★ **생일을 임베딩보다 먼저 채운다.**
   *
   * 전에는 임베딩·자 계산이 다 끝난 뒤에 git 에서 생일을 가져왔다. 그래서 그 앞에서 도는
   * 자들에겐 **블로그 글만 생일이 있었고**, 「이어야 할 둘」을 시간으로 자르려 했을 때
   * 링크의 달이 **0가지**로 나왔다. 생일 채우기는 임베딩과 아무 상관이 없으니 앞으로 옮긴다.
   */
  const born = mergedGitMap(birthdays);
  let withBorn = 0;
  for (const d of docs) {
    /* 글이 자기 생일을 아는 경우(블로그 앞머리)는 그걸 그대로 쓴다 — git 은 memo 것만 안다. */
    const t = born.get(d.id);
    if (!d.born) d.born = t ? new Date(t * 1000).toISOString().slice(0, 7) : null;
    if (d.born) withBorn += 1;
  }
  const months = [...new Set(docs.map((d) => d.born).filter(Boolean))].sort();
  console.log(`[atlas] 생일 아는 글 ${withBorn}/${docs.length} · 달 ${months.length}가지`);

  if (!flag('--no-embed')) {
    let vectors = await embedAll(docs);
    if (!flag('--no-center')) vectors = removeSharedBias(vectors);
    const ok = [];
    okVecs = ok;
    docs.forEach((d, i) => { if (vectors[i]) ok.push({ d, v: vectors[i] }); });
    console.log(`[atlas] 벡터 있는 글 ${ok.length} / ${docs.length}`);
    nearestByMeaning(ok, docs);
    twinStat = twinsOf(ok, docs);
    mixStat = mixPerDoc(docs);
    if (ok.length >= 3) {
      /* 자리를 두 벌 낸다 — 같은 데이터, 다른 질문.
         뜻자리(UMAP) = 비슷한 것끼리 얼마나 또렷하게 갈리나
         축(PCA)      = 전체를 가르는 가장 큰 두 방향은 무엇인가 */
      const t0 = Date.now();
      let um = normalize2(await umap2(ok.map((o) => o.v)));
      console.log(`[atlas] 뜻자리 잡는 데 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
      /* **씨앗 밴드** — 같은 손잡이로 씨앗만 바꿔 여러 판 굽고 「이 자리가 자료의 것인지
         난수의 것인지」를 잰다. 판 하나가 20여 초라 `--씨앗` 을 줄 때만 돈다. */
      /* **초기화 사다리** — 난수/PCA/스펙트럼 × 스케일 셋을 굽고 전역 상관으로 고른다. */
      if (flag('--초기화') || flag('--init')) {
        try {
          ladderOut = await initLadder(ok.map((o) => o.v), umapPick);
          console.log(`[atlas] 초기화 사다리 — 천장(선형 PCA-2D) r ${ladderOut.ceiling}`
            + ` · 지금(난수 init) r ${ladderOut.base}`);
          console.log('[atlas]   표 — ' + ladderOut.table.map((t) => `${t.name}:${t.r}`).join(' '));
          console.log(`[atlas]   본선 진출 ${ladderOut.top.join(', ')}`
            + ` · 사보타주(자리 섞기 ${ladderOut.sabotage.points} · 벡터 섞기 ${ladderOut.sabotage.vectors})`);
          if (ladderOut.winner) {
            const W = ladderOut.winner; const C = ladderOut.control;
            console.log(`[atlas]   본선 ${W.runs}판 — ${W.name}: r ${W.r} [${W.rLo}~${W.rHi}] · 떨림 ${W.wobble} · 이웃 유지 ${W.keep}`);
            console.log(`[atlas]           난수 init: r ${C.r} [${C.rLo}~${C.rHi}] · 떨림 ${C.wobble} · 이웃 유지 ${C.keep}`);
            console.log(`[atlas]   → **${ladderOut.used ? '바꾼다' : '안 바꾼다'}**`
              + ` (전역 상관이 ${(W.r - C.r).toFixed(4)} 올랐다 — 넘어야 할 폭 ${ladderOut.margin}`
              + ` · 천장 ${ladderOut.ceiling} 의 ${(W.r / ladderOut.ceiling * 100).toFixed(0)}%)`);
          }
          console.log(`[atlas]   ${(ladderOut.ms / 1000).toFixed(0)}초`);
        } catch (e) {
          console.warn(`[atlas] 초기화 사다리를 못 돌렸다: ${e.message}`);
        }
      }
      if (flag('--씨앗') || flag('--seeds')) {
        try {
          wobbleOut = await seedWobble(ok.map((o) => o.v), umapPick);
          console.log(`[atlas] 씨앗 떨림 ${wobbleOut.m}판 — 떨림 반경 중앙값 **${wobbleOut.med}**`
            + ` (90분위 ${wobbleOut.p90}) · **구조 없는 벡터면 ${wobbleOut.nullMed}**`
            + ` → 비 ${wobbleOut.ratio} · 판 둘만 견주면 ${wobbleOut.single}`);
          console.log(`[atlas]   ★ **화면 이웃이 판마다 그대로인 비율 ${wobbleOut.keep}**`
            + ` (10분위 ${wobbleOut.keepP10} · 구조 없는 벡터면 ${wobbleOut.nullKeep})`
            + ` — 이게 높은데 떨림이 크면 「이웃은 자료의 것, 큰 배치는 씨앗의 것」이다`);
          console.log(`[atlas]   판을 늘리면 ${wobbleOut.at.map((c) => `${c.m}판:${c.gap}`).join(' ')}`
            + ` · 반씩 갈라 낸 가운데 자리끼리 ${wobbleOut.splitGap}`
            + ` · ${(wobbleOut.ms / 1000).toFixed(0)}초`);
        } catch (e) {
          console.warn(`[atlas] 씨앗 떨림을 못 쟀다: ${e.message}`);
        }
      }
      /* **잣대 중복** — 우리가 적는 수들이 서로 같은 말을 하나. 판 40개라 `--잣대` 를 줄 때만. */
      if (flag('--잣대') || flag('--metrics')) {
        try {
          zooOut = await metricZoo(ok.map((o) => o.v), ok.map((o) => o.d), umapPick);
          const L = (k) => zooOut.label[k] || k;
          console.log(`[atlas] 잣대 중복 — 판 ${zooOut.runs}개(글 ${zooOut.n}편) 위에서 잣대 ${zooOut.names.length}개`);
          console.log(`[atlas]   심은 대조군 — 쌍둥이 ρ ${zooOut.twin.rho} (같은 무리 ${zooOut.twin.same ? '○' : '✗'})`
            + ` · 무작위 수 최대 |ρ| ${zooOut.noiseCtl.max} (${L(zooOut.noiseCtl.with)}, 한계 ${zooOut.noiseCtl.limit})`
            + ` → ${zooOut.sane ? '셈이 선다' : '**셈이 틀렸다 — 아래 수는 무효**'}`);
          console.log('[atlas]   무리 — ' + zooOut.clusters.map((c) => `[${c.members.map(L).join(' · ')}]`).join(' '));
          console.log(`[atlas]   ★ **우리 잣대 ${zooOut.real}개는 사실 ${zooOut.eff}개다**`
            + ` · 같은 말 하는 쌍 ${zooOut.dup.length}개`
            + (zooOut.dup.length ? ` (첫째 ${L(zooOut.dup[0].a)}↔${L(zooOut.dup[0].b)} ρ ${zooOut.dup[0].rho})` : '')
            + ` · ${(zooOut.ms / 1000).toFixed(0)}초`);
        } catch (e) {
          console.warn(`[atlas] 잣대 중복을 못 쟀다: ${e.message}`);
        }
      }
      /* 지난번 그림에 포개 놓는다 — 안 그러면 글 몇 개만 늘어도 지도가 통째로 딴 그림이 된다. */
      const prev = flag('--no-align') ? new Map() : previousPlaces(OUT);
      if (prev.size) {
        const al = procrustes(um, ok.map((o) => o.d.id), prev);
        if (al.moved == null) {
          console.warn(`[atlas] 지난 지도와 겹치는 글이 ${al.shared}개뿐 — 맞추지 않고 새로 그린다`);
        } else {
          um = finishAligned(al.pts);
          /* 얼마나 움직였는지 **싣는다** — 판마다 기어가는 걸 자가 볼 수 있게.
             글이 안 바뀌었으면 0 이어야 한다(테두리 접기를 없앤 뒤로 실제로 0 이다). */
          /* **글이 얼마나 새로 들어왔는지도 같이 싣는다.** 어긋남만 보면 「새 글이 들어와서
             자리가 옮겨 앉은 것」과 「같은 글인데 통째로 딴 그림이 된 것」을 못 가른다 —
             실측: 글 5편이 들어오니 어긋남이 0.33 이었고(자리는 정상적으로 재배치),
             같은 글로 다시 구우면 0.000 이다. 자가 이 둘을 갈라 보게 한다. */
          /* **자리잡기 손잡이가 바뀌면 자리는 통째로 다시 잡힌다** — 포개기로도 못 되돌린다.
             그건 「조용히 기어간 것」이 아니라 「우리가 바꾼 것」이다. 자가 둘을 갈라 보게
             그 사실도 같이 싣는다(실측: 30·0.3 → 10·0.3 으로 바꾸니 어긋남 0.2535). */
          const knobs = umapPick ? `${umapPick.nn}/${umapPick.md}` : null;
          const before = prevUmap ? `${prevUmap.nn}/${prevUmap.md}` : null;
          alignInfo = {
            shared: al.shared,
            drift: Number(al.moved.toFixed(4)),
            fresh: ok.length - al.shared,      // 지난 판에 없던 글
            gone: Math.max(0, prev.size - al.shared),
            knobs, before,
            knobsChanged: !!(before && knobs && before !== knobs),
          };
          console.log(`[atlas] 지난 지도에 맞췄다 — 겹치는 글 ${al.shared}개 · 평균 어긋남 ${al.moved.toFixed(3)}`);
        }
      } else {
        console.log('[atlas] 지난 지도가 없다 — 이번 그림이 기준이 된다');
      }
      const pc = normalize2(pca2(ok.map((o) => o.v)));
      coords = new Map(ok.map((o, i) => [o.d.id, um[i]]));
      /* 자리가 정해졌으니 이제 「여기서 얼마나 정직한가」를 매길 수 있다. */
      /* 어긋남 **두 쪽 다** 잰다 — 찢김(닮은 글이 흩어짐)과 거짓 이웃(옆에 있어도 남남). */
      screenNear = honestyPerDoc(docs, coords);
      axisCoords = new Map(ok.map((o, i) => [o.d.id, pc[i]]));

      const vecs = ok.map((o) => o.v);
      /* 자리와 거리행렬이 다 있으니 **어긋남의 나머지 반쪽**을 잰다. */
      /* 거리행렬은 1520편 = 230만 쌍 · 9MB. 층 셋이 같은 것을 쓰므로 **한 번만** 만든다
         (한 판에 1초, 세 번 만들면 3초를 그냥 버린다). */
      let distCache = null;
      const distOnce = () => (distCache || (distCache = distMatrix(vecs)));
      /* **어긋남의 나머지 반쪽** — 화면 이웃 중 진짜 순위가 밖인 것(거짓 이웃). 거리행렬이 필요하다. */
      {
        const idxOf = new Map(docs.map((d, i) => [d.id, i]));
        const okAt = new Map();
        ok.forEach((o, i) => { const q = idxOf.get(o.d.id); if (q != null) okAt.set(q, i); });
        warpOut = falseNeighbours(docs, screenNear, distOnce(), ok.length, okAt);
        /* **이어야 할 둘** — 뜻으로 가까운데 사람 링크가 없는 쌍. 시간으로 잘라 평가한다. */
        try {
          sugOut = linkSuggest(ok, distOnce(), ok.length, findEdges(docs), okAt);
          if (sugOut.skipped) {
            console.log(`[atlas]   이어야 할 둘 — ${sugOut.skipped}`);
          } else if (sugOut.tooFew) {
            const F = sugOut.tooFew;
            console.log(`[atlas]   이어야 할 둘 — **자료 미달로 못 잰다** (숨길 링크 ${F.test}개 · 근거 링크 ${F.known}개 · 문턱 ${F.need} 초과)`);
          } else {
            console.log(`[atlas]   이어야 할 둘 — 사람 링크 ${sugOut.pairs}개 중 최근 ${sugOut.cutMonths.join(',')} 의`
              + ` ${sugOut.test}개를 숨기고 나머지 ${sugOut.known}개만 보고 후보를 냈다`
              + ` — **한 글당 후보 ${sugOut.pool}개 · 통틀어 ${(sugOut.pairsAll / 1000).toFixed(0)}천 쌍**`
              + ` (순위는 위 ${sugOut.max}등까지만 본다)`);
            console.log(`[atlas]     숨긴 링크가 몇 등이었나 — `
              + sugOut.real.p.map((x) => `상위 ${x.k}: ${(x.rate * 100).toFixed(1)}%`).join(' · ')
              + ` · MAP ${sugOut.real.map}`);
            console.log(`[atlas]     아무 순서면 — `
              + sugOut.rand.p.map((x) => `상위 ${x.k}: ${(x.rate * 100).toFixed(1)}%`).join(' · ')
              + ` · MAP ${sugOut.rand.map}`
              + ` → **${sugOut.useful ? '내놓을 만하다' : '내놓을 만하지 않다'}** · ${(sugOut.ms / 1000).toFixed(0)}초`);
            const C = sugOut.calib;
            console.log(`[atlas]     보정 — 등수 칸별 확률 ${C.rate.map((v) => (v * 100).toFixed(1)).join('/')}%`
              + ` (바탕 ${(C.baseRate * 100).toFixed(2)}%)`
              + ` · ECE ${C.ours.ece} vs 늘 같은 확률 ${C.flat.ece}`
              + ` · Brier ${C.ours.brier} vs ${C.flat.brier}`
              + ` → **${C.better ? '확률을 적을 만하다' : '확률은 안 적는다'}**`);
          }
        } catch (e) {
          console.warn(`[atlas]   이어야 할 둘을 못 쟀다: ${e.message}`);
        }
        /* **고유차원** — 이 무더기가 애초에 2차원에 담길 수 있나. 거리행렬이 이미 있다. */
        try {
          idimOut = intrinsicDim(vecs, distOnce(), ok.length);
          console.log(`[atlas]   고유차원 — 우리 자료 **${idimOut.id}차원**`
            + ` (TwoNN ${idimOut.ours.twoNN} · MLE ${idimOut.ours.mle.map((m) => `k${m.k}:${m.id}`).join(' ')}`
            + ` · 역수평균 안 하면 ${idimOut.ours.naive}) · 담긴 축 ${idimOut.ambient}개`);
          console.log(`[atlas]     대조군 — 축마다 따로 섞으면 ${idimOut.shuffled.twoNN}/`
            + `${idimOut.shuffled.mle.find((m) => m.k === 10)?.id}`
            + ` · 구조 없는 난수면 ${idimOut.noise.twoNN}/${idimOut.noise.mle.find((m) => m.k === 10)?.id}`
            + ` (TwoNN/MLE k10)`);
          console.log('[atlas]     눈금 — ' + idimOut.calibration.map((c) => `${c.truth}차원→${c.twoNN}/${c.mle}`).join(' ')
            + ` · ${(idimOut.ms / 1000).toFixed(0)}초`);
        } catch (e) {
          console.warn(`[atlas]   고유차원을 못 쟀다: ${e.message}`);
        }
        /* **δ-쌍곡성** — 굽은 2차원이 도움이 될 자료인가. 쓰기 전에 재는 자. */
        try {
          deltaOut = deltaOf(vecs, distOnce(), ok.length);
          console.log(`[atlas]   나무 같은 정도 — δ_rel 평균 **${deltaOut.ours.relMean}**`
            + ` (최대 ${deltaOut.ours.relMax} · 축을 섞으면 ${deltaOut.shuffled.relMean})`);
          console.log('[atlas]     눈금 — ' + deltaOut.calibration.map((c) => `${c.shape} ${c.relMean}`).join(' · ')
            + ` → 우리는 나무와 난수 사이 **${(deltaOut.where * 100).toFixed(0)}%** 자리`
            + ` = **${deltaOut.treeLike ? '굽은 2차원이 도움이 될 자료다' : '굽은 2차원으로 옮겨도 소용없다'}**`
            + ` · ${(deltaOut.ms / 1000).toFixed(0)}초`);
        } catch (e) {
          console.warn(`[atlas]   나무 같은 정도를 못 쟀다: ${e.message}`);
        }
        /* **자리 정렬** — 산점도가 진 그릇이라면 행렬은 어떤가. 그리기 전에 잰다. */
        try {
          const co = ok.map((o) => coords.get(o.d.id) || [0, 0]);
          serOut = seriationOf(vecs, distOnce(), ok.length, co);
          console.log(`[atlas]   자리 정렬 (${serOut.n}편으로 잼 / ${serOut.of}편 중) — `
            + serOut.ours.map((r) => `${r.way}: 2-sum ${r.twoSum}·너덜 ${r.profile}·AR ${r.ar}`).join(' | '));
          console.log(`[atlas]     정렬로 얻는 것 **${(serOut.gain * 100).toFixed(0)}%**`
            + ` (우연 수준 AR 0.5 에서 얼마나 멀어졌나 · 섞은 자료 ${(serOut.shufGain * 100).toFixed(0)}%`
            + ` · 한 줄로 세울 수 있는 지어낸 자료 ${(serOut.calGain * 100).toFixed(0)}%`
            + ` · 참고로 2-sum 으로 재면 ${(serOut.twoSumGain * 100).toFixed(0)}%)`
            + ` → **${serOut.worth ? '행렬로 그릴 값이 있다' : '행렬로 그려도 볼 게 없다'}** (최고 「${serOut.best}」)`
            + ` · ${(serOut.ms / 1000).toFixed(0)}초`);
        } catch (e) {
          console.warn(`[atlas]   자리 정렬을 못 쟀다: ${e.message}`);
        }
        /* **관심도(DOI)** — 전부 그리고 흐리게 대신, 예산 안에서 연결된 것만 남기면
           초점에서 **2홉 이상** 떨어진 「사람이 손으로 쓴 링크」를 얼마나 건지나. */
        try {
          doiOut = doiEval(docs, ok, distOnce(), ok.length, findEdges(docs), okAt);
          if (doiOut.tooFew) {
            const F = doiOut.tooFew;
            console.log(`[atlas]   관심도 — **자료 미달로 못 잰다** (초점 ${F.focuses}개 → 고르기 ${F.pick}/${F.needPick} · 판정 ${F.test}/${F.needTest})`);
          } else {
            console.log(`[atlas]   관심도 — α ${doiOut.alpha} (앞 ${doiOut.pick}개로 고르고 뒤 ${doiOut.test}개로 잼)`
              + ` · 2홉 밖 정답 ${doiOut.want}개 중 **되찾음 ${(doiOut.recall * 100).toFixed(1)}%**`
              + ` [확산 없이 ${(doiOut.zero * 100).toFixed(1)}% · 가까운 60개 ${(doiOut.cosine * 100).toFixed(1)}%`
              + ` · 링크를 마구 다시 이으면 ${(doiOut.rand * 100).toFixed(1)}%]`);
            console.log(`[atlas]     → **${doiOut.used ? '쓴다' : '안 쓴다'}** — ${doiOut.why}`);
            console.log(`[atlas]     스윕 ${doiOut.sweep.map((r) => `${r.alpha}:${(r.recall * 100).toFixed(0)}`).join(' ')}`
              + ` — 안쪽 최대 ${doiOut.inner ? '있다' : '**없다**'} · 놓친 것 ${doiOut.missed}개`
              + ` · 홉 벌점 ${doiOut.hopCost}(격자 ${doiOut.grid}칸) · 숨은 이웃 수 오차 ${doiOut.hiddenErr} · 확장 top-3 적중 ${doiOut.top3} (아무 방향 ${doiOut.top3Rand})`
              + ` · ${doiOut.ms}ms`);
          }
        } catch (e) {
          console.warn(`[atlas]   관심도를 못 쟀다: ${e.message}`);
        }
        /* **허브를 잰다** — 몇 편이 모두의 이웃 자리를 먹나. 고칠지는 수를 보고 정한다. */
        {
          const D0 = distOnce(); const N0 = ok.length;
          const rows = [];
          const { mu, sd } = rowStats(D0, N0);
          for (const kk of [8, 24]) {
            const raw = hubness(D0, N0, kk);
            const fixed = hubness(D0, N0, kk, nicdmScale(D0, N0, kk));
            /* **상호 근접도(정규분포판)** — 값이 클수록 가까우므로 1에서 뺀다. */
            const mp = hubnessBy(N0, kk, (i, j) => {
              const d = D0[i * N0 + j];
              return 1 - (1 - normCdf((d - mu[i]) / sd[i])) * (1 - normCdf((d - mu[j]) / sd[j]));
            });
            /* **공유 이웃** — 이웃 목록이 겹치는 만큼 가깝다. */
            const nbSets = [];
            for (let i = 0; i < N0; i += 1) {
              const idx = Array.from({ length: N0 }, (_, j) => j).filter((j) => j !== i);
              idx.sort((a, b) => D0[i * N0 + a] - D0[i * N0 + b]);
              nbSets.push(new Set(idx.slice(0, kk)));
            }
            const snn = hubnessBy(N0, kk, (i, j) => {
              let hit = 0;
              for (const q of nbSets[j]) if (nbSets[i].has(q)) hit += 1;
              return 1 - hit / kk;
            });
            rows.push({ k: kk, raw, fixed, mp, snn });
            console.log(`[atlas] 허브 k=${kk} — 비뚤어짐 ${raw.skew} · 가장 인기 있는 글이 ${raw.max}번`
              + ` · 위 1%가 이웃 자리의 ${(raw.top1 * 100).toFixed(0)}% · 한 번도 안 불린 글 ${raw.orphans}편`
              + ` | 거리를 다시 재면(NICDM) 비뚤어짐 ${fixed.skew} · 위 1% ${(fixed.top1 * 100).toFixed(0)}%`
              + ` · 안 불린 글 ${fixed.orphans}편`);
            console.log(`[atlas]   처방 견주기 k=${kk} — 국소 배율 ${fixed.skew}(안 불린 글 ${fixed.orphans})`
              + ` · 상호 근접도 ${mp.skew}(${mp.orphans})`
              + ` · 공유 이웃 ${snn.skew}(${snn.orphans})`
              + ` | 그냥 ${raw.skew}(${raw.orphans})`);
          }
          /* **어느 처방이 제일인지 표에서 고른다** — 쏠림이 가장 작은 것, 같으면 안 불린 글이 적은 것.
             (판단을 표시로만 남기지 않는다 — 표를 같이 실어 자가 다시 세운다.) */
          const score = (r) => [r.skew, r.orphans];
          const bestOf = (row) => {
            const cand = [['국소 배율', row.fixed], ['상호 근접도', row.mp], ['공유 이웃', row.snn]];
            return cand.reduce((a, b) => {
              const [as, ao] = score(a[1]); const [bs, bo] = score(b[1]);
              return (bs < as || (bs === as && bo < ao)) ? b : a;
            })[0];
          };
          for (const r of rows) r.best = bestOf(r);
          hubOut = { rows, best: rows[0] ? rows[0].best : null };
          /* **저 덩어리 진짜 있나** — 화면에서 뽑아 원래에서 재고(꿋꿋함), 반대로도(뭉침).
             표본으로 잰다(모두 재면 √n 이웃 그래프를 두 번 만들어야 해서 비싸다). */
          {
            const step = Math.max(1, Math.floor(N0 / 500));
            const pick = [];
            for (let i = 0; i < N0 && pick.length < 500; i += step) pick.push(i);
            const vSub = pick.map((i) => vecs[i]);
            const pSub = pick.map((i) => um[i]);
            const real = groupTrust(vSub, pSub);
            /* **찍기 대조군** — 자리만 마구 섞은 지도. 이것 없이는 위 수가 아무 뜻이 없다. */
            let sd2 = 771;
            const rr = () => (sd2 = (sd2 * 1103515245 + 12345) % 2147483648) / 2147483648;
            const shuf = pSub.slice();
            for (let i = shuf.length - 1; i > 0; i -= 1) { const j = Math.floor(rr() * (i + 1)); const t = shuf[i]; shuf[i] = shuf[j]; shuf[j] = t; }
            const rand = groupTrust(vSub, shuf);
            groupOut = real ? { ...real, n: pick.length, randSteady: rand ? rand.steady : null, randCohesive: rand ? rand.cohesive : null } : null;
            if (groupOut) {
              console.log(`[atlas] 덩어리가 진짜인가 — **꿋꿋함 ${groupOut.steady}**(화면에서 뭉친 게 원래도 뭉치나)`
                + ` · **뭉침 ${groupOut.cohesive}**(원래 뭉친 게 화면에서도 붙나)`
                + ` | 자리를 마구 섞으면 ${groupOut.randSteady} · ${groupOut.randCohesive}`
                + ` (표본 ${groupOut.n}편 · 이웃 ${groupOut.k} · ${groupOut.iters}판)`);
            }
          }
          console.log(`[atlas]   → 가장 나은 처방 「${hubOut.best}」 (k=8 기준) · k=24 도 「${rows[1] ? rows[1].best : '?'}」`);
        }
      }
      /* 층을 셋으로 굽는다 — 멀리서 성기게, 당기면 촘촘하게.
         촘촘한 층을 먼저 나누고 그 중심을 합쳐 위층을 만든다 = 나무가 된다. */
      const FINE = k > 0 ? Math.min(k, Math.floor(ok.length / 3) || 1) : 30;
      const fine = kmeans(vecs, FINE);
      const sizes = new Array(FINE).fill(0);
      fine.assign.forEach((c) => { sizes[c] += 1; });
      /* **성긴 층은 재서 고르되, 곡선이 평평하면 손대지 않는다.** 곡선을 통째로 실어
         보낸다 — 「어떻게 골랐는지」를 자가 다시 볼 수 있어야 고른 게 된다. */
      const coarse = k > 0 ? null : pickCoarse(vecs, fine, sizes);
      if (coarse) {
        coarsePick = coarse;
        console.log(`[atlas] 성긴 층 ${coarse.k}개 — 실루엣 `
          + coarse.curve.map((c) => `${c.k}:${c.sil.toFixed(3)}(${c.a.toFixed(3)}·${c.b.toFixed(3)})`).join(' ')
          + (coarse.clear ? ' (봉우리가 뚜렷해 그걸 골랐다)' : ' (봉우리가 안 뚜렷해 손 안 댔다)'));
      }
      const LEVELS = k > 0 ? [FINE] : [coarse.k, 14, FINE];
      console.log(`[atlas] 층 ${LEVELS.join(' → ')} (촘촘한 ${FINE} 을 나눈 뒤 합쳐 올린다)`);

      const levels = [];
      for (const target of LEVELS) {
        const map = target === FINE
          ? new Map(Array.from({ length: FINE }, (_, i) => [i, i]))
          : mergeCenters(fine.centers, sizes, target);
        const assign = fine.assign.map((c) => map.get(c) ?? 0);
        const kk = Math.max(...assign) + 1;
        const groups = Array.from({ length: kk }, () => []);
        assign.forEach((c, i) => groups[c].push(ok[i].d));   // 제목만 X — 몸통까지 넘긴다
        let names = await nameClusters(groups);
        console.log(`[atlas] 층 ${kk}개:`);
        names.forEach((nm, i) => console.log(`[atlas]     ${nm} (${groups[i].length}개)`));
        /* 이름이 겹치거나 비면 지도를 봐도 어디가 어딘지 모른다. 조용히 나빠지지
           않게 굽는 자리에서 잡는다 — 화면에서 발견하면 이미 늦다. */
        const named = names.filter((_, i) => groups[i].length);
        const dup = named.filter((v, i) => named.indexOf(v) !== i);
        if (dup.length) console.warn(`[atlas] 층 ${kk} 이름 겹침 ${dup.length}개: ${[...new Set(dup)].join(', ')}`);
        /* 견주기용 — 이 덩어리가 즐겨 쓰는 말 열 개. 보는 쪽이 두 목록의 차집합을 내면
           「각자만 쓰는 말」이 나온다. */
        const words = topWordsByGroup(groups);
        /* **두드러진 말 중에서 그 무리와 가장 잘 어울리는 것**으로 다시 고른다. */
        names = refineNames(groups, names, words);
        /* **이름을 임베딩으로도 골라 본다(MMR)** — 적합도가 오를 때만 바꾼다. */
        let nameWay = 'c-TF-IDF + 적합도';
        let nameMmr = null;   // 임베딩+MMR 를 재 본 표 — **판단을 자가 다시 세울 수 있게** 싣는다
        if (!flag('--api')) {
          try {
            const dimN = vecs[0].length;
            const centers = new Map();
            const idxByC = new Map();
            assign.forEach((c, i) => { if (!idxByC.has(c)) idxByC.set(c, []); idxByC.get(c).push(i); });
            for (const [c, list] of idxByC) {
              const acc = new Array(dimN).fill(0);
              for (const i of list) for (let t = 0; t < dimN; t += 1) acc[t] += vecs[i][t];
              let n2 = 0;
              for (let t = 0; t < dimN; t += 1) { acc[t] /= list.length; n2 += acc[t] * acc[t]; }
              n2 = Math.sqrt(n2) || 1;
              centers.set(c, acc.map((v) => v / n2));
            }
            const picks = await mmrNames(groups, names, words, (i) => centers.get(i) || null, embedLocal);
            if (picks) {
              const base = nameFit(groups, names, words);
              const rows = [];
              for (const [lam, cand] of Object.entries(picks)) {
                const dup = cand.filter((v, i) => cand.indexOf(v) !== i).length;
                const f = nameFit(groups, cand, words);
                rows.push({ lam: Number(lam), mean: f.mean, better: f.better, judged: f.judged, dup });
              }
              const okRows = rows.filter((r) => r.dup === 0 && r.mean != null && base.mean != null
                && r.mean > base.mean && r.better >= base.better);
              const win = okRows.sort((a, b) => b.mean - a.mean)[0] || null;
              console.log(`[atlas]   이름 MMR — 지금 ${base.mean}(제 무리 ${base.better}/${base.judged}) | `
                + rows.map((r) => `λ${r.lam}: ${r.mean}(${r.better}/${r.judged}${r.dup ? `·겹침 ${r.dup}` : ''})`).join(' '));
              nameMmr = { base: { mean: base.mean, better: base.better, judged: base.judged }, rows, picked: null };
              if (win) {
                names = picks[String(win.lam)];
                nameWay = `임베딩+MMR λ${win.lam}`;
                nameMmr.picked = win.lam;
                console.log(`[atlas]   → **바꾼다** (λ ${win.lam} · 적합도 ${base.mean} → ${win.mean})`);
              } else {
                console.log('[atlas]   → **안 바꾼다** — 어느 λ 도 적합도를 못 올렸다(또는 이름이 겹친다)');
              }
            }
          } catch (e) {
            console.warn(`[atlas]   이름 MMR 을 못 돌렸다: ${e.message}`);
          }
        }
        /* 이 층이 **정말 무리인가**를 같이 싣는다 — 낮으면 화면이 「덩어리」라 안 부른다.
           **성질이 다른 자 둘**로 잰다: 실루엣(거리) · DBCV(밀도). 하나로만 재면
           「이 자로는 못 잰다」와 「무리가 없다」를 못 가른다. */
        const sil = silhouette(vecs, assign);
        /* 자가 **같은 글로** 다시 잴 수 있게 뽑은 글 id 를 싣는다. */
        const silOn = (silPicked || []).map((i) => ok[i]?.d.id).filter(Boolean);
        const dv = dbcv(vecs, assign, distOnce());
        /* **이름이 제 무리 것인가** — 제 무리 글로 잰 값 vs 남의 무리 글로 잰 값. */
        const fit = nameFit(groups, names, words);
        if (fit.judged) {
          console.log(`[atlas]   (이름 적합도 평균 ${fit.mean} · 제 무리에서 더 높은 이름 ${fit.better}/${fit.judged})`);
          for (const f of fit.names) {
            if (f && f.own != null && f.other != null && f.own <= f.other) {
              console.log(`[atlas]     ⚠ 「${f.name}」 은 남의 무리에서 더 잘 맞는다 (${f.own} ≤ ${f.other})`);
            }
          }
        }
        console.log(`[atlas]   (층 ${kk} 실루엣 ${sil.toFixed(3)} · DBCV ${dv.toFixed(3)}`
          + `${sil < SIL_REAL && dv < DBCV_REAL ? ' — 자 둘 다 무리라기보다 구획이라 한다'
            : sil < SIL_REAL || dv < DBCV_REAL ? ' — **자 둘이 엇갈린다**' : ''})`);
        /* **왜 안 갈리는지** — 한 수 말고 요인 이름으로. 화면 좌표에서 잰다(「보이느냐」가 물음). */
        const why = coords ? whyNotSeparated(assign, ok.map((o) => coords.get(o.d.id) || [0, 0]), names) : null;
        if (why) {
          console.log(`[atlas]   층 ${kk} 안 갈리는 까닭 = **${why.why}**`
            + ` (가장 안 갈리는 짝 「${why.worst.a}」↔「${why.worst.b}」 표준화 거리 ${why.worst.std}`
            + ` · 늘어짐 중앙값 ${why.elongMed} · 이상치 중앙값 ${(why.outlierMed * 100).toFixed(1)}%)`);
        }
        /* **p 값** — 지금까지 「구획이지 무리가 아니다」의 근거는 전부 문턱을 손으로 고른
           자이거나 섞은 대조군이었다. 덩어리 짝마다 중심을 잇는 선에 투영해 dip 검정을 건다. */
        const dip = dipPairs(vecs, assign, names);
        if (dip.pairs) {
          console.log(`[atlas]   층 ${kk} dip 검정 — 짝 ${dip.pairs}개 중 **갈린다고 나온 짝 ${dip.split}개**`
            + ` (p≤${dip.alpha} · 되뽑기 ${dip.runs}판 · p 바닥 ${dip.floor} · 가장 작은 p ${dip.minP})`);
          console.log(`[atlas]     대조군 — **아무 방향**에 투영하면 ${dip.randSplit}개`
            + ` · **거짓 쪼개기**(한 덩어리를 억지로 둘로) ${dip.fakeSplit}/${dip.fakes.length}개가 갈린다고 나온다`
            + ` · dip 중앙값 ${dip.medDip} vs 아무 방향 ${dip.medRandDip}`);
          for (const r of dip.rows.slice(0, 3)) {
            console.log(`[atlas]     「${r.a}」↔「${r.b}」 dip ${r.dip} · p ${r.p}`
              + ` (아무 방향 dip ${r.randDip} · p ${r.randP}) (${r.na}+${r.nb}개 중 ${r.used}개로)`);
          }
        }
        levels.push({ k: kk, names, words, sil, silOn, dbcv: dv, fit, nameWay, nameMmr, why, dip, of: new Map(ok.map((o, i) => [o.d.id, assign[i]])) });
      }
      /* **진짜로 뭉친 자리** — 「어디에도 안 붙는다」는 답이 있는 나눔(HDBSCAN).
         층은 그대로 둔다. 자 둘이 「구획이지 무리가 아니다」라 했으니, 그 위에
         **정말 뭉쳐 있는 몇 군데만** 따로 얹는다. */
      /* **써 보는 잣대** — 대표 글 다섯으로 갈래를 잡고 **남겨 둔 글**에 적용해 본다. */
      proxOut = { rows: [] };
      for (const L of levels) {
        const assign = ok.map((o) => L.of.get(o.d.id) ?? null);
        const r = proxUse(assign, vecs);
        if (!r) continue;
        /* 대조군 — 무리 배정을 마구 섞으면 찍기(0.5)로 떨어져야 한다. */
        let seed = 4242;
        const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
        const shuffled = assign.slice();
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rnd() * (i + 1));
          const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
        }
        const rand = proxUse(shuffled, vecs);
        proxOut.rows.push({ k: L.k, ...r, randAuc: rand ? rand.auc : null, randTau: rand ? rand.tau : null });
      }
      for (const r of proxOut.rows) {
        console.log(`[atlas] 써 보는 잣대 — 층 ${r.k}: 대표 ${r.reps}편으로 갈래를 잡고 남겨 둔 글에 대면`
          + ` **가려낸 정도(AUC) ${r.auc}** (찍기 0.5 · 배정을 섞으면 ${r.randAuc})`
          + ` · 차례 맞음 τ ${r.tau} · 가장 나쁜 무리 ${r.worst} · 무리 ${r.groups}개`);
      }
      /* **바깥 잣대** — 사람이 붙인 분류(갈래·블로그 categories)와 우리 나눔이 얼마나 맞나.
         층마다 잰다. 낮게 나오면 낮은 대로 싣는다 — 그게 답이다. */
      externalOut = { rows: [] };
      for (const L of levels) {
        const assign = ok.map((o) => L.of.get(o.d.id) ?? null);
        for (const [of2, pick] of [['갈래', (d) => d.lane], ['블로그 분류', (d) => d.tag || null]]) {
          const labels = ok.map((o) => pick(o.d));
          const fit = externalFit(assign, labels);
          if (!fit) continue;
          const rand = externalRandom(assign, labels);
          externalOut.rows.push({ k: L.k, of: of2, ...fit,
            randHarmonic: rand ? rand.harmonic : null,
            randAri: rand ? rand.ari : null,
            randNmi: rand ? rand.nmi : null });
        }
      }
      for (const r of externalOut.rows) {
        console.log(`[atlas] 바깥 잣대 — 층 ${r.k} vs ${r.of}(${r.classes}가지·글 ${r.n}편): `
          + `조화 순도 ${r.harmonic} · ARI ${r.ari} · NMI ${r.nmi}`
          + ` (라벨을 섞으면 ${r.randHarmonic} · ${r.randAri} · ${r.randNmi})`);
      }
      /* **낱말 침입자** — 「나눔이 좋은가」가 아니라 「이 말들이 읽히나」를 묻는다.
         가장 촘촘한 층에서 한 번만 (시험 판이 넉넉해야 수가 흔들리지 않는다). */
      if (!flag('--api')) {
        const fine = levels.reduce((a, b) => (b.k > a.k ? b : a), levels[0]);
        try {
          intrusionOut = await wordIntrusion(fine, ok, vecs, embedLocal);
          if (intrusionOut) {
            console.log(`[atlas] 낱말 침입자 — 맞춘 비율 ${intrusionOut.mp} (찍기 ${intrusionOut.chance}`
              + ` · 아무 무리에 대고 물으면 ${intrusionOut.randMp}`
              + ` · 빈도만으로 풀면 드문 쪽 ${intrusionOut.dfMp}·흔한 쪽 ${intrusionOut.dfHiMp})`
              + ` · ${intrusionOut.trials}판`);
            for (const m of intrusionOut.misses) console.log(`[atlas]     놓친 것 — ${m}`);
          }
        } catch (e) {
          console.warn(`[atlas] 낱말 침입자를 못 쟀다: ${e.message}`);
        }
      } else {
        console.log('[atlas] 낱말 침입자 — 바깥 모델로 구울 땐 건너뛴다 (낱말도 같은 모델로 재야 한다)');
      }
      /* **H0 지속**은 나눔과 무관하다 — 한 번만 잰다. */
      h0Out = h0Bars(vecs, distOnce());
      const pockets = densePockets(vecs, distOnce());
      if (pockets) {
        const pg = Array.from({ length: pockets.k }, () => []);
        pockets.label.forEach((c, i) => { if (c >= 0) pg[c].push(ok[i].d); });
        const pnames = nameAllByWords(pg);
        const noise = pockets.label.filter((x) => x < 0).length;
        console.log(`[atlas] 밀도로 뭉친 자리 ${pockets.k}군데 (손잡이 ${pockets.params.minSamples}·${pockets.params.minSize}`
          + ` — 곡선 봉우리 DBCV ${pockets.dbcv}) · 어디에도 안 붙는 글 ${noise}편`
          + ` (${Math.round((noise / pockets.label.length) * 100)}%)`);
        pg.forEach((g, i) => console.log(`[atlas]     ${pnames[i]} (${g.length}편)`));
        denseOut = {
          k: pockets.k,
          params: pockets.params,
          dbcv: pockets.dbcv,
          curve: pockets.curve,
          noise,
          names: pnames,
          of: new Map(ok.map((o, i) => [o.d.id, pockets.label[i]])),
          prob: new Map(ok.map((o, i) => [o.d.id, Number(pockets.prob[i].toFixed(3))])),
        };
      }
      clusters = levels[levels.length - 1];   // 가장 촘촘한 층 = 점 색깔의 기준
      levelsOut = levels;
    }
  }

  /* 선은 화면에 그릴 글 목록(docs)의 **자리 번호**로 적는다 — 이름을 다시 찾을 필요가 없다. */
  /* **공개 위험** — 제목을 가려도 이웃이 갈래를 말해 주나. 이웃 목록이 다 채워진 뒤에 잰다. */
  const edges = findEdges(docs);
  console.log(`[atlas] 서로 부르는 짝 ${edges.length}개`);
  const buriedCount = markBuried(docs, edges);
  /* **묻힌 글 표시가 끝난 뒤에** 잰다 — 그래야 「시간 기준과 얼마나 겹치나」를 셀 수 있다. */
  if (okVecs) lonelyStat = lonelyPerDoc(okVecs, docs);
  const skeleton = coords ? buildSkeleton(docs, coords) : null;
  const holes = levelsOut && levelsOut.length
    ? findHoles(docs, edges, levelsOut[levelsOut.length - 1])
    : [];
  if (holes.length) {
    console.log(`[atlas] 아직 안 만난 조합 ${holes.length}개 (가장 큰 것부터)`);
    for (const h of holes.slice(0, 5)) console.log(`[atlas]   ${h.a} ✕ ${h.b}  (${h.size[0]}·${h.size[1]}개)`);
  }

  const out = {
    /* 출신 도장. 이 파일은 **비공개 지식베이스에서 나왔다** — 글 제목과 경로가
       통째로 들어 있다. 공개 레포에 담기면 그 목차를 공개하는 셈이다(실제로 그랬다).
       무시 목록은 사람이 잊으면 끝이지만 이 줄은 파일이 스스로 들고 다닌다.
       담는 쪽에서 이 줄을 보고 막는다: scripts/audit-private-origin.mjs */
    origin: 'private:memo',
    doNotCommit: '이 파일은 공개 레포에 커밋하지 않는다',
    builtFrom: SOURCES.map((s) => s.name).join('+') || 'memo',
    /* 이 지도가 사는 **공간** — 어느 모델로 재고 어떤 쏠림을 뺐나. 나중에 잰 벡터를
       `toBiasedSpace(v, space.bias)` 로 옮겨야 여기 실린 문턱과 견줄 수 있다. */
    space: { model: usedTier, bias: biasMean },
    count: docs.length,
    embedded: coords ? coords.size : 0,
    model: usedTier,
    umap: umapPick,
    lanes: [...new Set(docs.map((d) => d.lane))],
    clusterNames: clusters ? clusters.names : [],
    edges,
    buried: buriedCount,
    months,
    holes,
    skeleton,
    // 배율에 따라 바꿔 쓸 층들. 성긴 것부터.
    levels: levelsOut ? levelsOut.map((l) => ({ k: l.k, names: l.names, words: l.words || [], sil: l.sil ?? null, dbcv: l.dbcv ?? null, fit: l.fit ?? null, nameWay: l.nameWay || null, nameMmr: l.nameMmr || null, why: l.why || null, dip: l.dip || null, silOn: l.silOn || null })) : [],
    /* 당겼을 때 쓰는 **자리 이름**. 덩어리 이름은 한 점에만 붙어 당기면
       화면 밖으로 나간다 — 칸마다 달아 두면 어디를 보든 이름이 있다. */
    tiles: coords ? [4, 8].map((side) => ({ side, cells: tileNames(docs, coords, side) })) : [],
    /* 갈래가 만나는 자리 요약 — 목적 지표라 머리말에 쓴다. */
    mixStat,
    twins: twinStat,
    h0: h0Out,
    /* 낱말 침입자 — 맞춘 비율과 **찍기**를 나란히. 찍기 옆에 안 놓으면 아무 뜻이 없다. */
    intrusion: intrusionOut,
    /* 바깥 잣대 — 우리 자 중 **유일하게 바깥에 물어보는 것**. 섞은 값을 나란히 싣는다. */
    external: externalOut,
    /* 써 보는 잣대 — 「이 덩어리를 보고 새 글이 여기 속하는지 알아맞힐 수 있나」(ProxAnn 식). */
    prox: proxOut,
    /* 어긋남 — 찢김(닮은 글이 흩어짐)과 거짓 이웃(옆에 있어도 남남). 둘뿐이다(CheckViz). */
    warp: warpOut,
    doi: doiOut,
    /* 안 쟀으면 **지난 판 값을 물려받는다** — 없애지 않는다(자가 낡음을 따로 본다). */
    wobble: wobbleOut ? { ...wobbleOut, mid: undefined } : carryOver(OUT, 'wobble', '--씨앗'),
    initLadder: ladderOut || carryOver(OUT, 'initLadder', '--초기화'),
    zoo: zooOut || carryOver(OUT, 'zoo', '--잣대'),
    idim: idimOut,
    delta: deltaOut,
    suggest: sugOut,
    seriation: serOut,
    /* 허브 — 몇 편이 모두의 이웃 자리를 먹나, 거리를 다시 재면 나아지나. */
    hub: hubOut,
    /* 덩어리가 진짜인가 — 꿋꿋함(거짓 무리)·뭉침(놓친 무리), 섞은 대조군과 함께. */
    group: groupOut,
    coarse: coarsePick && { k: coarsePick.k, clear: coarsePick.clear, curve: coarsePick.curve },
    dense: denseOut && {
      k: denseOut.k, params: denseOut.params, dbcv: denseOut.dbcv, curve: denseOut.curve,
      noise: denseOut.noise, names: denseOut.names,
    },
    /* 어디에도 안 붙는 글 요약. 문턱은 자료마다 다르므로 값도 같이 싣는다. */
    lonelyStat,
    /* 지난 판에 포갠 결과. 0 에 가까울수록 「어제 여기 있던 게 오늘도 여기」다. */
    align: alignInfo,
    docs: docs.map(({ text, ...rest }) => ({
      ...rest,
      xy: coords?.get(rest.id) || null,
      axis: axisCoords?.get(rest.id) || null,
      cluster: clusters?.of.get(rest.id) ?? null,
      levels: levelsOut ? levelsOut.map((l) => l.of.get(rest.id) ?? null) : null,
      /* 이 글이 **진짜 뭉친 자리**에 드나 (-1 = 어디에도 안 붙음) + 얼마나 확신하나. */
      dense: denseOut ? (denseOut.of.get(rest.id) ?? -1) : null,
      /* 이 글과 **거의 같은 글**이 있으면 그 대표의 id (없으면 null). */
      twin: rest.twin || null,
      densep: denseOut ? (denseOut.prob.get(rest.id) ?? 0) : null,
    })),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  /**
   * **공개 위험을 재서 파일에 같이 싣는다.**
   *
   * 이 파일은 비공개 지식베이스에서 나왔고, 다른 기계에서 보려고 옮기는 순간 좌표·이웃이
   * 함께 나간다. 제목을 가려도 **이웃이 갈래를 말해 주는지**를 재서, 「가리면 안전하다」는
   * 착각을 막는다. 우연 수준 둘(흔한 갈래 찍기 · 이웃 섞기)을 나란히 싣는다.
   */
  try {
    out.leak = leakOf(out.docs);
    console.log(`[atlas] 공개 위험 — 제목 가린 글 ${out.leak.masked}편 중 ${out.leak.guessed}편을 이웃으로 맞혀 봤다`
      + ` → **${(out.leak.rate * 100).toFixed(1)}% 적중**`
      + ` (흔한 갈래 찍기 ${(out.leak.commonRate * 100).toFixed(1)}% · 이웃을 섞으면 ${(out.leak.shuffledRate * 100).toFixed(1)}%`
      + ` → 우연의 ${out.leak.lift}배)`);
    console.log(`[atlas]   ★ 이웃 목록을 아예 빼고 **좌표만** 줘도 ${(out.leak.xyRate * 100).toFixed(1)}% 맞힌다`
      + ` — 목록을 빼는 것만으로는 못 막는다`);
  } catch (e) {
    console.warn(`[atlas] 공개 위험을 못 쟀다: ${e.message}`);
  }

  /* **새로 생긴 관심사** — 좌표 말고 이웃으로, 달을 섞은 대조군과 나란히. */
  try {
    out.novelty = noveltyOf(out.docs);
    const N = out.novelty;
    console.log(`[atlas] 새로 생긴 관심사 — 최근 ${N.recentMonths.length}달(${N.recentMonths.join(',')})`
      + ` · 달을 아는 글 ${N.known}편 · **모르는 글 ${N.unknown}편**`);
    console.log(`[atlas]   최근 글의 이웃 중 최근 글 ${(N.real.near * 100).toFixed(1)}%`
      + ` (최근 글이 원래 차지하는 몫 ${(N.real.share * 100).toFixed(1)}% → **뭉침 ${N.real.lift}배**)`
      + ` · **달을 섞으면 ${N.shuffled.lift}배**`);
    console.log(`[atlas]   → ${N.clustered
      ? `**새 관심사가 있다** — 몰리는 갈래: ${N.lanes.slice(0, 3).map((l) => `${l.lane}(${l.lift}배)`).join(' ')}`
      : '**새 관심사라 부를 것이 없다** (대조군을 못 넘는다)'}`);
  } catch (e) {
    console.warn(`[atlas] 새로 생긴 관심사를 못 쟀다: ${e.message}`);
  }

  /* **쓰이는가** — 지도가 「다시 손댈 글」을 미리 짚나. git 이 정답을 준다. */
  try {
    /* ★ `out` 리터럴에 `revisit: revisitOut` 을 적었더니 **null 을 먼저 붙잡아** 안 들어갔다.
       리터럴은 그 순간의 값을 담는다 — 나중에 대입해도 소용없다. 그래서 `out.revisit` 에 직접 넣는다. */
    out.revisit = revisitCheck(out.docs, mergedGitMap(lastTouched), out.novelty);
    /* **상호작용 DOI** — 지난 바퀴에 0% 였던 그 과제를 정면으로 다시 친다. */
    try {
      out.taskDoi = doiRevisit(out.docs, mergedInteractions(), out.novelty);
      const D = out.taskDoi;
      if (D.skipped) console.log(`[atlas] 지금 손대는 것 주변 — ${D.skipped}`);
      else {
        console.log(`[atlas] 지금 손대는 것 주변 — 커밋 ${D.events}개 중`
          + ` **${D.dropped}개(파일 ${D.droppedFiles}개분)를 일괄 커밋으로 걸렀다**`
          + ` (한 커밋 ${D.bulkCut}개 초과) · 앞 시기 이벤트 ${D.pastEvents}개`);
        console.log(`[atlas]   상위 ${D.ks[0]}편 적중 — **DOI(잦기+최근성+감쇠) ${(D.doi[0].rate * 100).toFixed(0)}%**`
          + ` · 잦기만 ${(D.freq[0].rate * 100).toFixed(0)}%`
          + ` · 아무거나 ${(D.chance[0].rate * 100).toFixed(0)}% (바탕 ${(D.base * 100).toFixed(1)}%)`
          + ` → **${D.useful ? '쓸 만하다' : '못 쓴다'}**`);
        console.log(`[atlas]   ★ 지도가 보태나 — 이웃의 DOI 만 ${(D.near[0].rate * 100).toFixed(0)}%`
          + ` · 둘을 섞으면 ${(D.both[0].rate * 100).toFixed(0)}% (글 자체만 ${(D.doi[0].rate * 100).toFixed(0)}%)`
          + ` → **${D.mapAdds ? '지도가 보탠다' : '지도는 여기에 아무것도 안 보탠다'}**`);
        console.log(`[atlas]   상위 ${D.ks.join('/')}편 — DOI ${D.doi.map((x) => (x.rate * 100).toFixed(0)).join('/')}%`
          + ` · 바탕 ${(D.base * 100).toFixed(1)}% · ${(D.ms / 1000).toFixed(0)}초`);
      }
    } catch (e) {
      console.warn(`[atlas] 지금 손대는 것 주변을 못 쟀다: ${e.message}`);
    }
    const R = out.revisit;
    if (R.skipped) {
      console.log(`[atlas] 쓰이는가 — ${R.skipped}`);
    } else {
      console.log(`[atlas] 쓰이는가 — 최근 ${R.recentMonths.join(',')} 전에 태어난 글 ${R.older}편 중`
        + ` **${R.back}편(${(R.base * 100).toFixed(1)}%)이 최근에 다시 손대졌다**`);
      console.log(`[atlas]   상위 ${R.ks[0]}편을 짚었을 때 맞은 비율 — 이웃이 움직였나 ${(R.ours.hits[0].rate * 100).toFixed(0)}%`
        + ` (같은 때 정보라 예측 아님) · **앞 때만 보면 ${(R.strict.hits[0].rate * 100).toFixed(0)}%**`
        + ` · 묻힌 글 ${(R.buried.hits[0].rate * 100).toFixed(0)}%`
        + ` · 아무거나 ${(R.chance.hits[0].rate * 100).toFixed(0)}% (바탕 ${(R.base * 100).toFixed(1)}%)`
        + ` → **${R.useful ? '일깨움에 쓸 만하다' : '일깨움에도 못 쓴다'}**`);
      console.log('[atlas]   나이별 다시 손댄 비율 — '
        + R.ages.map((a2) => `${a2.year}: ${(a2.rate * 100).toFixed(0)}%(${a2.all}편)`).join(' '));
    }
  } catch (e) {
    console.warn(`[atlas] 쓰이는가를 못 쟀다: ${e.message}`);
  }

  /* **공유용 일반화 판** — 가려도 새는 걸 알았으니, 일반화로 막을 수 있는지 잰다. */
  try {
    out.share = shareGrid(out.docs);
    console.log(`[atlas] 공유용 일반화 — 우연 수준 ${(out.share.chance * 100).toFixed(1)}%`);
    for (const r of out.share.rows) {
      console.log(`[atlas]   k=${r.k} (격자 ${r.side} · 칸 ${r.cells} · 글 ${(r.keptDocs * 100).toFixed(0)}% 남음)`
        + ` — 공격 적중 ${(r.attack * 100).toFixed(1)}%`
        + ` · 닮은 글이 곁에 ${(r.keepNear * 100).toFixed(1)}% (우연 ${(r.randNear * 100).toFixed(1)}%)`);
    }
    console.log(`[atlas]   → ${out.share.usable
      ? `**k=${out.share.pick} 이면 남에게 줄 만하다**`
      : '**어느 k 로도 남에게 줄 만한 판이 안 나온다**'}`);
  } catch (e) {
    console.warn(`[atlas] 공유용 일반화를 못 쟀다: ${e.message}`);
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`[atlas] 썼다: ${path.relative(KARMOLAB, OUT)} (자리 잡힌 글 ${out.embedded}개)`);
}

/* 직접 부를 때만 굽는다. 남이 collect() 만 빌려 쓰려고 불러왔는데 굽기가 통째로
   돌면 검사 하나가 몇 분씩 걸린다. */
const calledDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (calledDirectly) {
  main().catch((e) => { console.error('[atlas]', e); process.exit(1); });
}
