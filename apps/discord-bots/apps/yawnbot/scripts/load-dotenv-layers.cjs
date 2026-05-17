'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/**
 * 욘봇·카카오 스크립트 공통 4-레이어 env 로더 (TASK-YB-028).
 *
 * 본질(민감도·가변성)대로 통로 분리. 뒤가 앞을 덮어씀:
 *   ① config/yawnbot-defaults.txt     — 불변·비밀 아님 (모델명/간격/임계값). override:false
 *   ② config/yawnbot.<env>.txt        — 비밀 아닌 env별 (채널/길드/유저 ID 등). 커밋(public). override:true
 *   ③ (.env 에 주입됨) 진짜 비밀만     — 토큰·API키·webhook URL. prod=GitHub secret→workflow가 .env 조립
 *   ④ .env                            — 머신 경로 + 로컬 override + ③ 주입분. override:true (최우선)
 *
 * <env> 판별 = YAWNBOT_ENV. profile 로드 *전*에 알아야 하므로
 * OS env → .env peek → defaults peek 순으로 먼저 resolve, 기본 'dev'(안전).
 * prod 는 deploy workflow 가 .env 에 `YAWNBOT_ENV=prod` 리터럴을 박음(비밀 아님).
 *
 * @param {string} yawnbotRoot - `apps/discord-bots/apps/yawnbot` 절대 경로
 */
function peekKey(absPath, key) {
  if (!fs.existsSync(absPath)) return undefined;
  try {
    const parsed = dotenv.parse(fs.readFileSync(absPath));
    return parsed[key] || undefined;
  } catch {
    return undefined;
  }
}

function resolveEnvName(yawnbotRoot) {
  if (process.env.YAWNBOT_ENV) return process.env.YAWNBOT_ENV.trim();
  const fromDotenv = peekKey(path.join(yawnbotRoot, '.env'), 'YAWNBOT_ENV');
  if (fromDotenv) return fromDotenv.trim();
  const fromDefaults = peekKey(
    path.join(yawnbotRoot, 'config', 'yawnbot-defaults.txt'),
    'YAWNBOT_ENV',
  );
  if (fromDefaults) return fromDefaults.trim();
  return 'dev';
}

function applyYawnbotDotenvLayers(yawnbotRoot) {
  const envName = resolveEnvName(yawnbotRoot);

  const files = [
    path.join(yawnbotRoot, 'config', 'yawnbot-defaults.txt'),
    path.join(yawnbotRoot, 'config', `yawnbot.${envName}.txt`),
    path.join(yawnbotRoot, '.env'),
  ];

  let seen = 0;
  for (const abs of files) {
    if (!fs.existsSync(abs)) continue;
    dotenv.config({ path: abs, override: seen > 0 });
    seen++;
  }
}

module.exports = { applyYawnbotDotenvLayers, resolveEnvName };
