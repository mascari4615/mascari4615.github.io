import type { Brain, ChatPart, ThinkInput } from '../types';

const PREVIEW_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">' +
      '<rect width="320" height="180" rx="16" fill="#16141f"/>' +
      '<text x="160" y="96" text-anchor="middle" fill="#f3b4c8" font-size="22" font-family="Segoe UI,sans-serif">preview</text>' +
    '</svg>',
  );

/**
 * 창을 띄워 채팅 칸을 눈으로 확인하는 두뇌.
 *
 * 바깥 모델을 안 부른다. 말 조각, 도구 카드, 그림을 같은 길로 흘린다.
 */
export function previewBrain(): Brain {
  return {
    name: 'preview',
    async think(input: ThinkInput): Promise<string> {
      return `들었어요. ${input.sensation.text}`;
    },
    async thinkStream(input, onDelta, onPart) {
      const say = async (chunk: string) => {
        onDelta(chunk);
        await wait(30);
      };
      await say('파일부터 볼게. ');
      emit(onPart, { kind: 'tool', id: 'read-1', name: 'read_file', status: 'start', detail: 'src/index.ts' });
      await wait(40);
      emit(onPart, { kind: 'tool', id: 'read-1', name: 'read_file', status: 'done', detail: '42줄' });
      emit(onPart, { kind: 'image', src: PREVIEW_IMAGE, alt: '미리보기' });
      await say(`그래서 이렇게 손보면 돼. ![미리보기](${PREVIEW_IMAGE})`);
      return `파일부터 볼게. 그래서 이렇게 손보면 돼. ![미리보기](${PREVIEW_IMAGE})`;
    },
  };
}

function emit(onPart: ((part: ChatPart) => void) | undefined, part: ChatPart): void {
  onPart?.(part);
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
