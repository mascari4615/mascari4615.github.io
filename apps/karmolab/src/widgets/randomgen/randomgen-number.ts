/**
 * 랜덤 생성기 — 숫자·나이 (generator 전용)
 * randomgen-topics.js 로드 후 RANDOMGEN_TOPICS에 추가됨
 */
import { t } from '../../lib/i18n';

(function () {
  const topics = window.RANDOMGEN_TOPICS;
  if (!Array.isArray(topics)) return;

  topics.push(
    {
      id: 'number_1_10',
      get label() { return t('randomgen.topic.number_1_10.label'); },
      get group() { return t('randomgen.topic.number_1_10.group'); },
      generator: function () {
        return String(Math.floor(Math.random() * 10) + 1);
      }
    },
    {
      id: 'number_1_100',
      get label() { return t('randomgen.topic.number_1_100.label'); },
      get group() { return t('randomgen.topic.number_1_100.group'); },
      generator: function () {
        return String(Math.floor(Math.random() * 100) + 1);
      }
    },
    {
      id: 'age',
      get label() { return t('randomgen.topic.age.label'); },
      get group() { return t('randomgen.topic.age.group'); },
      generator: function () {
        return t('randomgen.unit.age', { n: Math.floor(Math.random() * 100) + 1 });
      }
    }
  );
})();
