---
title: "[Network] DNS를 바꾸지 않고 도메인 접속 대상 변경하기: Windows hosts 파일"
description: "Windows hosts 파일에 도메인과 IP를 직접 매핑해 실제 DNS 레코드를 변경하지 않고도 로컬 PC의 접속 대상을 바꾸는 과정을 실습합니다. ping·curl·브라우저를 통해 hosts 반영 여부와 HTTP/HTTPS 차이까지 확인합니다."
pubDate: "2026-03-24"
category: "Network"
tags:
  - "Network"
  - "Troubleshooting"
notionPageId: "3ea410cd-c737-8033-beda-f2c3f1710a03"
---

<!-- notion-sync: generated -->

웹브라우저 주소창에 `naver.com` 같은 도메인을 입력하면 보통 이런 흐름을 떠올린다.
```plain text
도메인 입력
   ↓
DNS 서버에 질의
   ↓
IP 주소 확인
   ↓
해당 서버로 접속
```
그런데 실제로는 **무조건 외부 DNS 서버부터 찾아가는 것은 아니다.**
운영체제는 네트워크의 DNS 서버에 질의를 보내기 전에 로컬에서 이름을 해석할 수 있는 정보가 있는지 확인한다. Windows에서는 대표적으로 **DNS 캐시와 hosts 파일**이 이 과정에 관여한다.
이번 글에서는 Windows의 `hosts` 파일을 직접 수정해서 `naver.com`을 전혀 다른 서버 IP로 연결해 보고, **DNS 서버의 레코드를 바꾸지 않았는데도 접속 대상이 달라지는 모습**을 확인해 본다.
<callout icon="💡" color="blue_bg">
	**이번 실습의 핵심**
	`hosts` 파일에 도메인과 IP를 직접 매핑하면 실제 DNS 레코드를 수정하지 않고도 **내 PC에서만 해당 도메인이 특정 IP를 바라보도록 만들 수 있다.**
</callout>
---
## 1. 변경 전 [naver.com](http://naver.com)에 접속해 보기
먼저 아무 설정도 바꾸지 않은 상태에서 브라우저로 `naver.com`에 접속했다.
당연히 평소와 같이 네이버가 정상적으로 열린다.
![**hosts 파일을 수정하기 전 **[**naver.com**](http://naver.com)**에 정상 접속한 모습**](/notion-assets/windows-hosts-dns-resolution/image-001.jpg)
아직 `hosts` 파일에 별도의 매핑을 추가하지 않았기 때문에 `naver.com`은 정상적인 네이버 서버 주소로 해석된다.
---
## 2. Windows hosts 파일은 어디에 있을까?
Windows의 hosts 파일은 다음 위치에 있다.
```plain text
C:\Windows\System32\drivers\etc\hosts
```
![**Windows의 hosts 파일 위치**](/notion-assets/windows-hosts-dns-resolution/image-002.jpg)
hosts는 확장자가 없는 텍스트 파일이다.
형식도 간단하다.
```plain text
IP주소 도메인
```
예를 들어 다음과 같이 작성하면,
```plain text
192.168.0.10 test.example.com
```
이 PC에서 `test.example.com`이라는 이름을 해석할 때 `192.168.0.10`을 사용하도록 지정할 수 있다.
즉, hosts 파일은 일종의 **로컬 도메인 → IP 매핑표**라고 볼 수 있다.
---
## 3. [naver.com](http://naver.com)을 내 서버 IP로 바꿔보기
이번에는 hosts 파일에 다음 한 줄을 추가했다.
```plain text
101.79.17.214 naver.com
```
![**hosts 파일에 **[**naver.com**](http://naver.com)** → 101.79.17.214 매핑을 추가한 모습**](/notion-assets/windows-hosts-dns-resolution/image-003.jpg)
`101.79.17.214`는 이번 실습에 사용한 클라우드 서버의 공인 IP다.
그리고 이 서버에서는 80번 포트에 Nginx를 실행해 두었다.
이 설정의 의미는 다음과 같다.
```plain text
naver.com → 101.79.17.214
```
여기서 중요한 점이 있다.
**네이버의 실제 DNS 레코드를 수정한 것이 아니다.**
단지 내 PC의 hosts 파일만 바꿨기 때문에 이 설정은 **내 PC에만 적용된다.**
다른 사용자가 `naver.com`에 접속하는 데에는 아무런 영향이 없다.
---
## 4. DNS 캐시 초기화하기
hosts 파일을 수정한 뒤에는 기존 이름 해석 결과가 캐시에 남아 있는 영향을 줄이기 위해 DNS 캐시를 비워준다.
관리자 권한으로 PowerShell 또는 명령 프롬프트를 실행하고 다음 명령을 입력한다.
```powershell
ipconfig /flushdns
```
![**ipconfig /flushdns 명령으로 Windows DNS 캐시를 초기화한 모습**](/notion-assets/windows-hosts-dns-resolution/image-004.jpg)
정상적으로 실행되면 DNS Resolver Cache가 초기화되었다는 메시지가 출력된다.
---
## 5. ping으로 이름 해석 결과 확인하기
이제 정말 `naver.com`이 우리가 지정한 IP를 바라보는지 확인해 보자.
```powershell
ping naver.com
```
![[**naver.com**](http://naver.com)**이 hosts에 지정한 101.79.17.214로 해석되는 모습**](/notion-assets/windows-hosts-dns-resolution/image-005.jpg)
출력을 보면 다음과 같이 `naver.com` 옆에 우리가 지정한 IP가 표시된다.
```plain text
naver.com [101.79.17.214]
```
즉,
```plain text
naver.com
   ↓
101.79.17.214
```
로 이름 해석이 이루어진 것이다.
사진에서는 ping 요청 자체는 Timeout이 발생한다.
하지만 이것은 hosts 설정에 실패했다는 뜻이 아니다.
실습 서버에서 ICMP를 인바운드로 허용하지 않았기 때문에 Echo Reply가 돌아오지 않는 것이다.
우리가 확인하려는 핵심은 응답 성공 여부가 아니라 [**naver.com**](http://naver.com)**이라는 이름이 101.79.17.214로 변환되었느냐**이다.
그리고 이 부분은 정상적으로 확인됐다.
---
## 6. curl로 실제 HTTP 요청을 보내보자
이번에는 단순히 IP 변환만 확인하는 것이 아니라 실제 HTTP 요청을 보내 본다.
```powershell
curl http://naver.com
```
![**curl **[**http://naver.com**](http://naver.com)** 요청이 실제 네이버가 아닌 실습 서버의 Nginx로 전달된 모습**](/notion-assets/windows-hosts-dns-resolution/image-006.jpg)
여기서 재미있는 일이 벌어진다.
`naver.com`으로 요청했지만 실제 네이버의 HTML이 아니라 **101.79.17.214 서버의 Nginx가 제공하는 응답**이 반환된다.
흐름을 단순화하면 다음과 같다.
```plain text
curl http://naver.com
        ↓
Windows에서 naver.com 이름 해석
        ↓
hosts 파일의
101.79.17.214 naver.com
발견
        ↓
101.79.17.214:80으로 연결
        ↓
Nginx 응답
```
즉, 외부 DNS 서버의 `naver.com` 레코드를 건드리지 않았지만 **내 PC에서는 **[**naver.com**](http://naver.com)**이 내 서버를 가리키게 된 것**이다.
---
## 7. 그런데 브라우저에서는 왜 네이버가 그대로 열릴까?
여기까지 확인했다면 브라우저 주소창에도 `naver.com`을 입력해 본다.
그런데 예상과 다르게 **네이버가 정상적으로 열린다.**
![**hosts를 수정했지만 주소창에 **[**naver.com**](http://naver.com)**만 입력했을 때 정상 네이버가 보이는 모습**](/notion-assets/windows-hosts-dns-resolution/image-007.jpg)
그러면 이런 의문이 생긴다.
> Chrome은 hosts 파일을 무시하는 걸까?
그렇지는 않다.
이번 실습에서는 **HTTP와 HTTPS의 차이**도 함께 봐야 한다.
브라우저는 주소창에 도메인만 입력했을 때 HTTPS 접속을 우선할 수 있으며, 이미 알고 있는 HSTS 정책 등에 따라 HTTPS를 강제할 수도 있다.
반면 이번 실습 서버에는 **80번 포트의 HTTP Nginx만 구성**해 두었다.
즉, 우리가 확실하게 검증하고 싶은 것은 다음 요청이다.
```plain text
http://naver.com
```
---
## 8. [http://naver.com으로](http://naver.com으로) 직접 접속해 보기
이번에는 브라우저 주소창에 프로토콜까지 명시해서 입력했다.
```plain text
http://naver.com
```
![[**http://naver.com으로**](http://naver.com으로)** 접속했을 때 hosts에 지정한 실습 서버의 웹페이지가 열린 모습**](/notion-assets/windows-hosts-dns-resolution/image-008.png)
이번에는 정상적인 네이버 페이지가 아니라 **실습 서버에서 서비스 중인 Nginx 페이지가 나타난다.**
결국 실제로 일어난 흐름은 다음과 같다.
```plain text
브라우저에서 http://naver.com 요청
            ↓
Windows가 naver.com 이름 해석
            ↓
hosts 파일에서
101.79.17.214 발견
            ↓
101.79.17.214:80으로 접속
            ↓
실습 서버의 Nginx 페이지 출력
```
이것으로 hosts 파일의 매핑이 실제 네트워크 연결에 적용된다는 것을 직접 확인했다.
---
## 그렇다면 DNS 서버에는 언제 물어보는 걸까?
우리가 흔히 배우는 흐름은 다음과 같다.
```plain text
도메인
 ↓
DNS
 ↓
IP
```
하지만 실제로는 그 전에 **로컬 이름 해석 과정**이 존재한다.
개념적으로 보면 다음과 같다.
```plain text
애플리케이션에서 도메인 접속
          ↓
운영체제의 이름 해석
          ↓
로컬에서 해결 가능한가?
   ├─ DNS 캐시
   ├─ hosts 파일
   └─ 기타 로컬 이름 해석
          ↓
해결하지 못한 경우
          ↓
DNS 서버에 질의
          ↓
IP 주소 응답
```
운영체제와 설정에 따라 내부 처리의 세부 순서는 달라질 수 있지만, 중요한 것은 **hosts에 명시적인 매핑이 있으면 공인 DNS 레코드와 다른 주소를 로컬에서 사용할 수 있다는 점**이다.
이번 실습에서는 이것을 직접 확인했다.
---
## nslookup으로 확인하면 안 될까?
여기서 한 가지 주의할 점이 있다.
hosts 파일을 수정한 뒤 다음 명령을 실행하고 싶을 수 있다.
```powershell
nslookup naver.com
```
하지만 **hosts 반영 여부를 확인하는 용도로 nslookup은 적절하지 않다.**
`nslookup`은 DNS 서버에 질의하여 DNS 레코드를 확인하는 도구다.
따라서 로컬 hosts 파일에
```plain text
101.79.17.214 naver.com
```
이라고 적었다고 해서 `nslookup` 결과까지 반드시 `101.79.17.214`로 바뀌는 것은 아니다.
hosts가 실제 애플리케이션의 이름 해석에 적용되는지 확인하려면 이번 실습처럼 다음 방법이 더 직관적이다.
- `ping naver.com`
- `curl http://naver.com`
- `Test-NetConnection naver.com -Port 80`
- 실제 애플리케이션 또는 브라우저 접속
---
## hosts 파일은 언제 유용할까?
hosts 파일은 단순한 실습용 기능이 아니다.
클라우드나 서버 작업을 하다 보면 꽤 유용하게 사용할 수 있다.
예를 들어 기존 서비스의 DNS가 다음 서버를 바라보고 있다고 하자.
```plain text
service.example.com
        ↓
기존 서버
```
그런데 신규 서버나 Load Balancer로 이전하기 전에 먼저 테스트하고 싶을 수 있다.
아직 DNS를 변경하면 실제 사용자에게도 영향을 주기 때문에 바로 바꾸기는 부담스럽다.
이럴 때 내 PC의 hosts에만 다음과 같이 작성할 수 있다.
```plain text
신규서버IP service.example.com
```
그러면
- 실제 사용자는 계속 기존 서버를 사용하고
- 내 PC에서만 신규 서버로 접속해서
- 웹페이지, 인증서, 리버스 프록시, Load Balancer 동작 등을 미리 점검
할 수 있다.
즉, **DNS 전환 전에 특정 클라이언트에서만 신규 환경을 검증하는 용도**로 매우 유용하다.
---
## 정리
이번 실습에서 확인한 것은 단순하다.
```plain text
hosts 파일 수정 전

naver.com
   ↓
정상적인 네이버 서버
```
```plain text
hosts 파일 수정 후

naver.com
   ↓
101.79.17.214
   ↓
내 실습 서버
```
실제 `naver.com`의 DNS 레코드는 하나도 바꾸지 않았다.
단지 내 PC의 hosts 파일에 한 줄을 추가했을 뿐이다.
<callout icon="✅" color="green_bg">
	**한 줄 정리**
	DNS 서버에 질의하기 전에 로컬 이름 해석이 먼저 개입할 수 있으며, `hosts` 파일을 이용하면 **실제 DNS 레코드를 변경하지 않고도 내 PC에서만 특정 도메인의 접속 대상을 원하는 IP로 바꿔 테스트할 수 있다.**
</callout>
