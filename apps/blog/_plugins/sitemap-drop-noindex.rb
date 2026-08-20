#!/usr/bin/env ruby
#
# **「오지 마라」와 「여기 있다」를 동시에 말하지 않는다** (2026-08-20)
#
# 실사이트 전수 측정(2026-08-20): 사이트맵 866개 중 **53개가 `noindex`** 였다.
#   - 글 작업대로 흡수한 옛 도구의 넘김 장 17개 × 3언어 = 51 (`/karmolab/t/charcount/` 등)
#   - `/karmolab/u/` · `/daily/mine/` (사람마다 다른 내 화면이라 색인 대상이 아니다)
# 전부 `canonical` 과 `noindex` 를 제대로 달고 있다 — 장 자체는 성하다. 틀린 건 **명단**이다.
# 사이트맵은 「여기부터 봐 달라」는 우선순위표인데, 거기에 「색인하지 마라」를 적어 넣었다.
# 크롤러는 그 장을 받아 보고 나서야 noindex 를 읽는다 — 새 집일수록 그 한 번이 아깝다
# (같은 날 실측: 90일 크롤 342건, 그중 HTML 은 9%).
#
# 왜 장마다 `sitemap: false` 를 박지 않았나: 이 장들은 **저장소에 없다**.
# `apps/blog/karmolab/` · `en/` · `ja/` 는 .gitignore 이고 배포 때 생성기 서넛이 찍는다
# (`gen-tool-pages.mjs` · `gen-tool-pages-locale.mjs` · daily 빌드 · karmolab `u/`).
# 생성기마다 한 줄씩 넣으면 같은 규칙이 네 곳으로 갈라지고, 다음에 생기는 noindex 장은
# 또 빠뜨린다. **규칙은 한 곳에 둔다** — 장이 스스로 「색인하지 마라」라고 말하면,
# 그 말을 그대로 믿고 명단에서 뺀다. 생성기가 몇 개든 자동으로 지켜진다.
#
# 막는 것이 아니다. robots.txt 는 그대로라 크롤러도 사람도 여전히 들어가고,
# `noindex,follow` 이므로 그 장의 링크는 계속 따라간다.
#
# 같은 결의 앞선 조치 = `sitemap-drop-paginated.rb`(막아 둔 `/page*`) ·
#                      `sitemap-drop-thin.rb`(태그·분류 목록 장, 문서 파일)
NOINDEX_META = /<meta[^>]+name\s*=\s*["']robots["'][^>]*>/i.freeze

def karmo_noindex?(html)
  m = html[NOINDEX_META]
  !m.nil? && m =~ /noindex/i
end

Jekyll::Hooks.register :site, :pre_render do |site|
  site.pages.each do |page|
    # 넘김 장들은 `layout: none` 이라 meta 가 page.content 안에 그대로 있다.
    page.data['sitemap'] = false if karmo_noindex?(page.content.to_s)
  end

  # 머리말 없이 통째로 복사되는 장도 있다 (`/daily/mine/` — apps/daily 빌드 산출물).
  # 그런 것은 파일을 열어 봐야 안다. .html 만 본다 — 사이트맵에 실리는 건 어차피 그것뿐이다.
  site.static_files.each do |file|
    next unless file.extname == '.html'

    begin
      file.data['sitemap'] = false if karmo_noindex?(File.read(file.path))
    rescue StandardError => e
      # 못 읽는 파일 하나 때문에 배포를 세우지는 않는다. 다만 조용히 넘어가지도 않는다.
      Jekyll.logger.warn '[sitemap-noindex]', "#{file.relative_path} 를 못 읽었다: #{e.message}"
    end
  end
end
