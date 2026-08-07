import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Hand } from '../hands';

/**
 * 이 컴퓨터에서 실제로 뭔가 하는 손들.
 *
 * 손은 위험하다. 그래서 **아무거나 실행하게 열어두지 않고 할 수 있는 일을 하나씩
 * 쥐여준다.** 되돌릴 수 없는 일은 사람에게 먼저 묻는다 — 물어보는 자리는 코드가 아니라
 * 화면이고, 여기서는 「물어봐야 한다」는 표시만 붙인다.
 */

export interface AskFirst {
  /** 사람에게 물어보고 답을 기다린다. 승낙이면 true. */
  confirm(what: string): Promise<boolean>;
}

/** 되돌리기 어려운 손을 감싼다 — 승낙 없이는 아무 일도 일어나지 않는다. */
export function needsPermission(hand: Hand, gate: AskFirst): Hand {
  return {
    name: hand.name,
    what: hand.what,
    needs: hand.needs,
    async run(argument: string): Promise<string> {
      const allowed = await gate.confirm(`${hand.name}: ${argument}`);
      if (allowed === false) return `${hand.name} 은(는) 하지 않았다 — 조수님이 아니라고 했다`;
      return hand.run(argument);
    },
  };
}

/** 파일 찾기 — 이름 조각으로 내 폴더들을 뒤진다. 읽기만 하므로 물어볼 것도 없다. */
export function findFileHand(roots?: readonly string[]): Hand {
  const places = roots ?? [
    join(homedir(), 'Desktop'),
    join(homedir(), 'Documents'),
    join(homedir(), 'Downloads'),
  ];
  return {
    name: '파일찾기',
    what: '이 사람 폴더에서 이름에 그 말이 든 파일을 찾는다',
    needs: '찾을 이름 조각',
    async run(argument: string): Promise<string> {
      const needle = argument.trim().toLowerCase();
      if (needle === '') throw new Error('무엇을 찾을지 안 알려줬다');
      const hits: string[] = [];

      const walk = (dir: string, depth: number) => {
        if (depth > 3 || hits.length >= 12) return;
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return; // 못 여는 폴더는 건너뛴다
        }
        for (const entry of entries) {
          if (hits.length >= 12) return;
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full, depth + 1);
          else if (entry.name.toLowerCase().includes(needle)) hits.push(full);
        }
      };

      for (const place of places) if (existsSync(place)) walk(place, 0);
      return hits.length === 0 ? `「${argument}」 는 못 찾았다` : `찾았다:\n${hits.join('\n')}`;
    },
  };
}

/**
 * 열기 — 파일이나 폴더, 주소를 연다.
 *
 * 여는 것은 되돌릴 수 있지만(닫으면 된다) 화면을 가로채는 일이라 승낙을 받는 쪽이 낫다.
 * 감싸는 건 부르는 쪽의 몫이다.
 */
export function openHand(): Hand {
  return {
    name: '열기',
    what: '파일·폴더·웹주소를 연다',
    needs: '열 것 (경로 또는 주소)',
    async run(argument: string): Promise<string> {
      const target = argument.trim();
      if (target === '') throw new Error('무엇을 열지 안 알려줬다');
      const looksLikeWeb = /^https?:\/\//i.test(target);
      if (looksLikeWeb === false && existsSync(target) === false) {
        throw new Error(`그런 것은 없다: ${target}`);
      }
      await new Promise<void>((resolve, reject) => {
        execFile('cmd', ['/c', 'start', '', target], { windowsHide: true }, (e) =>
          e ? reject(e) : resolve(),
        );
      });
      return `열었다: ${target}`;
    },
  };
}

/** 지금 무슨 창들이 떠 있나 — 보기만 한다. */
export function windowsHand(): Hand {
  return {
    name: '창목록',
    what: '지금 열려 있는 창들을 본다',
    needs: '(없음)',
    async run(): Promise<string> {
      // PowerShell 5.1 은 출력이 콘솔 코드페이지라 그대로 읽으면 한글이 깨진다.
      // 앞에 출력 인코딩을 UTF-8 로 박아야 Node 쪽 utf8 읽기와 맞는다.
      const out = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 15 -ExpandProperty MainWindowTitle",
        ],
        { timeout: 15_000, windowsHide: true, encoding: 'utf8' },
      );
      const titles = out.split('\n').map((l) => l.trim()).filter(Boolean);
      return titles.length === 0 ? '떠 있는 창이 없다' : `열려 있는 창:\n${titles.join('\n')}`;
    },
  };
}

/** 지금 몇 시고 무슨 요일인가 — 두뇌는 시계가 없다. */
export function clockHand(): Hand {
  return {
    name: '시계',
    what: '지금 시각과 날짜를 본다',
    needs: '(없음)',
    async run(): Promise<string> {
      const now = new Date();
      return now.toLocaleString('ko-KR', { dateStyle: 'full', timeStyle: 'short' });
    },
  };
}

/** 적어 둔 것 읽기 — 쓰기만 하고 못 읽으면 반쪽이다. */
export function readNotesHand(path: string): Hand {
  return {
    name: '적어둔것보기',
    what: '전에 적어 둔 것들을 읽는다',
    needs: '(없음)',
    async run(): Promise<string> {
      if (existsSync(path) === false) return '아직 적어 둔 게 없다';
      // **파일은 그냥 읽는다.** PowerShell 을 거치면 그 출력이 UTF-8 이 아니라서(콘솔
      // 코드페이지) 한글이 통째로 깨져 온다 — 실측(43회차)에서 손은 제대로 쓰였는데
      // 결과가 쓰레기라 두뇌가 820자 영어를 뱉었다. 남의 프로그램을 부를 이유가 없다.
      const body = readFileSync(path, 'utf8').split(/\r?\n/).slice(-15).join('\n').trim();
      return body === '' ? '아직 적어 둔 게 없다' : `적어 둔 것:\n${body}`;
    },
  };
}

/** 파일 크기·수정 시각 같은 것. */
export function fileInfoHand(): Hand {
  return {
    name: '파일정보',
    what: '파일이 언제 바뀌었고 얼마나 큰지 본다',
    needs: '파일 경로',
    async run(argument: string): Promise<string> {
      const target = argument.trim();
      if (existsSync(target) === false) throw new Error(`그런 파일은 없다: ${target}`);
      const info = statSync(target);
      const size = info.size < 1024 * 1024
        ? `${Math.round(info.size / 1024)}KB`
        : `${(info.size / 1024 / 1024).toFixed(1)}MB`;
      return `${target}\n크기 ${size} · 마지막 수정 ${info.mtime.toLocaleString('ko-KR')}`;
    },
  };
}
