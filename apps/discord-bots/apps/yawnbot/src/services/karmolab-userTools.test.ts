/**
 * 남이 만든 도구 (TASK-KL-183 H).
 *
 * 여기가 틀리면 **남의 코드가 남의 계정 옆에 놓인다**. 그래서 「기본은 비공개」·「남의 것은
 * 못 고친다」·「크기 상한」을 눈으로 박는다. (모래상자 자체는 화면 쪽 시험이 지킨다.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabUserToolStore, SOURCE_MAX, PER_OWNER } from './karmolab-userTools';

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl183h-'));
  statePath = path.join(tmpDir, 'user-tools.json');
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const src = '<p>안녕</p><script>document.body.append("!")</script>';

describe('남이 만든 도구 (KL-183 H)', () => {
  it('기본은 비공개 — 목록에 안 올라간다', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: '내 도구', source: src })!;
    expect(tool.listed).toBe(false);
    expect(store.listed()).toEqual([]);

    store.update(tool.id, 'karmo', { listed: true });
    expect(store.listed().map((t) => t.id)).toEqual([tool.id]);
  });

  it('남의 것은 못 고치고 못 지운다', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: 'x', source: src })!;
    expect(store.update(tool.id, 'ring', { title: '뺏기' })).toBeNull();
    expect(store.remove(tool.id, 'ring')).toBe(false);
    expect(store.get(tool.id)?.title).toBe('x');
  });

  it('사람이 읽을 수 없는 크기는 안 받는다 — 검토할 수 없는 것은 올릴 수도 없어야 한다', () => {
    const store = new KarmolabUserToolStore(statePath);
    expect(store.create('karmo', { title: 'x', source: 'a'.repeat(SOURCE_MAX + 1) })).toBeNull();
    expect(store.create('karmo', { title: 'x', source: '   ' })).toBeNull();
    expect(store.create('karmo', { title: '', source: src })).toBeNull();
  });

  it('한 사람이 올릴 수 있는 수에 상한이 있다', () => {
    const store = new KarmolabUserToolStore(statePath);
    for (let i = 0; i < PER_OWNER; i += 1) expect(store.create('karmo', { title: `t${i}`, source: src })).not.toBeNull();
    expect(store.create('karmo', { title: '넘침', source: src })).toBeNull();
  });

  it('이름의 꾸민 글자는 떨어낸다 (제목은 우리 화면이 그대로 쓴다)', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: '<script>x</script>이름', source: src })!;
    expect(tool.title).not.toContain('<');
    // 본문은 그대로 둔다 — 그건 모래상자 안에서만 도는 것이라 우리가 고칠 것이 아니다
    expect(store.get(tool.id)?.source).toBe(src);
  });

  it('다시 열어도 남는다 · 돈 횟수는 실측만', () => {
    const first = new KarmolabUserToolStore(statePath);
    const tool = first.create('karmo', { title: 'x', source: src })!;
    expect(first.noteRun(tool.id)).toBe(1);
    expect(new KarmolabUserToolStore(statePath).get(tool.id)?.runs).toBe(1);
  });
});

describe('남의 도구 신뢰 (KL-191 축4)', () => {
  it('같은 사람이 여러 번 눌러도 한 번 — 신고가 무기가 되지 않게', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: '내 도구', source: '<p>hi</p>' })!;
    store.report(tool.id, 'ring');
    store.report(tool.id, 'ring');
    expect(store.report(tool.id, 'ring')!.reports).toBe(1);
    expect(store.get(tool.id)!.stopped).toBeUndefined();
  });

  it('주인은 자기 도구를 신고 못 한다 — 내리고 싶으면 스스로 세우면 된다', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: '내 도구', source: '<p>hi</p>' })!;
    expect(store.report(tool.id, 'karmo')).toBeNull();
  });

  it('셋이 쌓이면 스스로 서고, 목록에서도 빠진다', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: '내 도구', source: '<p>hi</p>' })!;
    store.update(tool.id, 'karmo', { listed: true });
    store.report(tool.id, 'a');
    store.report(tool.id, 'b');
    const third = store.report(tool.id, 'c')!;
    expect(third.stopped).toBe(true);
    expect(store.get(tool.id)!.listed).toBe(false);
    expect(store.listed().map((t) => t.id)).not.toContain(tool.id);
  });

  it('신고로 선 것은 주인 혼자 못 되돌린다 — 되돌려지면 세운 것이 아니다', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: '내 도구', source: '<p>hi</p>' })!;
    ['a', 'b', 'c'].forEach((who) => store.report(tool.id, who));
    expect(store.setStopped(tool.id, 'karmo', false)).toBeNull();
    expect(store.get(tool.id)!.stopped).toBe(true);
  });

  it('주인이 스스로 세운 것은 스스로 다시 연다', () => {
    const store = new KarmolabUserToolStore(statePath);
    const tool = store.create('karmo', { title: '내 도구', source: '<p>hi</p>' })!;
    expect(store.setStopped(tool.id, 'karmo', true)!.stopped).toBe(true);
    expect(store.setStopped(tool.id, 'karmo', false)!.stopped).toBeUndefined();
  });
});

describe('「이 도구가 뭘 하나」 요약 (KL-191 축4)', () => {
  it('소스에서 읽는다 — 올린 사람의 설명이 아니라', () => {
    const s = KarmolabUserToolStore.summarize('<canvas id="c"></canvas><script>c.getContext("2d")</script>');
    expect(s.does).toContain('그림을 그린다');
    expect(s.blocked).toEqual([]);
  });

  it('막힌 것을 하려고 한 사실도 말한다 — 안 보여 주면 막힌 것이 풀린 날 아무도 모른다', () => {
    const s = KarmolabUserToolStore.summarize('<script>fetch("//x.example");localStorage.getItem("k")</script>');
    expect(s.blocked).toContain('바깥으로 보내기 (끊겨 있음)');
    expect(s.blocked).toContain('내 저장소·쿠키 (안 보임)');
  });

  it('못 읽는 것은 못 읽는다고 한다 — 아는 척이 제일 나쁘다', () => {
    const jumble = `<script>${'a'.repeat(2500)}</script>`;
    expect(KarmolabUserToolStore.summarize(jumble).unreadable).toBe(true);
    expect(KarmolabUserToolStore.summarize('<p>보통 글</p>\n<p>두 줄</p>').unreadable).toBe(false);
  });
});
