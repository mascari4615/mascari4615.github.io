/**
 * agent-cadence-skin — 스킨 카드에서 페르소나 정보 읽기.
 * 외부 cadence 상태 의존 없음 → circular dep 0.
 */
import fs from 'fs';
import path from 'path';
import { loadCoreDef } from '../services/agent-core';

/**
 * 코어의 default_skin card.md 에서 tone·speech_style 을 읽어 LLM 힌트로 반환.
 * 실패 시 null (optional 이라 voice 프롬프트 생략 — graceful).
 */
export function loadSkinPersona(
  memoRoot: string,
  coreId: string,
): string | null {
  try {
    const cd = loadCoreDef(memoRoot, coreId);
    if (!cd?.defaultSkin) return null;
    const slug = cd.defaultSkin.trim().replace(/[^a-z0-9_-]/gi, '');
    if (!slug) return null;
    const raw = fs.readFileSync(
      path.join(memoRoot, 'characters', slug, 'card.md'),
      'utf-8',
    );
    const tone = raw.match(/^tone:\s*(.+)$/m)?.[1]?.trim() || '';
    const style = raw.match(/^speech_style:\s*(.+)$/m)?.[1]?.trim() || '';
    const name =
      raw.match(/^display_name:\s*(.+)$/m)?.[1]?.trim() ||
      raw.match(/^name:\s*(.+)$/m)?.[1]?.trim() ||
      slug;
    const parts = [name, tone, style].filter(Boolean);
    return parts.length ? parts.join(' | ') : null;
  } catch {
    return null;
  }
}

/** 카드 전체 본문(프론트매터 제외) — 페르소나 전문 컨텍스트용. */
export function loadSkinCardBody(
  memoRoot: string,
  coreId: string,
): string | null {
  try {
    const cd = loadCoreDef(memoRoot, coreId);
    if (!cd?.defaultSkin) return null;
    const slug = cd.defaultSkin.trim().replace(/[^a-z0-9_-]/gi, '');
    if (!slug) return null;
    const raw = fs.readFileSync(
      path.join(memoRoot, 'characters', slug, 'card.md'),
      'utf-8',
    );
    const body = raw.match(/^---[\s\S]*?---\r?\n?([\s\S]*)$/)?.[1]?.trim();
    return body || null;
  } catch {
    return null;
  }
}
