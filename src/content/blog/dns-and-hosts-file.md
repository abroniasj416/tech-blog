---
title: "[Network] DNS와 Hosts File(호스트 파일)"
description: "도메인 이름을 IP 주소로 해석하는 DNS의 계층 구조와 동작 원리를 정리하고, 로컬 이름 매핑 파일인 Hosts File과의 차이·우선순위·활용 사례까지 함께 설명합니다."
pubDate: "2026-02-10"
category: "Network"
tags:
  - "Network"
  - "Linux"
notionPageId: "3ea410cd-c737-80a2-943d-e66ef15f32b9"
---

<!-- notion-sync: generated -->

웹사이트에 접속할 때 우리는 보통 주소창에 `google.com`, `naver.com` 같은 **도메인 이름**을 입력한다.
하지만 실제 네트워크 통신은 도메인 이름이 아니라 **IP 주소**를 기준으로 이루어진다. 결국 어딘가에서는
```plain text
www.example.com
        ↓
93.184.216.34
```
처럼 **도메인 이름을 IP 주소로 바꾸는 과정**이 필요하다.
이 역할을 담당하는 대표적인 시스템이 **DNS(Domain Name System)**이고, 운영체제 내부에서 DNS보다 앞서 이름 해석에 개입할 수 있는 대표적인 파일이 **Hosts File(호스트 파일)**이다.
이번 글에서는 DNS가 어떤 구조로 동작하는지부터 시작해서, Hosts 파일과 무엇이 다른지, 실제 애플리케이션은 어떤 순서로 이름을 해석하는지까지 정리해 본다.
<callout icon="💡" color="blue_bg">
	**핵심부터 한 줄로 정리하면**
	DNS는 네트워크를 통해 도메인 이름을 IP 주소로 해석하는 **분산 이름 시스템**이고, Hosts 파일은 특정 컴퓨터 안에서 직접 관리하는 **로컬 이름 매핑 파일**이다.
</callout>
---
## DNS(Domain Name System)란?
DNS는 **Domain Name System**의 약자다.
사람은 `www.google.com` 같은 이름을 기억하기 쉽지만, 컴퓨터가 실제로 통신할 때는 `142.250.x.x` 같은 IP 주소가 필요하다.
따라서 DNS는 사람이 사용하는 도메인 이름을 네트워크에서 사용할 수 있는 IP 주소와 연결해 주는 역할을 한다.
쉽게 말하면 DNS는 인터넷의 **전화번호부**와 비슷하다.
```plain text
사람이 기억하는 이름
www.example.com
        ↓
DNS 질의
        ↓
컴퓨터가 통신에 사용하는 주소
93.184.216.34
```
예를 들어 사용자가 브라우저에 다음 주소를 입력했다고 하자.
```plain text
https://www.google.com
```
브라우저는 결국 `www.google.com`에 대응하는 IP 주소를 알아야 TCP 연결을 시작할 수 있다.
이때 이름 해석 과정에서 DNS가 사용된다.
단, 뒤에서 살펴보겠지만 **브라우저가 무조건 가장 먼저 DNS 서버에 질의하는 것은 아니다.**
운영체제의 캐시나 Hosts 파일과 같은 로컬 이름 해석 정보가 먼저 사용될 수도 있다.
---
## DNS는 왜 하나의 서버가 아니라 계층 구조일까?
전 세계의 모든 도메인 정보를 서버 한 대에 저장한다고 생각해 보자.
그 서버에 장애가 발생하면 인터넷 전체의 이름 해석이 멈출 수 있고, 전 세계의 모든 DNS 요청이 한 곳에 몰리게 된다.
또한 수많은 도메인 정보를 하나의 조직이 관리해야 하므로 확장성도 떨어진다.
그래서 DNS는 **계층적이고 분산된 구조**로 설계되어 있다.
대표적인 흐름은 다음과 같다.
```plain text
클라이언트
   ↓
Recursive DNS Resolver
   ↓
Root DNS Server
   ↓
TLD DNS Server
   ↓
Authoritative DNS Server
   ↓
IP 주소
```
각 서버의 역할을 하나씩 살펴보자.
---
## 1. Recursive DNS Resolver
사용자의 PC가 일반적으로 직접 Root DNS Server부터 찾아가는 것은 아니다.
대부분은 먼저 **Recursive Resolver(재귀 DNS 리졸버)** 에 질의한다.
예를 들면 다음과 같은 곳에서 제공할 수 있다.
- ISP의 DNS 서버
- 회사나 학교의 내부 DNS 서버
- 공유기 또는 사내 DNS 캐시 서버
- Google Public DNS
- Cloudflare DNS
- 통신사 DNS
사용자 입장에서 가장 가까운 DNS 서버라고 해서 흔히 **로컬 DNS 서버**라고 부르기도 하지만, 정확하게는 **Recursive Resolver**라고 부르는 것이 더 명확하다.
Recursive Resolver는 클라이언트를 대신해 필요한 DNS 서버를 순서대로 찾아가 최종 답을 구한다.
예를 들어 클라이언트가
```plain text
www.example.com의 IP 주소가 뭐야?
```
라고 물으면 Resolver가 캐시를 먼저 확인하고, 답이 없다면 Root → TLD → Authoritative Server로 질의를 진행한다.
---
## 2. Root DNS Server
DNS 계층의 최상단에는 **Root DNS Server**가 있다.
Root 서버는 `example.com`의 IP 주소를 직접 알려주는 서버가 아니다.
대신 다음 단계인 **TLD DNS 서버가 어디에 있는지** 알려준다.
예를 들어 `www.example.com`을 찾는 상황이라면 Root 서버는 대략 이런 역할을 한다.
```plain text
Resolver:
www.example.com 어디 있어?

Root DNS:
.com에 대한 정보는 내가 직접 가지고 있지 않아.
.com을 담당하는 TLD 서버로 가봐.
```
흔히 “Root DNS 서버는 13개”라고 표현하지만 정확히 말하면 **A\~M까지 13개의 논리적 Root Server 이름**이 존재한다.
실제 서버 인스턴스는 Anycast 기술을 통해 전 세계 여러 지역에 훨씬 많이 분산되어 있다.
---
## 3. TLD DNS Server
TLD는 **Top-Level Domain**의 약자다.
예를 들면 다음과 같다.
```plain text
.com
.net
.org
.kr
.io
.cloud
```
TLD DNS Server는 해당 최상위 도메인 아래에 있는 도메인의 **권한 있는 DNS 서버가 어디인지** 알려준다.
예를 들어 `example.com`을 찾는 경우,
```plain text
Root DNS
   ↓
.com TLD DNS
   ↓
example.com의 Authoritative DNS Server
```
와 같은 방식으로 다음 목적지를 알려준다.
---
## 4. Authoritative DNS Server
마지막 단계가 **Authoritative DNS Server(권한 있는 DNS 서버)** 다.
이 서버는 특정 도메인에 대한 실제 DNS 레코드를 관리한다.
예를 들어 `example.com`의 DNS Zone에 다음 A 레코드가 있다고 하자.
```plain text
www.example.com → 203.0.113.10
```
그러면 Authoritative DNS Server는 Resolver에게 최종적으로
```plain text
www.example.com의 A 레코드는 203.0.113.10이야.
```
라고 답한다.
<callout icon="🔎" color="yellow_bg">
	**주의할 점**
	Root DNS Server가 모든 `.com`, `.net`, `.kr` 도메인의 IP를 저장하고 있는 것은 아니다.
	Root는 **TLD 서버의 위치를 알려주고**, TLD 서버는 다시 **해당 도메인의 Authoritative DNS Server 위치를 알려주는 구조**다.
</callout>
---
## DNS 질의 전체 흐름
`www.example.com`을 처음 조회한다고 가정하면 다음과 같은 흐름이 만들어진다.
```plain text
클라이언트
   │
   │ "www.example.com IP가 뭐야?"
   ▼
Recursive Resolver
   │
   │ 캐시에 없음
   ▼
Root DNS
   │
   │ ".com TLD 서버로 가봐"
   ▼
.com TLD DNS
   │
   │ "example.com의 Authoritative DNS는 여기야"
   ▼
Authoritative DNS
   │
   │ "www.example.com = 203.0.113.10"
   ▼
Recursive Resolver
   │
   │ 결과 캐시
   ▼
클라이언트
   │
   ▼
203.0.113.10으로 실제 연결
```
이 과정이 매번 처음부터 반복되면 비효율적이다.
그래서 DNS에는 **캐시**가 매우 중요하다.
---
## DNS Cache와 TTL
DNS 응답에는 일반적으로 **TTL(Time To Live)** 값이 포함된다.
TTL은 해당 DNS 응답을 얼마나 오랫동안 캐시에 저장해도 되는지를 나타낸다.
예를 들어 A 레코드가 다음과 같다고 하자.
```plain text
www.example.com → 203.0.113.10
TTL = 300
```
TTL이 300초라면 Resolver는 해당 결과를 일정 시간 동안 캐시에 보관할 수 있다.
같은 도메인에 대한 요청이 다시 들어오면 Root → TLD → Authoritative Server까지 다시 질의하지 않고 캐시된 결과를 반환할 수 있다.
그래서 DNS 구조를 이해할 때는 다음 흐름도 함께 기억해야 한다.
```plain text
DNS 질의
  ↓
캐시에 답이 있음?
 ├─ YES → 바로 반환
 └─ NO  → 상위 DNS 서버로 질의
```
---
## DNS Record란?
DNS 서버에는 단순히 “도메인 → IPv4 주소” 정보만 저장되는 것이 아니다.
다양한 종류의 **DNS Record**가 존재한다.
<table fit-page-width="true" header-row="true">
<tr>
<td>Record</td>
<td>역할</td>
<td>예시</td>
</tr>
<tr>
<td>`A`</td>
<td>도메인을 IPv4 주소와 연결</td>
<td>`example.com → 203.0.113.10`</td>
</tr>
<tr>
<td>`AAAA`</td>
<td>도메인을 IPv6 주소와 연결</td>
<td>`example.com → 2001:db8::10`</td>
</tr>
<tr>
<td>`CNAME`</td>
<td>다른 도메인 이름을 별칭으로 지정</td>
<td>`www.example.com → example.com`</td>
</tr>
<tr>
<td>`MX`</td>
<td>메일 서버 지정</td>
<td>`mail.example.com`</td>
</tr>
<tr>
<td>`NS`</td>
<td>해당 Zone을 담당하는 Name Server 지정</td>
<td>`ns1.example-dns.com`</td>
</tr>
<tr>
<td>`TXT`</td>
<td>임의의 텍스트 정보 저장</td>
<td>SPF, 도메인 인증 등</td>
</tr>
</table>
즉, DNS는 단순 IP 변환 시스템을 넘어 **도메인과 관련된 다양한 정보를 저장하고 조회하는 분산 데이터베이스**라고 볼 수 있다.
---
## Hosts File(호스트 파일)이란?
Hosts File은 **IP 주소와 호스트 이름을 로컬 컴퓨터에서 직접 매핑하는 파일**이다.
예를 들어 Hosts 파일에 다음 내용을 넣었다고 하자.
```plain text
203.0.113.50 test.example.com
```
그러면 이 컴퓨터에서는 `test.example.com`이라는 이름을 해석할 때 `203.0.113.50`을 사용할 수 있다.
중요한 점은 **DNS 서버의 설정을 바꾼 것이 아니라는 것**이다.
```plain text
공인 DNS
test.example.com → 198.51.100.10

내 PC의 Hosts
test.example.com → 203.0.113.50
```
이런 상태라면 다른 사용자들은 여전히 `198.51.100.10`을 사용하지만, Hosts 파일을 수정한 내 컴퓨터에서는 `203.0.113.50`을 사용할 수 있다.
즉, Hosts File은 **내 컴퓨터에서만 사용하는 로컬 이름 매핑표**다.
---
## Linux와 Windows의 Hosts 파일 위치
대표적인 위치는 다음과 같다.
### Linux
```plain text
/etc/hosts
```
예를 들면,
```plain text
127.0.0.1 localhost
::1       localhost
203.0.113.50 test.example.com
```
처럼 작성할 수 있다.
### Windows
```plain text
C:\Windows\System32\drivers\etc\hosts
```
Windows에서도 기본적인 형식은 동일하다.
```plain text
IP주소 호스트이름
```
예:
```plain text
203.0.113.50 test.example.com
```
---
## Hosts 파일은 DNS보다 무조건 먼저일까?
이 부분은 조금 더 정확하게 볼 필요가 있다.
“Hosts가 무조건 DNS보다 먼저다”라고 외워버리면 운영체제나 애플리케이션에 따라 예외가 생겼을 때 헷갈릴 수 있다.
정확히는 **운영체제의 이름 해석 정책에서 Hosts 파일의 우선순위가 DNS보다 앞에 있는 경우가 일반적**이다.
Linux에서는 대표적으로 `/etc/nsswitch.conf`의 `hosts` 항목을 통해 조회 순서를 확인할 수 있다.
예를 들어 다음과 같이 되어 있다면,
```plain text
hosts: files dns
```
의미는 다음과 같다.
```plain text
1. files 확인
   → /etc/hosts

2. 여기서 해결되지 않으면
   → DNS 질의
```
즉,
```plain text
애플리케이션
      ↓
시스템 이름 해석
      ↓
/etc/hosts
      ↓
없으면 DNS
```
순서가 된다.
Windows에서도 시스템의 이름 해석 과정에서 Hosts 파일이 사용되며, 일반적인 애플리케이션은 이 결과를 이용한다.
<callout icon="⚠️" color="yellow_bg">
	브라우저의 Secure DNS(DoH), 애플리케이션 자체 DNS Resolver, 컨테이너 내부 DNS 등처럼 **애플리케이션이 운영체제의 일반적인 이름 해석 경로와 다른 방식을 사용하는 경우도 있다.**
	따라서 실무에서는 “Hosts가 항상 모든 프로그램보다 우선한다”가 아니라 **해당 애플리케이션이 어떤 Resolver 경로를 사용하는지**까지 확인하는 것이 안전하다.
</callout>
---
## Hosts 파일 조회는 네트워크 통신이 아니다
Hosts와 DNS의 중요한 차이 중 하나다.
`/etc/hosts` 또는 Windows Hosts 파일을 확인하는 것은 **로컬 파일을 읽는 동작**이다.
즉, 이 단계에서는 외부 네트워크로 패킷을 보내지 않는다.
```plain text
애플리케이션
      ↓
운영체제
      ↓
Hosts 파일 읽기
```
이 과정에는 DNS Request가 존재하지 않는다.
반면 Hosts 파일에서 이름을 해결하지 못하고 실제 DNS Resolver에 질의하기 시작하면 그때부터 네트워크 통신이 발생한다.
```plain text
Hosts에서 찾지 못함
      ↓
DNS Resolver로 질의
      ↓
UDP/TCP 기반 DNS 통신
```
일반적인 DNS는 주로 **UDP 53번 포트**를 사용하며, 응답 크기나 특정 상황에서는 TCP 53도 사용한다. 최근에는 DoT, DoH 같은 암호화 DNS 방식도 사용된다.
---
## DNS와 Hosts File의 차이
<table fit-page-width="true" header-row="true">
<tr>
<td>구분</td>
<td>DNS</td>
<td>Hosts File</td>
</tr>
<tr>
<td>역할</td>
<td>도메인 이름을 IP 주소 등과 연결하는 분산 이름 시스템</td>
<td>로컬 시스템에서 호스트 이름과 IP 주소를 직접 매핑</td>
</tr>
<tr>
<td>저장 위치</td>
<td>네트워크에 분산된 DNS 서버</td>
<td>각 로컬 컴퓨터의 파일</td>
</tr>
<tr>
<td>관리 주체</td>
<td>도메인 관리자 및 DNS 운영자</td>
<td>해당 시스템 관리자</td>
</tr>
<tr>
<td>적용 범위</td>
<td>DNS를 사용하는 여러 클라이언트</td>
<td>해당 Hosts 파일을 가진 시스템</td>
</tr>
<tr>
<td>변경 전파</td>
<td>TTL과 캐시의 영향을 받음</td>
<td>로컬 파일 수정 즉시 반영되는 경우가 일반적</td>
</tr>
<tr>
<td>네트워크 통신</td>
<td>DNS 서버 질의 시 발생</td>
<td>파일 조회 자체에는 발생하지 않음</td>
</tr>
<tr>
<td>확장성</td>
<td>매우 높음</td>
<td>대량 관리에 부적합</td>
</tr>
<tr>
<td>주요 용도</td>
<td>실제 서비스의 공식 도메인 이름 해석</td>
<td>테스트, 임시 우회, 로컬 개발, 장애 분석</td>
</tr>
</table>
---
## 실제 이름 해석 흐름을 조금 더 현실적으로 보면
“도메인을 입력하면 바로 DNS 서버에 요청한다”라고만 이해하면 Hosts나 캐시의 존재를 설명하기 어렵다.
개념적으로는 다음과 같이 보는 편이 좋다.
```plain text
애플리케이션
      ↓
자체 캐시가 있는가?
      ↓
운영체제 이름 해석
      ↓
로컬 캐시 / Hosts 등
      ↓
해결되지 않음
      ↓
Recursive DNS Resolver
      ↓
Resolver Cache 확인
      ↓
Root → TLD → Authoritative
      ↓
IP 주소 획득
      ↓
애플리케이션이 실제 서버에 연결
```
모든 운영체제와 애플리케이션이 정확히 같은 순서로 동작하는 것은 아니지만, **DNS 질의보다 앞단에 로컬 이름 해석 계층이 존재할 수 있다**는 것이 핵심이다.
---
## nslookup과 dig가 Hosts 파일을 무시하는 것처럼 보이는 이유
Hosts 파일을 수정한 다음
```bash
nslookup example.com
```
또는
```bash
dig example.com
```
을 실행했는데 기존 DNS IP가 그대로 나오면
> Hosts 설정이 안 먹은 것 아닌가?
라고 생각하기 쉽다.
하지만 이것은 정상일 수 있다.
`nslookup`과 `dig`는 기본적으로 **DNS 서버에 직접 질의하여 DNS 레코드를 확인하는 도구**다.
즉, 두 명령이 보고 싶은 것은
```plain text
"DNS 서버는 이 도메인에 대해 무엇이라고 답하는가?"
```
이다.
반면 Hosts 파일이 시스템 이름 해석에 실제 반영됐는지를 확인하려면 Linux에서는 다음과 같은 방법이 더 적합하다.
```bash
getent hosts example.com
ping example.com
curl http://example.com
```
Windows에서는
```powershell
ping example.com
curl http://example.com
Test-NetConnection example.com -Port 80
```
등으로 확인할 수 있다.
정리하면,
```plain text
DNS 자체의 값 확인
→ nslookup / dig

내 컴퓨터가 실제로 어떤 IP를 사용할지 확인
→ getent / ping / curl / 실제 애플리케이션
```
으로 구분하면 이해하기 쉽다.
---
## Hosts File은 언제 사용할까?
Hosts 파일은 단순한 학습용 파일이 아니다.
클라우드나 서버 작업에서도 상당히 유용하다.
### 1. DNS 변경 전에 신규 서버 테스트
현재 운영 서비스가 다음과 같이 연결되어 있다고 하자.
```plain text
service.example.com
        ↓
기존 Load Balancer
```
신규 Load Balancer로 전환하려고 하지만 아직 실제 DNS를 바꾸고 싶지는 않다.
내 PC에만
```plain text
신규_LB_IP service.example.com
```
을 Hosts에 등록하면,
```plain text
실제 사용자
service.example.com
      ↓
기존 Load Balancer

내 PC
service.example.com
      ↓
신규 Load Balancer
```
처럼 테스트할 수 있다.
실제 사용자에게 영향을 주지 않으면서 신규 환경을 검증할 수 있다는 장점이 있다.
### 2. 웹 서버의 Host 기반 Virtual Host 테스트
Nginx나 Apache는 요청의 `Host` 헤더를 기준으로 서로 다른 사이트를 서비스할 수 있다.
이때 아직 실제 DNS를 등록하지 않았더라도 Hosts 파일을 이용해서 원하는 도메인으로 요청을 보내 테스트할 수 있다.
### 3. 장애 분석
DNS가 올바른 서버를 가리키고 있는지, DNS 문제인지 애플리케이션 문제인지 분리해서 확인할 때도 사용할 수 있다.
예를 들어 Hosts로 서버 IP를 직접 지정했을 때 정상 동작한다면 DNS 또는 DNS 전환 과정에 문제가 있는지 추가로 확인할 근거가 된다.
### 4. 로컬 개발 환경
```plain text
127.0.0.1 myapp.local
```
처럼 등록해서 IP 대신 사람이 읽기 쉬운 이름으로 로컬 애플리케이션에 접속할 수도 있다.
---
## Hosts File의 한계
Hosts가 편리하다고 해서 DNS를 대신할 수 있는 것은 아니다.
서버가 수백 대이고 관리해야 할 도메인이 수천 개라고 가정해 보자.
모든 컴퓨터의 Hosts 파일을 하나씩 수정한다면 관리가 사실상 불가능하다.
```plain text
PC 1 → hosts 수정
PC 2 → hosts 수정
PC 3 → hosts 수정
...
PC 10,000 → hosts 수정
```
IP가 변경될 때마다 모든 장비를 다시 수정해야 한다.
반면 DNS는 중앙에서 레코드를 관리하고 클라이언트가 이를 조회하는 구조이기 때문에 대규모 환경에서도 운영할 수 있다.
그래서 Hosts는 주로 **로컬 테스트나 임시 이름 해석 제어**에 사용하고, 실제 서비스의 공식적인 이름 해석은 DNS로 관리하는 것이 일반적이다.
---
## 정리
DNS와 Hosts는 모두 **이름을 IP 주소와 연결한다**는 점에서는 비슷해 보인다.
하지만 역할과 범위는 완전히 다르다.
```plain text
DNS
→ 네트워크에 분산된 이름 시스템
→ 여러 사용자와 시스템이 함께 사용
→ 실제 서비스의 공식 이름 해석

Hosts
→ 한 컴퓨터에 저장된 로컬 파일
→ 해당 시스템에만 적용
→ 테스트·우회·개발·장애 분석에 유용
```
그리고 우리가 브라우저에 도메인을 입력했을 때의 흐름도 단순히
```plain text
도메인 → DNS → IP
```
라고만 이해하기보다는,
```plain text
도메인
  ↓
로컬 이름 해석
  ↓
Hosts / Cache 등
  ↓
해결되지 않으면 DNS
  ↓
IP
```
라고 이해하는 편이 더 정확하다.
<callout icon="✅" color="green_bg">
	**한 줄 정리**
	DNS는 인터넷 규모에서 도메인을 관리하기 위한 **분산 이름 시스템**이고, Hosts File은 해당 컴퓨터에서 DNS와 다른 결과를 사용하도록 직접 지정할 수 있는 **로컬 이름 매핑 파일**이다.
</callout>
---
## 같이 보면 좋은 실습
이 개념을 이해했다면 Hosts 파일을 직접 수정해 보는 것이 가장 빠르다.
- Windows: `C:\Windows\System32\drivers\etc\hosts`
- Linux: `/etc/hosts`
실제 DNS 레코드는 그대로 둔 채 Hosts 파일에 다른 IP를 매핑하고 `ping`, `curl`, `getent` 등을 이용해 **내 컴퓨터의 이름 해석 결과만 바뀌는지 확인해 보면 DNS와 Hosts의 차이가 훨씬 명확해진다.**
