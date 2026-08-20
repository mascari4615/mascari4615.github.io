#!/usr/bin/env ruby
#
# **크롤 예산을 색인시키고 싶은 장에만 쓴다** (2026-08-20)
#
# 서치 콘솔 실측(2026-08-20): blog.mascari4615.com 은 구글 눈에 8월 5일에 생긴 새 집이다.
# 90일 크롤 요청 342건, 그중 **자바스크립트 62% · HTML 9%** — 실제 문서는 서른 장쯤만
# 받아 갔다. 그 결과가 「발견됨 - 현재 색인이 생성되지 않음 400장」이다. 사이트맵에 944개를
# 올려 두었지만 구글은 그중 3장만 색인했다.
#
# 예산이 이만큼 작을 때는 **무엇을 싣느냐보다 무엇을 빼느냐**가 크다. 아래 둘을 뺀다:
#
#   1. 태그·분류 목록 장 (`/tags/*`, `/categories/*` — jekyll-archives 생성분, 실측 72장)
#      글 목록만 있는 얇은 장이다. 글로 가는 길은 `/archives/` 가 이미 낸다 —
#      실측으로 그 한 장이 글 333개를 링크한다. 목록 장이 없어도 글은 안 고립된다.
#
#   2. 문서 파일 (`assets/doc/**` — pdf·pptx, 실측 8장)
#      학교 과제물이다. 검색으로 들어올 장이 아닌데 사이트맵에 실려 있었고,
#      실제로 서치 콘솔 「발견됨 - 미크롤」 목록 첫 장에 이것들이 그대로 올라와 있었다.
#
# 빼는 것 ≠ 막는 것이다. robots.txt 는 건드리지 않으므로 사람도 크롤러도 여전히 들어갈 수
# 있다. 사이트맵은 「여기부터 봐 달라」는 **우선순위표**이지 출입문이 아니다.
#
# 같은 결의 앞선 조치 = `sitemap-drop-paginated.rb` (막아 둔 `/page*` 를 뺐다).
# 지키는 자리 = `scripts/audit-sitemap-lastmod.mjs` (배포에서 사이트맵을 같이 본다).
DROP_PAGE_URL = %r{\A/(tags|categories)/[^/]+/?\z}.freeze
DROP_FILE_DIR = %r{\Aassets/doc/}.freeze

Jekyll::Hooks.register :site, :pre_render do |site|
  site.pages.each do |page|
    # jekyll-archives 가 만든 장은 `site.pages` 에 얹힌다(2.3.0 실측).
    # 주소로 고른다 — `/page*` 를 뺄 때와 같은 기준이라 어긋날 데가 없다.
    page.data['sitemap'] = false if page.url.to_s =~ DROP_PAGE_URL
  end

  # 정적 파일에는 머리말이 없다. jekyll-sitemap 은 `file.sitemap != false` 로 거르는데,
  # 그 값은 Drop 이 `file.data` 로 떨어뜨려 읽는다 — 그래서 여기에 박으면 걸러진다.
  site.static_files.each do |file|
    file.data['sitemap'] = false if file.relative_path.to_s.sub(%r{\A/}, "") =~ DROP_FILE_DIR
  end
end
