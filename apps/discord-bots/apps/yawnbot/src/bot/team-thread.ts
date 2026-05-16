/**
 * team-thread — 에이전트 임시 작업방 = Discord 스레드 (KAR-018-A sub-A-3, slice-6).
 *
 * 그릴-락 결정 3: 임시방 = 부모 텍스트채널 하위 스레드. threads.create /
 * auto-archive / 해체=archive. webhook = 부모채널 webhook + thread_id
 * (agent-webhook.sendAsSkin opts.threadId — assistant-handler 가 배선).
 * Manage Channels 불요(권한 표면↓), 네이티브 ephemerality.
 *
 * 방 = .active.json 에 스레드 id 로 코어 바인딩됨 → isTeamRoom(thread.id) true.
 * (채널 바인딩과 동일 메커니즘 — 평행 정의 0, 스레드 id 도 그냥 channelId.)
 */
import { ChannelType } from 'discord.js';
import type { TextChannel, ThreadChannel } from 'discord.js';
import type { CharacterService } from '../services/character-service';

/** 24h 무활동 자동 아카이브 (분). */
const ROOM_AUTO_ARCHIVE = 1440;

export interface SpawnedRoom {
  threadId: string;
  name: string;
  url: string;
}

/** 부모 텍스트채널 아래 임시 작업방(스레드) 생성 + 코어 바인딩 → 팀 방화. */
export async function spawnRoom(
  parent: TextChannel,
  name: string,
  core: string,
  cs: CharacterService,
): Promise<SpawnedRoom> {
  const thread = await parent.threads.create({
    name,
    autoArchiveDuration: ROOM_AUTO_ARCHIVE,
    type: ChannelType.PublicThread,
    reason: `KAR-018-A 임시 작업방 (core=${core})`,
  });
  cs.setChannelCore(thread.id, core);
  return { threadId: thread.id, name: thread.name, url: thread.url };
}

/** 기존 방(스레드)에 코어 배치/교체 (스킨 보존 = setChannelCore 시맨틱). */
export function inviteCore(threadId: string, core: string, cs: CharacterService): void {
  cs.setChannelCore(threadId, core);
}

/** 방 해체 = .active.json 엔트리 제거(팀 방 해제) + 스레드 아카이브. */
export async function dissolveRoom(
  thread: ThreadChannel,
  cs: CharacterService,
): Promise<void> {
  cs.resetChannel(thread.id);
  await thread.setArchived(true, 'KAR-018-A 방 해체');
}
