"""
글꼴을 우리 서버에서, 우리가 실제로 쓰는 글자만 구워서 낸다 (TASK-KL-128)

왜 있나: 남의 글꼴 목록(`fonts.googleapis.com`)이 한 화면에 281~467KB(압축 68~113KB)였다.
우리 JS+CSS 를 다 합친 것보다 크다. 그런데 재 보니 **그 2초 동안 글꼴 파일은 도착조차 안 했다**
— 쓰임 0%. 안 쓰는 굵기·문자 범위의 `@font-face` 를 632개나 받고 있었고, 남의 출처라 이름 찾기와
악수(DNS+TLS)가 한 번 더 든다.

무엇을 하나:
  · 굵기가 축으로 들어 있는 원본(가변 글꼴) 하나에서 **우리가 쓰는 글자만** 잘라 낸다.
    굵기 400/500/700 을 따로 굽지 않는다 — 한 파일이 전부 낸다.
  · 라틴/기호와 한글을 **따로** 굽는다. 영문만 있는 화면은 한글 뭉치를 안 받는다.
  · 한글은 (소스에 실제로 나온 글자) ∪ (KS X 1001 상용 2350자) — 그 밖의 글자는 시스템 글꼴이 받는다.
    폭을 맞춰 뒀으므로(tools.css) 섞여도 글이 밀리지 않는다.

내는 것: `fonts/*.woff2` + `css/fonts.css` (한 곳에서만 만든다 — 손으로 안 적는다)

사용: python scripts/gen-fonts.py          (원본이 없으면 받아 온다)
      python scripts/gen-fonts.py --check  (다시 구웠을 때 달라지는지만 본다)
"""
import os
import subprocess
import sys
import urllib.request

# 윈도우 콘솔이 기본으로 옛 한국어 인코딩이라, 한글·기호를 그냥 찍으면 여기서 죽는다.
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, '.fontsrc')
OUT = os.path.join(HERE, 'fonts')
CSS_OUT = os.path.join(HERE, 'css', 'fonts.css')

GH = 'https://github.com/google/fonts/raw/main/'
# 이름: (원본 경로, CSS 이름, 내보낼 조각, 한글을 어디까지 담나)
#   'common' = 소스에 실제로 나온 글자 ∪ 상용 2350자 — 본문용. 어떤 글이 와도 거의 다 덮는다.
#   'ours'   = 소스에 실제로 나온 글자만 — 우리가 쓴 제목에만 쓰는 글꼴이라 이걸로 충분하다.
FAMILIES = {
    'sans':  ('ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf',       'KarmoSans',  ('latin', 'ko'), 'common'),
    'serif': ('ofl/notoserifkr/NotoSerifKR%5Bwght%5D.ttf',     'KarmoSerif', ('latin', 'ko'), 'ours'),
    'mono':  ('ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf', 'KarmoMono',  ('latin',),      'ours'),
}

# 화면에 나오는 글자를 여기서 긁는다. 코드 안의 문자열도 결국 화면에 나오므로 통째로 본다.
# `data/` 는 뺀다 — 저건 도구가 다루는 **내용**이지 화면의 뼈대가 아니다. 넣으면 한글 11172자가
# 통째로 들어와 파일이 1MB 를 넘는다(실측). 내용 쪽 글자는 상용 2350자가 덮는다.
SCAN_DIRS = ['src', 'css']
# 화면에 글로 나오는 데이터 파일만 골라 넣는다 (도구 이름·설명·다른 이름).
# `data/` 를 통째로 넣으면 도구가 다루는 **내용**(포켓몬 목록 등)까지 들어와 한글이 11172자가
# 된다 — 그러면 첫 화면이 받는 뭉치가 1MB 다. 반대로 안 넣으면 도구 이름 글자가 뒤 뭉치로
# 밀려 첫 화면이 162KB 를 더 받는다(실측). 화면에 나오는 것만, 정확히.
SCAN_FILES = [
    'index.html',
    'data/tools-seo.json',
    'data/tool-aliases.json',
    'data/sponsor.json',
]
SCAN_EXT = ('.html', '.ts', '.css', '.js', '.json', '.md')
SKIP_DIRS = {'node_modules', '.cache', 'vendor', 'samples', 'tierlists'}


def source_chars():
    seen = set()
    def eat(path):
        try:
            with open(path, encoding='utf-8', errors='ignore') as f:
                seen.update(f.read())
        except OSError:
            pass
    for f in SCAN_FILES:
        eat(os.path.join(HERE, f))
    for d in SCAN_DIRS:
        for dp, dn, fn in os.walk(os.path.join(HERE, d)):
            dn[:] = [x for x in dn if x not in SKIP_DIRS and not x.startswith('.')]
            for name in fn:
                if name.endswith(SCAN_EXT):
                    eat(os.path.join(dp, name))
    return seen


def ks_x_1001_hangul():
    """옛 표준(KS X 1001)이 담고 있던 상용 한글 2350자.

    목록을 손으로 적을 필요가 없다 — 그 표의 **한글 자리(앞바이트 0xB0~0xC8)** 에 들어가는
    글자가 곧 그 목록이다. 파이썬의 `euc_kr` 은 확장분(11172자 전부)까지 적어 주므로,
    앞바이트로 한 번 더 거르지 않으면 목록이 아니라 전체가 된다 (실측: 11236자)."""
    out = set()
    for code in range(0xAC00, 0xD7A4):
        ch = chr(code)
        try:
            enc = ch.encode('euc_kr')
        except UnicodeEncodeError:
            continue
        if len(enc) == 2 and 0xB0 <= enc[0] <= 0xC8:
            out.add(ch)
    return out


# 라틴 조각이 맡는 범위 — 영문·숫자·문장부호·화살표·수학기호·통화 등 '한글이 아닌 것' 전부.
def split_sets(chars):
    latin, ko = set(), set()
    for ch in chars:
        o = ord(ch)
        if o < 0x20:
            continue
        if 0xAC00 <= o <= 0xD7A3 or 0x3130 <= o <= 0x318F or 0x1100 <= o <= 0x11FF:
            ko.add(ch)
        elif o <= 0x2FFF or 0xFE00 <= o <= 0xFE0F or 0xFF00 <= o <= 0xFFEF:
            latin.add(ch)
        elif 0x4E00 <= o <= 0x9FFF:
            ko.add(ch)          # 한자 몇 자는 한글 조각에 얹는다 (수가 적다)
    return latin, ko


# 이 조각을 **언제 받을지** 브라우저에 알려 주는 값. 화면에 그 범위 글자가 없으면 안 받는다.
UNICODE_RANGE = {
    'latin': 'U+0000-2BFF,U+FE00-FE0F,U+FF00-FFEF',
    'ko': 'U+1100-11FF,U+3130-318F,U+4E00-9FFF,U+AC00-D7A3',
}


def ensure_src():
    os.makedirs(SRC, exist_ok=True)
    for key, (path, *_rest) in FAMILIES.items():
        dst = os.path.join(SRC, key + '.ttf')
        if os.path.exists(dst) and os.path.getsize(dst) > 100000:
            continue
        url = GH + path
        print(f'[gen-fonts] 원본을 받는다 — {key}')
        with urllib.request.urlopen(url) as r, open(dst, 'wb') as f:
            f.write(r.read())


def subset(src_ttf, out_woff2, text):
    cmd = [
        sys.executable, '-m', 'fontTools.subset', src_ttf,
        '--text=' + text,
        '--output-file=' + out_woff2,
        '--flavor=woff2',
        '--layout-features=kern,liga,calt,ccmp,locl,mark,mkmk',
        '--no-hinting',
        '--desubroutinize',
        '--drop-tables+=DSIG',
        '--name-IDs=1,2,3,4,6',
        '--notdef-outline',
        '--recalc-bounds',
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main():
    check = '--check' in sys.argv
    ensure_src()
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.dirname(CSS_OUT), exist_ok=True)

    mine = source_chars()
    latin, ko_ours = split_sets(mine)
    _, ko_common = split_sets(mine | ks_x_1001_hangul())
    print(f'[gen-fonts] 라틴·기호 {len(latin)}자 · 한글 본문용 {len(ko_common)}자 · 한글 제목용 {len(ko_ours)}자')

    # 세리프의 라틴은 **로고와 인트로 글자에만** 쓰인다 (실측: 도구 화면 11곳이 전부 「KarmoLab」).
    # 그 11곳을 위해 375자를 담으면 46KB 다. 담는 글자를 실제로 쓰는 쪽에 맞추면 14KB —
    # 32KB 가 매 화면에서 빠진다. 넉넉히 영문 대소문자·숫자·기본 문장부호까지 담아 두고,
    # 그 밖의 글자가 세리프로 나올 일이 생기면 컴퓨터 세리프(Georgia)가 받는다.
    serif_latin = set('KarmoLab')
    serif_latin |= {chr(c) for c in range(0x41, 0x5B)}
    serif_latin |= {chr(c) for c in range(0x61, 0x7B)}
    serif_latin |= set('0123456789 .,-!?:;()')
    serif_latin |= {'·', '—', '–', '…', "'", '"'}
    serif_latin &= latin | set('KarmoLab')

    # 고정폭도 마찬가지다 — 실제로 그리는 라틴은 64자다(여덟 화면에서 세어 봤다: 숫자·영문·
    # 문장부호·긴줄표). 383자를 담으면 39.7KB, 쓰는 쪽에 맞추면 그보다 훨씬 적다.
    # 넉넉히 아스키 전부 + 우리가 쓰는 기호 몇 개를 담는다. 그 밖은 컴퓨터 고정폭이 받는다.
    mono_latin = {chr(c) for c in range(0x20, 0x7F)}
    mono_latin |= {'·', '—', '–', '…', '→', '×', '°', '₩'}
    mono_latin &= latin

    # 조각 나누기 — 라틴/기호와 한글을 따로 굽는다. 영문만 있는 화면은 한글 뭉치를 안 받는다.
    #
    # 한글을 「우리 화면 글자 / 그 밖의 상용 글자」로 한 번 더 갈라서 담은 글자를 정확히 적어
    # 두는 것도 해 봤다. 그런데 **재 보니 브라우저가 뒤 뭉치까지 늘 받았다** — 화면 글에는 뒤
    # 뭉치 글자가 하나도 없었는데도(직접 대조해 0자 확인). 그러면 둘로 나눈 쪽이 오히려 손해다:
    # 받는 양은 257KB → 289KB 로 늘고, 담은 글자를 적느라 이 목록이 1.2KB → 8.4KB 가 된다.
    # 그래서 한 덩이로 둔다. (나뉜 쪽이 왜 다 받아지는지는 아직 모른다 — 알아내면 다시 나눠라.)
    pools = {
        'sans':  [('latin', latin), ('ko', ko_common)],
        'serif': [('latin', serif_latin), ('ko', ko_ours)],
        'mono':  [('latin', mono_latin)],
    }

    css = [
        '/* 이 파일은 `scripts/gen-fonts.py` 가 만든다 — 손으로 고치지 마라 (TASK-KL-128). */',
        '/* 굵기는 한 파일 안의 축으로 들어 있다: 400/500/700 을 따로 안 받는다. */',
    ]
    changed = []
    for key, (_path, css_name, _parts, _ko_policy) in FAMILIES.items():
        for part, pool in pools[key]:
            if not pool:
                continue
            text = ''.join(sorted(pool))
            name = f'{key}-{part}.woff2'
            out = os.path.join(OUT, name)
            before = open(out, 'rb').read() if os.path.exists(out) else None
            subset(os.path.join(SRC, key + '.ttf'), out, text)
            after = open(out, 'rb').read()
            if before != after:
                changed.append(name)
            print(f'    {name:20s} {len(after)/1024:7.1f}KB  ({len(pool)}자)')
            # 한글 뭉치는 **바꿔 끼우지 않는다** (`optional`).
            #
            # 왜: 한글 조각이 258KB 다(라틴은 40KB). `swap` 이면 브라우저가 먼저 시스템
            # 글꼴로 글을 그렸다가 뭉치가 도착하는 순간 **화면을 통째로 다시 그린다** —
            # 사용자가 「처음에 UI 가 망가진 채로 한참 보인다」고 한 게 이 구간이다
            # (실측: 첫 그림 0.5초 → 한글 뭉치 도착까지 0.26MB).
            # `optional` 은 제때 못 오면 **그 방문에는 그냥 안 쓴다**. 대신 받아 둔 것은
            # 캐시에 남아 **다음 방문부터는 처음부터 우리 글꼴**로 뜬다. 바뀌는 순간이 없다.
            # 라틴은 작아서 제때 오므로 `swap` 그대로 둔다.
            display = 'optional' if part == 'ko' else 'swap'
            css.append(
                f"@font-face{{font-family:'{css_name}';font-style:normal;font-weight:100 900;"
                f"font-display:{display};src:url('/apps/karmolab/fonts/{name}') format('woff2');"
                f"unicode-range:{UNICODE_RANGE[part]}}}"
            )
    body = '\n'.join(css) + '\n'
    old = open(CSS_OUT, encoding='utf-8').read() if os.path.exists(CSS_OUT) else None
    if old != body:
        changed.append('css/fonts.css')
    if check:
        if changed:
            print('[gen-fonts] 다시 구우면 달라진다 — ' + ', '.join(changed))
            print('  → `python scripts/gen-fonts.py` 를 돌리고 결과를 같이 커밋해라.')
            sys.exit(1)
        print('[gen-fonts] 최신이다')
        return
    with open(CSS_OUT, 'w', encoding='utf-8') as f:
        f.write(body)
    print(f'[gen-fonts] css/fonts.css 갱신 ({len(body)}바이트)')


if __name__ == '__main__':
    main()
