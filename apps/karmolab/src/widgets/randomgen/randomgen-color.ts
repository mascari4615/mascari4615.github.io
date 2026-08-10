/**
 * 랜덤 생성기 — 색상 hex 코드 (generator 전용)
 * randomgen-topics.js 로드 후 RANDOMGEN_TOPICS에 추가됨
 */
import { t } from '../../lib/i18n';

(function () {
  const topics = window.RANDOMGEN_TOPICS;
  if (!Array.isArray(topics)) return;

  function randHex(): string {
    return (
      '#' +
      Array.from({ length: 6 }, function () {
        return '0123456789abcdef'[Math.floor(Math.random() * 16)];
      }).join('')
    );
  }

  topics.push({
    id: 'color_hex',
    get label() { return t('randomgen.topic.color_hex.label'); },
    get group() { return t('randomgen.topic.color_hex.group'); },
    generator: randHex
  });
})();
