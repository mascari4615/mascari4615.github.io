/**
 * 배포된 뒤 오늘 만든 도구가 실제로 살아 있는지 한 번에 본다 (TASK-KL-088)
 *
 * 배포가 오래 막혀 열다섯 개가 한꺼번에 나간다. 그럴 때 하나씩 눌러 보는 건 놓치기 쉽다.
 * 페이지가 뜨는지(200)뿐 아니라 **화면이 실제로 그려지는지**까지 본다 — 200 인데 빈 화면이던
 * 사고가 이미 있었다.
 *
 * 사용: node scripts/verify-tonight.mjs
 */
import { execFileSync } from 'node:child_process';

const TOOLS = [
  'video2gif', 'videotrim', 'videocompress', 'video2img', 'video2audio', 'screenrec',
  'voicerec', 'videotool', 'pdfcompress', 'pdf2text', 'pdfsign', 'text2pdf',
  'audiolevel', 'exifclean', 'filesplit'
];

console.log(`[verify-tonight] ${TOOLS.length}개 도구 페이지를 확인합니다…`);
execFileSync('node', ['scripts/smoke-live-pages.mjs', ...TOOLS], { stdio: 'inherit' });
console.log('[verify-tonight] 모두 살아 있습니다');
