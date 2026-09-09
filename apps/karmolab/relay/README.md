# mydash 릴레이, 세우는 순서

개인 대시보드(`위젯 id: mydash`)가 GitHub 기기 흐름으로 로그인하려면 **작은 릴레이 하나**가 필요하다.

## 왜 필요한가 (ADR 전제 수정)

ADR 은 "정적 사이트만"을 전제했다. 실제로는 **정적 사이트 + 릴레이 하나**다.

- `github.com/login/device/code` 와 `github.com/login/oauth/access_token` 은 **CORS 를 안 연다.**
  브라우저가 직접 부르면 preflight 에서 막힌다. 이 둘만 릴레이가 지나보낸다.
- `api.github.com` 은 **CORS 를 연다.** 그래서 토큰을 받은 뒤 private 저장소를 읽는 길에는
  릴레이가 끼지 않는다. **데이터는 브라우저와 GitHub 사이에서만 오간다**. ADR 의
  "서비스는 데이터를 0바이트도 보관하지 않는다"는 그대로 지켜진다.
- GitHub **App** 의 기기 흐름은 client secret 이 없어도 된다. 그래서 이 릴레이에 비밀이 없다.
  (OAuth App 으로 하면 secret 이 필요하고, 그러면 릴레이가 비밀을 드는 물건이 된다. App 을 쓴다.)

## 1. GitHub App 만들기

<https://github.com/settings/apps> → New GitHub App

| 칸 | 값 |
| --- | --- |
| Name | 아무거나 (예: `mydash`) |
| Homepage URL | 사이트 주소 |
| Callback URL | 안 쓴다. 아무 주소나 넣어도 된다 |
| **Enable Device Flow** | **켠다.** 이게 꺼져 있으면 기기 코드 요청이 실패한다 |
| Webhook | 끈다 |
| Repository permissions → **Contents** | **Read-only** |
| Where can this be installed | Only on this account |

만든 뒤:

1. **Client ID** 를 적어 둔다 (`Iv23...`). 비밀이 아니다.
2. 왼쪽 **Install App** → 자기 계정에 설치 → **`memo` 저장소만** 고른다.
   (여기서 고른 저장소가 곧 인가다. 안 고른 저장소는 이 App 의 토큰으로 404 가 된다.)

**Client secret 은 만들지 않아도 된다.** 기기 흐름에는 안 쓴다.

## 2. 릴레이 배포

```sh
npx wrangler deploy apps/karmolab/relay/github-device-relay.mjs --name mydash-relay
```

환경변수 (Cloudflare 대시보드 → Settings → Variables):

| 이름 | 값 | 비밀? |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | 1번에서 적어 둔 Client ID | 아니오 (그래도 여기 두면 사이트를 안 고치고 바꾼다) |
| `ALLOWED_ORIGIN` | `https://mascari4615.github.io` (쉼표로 여럿) | 아니오 |
| `GITHUB_CLIENT_SECRET` | **넣지 않는다** (OAuth App 으로 할 때만) | 예, 넣는다면 `wrangler secret put` |

확인:

```sh
curl -X POST https://<릴레이>/device/code -H 'origin: https://mascari4615.github.io'
# → {"device_code":"...","user_code":"XXXX-XXXX","verification_uri":"https://github.com/login/device",...}
```

`origin` 머리를 안 붙이면 403 `origin_not_allowed` 가 정상이다.

## 3. 사이트 설정

`apps/karmolab/data/mydash-config.example.json` 을 **`mydash-config.json` 으로 복사**하고 채운다.

```json
{ "relay": "https://mydash-relay.<계정>.workers.dev", "owner": "Mascari4615", "repo": "memo", "branch": "main" }
```

이 파일은 **공개 배포된다.** 비밀값을 넣지 않는다. 위 넷은 전부 공개해도 되는 값이다.

## 4. 빌드, 배포

```sh
cd apps/karmolab && npm run build
```

위젯 등록만으로 빌드 대상이 따라온다 (`scripts/entry-points.mjs` 가 `lazyScriptPaths` 를 읽는다).

## 확인하는 순서

1. 폰에서 사이트를 열고 도구에서 **내 대시보드**를 연다.
2. 로그인 전 화면에 데이터가 **한 줄도** 없는지 본다. (남이 열었을 때 이 화면이다.)
3. GitHub 로 로그인 → 코드가 뜬다 → GitHub 열기 → 코드 붙여 넣기 → 승인.
4. AI 사용 패널에 숫자가 뜨면 1단계 끝이다.
5. 다른 계정으로 로그인해 **404** 가 나는지 본다. 그게 인가가 작동한다는 증거다.

## 알아 둘 것

- 이 폴더는 `scripts/assemble-site.mjs` 의 SKIP 목록에 없다. 그대로 두면 `_site` 로 복사돼
  워커 소스가 공개된다. 비밀이 없으니 새는 것은 없지만, 싫으면 SKIP 정규식에 `relay` 를 더한다.
- GitHub App 사용자 토큰은 만료를 켜 두면 8시간이다. 셸이 refresh 를 먼저 시도하고,
  실패하면 로그인 화면으로 돌린다.
