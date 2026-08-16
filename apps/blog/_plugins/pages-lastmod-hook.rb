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
# 어떻게: 손으로 쓴 장은 git 의 마지막 커밋 시각. 빌드 중에 만들어진 장(태그·분류 아카이브)은
# 디스크에 원본이 아예 없으므로 파일 시각을 쓸 수 없다 — **속한 글 중 가장 최근 것**을 쓴다.
# 그 장은 글이 하나 들어오거나 고쳐지면 실제로 바뀌므로, 그게 정직한 날짜다.
# 앞머리에 이미 적어 뒀으면 건드리지 않는다.
#
# 2026-08-16 정정: 위 주석은 「태그 장 전부」가 채워진다고 말했지만 실제로는 안 채워지고 있었다 —
# 아카이브 장은 읽기가 끝난 뒤에 생기므로 아래 `:pages, :post_init` 훅에 아예 안 걸린다.
# 실사이트 905개 중 70개(태그 47·분류 23)가 날짜 없이 나가고 있었다. 그래서 훅이 **둘**이다:
#   ① `:pages, :post_init`  — 손으로 쓴 장 (원본 파일이 있다)
#   ② `:site, :pre_render`  — 아카이브 장 (제너레이터가 만든 뒤라야 보인다)
# 30개 글로 재 봤을 때 25 → 0. 태그마다 날짜가 다르다(빌드 시각이 아니라 진짜 신호).
require 'time'

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

# ── 태그·분류 아카이브 (jekyll-archives) ────────────────────────────────
#
# 위 `:pages, :post_init` 훅은 아카이브 장에 **안 걸린다** — 아카이브는 읽기가 끝난 뒤
# 제너레이터가 만들기 때문에 그 시점에 훅이 이미 지나갔다. 그래서 태그 47장·분류 23장이
# 여전히 날짜 없이 나가고 있었다(2026-08-16 실사이트 실측 — 905개 중 70개).
#
# 아카이브 장은 디스크에 원본이 없으니 파일 시각을 쓸 수 없다. 대신 **속한 글 중 가장 최근 것**
# 을 쓴다 — 그 장은 글이 하나 들어오거나 고쳐지면 실제로 그때 바뀐다.
# (구글은 못 믿을 lastmod 를 무시한다 — 정직한 값만 값어치가 있다.)
Jekyll::Hooks.register :site, :pre_render do |site|
  site.pages.each do |page|
    next if page.data['last_modified_at']
    next unless page.respond_to?(:posts)

    stamps = page.posts.map do |post|
      raw = post.data['last_modified_at'] || (post.respond_to?(:date) ? post.date : nil)
      case raw
      when Time then raw
      when String then (Time.parse(raw) rescue nil)
      end
    end.compact

    next if stamps.empty?

    page.data['last_modified_at'] = stamps.max.strftime('%Y-%m-%d %H:%M:%S %z')
  end
end
