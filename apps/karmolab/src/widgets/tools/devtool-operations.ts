/**
 * 개발 도구 작업대의 **조작들** (TASK-KL-257 / KL-256 첫 조각)
 *
 * 글 작업대(`text-operations.ts`)가 이미 증명한 모양을 그대로 옮긴다. 일 하나가 파일 하나가
 * 아니라 **데이터 한 줄**이다. 화면, 복사, 상태 줄은 작업대가 한 번만 그린다.
 * 실측(2026-08-16): 글은 일당 30줄, 개발 도구는 일당 185줄이었다.
 *
 * 옮길 때 지킨 것 하나. **주소 호출을 안 잃는다.** 개발 도구는 대부분 `?op=...&칸=값` 계약을
 * 이미 들고 있고(링크 공유, 에이전트 호출이 거기 걸려 있다), 합치면서 그게 조용히 죽으면
 * 줄인 것이 아니라 부순 것이다. 그래서 조작이 `fromUrl` 로 주소 값을 내 칸에 이렇게 넣어라를
 * 스스로 말한다.
 */
import type { TextOperation } from './shared/text-operation';
import { format, toDialect, type Dialect } from '../../core/sqlfmt';
import { format as xmlFormat, minify as xmlMinify, parse as xmlParse, toJson as xmlToJson, XmlError } from '../../core/xmlfmt';
import { convert as cfgConvert, detect as cfgDetect, type Format as CfgFormat } from '../../core/configconv';
import { detect as anyDetect, format as anyFormat, goTo as anyGoTo, minify as anyMinify } from '../../core/prettyall';
import { toTypes } from '../../core/json2ts';
import { format as jqFormat, query as jqQuery } from '../../core/jqplay';
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
      '한 줄로 눌린 SQL 을 읽히게 펴고, MySQL, PostgreSQL, SQL Server, SQLite 사이를 옮겨 줍니다'
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
      /* 바꾼 것을 **줄줄이 적어 준다**. 조용히 바꿔 주면 됐겠지 하고 그대로 돌리다 사고가 난다.
         작업대에는 결과칸 하나뿐이라 알림을 결과 위에 주석으로 얹는다(SQL 주석이라 그대로 돌아간다). */
      const head = convert && notes.length ? notes.map((n) => `-- ${n}`).join('\n') + '\n' : '';
      return {
        output: head + output,
        status: convert
          ? t('sqlfmt.status.converted', { from: LABEL[from], to: LABEL[to], n: lines }, `${LABEL[from]} → ${LABEL[to]}, ${lines}줄`)
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
  },
  {
    id: 'xmlfmt',
    title: t('widgets.xmlfmt.title', undefined, 'XML 다듬기'),
    description: t('widgets-desc.xmlfmt.desc', undefined, 'XML 을 펴고, 줄이고, JSON 으로 옮깁니다'),
    controls: [
      {
        id: 'job',
        label: t('xmlfmt.label.job', undefined, '할 일'),
        kind: 'select',
        initial: 'format',
        options: [
          { value: 'format', label: t('xmlfmt.btn.format', undefined, '펴기') },
          { value: 'minify', label: t('xmlfmt.btn.minify', undefined, '줄이기') },
          { value: 'toJson', label: t('xmlfmt.btn.json', undefined, 'JSON 으로') }
        ]
      },
      { id: 'indent', label: t('xmlfmt.label.indent', undefined, '들여쓰기'), kind: 'range', initial: 2, min: 0, max: 8 }
    ],
    run: (input, values) => {
      if (input.trim() === '') return { output: '', status: t('xmlfmt.status.idle', undefined, 'XML 을 넣어 주세요') };
      try {
        const nodes = xmlParse(input);
        const job = String(values.job);
        const output =
          job === 'minify'
            ? xmlMinify(nodes)
            : job === 'toJson'
              ? JSON.stringify(xmlToJson(nodes), null, 2)
              : xmlFormat(nodes, Math.max(0, Math.min(8, Number(values.indent) || 2)));
        return { output, status: t(`xmlfmt.status.${job}`, { lines: String(output.split('\n').length) }, `${output.split('\n').length}줄`) };
      } catch (e) {
        /* 옛 화면은 틀린 자리에 **커서를 옮겨** 줬다. 작업대에는 그 손이 없으므로 대신
           **몇 줄 몇 칸인지 글로** 말한다. 정보를 잃지 않는 것이 조용히 사라지는 것보다 낫다. */
        const where = e instanceof XmlError ? ` (${e.line}줄 ${e.col}칸)` : '';
        return { output: '', status: t('xmlfmt.status.bad', { msg: String((e as Error).message) }, String((e as Error).message)) + where };
      }
    },
    fromUrl: (call) => ({
      input: call.args.text === undefined ? undefined : String(call.args.text),
      values: {
        ...(call.op === 'minify' || call.op === 'toJson' || call.op === 'format' ? { job: call.op } : {}),
        ...(call.args.indent === undefined ? {} : { indent: Number(call.args.indent) })
      }
    })
  },
  {
    id: 'configconv',
    title: t('widgets.configconv.title', undefined, '설정 파일 옮기기'),
    description: t('widgets-desc.configconv.desc', undefined, 'JSON, YAML, TOML, env, properties 사이를 옮깁니다'),
    controls: [
      {
        id: 'to',
        label: t('configconv.label.to', undefined, '바꿀 꼴'),
        kind: 'select',
        initial: 'yaml',
        options: (['json', 'yaml', 'toml', 'env', 'properties'] as CfgFormat[]).map((value) => ({ value, label: value.toUpperCase() }))
      }
    ],
    run: (input, values) => {
      if (input.trim() === '') return { output: '', status: t('configconv.status.idle', undefined, '설정을 넣어 주세요') };
      const from = cfgDetect(input);
      const to = String(values.to) as CfgFormat;
      if (from === to) return { output: input, status: t('configconv.status.same', { kind: from.toUpperCase() }, `이미 ${from.toUpperCase()} 입니다`) };
      try {
        return {
          output: cfgConvert(input, to, from),
          status: t('configconv.status.ok', { from: from.toUpperCase(), to: to.toUpperCase() }, `${from.toUpperCase()} → ${to.toUpperCase()}`)
        };
      } catch (e) {
        return { output: '', status: t('configconv.status.bad', { msg: String((e as Error).message) }, String((e as Error).message)) };
      }
    },
    fromUrl: (call) => ({
      input: call.args.text === undefined ? undefined : String(call.args.text),
      values: (call.args.to === undefined ? {} : { to: String(call.args.to) }) as Record<string, string | number | boolean>
    })
  },
  {
    id: 'prettyall',
    title: t('widgets.prettyall.title', undefined, '아무거나 다듬기'),
    description: t('widgets-desc.prettyall.desc', undefined, '무엇을 넣었는지 스스로 알아보고 펴거나 줄입니다'),
    controls: [
      {
        id: 'job',
        label: t('prettyall.label.job', undefined, '할 일'),
        kind: 'select',
        initial: 'format',
        options: [
          { value: 'format', label: t('prettyall.btn.format', undefined, '펴기') },
          { value: 'minify', label: t('prettyall.btn.minify', undefined, '줄이기') }
        ]
      }
    ],
    run: (input, values) => {
      if (input.trim() === '') return { output: '', status: t('prettyall.status.idle', undefined, '아무거나 넣어 주세요') };
      const kind = anyDetect(input);
      /* 이 도구는 CSS, HTML 만 편다. 옛 화면은 그럴 때 **그 도구로 가기 단추**를 줬는데,
         작업대로 옮기며 그걸 떨어뜨렸다(실측: JSON 을 넣으면 빨간 말만 뜨고 길이 없었다).
         작업대 안에서는 같은 목록에 그 일이 있으므로 **어느 일로 가면 되는지 이름으로** 말한다. */
      const elsewhere = anyGoTo(kind);
      if (elsewhere) {
        return {
          output: '',
          status: t('prettyall.goTo', { kind: kind.toUpperCase() }, `${kind.toUpperCase()} 은 여기서 안 폅니다`) + ` → ${elsewhere} 일로 가세요`
        };
      }
      try {
        const pretty = String(values.job) !== 'minify';
        const output = pretty ? anyFormat(input, kind) : anyMinify(input, kind);
        const before = input.length;
        const after = output.length;
        return {
          output,
          status: pretty
            ? t('prettyall.status.formatted', { kind: kind.toUpperCase(), n: output.split('\n').length }, `${kind.toUpperCase()}, ${output.split('\n').length}줄`)
            : t('prettyall.status.minified', { before, after, cut: Math.max(0, Math.round((1 - after / Math.max(1, before)) * 100)) }, `${before} → ${after}자`)
        };
      } catch (e) {
        return { output: '', status: String((e as Error).message) };
      }
    },
    fromUrl: (call) => ({
      input: call.args.text === undefined ? undefined : String(call.args.text),
      values: (call.op === 'minify' ? { job: 'minify' } : {}) as Record<string, string | number | boolean>
    })
  },
  {
    id: 'json2ts',
    title: t('widgets.json2ts.title', undefined, 'JSON → 타입 선언'),
    description: t('widgets-desc.json2ts.desc', undefined, 'JSON 에서 TypeScript 인터페이스를 만듭니다. 배열은 모든 원소를 합쳐 봅니다'),
    controls: [{ id: 'name', label: t('json2ts.label.name', undefined, '이름'), kind: 'text', initial: 'Root' }],
    run: (input, values) => {
      if (input.trim() === '') return { output: '', status: t('json2ts.status.idle', undefined, 'JSON 을 넣어 주세요') };
      try {
        const made = toTypes(input, String(values.name || 'Root'));
        return { output: made.code, status: t('json2ts.say.done', { n: made.interfaces }, `인터페이스 ${made.interfaces}개`) };
      } catch (e) {
        return { output: '', status: t('json2ts.err.json', undefined, 'JSON 이 아닙니다: ') + (e as Error).message };
      }
    },
    fromUrl: (call) => ({
      input: call.args.text === undefined ? undefined : String(call.args.text),
      values: (call.args.name === undefined ? {} : { name: String(call.args.name) }) as Record<string, string | number | boolean>
    })
  },
  {
    id: 'jqplay',
    title: t('widgets.jqplay.title', undefined, 'JSON 살펴보기'),
    description: t('widgets-desc.jqplay.desc', undefined, 'jq 처럼 JSON 안을 골라 봅니다'),
    controls: [
      { id: 'query', label: t('jqplay.label.query', undefined, '고르는 말'), kind: 'text', initial: '.', placeholder: '.items[].name' },
      { id: 'compact', label: t('jqplay.opt.compact', undefined, '한 줄로'), kind: 'checkbox', initial: false }
    ],
    run: (input, values) => {
      if (input.trim() === '') return { output: '', status: t('jqplay.status.idle', undefined, 'JSON 을 넣어 주세요') };
      const got = jqQuery(input, String(values.query || '.'));
      if (got.error !== undefined) return { output: '', status: got.error };
      return {
        output: jqFormat(got.values, values.compact === true),
        status: t('jqplay.status.ok', { n: got.values.length }, `${got.values.length}개`)
      };
    },
    fromUrl: (call) => ({
      input: call.args.json === undefined ? undefined : String(call.args.json),
      values: (call.args.query === undefined ? {} : { query: String(call.args.query) }) as Record<string, string | number | boolean>
    })
  }
];
