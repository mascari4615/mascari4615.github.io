/**
 * TASK-KL-150 — 사람이 만든 표 원장 시험.
 *
 * 여기는 **아무나 글을 보낼 수 있는 자리**다. 그래서 「돌아가나」보다 「이상한 걸 보내면
 * 어떻게 되나」를 먼저 본다 — 남의 화면에서 도는 스크립트, 원장을 통째로 채우는 표,
 * 남의 표를 고치는 일.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { KarmolabPackStore, PackError, sanitizePack, PACK_DAILY_LIMIT } from './karmolab-packs';

let tmpRoot: string;
let statePath: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kl150-packs-'));
  statePath = path.join(tmpRoot, 'data', 'karmolab-packs-state.json');
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function store(): KarmolabPackStore {
  return new KarmolabPackStore(statePath);
}

function goodPack(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: '내가 좋아하는 것',
    emoji: '🍜',
    fields: [{ key: 'f1', label: '맛', kind: 'number', unit: '점' }],
    items: [
      { name: '라면', f1: 9 },
      { name: '국수', f1: 7 },
      { name: '우동', f1: 8 },
      { name: '냉면', f1: 6 },
    ],
    ...extra,
  };
}

describe('믿을 수 없는 입력 다듬기', () => {
  it('그림 자리에 스크립트를 실으면 그림이 통째로 빠진다 (표는 산다)', () => {
    const clean = sanitizePack(
      goodPack({
        items: [
          { name: '라면', img: 'javascript:alert(1)' },
          { name: '국수', img: 'data:text/html,<script>x</script>' },
          { name: '우동', img: 'https://example.com/u.png' },
          { name: '냉면', img: 'http://example.com/n.png' },
        ],
      }),
    );
    expect(clean.items.map((i) => i.img)).toEqual([undefined, undefined, 'https://example.com/u.png', undefined]);
  });

  it('눈에 안 보이는 글자·줄바꿈은 지운다 — 한 줄이 목록을 밀어내면 안 된다', () => {
    const clean = sanitizePack(goodPack({ title: '아​주\n긴‮제목' }));
    expect(clean.title).toBe('아주긴제목');
  });

  it('같은 이름 둘은 하나만 남는다 (놀이가 못 가른다)', () => {
    const clean = sanitizePack(
      goodPack({
        items: [{ name: '라면' }, { name: '라면' }, { name: '국수' }, { name: '우동' }, { name: '냉면' }],
      }),
    );
    expect(clean.items).toHaveLength(4);
  });

  it('항목이 넷 미만이면 표가 아니다', () => {
    expect(() => sanitizePack(goodPack({ items: [{ name: '하나' }, { name: '둘' }] }))).toThrow(PackError);
  });

  it('제목이 없거나 칸이 없으면 거절하고 이유를 준다', () => {
    expect(() => sanitizePack(goodPack({ title: '   ' }))).toThrow(/bad_title/);
    expect(() => sanitizePack(goodPack({ fields: [] }))).toThrow(/no_fields/);
  });

  it('너무 큰 표는 원장을 통째로 채우기 전에 막는다', () => {
    const huge = goodPack({
      items: Array.from({ length: 4000 }, (_, i) => ({ name: `x${i}`.padEnd(60, 'y'), img: `https://example.com/${'a'.repeat(80)}/${i}.png` })),
    });
    expect(() => sanitizePack(huge)).toThrow(/too_big/);
  });

  it('숫자 칸에 글자가 오면 그 값만 빠진다 (표 전체를 버리지 않는다)', () => {
    const clean = sanitizePack(
      goodPack({ items: [{ name: '라면', f1: '맛있음' }, { name: '국수', f1: 7 }, { name: '우동' }, { name: '냉면', f1: 6 }] }),
    );
    expect(clean.items[0].f1).toBeUndefined();
    expect(clean.items[1].f1).toBe(7);
  });
});

describe('올리기·고치기·내리기', () => {
  it('올리면 짧은 주소가 생기고 그대로 다시 읽힌다', () => {
    const s = store();
    const made = s.create('yon', goodPack());
    expect(made.id).toMatch(/^[a-z0-9]{8}$/);
    expect(s.get(made.id)!.title).toBe('내가 좋아하는 것');
    // 봇이 죽어도 남는다
    expect(new KarmolabPackStore(statePath).get(made.id)!.items).toHaveLength(4);
  });

  it('남의 표는 못 고치고 못 내린다 — 고치려면 이어받는다', () => {
    const s = store();
    const made = s.create('yon', goodPack());
    expect(() => s.update('ring', made.id, goodPack({ title: '가로챈 표' }))).toThrow(/not_owner/);
    expect(() => s.remove('ring', made.id)).toThrow(/not_owner/);
    expect(s.get(made.id)!.title).toBe('내가 좋아하는 것');
  });

  it('주인장은 내릴 수 있다 (신고 대응)', () => {
    const s = store();
    const made = s.create('yon', goodPack());
    expect(s.remove('admin', made.id, true)).toBe(true);
    expect(s.get(made.id)).toBeNull();
  });

  it('이어받기는 있는 표에서만 갈라진다 — 없는 주소로 족보를 지어낼 수 없다', () => {
    const s = store();
    const origin = s.create('yon', goodPack());
    expect(s.create('ring', goodPack(), origin.id).forkOf).toBe(origin.id);
    expect(s.create('ring', goodPack(), 'nosuchid').forkOf).toBeNull();
  });

  it('하루 상한을 넘기면 막는다', () => {
    const s = store();
    for (let i = 0; i < PACK_DAILY_LIMIT; i++) s.create('yon', goodPack({ title: `표 ${i}` }));
    expect(() => s.create('yon', goodPack())).toThrow(/daily_limit/);
    // 다른 사람은 안 막힌다
    expect(s.create('ring', goodPack()).id).toBeTruthy();
  });
});

describe('목록', () => {
  it('인기순은 **연 횟수**로 선다 — 자랑해도 안 열리면 안 오른다', () => {
    const s = store();
    const quiet = s.create('yon', goodPack({ title: '조용한 표' }));
    const loud = s.create('yon', goodPack({ title: '많이 열린 표' }));
    s.noteOpen(loud.id, 'visitor-a');
    s.noteOpen(loud.id, 'visitor-b');
    s.noteOpen(quiet.id, 'visitor-a');
    expect(s.list({ sort: 'popular' }).map((p) => p.title)).toEqual(['많이 열린 표', '조용한 표']);
  });

  it('같은 사람 새로고침은 안 센다 (30분 창)', () => {
    const s = store();
    const made = s.create('yon', goodPack());
    expect(s.noteOpen(made.id, 'same')).toBe(true);
    expect(s.noteOpen(made.id, 'same')).toBe(false);
    expect(s.get(made.id)!.opens).toBe(1);
  });

  it('놀이가 「내가 걸 수 있는 표만」 물으면 못 거는 표는 안 준다', () => {
    const s = store();
    s.create('yon', goodPack({ title: '숫자 있는 표' }));
    s.create('yon', {
      title: '숫자 없는 표',
      emoji: '🎨',
      fields: [{ key: 'f1', label: '분류', kind: 'category' }],
      items: [{ name: 'ㄱ' }, { name: 'ㄴ' }, { name: 'ㄷ' }, { name: 'ㄹ' }],
    });
    expect(s.list({ needsNumber: true }).map((p) => p.title)).toEqual(['숫자 있는 표']);
  });

  it('그림이 주인공인 놀이는 그림이 넷은 되는 표만 받는다', () => {
    const s = store();
    s.create('yon', {
      title: '그림 표',
      emoji: '🖼',
      fields: [{ key: 'f1', label: '분류', kind: 'category' }],
      items: [1, 2, 3, 4].map((n) => ({ name: `그림${n}`, img: `https://example.com/${n}.png` })),
    });
    s.create('yon', goodPack({ title: '그림 없는 표' }));
    expect(s.list({ needsImage: true }).map((p) => p.title)).toEqual(['그림 표']);
  });

  it('내 것만 볼 수 있고, 제목으로 찾을 수 있다', () => {
    const s = store();
    s.create('yon', goodPack({ title: '욘의 표' }));
    s.create('ring', goodPack({ title: '링의 표' }));
    expect(s.list({ owner: 'yon' }).map((p) => p.title)).toEqual(['욘의 표']);
    expect(s.list({ query: '링' }).map((p) => p.title)).toEqual(['링의 표']);
  });

  it('요약에는 표 전체가 안 실린다 (목록마다 수백 KB 를 보내지 않는다)', () => {
    const s = store();
    s.create('yon', goodPack());
    const row = s.list()[0] as unknown as Record<string, unknown>;
    expect(row.items).toBe(4); // 항목 「수」지 항목 목록이 아니다
    expect(row.fields).toBe(1);
    expect(Array.isArray(row.items)).toBe(false);
  });
});

/**
 * 월드컵 집계 (TASK-KL-151).
 *
 * 여기서 틀리면 **불공정한 순위가 예쁘게** 나온다 — 골라진 횟수만 세면 대진운 좋게 여러 번
 * 올라온 항목이 무조건 1등이 된다. 그래서 「마주친 판으로 나누는가」를 먼저 본다.
 */
describe('월드컵 집계', () => {
  const imgPack = {
    title: '그림 표',
    emoji: '🖼',
    fields: [{ key: 'f1', label: '분류', kind: 'category' }],
    items: ['가', '나', '다', '라'].map((n) => ({ name: n, img: `https://example.com/${encodeURIComponent(n)}.png` })),
  };

  it('승률은 **마주친 판**으로 나눈다 — 많이 올라온 항목이 그냥 1등이 되면 안 된다', () => {
    const s = store();
    const pack = s.create('yon', imgPack);
    s.recordTournament(
      pack.id,
      [
        { win: '가', lose: '나' },
        { win: '가', lose: '다' },
        { win: '라', lose: '가' },
      ],
      '라',
      'visitor-a',
    );
    const rows = s.tally(pack.id);
    const 라 = rows.find((r) => r.name === '라')!;
    const 가 = rows.find((r) => r.name === '가')!;
    expect(라.rate).toBe(1); // 한 번 마주쳐 한 번 이김
    expect(가.wins).toBe(2);
    expect(가.seen).toBe(3);
    expect(rows[0].name).toBe('라'); // 승률 우선
    expect(라.champion).toBe(1);
  });

  it('표에 없는 이름·자기 자신과의 대결은 안 센다 (아무나 보낼 수 있는 자리다)', () => {
    const s = store();
    const pack = s.create('yon', imgPack);
    const counted = s.recordTournament(
      pack.id,
      [
        { win: '없는놈', lose: '가' },
        { win: '나', lose: '나' },
        { win: '다', lose: '라' },
      ],
      '다',
      'visitor-a',
    );
    expect(counted).toBe(1);
    expect(s.tally(pack.id).map((r) => r.name).sort()).toEqual(['다', '라']);
  });

  it('같은 사람이 연달아 보내면 안 센다 (한 사람이 순위를 만들 수 있으면 안 된다)', () => {
    const s = store();
    const pack = s.create('yon', imgPack);
    expect(s.recordTournament(pack.id, [{ win: '가', lose: '나' }], '가', 'same')).toBe(1);
    expect(s.recordTournament(pack.id, [{ win: '가', lose: '나' }], '가', 'same')).toBe(0);
    expect(s.tally(pack.id).find((r) => r.name === '가')!.seen).toBe(1);
  });

  it('아직 아무도 안 돌린 표는 빈 순위다 (0% 줄을 늘어놓지 않는다)', () => {
    const s = store();
    const pack = s.create('yon', imgPack);
    expect(s.tally(pack.id)).toEqual([]);
  });

  it('없는 표에는 아무것도 안 적는다', () => {
    expect(store().recordTournament('nosuchid', [{ win: '가', lose: '나' }], '가', 'v')).toBe(0);
  });
});

/**
 * 처음부터 있는 표 (TASK-KL-151 ④).
 *
 * 빈 원장은 「아직 아무도 없다」가 아니라 「죽은 곳」으로 읽힌다. 다만 심는 것은 **표**뿐이고
 * 열린 횟수·승률까지 심으면 그건 지어낸 수다 — 그 경계를 여기서 지킨다.
 */
describe('처음부터 있는 표', () => {
  const siteTable = {
    title: '포켓몬',
    emoji: '🔴',
    fields: [{ key: 'gen', label: '세대', unit: '' }],
    items: [1, 2, 3, 4, 5].map((n) => ({ n: `몬${n}`, i: `https://example.com/${n}.png`, v: { gen: n } })),
  };

  function seedDirWith(name: string, body: unknown): string {
    const dir = path.join(tmpRoot, 'site-data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), JSON.stringify(body), 'utf-8');
    return dir;
  }

  it('사이트 표를 우리 표 모양으로 심는다 — 그림과 숫자 칸이 그대로 온다', () => {
    const dir = seedDirWith('higher-pokemon.json', siteTable);
    const s = new KarmolabPackStore(statePath, dir);
    const list = s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: '포켓몬', items: 5, images: 5, numberFields: 1, ownerHandle: 'karmolab' });
  });

  it('심는 건 표뿐이다 — 열린 횟수·승률은 0 에서 시작한다 (지어낸 수 0)', () => {
    const dir = seedDirWith('higher-pokemon.json', siteTable);
    const s = new KarmolabPackStore(statePath, dir);
    expect(s.list()[0].opens).toBe(0);
    expect(s.tally(s.list()[0].id)).toEqual([]);
  });

  it('다시 떠도 같은 표가 쌓이지 않는다', () => {
    const dir = seedDirWith('higher-pokemon.json', siteTable);
    new KarmolabPackStore(statePath, dir);
    const again = new KarmolabPackStore(statePath, dir);
    expect(again.list()).toHaveLength(1);
  });

  it('사람이 지웠으면 다시 안 심는다 (지운 뜻을 존중)', () => {
    const dir = seedDirWith('higher-pokemon.json', siteTable);
    const s = new KarmolabPackStore(statePath, dir);
    s.remove('karmolab', s.list()[0].id);
    expect(new KarmolabPackStore(statePath, dir).list()).toEqual([]);
  });

  it('표 파일이 없으면 조용히 안 심는다 (봇은 그 파일 없이도 떠야 한다)', () => {
    const s = new KarmolabPackStore(statePath, path.join(tmpRoot, '없는폴더'));
    expect(s.list()).toEqual([]);
    // 표시를 안 남겼으므로, 나중에 파일이 생기면 그때 심는다
    const dir = seedDirWith('higher-pokemon.json', siteTable);
    expect(new KarmolabPackStore(statePath, dir).list()).toHaveLength(1);
  });

  it('모양이 다른 파일은 무시한다 (항목이 모자라면 표가 아니다)', () => {
    const dir = seedDirWith('higher-pokemon.json', { title: 'x', fields: [], items: [] });
    expect(new KarmolabPackStore(statePath, dir).list()).toEqual([]);
  });
});

describe('씨앗 표의 글자 칸', () => {
  it('갈래 같은 글자 칸도 그대로 온다 (숫자로 읽으면 값이 통째로 빠진다)', () => {
    const dir = path.join(tmpRoot, 'site-data2');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'worldcup-tools.json'),
      JSON.stringify({
        title: 'KarmoLab 도구 월드컵',
        emoji: '🧰',
        fields: [{ key: 'cat', label: '갈래', kind: 'category' }],
        items: [1, 2, 3, 4].map((n) => ({ n: `도구${n}`, i: `https://example.com/${n}.jpg`, v: { cat: '도구' } }))
      }),
      'utf-8'
    );
    const s = new KarmolabPackStore(statePath, dir);
    const made = s.list()[0];
    expect(made.title).toBe('KarmoLab 도구 월드컵');
    expect(made.images).toBe(4);
    expect(s.get(made.id)!.items[0].cat).toBe('도구');
  });
});
