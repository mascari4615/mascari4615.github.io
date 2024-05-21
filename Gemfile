# frozen_string_literal: true

source "https://rubygems.org"

gemspec

group :test do
  gem "html-proofer", "~> 5.0"
end

# https://thegeekcat.github.io/blogging/tzinfoError/
# Windows does not include zoneinfo files, so bundle the tzinfo-data gem
gem 'tzinfo'
gem "tzinfo-data", platforms: [:mingw, :mswin, :x64_mingw, :jruby]