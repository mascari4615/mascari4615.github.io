/**
 * Drive 정본 + 선택 열람 저장(R2). 정본 put 실패는 올리고 끝.
 * 여분은 실패해도 정본을 되돌리지 않는다.
 *
 * `allowExtra` 는 값 상한 (mirror-budget). 거절되면 여분만 건너뛴다.
 * 정본은 그대로 간다. 파일이 사라지는 것보다 화면에서 못 보는 편이 낫다.
 */
export function teeStore(primary, extra, opts = {}) {
  const allowExtra = opts.allowExtra ?? (() => true);
  return {
    async put(key, bytes) {
      await primary.put(key, bytes);
      if (!extra) return;
      if (!allowExtra(key, bytes.length)) return;
      try {
        await extra.put(key, bytes);
      } catch {
        /* 열람 저장 실패는 다음 청크에서 다시 */
      }
    },
    async get(key) {
      return primary.get(key);
    },
  };
}
