/**
 * 반드시 다른 앱 모듈보다 먼저 import 되어야 .env 가 process.env 에 반영됨.
 * (그렇지 않으면 voice-connection 등이 모듈 로드 시점에 VOICE_DEBUG 를 읽어 항상 꺼짐)
 *
 * 로드 순서(존재하는 파일만, 뒤가 앞을 덮어씀 — TASK-YB-028 4-레이어):
 *   1) `packages/karmolab-ai/.env`     (공통 AI 키 — AI_SURFACE, API 키, Vertex 자격증명)
 *   2) `config/yawnbot-defaults.txt`   (① 불변·비밀 아닌 기본값, 커밋)
 *   3) `config/yawnbot.<env>.txt`      (② 비밀 아닌 env별 값, 커밋 — <env>=YAWNBOT_ENV|dev)
 *   4) `.env`                          (④ 머신 경로 + 로컬 override + ③ 주입 비밀, 최우선)
 */
import path from 'path';
import { createRequire } from 'node:module';
import { loadKarmoLabAIEnv } from 'karmolab-ai/node';

// 1. 공통 AI 키
loadKarmoLabAIEnv();

const nodeRequire = createRequire(__filename);
const { applyYawnbotDotenvLayers } = nodeRequire(
  path.join(__dirname, '..', '..', 'scripts', 'load-dotenv-layers.cjs'),
) as { applyYawnbotDotenvLayers: (root: string) => void };

const yawnbotRoot = path.join(__dirname, '..', '..');
// 2. yawnbot-defaults.txt + 3. yawnbot .env
applyYawnbotDotenvLayers(yawnbotRoot);
