/**
 * 받아 둔 three 를 **주소로** 부른다 — 이 저장소의 관례(`room/`·`tools/atlas-3d/`)와 같은 한 벌.
 *
 * npm 의존을 안 쓰는 이유: 위젯 번들에 600KB 를 실으면 안 된다(위젯 천장 gzip 64KB,
 * `scripts/audit-bundle-budget.mjs`). 대신 **3D 로 볼 때만** 받는 조각이 이 주소를 부르고,
 * 같은 파일을 쓰는 다른 3D 화면들과 브라우저 캐시를 나눠 쓴다.
 *
 * 타입은 `@types/three`(devDependency — 받는 것에는 안 들어간다)에서 그대로 빌려 온다.
 */
declare module '/packages/3d/vendor/three.module.min.js' {
  export * from 'three';
}
