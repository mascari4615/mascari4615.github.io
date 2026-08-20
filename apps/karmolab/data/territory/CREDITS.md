# 이 폴더의 자료 — 출처와 라이선스

이 저장소는 **공개**다. 여기 있는 파일은 우리가 만든 것이 아니라 받아서 추린 뒤
**같이 배포하는** 것이므로, 각각의 조건을 여기 적어 둔다.
생성기는 `apps/karmolab/scripts/gen-territory-data.mjs`(가게 점) ·
`gen-territory-sgg.mjs`(시군구 경계·점유율) 이고, 거기 적힌 주소가 원본이다.

| 파일 | 원본 | 저작자 / 출처 | 조건 |
| --- | --- | --- | --- |
| `convenience.json` · `cafe.json` · `burger.json` | Overpass API 질의 결과에서 브랜드가 잡히는 점만 추림 | **OpenStreetMap 기여자** | **ODbL 1.0.** 재배포·상업 이용 가능하되 ① 출처 표기 ② **파생 데이터베이스도 같은 라이선스** ③ 라이선스 고지 |
| `sgg.json` (시군구 경계, 단순화) | [southkorea-maps](https://github.com/southkorea/southkorea-maps) `kostat/2018/json/skorea-municipalities-2018-geo.json` | **통계청(KOSTAT)** 자료 · 정리 = Team POPONG / Justin Meyers | 원 저장소 표기: **“KOSTAT: Free to share or remix.”** 공유·변형 가능 |
| `sgg-*.json` (시군구별 점유율) | 위 둘로 계산한 값 | 우리 계산 | 재료가 ODbL 이므로 **이 표도 ODbL** 로 둔다 |

## 안 쓴 것 — 일부러

같은 저장소의 **GADM 폴더는 쓰지 않았다.** GADM 은 「비상업 목적만 · **재배포 금지**」라
공개 저장소에 같이 실을 수 없다. 경계가 필요하면 `kostat/` 쪽만 쓸 것.

## 화면에서의 표기

- 아래 문장 줄에 자료 출처가 늘 뜬다 (`territory.msg.source` — 지금은
  `OpenStreetMap (ODbL) — 표본`).
- 지도 타일은 `tile.openstreetmap.org` 이고 오른쪽 아래에 `© OpenStreetMap` 을 그린다
  (`geomap.ts` 의 `attribution`). 타일 서버는 [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
  아래 있는 **호의**다 — 트래픽이 커지면 우리 타일로 옮겨야 한다.

## 앞으로 — 상가정보 CSV 로 갈아탈 때

전수 데이터(공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」)로 바꾸면 **라이선스가 바뀐다.**
받는 자리의 *이용허락범위*(보통 제1유형 = 출처표시)를 확인하고 이 표를 먼저 고칠 것.
OSM 자료와 **섞어서** 내보내면 ODbL 의 share-alike 가 전체에 붙는다 — 섞지 말고 갈아 끼울 것.
