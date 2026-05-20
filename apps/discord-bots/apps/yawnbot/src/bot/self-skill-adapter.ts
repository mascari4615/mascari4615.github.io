/**
 * self-skill-adapter — 자가개선 자기 트랙 어댑터 (KAR-018-F slice-2).
 *
 * substrate⊥어댑터(⓪'): self-skill.ts(순수 행동평가) ↔ 실 시나리오 실행/
 * archive/escalate/roster write 사이. 평행정의0 — sub-C·D 어댑터 재사용:
 *  · archive = sub-C `appendArchive`(improvement-archive/<date>.jsonl)
 *  · escalate = sub-D `appendApproval`+`hasPending`(pending) + `NotifyFn`
 *  · accept → roster.skills 추가 = 기본 core.md writer + DI override
 */
import fs from 'fs';
import path from 'path';
import {
  evaluateSkill,
  toSkillArchiveLine,
  type SkillProposal,
  type SkillEvalResults,
  type SkillVerdict,
} from './self-skill';
import { appendArchive } from './self-improve-adapter';
import {
  appendApproval,
  hasPending,
  defaultNotify,
  type NotifyFn,
} from './governance-adapter';

/** 회귀 시나리오 셋 실행 (DI — 테스트 mock, 배선은 실 러너 주입). */
export type ScenarioRunner = (
  meta: SkillProposal,
) => Promise<SkillEvalResults>;

/** accept 시 core.md frontmatter skills 추가 (DI — core.md authoring=sub-E). */
export type ApplyRosterSkill = (meta: SkillProposal) => Promise<void>;

export interface SelfSkillDeps {
  env: NodeJS.ProcessEnv;
  runScenarios: ScenarioRunner;
  notify?: NotifyFn;
  applyRosterSkill?: ApplyRosterSkill;
}

export interface SelfSkillOutcome {
  verdict: SkillVerdict;
  rosterApplied: boolean;
}

const SAFE_CORE_ID = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_SKILL_NAME = /^[a-z0-9][a-z0-9._/-]{0,80}$/i;

function memoRoot(env: NodeJS.ProcessEnv): string {
  return env.MEMO_REPO_PATH?.trim() || '';
}

function parseInlineList(raw: string): string[] | null {
  const t = raw.trim();
  if (t === '[]') return [];
  const m = /^\[(.*)\]$/.exec(t);
  if (!m) return null;
  const body = m[1].trim();
  if (!body) return [];
  return body
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function formatInlineList(values: string[]): string {
  return `[${values.join(', ')}]`;
}

/**
 * LT-13: 검증된 자기 스킬을 실제 코어 frontmatter `skills` 에 멱등
 * 반영한다. YAML 전체 파서 도입 없이 기존 core.md inline-list 관례만
 * 다룬다. 낯선 형식은 false 로 보류해 코어 파일을 망가뜨리지 않는다.
 */
export function applyRosterSkillToCore(
  env: NodeJS.ProcessEnv,
  meta: SkillProposal,
): boolean {
  const root = memoRoot(env);
  const coreId = meta.coreId.trim();
  const skillName = meta.name.trim();
  if (!root || !SAFE_CORE_ID.test(coreId) || !SAFE_SKILL_NAME.test(skillName)) {
    return false;
  }
  const filePath = path.join(root, '.claude', 'agents', coreId, 'core.md');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const nl = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/);
    if (lines[0]?.trim() !== '---') return false;
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        end = i;
        break;
      }
    }
    if (end < 0) return false;

    let skillsLine = -1;
    for (let i = 1; i < end; i++) {
      if (/^skills\s*:/.test(lines[i])) {
        skillsLine = i;
        break;
      }
    }

    if (skillsLine < 0) {
      lines.splice(end, 0, `skills: ${formatInlineList([skillName])}`);
      fs.writeFileSync(filePath, lines.join(nl), 'utf-8');
      return true;
    }

    const currentRaw = lines[skillsLine].slice(lines[skillsLine].indexOf(':') + 1);
    const current = parseInlineList(currentRaw);
    if (!current) return false;
    if (current.includes(skillName)) return true;
    current.push(skillName);
    lines[skillsLine] = `skills: ${formatInlineList(current)}`;
    fs.writeFileSync(filePath, lines.join(nl), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 스킬 propose 1건 처리 (parent ②'): 시나리오 실행 → evaluateSkill(순수 DGM)
 * → archive(3 verdict 다, sub-C 재사용) → accept=roster.skills 추가+notify /
 * escalate=sub-D pending+#team-bus(⑤ 사람 승인) / reject=폐기 notify.
 */
export async function runSelfSkill(
  meta: SkillProposal,
  deps: SelfSkillDeps,
): Promise<SelfSkillOutcome> {
  const results = await deps.runScenarios(meta);
  const verdict = evaluateSkill(meta, results);
  appendArchive(deps.env, toSkillArchiveLine(verdict.entry));

  const notify = deps.notify ?? defaultNotify(deps.env);

  if (verdict.kind === 'reject') {
    notify(`스킬 reject: ${meta.id}(${meta.name}) — ${verdict.reason} (폐기)`);
    return { verdict, rosterApplied: false };
  }

  if (verdict.kind === 'escalate') {
    // ⑤ persona-core 수정 = sub-D risk-tag escalate 경로 재사용 (중복 억제)
    if (!hasPending(deps.env, meta.id)) {
      appendApproval(deps.env, {
        ts: new Date().toISOString(),
        objId: meta.id,
        core: meta.coreId,
        status: 'pending',
        reason: verdict.reason,
      });
      notify(
        `⚠ 스킬 ${meta.id}(${meta.name}) persona-core 수정 — 사람 승인 대기: ${verdict.reason}`,
      );
    }
    return { verdict, rosterApplied: false };
  }

  // accept → roster.skills 추가. DI override 가 없으면 기본 core.md writer.
  let rosterApplied = false;
  try {
    if (deps.applyRosterSkill) {
      await deps.applyRosterSkill(meta);
      rosterApplied = true;
    } else {
      rosterApplied = applyRosterSkillToCore(deps.env, meta);
    }
  } catch (e) {
    notify(
      `스킬 ${meta.id} accept 했으나 roster 적용 실패: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return { verdict, rosterApplied: false };
  }
  notify(
    `스킬 accept: ${meta.id}(${meta.name}) → roster.skills ${
      rosterApplied ? '추가' : '적용 보류(core.md 부재·형식 불일치)'
    }`,
  );
  return { verdict, rosterApplied };
}
