/* 자동 생성 — `node scripts/gen-core-tools.mjs`. 손으로 고치지 마라. */
import type { ToolRunner } from './types';

import { run as base64Run, spec as base64Spec } from './base64';
import { run as birthRun, spec as birthSpec } from './birth';
import { run as biznoRun, spec as biznoSpec } from './bizno';
import { run as chainRun, spec as chainSpec } from './chain';
import { run as charcountRun, spec as charcountSpec } from './charcount';
import { run as csvjsonRun, spec as csvjsonSpec } from './csvjson';
import { run as dailyRun, spec as dailySpec } from './daily';
import { run as dailychoRun, spec as dailychoSpec } from './dailycho';
import { run as dailytypeRun, spec as dailytypeSpec } from './dailytype';
import { run as datecalcRun, spec as datecalcSpec } from './datecalc';
import { run as epochRun, spec as epochSpec } from './epoch';
import { run as filehashRun, spec as filehashSpec } from './filehash';
import { run as gradeRun, spec as gradeSpec } from './grade';
import { run as hangulkeyRun, spec as hangulkeySpec } from './hangulkey';
import { run as hangultypeRun, spec as hangultypeSpec } from './hangultype';
import { run as hashgenRun, spec as hashgenSpec } from './hashgen';
import { run as interestRun, spec as interestSpec } from './interest';
import { run as jamoRun, spec as jamoSpec } from './jamo';
import { run as loanRun, spec as loanSpec } from './loan';
import { run as passgenRun, spec as passgenSpec } from './passgen';
import { run as qrgenRun, spec as qrgenSpec } from './qrgen';
import { run as tableconvRun, spec as tableconvSpec } from './tableconv';
import { run as timecalcRun, spec as timecalcSpec } from './timecalc';
import { run as unitconvRun, spec as unitconvSpec } from './unitconv';
import { run as uuidgenRun, spec as uuidgenSpec } from './uuidgen';
import { run as vatRun, spec as vatSpec } from './vat';
import { run as wordfreqRun, spec as wordfreqSpec } from './wordfreq';
import { run as workdaysRun, spec as workdaysSpec } from './workdays';
import { run as worldclockRun, spec as worldclockSpec } from './worldclock';

export interface CoreEntry {
  run: ToolRunner;
  ops: string[];
}

export const CORES: Record<string, CoreEntry> = {
  base64: { run: base64Run, ops: Object.keys(base64Spec.ops) },
  birth: { run: birthRun, ops: Object.keys(birthSpec.ops) },
  bizno: { run: biznoRun, ops: Object.keys(biznoSpec.ops) },
  chain: { run: chainRun, ops: Object.keys(chainSpec.ops) },
  charcount: { run: charcountRun, ops: Object.keys(charcountSpec.ops) },
  csvjson: { run: csvjsonRun, ops: Object.keys(csvjsonSpec.ops) },
  daily: { run: dailyRun, ops: Object.keys(dailySpec.ops) },
  dailycho: { run: dailychoRun, ops: Object.keys(dailychoSpec.ops) },
  dailytype: { run: dailytypeRun, ops: Object.keys(dailytypeSpec.ops) },
  datecalc: { run: datecalcRun, ops: Object.keys(datecalcSpec.ops) },
  epoch: { run: epochRun, ops: Object.keys(epochSpec.ops) },
  filehash: { run: filehashRun, ops: Object.keys(filehashSpec.ops) },
  grade: { run: gradeRun, ops: Object.keys(gradeSpec.ops) },
  hangulkey: { run: hangulkeyRun, ops: Object.keys(hangulkeySpec.ops) },
  hangultype: { run: hangultypeRun, ops: Object.keys(hangultypeSpec.ops) },
  hashgen: { run: hashgenRun, ops: Object.keys(hashgenSpec.ops) },
  interest: { run: interestRun, ops: Object.keys(interestSpec.ops) },
  jamo: { run: jamoRun, ops: Object.keys(jamoSpec.ops) },
  loan: { run: loanRun, ops: Object.keys(loanSpec.ops) },
  passgen: { run: passgenRun, ops: Object.keys(passgenSpec.ops) },
  qrgen: { run: qrgenRun, ops: Object.keys(qrgenSpec.ops) },
  tableconv: { run: tableconvRun, ops: Object.keys(tableconvSpec.ops) },
  timecalc: { run: timecalcRun, ops: Object.keys(timecalcSpec.ops) },
  unitconv: { run: unitconvRun, ops: Object.keys(unitconvSpec.ops) },
  uuidgen: { run: uuidgenRun, ops: Object.keys(uuidgenSpec.ops) },
  vat: { run: vatRun, ops: Object.keys(vatSpec.ops) },
  wordfreq: { run: wordfreqRun, ops: Object.keys(wordfreqSpec.ops) },
  workdays: { run: workdaysRun, ops: Object.keys(workdaysSpec.ops) },
  worldclock: { run: worldclockRun, ops: Object.keys(worldclockSpec.ops) },
};
