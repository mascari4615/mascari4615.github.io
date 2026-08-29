/**
 * 커밋 안의 파일 여러 개를 **git 한 번으로** 읽기 (2026-08-29 실측)
 *
 * `git show <ref>:./<경로>` 를 파일마다 부르면 파일 수만큼 프로세스. 윈도우에서 git 한 번이
 * 400ms 라 도구 163개면 그것만 71초. `check-input-names` 가 그 모양이었고 게이트 판의
 * 꼬리(277초)
 *
 * `git cat-file --batch` 는 읽을 이름을 표준입력으로 받아 **한 프로세스에서** 전부 돌려줌.
 * 돌려주는 꼴은 이름마다 `<sha> <종류> <바이트수>` 한 줄, 그다음 그 바이트, 그다음 줄바꿈.
 * 그 커밋에 없는 이름은 `<물어본 것> missing` 한 줄뿐 (여기서는 빼고 담음)
 *
 * 판정 불변. 읽는 자리와 내용이 `git show` 와 같고, 못 읽는 경우도 같이 없음
 */
import { execFileSync } from 'node:child_process';

/**
 * @param {string} cwd 어느 폴더 기준으로 물어보나 (경로는 이 폴더 기준)
 * @param {string} ref 커밋
 * @param {string[]} relPaths 이 폴더 기준 경로들
 * @param {object} env git 에게 줄 환경 (부르는 쪽이 GIT_DIR 따위를 이미 걷어낸 것)
 * @returns {Map<string, string>} 읽힌 것만. 그 커밋에 없는 이름은 안 담김
 */
export function readBlobsAtRef(cwd, ref, relPaths, env = process.env) {
  const out = new Map();
  if (!relPaths.length) return out;
  const query = relPaths.map((p) => `${ref}:./${p}`).join(String.fromCharCode(10)) + String.fromCharCode(10);
  const buf = execFileSync('git', ['cat-file', '--batch'], {
    cwd,
    env,
    input: query,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore']
  });
  const NL = 10;
  let at = 0;
  for (const rel of relPaths) {
    if (at >= buf.length) break;
    const lineEnd = buf.indexOf(NL, at);
    if (lineEnd === -1) break;
    const header = buf.toString('utf8', at, lineEnd);
    at = lineEnd + 1;
    // 없는 이름은 내용이 안 따라옴, 머리글 한 줄만 넘기기
    if (/ (missing|ambiguous)$/.test(header)) continue;
    const size = Number(header.split(' ').pop());
    if (!Number.isFinite(size)) break; // 낯선 모양 = 멈추고 부르는 쪽이 디스크로
    out.set(rel, buf.toString('utf8', at, at + size));
    at += size + 1; // 내용 뒤 줄바꿈 한 개
  }
  return out;
}
