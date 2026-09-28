---
title: "Burp Suite 진단 결과를 HTTP·TLS·DNS 관점에서 분석하고 개선한 경험"
description: "LMS 웹 서비스의 보안 진단 결과를 HTTP·TLS·DNS와 인증 구조 관점에서 분석했습니다. HSTS 적용, CORS 설정 정리, 에러 응답 개선 등을 통해 정보성 항목을 포함한 보고 건수를 40건에서 3건으로 줄이고, 남은 항목의 원인을 검토한 경험을 정리합니다."
pubDate: "2026-03-01"
category: "Cloud"
tags:
  - "Burp Suite"
  - "Web Security"
  - "HTTP"
  - "TLS"
  - "Nginx"
notionPageId: "3e9410cd-c737-8086-b048-c741044fbd70"
---

<!-- notion-sync: generated -->

> 클라우드에 배포한 LMS 웹 서비스의 보안 진단 결과를 분석하고, Nginx와 Spring Boot 설정을 개선했습니다. 정보성 항목을 포함한 보고 건수는 40건에서 3건으로 감소했으며, 남은 항목은 인증 구조와 인증서 신뢰 환경을 기준으로 추가 분석했습니다.
## 프로젝트 개요
<table header-row="true">
<tr>
<td>구분</td>
<td>내용</td>
</tr>
<tr>
<td>수행 환경</td>
<td>클라우드스퀘어 현장실습</td>
</tr>
<tr>
<td>대상</td>
<td>COSS 클라우드 인프라에 배포한 개인 LMS 웹 서비스</td>
</tr>
<tr>
<td>진단 기록</td>
<td>1차 2026.02.25 / 2차 2026.02.27</td>
</tr>
<tr>
<td>목표</td>
<td>웹 보안 진단 결과의 원인을 분석하고, 필요한 설정을 개선한 뒤 재검증</td>
</tr>
<tr>
<td>담당 역할</td>
<td>진단 리포트 분석, HTTP 요청·응답 확인, 보안 설정 개선, 재진단 결과 비교, 증빙 정리</td>
</tr>
<tr>
<td>주요 도구·기술</td>
<td>Burp Suite, Nginx, Spring Boot, curl, SSL Labs, DNS 로그 도구, HTTP, TLS, HSTS, CORS</td>
</tr>
</table>
## Burp Suite란?
Burp Suite는 PortSwigger에서 제공하는 웹 애플리케이션 보안 테스트 도구입니다. 브라우저와 서버 사이의 HTTP 요청·응답을 확인하고, 요청을 수정해 다시 보내면서 서버가 어떤 방식으로 처리하는지 분석할 수 있습니다.
대표 기능으로는 트래픽을 확인하는 Proxy, 요청을 수정·재전송하는 Repeater, 웹 서비스를 탐색하고 보안 이슈를 자동으로 점검하는 Scanner가 있습니다. 자동 Scanner는 Community Edition의 기본 기능이 아니며, Professional 등 이를 지원하는 제품에서 제공합니다.
이번 프로젝트에서는 Burp Suite 진단 리포트에 기록된 요청·응답을 출발점으로 삼아, 보고된 현상이 실제 서비스에서 어떤 의미를 갖는지 분석했습니다.
## 문제 상황과 접근 방법
초기 진단에서는 6개 유형에 걸쳐 총 40건이 보고되었습니다. 이 중 36건은 Information 등급이었고, 같은 원인이 여러 요청 위치에서 반복 보고된 항목도 있었습니다.
따라서 보고된 건수를 그대로 독립적인 취약점 개수로 해석하기보다, 이슈를 원인과 성립 조건에 따라 나누었습니다.
<table header-row="true">
<tr>
<td>분석 단계</td>
<td>수행 내용</td>
</tr>
<tr>
<td>보고서 분류</td>
<td>심각도, 신뢰도, 요청 위치, 이슈 유형 확인</td>
</tr>
<tr>
<td>트래픽 분석</td>
<td>요청 헤더, 인증 정보 전달 방식, 응답 헤더·상태 코드·본문 확인</td>
</tr>
<tr>
<td>조치 판단</td>
<td>실제 설정 개선이 필요한 항목과 추가 검증이 필요한 항목 구분</td>
</tr>
<tr>
<td>설정 개선</td>
<td>HSTS 적용, 불필요한 CORS 설정 정리, Host 처리 강화, 에러 응답 개선</td>
</tr>
<tr>
<td>결과 검증</td>
<td>curl 응답, SSL Labs 결과, DNS 로그, Burp Suite 재진단 결과 비교</td>
</tr>
</table>
## 취약점별 분석 및 조치
### 1. CSRF — “스캐너가 의심한 이유”와 “실제 성립 조건”을 분리해서 봄
Burp Suite는 `/api/lectures/1/enroll`, `/api/lectures/1/complete` 요청을 CSRF 가능성이 있는 요청으로 보고했습니다.
CSRF는 사용자가 로그인한 상태에서 악성 사이트에 접속했을 때, 브라우저가 인증 쿠키를 자동으로 포함해 원하지 않는 요청을 보내는 공격입니다.
즉, CSRF가 성립하려면 핵심 조건이 있습니다.
<table header-row="true">
<tr>
<td>CSRF 성립 조건</td>
<td>내 서비스에서의 확인 결과</td>
</tr>
<tr>
<td>브라우저가 인증 정보를 자동으로 요청에 포함해야 함</td>
<td>해당 없음</td>
</tr>
<tr>
<td>인증 정보가 Cookie 기반이어야 함</td>
<td>해당 없음</td>
</tr>
<tr>
<td>공격자가 동일한 요청을 외부 사이트에서 유도할 수 있어야 함</td>
<td>Authorization 헤더 필요</td>
</tr>
</table>
제 LMS 서비스는 인증 정보를 Cookie가 아니라 **Authorization: Bearer Token** 헤더로 전달하고 있었습니다.
이 토큰은 브라우저가 자동으로 붙여주는 값이 아니라, 프론트엔드 코드가 API 요청 시 직접 헤더에 넣어야 하는 값입니다.
따라서 공격자가 만든 외부 사이트에서 단순 Form, Image, Script 요청을 유도하더라도 브라우저가 Bearer Token을 자동으로 실어 보내지 않습니다. 이 때문에 전통적인 CSRF 공격 조건은 성립하지 않는다고 판단했습니다.
다만 Burp Suite는 “요청이 상태 변경을 수행한다”는 점과 “Referer 변조 후에도 요청이 처리된다”는 점을 근거로 보수적으로 Medium / Tentative로 표시했습니다.
**판단 결과**
CSRF 항목은 2차 리포트에서도 남아 있었지만, 인증 구조상 실제 CSRF 공격으로 이어지기 어렵다고 판단했습니다. 단, 향후 인증 방식을 Cookie 기반으로 변경한다면 CSRF Token 또는 Origin / Referer 검증을 추가해야 합니다.
\[이미지 삽입 추천\]
**발표자료 p.14 \~ p.16**
- p.14: CSRF가 성립하는 조건과 성립하지 않는 조건 비교
- p.15: 인증 정보가 Cookie에 저장되지 않는 화면
- p.16: API 요청이 Authorization Bearer Token 기반으로 수행되는 화면<br>※ 캡처 시 Bearer Token 값은 반드시 마스킹
---
### 2. TLS 인증서 — 실제 인증서 문제인지, Burp 실행 환경 문제인지 분리함
Burp Suite는 TLS 인증서를 “not trusted”로 보고했습니다.
처음에는 세 가지 가능성을 의심했습니다.
<table header-row="true">
<tr>
<td>원인 후보</td>
<td>확인 내용</td>
</tr>
<tr>
<td>인증서 체인 문제</td>
<td>서버 인증서와 중간 / 루트 인증서 체인 확인</td>
</tr>
<tr>
<td>취약한 TLS 알고리즘</td>
<td>SSL Labs로 프로토콜 및 Cipher Suite 확인</td>
</tr>
<tr>
<td>Burp 신뢰 저장소 문제</td>
<td>Burp 내장 JRE와 OS / 브라우저 신뢰 저장소 차이 확인</td>
</tr>
</table>
먼저 SSL Labs를 통해 TLS 설정을 확인했고, 취약한 TLS 프로토콜과 암호화 알고리즘이 노출되지 않도록 설정을 점검했습니다. 이후 SSL Labs 기준으로는 A 등급이 확인되었습니다.
또한 Burp Suite에서 출력한 인증서 정보를 확인했을 때 서버 인증서는 만료되지 않았고, Self-Signed 인증서도 아니었으며, SHA256withRSA와 2048bit 공개키를 사용하는 정상 인증서였습니다.
핵심 원인은 Burp Suite의 인증서 신뢰 판단 기준이었습니다.
Burp는 Windows나 Chrome의 신뢰 저장소가 아니라, **Burp 내장 JRE의 Java trust store**를 기준으로 인증서를 신뢰할지 판단합니다. 시스템 JDK trust store에는 NAVER Root CA가 존재했지만, Burp 내장 JRE trust store에는 해당 Root CA가 없어 Burp가 “not trusted”로 판단할 수 있었습니다.
**판단 결과**
TLS 인증서 항목은 2차 리포트에서도 남아 있었지만, 서비스의 인증서 체인이나 암호화 강도 문제라기보다 Burp 실행 환경의 CA 신뢰 기준 차이로 발생한 항목으로 판단했습니다.
![SSL Labs A 등급 확인 화면](/notion-assets/burp-suite-web-security-analysis/image-001.png)
![인증서 체인 / 알고리즘 점검 결과](/notion-assets/burp-suite-web-security-analysis/image-002.png)
![시스템 JDK trust store와 Burp 내장 JRE trust store 차이 비교](/notion-assets/burp-suite-web-security-analysis/image-003.png)
---
### 3. HSTS 미적용 — HTTPS 리다이렉션과 HSTS는 다르다는 점을 확인함
초기 리포트에서는 HSTS가 적용되지 않아 “Strict transport security not enforced” 항목이 보고되었습니다.
HSTS는 브라우저에게 다음과 같은 정책을 알려주는 보안 헤더입니다.
```plain text
Strict-Transport-Security: max-age=31536000; includeSubDomains
```
이 정책이 적용되면 브라우저는 해당 사이트를 HTTP가 아니라 HTTPS로만 접속해야 한다고 기억합니다.
중요한 점은 HSTS가 단순한 HTTP → HTTPS 리다이렉션과 다르다는 점입니다.
<table header-row="true">
<tr>
<td>구분</td>
<td>동작 방식</td>
</tr>
<tr>
<td>HTTP → HTTPS 리다이렉션</td>
<td>사용자가 HTTP로 접속한 뒤 서버가 HTTPS로 돌려보냄</td>
</tr>
<tr>
<td>HSTS</td>
<td>브라우저가 애초에 HTTP 요청 자체를 보내지 않도록 기억함</td>
</tr>
</table>
즉, HSTS가 없으면 최초 HTTP 접속 구간에서 SSL Stripping과 같은 공격 가능성이 남습니다.
그래서 HTTPS 응답 헤더에 HSTS 정책을 추가했고, curl로 응답 헤더를 확인한 뒤 Burp Suite 재진단을 수행했습니다.
2차 리포트에서는 HSTS 미적용 항목이 제거되었습니다.
![HSTS 헤더 미설정 상태](/notion-assets/burp-suite-web-security-analysis/image-004.png)
![HSTS 헤더 적용 후 curl 검증 화면](/notion-assets/burp-suite-web-security-analysis/image-005.png)
---
### 4. CORS 설정 — 필요 없는 정책 노출을 제거함
초기 리포트에서는 여러 API 응답에서 CORS 관련 헤더가 노출되어 Information 항목으로 보고되었습니다.
CORS는 서로 다른 Origin 간 요청을 통제하기 위한 브라우저 보안 정책입니다.
하지만 이 LMS 서비스는 프론트엔드와 API가 동일 Origin 구조로 동작하고 있었기 때문에, 일반적인 사용자 요청에서는 CORS 정책이 필요하지 않았습니다.
문제는 응답 헤더에 다음과 같은 정보가 계속 노출되고 있었다는 점입니다.
```plain text
Access-Control-Allow-Origin
Access-Control-Allow-Credentials
```
이 자체가 즉시 공격으로 이어지는 취약점은 아니지만, 불필요한 보안 정책 노출은 공격면으로 해석될 수 있습니다.
따라서 동일 Origin 환경에 맞게 불필요한 CORS 헤더를 제거했습니다.
**조치 결과**
초기 리포트에서 10건 보고되던 CORS Information 항목은 2차 리포트에서 제거되었습니다.
![Access-Control-Allow-\* 헤더가 노출되던 상태](/notion-assets/burp-suite-web-security-analysis/image-006.png)
![동일 Origin 환경에 맞춰 CORS 헤더 제거 후 검증 화면](/notion-assets/burp-suite-web-security-analysis/image-007.png)
---
### 5. DNS 상호작용 — Host / SNI / 프록시 계층까지 확인함
초기 리포트에서는 “External service interaction (DNS)” 항목이 보고되었습니다.
Burp Suite는 OAST 도메인을 발급한 뒤, 이 도메인을 HTTP Host 헤더나 TLS SNI 값에 삽입합니다.
대상 서버가 내부 처리 과정에서 해당 도메인에 대해 DNS 조회를 수행하면, Burp Collaborator가 그 DNS 요청을 수신하고 이슈로 보고합니다.
이 항목은 단순 정보성 이슈처럼 보이지만, 경우에 따라 SSRF나 프록시 설정 문제로 이어질 수 있기 때문에 애플리케이션, 프록시, 인프라 계층을 나눠 확인했습니다.
<table header-row="true">
<tr>
<td>계층</td>
<td>확인 내용</td>
</tr>
<tr>
<td>애플리케이션</td>
<td>외부 URL 호출 코드, Host 기반 URL 조합 로직 존재 여부 확인</td>
</tr>
<tr>
<td>Nginx 프록시</td>
<td>Host 헤더가 upstream으로 그대로 전달되는지 확인</td>
</tr>
<tr>
<td>인프라 / TLS</td>
<td>SNI 기반 외부 도메인 처리 가능성 확인</td>
</tr>
</table>
조치 과정에서는 Nginx에서 허용된 Host만 처리하도록 설정하고, 비정상 Host 요청이 정상 upstream 처리로 이어지지 않도록 정리했습니다. 또한 `X-Forwarded-Host`, `Forwarded` 계열 헤더 처리도 점검했습니다.
이후 dnslog.cn을 사용해 별도의 OAST 검증을 수행했습니다.
외부 도메인을 Host 헤더와 SNI 값에 주입해 요청했지만, dnslog 서버에서 DNS 질의가 관측되지 않았고, 2차 Burp Suite 리포트에서도 DNS 상호작용 항목이 제거되었습니다.
![dnslog.cn 서브도메인 발급 화면](/notion-assets/burp-suite-web-security-analysis/image-008.png)
![Host 헤더에 외부 도메인을 주입한 DNS 상호작용 재현 테스트](/notion-assets/burp-suite-web-security-analysis/image-009.png)
![TLS SNI 기반 외부 도메인 주입 재현 테스트](/notion-assets/burp-suite-web-security-analysis/image-010.png)
![dnslog에서 DNS 질의가 관측되지 않은 검증 화면](/notion-assets/burp-suite-web-security-analysis/image-011.png)
---
### 6. 입력값 반사 — Spring Boot 에러 응답에서 path 노출 제거
초기 리포트에서 가장 많은 비중을 차지한 항목은 “Input returned in response”였습니다.
총 25건이 보고되었습니다.
Burp Suite는 URL 경로에 랜덤 문자열을 삽입했고, 서버가 400 또는 404 에러를 반환할 때 해당 경로가 JSON 응답의 `path` 필드에 그대로 포함되는 것을 확인했습니다.
예시는 다음과 같은 구조였습니다.
```plain text
{
  "timestamp":"...",
  "status":404,
  "error":"Not Found",
  "path":"/api/lectures/random-value"
}
```
입력값 반사는 그 자체로 즉시 취약점이라고 보기는 어렵지만, XSS, Content Spoofing, Open Redirect 등 클라이언트 측 취약점의 전제 조건이 될 수 있습니다.
또한 에러 응답에 내부 요청 경로가 불필요하게 노출되는 것도 좋은 설계는 아니라고 판단했습니다.
조치는 두 가지로 진행했습니다.
<table header-row="true">
<tr>
<td>조치</td>
<td>내용</td>
</tr>
<tr>
<td>ErrorAttributes 커스터마이징</td>
<td>Spring Boot 기본 에러 속성에서 `path` 제거</td>
</tr>
<tr>
<td>에러 설정 강화</td>
<td>`server.error.include-path: never` 설정</td>
</tr>
</table>
조치 후 정상 Bearer Token 상태에서 비정상 경로를 요청해도 응답 Body에 `path` 필드가 노출되지 않는 것을 확인했습니다.
2차 Burp Suite 리포트에서는 입력값 반사 25건이 모두 제거되었습니다.
![입력값 반사 원인과 조치 구조](/notion-assets/burp-suite-web-security-analysis/image-012.png)
![조치 후 `path` 필드가 노출되지 않는 검증 화면](/notion-assets/burp-suite-web-security-analysis/image-013.png)
---
## 결과
이번 프로젝트의 핵심 결과는 단순히 “취약점 개수를 줄였다”가 아니라, **스캐너 결과를 실제 트래픽 흐름과 보안 구조에 맞게 해석했다는 점**입니다.
<table header-row="true">
<tr>
<td>항목</td>
<td>결과</td>
</tr>
<tr>
<td>초기 진단 결과</td>
<td>40건</td>
</tr>
<tr>
<td>재진단 결과</td>
<td>3건</td>
</tr>
<tr>
<td>제거한 항목</td>
<td>37건</td>
</tr>
<tr>
<td>제거율</td>
<td>92.5%</td>
</tr>
<tr>
<td>완전히 제거된 항목</td>
<td>HSTS, CORS, DNS 상호작용, 입력값 반사</td>
</tr>
<tr>
<td>재검증 후 분류한 항목</td>
<td>CSRF, TLS 인증서</td>
</tr>
</table>
특히 Information 항목 36건을 0건으로 줄였습니다.
보안 리포트에서 Information은 낮은 심각도로 보이지만, 운영 관점에서는 불필요한 헤더 노출, 에러 응답 정보 노출, 외부 DNS 상호작용처럼 공격면을 넓힐 수 있는 신호라고 판단했습니다.
---
## 배운 점
### 1. 보안 스캐너 결과는 “정답”이 아니라 “분석해야 할 신호”다
Burp Suite가 보고한 항목을 그대로 취약점으로 받아들이지 않고, 요청 헤더, 응답 헤더, 인증 방식, TLS 신뢰 저장소, DNS 조회 여부를 기준으로 다시 검증했습니다.
이를 통해 스캐너가 실제 위험을 잘 포착하는 경우도 있지만, 실행 환경이나 인증 구조 차이 때문에 보수적으로 표시하는 경우도 있다는 것을 배웠습니다.
---
### 2. 웹 보안은 애플리케이션만의 문제가 아니라 트래픽 흐름 전체의 문제다
이번 프로젝트에서는 Spring Boot 코드만 본 것이 아니라, HTTP Header, TLS Handshake, DNS 조회, Nginx 프록시, Host / SNI 처리까지 함께 봐야 했습니다.
특히 DNS 상호작용 이슈를 분석하면서 웹 서비스 보안도 결국 네트워크 계층과 강하게 연결되어 있다는 점을 체감했습니다.
---
### 3. 조치는 “설정 변경”이 아니라 “재현 가능한 검증”까지 포함해야 한다
HSTS는 curl로 헤더를 검증했고, TLS는 SSL Labs와 인증서 정보를 함께 확인했습니다.
DNS 상호작용은 dnslog.cn으로 별도 OAST 테스트를 수행했고, 입력값 반사는 비정상 경로 요청을 직접 재현해 응답 Body를 확인했습니다.
보안 조치의 끝은 “수정했다”가 아니라 “다시 공격 시나리오를 넣어도 문제가 재현되지 않는다”를 증명하는 것이라는 점을 배웠습니다.
### 근거 자료
- 프로젝트 수행 내용 및 검증 화면: 기존 「Burp Suite 기반 웹 트래픽 취약점 분석」 PDF
- 1차 진단: `report(2).html`, 2026.02.25
- 2차 진단: `report3(2).html`, 2026.02.27
- 도구 설명: [PortSwigger — Burp Suite tools](https://portswigger.net/burp/documentation/desktop/tools)
공개 페이지에는 보고서의 요약과 필요한 증빙만 선별해 사용합니다. 원본 HTML과 일부 PDF 캡처에는 Bearer Token이 포함되어 있으므로, 공개 캡처에서 해당 값을 가립니다.
