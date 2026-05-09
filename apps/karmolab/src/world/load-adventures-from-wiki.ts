/**
 * wiki/entities/adventures/{slug}.yaml + {slug}.md → KarmoWorld.entities.adventures + bindings.adventure
 *
 * KL-032 의 정수 (NPC 만남 / 장소 발견 / 주요 사건) 누적 entity. character 와 다른 흐름:
 * - 정본 = wiki 직접 (sync-wiki 흐름 밖, KL-032 한정 예외).
 * - 별 manifest = `_index.json` (적재 시 하나만 fetch, directory listing 회피).
 * - 갱신 = Tauri `adventure_commit_summary` (모험 종료 시 사용자 컨펌 후 commit).
 *
 * 시드: memo/projects/karmolab/tasks/TASK-KL-032-infinite-text-adventure.md
 */
(function (): void {
  function worldBaseUrl(): string {
    const s = document.currentScript as HTMLScriptElement | null;
    if (s && s.src) {
      try {
        const u = new URL(s.src);
        return u.origin + u.pathname.replace(/\/[^/]+$/, '/');
      } catch (_) {}
    }
    return (location.origin || '') + '/apps/karmolab/world/';
  }

  function indexUrl(base: string): string {
    return base + 'wiki/entities/adventures/_index.json';
  }

  function adventureMdUrl(base: string, slug: string): string {
    return base + 'wiki/entities/adventures/' + slug + '.md';
  }

  function adventureYamlUrl(base: string, slug: string): string {
    return base + 'wiki/entities/adventures/' + slug + '.yaml';
  }

  function str(v: unknown): string {
    return typeof v === 'string' ? v : v == null ? '' : String(v);
  }

  function metaToAdventure(slug: string, meta: Record<string, unknown>, body: string) {
    const tags: string[] = Array.isArray(meta.tags)
      ? meta.tags.map((t) => (typeof t === 'string' ? t : String(t)))
      : typeof meta.tags === 'string'
        ? [meta.tags]
        : [];
    const npcs: string[] = Array.isArray(meta.npcs)
      ? meta.npcs.map((n) => (typeof n === 'string' ? n : String(n)))
      : [];
    const places: string[] = Array.isArray(meta.places)
      ? meta.places.map((p) => (typeof p === 'string' ? p : String(p)))
      : [];
    const events: string[] = Array.isArray(meta.events)
      ? meta.events.map((e) => (typeof e === 'string' ? e : String(e)))
      : [];
    return {
      id: str(meta.entityId),
      slug: str(meta.slug) || slug,
      title: str(meta.title),
      oneLine: str(meta.oneLine),
      tags,
      npcs,
      places,
      events,
      startedAt: str(meta.startedAt),
      endedAt: str(meta.endedAt),
      summary: body.trim(),
    };
  }

  async function loadAll(): Promise<void> {
    const parseSplit = window.KarmoWorld?.parseMd?.parseCharacterWikiFromSplitFiles;
    if (typeof parseSplit !== 'function') {
      throw new Error('KarmoWorld.parseMd.parseCharacterWikiFromSplitFiles 없음');
    }

    const base = worldBaseUrl();
    const idxUrl = indexUrl(base);
    const rIdx = await fetch(idxUrl);
    if (!rIdx.ok) {
      // _index.json 미배포 = adventures 0개 (정상 케이스 — 첫 모험 commit 전).
      window.KarmoWorld = window.KarmoWorld || {};
      window.KarmoWorld.entities = window.KarmoWorld.entities || {};
      window.KarmoWorld.entities.adventures = {};
      window.KarmoWorld.bindings = window.KarmoWorld.bindings || {};
      window.KarmoWorld.bindings.adventure = { adventures: [] };
      return;
    }
    const indexData = (await rIdx.json()) as { adventures?: Array<{ slug: string }> };
    const slugs = (indexData.adventures ?? []).map((a) => a.slug).filter((s) => s);

    const adventures: Record<string, ReturnType<typeof metaToAdventure>> = {};
    const list: ReturnType<typeof metaToAdventure>[] = [];

    for (const slug of slugs) {
      const mdUrl = adventureMdUrl(base, slug);
      const yUrl = adventureYamlUrl(base, slug);
      const [rm, ry] = await Promise.all([fetch(mdUrl), fetch(yUrl)]);
      if (!rm.ok) {
        console.warn('[KarmoWorld] adventure md 로드 실패: ' + mdUrl);
        continue;
      }
      if (!ry.ok) {
        console.warn('[KarmoWorld] adventure yaml 로드 실패: ' + yUrl);
        continue;
      }
      const mdText = await rm.text();
      const yamlText = await ry.text();
      const { meta, body } = parseSplit(yamlText, mdText);
      const adv = metaToAdventure(slug, meta, body);
      adventures[slug] = adv;
      list.push(adv);
    }

    window.KarmoWorld = window.KarmoWorld || {};
    window.KarmoWorld.entities = window.KarmoWorld.entities || {};
    window.KarmoWorld.entities.adventures = adventures;
    window.KarmoWorld.bindings = window.KarmoWorld.bindings || {};
    window.KarmoWorld.bindings.adventure = { adventures: list };
  }

  window.KARMOLAB_WIDGET_LOADER_WAIT = window.KARMOLAB_WIDGET_LOADER_WAIT || [];
  const p = loadAll().catch((err: unknown) => {
    try {
      console.error('[KarmoWorld] wiki adventure 로드 실패', err);
    } catch (_) {}
  });
  window.KARMOLAB_WIDGET_LOADER_WAIT.push(p);
})();
