import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';

import type { Hand } from '../hands';

/**
 * 누르는 손. 화면에서 본 것을 실제로 만진다.
 *
 * 여기까지 오는 데 네 회차가 걸렸다. 104회차에 창 안을 **글자로** 읽고, 117회차에 요소마다
 * **무엇을 할 수 있는지**를 싣고, 119회차에 **어떻게 누를지**를 숫자로 정하고(폴백 없이
 * Invoke. LegacyIAccessible 은 108개 요소 중 0개였다), 120회차에 **번호**를 붙였다.
 * 이 손은 그 번호 하나를 받는다.
 *
 * **좌표로 안 누른다.** 컨트롤이 이미 내놓은 동작을 부른다. 창이 움직여도, 화면 배율이
 * 달라도 그대로 먹는다. 99회차에 배율 때문에 화면을 3분의 1만 찍고 있었던 걸 생각하면
 * 좌표는 우리에게 특히 나쁜 길이다.
 *
 * **되돌릴 수 없는 손이다**(`undoable: false`). 108, 109회차에 세운 관문을 그대로 탄다 . 
 * 사람이 응 하기 전에는 안 눌린다.
 */
export interface PressOptions {
  /** 실제로 누르는 일. 검사에서 갈아끼운다. */
  run?: (args: { number: number; expectName: string }) => Promise<string>;
}

export function pressHand(options: PressOptions = {}): Hand {
  const run = options.run ?? pressWithWindows;
  return {
    name: '누르기',
    what: '화면에서 본 것 중 하나를 실제로 누른다 (번호로 고른다)',
    needs: '누를 것의 번호. 3 또는 3 | 그 자리에 적힌 이름',
    feedsBack: true,
    /* 뜬 창은 우리가 못 닫고, 눌린 단추는 우리가 못 되돌린다. */
    undoable: false,
    async run(argument: string): Promise<string> {
      const asked = parsePress(argument);
      if (asked === null) {
        return '몇 번을 누를지 번호로 알려줘야 한다. 화면 목록의 [번호] 를 그대로 쓰면 된다.';
      }
      const said = await run(asked);
      return readPressed(said);
    },
  };
}

/** 3, 3 | 탭 닫기, [3] 탭 닫기 를 다 받는다. */
export function parsePress(argument: string): { number: number; expectName: string } | null {
  const text = String(argument ?? '').trim();
  const match = /^\[?(\d+)\]?\s*(?:[|:-]\s*)?(.*)$/.exec(text);
  if (match === null) return null;
  const number = Number(match[1]);
  if (Number.isInteger(number) === false || number <= 0) return null;
  return { number, expectName: (match[2] ?? '').trim() };
}

/**
 * 눌러 본 결과를 사람 말로.
 *
 * **못 누른 것을 조용히 넘기지 않는다.** 안 눌렀는데 눌렀다고 하면 그게 40회차에 관문을
 * 세운 이유(안 한 걸 했다고 말하기)와 같은 고장이다.
 */
export function readPressed(said: string): string {
  const line = String(said ?? '').trim();
  const ok = /PRESS=ok\s+how=(\S+)\s+name=(.*?)(?:\s+was=(.*?)\s+now=(.*?)\s+count=(\d+)>(\d+))?$/m.exec(line);
  if (ok !== null) {
    const how = ok[1] === 'Toggle' ? '켜고 껐다' : ok[1] === 'Select' ? '골랐다' : '눌렀다';
    const head = `${(ok[2] ?? '').trim()} 를 ${how}.`;
    /* **눌렀다와 됐다는 다른 말이다.**
       누르기 전후로 창 이름과 요소 수를 견줘, 무엇이 달라졌는지 같이 말한다. 안 달라졌으면
       그것도 말한다. 눌렀다고만 하면 안 한 걸 했다고 하는 셈이다(40회차 관문의 결).
       옛 형식(사후 조건 없음)도 그대로 받는다. */
    if (ok[3] === undefined) return head;
    const was = (ok[3] ?? '').trim();
    const now = (ok[4] ?? '').trim();
    const before = Number(ok[5]);
    const after = Number(ok[6]);
    const changes: string[] = [];
    if (was !== now) changes.push(`창 이름이 ${was} 에서 ${now} 로 바뀌었다`);
    if (before !== after) changes.push(`화면에 보이는 것이 ${before}개에서 ${after}개가 됐다`);
    return changes.length === 0
      ? `${head} 그런데 화면은 그대로다. 달라진 게 없다.`
      : `${head} ${changes.join(', ')}.`;
  }
  const moved = /PRESS=moved\s+expected=(.*?)\s+found=(.*)$/m.exec(line);
  if (moved !== null) {
    return `안 눌렀다. 그 자리에 있던 게 ${(moved[1] ?? '').trim()} 였는데 지금은 ${(moved[2] ?? '').trim()} 다. 화면이 바뀌었으니 다시 보고 골라야 한다.`;
  }
  const cannot = /PRESS=cannot\s+name=(.*?)\s+patterns=(.*)$/m.exec(line);
  if (cannot !== null) {
    return `${(cannot[1] ?? '').trim()} 는 못 누른다. 누를 수 있는 자리가 아니다.`;
  }
  if (/PRESS=no-element/.test(line)) return '그 번호짜리가 화면에 없다. 화면을 다시 보고 골라야 한다.';
  if (/PRESS=no-window/.test(line)) return '앞에 있는 창을 못 잡았다.';
  return `못 눌렀다. ${line.slice(0, 120)}`;
}

/** 실제로 누르는 자리. 창 하나에 대해 PowerShell 을 한 번 부른다. */
function pressWithWindows(args: { number: number; expectName: string }): Promise<string> {
  const script = join(dirname(__filename), '..', '..', 'assets', 'press-element.ps1');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
        '-Number', String(args.number),
        ...(args.expectName === '' ? [] : ['-ExpectName', args.expectName]),
      ],
      { timeout: 30_000, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        /* 실패해도 stdout 에 사연이 있다. 스크립트가 exit 1 로 나가면서도 PRESS= 줄을
           먼저 찍는다. 그걸 버리면 왜 안 눌렸는지가 사라진다. */
        const said = String(stdout ?? '').trim();
        if (said !== '') { resolve(said); return; }
        if (error) { reject(new Error((stderr || error.message).slice(0, 300))); return; }
        resolve('');
      },
    );
  });
}
