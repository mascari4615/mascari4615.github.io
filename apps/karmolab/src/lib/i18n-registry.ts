/**
 * ⚠ 자동 생성 — 손으로 고치지 말 것 (TASK-KL-203).
 * 정본은 `data/locales.json` 이고, `node scripts/build-i18n.mjs` 가 여기에 찍는다.
 * 어긋나면 `npm run test:i18n` 이 잡는다.
 */
export interface LocaleMeta {
  code: string;
  /** 주소 앞머리. 기본 언어는 빈 문자열이다 (기존 주소를 안 깬다). */
  prefix: string;
  htmlLang: string;
  ogLocale: string;
  /** 그 언어를 쓰는 사람이 부르는 이름 — 언어 단추에는 이걸 보여 준다. */
  endonym: string;
  source: boolean;
  enabled: boolean;
}

export const DEFAULT_LOCALE = "ko";

export const LOCALES: LocaleMeta[] = [
  {
    "code": "ko",
    "prefix": "",
    "htmlLang": "ko",
    "ogLocale": "ko_KR",
    "endonym": "한국어",
    "source": true,
    "enabled": true
  },
  {
    "code": "en",
    "prefix": "/en",
    "htmlLang": "en",
    "ogLocale": "en_US",
    "endonym": "English",
    "source": false,
    "enabled": true
  },
  {
    "code": "ja",
    "prefix": "/ja",
    "htmlLang": "ja",
    "ogLocale": "ja_JP",
    "endonym": "日本語",
    "source": false,
    "enabled": false
  }
];
