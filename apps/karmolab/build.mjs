/**
 * Emit browser scripts from src/ into js/ (mirrors paths under src/), and src/world → ../world/ (wiki loaders).
 * - Most entries: bundle + iife (type-only imports resolve).
 * - mdd.ts / gemini.ts / toolbox.ts: bundle false + esm so top-level globals stay visible (no extra IIFE).
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

await esbuild.build({
  entryPoints: [join(root, 'src/mdd.ts')],
  outfile: join(root, 'js/mdd.js'),
  bundle: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

await esbuild.build({
  entryPoints: [join(root, 'src/gemini.ts')],
  outfile: join(root, 'js/gemini.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info',
  // Entry has no exports; tree-shaking can strip the Gemini/ImageDB IIFEs after adding an import.
  treeShaking: false
});

await esbuild.build({
  entryPoints: [join(root, 'src/toolbox.ts')],
  outfile: join(root, 'js/toolbox.js'),
  bundle: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

// 계측 (TASK-KL-088) — 셸이 defer 로 먼저 로드해 toolbox 가 쓸 수 있게.
await esbuild.build({
  entryPoints: [join(root, 'src/analytics.ts')],
  outfile: join(root, 'js/analytics.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

// Service Worker + 갱신 안내 (TASK-KL-088).
// 캐시 이름에 빌드 스탬프를 박아야 새 배포가 옛 캐시를 버린다 → sw 는 소스가 아니라 빌드 산출물.
const buildStamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
await esbuild.build({
  entryPoints: [join(root, 'src/sw.ts')],
  outfile: join(root, 'sw.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  define: { __KARMOLAB_BUILD__: JSON.stringify(buildStamp) },
  logLevel: 'info'
});

await esbuild.build({
  entryPoints: [join(root, 'src/pwa-update.ts')],
  outfile: join(root, 'js/pwa-update.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

// 알람 발화 풀스크린 (TASK-KL-064) — index.html #alarm-fire 조기 분기가
// 대시보드 부트 전 로드. toolbox 비의존 self-contained iife.
await esbuild.build({
  entryPoints: [join(root, 'src/alarm-fire.ts')],
  outfile: join(root, 'js/alarm-fire.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

const entryPoints = [
  'src/widgets/imageconvert/core.ts',
  'src/widgets/imageconvert/batch-pipeline.ts',
  'src/widgets/imageconvert/imageconvert.ts',
  'src/widgets/imageconvert/widget.ts',
  'src/widgets/randomgen/randomgen-color.ts',
  'src/widgets/randomgen/randomgen-time.ts',
  'src/widgets/randomgen/randomgen-number.ts',
  'src/widgets/randomgen/randomgen-name.ts',
  'src/widgets/randomgen/randomgen-topics.ts',
  'src/widgets/randomgen/randomgen.ts',
  'src/widgets/laptop.ts',
  'src/widgets/toast.ts',
  'src/widgets/imageedit.ts',
  'src/widgets/crypto.ts',
  'src/widgets/memo.ts',
  'src/widgets/imagelib.ts',
  'src/widgets/conch.ts',
  'src/widgets/postgraph.ts',
  'src/widgets/bounce.ts',
  'src/widgets/bubble.ts',
  'src/widgets/countdown.ts',
  'src/widgets/darkroom.ts',
  'src/widgets/dashboard.ts',
  'src/widgets/activity.ts',
  'src/widgets/alarm.ts',
  'src/widgets/claude-env.ts',
  'src/widgets/devtools.ts',
  'src/widgets/eyes.ts',
  'src/widgets/favorites.ts',
  'src/widgets/folder.ts',
  'src/widgets/font.ts',
  'src/widgets/hacker.ts',
  'src/widgets/hourglass.ts',
  'src/widgets/moon.ts',
  'src/widgets/news.ts',
  'src/widgets/particle.ts',
  'src/widgets/password.ts',
  'src/widgets/pet.ts',
  'src/widgets/reaction.ts',
  'src/widgets/servermonitor.ts',
  'src/widgets/shylink.ts',
  'src/widgets/speed.ts',
  'src/widgets/stash.ts',
  'src/widgets/stone.ts',
  'src/widgets/user.ts',
  'src/widgets/youtubedl.ts',
  'src/widgets/adventure/adventure.ts',
  'src/widgets/chatbot/characters.ts',
  'src/widgets/chatbot/chatbot.ts',
  'src/widgets/chatbot/karmo-image.ts',
  'src/widgets/chatbot/markdown.ts',
  'src/widgets/chatbot/prompt.ts',
  'src/widgets/chatbot/styles.ts',
  'src/widgets/docs/docs.ts',
  'src/widgets/imagegen/config.ts',
  'src/widgets/imagegen/core.ts',
  'src/widgets/imagegen/imagegen.ts',
  'src/widgets/imagegen/presets.ts',
  'src/widgets/imagegen/styles.ts',
  'src/widgets/linktree/linktree.ts',
  'src/widgets/planner/planner.ts',
  'src/widgets/life/life.ts',
  'src/widgets/cockpit/cockpit.ts',
  'src/widgets/terminal/terminal.ts',
  'src/widgets/tierlist/dialogs.ts',
  'src/widgets/tierlist/dnd.ts',
  'src/widgets/tierlist/index.ts',
  'src/widgets/tierlist/namespace.ts',
  'src/widgets/tierlist/publish.ts',
  'src/widgets/tierlist/render.ts',
  'src/widgets/tierlist/storage.ts',
  'src/widgets/tierlist/styles.ts',
  'src/widgets/tierlist/tierlist.ts',
  'src/widgets/tierlist/ui.ts',
  // 실용 도구 (TASK-KL-088)
  'src/widgets/tools/charcount.ts',
  'src/widgets/tools/jsonfmt.ts',
  'src/widgets/tools/hangulkey.ts',
  'src/widgets/tools/qrgen.ts',
  'src/widgets/tools/lotto.ts',
  'src/widgets/tools/timer.ts',
  'src/widgets/tools/datecalc.ts',
  'src/widgets/tools/unitconv.ts',
  'src/widgets/tools/hashgen.ts',
  'src/widgets/tools/uuidgen.ts',
  'src/widgets/tools/textdiff.ts',
  'src/widgets/tools/regextest.ts',
  'src/widgets/tools/colorconv.ts',
  'src/widgets/tools/asciiart.ts',
  'src/widgets/tools/radix.ts',
  'src/widgets/tools/textclean.ts',
  'src/widgets/tools/ladder.ts',
  'src/widgets/tools/palette.ts',
  'src/widgets/tools/percent.ts',
  'src/widgets/tools/interest.ts',
  'src/widgets/tools/urlparse.ts',
  'src/widgets/tools/caseconv.ts',
  'src/widgets/tools/jwt.ts',
  'src/widgets/tools/cron.ts',
  'src/widgets/tools/worldclock.ts',
  'src/widgets/tools/bmi.ts',
  'src/widgets/tools/morse.ts',
  'src/widgets/tools/pick.ts',
  'src/widgets/tools/color.ts',
  'src/widgets/tools/text.ts',
  'src/widgets/tools/calc.ts',
  'src/widgets/tools/time.ts',
  'src/widgets/tools/draw.ts',
  'src/widgets/tools/devtool.ts',
  'src/widgets/tools/image.ts',
  'src/widgets/tools/pdftool.ts',
  'src/widgets/tools/audiocut.ts',
  'src/widgets/tools/pdf2img.ts',
  'src/widgets/tools/img2pdf.ts',
  'src/widgets/tools/ziptool.ts',
  'src/widgets/tools/pdfwatermark.ts',
  'src/widgets/tools/audiojoin.ts',
  'src/widgets/tools/imgbatch.ts',
  'src/widgets/tools/filehash.ts',
  'src/widgets/tools/pdf.ts',
  'src/widgets/tools/sound.ts',
  'src/widgets/tools/filetool.ts',
  'src/widgets/tools/gifenc.ts', // 위젯이 아니라 GIF 압축기 — video2gif 가 먼저 부른다
  'src/widgets/tools/video2gif.ts',
  'src/widgets/tools/video2audio.ts',
  'src/widgets/tools/videotrim.ts',
  'src/widgets/tools/video2img.ts',
  'src/widgets/tools/videocompress.ts',
  'src/widgets/tools/screenrec.ts',
  'src/widgets/tools/voicerec.ts',
  'src/widgets/tools/pdfcompress.ts',
  'src/widgets/tools/pdf2text.ts',
  'src/widgets/tools/exifclean.ts',
  'src/widgets/tools/filesplit.ts',
  'src/widgets/tools/pdfsign.ts',
  'src/widgets/tools/text2pdf.ts',
  'src/widgets/tools/qrread.ts',
  'src/widgets/tools/qr.ts',
  'src/widgets/tools/imgmerge.ts',
  'src/widgets/tools/favicon.ts',
  'src/widgets/tools/passgen.ts',
  'src/widgets/tools/gradient.ts',
  'src/widgets/tools/tableconv.ts',
  'src/widgets/tools/workdays.ts',
  'src/widgets/tools/text2img.ts',
  'src/widgets/tools/redact.ts',
  'src/widgets/tools/pdfredact.ts',
  'src/widgets/tools/textredact.ts',
  'src/widgets/tools/audiospeed.ts',
  'src/widgets/tools/videorotate.ts',
  'src/widgets/tools/pdfpagenum.ts',
  'src/widgets/tools/pdfcrop.ts',
  'src/widgets/tools/imgresize.ts',
  'src/widgets/tools/audiofade.ts',
  'src/widgets/tools/audiolevel.ts',
  'src/widgets/tools/videotool.ts',
  'src/widgets/tools/checklist.ts',
  'src/widgets/tools/linebreak.ts',
  'src/widgets/tools/pace.ts',
  'src/widgets/tools/cssunit.ts',
  'src/widgets/tools/loan.ts',
  'src/widgets/tools/colorblind.ts',
  'src/widgets/tools/json2ts.ts',
  'src/widgets/tools/wordfreq.ts',
  'src/widgets/tools/jamo.ts',
  'src/widgets/tools/bizno.ts',
  'src/widgets/tools/listdiff.ts',
  'src/widgets/tools/slug.ts',
  'src/widgets/tools/bytesize.ts',
  'src/widgets/tools/vat.ts',
  'src/widgets/tools/grade.ts',
  'src/widgets/tools/replace.ts',
  'src/widgets/tools/timecalc.ts',
  'src/widgets/tools/contrast.ts',
  'src/widgets/tools/birth.ts',
  'src/widgets/tools/aspect.ts',
  'src/widgets/tools/numword.ts',
  'src/widgets/tools/csvjson.ts',
  'src/widgets/tools/lorem.ts',
  'src/widgets/tools/base64.ts',
  'src/widgets/tools/epoch.ts',
  // 자료표 (TASK-KL-088)
  'src/widgets/ref/reftable.ts',
  'src/widgets/ref/charmap.ts',
  'src/widgets/ref/regexref.ts',
  'src/widgets/ref/reference.ts',
  'src/widgets/ref/specialchar.ts',
  'src/widgets/ref/ascii.ts',
  'src/widgets/ref/htmlentity.ts',
  'src/widgets/ref/httpstatus.ts',
  'src/widgets/ref/colorname.ts',
  'src/widgets/ref/keycode.ts',
  'src/widgets/ref/emoji.ts',
  'src/widgets/ref/markdown.ts',
  'src/widgets/ref/gitcmd.ts',
  'src/widgets/ref/filetype.ts',
  'src/widgets/ref/shortcut.ts',
  'src/widgets-manifest.ts',
  'src/widgets-lazy-meta.ts',
  'src/widgets-loader.ts'
];

for (const rel of entryPoints) {
  const outfile = rel.replace(/^src\//, 'js/').replace(/\.ts$/, '.js');
  await esbuild.build({
    entryPoints: [join(root, rel)],
    outfile: join(root, outfile),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    logLevel: 'info'
  });
}

const worldEntryPoints = [
  'src/world/world.ts',
  'src/world/parse-md.ts',
  'src/world/load-characters-from-wiki.ts',
  'src/world/load-adventures-from-wiki.ts'
];
for (const rel of worldEntryPoints) {
  const outfile = rel.replace(/^src\/world\//, 'world/').replace(/\.ts$/, '.js');
  await esbuild.build({
    entryPoints: [join(root, rel)],
    outfile: join(root, outfile),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    logLevel: 'info'
  });
}
