# karmolab-mcp

**The MCP server for things LLMs quietly get wrong** — exact hashes, real randomness, and Korean rules
(three different "ages", business-registration checksums, substitute holidays, Hangul keyboard mapping).

**Zero dependencies.** 59 tools. Everything runs locally; nothing is sent anywhere.

```bash
claude mcp add karmolab -- npx -y karmolab-mcp
```

> 🇰🇷 한국어 설명은 아래 [한국어](#한국어) 절에 있습니다.

## Why this exists

An LLM will happily answer these — and be wrong in a way you cannot see:

| You ask | What you often get | What this returns |
| --- | --- | --- |
| "sha256 of this string" | a plausible 64-hex string | the actual digest (matches `sha256sum`) |
| "give me a random password" | something from its training data | `crypto.getRandomValues` |
| "VAT-exclusive price of ₩110,000" | ₩99,000 (subtracts 10%) | ₩100,000 (divides by 1.1) |
| "how old is someone born in 1990?" | one number | **three** — Korean law still uses all of them |
| "5 business days after Sep 21, 2026?" | weekends only | weekends **+ holidays + substitute holidays** |
| "Seoul → New York time difference" | a memorized 14 hours | 13 or 14 — it changes twice a year (DST) |
| "1 pyeong in m²" | 3.3 | 3.3057851 (the gap is visible money on an apartment) |

These are not edge cases. They are the everyday questions where a confident wrong answer costs something.

## Tools (59)

Every tool description is English-first with the Korean original appended, and says *why* the tool
exists — the failure it prevents — not just what it does.

| Group | Tools | What it's for |
| --- | --- | --- |
| **Korean rules** | `hangultype_count` · `hangultype_speed` · `bizno_check` · `birth_info` · `workdays_after` · `workdays_between` · `hangulkey_toKorean` · `hangulkey_toEnglish` · `hangulkey_auto` · `jamo_split` · `jamo_join` · `jamo_initials` | Korean keystroke count (타수 — one syllable is 2–4 presses, so "words × 5" understates it by half) · business/corporate registration checksums · three Korean ages · substitute holidays (KR/JP/US) · 2-bul keyboard round-trip · Hangul jamo decomposition |
| **Exactness** | `hashgen_text` · `filehash_verify` · `uuidgen_generate` · `passgen_strength` | MD5·SHA-1·SHA-256·SHA-512·**SHA3-512 (FIPS-202)**·**Keccak-512**·RIPEMD-160 · checksum comparison that tolerates `sha256:` prefixes and case · UUID v4/v7, ULID, NanoID, passwords · password strength scored by guessing cost, not character classes |
| **Money** | `vat_add` · `vat_extract` · `interest_deposit` · `interest_saving` · `interest_loan` · `loan_schedule` · `loan_compare` | Korean VAT with proper rounding · deposit/installment savings with 15.4% interest tax · three loan repayment methods side by side |
| **Time** | `livecount_since` · `livecount_rate` · `epoch_toDate` · `epoch_toStamp` · `datecalc_shift` · `datecalc_between` · `datecalc_dday` · `timecalc_shift` · `timecalc_sum` · `worldclock_convert` · `worldclock_offset` | time since (or until) a moment, counted by calendar so Jan 31 + 1 month is Feb 28 · s/ms/µs/ns auto-detected by digit count · month arithmetic that clamps (Jan 31 + 1mo = Feb 28) · 60-base time sums · DST-aware conversion |
| **Text & data** | `base64_encode` · `base64_decode` · `csvjson_toJson` · `csvjson_toCsv` · `tableconv_convert` · `charcount_count` · `charcount_fits` · `wordfreq_count` | UTF-8-safe Base64 · RFC 4180 CSV (quoted commas survive) · Excel/CSV/Markdown table conversion · character counts by every basis people actually use · word frequency with Korean particle stripping |
| **Daily games** | `daily_today` · `dailytype_today` · `dailycho_today` | Puzzle date and seed for a daily game, fixed to KST — device timezone cannot split players onto different puzzles · today's Korean typing challenge, scored in 타/분 with the sentences drawn from this site's own tool descriptions · today's 초성 quiz, answers drawn from this site's own tool names |
| **Chaining** | `chain_run` | Run several tools in order, feeding each result into the next — intermediate values never round-trip through the model (where a single wrong character silently poisons everything after it) |
| **Character conversion** | `charconv_width` · `charconv_roman` · `charconv_jamo` | Full-width ↔ half-width (ＡＢ vs AB look almost identical but are different code points — the usual reason a search or login silently fails) · Hangul romanization that states it skips sound changes instead of pretending · Hangul ↔ jamo |
| **Other** | `qrgen_svg` · `qrgen_wifi` · `qrgen_contact` · `grade_gpa` · `grade_needed` · `unitconv_convert` · `unitconv_list` | QR as SVG (WiFi/vCard escaping done right) · Korean GPA (4.5 and 4.3 scales) · units including 평·근·돈·되·말 |

## Install

```bash
# Claude Code
claude mcp add karmolab -- npx -y karmolab-mcp

# or point any MCP client at the binary
npx -y karmolab-mcp
```

Requires Node 20+. Speaks MCP over stdio (newline-delimited JSON-RPC 2.0).

Listed in the official MCP Registry as **`io.github.mascari4615/karmolab-mcp`** — clients that
resolve registry names can install it from there. Published from CI with npm Trusted Publishing,
so every release carries a signed provenance attestation you can verify:

```bash
npm audit signatures   # after installing
```

### From a clone (no npm needed)

```bash
git clone https://github.com/mascari4615/mascari4615.github.io
cd mascari4615.github.io/packages/karmolab-mcp
node build.mjs                       # writes dist/ — needs esbuild from apps/karmolab
claude mcp add --scope local karmolab -- node "$PWD/src/server.mjs"
```

The build step exists because the tools live as TypeScript in the website's source and are
compiled into `dist/`. Nothing is downloaded at runtime.

## Design

- **No dependencies.** MCP's stdio transport is line-delimited JSON-RPC, so no SDK is needed.
  Nothing to audit, nothing to break on install.
- **No hand-written tool list.** The build emits every `src/core/*.ts` that exports a `spec`;
  the server reads that and derives names, descriptions and input schemas. Adding a tool touches no server code.
- **The same code runs the website.** These tools are the calculation cores behind
  [KarmoLab](https://blog.mascari4615.com/karmolab/) — the browser UI and this server share one implementation,
  so "the site says X but MCP says Y" is structurally impossible.
- **Honest boundaries.** Tools say what they cannot know: `bizno_check` states it only validates the
  checksum (not registration), `workdays_*` says which years aren't in its holiday table instead of
  inventing dates, `unitconv` deliberately has **no currency** (that would need live rates).

## Tests

```bash
node ../../apps/karmolab/scripts/smoke-mcp.mjs          # spawn the server, call it, check values
node ../../apps/karmolab/scripts/smoke-mcp-install.mjs  # pack → install into an empty dir → call that
```

Values are checked against OpenSSL where an oracle exists. The install test matters separately:
"works in our repo" and "works after `npm install`" are different claims, and only the second one is
what a user gets.

## 한국어

**LLM 이 조용히 틀리는 것들을 대신 계산하는 MCP 서버.** 의존성 0개, 도구 59개, 전부 로컬에서 돈다.

값이 가장 큰 자리는 **한국 규칙**이다 — 나이 세 가지, 사업자등록번호 검증숫자, 대체공휴일,
한영타·자모, 평·근·돈. 이건 지역 지식이라 모델이 외워서 답하다 어긋난다.

같은 계산을 [KarmoLab](https://blog.mascari4615.com/karmolab/) 화면도 쓴다 — 한 벌이라
「사이트 값과 MCP 값이 다르다」가 생길 수 없다.

## License

MIT
