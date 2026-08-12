#!/usr/bin/env ruby
#
# 글(posts) 말고 **일반 장(pages)** 에도 「마지막으로 바뀐 날」을 붙인다.
#
# 왜: sitemap.xml 에 <lastmod> 가 없으면 그 주소는 IndexNow 알림에서 통째로 빠진다
# (scripts/indexnow-submit.mjs 가 lastmod 로 「최근에 바뀐 것」을 고르기 때문).
# 2026-08-13 실측 — 881개 중 86개에 lastmod 가 없었고, 그 안에 **간판 장들**이 들어 있었다:
#   /  ·  /karmolab/  ·  /en/karmolab/  ·  /ja/karmolab/  ·  /karmolab/play/  ·  태그 장 전부
# 즉 「KarmoLab」으로 검색했을 때 떠야 할 바로 그 장이 한 번도 알림에 안 실렸다.
# 도구 상세 장 430개는 shell-page.mjs 가 last_modified_at 을 찍어 줘서 멀쩡했다 — 손으로 쓴 장만 구멍.
#
# 어떻게: 손으로 쓴 장은 git 의 마지막 커밋 시각, 빌드 중에 만들어진 장(태그·아카이브 등
# 디스크에 원본이 없는 것)은 파일 시각으로 채운다. 앞머리에 이미 적어 뒀으면 건드리지 않는다.
Jekyll::Hooks.register :pages, :post_init do |page|
  next if page.data['last_modified_at']

  rel = page.path.to_s
  next if rel.empty?

  full = File.expand_path(rel, page.site.source)
  next unless File.file?(full)

  date = `git log -1 --pretty=%ad --date=iso "#{full}" 2>/dev/null`.strip
  date = File.mtime(full).strftime('%Y-%m-%d %H:%M:%S %z') if date.empty?

  page.data['last_modified_at'] = date
end
