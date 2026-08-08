/**
 * TASK-KL-196 D — 숨긴 것 원장 시험.
 *
 * 중요한 것: **처음 찾은 순서가 기록**이라는 것과, 목록의 정본이 브라우저인데도
 * 아무 글자나 쌓이지는 않는다는 것.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabSecretStore, isValidSecretId, MAX_PER_PERSON } from './karmolab-secrets';

let file: string;
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kl196-'));
  file = path.join(tmp, 'secrets.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('이름 모양', () => {
  it('소문자로 시작하는 짧은 이름만 받는다', () => {
    expect(isValidSecretId('konami')).toBe(true);
    expect(isValidSecretId('night-owl_2')).toBe(true);
    expect(isValidSecretId('Konami')).toBe(false);
    expect(isValidSecretId('9lives')).toBe(false);
    expect(isValidSecretId('a'.repeat(40))).toBe(false);
    expect(isValidSecretId({ id: 'x' })).toBe(false);
  });
});

describe('찾은 목록', () => {
  it('찾은 순서대로 쌓인다', () => {
    const store = new KarmolabSecretStore(file);
    store.found('yon', 'konami');
    store.found('yon', 'owl');
    expect(store.of('yon')).toEqual(['konami', 'owl']);
  });

  it('같은 것을 또 찾아도 순서가 안 바뀐다 — 처음 찾은 순서가 기록이다', () => {
    const store = new KarmolabSecretStore(file);
    store.found('yon', 'konami');
    store.found('yon', 'owl');
    store.found('yon', 'konami');
    expect(store.of('yon')).toEqual(['konami', 'owl']);
  });

  it('모양이 틀린 이름은 안 쌓인다', () => {
    const store = new KarmolabSecretStore(file);
    store.found('yon', '<script>');
    expect(store.of('yon')).toEqual([]);
  });

  it('한 사람이 무한히 쌓지 못한다', () => {
    const store = new KarmolabSecretStore(file);
    for (let i = 0; i < MAX_PER_PERSON + 10; i++) store.found('yon', `s${i}`);
    expect(store.of('yon').length).toBe(MAX_PER_PERSON);
  });

  it('사람마다 따로 센다', () => {
    const store = new KarmolabSecretStore(file);
    store.found('yon', 'konami');
    expect(store.of('ring')).toEqual([]);
  });

  it('파일로 이어진다', () => {
    new KarmolabSecretStore(file).found('yon', 'konami');
    expect(new KarmolabSecretStore(file).of('yon')).toEqual(['konami']);
  });
});

describe('몇 명이 찾았나', () => {
  it('아무도 못 찾은 것은 줄이 없다', () => {
    const store = new KarmolabSecretStore(file);
    store.found('yon', 'konami');
    store.found('ring', 'konami');
    store.found('ring', 'owl');
    expect(store.tally()).toEqual({ konami: 2, owl: 1 });
  });
});
