/**
 * 영상 도구가 함께 쓰는 것들 (TASK-KL-088)
 *
 * `seekTo` 는 세 도구에 똑같이 복사돼 있었다. 그런데 이건 **한 번 사고를 낸 코드**다 —
 * 이미 그 시각에 가 있으면 「옮겼다」 신호가 오지 않아, 기다리기만 하면 도구가 오류도 없이 멈춘다.
 * 손잡이를 끌어 구간을 잡으면 그 자리를 미리 보여 주느라 이미 도착해 있으므로, 바로 이어서 누르면
 * 그 상황이 된다. 복사본이 셋이면 그 함정도 셋이고, 한 곳만 고치면 나머지가 조용히 남는다.
 * 그래서 한 곳으로 모았다.
 */

/**
 * 영상을 그 시각으로 옮기고, 옮겨질 때까지 기다린다.
 *
 * - 이미 도착해 있으면 **기다리지 않고 바로** 넘어간다 (신호가 오지 않기 때문)
 * - 신호가 끝내 안 와도 정해진 시간 뒤 진행한다 (영원히 멈추는 것보다 낫다)
 */
export function seekTo(video: HTMLVideoElement, time: number, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    const target = Math.min(Math.max(0, time), Math.max(0, dur - 0.02));
    if (Math.abs(video.currentTime - target) < 0.01) return resolve();
    let timer = 0;
    const done = (): void => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    timer = window.setTimeout(done, timeoutMs);
    video.currentTime = target;
  });
}

/**
 * 이 브라우저가 담을 수 있는 형식 중 가장 나은 것.
 * 아무것도 안 되면 빈 문자열 — 부르는 쪽이 기본값에 맡기면 된다.
 */
export function pickRecordType(): string {
  const wanted = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const t of wanted) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
