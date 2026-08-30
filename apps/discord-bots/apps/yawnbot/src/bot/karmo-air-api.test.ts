/**
 * 하늘 데이터 중계. 받은 줄을 어떻게 읽나 (TASK-KL-336).
 *
 * 여기서 지키는 것은 **오류 없이 조용히 틀리는 다섯 자리**다. 전부 2026-08-20 에 실제
 * 응답에서 눈으로 본 것이고, 그래서 아래 표본은 지어낸 게 아니라 그날 받은 줄이다.
 */
import { describe, expect, it } from 'vitest';
import { gridKey, rowsOf, toPlane, toPlanes } from './karmo-air-api';

/* 2026-08-20 서울 상공에서 실제로 받은 줄들 */
const FLYING = {
  hex: 'abba6c',
  flight: 'FDX5928 ', // ← 꼬리 공백이 진짜로 붙어서 온다
  r: 'N855FD',
  t: 'B77L',
  alt_baro: 10975,
  track: 95.79,
  gs: 346.8,
  lat: 37.10321,
  lon: 125.902794,
};
const PARKED = {
  hex: '71d426',
  r: 'HL9426', // ← 편명이 없다. 등록기호뿐
  t: 'KA27',
  alt_baro: 'ground', // ← 숫자가 아니라 문자열
  lat: 37.466526,
  lon: 126.361897,
};

describe('한 줄 읽기', () => {
  it('편명의 꼬리 공백을 자른다. 안 자르면 같은 편이 둘로 보인다', () => {
    expect(toPlane(FLYING)!.label).toBe('FDX5928');
  });

  it('편명이 없으면 등록기호로 부른다. 이름이 없다고 버리지 않는다', () => {
    expect(toPlane(PARKED)!.label).toBe('HL9426');
  });

  it('편명도 등록기호도 없으면 기체 번호로 부른다', () => {
    expect(toPlane({ hex: 'abc123', lat: 1, lon: 2 })!.label).toBe('abc123');
  });

  it('★ 땅에 선 기체는 땅이라고 들고 있는다. "ground" 를 숫자로 읽으면 NaN 이다', () => {
    const p = toPlane(PARKED)!;
    expect(p.onGround).toBe(true);
    expect(p.altFt).toBeNull(); // 0 이 아니다. 0 은 해수면 높이로 난다는 뜻이 된다
  });

  it('나는 기체는 고도를 그대로 들고 있는다', () => {
    const p = toPlane(FLYING)!;
    expect(p.onGround).toBe(false);
    expect(p.altFt).toBe(10975);
  });

  it('기압 고도가 없으면 기하 고도로 내려간다', () => {
    expect(toPlane({ hex: 'a', alt_geom: 3000, lat: 1, lon: 2 })!.altFt).toBe(3000);
  });

  it('★ 좌표가 없는 줄은 버린다. 0,0 으로 채우면 기니만에 유령이 뜬다', () => {
    expect(toPlane({ hex: 'a', flight: 'X' })).toBeNull();
    expect(toPlane({ hex: 'a', flight: 'X', lat: 37 })).toBeNull();
    expect(toPlane({ hex: 'a', flight: 'X', lat: NaN, lon: 1 })).toBeNull();
  });

  it('★ 방향, 속도를 모르면 null 이다. 0 으로 채우면 온 하늘이 북쪽을 본다', () => {
    const p = toPlane({ hex: 'a', flight: 'X', lat: 1, lon: 2 })!;
    expect(p.trackDeg).toBeNull();
    expect(p.speedKt).toBeNull();
  });

  it('아는 값은 그대로 들고 온다', () => {
    const p = toPlane(FLYING)!;
    expect(p.trackDeg).toBeCloseTo(95.79, 2);
    expect(p.speedKt).toBeCloseTo(346.8, 1);
  });
});

describe('목록 열쇠가 원천마다 다르다', () => {
  it('adsb.lol 은 ac', () => {
    expect(rowsOf({ ac: [FLYING] })).toHaveLength(1);
  });

  it('adsb.fi 는 aircraft. 여기서 안 펴면 한 원천이 통째로 빈 하늘이 된다', () => {
    expect(rowsOf({ aircraft: [FLYING] })).toHaveLength(1);
  });

  it('모르는 모양이면 빈 목록 (던지지 않는다. 겹 하나가 조용히 비는 게 맞다)', () => {
    expect(rowsOf(null)).toHaveLength(0);
    expect(rowsOf({ '뭔가': 1 })).toHaveLength(0);
    expect(rowsOf('문자열')).toHaveLength(0);
  });
});

describe('목록 통째로', () => {
  it('못 쓰는 줄만 빠진다', () => {
    const list = toPlanes({ ac: [FLYING, { hex: 'zz' }, PARKED] });
    expect(list).toHaveLength(2);
  });

  it('같은 기체가 두 번 와도 하나만. 겹치면 점이 진하게 겹쳐 보인다', () => {
    expect(toPlanes({ ac: [FLYING, { ...FLYING, lat: 37.2 }] })).toHaveLength(1);
  });

  it('상한을 넘기지 않는다. 만 대를 그리면 지구본이 멎는다', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ ...FLYING, hex: `h${i}` }));
    expect(toPlanes({ ac: many }, 10)).toHaveLength(10);
  });
});

describe('곳간 열쇠. 조금 돌릴 때마다 새로 묻지 않는다', () => {
  it('가까운 자리는 같은 열쇠', () => {
    expect(gridKey(37.4, 127.1)).toBe(gridKey(37.49, 126.9));
  });

  it('먼 자리는 다른 열쇠', () => {
    expect(gridKey(37.5, 127)).not.toBe(gridKey(40.5, 127));
  });

  it('★ 날짜변경선 양쪽은 같은 자리다. 그냥 반올림하면 열쇠가 둘로 갈린다', () => {
    expect(gridKey(0, 180)).toBe(gridKey(0, -180));
    expect(gridKey(0, 179.6)).toBe(gridKey(0, -180));
  });

  it('★ -0 과 0 은 같은 열쇠여야 한다. 글자로 만들면 갈린다', () => {
    expect(gridKey(0, -0.2)).toBe(gridKey(0, 0.2));
    expect(gridKey(0, -0.2)).not.toContain('-0,');
  });

  it('극을 넘지 않는다', () => {
    expect(gridKey(95, 0)).toBe('90,0');
    expect(gridKey(-95, 0)).toBe('-90,0');
  });
});
