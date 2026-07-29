---
title: "nslookup으로 알아보는 DNS"
description: "두번째 테스트"
pubDate: "2026-07-29"
category: "Network"
tags:
  - "HTTP"
notionPageId: "3ac410cd-c737-8049-8dd7-d185dc030f4e"
---

<!-- notion-sync: generated -->

처음에는 DNS를 단순히 이렇게 생각했다.
```plain text
도메인 이름을 IP 주소로 바꿔주는 것
```
물론 틀린 말은 아니다.
하지만 `nslookup`을 직접 찍어보면서 생각보다 훨씬 많은 것이 보였다.
- 내가 어떤 DNS 서버에게 물어보고 있는지
- "권한 없는 응답"이 무슨 뜻인지
- 도메인 하나에 IP가 여러 개 나오는 이유
- 내가 가비아에만 A 레코드를 등록했는데 Google DNS와 Cloudflare DNS도 어떻게 내 도메인을 아는지
- DNS 변경 후 왜 바로 반영되기도 하고, 어떤 때는 시간이 걸리는지
- TTL이 정확히 누구에게 적용되는 값인지
이 글은 `nslookup` 결과 하나를 계기로 DNS 구조를 처음부터 다시 이해해보는 기록이다.
---
## 1. nslookup은 무엇을 하는 명령어인가?
`nslookup`은 도메인 이름을 DNS 서버에 질의해서 IP 주소를 확인하는 명령어다.
예를 들어 다음 명령어를 입력했다고 하자.
```plain text
nslookup naver.com
```
이 명령어의 의미는 다음과 같다.
```plain text
"내 PC가 사용 중인 DNS 서버에게 naver.com의 IP 주소를 물어봐라."
```
웹 브라우저에서 `https://naver.com`을 입력하면 컴퓨터는 바로 `naver.com`이라는 이름으로 통신하지 않는다.
실제 네트워크 통신은 IP 주소를 기준으로 이루어진다.
따라서 먼저 DNS를 통해 다음 변환이 필요하다.
```plain text
naver.com -> IP 주소
```
이 과정을 DNS 질의, DNS 조회, 이름 해석이라고 부른다.
---
## 2. nslookup 결과 해석하기
다음은 `naver.com`을 조회한 결과다.
```plain text
PS C:\Users\hsj9433> nslookup naver.com
서버:    bns1.hananet.net
Address:  210.220.163.82

권한 없는 응답:
이름:    naver.com
Addresses:  223.130.192.248
          223.130.200.219
          223.130.200.236
          223.130.192.247
```
이 출력은 크게 세 부분으로 나눠서 보면 된다.
---
## 3. "서버"는 naver.com 서버가 아니다
출력의 첫 부분은 다음과 같다.
```plain text
서버:    bns1.hananet.net
Address:  210.220.163.82
```
처음에는 이 부분이 `naver.com`의 서버 정보처럼 보일 수 있다.
하지만 아니다.
이것은 내 PC가 질의한 DNS 서버다.
즉 구조는 다음과 같다.
```plain text
내 PC
  |
  | "naver.com의 IP 주소가 뭐야?"
  v
bns1.hananet.net
210.220.163.82
```
여기서 `bns1.hananet.net`은 DNS 서버 이름이고, `210.220.163.82`는 그 DNS 서버의 IP 주소다.
즉 이 IP는 `naver.com`의 IP가 아니다.
내 PC가 도메인 해석을 위해 물어본 DNS 서버의 IP다.
Windows에서 내 PC가 어떤 DNS 서버를 사용 중인지 확인하려면 다음 명령어를 사용할 수 있다.
```plain text
ipconfig /all
```
출력 중에서 다음 항목을 보면 된다.
```plain text
DNS Servers . . . . . . . . . . . : 210.220.163.82
```
---
## 4. 실제 naver.com의 IP는 아래에 나온다
실제 `naver.com`에 해당하는 IP 주소는 이 부분이다.
```plain text
이름:    naver.com
Addresses:  223.130.192.248
          223.130.200.219
          223.130.200.236
          223.130.192.247
```
즉 DNS 서버는 이렇게 응답한 것이다.
```plain text
naver.com으로 접속하려면 다음 IP들을 사용할 수 있다.

223.130.192.248
223.130.200.219
223.130.200.236
223.130.192.247
```
여기서 중요한 점이 있다.
도메인 하나가 반드시 IP 하나만 가지는 것은 아니다.
대형 서비스는 하나의 도메인에 여러 IP를 연결할 수 있다.
네이버 같은 서비스는 트래픽이 매우 많기 때문에 여러 서버, 여러 로드밸런서, 여러 데이터센터, 여러 네트워크 진입점을 사용할 수 있다.
따라서 DNS 응답으로 여러 IP가 내려올 수 있다.
---
## 5. 도메인 하나에 IP가 여러 개 나오는 이유
`naver.com`처럼 IP가 여러 개 나오는 이유는 보통 다음과 같다.
### 1) 부하 분산
모든 사용자가 하나의 IP로만 접속하면 특정 서버나 장비에 트래픽이 몰린다.
그래서 여러 IP를 내려주면 사용자들이 여러 진입점으로 나뉘어 접속할 수 있다.
```plain text
사용자 A -> 223.130.192.248
사용자 B -> 223.130.200.219
사용자 C -> 223.130.200.236
사용자 D -> 223.130.192.247
```
### 2) 장애 대비
어떤 IP 쪽 장비에 장애가 발생해도 다른 IP를 통해 서비스를 계속할 수 있다.
### 3) 지역 또는 망 최적화
사용자의 위치, 통신사, 네트워크 상황에 따라 더 가까운 곳이나 더 빠른 경로의 IP를 응답할 수도 있다.
---
## 6. DNS는 로드밸런서인가?
이 지점에서 이런 생각을 할 수 있다.
```plain text
"DNS 서버가 여러 IP 중 하나를 골라주니까 DNS도 로드밸런서 아닌가?"
```
부분적으로는 맞다.
DNS는 어느 정도 부하 분산에 관여할 수 있다.
이를 DNS 기반 부하 분산 또는 DNS 라운드 로빈이라고 부른다.
예를 들어 DNS 서버가 사용자마다 응답 순서를 다르게 줄 수 있다.
```plain text
첫 번째 사용자:
223.130.192.248
223.130.200.219
223.130.200.236
223.130.192.247

두 번째 사용자:
223.130.200.219
223.130.200.236
223.130.192.247
223.130.192.248
```
클라이언트가 주로 첫 번째 IP에 접속한다면 자연스럽게 트래픽이 분산될 수 있다.
하지만 DNS는 일반적인 L4/L7 로드밸런서와는 다르다.
로드밸런서는 실제 트래픽을 직접 받아서 뒤쪽 서버로 나눈다.
```plain text
사용자 요청
  ↓
로드밸런서
  ↓
서버 A / 서버 B / 서버 C
```
반면 DNS는 접속 전에 IP 후보를 알려준다.
```plain text
사용자
  ↓
DNS 서버
  ↓
"이 IP들 중 하나로 접속해"
```
따라서 DNS는 트래픽을 직접 받아서 분배하는 장비가 아니라, 접속할 목적지 IP 후보를 알려주는 역할에 가깝다.
---
## 7. "권한 없는 응답"은 오류가 아니다
`nslookup` 결과에는 다음과 같은 문구가 나온다.
```plain text
권한 없는 응답:
```
처음 보면 뭔가 잘못된 것처럼 보인다.
하지만 오류가 아니다.
뜻은 다음과 같다.
```plain text
"나는 이 도메인의 공식 DNS 서버는 아니지만,
공식 DNS 서버에게 물어봤거나 캐시해둔 정보를 바탕으로 답변한다."
```
DNS 서버는 크게 두 종류로 나누어 이해하면 쉽다.
---
## 8. 재귀 DNS 서버와 권한 있는 DNS 서버
### 1) 재귀 DNS 서버 / 캐시 DNS 서버
예시는 다음과 같다.
```plain text
bns1.hananet.net
8.8.8.8
1.1.1.1
```
이들은 사용자의 질문을 받아 대신 도메인 정보를 찾아주는 DNS 서버다.
쉽게 말하면 "검색 대행자"다.
사용자가 이렇게 물어본다.
```plain text
"hwangsoojin.cloud의 IP 주소가 뭐야?"
```
그러면 재귀 DNS 서버는 자신이 알고 있으면 바로 답하고, 모르면 DNS 계층 구조를 따라가며 대신 찾아온다.
---
### 2) 권한 있는 DNS 서버
권한 있는 DNS 서버는 특정 도메인의 공식 DNS 정보를 가지고 있는 서버다.
예를 들어 내가 가비아에서 `hwangsoojin.cloud`라는 도메인을 구매하고, 가비아 DNS 관리 화면에서 A 레코드를 등록했다면, 가비아 쪽 네임서버가 내 도메인의 권한 있는 DNS 서버 역할을 한다.
즉 내 도메인의 공식 원본 DNS 정보는 가비아 권한 DNS 서버에 있다.
---
## 9. 내가 가비아에만 등록했는데 Google DNS와 Cloudflare DNS는 어떻게 알까?
내 도메인 `hwangsoojin.cloud`에 대해 다음과 같이 조회했다.
```plain text
nslookup hwangsoojin.cloud
nslookup hwangsoojin.cloud 8.8.8.8
nslookup hwangsoojin.cloud 1.1.1.1
```
결과는 모두 같았다.
```plain text
hwangsoojin.cloud -> 223.130.134.229
```
여기서 의문이 생긴다.
나는 가비아에서만 A 레코드를 등록했다.
Google DNS나 Cloudflare DNS에 내 도메인 정보를 등록한 적은 없다.
그런데 왜 `8.8.8.8`과 `1.1.1.1`도 내 도메인의 IP를 알고 있을까?
처음에는 이렇게 생각하기 쉽다.
```plain text
가비아에 A 레코드를 등록하면
가비아가 전 세계 DNS 서버에 내 정보를 브로드캐스트하는 것인가?
```
하지만 DNS는 그런 방식이 아니다.
---
## 10. DNS는 브로드캐스트가 아니라 계층적 조회 구조다
DNS는 전 세계 모든 DNS 서버에 정보를 뿌리는 구조가 아니다.
정확히는 필요한 순간에 계층 구조를 따라 찾아가는 구조다.
흐름은 대략 이렇다.
```plain text
사용자 PC
  ↓
재귀 DNS 서버
  ↓
Root DNS 서버
  ↓
.cloud TLD DNS 서버
  ↓
hwangsoojin.cloud의 권한 있는 DNS 서버
  ↓
A 레코드 응답
```
예를 들어 `8.8.8.8`에 `hwangsoojin.cloud`를 물어보면 다음과 같은 일이 일어난다.
```plain text
1. 내 PC가 Google DNS 8.8.8.8에게 질문한다.
   "hwangsoojin.cloud의 IP 주소가 뭐야?"

2. Google DNS는 자기 캐시를 먼저 확인한다.

3. 캐시에 없으면 Root DNS 서버에게 물어본다.
   ".cloud는 어디에 물어봐야 해?"

4. Root DNS 서버는 .cloud TLD DNS 서버를 알려준다.

5. Google DNS는 .cloud TLD DNS 서버에게 물어본다.
   "hwangsoojin.cloud는 어느 네임서버가 담당해?"

6. .cloud TLD DNS 서버는 가비아 쪽 권한 DNS 서버를 알려준다.

7. Google DNS는 가비아 권한 DNS 서버에게 물어본다.
   "hwangsoojin.cloud의 A 레코드는 뭐야?"

8. 가비아 권한 DNS 서버가 응답한다.
   "223.130.134.229야."

9. Google DNS는 그 결과를 내 PC에게 전달한다.

10. Google DNS는 이 결과를 일정 시간 동안 캐시한다.
```
즉 Google DNS가 내 도메인 정보를 미리 등록받은 것이 아니다.
필요할 때 DNS 계층 구조를 따라 가비아 권한 DNS 서버까지 찾아간 것이다.
---
## 11. DNS 전체 흐름 그림
`hwangsoojin.cloud` 기준으로 보면 전체 구조는 다음과 같다.
```plain text
[내 PC]
  |
  | nslookup hwangsoojin.cloud 8.8.8.8
  v
[Google DNS 8.8.8.8]
  |
  | 캐시에 없으면
  v
[Root DNS]
  |
  | ".cloud는 어디?"
  v
[.cloud TLD DNS]
  |
  | "hwangsoojin.cloud 담당 네임서버는 어디?"
  v
[가비아 권한 DNS 서버]
  |
  | "A 레코드는 223.130.134.229"
  v
[Google DNS 8.8.8.8]
  |
  | 최종 응답
  v
[내 PC]
```
Cloudflare DNS도 마찬가지다.
```plain text
[내 PC]
  |
  | nslookup hwangsoojin.cloud 1.1.1.1
  v
[Cloudflare DNS 1.1.1.1]
  |
  | 필요하면 계층적으로 찾아감
  v
[Root DNS] -> [.cloud TLD DNS] -> [가비아 권한 DNS 서버]
```
따라서 중요한 결론은 이것이다.
```plain text
DNS는 전 세계에 뿌리는 시스템이 아니라,
전 세계 어디서든 공식 담당 DNS 서버를 찾아갈 수 있게 만든 계층적 조회 시스템이다.
```
---
## 12. 그러면 "DNS 전파"라는 말은 무엇인가?
도메인 설정을 바꾸면 흔히 이런 말을 한다.
```plain text
"DNS 전파에는 시간이 걸립니다."
```
이 말 때문에 다음과 같이 오해하기 쉽다.
```plain text
내가 A 레코드를 바꾸면
새 정보가 전 세계 DNS 서버로 퍼져나가는구나.
```
하지만 엄밀히 말하면 DNS 전파라기보다 "캐시 만료 대기"에 가깝다.
예를 들어 기존 A 레코드가 다음과 같았다고 하자.
```plain text
hwangsoojin.cloud -> 223.130.134.229
```
그리고 가비아에서 새 값으로 변경했다.
```plain text
hwangsoojin.cloud -> 111.111.111.111
```
가비아의 권한 DNS 서버에는 새 값이 반영된다.
하지만 Google DNS, Cloudflare DNS, 통신사 DNS 같은 재귀 DNS 서버들이 기존 값을 캐시하고 있었다면, 일정 시간 동안 예전 값을 응답할 수 있다.
```plain text
Google DNS 캐시:
hwangsoojin.cloud -> 223.130.134.229
남은 TTL: 1200초
```
이 경우 Google DNS에 물어보면 아직 예전 값이 나올 수 있다.
```plain text
hwangsoojin.cloud -> 223.130.134.229
```
하지만 TTL이 끝나면 다시 권한 DNS 서버에 물어보고 새 값을 가져온다.
```plain text
hwangsoojin.cloud -> 111.111.111.111
```
그래서 "DNS 전파가 안 됐다"는 말은 보통 다음 뜻이다.
```plain text
일부 재귀 DNS 서버가 아직 예전 DNS 응답을 캐시하고 있다.
```
---
## 13. TTL이란 무엇인가?
TTL은 `Time To Live`의 약자다.
DNS에서 TTL은 다음 뜻이다.
```plain text
이 DNS 응답을 캐시 DNS 서버가 몇 초 동안 기억해도 되는가?
```
예를 들어 가비아 DNS 관리 화면에 다음과 같이 설정되어 있다고 하자.
```plain text
타입: A
호스트: @
값/위치: 111.111.111.111
TTL: 1800
```
이 뜻은 다음과 같다.
```plain text
hwangsoojin.cloud -> 111.111.111.111
이 응답은 1800초 동안 캐시해도 된다.
```
1800초는 30분이다.
즉 `8.8.8.8`, `1.1.1.1`, 통신사 DNS 같은 재귀 DNS 서버는 이 응답을 최대 30분 동안 캐시할 수 있다.
---
## 14. TTL은 가비아 DNS 서버 내부용 값인가?
아니다.
가비아 DNS 관리 화면에 보이는 TTL은 가비아 내부에서만 쓰는 캐시 시간이 아니다.
정확히는 가비아의 권한 DNS 서버가 외부 DNS 서버에게 응답할 때 함께 전달하는 값이다.
즉 가비아 권한 DNS 서버가 이렇게 말하는 것이다.
```plain text
"hwangsoojin.cloud의 A 레코드는 111.111.111.111이고,
이 결과는 1800초 동안 캐시해도 된다."
```
그러면 Google DNS, Cloudflare DNS, 통신사 DNS는 이 TTL을 기준으로 캐시한다.
단, 모든 DNS 서버가 동시에 30분 카운트를 시작하는 것은 아니다.
각 DNS 서버가 해당 레코드를 조회한 시점부터 각자 TTL 카운트가 시작된다.
예를 들어 다음과 같다.
```plain text
01:00 - Google DNS가 조회
        TTL 1800초 시작

01:10 - Cloudflare DNS가 조회
        TTL 1800초 시작

01:20 - 통신사 DNS가 조회
        TTL 1800초 시작
```
그러면 캐시 만료 시점도 각각 다르다.
```plain text
Google DNS 캐시 만료:      01:30
Cloudflare DNS 캐시 만료:  01:40
통신사 DNS 캐시 만료:      01:50
```
이 때문에 DNS 변경 후 어떤 DNS 서버는 새 값을 주고, 어떤 DNS 서버는 예전 값을 줄 수 있다.
---
## 15. 그런데 왜 DNS 변경이 곧바로 반영되기도 할까?
실제로 A 레코드를 변경한 직후 다음과 같이 조회했을 때, 모든 DNS 서버가 바로 새 값을 응답할 수도 있다.
```plain text
nslookup hwangsoojin.cloud
nslookup hwangsoojin.cloud 8.8.8.8
nslookup hwangsoojin.cloud 1.1.1.1
```
변경 전:
```plain text
hwangsoojin.cloud -> 223.130.134.229
```
변경 후:
```plain text
hwangsoojin.cloud -> 111.111.111.111
```
이러면 이런 의문이 든다.
```plain text
"분명 방금 전까지 DNS 서버들이 예전 값을 알고 있었는데,
왜 캐시가 남아있지 않고 바로 바뀌지?"
```
가능한 이유는 다음과 같다.
```plain text
1. 해당 DNS 서버에 기존 캐시가 없었을 수 있다.
2. 기존 캐시가 있었지만 TTL이 이미 만료되었을 수 있다.
3. 기존 캐시의 남은 TTL이 매우 짧았을 수 있다.
4. 해당 도메인의 조회량이 낮아서 캐시가 오래 유지되지 않았을 수 있다.
5. 8.8.8.8이나 1.1.1.1은 내부적으로 여러 DNS 노드로 구성되어 있어,
   조회 시점에 다른 캐시 노드가 응답했을 수 있다.
```
중요한 점은 이것이다.
```plain text
변경 직전에 nslookup 결과가 예전 IP였다고 해서,
그 순간부터 TTL이 새로 1800초 시작된다는 뜻은 아니다.
```
그 응답은 이미 캐시에 있던 값일 수 있고, 남은 TTL이 5초뿐이었을 수도 있다.
기본 `nslookup` 출력은 TTL을 보여주지 않기 때문에, 그 응답의 남은 TTL을 알 수 없다.
---
## 16. TTL 확인 명령어
Windows PowerShell에서는 다음 명령어로 TTL을 확인할 수 있다.
```plain text
Resolve-DnsName hwangsoojin.cloud -Type A -Server 8.8.8.8
```
Cloudflare DNS 기준으로 확인하려면:
```plain text
Resolve-DnsName hwangsoojin.cloud -Type A -Server 1.1.1.1
```
현재 PC의 기본 DNS 서버 기준으로 보려면:
```plain text
Resolve-DnsName hwangsoojin.cloud -Type A
```
출력 예시는 다음과 같다.
```plain text
Name      : hwangsoojin.cloud
Type      : A
TTL       : 1800
IPAddress : 111.111.111.111
```
TTL이 점점 줄어든다면 해당 DNS 서버가 캐시된 값을 응답하고 있다고 볼 수 있다.
---
## 17. 권한 있는 DNS 서버 직접 확인하기
내 도메인의 권한 있는 DNS 서버를 확인하려면 NS 레코드를 조회하면 된다.
```plain text
nslookup -type=NS hwangsoojin.cloud
```
예상 출력은 다음과 비슷할 수 있다.
```plain text
hwangsoojin.cloud nameserver = ns.gabia.co.kr
hwangsoojin.cloud nameserver = ns1.gabia.co.kr
```
실제 이름은 설정에 따라 다를 수 있다.
이 NS 레코드의 의미는 다음과 같다.
```plain text
"hwangsoojin.cloud의 공식 DNS 정보는 이 네임서버들이 가지고 있다."
```
권한 DNS 서버에 직접 A 레코드를 물어볼 수도 있다.
```plain text
nslookup hwangsoojin.cloud ns.gabia.co.kr
```
이 방식은 Google DNS나 Cloudflare DNS 같은 재귀 DNS 서버를 거치는 것이 아니라, 도메인의 공식 원본 DNS 서버에 직접 물어보는 것에 가깝다.
구분하면 다음과 같다.
```plain text
nslookup hwangsoojin.cloud 8.8.8.8
  -> Google 재귀 DNS 서버에게 물어봄

nslookup hwangsoojin.cloud 1.1.1.1
  -> Cloudflare 재귀 DNS 서버에게 물어봄

nslookup hwangsoojin.cloud ns.gabia.co.kr
  -> 가비아 권한 DNS 서버에게 직접 물어봄
```
---
## 18. 실무에서 DNS 변경 시 주의할 점
서버 이전, 로드밸런서 교체, 도메인 연결 변경 같은 작업을 할 때는 TTL 관리가 중요하다.
예를 들어 기존 TTL이 1800초라면, 어떤 DNS 서버는 최대 30분 동안 기존 IP를 응답할 수 있다.
따라서 실무에서는 DNS 변경 전에 TTL을 미리 낮춰둔다.
예를 들어:
```plain text
1. 변경 하루 전 또는 몇 시간 전
   TTL을 1800에서 300으로 낮춘다.

2. 기존 TTL이 충분히 만료될 때까지 기다린다.

3. 실제 A 레코드를 새 IP로 변경한다.

4. 대부분의 재귀 DNS 서버가 5분 이내에 새 값을 가져가도록 유도한다.

5. 변경 안정화 후 TTL을 다시 적절한 값으로 올린다.
```
이렇게 하면 DNS 변경으로 인한 장애 시간을 줄일 수 있다.
---
## 19. nslookup 결과를 실무적으로 읽는 법
예를 들어 다음 결과가 있다고 하자.
```plain text
nslookup hwangsoojin.cloud 8.8.8.8
```
```plain text
서버:    dns.google
Address:  8.8.8.8

권한 없는 응답:
이름:    hwangsoojin.cloud
Address:  111.111.111.111
```
이 결과는 다음 의미다.
```plain text
1. 내 PC가 Google DNS 8.8.8.8에게 질의했다.

2. Google DNS는 hwangsoojin.cloud의 공식 권한 DNS 서버는 아니다.

3. 하지만 Google DNS가 권한 DNS 서버에 물어봤거나
   캐시해둔 정보를 바탕으로 응답했다.

4. 현재 Google DNS 기준으로 hwangsoojin.cloud는
   111.111.111.111로 해석된다.
```
이 결과만 보고 웹 접속이 반드시 된다고 단정할 수는 없다.
DNS는 "도메인 -\> IP" 변환까지만 담당한다.
실제 웹 접속에는 추가로 다음이 필요하다.
```plain text
- 해당 IP까지 라우팅이 가능한가?
- 서버가 살아 있는가?
- 80 또는 443 포트가 열려 있는가?
- 방화벽 또는 ACG에서 허용되어 있는가?
- 웹 서버 또는 로드밸런서가 정상 동작하는가?
- HTTPS 인증서가 도메인과 일치하는가?
```
따라서 DNS가 정상이어도 웹 접속이 실패할 수 있고, 웹 접속이 실패한다고 해서 항상 DNS 문제인 것도 아니다.
---
## 20. DNS 이후에 확인할 명령어
DNS 조회가 정상인데 웹 접속이 안 된다면 다음 단계로 확인해야 한다.
### 1) DNS 조회 확인
```plain text
nslookup hwangsoojin.cloud
```
또는:
```plain text
Resolve-DnsName hwangsoojin.cloud -Type A
```
### 2) 443 포트 연결 확인
```plain text
Test-NetConnection hwangsoojin.cloud -Port 443
```
중요하게 볼 부분:
```plain text
TcpTestSucceeded : True
```
`True`이면 TCP 443 포트 연결이 가능하다는 뜻이다.
### 3) HTTP/HTTPS 응답 확인
```plain text
curl -v https://hwangsoojin.cloud
```
여기서는 TLS 인증서, HTTP 상태 코드, 리다이렉트 여부 등을 볼 수 있다.
### 4) 경로 확인
```plain text
tracert hwangsoojin.cloud
```
목적지까지 네트워크 경로가 어떻게 가는지 확인할 수 있다.
---
## 21. 전체 정리
이번 실험을 통해 DNS를 이렇게 이해할 수 있었다.
```plain text
1. nslookup은 도메인을 DNS 서버에 질의해 IP 주소를 확인하는 명령어다.

2. 출력의 "서버"는 조회 대상 도메인의 서버가 아니라,
   내가 질의한 DNS 서버다.

3. "권한 없는 응답"은 오류가 아니다.
   재귀 DNS 서버가 공식 권한 DNS 서버가 아니지만,
   대신 찾아온 결과나 캐시된 결과를 응답했다는 뜻이다.

4. 도메인 하나가 여러 IP를 가질 수 있다.
   이는 부하 분산, 장애 대비, 지역/망 최적화 등에 사용된다.

5. DNS는 로드밸런서처럼 보일 수 있지만,
   실제 트래픽을 받아 분산하는 L4/L7 로드밸런서와는 다르다.
   DNS는 접속 전 IP 후보를 알려주는 역할에 가깝다.

6. 가비아에 A 레코드를 등록했다고 해서
   전 세계 DNS 서버에 브로드캐스트되는 것은 아니다.

7. Google DNS, Cloudflare DNS, 통신사 DNS는
   DNS 계층 구조를 따라 Root DNS, TLD DNS, 권한 DNS 서버를 찾아가서
   최종 A 레코드를 얻는다.

8. "DNS 전파"는 엄밀히 말하면 전 세계로 정보가 퍼지는 과정이 아니라,
   각 재귀 DNS 서버의 캐시가 만료되고 새 값을 가져가는 과정에 가깝다.

9. TTL은 재귀 DNS 서버가 해당 DNS 응답을 얼마나 오래 캐시해도 되는지를 나타낸다.

10. DNS 변경이 바로 반영될 수도 있고 늦게 반영될 수도 있다.
    이는 각 DNS 서버의 캐시 상태와 남은 TTL에 따라 달라진다.
```
---
## 22. 가장 크게 바뀐 이해
처음에는 DNS를 이렇게 생각했다.
```plain text
도메인을 IP로 바꿔주는 단순한 시스템
```
하지만 이제는 이렇게 이해하게 되었다.
```plain text
DNS는 전 세계 모든 서버가 모든 도메인 정보를 들고 있는 구조가 아니다.

사용자가 도메인을 물어보면,
재귀 DNS 서버가 Root DNS, TLD DNS, 권한 DNS 서버를 따라가며
공식 원본 정보를 찾아오는 계층적 조회 시스템이다.

그리고 한 번 찾아온 결과는 TTL 동안 캐시된다.
```
즉 DNS는 단순한 전화번호부가 아니다.
전 세계 어디서든 도메인의 공식 담당자를 찾아갈 수 있게 만든 거대한 계층형 질의 시스템이다.
이 구조를 이해하고 나면 `nslookup` 결과가 단순한 IP 조회 결과가 아니라, DNS의 동작 원리를 보여주는 작은 창처럼 보이기 시작한다.
