#!/usr/bin/env ruby
#
# **막아 놓은 주소를 사이트맵에 싣지 않는다** (2026-08-16)
#
# `robots.txt` 는 `Disallow: /page*` 로 목록 넘김 장을 막아 두었다(얇은 장이라 막는 게 맞다).
# 그런데 사이트맵에는 `/page2/` ~ `/page10/` 아홉 장이 그대로 실려 있었다 — 실사이트 실측
# 905개 중 9개. 「오지 마라」와 「여기 있다」를 동시에 말하는 셈이고, 크롤러는 그걸
# 「막혔는데 색인됨」으로 적어 둔다. 사이트맵에는 **색인시키고 싶은 주소만** 넣는다.
#
# 어떻게: 주소가 `/page<숫자>/` 인 장에만 `sitemap: false` 를 박는다(jekyll-sitemap 이 그 표를 보고 뺀다).
# 첫 장(`/`)은 그대로 남는다 — 막혀 있지도 않다.
#
# 지키는 자리: `scripts/audit-sitemap-lastmod.mjs` 가 배포에서 사이트맵을 볼 때 같이 본다.
Jekyll::Hooks.register :site, :pre_render do |site|
  site.pages.each do |page|
    # `paginator` 표로 고르려다 실패했다 (2026-08-16 전체 빌드로 확인 — 아홉 장이 그대로 실렸다).
    # 그 표가 이 시점에 늘 붙어 있지는 않다. 그래서 **주소로** 고른다 —
    # robots.txt 가 막는 기준도 주소(`/page*`)이므로, 같은 기준으로 보는 편이 어긋날 일이 없다.
    url = page.url.to_s
    next unless url =~ %r{\A/page\d+/?\z}

    page.data['sitemap'] = false
  end
end
