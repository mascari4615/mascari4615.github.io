---
title: "🌚 Spring-Boot-Memo"
date: 2024-04-03. 15:00
# last_modified_at: 2024-04-19. 13:24
# last_modified_at: 2024-05-02. 01:08
last_modified_at: 2024-05-31. 08:29
categories: [⭐Computer, 🌚Computer-General]
tags: [Spring-Boot, Memo]
---

[참고 : 코딩레시피, '스프링부트 회원프로젝트'](https://www.youtube.com/playlist?list=PLV9zd3otBRt5ANIjawvd-el3QU594wyx7)  
[참고 : 어라운드 허브 스튜디오 - Around Hub Studio, '스프링 부트 (Spring Boot) 강의'](https://www.youtube.com/playlist?list=PLlTylS8uB2fBOi6uzvMpojFrNe7sRmlzU)  
[참고 : 개발자 유미 - Around Hub Studio, '스프링 시큐리티'](https://www.youtube.com/playlist?list=PLJkjrxxiBSFCKD9TRKDYn7IE96K2u3C3U)  
[참고 : Peony의 기록 창고, '스프링부트와 aws로 혼자 구현하는 웹서비스'](https://myeongju00.tistory.com/55#article-2--rds-%EC%9D%B8%EC%8A%A4%ED%84%B4%EC%8A%A4-%EC%83%9D%EC%84%B1%ED%95%98%EA%B8%B0)

## **💫 QR**

[참고 : 내가 보려고 만든 개발 (Tech) blog, '[SpringBoot] QR코드 생성 & Test(링크이동) - zxing'](https://lucas-owner.tistory.com/55)  

## **💫 Cannot resolve symbol 'log'**

Class에 `@Slf4j` 달아줘서 해결  

## **💫 Whitelabel Error Page**

`index.html` 만들어서 해결,  
Class에 `@RestController`, `@RequiredArgsConstructor` 달아주니까 해결  

## **💫 인텔리제이 자동완성**

`soutm` : `System.out.println("className.methodName = " + param);`  
`soutp` : `System.out.println("param = " + param);`  
Alt + Enter : 변수 만들어 담기  

## **💫 [MySql] SQL Error [1064] [42000]: You have an error in your SQL syntax**

말그대로 문법에 문제가 있다는 것.  

## **💫 RestController**

[`@RestController`는 뷰페이지 리턴이 안된다.](https://okky.kr/questions/479475)  

## **💫 Thymeleaf**

[Thymeleaf](http://www.thymeleaf.org)  

### ***🫧 Thymeleaf HTML에서 Security 정보 가져오기***

```html
<html xmlns:th="http://www.thymeleaf.org" xmlns:sec="http://www.thymeleaf.org/extras/spring-security">
<p th:text="${#authentication.name}"></p>
<p th:text="${#authentication.authorities}"></p>
<p th:text="${#authentication.authenticated}"></p>
```

[참고 : cornarong의 블로그, '타임리프로 화면단에서 사용자 시큐리티 정보 가져오기'](https://cornarong.tistory.com/73)  

### ***🫧 Thymeleaf 조건문***

```html
<div th:if="${#lists.isEmpty(ticketList)}">
 <p>대기중인 티켓이 없습니다.</p>
</div>
```

[참고 : '[Springboot] Thymeleaf each문, if문(else if문, 조건이 여러 개인 if문)'](https://velog.io/@seratpfk/Springboot-Thymeleaf-if문-each문)  

## **💫 MariaDB 비밀번호 초기화**

[bin 디렉토리에서 `mysql` 말구 `.\mysql`](https://jemmaa.tistory.com/26)  

## **💫 HTML에서 바로 Style 적용**

`<style>` 태그 안에 넣어주면 된다.  

## **💫 FK 지정**

[참고 : Velog, 'JPA로 엔티티, 테이블 생성하기 / PK, FK 연결하기'](https://velog.io/@seulki412/Spring-Boot-JPA로-엔티티-테이블-생성하기-PK-FK-연결하기)  

```java
public class B {
 @Id @GeneratedValue
 @Column(name = "B_ID")
 private Long id;
 
 // @Column(name = "A_ID")
 // private Long aId;
 
 @ManyToOne
 @JoinColumn(name = "A_ID")
 private A a;
}

public class A {
 @Id @GeneratedValue
 @Column(name = "A_ID")
 private Long id;
}
```

## **💫 TransientPropertyValueException~**

FK로 사용되는 객체가 저장되지 않아서.  
오류를 해결해주기 위해서는 영속성 전이를 위해 cascade type을 지정.  
`@ManyToOne(cascade = CascadeType.ALL)`  
<https://velog.io/@jummi10/resolve-TransientPropertyValueException>  

## **💫 Session을 이용한 로그인 구현**

<https://chb2005.tistory.com/175>  
<https://github.com/Changbum97/Springboot-Login-Study>  

## **💫 패키지 구조 (계층형 구조, 도메인형 구조)**

패키지 구조 (계층형 구조, 도메인형 구조)  
<https://youngsuk-dev.tistory.com/21>  

## **💫 redirect**

`Controller`에서 return 값을 `redirect:/`로 하면  
`/`로 리다이렉트 된다.  

## **💫 Enum**

[참고 : '[Spring] Enum 타입을 DB에 저장하기'](https://velog.io/@zioo/Spring-Enum-타입을-DB에-저장하기)  

## **💫 배포, 응답없음**

---

보안 그룹-인바운드 규칙 편집하여 포트번호 8080 열기  
[참고 : s0nnyday.log, '[AWS EC2] 오류 - EC2, Jar 실행 후 웹 브라우저에 요청 보내도 응답x'](https://velog.io/@s0nnyday/AWS-EC2-배포-SSH프로토콜1-Jar-실행-후-웹-브라우저-테스트)  

## **💫 -Dspring, .yml 환경설정 적용하기**

---

[참고 : monkeyDugi, 'Spring Boot -Dspring으로 환경설정 파일 적용하기'](https://dev-monkey-dugi.tistory.com/33)

## **💫 Failed to initialize JPA EntityManagerFactory: Unable to create requested service [org.hibernate.engine.jdbc.env.spi.JdbcEnvironment] due to: Unable to resolve name [org.hibernate.dialect.MySQL5InnoDBDialect] as strategy [org.hibernate.dialect.Dialect]**

---

```yml
spring:
  jpa:
    # database-platform: org.hibernate.dialect.MySQL5InnoDBDialect
    database-platform: org.hibernate.dialect.MySQL8Dialect
```

[참고 : yesue2.log, 'Failed to initialize JPA EntityManagerFactory: Unable to create requested service [...] due to: Unable to resolve name [org.hibernate.dialect.MySQL5InnoDBDialect] as strategy [...] 에러'](https://velog.io/@yesue/SpringBoot-Failed-to-initialize-JPA-EntityManagerFactory-Unable-to-create-requested-service-...-due-to-Unable-to-resolve-name-org.hibernate.dialect.MySQL5InnoDBDialect-as-strategy-...-에러)

## **💫 Failed to configure a DataSource: 'url' attribute is not specified and no embedded datasource could be configured.**

---

DB 연결 시 필요한 정보가 없거나 잘못된 경우 발생하는 에러  
`properties`, `yml` 파일에 DB 정보를 제대로 입력하거나, DB가 제대로 구성되었는지 확인  

[참고 : hoon's bLog - 'Spring Error | Failed to configure a DataSource: 'url' attribute is not specified and no embedded datasource could be configured.'](https://psip31.tistory.com/139)  

## **💫 java.sql.SQLSyntaxErrorException: Unknown column 't1_0.~' in 'field list' using Hibernate**

---

DB 연결 시 필요한 정보가 없거나 잘못된 경우 발생하는 에러  
불러오려는 DB/테이블이 유효한지, 제대로 구성되었는지 확인  

[참고 : StackOverflow - 'java.sql.SQLSyntaxErrorException: Unknown column 't1_0.division' in 'field list' using Hibernate'](https://stackoverflow.com/questions/75385276/java-sql-sqlsyntaxerrorexception-unknown-column-t1-0-division-in-field-list)  

## **💫 org.hibernate.HibernateException: The database returned no natively generated identity value**

---

해당 Column이 Auto Increment가 아닌 경우 발생하는 에러  

[참고 : StackOverflow - 'org.hibernate.HibernateException: The database returned no natively generated identity value'](https://stackoverflow.com/questions/7172657/org-hibernate-hibernateexception-the-database-returned-no-natively-generated-id)  

## **💫 Linux 명령어**

---

- `cd`
  - `cd /` : 루트 (최상위)
  - `cd ..` : 상위
  - `cd ~` : 홈
  - `cd -` : 이전
- `ls`

- `touch` : 파일 생성

- `vim`
  - `ESC` : 명령 모드
  - `i`, `Insert`, `a`, `A` : 입력 모드
    - `:w` : 저장
    - `:q` : 종료
    - `:wq` : 저장 후 종료
    - `:q!` : 강제 종료

- `rmdir` : 디렉토리 삭제
  - `-r` : 하위 디렉토리까지 삭제
  - `-f` : 강제 삭제
  - `rm -rf` : 강제 삭제

- `mv` : 파일 이동
  - `mv 파일명 이동할경로` : 파일 이동

- `cp` : 파일 복사
  - `cp 파일명 복사할경로` : 파일 복사

## **💫 TODO:**

- `form`에서 `type = "tel"` 받아오는 법
- <https://tecoble.techcourse.co.kr/post/2023-08-16-concurrency-managing/?mibextid=Zxz2cZ>
- <https://www.inflearn.com/questions/193822>
- <https://jaime-note.tistory.com/350>
- <https://github.com/lcalmsky/spring-boot-app>
  - <https://github.com/lcalmsky/spring-boot-app/blob/e669194bd5b91b56b4cc9cf093e69c55505d7ca4/src/main/resources/templates/event/view.html#L122>
  - <https://github.com/lcalmsky/spring-boot-app/blob/e669194bd5b91b56b4cc9cf093e69c55505d7ca4/src/main/resources/templates/fragments.html>
  - <https://github.com/lcalmsky/spring-boot-app/blob/e669194bd5b91b56b4cc9cf093e69c55505d7ca4/src/main/java/io/lcalmsky/app/modules/event/domain/entity/Event.java>
- <https://velog.velcdn.com/images/lgwk0642/post/bcbc7c8a-b3b6-4496-88f7-4fe856385ad1/image.png>
- <https://www.slideshare.net/slideshow/db-42499372/42499372>
- <https://hyejin.tistory.com/279>
- [SPA](https://linked2ev.github.io/devlog/2018/08/01/WEB-What-is-SPA/)
- <https://bcp0109.tistory.com/379>
- <https://bcp0109.tistory.com/380>
- <https://velog.io/@on8214/스프링-시큐리티-OAUTH-2.0-카카오-로그인>
- Spring Bean
- <https://developers.kakao.com/console/app>
- <https://github.com/intshc/Oauth2Login>
- <https://kim-jong-hyun.tistory.com/150>
- <https://velog.io/@yeezze/다수의-유저들을-선착순으로-줄세워보자>
- <https://velog.io/@dani0817/Spring-Boot-페이징Paging-적용>
- <https://wikidocs.net/book/7601>
- <https://jineeblog.tistory.com/10>
- <https://stackoverflow.com/questions/60103377/ec2-instance-connect-browser-based-ssh-connection-doesnt-work>
- <https://www.reddit.com/r/linuxmint/comments/15c0nif/permission_denied_everywhere/?rdt=65291&onetap_auto=true&one_tap=true>
- <https://growth-coder.tistory.com/235>
- <https://m.blog.naver.com/jeonsr/221792705148>
- <https://docs.aws.amazon.com/ko_kr/AWSEC2/latest/UserGuide/putty.html>
