/**
 * CharacterService — 캐릭터 카드 로드 및 활성 매핑 관리
 *
 * memo/characters/<slug>/card.md : YAML frontmatter + 시스템 프롬프트 본문
 * memo/characters/.active.json   : { default, channels: { [channelKey]: slug } }
 *
 * channelKey 컨벤션: DM은 "dm:<userId>", 그 외는 Discord 채널 ID.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface CharacterCard {
  slug: string;
  name: string;
  displayName: string;
  tone?: string;
  speechStyle?: string;
  imageStyle?: string;
  negativePrompt?: string;
  relationship?: string;
  frontmatter: Record<string, string>;
  body: string;
  raw: string;
  dir: string;
}

/** 코어/스킨 2-층 바인딩 (KAR-018-A). core=null = 레거시 skin-only. */
interface Binding {
  core: string | null;
  skin: string;
}

interface ActiveConfig {
  default: Binding;
  channels: Record<string, Binding>;
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[m[1]] = value;
  }
  return { data, body: match[2].replace(/^\s+/, '') };
}

export class CharacterService {
  // 경로 순회 공격 방지: 소문자·숫자·-·_ 조합, 첫 글자는 알파벳/숫자
  private static readonly SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

  private memoRepoPath: string;
  private charactersDir: string;
  private activeConfigPath: string;
  private cardCache = new Map<string, CharacterCard>();
  private activeCache: ActiveConfig | null = null;
  private fallbackDefault: string;
  private dirty = false;

  constructor(memoRepoPath: string, fallbackDefault: string = 'yawn') {
    this.memoRepoPath = memoRepoPath;
    this.charactersDir = path.join(memoRepoPath, 'characters');
    this.activeConfigPath = path.join(this.charactersDir, '.active.json');
    this.fallbackDefault = fallbackDefault;
  }

  initialize(): void {
    if (!fs.existsSync(this.charactersDir)) {
      fs.mkdirSync(this.charactersDir, { recursive: true });
    }
    if (!fs.existsSync(this.activeConfigPath)) {
      // 신규 파일 = 레거시 호환 형태(string default). _readActive 가 Binding 으로 정규화.
      fs.writeFileSync(
        this.activeConfigPath,
        JSON.stringify({ default: this.fallbackDefault, channels: {} }, null, 2) + '\n',
        'utf-8',
      );
    }
    const available = this.listCharacters();
    console.log(
      `[Character] 초기화 완료 (${available.length}개 카드: ${available.join(', ') || '없음'})`,
    );
  }

  // ── 슬러그 유효성 검사 ──────────────────────────────────

  private static assertSlug(slug: string): void {
    if (!CharacterService.SLUG_RE.test(slug)) {
      throw new Error(
        `유효하지 않은 슬러그: "${slug}" (소문자·숫자·-·_ 조합, 알파벳/숫자로 시작)`,
      );
    }
  }

  // ── 카드 로드 ────────────────────────────────────────────

  loadCard(slug: string): CharacterCard | null {
    const cached = this.cardCache.get(slug);
    if (cached) return cached;
    return this._readCard(slug);
  }

  /** 캐시 무시하고 다시 읽음 (switch 시 편집 반영) */
  reloadCard(slug: string): CharacterCard | null {
    this.cardCache.delete(slug);
    return this._readCard(slug);
  }

  private _readCard(slug: string): CharacterCard | null {
    CharacterService.assertSlug(slug);
    const dir = path.join(this.charactersDir, slug);
    const cardPath = path.join(dir, 'card.md');
    if (!fs.existsSync(cardPath)) return null;
    try {
      const raw = fs.readFileSync(cardPath, 'utf-8');
      const { data, body } = parseFrontmatter(raw);
      if (!body.trim()) {
        console.warn(`[Character] ${slug}: 본문이 비어 있어 로드 실패`);
        return null;
      }
      const card: CharacterCard = {
        slug,
        name: data.name || slug,
        displayName: data.display_name || data.name || slug,
        tone: data.tone,
        speechStyle: data.speech_style,
        imageStyle: data.image_style,
        negativePrompt: data.negative_prompt || undefined,
        relationship: data.relationship,
        frontmatter: data,
        body: body.trim(),
        raw,
        dir,
      };
      this.cardCache.set(slug, card);
      return card;
    } catch (e: unknown) {
      console.warn(
        `[Character] ${slug} 로드 실패:`,
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  }

  /** card.md 가 있는 하위 디렉토리를 유효 슬러그로 반환 */
  listCharacters(): string[] {
    if (!fs.existsSync(this.charactersDir)) return [];
    return fs
      .readdirSync(this.charactersDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .filter((slug) =>
        fs.existsSync(path.join(this.charactersDir, slug, 'card.md')),
      )
      .sort();
  }

  // ── active config ───────────────────────────────────────

  private _readActive(): ActiveConfig {
    if (this.activeCache) return this.activeCache;
    try {
      if (fs.existsSync(this.activeConfigPath)) {
        const raw = fs.readFileSync(this.activeConfigPath, 'utf-8');
        const parsed = JSON.parse(raw);
        // 하위호환: 값이 string = 레거시 skin-only / { core, skin } = 3-튜플(KAR-018-A).
        const toBinding = (v: unknown): Binding | null => {
          if (typeof v === 'string') return { core: null, skin: v };
          if (v && typeof v === 'object') {
            const o = v as { core?: unknown; skin?: unknown };
            if (typeof o.skin === 'string') {
              return { core: typeof o.core === 'string' ? o.core : null, skin: o.skin };
            }
          }
          return null;
        };
        const rawChannels =
          parsed.channels && typeof parsed.channels === 'object' ? parsed.channels : {};
        const channels: Record<string, Binding> = {};
        for (const [key, val] of Object.entries(rawChannels)) {
          const b = toBinding(val);
          if (b) channels[key] = b;
        }
        this.activeCache = {
          default:
            toBinding(parsed.default) ?? { core: null, skin: this.fallbackDefault },
          channels,
        };
        return this.activeCache;
      }
    } catch (e: unknown) {
      console.warn(
        '[Character] .active.json 파싱 실패:',
        e instanceof Error ? e.message : e,
      );
    }
    this.activeCache = { default: { core: null, skin: this.fallbackDefault }, channels: {} };
    return this.activeCache;
  }

  private _writeActive(cfg: ActiveConfig): void {
    this.activeCache = cfg;
    this.dirty = true;
    // back-compat 직렬화: core 없으면 레거시 string, 있으면 { core, skin }.
    const ser = (b: Binding): string | { core: string; skin: string } =>
      b.core ? { core: b.core, skin: b.skin } : b.skin;
    const out = {
      default: ser(cfg.default),
      channels: Object.fromEntries(
        Object.entries(cfg.channels).map(([k, b]) => [k, ser(b)]),
      ),
    };
    fs.writeFileSync(
      this.activeConfigPath,
      JSON.stringify(out, null, 2) + '\n',
      'utf-8',
    );
  }

  /**
   * 채널 전환 등으로 .active.json 이 변경됐으면 git commit.
   * main.ts SIGINT 핸들러에서 호출.
   */
  commitIfDirty(): void {
    if (!this.dirty) return;
    try {
      execSync(
        `git -C "${this.memoRepoPath}" add characters/.active.json`,
        { stdio: 'pipe' },
      );
      execSync(
        `git -C "${this.memoRepoPath}" commit -m "chore: .active.json 채널-캐릭터 매핑 업데이트"`,
        { stdio: 'pipe' },
      );
      this.dirty = false;
      console.log('[Character] .active.json 변경 사항 커밋 완료');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('nothing to commit')) {
        this.dirty = false;
      } else {
        console.warn('[Character] .active.json commit 실패:', msg);
      }
    }
  }

  getDefaultSlug(): string {
    return this._readActive().default.skin;
  }

  /** channelKey가 매핑에 있으면 그 스킨 슬러그, 없으면 default 스킨 */
  resolveSlug(channelKey: string | null | undefined): string {
    const cfg = this._readActive();
    if (channelKey && cfg.channels[channelKey]) return cfg.channels[channelKey].skin;
    return cfg.default.skin;
  }

  /** channelKey 의 코어 id (채널 미지정 시 default.core, 없으면 null) — KAR-018-A */
  resolveCore(channelKey: string | null | undefined): string | null {
    const cfg = this._readActive();
    if (channelKey && cfg.channels[channelKey]) return cfg.channels[channelKey].core;
    return cfg.default.core;
  }

  resolveCard(channelKey: string | null | undefined): CharacterCard | null {
    return this.loadCard(this.resolveSlug(channelKey));
  }

  setChannelSlug(channelKey: string, slug: string): void {
    CharacterService.assertSlug(slug);
    if (!this.loadCard(slug)) {
      const available = this.listCharacters().join(', ') || '없음';
      throw new Error(`캐릭터를 찾을 수 없음: ${slug} (사용 가능: ${available})`);
    }
    const cfg = this._readActive();
    const prev = cfg.channels[channelKey];
    cfg.channels = {
      ...cfg.channels,
      [channelKey]: { core: prev?.core ?? null, skin: slug },
    };
    // switch 시 카드 편집 반영 (캐시 무효화)
    this.reloadCard(slug);
    this._writeActive(cfg);
  }

  /**
   * channelKey 에 코어+스킨 동시 바인딩 (KAR-018-V 라벨 추종 근본).
   * setChannelCore 와 달리 스킨도 명시 — 프로비저닝이 채널 id 를 바꿔도
   * 부팅 시 *현 provisioned 라벨 채널*에 atlas 를 다시 박아 "에이전트
   * 사라짐" 영구 차단. 동일 바인딩이면 write 생략(불필요 git 변경 X).
   */
  bindChannel(channelKey: string, core: string, skin: string): void {
    const cfg = this._readActive();
    const prev = cfg.channels[channelKey];
    if (prev && prev.core === core && prev.skin === skin) return;
    cfg.channels = { ...cfg.channels, [channelKey]: { core, skin } };
    this._writeActive(cfg);
  }

  /** channelKey 의 코어만 설정(스킨 보존). core=null = 코어 해제. KAR-018-A */
  setChannelCore(channelKey: string, core: string | null): void {
    const cfg = this._readActive();
    const prev = cfg.channels[channelKey];
    const skin = prev?.skin ?? cfg.default.skin;
    cfg.channels = { ...cfg.channels, [channelKey]: { core, skin } };
    this._writeActive(cfg);
  }

  resetChannel(channelKey: string): boolean {
    const cfg = this._readActive();
    if (!(channelKey in cfg.channels)) return false;
    const next = { ...cfg.channels };
    delete next[channelKey];
    cfg.channels = next;
    this._writeActive(cfg);
    return true;
  }

  getChannelMapping(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this._readActive().channels).map(([k, b]) => [k, b.skin]),
    );
  }

  /** DM/채널 공통 key 생성 helper */
  static channelKey(opts: { isDM: boolean; userId: string; channelId: string }): string {
    return opts.isDM ? `dm:${opts.userId}` : opts.channelId;
  }
}
