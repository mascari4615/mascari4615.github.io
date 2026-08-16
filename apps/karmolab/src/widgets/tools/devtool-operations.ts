/**
 * 개발 도구 작업대의 **조작들** (TASK-KL-257 / KL-256 첫 조각)
 *
 * 글 작업대(`text-operations.ts`)가 이미 증명한 모양을 그대로 옮긴다 — 일 하나가 파일 하나가
 * 아니라 **데이터 한 줄**이다. 화면·복사·상태 줄은 작업대가 한 번만 그린다.
 * 실측(2026-08-16): 글은 일당 30줄, 개발 도구는 일당 185줄이었다.
 *
 * 옮길 때 지킨 것 하나 — **주소 호출을 안 잃는다.** 개발 도구는 대부분 `?op=...&칸=값` 계약을
 * 이미 들고 있고(링크 공유·에이전트 호출이 거기 걸려 있다), 합치면서 그게 조용히 죽으면
 * 줄인 것이 아니라 부순 것이다. 그래서 조작이 `fromUrl` 로 「주소 값을 내 칸에 이렇게 넣어라」를
 * 스스로 말한다.
 */
import type { TextOperation } from './shared/text-operation';
import { format, toDialect, type Dialect } from '../../core/sqlfmt';
import { t } from '../../lib/i18n';

const DIALECTS: Dialect[] = ['mysql', 'postgres', 'mssql', 'sqlite'];
const LABEL: Record<Dialect, string> = { mysql: 'MySQL', postgres: 'PostgreSQL', mssql: 'SQL Server', sqlite: 'SQLite' };
const dialectOptions = DIALECTS.map((value) => ({ value, label: LABEL[value] }));

export const DEVTOOL_OPERATIONS: TextOperation[] = [
  {
    id: 'sqlfmt',
    title: t('widgets.sqlfmt.title', undefined, 'SQL 다듬기'),
    description: t(
      'widgets-desc.sqlfmt.desc',
      undefined,
      '한 줄로 눌린 SQL 을 읽히게 펴고, MySQL·PostgreSQL·SQL Server·SQLite 사이를 옮겨 줍니다'
    ),
    controls: [
      { id: 'upper', label: t('sqlfmt.opt.upper', undefined, '예약어 대문자'), kind: 'checkbox', initial: true },
      { id: 'convert', label: t('sqlfmt.opt.convert', undefined, '말 바꾸기'), kind: 'checkbox', initial: false },
      { id: 'from', label: t('sqlfmt.label.from', undefined, '원래 말'), kind: 'select', initial: 'mysql', options: dialectOptions },
      { id: 'to', label: t('sqlfmt.label.to', undefined, '바꿀 말'), kind: 'select', initial: 'postgres', options: dialectOptions }
    ],
    run: (input, values) => {
      if (input.trim() === '') return { output: '', status: t('sqlfmt.status.idle', undefined, 'SQL 을 넣어 주세요') };
      const convert = values.convert === true;
      const from = String(values.from) as Dialect;
      const to = String(values.to) as Dialect;
      let body = input;
      let notes: string[] = [];
      if (convert) {
        const got = toDialect(input, from, to);
        body = got.sql;
        notes = got.notes;
      }
      const output = format(body, { upper: values.upper === true });
      const lines = output.split('\n').length;
      /* 바꾼 것을 **줄줄이 적어 준다** — 조용히 바꿔 주면 「됐겠지」 하고 그대로 돌리다 사고가 난다.
         작업대에는 결과칸 하나뿐이라 알림을 결과 위에 주석으로 얹는다(SQL 주석이라 그대로 돌아간다). */
      const head = convert && notes.length ? notes.map((n) => `-- ${n}`).join('\n') + '\n' : '';
      return {
        output: head + output,
        status: convert
          ? t('sqlfmt.status.converted', { from: LABEL[from], to: LABEL[to], n: lines }, `${LABEL[from]} → ${LABEL[to]} · ${lines}줄`)
          : t('sqlfmt.status.ok', { n: lines }, `${lines}줄`)
      };
    },
    fromUrl: (call) => ({
      input: call.args.sql === undefined ? undefined : String(call.args.sql),
      values: {
        ...(call.op === 'dialect' ? { convert: true } : {}),
        ...(call.args.from === undefined ? {} : { from: String(call.args.from) }),
        ...(call.args.to === undefined ? {} : { to: String(call.args.to) }),
        ...(call.args.upper === undefined ? {} : { upper: call.args.upper === true })
      }
    })
  }
];
