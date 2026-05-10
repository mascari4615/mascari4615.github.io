/**
 * webhook → Discord 채널 라우팅 설정.
 *
 * 파일: data/webhook-routes.json
 *   {
 *     "default": ["채널ID", ...],
 *     "routes": { "owner/repo": ["채널ID", ...] },
 *     "githubRepos": ["mascari4615/<repo>", ...],
 *     "localRoutes": { "<kind>": ["채널ID", ...] },
 *     "localDefault": ["채널ID", ...]
 *   }
 *
 * GitHub: payload.repository.full_name 이 `routes` 에 있으면 그 채널들로, 없으면 `default`.
 * Local (TASK-WM-087): payload.kind 가 `localRoutes` 에 있으면 그 채널들로, 없으면 `localDefault` → `default`.
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

export interface WebhookRoutes {
  default: string[];
  routes: Record<string, string[]>;
  /** scripts/tunnel-launcher.mjs 가 webhook 자동 등록 대상 repo 목록으로 사용. 봇 런타임은 무시. */
  githubRepos?: string[];
  /** 로컬 webhook (POST /webhook/local) kind 별 채널 매핑 (TASK-WM-087). */
  localRoutes?: Record<string, string[]>;
  /** 로컬 webhook 의 fallback 채널 (kind 매칭 실패 시). 비면 `default` 로 fallback. */
  localDefault?: string[];
}

const ROUTES_PATH = path.join(PKG_ROOT, 'data', 'webhook-routes.json');

let cached: WebhookRoutes | null = null;

function load(): WebhookRoutes {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(ROUTES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WebhookRoutes>;
    cached = {
      default: Array.isArray(parsed.default) ? parsed.default.filter((s) => typeof s === 'string') : [],
      routes:
        parsed.routes && typeof parsed.routes === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.routes).filter(
                ([, v]) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
              ),
            )
          : {},
      localRoutes:
        parsed.localRoutes && typeof parsed.localRoutes === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.localRoutes).filter(
                ([, v]) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
              ),
            )
          : {},
      localDefault: Array.isArray(parsed.localDefault)
        ? parsed.localDefault.filter((s) => typeof s === 'string')
        : [],
    };
  } catch (e: any) {
    console.warn(`[WebhookRoutes] ${ROUTES_PATH} 로드 실패 — 빈 라우팅으로 시작:`, e?.message ?? e);
    cached = { default: [], routes: {}, localRoutes: {}, localDefault: [] };
  }
  return cached;
}

/** repo full_name 매칭 채널, 없으면 default. */
export function getChannelsForRepo(fullName: string | null | undefined): string[] {
  const r = load();
  if (fullName && r.routes[fullName]?.length) return r.routes[fullName];
  return r.default;
}

/** 어떤 repo에도 묶이지 않는 메시지(예: 봇 시작 인사). */
export function getDefaultChannels(): string[] {
  return load().default;
}

/** GitHub 라우팅이 하나도 없는지(설정 미완료 경고용). */
export function hasAnyRoute(): boolean {
  const r = load();
  return r.default.length > 0 || Object.values(r.routes).some((arr) => arr.length > 0);
}

/**
 * 로컬 webhook (POST /webhook/local) — kind 매칭 채널 → localDefault → default 순.
 * TASK-WM-087.
 */
export function getLocalChannels(kind: string | null | undefined): string[] {
  const r = load();
  if (kind && r.localRoutes && r.localRoutes[kind]?.length) return r.localRoutes[kind];
  if (r.localDefault && r.localDefault.length > 0) return r.localDefault;
  return r.default;
}

/** 로컬 webhook 라우팅 (localRoutes / localDefault) 이 하나라도 박혀있는지 (default fallback 은 미고려). */
export function hasAnyLocalRoute(): boolean {
  const r = load();
  if (r.localRoutes && Object.values(r.localRoutes).some((arr) => arr.length > 0)) return true;
  if (r.localDefault && r.localDefault.length > 0) return true;
  return false;
}
