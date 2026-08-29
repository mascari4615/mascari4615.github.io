/**
 * **여러 개를 돌릴 때**. 몇째인지 말하고, 실패한 것을 남기고, 그것만 다시 (TASK-KL-302)
 *
 * 실제 사이트(iLovePDF, CloudConvert 류)가 여러 파일을 다룰 때 공통으로 갖춘 것은 둘이다:
 * **지금 몇째인지**와 **실패한 것만 다시 돌리기**. 우리는 둘 다 없었다.
 *
 * 더 나쁜 것은 실패가 **조용히 사라지는** 모양이었다:
 *
 * ```
 * for (const f of files) { try { ... } catch { say('한 장 못 했어요') } }
 * say('18장 다 됐습니다')     ← 위의 말을 덮는다
 * ```
 *
 * 스무 장을 넣고 두 장이 실패하면 사람이 보는 것은 **18 이라는 숫자뿐**이다. 어느 것이 왜
 * 안 됐는지 알 길이 없고, 다시 하려면 스무 장을 통째로 다시 넣어야 한다.
 *
 * 그래서 도는 자리를 하나로 모은다. 여기를 쓰면 **말하는 것과 실패를 남기는 것이 공짜로** 붙는다.
 */

export interface BatchFail {
  file: File;
  why: string;
}

export interface BatchResult<T> {
  done: T[];
  failed: BatchFail[];
}

export interface BatchOpts {
  /** 상태 줄에 말하는 손잡이 (`shared/say` 의 것) */
  say: (msg: string, kind?: '' | 'ok' | 'error' | 'warn') => void;
  /** 3/20 장째 같은 말을 만든다. 없으면 수만 말한다. */
  progress?: (i: number, total: number, file: File) => string;
  /** 다 돈 뒤 성공만 있을 때의 말 */
  done?: (n: number) => string;
  /** 실패가 섞였을 때의 말. 이름을 반드시 넣는다 */
  partly?: (ok: number, failed: BatchFail[]) => string;
}

/**
 * 하나씩 돌리면서 **몇째인지 말하고**, 실패한 것은 **버리지 않고 모아** 돌려준다.
 *
 * 실패해도 멈추지 않는다. 스무 장 중 셋째가 깨졌다고 나머지 열일곱을 못 받는 건
 * 사람 입장에서 손해다. 대신 **끝말에 실패가 반드시 남는다**.
 */
export async function runBatch<T>(
  files: File[],
  each: (file: File, index: number) => Promise<T>,
  o: BatchOpts
): Promise<BatchResult<T>> {
  const done: T[] = [];
  const failed: BatchFail[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    /* 지금 몇째는 도는 동안 계속 바뀐다. 한 번만 말하고 마는 것과 체감이 다르다.
       특히 큰 파일에서는 이 말이 없으면 멈춘 것과 구분이 안 된다. */
    o.say(o.progress ? o.progress(i + 1, files.length, file) : `${i + 1}/${files.length}`);
    try {
      done.push(await each(file, i));
    } catch (e) {
      failed.push({ file, why: e instanceof Error ? e.message : String(e) });
    }
  }

  if (failed.length === 0) {
    o.say(o.done ? o.done(done.length) : `${done.length}개 다 됐습니다.`, 'ok');
  } else {
    /* 성공 개수만 말하면 실패는 **없던 일이 된다**. 반드시 이름을 남긴다 */
    o.say(
      o.partly
        ? o.partly(done.length, failed)
        : `${done.length}개 됐고, ${failed.length}개는 안 됩니다: ${failed.map((f) => f.file.name).join(', ')}`,
      failed.length === files.length ? 'error' : 'warn'
    );
  }
  return { done, failed };
}

/**
 * **실패한 것만 다시** 하는 단추를 그 자리에 붙인다.
 *
 * 실패가 없으면 아무것도 안 그린다(있다가 사라지는 자리를 만들지 않는다). 다시 눌러
 * 또 실패하면 그 목록으로 갈아 끼운다. 될 때까지 줄어드는 것이 보여야 한다.
 */
export function retryBar(
  host: HTMLElement,
  failed: BatchFail[],
  label: { retry: string; why: string },
  again: (files: File[]) => void
): void {
  host.innerHTML = '';
  if (!failed.length) {
    host.hidden = true;
    return;
  }
  host.hidden = false;

  const list = document.createElement('div');
  list.className = 'kl-batch-fails';
  list.textContent = failed.map((f) => `${f.file.name}. ${f.why || label.why}`).join('\n');
  host.appendChild(list);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost';
  btn.textContent = `${label.retry} (${failed.length})`;
  btn.onclick = (): void => again(failed.map((f) => f.file));
  host.appendChild(btn);

  once();
}

let styled = false;
function once(): void {
  if (styled) return;
  styled = true;
  const el = document.createElement('style');
  /* `[hidden]` 은 `display` 를 준 자리에서 안 먹는다. 여기서 같이 적는다 ([[TASK-KL-283]]) */
  el.textContent =
    '.kl-batch[hidden]{display:none;}' +
    '.kl-batch{display:flex;flex-direction:column;gap:6px;margin:8px 0;}' +
    '.kl-batch-fails{white-space:pre-wrap;font-size:12px;line-height:1.5;opacity:.85;}';
  document.head.appendChild(el);
}
