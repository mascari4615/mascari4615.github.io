/**
 * 시험용 서버가 **배포와 같은 모양**의 HTML 을 내게 한다 (2026-08-16)
 *
 * ★ 왜: 이 저장소의 화면 몇 장은 Jekyll 앞머리(front matter)로 시작한다.
 *       ---
 *       layout: none
 *       permalink: /
 *       ---
 *   배포에서는 Jekyll 이 이걸 **떼고** 내보낸다. 그런데 시험 서버들은 파일을 날것으로 낸다 . 
 *   그러면 브라우저가 그 세 줄을 **본문 글자**로 읽고, 그 순간 `<head>` 가 닫힌 것으로 친다.
 *   뒤따르는 `<head>` 안의 것들이 전부 body 로 밀린다.
 *
 *   여태는 글자로 보일 뿐 동작에는 지장 없다고 적혀 있었고 실제로 그랬다. 그러다
 *   보안 meta(CSP)를 넣자 **head 밖이라 무시된다**며 시험이 빨개졌다. 배포에서는 멀쩡한데.
 *   시험 환경이 배포와 다르면, 시험은 없는 문제를 잡고 있는 문제를 놓친다.
 *
 * 그래서 낼 때 떼어 준다. 줄 수는 유지하지 않는다(줄 번호를 쓰는 검사가 없다).
 */

/** 파일 맨 앞의 `---` ... `---` 앞머리를 뗀다. 없으면 그대로 돌려준다. */
export function stripFrontMatter(text) {
  if (text.startsWith('---') === false) return text;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return text;
  const after = text.indexOf('\n', end + 1);
  return after < 0 ? '' : text.slice(after + 1);
}
