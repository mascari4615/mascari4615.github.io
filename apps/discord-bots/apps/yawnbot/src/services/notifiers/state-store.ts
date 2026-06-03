import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../../paths';

/**
 * notifier dedup state 의 좁은 인터페이스 (TASK-YB-041 — deep module).
 * 파일 I/O·존재확인·JSON·에러 degrade·디렉토리 생성은 구현(createStateStore) 안에 은닉.
 * 호출자(notifier)는 검증 규칙(normalize)과 저장 캡(trim)만 선언한다.
 */
export interface StateStore<T> {
  load(): T;
  save(state: T): void;
}

export interface StateStoreConfig<T> {
  /** data/ 하위 파일명 (예: 'news-notifier-state.json'). */
  fileName: string;
  /** 로그 라벨 (예: 'News') — 읽기/저장 실패 경고에 사용. */
  label: string;
  /**
   * parse 된 부분 state → 검증·하위호환·기본값 적용한 완전 state.
   * 빈 입력 normalize({}) 가 곧 "기본값" 이어야 한다 (없음/실패 폴백 겸용).
   */
  normalize(parsed: Partial<T>): T;
  /** 저장 직전 캡/트림 (선택). 미지정 시 state 를 그대로 기록. */
  trim?(state: T): T;
}

/**
 * dedup state 의 load/save 를 단일 골격으로 캡슐화한다.
 * 핵심 불변: state I/O 가 깨져도 알림 자체는 살린다 (catch → warn → degrade).
 */
export function createStateStore<T>(config: StateStoreConfig<T>): StateStore<T> {
  const statePath = path.join(PKG_ROOT, 'data', config.fileName);

  return {
    load(): T {
      try {
        if (fs.existsSync(statePath)) {
          const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Partial<T>;
          return config.normalize(parsed);
        }
      } catch (err) {
        console.warn(`[${config.label}] dedup state 읽기 실패 — 새 state 로 시작:`, err);
      }
      // 없음 / 실패 = 빈 입력 normalize (기본값).
      return config.normalize({});
    },

    save(state: T): void {
      try {
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        const out = config.trim ? config.trim(state) : state;
        fs.writeFileSync(statePath, JSON.stringify(out, null, 2) + '\n', 'utf-8');
      } catch (err) {
        // dedup 깨지더라도 알림 자체는 살림 — 권한 사고 시 안전 degrade.
        console.warn(`[${config.label}] dedup state 저장 실패:`, err);
      }
    },
  };
}
