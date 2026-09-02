/* 위젯 옆의 .css 를 글자로 들여옴 (build.mjs 의 loader `.css: text`). 오락실 arcade.css.
   global.d.ts 는 모듈 파일이라 여기서는 와일드카드 선언이 증강으로 읽혀 안 먹음. 그래서 따로 */
declare module '*.css' {
  const css: string;
  export default css;
}
