/* 자동 생성 — `node scripts/gen-core-tools.mjs`. 손으로 고치지 마라. */
import type { ToolRunner } from './types';

import { run as apidiffRun, spec as apidiffSpec } from './apidiff';
import { run as apitestRun, spec as apitestSpec } from './apitest';
import { run as base64Run, spec as base64Spec } from './base64';
import { run as bgremoveRun, spec as bgremoveSpec } from './bgremove';
import { run as birthRun, spec as birthSpec } from './birth';
import { run as biznoRun, spec as biznoSpec } from './bizno';
import { run as bundlemapRun, spec as bundlemapSpec } from './bundlemap';
import { run as certviewRun, spec as certviewSpec } from './certview';
import { run as chainRun, spec as chainSpec } from './chain';
import { run as charconvRun, spec as charconvSpec } from './charconv';
import { run as charcountRun, spec as charcountSpec } from './charcount';
import { run as codegraphRun, spec as codegraphSpec } from './codegraph';
import { run as configconvRun, spec as configconvSpec } from './configconv';
import { run as cspRun, spec as cspSpec } from './csp';
import { run as csvjsonRun, spec as csvjsonSpec } from './csvjson';
import { run as curlkitRun, spec as curlkitSpec } from './curlkit';
import { run as dailyRun, spec as dailySpec } from './daily';
import { run as dailychoRun, spec as dailychoSpec } from './dailycho';
import { run as dailytypeRun, spec as dailytypeSpec } from './dailytype';
import { run as datecalcRun, spec as datecalcSpec } from './datecalc';
import { run as diffRun, spec as diffSpec } from './diff';
import { run as docscanRun, spec as docscanSpec } from './docscan';
import { run as dupphotoRun, spec as dupphotoSpec } from './dupphoto';
import { run as dutchpayRun, spec as dutchpaySpec } from './dutchpay';
import { run as encdetectiveRun, spec as encdetectiveSpec } from './encdetective';
import { run as epochRun, spec as epochSpec } from './epoch';
import { run as erdRun, spec as erdSpec } from './erd';
import { run as exifRun, spec as exifSpec } from './exif';
import { run as filehashRun, spec as filehashSpec } from './filehash';
import { run as gitundoRun, spec as gitundoSpec } from './gitundo';
import { run as gradeRun, spec as gradeSpec } from './grade';
import { run as hangulkeyRun, spec as hangulkeySpec } from './hangulkey';
import { run as hangultypeRun, spec as hangultypeSpec } from './hangultype';
import { run as hashgenRun, spec as hashgenSpec } from './hashgen';
import { run as idphotoRun, spec as idphotoSpec } from './idphoto';
import { run as interestRun, spec as interestSpec } from './interest';
import { run as jamoRun, spec as jamoSpec } from './jamo';
import { run as jqplayRun, spec as jqplaySpec } from './jqplay';
import { run as json2tsRun, spec as json2tsSpec } from './json2ts';
import { run as livecountRun, spec as livecountSpec } from './livecount';
import { run as loanRun, spec as loanSpec } from './loan';
import { run as logviewRun, spec as logviewSpec } from './logview';
import { run as mermaidliteRun, spec as mermaidliteSpec } from './mermaidlite';
import { run as mesh3dRun, spec as mesh3dSpec } from './mesh3d';
import { run as mockdataRun, spec as mockdataSpec } from './mockdata';
import { run as nettoolRun, spec as nettoolSpec } from './nettool';
import { run as ocrRun, spec as ocrSpec } from './ocr';
import { run as passgenRun, spec as passgenSpec } from './passgen';
import { run as payslipRun, spec as payslipSpec } from './payslip';
import { run as pdf2textRun, spec as pdf2textSpec } from './pdf2text';
import { run as pdftoolRun, spec as pdftoolSpec } from './pdftool';
import { run as pemRun, spec as pemSpec } from './pem';
import { run as photomapRun, spec as photomapSpec } from './photomap';
import { run as prettyallRun, spec as prettyallSpec } from './prettyall';
import { run as printkitRun, spec as printkitSpec } from './printkit';
import { run as protobufRun, spec as protobufSpec } from './protobuf';
import { run as qrgenRun, spec as qrgenSpec } from './qrgen';
import { run as regexplainRun, spec as regexplainSpec } from './regexplain';
import { run as semverRun, spec as semverSpec } from './semver';
import { run as sqlfmtRun, spec as sqlfmtSpec } from './sqlfmt';
import { run as sshkeyRun, spec as sshkeySpec } from './sshkey';
import { run as tableconvRun, spec as tableconvSpec } from './tableconv';
import { run as territoryRun, spec as territorySpec } from './territory';
import { run as timecalcRun, spec as timecalcSpec } from './timecalc';
import { run as ttsRun, spec as ttsSpec } from './tts';
import { run as unicodexRun, spec as unicodexSpec } from './unicodex';
import { run as unitconvRun, spec as unitconvSpec } from './unitconv';
import { run as uuidgenRun, spec as uuidgenSpec } from './uuidgen';
import { run as vatRun, spec as vatSpec } from './vat';
import { run as wordfreqRun, spec as wordfreqSpec } from './wordfreq';
import { run as workdaysRun, spec as workdaysSpec } from './workdays';
import { run as worldclockRun, spec as worldclockSpec } from './worldclock';
import { run as xmlfmtRun, spec as xmlfmtSpec } from './xmlfmt';
import { run as ziptoolRun, spec as ziptoolSpec } from './ziptool';

export interface CoreEntry {
  run: ToolRunner;
  ops: string[];
}

export const CORES: Record<string, CoreEntry> = {
  apidiff: { run: apidiffRun, ops: Object.keys(apidiffSpec.ops) },
  apitest: { run: apitestRun, ops: Object.keys(apitestSpec.ops) },
  base64: { run: base64Run, ops: Object.keys(base64Spec.ops) },
  bgremove: { run: bgremoveRun, ops: Object.keys(bgremoveSpec.ops) },
  birth: { run: birthRun, ops: Object.keys(birthSpec.ops) },
  bizno: { run: biznoRun, ops: Object.keys(biznoSpec.ops) },
  bundlemap: { run: bundlemapRun, ops: Object.keys(bundlemapSpec.ops) },
  certview: { run: certviewRun, ops: Object.keys(certviewSpec.ops) },
  chain: { run: chainRun, ops: Object.keys(chainSpec.ops) },
  charconv: { run: charconvRun, ops: Object.keys(charconvSpec.ops) },
  charcount: { run: charcountRun, ops: Object.keys(charcountSpec.ops) },
  codegraph: { run: codegraphRun, ops: Object.keys(codegraphSpec.ops) },
  configconv: { run: configconvRun, ops: Object.keys(configconvSpec.ops) },
  csp: { run: cspRun, ops: Object.keys(cspSpec.ops) },
  csvjson: { run: csvjsonRun, ops: Object.keys(csvjsonSpec.ops) },
  curlkit: { run: curlkitRun, ops: Object.keys(curlkitSpec.ops) },
  daily: { run: dailyRun, ops: Object.keys(dailySpec.ops) },
  dailycho: { run: dailychoRun, ops: Object.keys(dailychoSpec.ops) },
  dailytype: { run: dailytypeRun, ops: Object.keys(dailytypeSpec.ops) },
  datecalc: { run: datecalcRun, ops: Object.keys(datecalcSpec.ops) },
  diff: { run: diffRun, ops: Object.keys(diffSpec.ops) },
  docscan: { run: docscanRun, ops: Object.keys(docscanSpec.ops) },
  dupphoto: { run: dupphotoRun, ops: Object.keys(dupphotoSpec.ops) },
  dutchpay: { run: dutchpayRun, ops: Object.keys(dutchpaySpec.ops) },
  encdetective: { run: encdetectiveRun, ops: Object.keys(encdetectiveSpec.ops) },
  epoch: { run: epochRun, ops: Object.keys(epochSpec.ops) },
  erd: { run: erdRun, ops: Object.keys(erdSpec.ops) },
  exif: { run: exifRun, ops: Object.keys(exifSpec.ops) },
  filehash: { run: filehashRun, ops: Object.keys(filehashSpec.ops) },
  gitundo: { run: gitundoRun, ops: Object.keys(gitundoSpec.ops) },
  grade: { run: gradeRun, ops: Object.keys(gradeSpec.ops) },
  hangulkey: { run: hangulkeyRun, ops: Object.keys(hangulkeySpec.ops) },
  hangultype: { run: hangultypeRun, ops: Object.keys(hangultypeSpec.ops) },
  hashgen: { run: hashgenRun, ops: Object.keys(hashgenSpec.ops) },
  idphoto: { run: idphotoRun, ops: Object.keys(idphotoSpec.ops) },
  interest: { run: interestRun, ops: Object.keys(interestSpec.ops) },
  jamo: { run: jamoRun, ops: Object.keys(jamoSpec.ops) },
  jqplay: { run: jqplayRun, ops: Object.keys(jqplaySpec.ops) },
  json2ts: { run: json2tsRun, ops: Object.keys(json2tsSpec.ops) },
  livecount: { run: livecountRun, ops: Object.keys(livecountSpec.ops) },
  loan: { run: loanRun, ops: Object.keys(loanSpec.ops) },
  logview: { run: logviewRun, ops: Object.keys(logviewSpec.ops) },
  mermaidlite: { run: mermaidliteRun, ops: Object.keys(mermaidliteSpec.ops) },
  mesh3d: { run: mesh3dRun, ops: Object.keys(mesh3dSpec.ops) },
  mockdata: { run: mockdataRun, ops: Object.keys(mockdataSpec.ops) },
  nettool: { run: nettoolRun, ops: Object.keys(nettoolSpec.ops) },
  ocr: { run: ocrRun, ops: Object.keys(ocrSpec.ops) },
  passgen: { run: passgenRun, ops: Object.keys(passgenSpec.ops) },
  payslip: { run: payslipRun, ops: Object.keys(payslipSpec.ops) },
  pdf2text: { run: pdf2textRun, ops: Object.keys(pdf2textSpec.ops) },
  pdftool: { run: pdftoolRun, ops: Object.keys(pdftoolSpec.ops) },
  pem: { run: pemRun, ops: Object.keys(pemSpec.ops) },
  photomap: { run: photomapRun, ops: Object.keys(photomapSpec.ops) },
  prettyall: { run: prettyallRun, ops: Object.keys(prettyallSpec.ops) },
  printkit: { run: printkitRun, ops: Object.keys(printkitSpec.ops) },
  protobuf: { run: protobufRun, ops: Object.keys(protobufSpec.ops) },
  qrgen: { run: qrgenRun, ops: Object.keys(qrgenSpec.ops) },
  regexplain: { run: regexplainRun, ops: Object.keys(regexplainSpec.ops) },
  semver: { run: semverRun, ops: Object.keys(semverSpec.ops) },
  sqlfmt: { run: sqlfmtRun, ops: Object.keys(sqlfmtSpec.ops) },
  sshkey: { run: sshkeyRun, ops: Object.keys(sshkeySpec.ops) },
  tableconv: { run: tableconvRun, ops: Object.keys(tableconvSpec.ops) },
  territory: { run: territoryRun, ops: Object.keys(territorySpec.ops) },
  timecalc: { run: timecalcRun, ops: Object.keys(timecalcSpec.ops) },
  tts: { run: ttsRun, ops: Object.keys(ttsSpec.ops) },
  unicodex: { run: unicodexRun, ops: Object.keys(unicodexSpec.ops) },
  unitconv: { run: unitconvRun, ops: Object.keys(unitconvSpec.ops) },
  uuidgen: { run: uuidgenRun, ops: Object.keys(uuidgenSpec.ops) },
  vat: { run: vatRun, ops: Object.keys(vatSpec.ops) },
  wordfreq: { run: wordfreqRun, ops: Object.keys(wordfreqSpec.ops) },
  workdays: { run: workdaysRun, ops: Object.keys(workdaysSpec.ops) },
  worldclock: { run: worldclockRun, ops: Object.keys(worldclockSpec.ops) },
  xmlfmt: { run: xmlfmtRun, ops: Object.keys(xmlfmtSpec.ops) },
  ziptool: { run: ziptoolRun, ops: Object.keys(ziptoolSpec.ops) },
};
