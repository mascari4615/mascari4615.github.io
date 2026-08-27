import { appHash } from '../../lib/site-base';
/**
 * 혼자 놀이 명부 — 오락실이 문 하나가 되기 위한 다리 (TASK-KL-313)
 *
 * 사용자: "그 게임류 오락실로 통합하면 좋을 것 같아"
 *
 * 왜 있나: 놀이로 들어가는 문이 셋으로 갈려 있었다 — 「오락실」(방 게임 51개), 「놀이터」
 * (혼자 놀이 카드), 사이드바 「오늘의」(`/daily/`). 문이 셋이면 **어느 문으로 들어왔느냐가
 * 무엇을 아는지를 정한다** — 오락실만 본 사람은 하나 맞히기를 영영 모른다.
 *
 * 그렇다고 명부를 여기 다시 적지 않는다. 혼자 놀이의 정본은 이미 `apps/play/games.json`
 * 하나이고(관문·전환 줄·놀이터가 전부 그걸 먹는다), 두 벌로 적으면 그날부터 갈라진다.
 * 이 파일이 하는 일은 **그 정본을 오락실이 읽을 수 있는 모양으로 옮기는 것**뿐이다.
 *
 * 방 게임과 섞지 않는 이유: 커널 위 게임은 자리·봇·편이 있고, 혼자 놀이는 그런 게 없다.
 * 한 배열에 억지로 담으면 카드마다 「이건 방 게임인가」를 되묻게 된다. 명부는 나란히 둘,
 * **문은 하나**가 옳은 모양이다.
 */

/** 혼자 놀이 한 줄 (`apps/play/games.json` 의 한 항목 그대로). */
export interface SoloPlay {
  id: string;
  title: string;
  emoji: string;
  /** 갈 자리. 앱 안이면 `/karmolab/#<도구>`, 밖이면 `/daily/` 같은 진짜 주소. */
  url: string;
  lead: string;
}

/** 한 번 받아 두면 이 세션 동안 다시 안 받는다 — 로비를 다시 그릴 때마다 받으면 깜빡인다. */
let cached: SoloPlay[] | null = null;
let inflight: Promise<SoloPlay[]> | null = null;

const looksLikePlay = (v: unknown): v is SoloPlay => {
  const g = (v ?? {}) as Record<string, unknown>;
  return typeof g.id === 'string' && typeof g.title === 'string' && typeof g.url === 'string';
};

/**
 * 혼자 놀이 목록. **못 받으면 빈 배열** — 오락실은 그 자리만 없이 그대로 선다
 * (놀이 목록 하나 때문에 방 게임 51개가 안 뜨는 것이 훨씬 나쁘다).
 */
export function soloPlays(): Promise<SoloPlay[]> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetch('/apps/karmolab/data/games.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { games?: unknown[] } | null) => {
      const rows = Array.isArray(body?.games) ? body!.games!.filter(looksLikePlay) : [];
      cached = rows;
      return rows;
    })
    .catch(() => [] as SoloPlay[])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 앱 안에서 화면만 바꾸면 되는 자리인가 (`/karmolab/#<도구>`). 밖이면 그냥 링크로 둔다. */
export function inAppTool(url: string): string | null {
  const prefix = appHash('');
  return url.indexOf(prefix) === 0 ? url.slice(prefix.length) : null;
}
