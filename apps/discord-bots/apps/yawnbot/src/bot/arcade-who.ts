/**
 * 등급전의 나. 로그인한 계정 하나 (change.arcade-online 4번)
 *
 * - 등급전은 **로그인 필수** (사용자 결정 2026-08-31). 점수가 붙는 자리라 신원이 하나여야 함
 * - 신원은 KarmoLab 계정. 디스코드와 패스키가 이미 있고 세션 쿠키(`kl_session`)로 옴
 * - 게스트 열쇠는 폐기. 기기마다 다른 사람이 되어 점수를 옮길 길이 따로 필요했음
 *
 * 도감, 우물, 오늘의 판과 같은 꼴로 쿠키를 여기서 다시 읽음. 공유 파일에 안 묶이는 쪽이
 * 서로를 안 끌고 옴
 */
import type { Request } from 'express';
import { getKarmolabAccountStore, type KarmolabAccountStore } from '../services/karmolab-accounts';

export interface Who {
  /** 서버가 쓰는 사람 id. 점수와 패보가 이걸로 붙는다 */
  id: string;
  /** 남에게 보이는 이름 */
  handle: string;
}

/** 요청 하나를 사람으로 옮기는 손. 검사는 여기에 가짜를 끼운다 */
export type WhoOf = (req: Request) => Who | null;

/** 이 요청은 누구인가. 로그인 안 했으면 없음 */
export function whoOf(req: Request, accounts: KarmolabAccountStore = getKarmolabAccountStore()): Who | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== 'kl_session') continue;
    const account = accounts.accountForSession(decodeURIComponent(rest.join('=')));
    return account ? { id: account.id, handle: account.handle } : null;
  }
  return null;
}
