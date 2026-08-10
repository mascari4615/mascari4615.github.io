/**
 * 랜덤 생성기 — 시간·날짜 (generator 전용)
 * randomgen-topics.js 로드 후 RANDOMGEN_TOPICS에 추가됨
 */
import { t } from '../../lib/i18n';

(function () {
  const topics = window.RANDOMGEN_TOPICS;
  if (!Array.isArray(topics)) return;

  topics.push(
    {
      id: 'date',
      get label() { return t('randomgen.topic.date.label'); },
      get group() { return t('randomgen.topic.date.group'); },
      generator: function () {
        return t('randomgen.unit.day', { n: Math.floor(Math.random() * 31) + 1 });
      }
    },
    {
      id: 'time_24h',
      get label() { return t('randomgen.topic.time_24h.label'); },
      get group() { return t('randomgen.topic.time_24h.group'); },
      generator: function () {
        return (
          String(Math.floor(Math.random() * 24)).padStart(2, '0') +
          ':' +
          String(Math.floor(Math.random() * 60)).padStart(2, '0')
        );
      }
    }
  );
})();
