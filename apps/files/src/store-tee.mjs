/**
 * Drive 정본 + 선택 열람 저장(R2). 정본 put 실패는 올리고 끝.
 * 여분은 실패해도 정본을 되돌리지 않는다.
 */
export function teeStore(primary, extra) {
  return {
    async put(key, bytes) {
      await primary.put(key, bytes);
      if (!extra) return;
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
