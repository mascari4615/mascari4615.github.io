# karmolab-mcp

**KarmoLab 도구를 AI 에이전트가 부를 수 있게.** 의존성 0개.

LLM 은 해시를 지어낸다. 만나이·대체공휴일·시간대 전환처럼 규칙이 복잡한 것도 자신 있게 틀린다.
그 계산을 정확히 하는 코드는 [KarmoLab](https://blog.mascari4615.com/karmolab/) 이 이미 갖고 있었는데,
그동안 **화면으로만** 열려 있었다. 이건 그걸 그대로 내놓는 창구다.

## 쓰기

```bash
# Claude Code
claude mcp add karmolab -- node /경로/packages/karmolab-mcp/src/server.mjs
```

처음 한 번은 알맹이를 찍어 내야 한다:

```bash
node build.mjs        # apps/karmolab/src/core/*.ts → dist/*.mjs
```

## 지금 있는 도구

| 이름 | 하는 일 |
| --- | --- |
| `base64_encode` / `base64_decode` | 한글 안 깨지는 Base64. URL-safe 표기 지원 |
| `hashgen_text` | MD5 · SHA-1 · SHA-256 · SHA-512 · **SHA3-512(FIPS-202)** · **Keccak-512(표준 이전)** · RIPEMD-160 |
| `epoch_toDate` / `epoch_toStamp` | 유닉스 타임스탬프 ↔ 시각. **초·밀리·마이크로·나노를 자릿수로 자동 판별** |

`SHA3-512` 와 `Keccak-512` 를 **따로** 내놓는 이유: 흔히 쓰는 라이브러리들이 표준화 이전 Keccak 을
「SHA-3」이라 부른다. 값이 다른데 이름이 같으면 사람은 멀쩡한 파일을 손상됐다고 판단한다.

## 설계

- **손으로 적은 도구 목록이 없다.** `dist/manifest.json`(빌드가 찍음)을 읽고, 각 알맹이의 `spec` 에서
  이름·설명·입력 스키마를 뽑는다. 알맹이가 늘면 여기 손 안 대도 도구가 는다.
- **의존성 0.** MCP 의 stdio 전송은 줄 단위 JSON-RPC 2.0 이라 SDK 없이 말이 통한다.
- **같은 코드가 화면에서도 돈다.** `apps/karmolab/src/core/` 한 벌을 브라우저와 여기가 같이 쓴다 —
  「사이트 값과 MCP 값이 다르다」가 구조적으로 불가능하다.
- `dist/` 는 커밋하지 않는다. 베낀 게 아니라 찍어 낸 것이므로 매번 새로 만든다.

## 검사

```bash
node ../../apps/karmolab/scripts/smoke-mcp.mjs
```

서버를 진짜 띄우고 에이전트와 같은 순서로 말을 건 뒤(initialize → tools/list → tools/call),
**돌아온 값을 OpenSSL 과 대 본다.** 「만들었다」가 아니라 「불러 봤고 값이 맞다」가 통과 기준이다.

설계 배경: `memo/projects/karmolab-absorption/06-execution-layer-design.md` · `10-mcp-tool-selection.md`
