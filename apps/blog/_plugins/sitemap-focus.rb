#!/usr/bin/env ruby
#
# **예산이 32장이면 명단도 32장 쪽으로 좁힌다** (TASK-KL-349, 2026-08-22)
#
# 서치 콘솔 실측(2026-08-22): 90일 크롤 요청 359건 중 **HTML 은 9%** — 문서를 가져간 것은
# 서른두 번쯤이다. 그리고 **목적 기준 「새로고침 100% · 발견 0%」**. 그 사이 사이트맵은
# 816장으로 불었고, 결과는 「색인 생성됨 3 · 발견됨-미색인 400 · 크롤링됨-미색인 42」였다.
# 색인된 3장은 전부 옛 블로그 글이고 **KarmoLab 장은 한 장도 없다**.
#
# 816장을 한 바퀴 도는 데 산술적으로 6년이다. 이 상태에서 명단을 늘리는 것은 아무것도 아닌
# 일이고, 오히려 「가치 낮은 장이 잔뜩인 집」이라는 신호가 된다. 그래서 **뺀다**.
#
#   1. 언어 판 전부 (`/en/**` · `/ja/**` — 실측 296장)
#      번역은 성하다(hreflang·canonical 다 맞다). 다만 **한국어가 한 장도 안 실린 상태에서**
#      같은 내용의 두 벌을 더 내미는 것은 순서가 틀렸다. ko 가 색인되면 그때 연다.
#      hreflang 은 그대로 두므로 ko 장이 색인되는 순간 구글이 짝을 스스로 찾아간다.
#
#   2. 스스로 할 말이 얇은 도구 장 (`tools-seo.json` 항목이 #{FOCUS_MIN_SEO_CHARS}자 미만)
#      본문 실측 중앙값이 311단어다. 같은 목적의 장 147개가 300단어씩 있으면 구글은
#      「크롤링됨 - 현재 색인이 생성되지 않음」을 준다(실제로 42장이 그 상태다).
#      **문턱은 고정이고 글은 자란다** — 설명·사용법·문답을 채우면 그 장은 다음 배포에서
#      스스로 명단에 들어온다. 손으로 관리하는 명단을 두지 않는 이유가 이것이다.
#
# 빼는 것 ≠ 막는 것이다. robots.txt 는 그대로고 허브에서 147장 전부로 링크가 간다 —
# 사람도 크롤러도 여전히 들어간다. 사이트맵은 「여기부터 봐 달라」는 **우선순위표**다.
#
# 같은 결의 앞선 조치 = `sitemap-drop-paginated.rb` · `sitemap-drop-thin.rb` ·
#                      `sitemap-drop-noindex.rb`
# 지키는 자리 = `scripts/audit-sitemap-lastmod.mjs` (배포에서 사이트맵을 같이 본다)
require 'json'
require 'set'

# 도구 한 장이 사이트맵에 실릴 자격 — `data/tools-seo.json` 의 그 항목이 이만큼은 돼야 한다.
# 700 = 지금 147장 중 52장이 통과하는 자리(2026-08-22 실측). 색인이 붙기 시작하면 낮춘다.
FOCUS_MIN_SEO_CHARS = 700

FOCUS_DROP_LOCALE = %r{\A/(en|ja)/}.freeze
FOCUS_TOOL_URL = %r{\A/karmolab/t/([^/]+)/?\z}.freeze

# `tools-seo.json` 은 karmolab 쪽에 있다 (Jekyll 원본은 apps/blog). 없으면 **아무것도 안 뺀다** —
# 명단이 조용히 반토막 나는 것보다 넓은 채로 남는 편이 낫다.
def focus_thin_tool_ids(site)
  path = File.expand_path('../karmolab/data/tools-seo.json', site.source)
  unless File.exist?(path)
    Jekyll.logger.warn '[sitemap-focus]', "#{path} 없음 — 도구 장은 하나도 안 뺀다"
    return nil
  end

  tools = JSON.parse(File.read(path))['tools'] || {}
  thin = tools.reject { |_id, entry| JSON.generate(entry).length >= FOCUS_MIN_SEO_CHARS }.keys
  Jekyll.logger.info '[sitemap-focus]',
                     "도구 #{tools.size}개 중 #{tools.size - thin.size}개가 #{FOCUS_MIN_SEO_CHARS}자 문턱을 넘었다"
  thin.to_set
rescue StandardError => e
  Jekyll.logger.warn '[sitemap-focus]', "tools-seo.json 을 못 읽었다 (#{e.message}) — 도구 장은 안 뺀다"
  nil
end

Jekyll::Hooks.register :site, :pre_render do |site|
  # 이 훅이 터져서 **배포가 통째로 멈추는 일**은 없어야 한다. 명단을 못 좁히면 넓은 채로 간다 —
  # 그건 어제까지의 상태이고, 사이트가 안 나가는 것보다 낫다.
  begin
  thin_ids = focus_thin_tool_ids(site)
  dropped_locale = 0
  dropped_tool = 0

  site.pages.each do |page|
    url = page.url.to_s

    if url =~ FOCUS_DROP_LOCALE
      page.data['sitemap'] = false
      dropped_locale += 1
      next
    end

    next if thin_ids.nil?
    next unless (m = url.match(FOCUS_TOOL_URL))
    next unless thin_ids.include?(m[1])

    page.data['sitemap'] = false
    dropped_tool += 1
  end

  # 언어 판 중에는 머리말 없이 복사돼 오는 것도 있다 (locale 생성기 산출물).
  site.static_files.each do |file|
    next unless file.extname == '.html'
    next unless file.url.to_s =~ FOCUS_DROP_LOCALE

    file.data['sitemap'] = false
    dropped_locale += 1
  end

  Jekyll.logger.info '[sitemap-focus]', "명단에서 뺐다 — 언어 판 #{dropped_locale}장 · 얇은 도구 #{dropped_tool}장"
  rescue StandardError => e
    Jekyll.logger.warn '[sitemap-focus]', "좁히기가 터졌다 (#{e.class}: #{e.message}) — 명단은 넓은 채로 간다"
  end
end
