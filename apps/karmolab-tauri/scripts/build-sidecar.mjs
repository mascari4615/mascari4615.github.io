// KL-052-B — ML sidecar(karmolab-life-ml) 빌드 + Tauri externalBin 배치.
//
// Tauri sidecar 규칙: tauri.conf.json `bundle.externalBin: ["binaries/karmolab-life-ml"]`
// → 빌드/dev 시 `src-tauri/binaries/karmolab-life-ml-{target-triple}{ext}` 필요.
// 본 스크립트가 cargo workspace 멤버 sidecar 를 빌드 후 그 위치로 복사.
//
// tauri.conf.json 의 beforeDevCommand / beforeBuildCommand 가 호출 (dev=debug,
// build=--release). 크로스플랫폼 — triple 은 `rustc -vV` host 에서 동적 추출.
//
// 정본: TASK-KL-052 § 작업 단계 KL-052-B / src-tauri-ml/PROTOCOL.md.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// sidecar = ML stack(candle Whisper / xcap / tesseract). debug 빌드는
// candle 행렬연산이 release 대비 수십배 느려 transcribe 가 분 단위 →
// 사실상 사용 불가 (KL-052-B3 발현: dev debug → VoiceRecordStop 120s
// timeout). 따라서 dev/build 무관 **항상 release** — debug 선택지 자체가
// 실수 여지라 제거. 메인 src-tauri 는 dev=debug 유지(UI/IPC 가벼움,
// KL-051 "tauri dev 속도 그대로" — 별 crate 라 sidecar release 와 무관).
const release = true;
const here = dirname(fileURLToPath(import.meta.url));
const tauriDir = join(here, ".."); // apps/karmolab-tauri
const srcTauri = join(tauriDir, "src-tauri");

// target triple — rustc -vV 의 `host: ` 라인 (rustc --print host-tuple 은
// 1.84+ 전용이라 호환 위해 -vV 파싱).
const rustcOut = execSync("rustc -vV", { encoding: "utf8" });
const hostLine = rustcOut.split("\n").find((l) => l.startsWith("host:"));
if (!hostLine) {
  console.error("[build-sidecar] rustc -vV 에서 host triple 추출 실패");
  process.exit(1);
}
const triple = hostLine.replace("host:", "").trim();
const exe = process.platform === "win32" ? ".exe" : "";

const profile = release ? "release" : "debug";
console.log(
  `[build-sidecar] cargo build${release ? " --release" : ""} -p karmolab-ml-sidecar (triple=${triple})`,
);

// cargo workspace 멤버 빌드. CARGO_TARGET_DIR 미설정 시 워크스페이스 기본
// target/ 사용 (단일 lockfile — KL-052-A). cwd = src-tauri (멤버 컨텍스트).
execSync(
  `cargo build${release ? " --release" : ""} -p karmolab-ml-sidecar`,
  { cwd: srcTauri, stdio: "inherit" },
);

// workspace target — Cargo.toml [workspace] 루트(apps/karmolab-tauri) 기준.
// KL-052 워크스페이스 전환 후 단일 target 은 워크스페이스 루트(tauriDir)에
// 생성됨 (멤버 cwd 무관). 옛 `srcTauri/target` 은 부재 → CI clean checkout
// 에서 "빌드 산출물 없음" 실패 (KL-064 발견: Cargo.lock·sidecar스텝에 이은
// 동일 계열 마이그 stale 경로 3번째. 로컬은 pre-workspace 잔존 target 으로
// 우연히 통과해 미발견).
const targetRoot = process.env.CARGO_TARGET_DIR
  ? process.env.CARGO_TARGET_DIR
  : join(tauriDir, "target");
const built = join(targetRoot, profile, `karmolab-life-ml${exe}`);
if (!existsSync(built)) {
  console.error(`[build-sidecar] 빌드 산출물 없음: ${built}`);
  process.exit(1);
}

const binariesDir = join(srcTauri, "binaries");
mkdirSync(binariesDir, { recursive: true });
const dest = join(binariesDir, `karmolab-life-ml-${triple}${exe}`);
copyFileSync(built, dest);
console.log(`[build-sidecar] 배치 완료: ${dest}`);
