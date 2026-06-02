/**
 * karmomap/index.ts — KarmoMap 위젯 엔트리 (TASK-KL-087).
 * IIFE + Toolbox.register (lexical).
 */

import { renderKarmomap } from './karmomap';

(function (): void {
  if (typeof Toolbox === 'undefined') return;
  const tb = Toolbox;

  tb.register({
    ...(tb.getLazyWidgetPublicMeta ? tb.getLazyWidgetPublicMeta('karmomap') : { id: 'karmomap' }),
    tabs: [
      {
        id: 'karmomap-main',
        label: 'KarmoMap',
        build(container: HTMLElement) {
          renderKarmomap(container);
        },
      },
    ],
  });
})();
