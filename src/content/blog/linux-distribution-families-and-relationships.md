---
title: "[Linux] 리눅스 배포판, 왜 이렇게 많고 서로 어떤 관계일까"
description: "리눅스 배포판의 주요 계열과 파생 관계를 살펴보고, 업스트림·다운스트림과 바이너리 호환의 의미, Fedora·CentOS Stream·RHEL·Rocky Linux의 관계 및 OS 선택 기준을 정리합니다."
pubDate: "2025-11-05"
category: "Linux"
tags:
  - "Linux"
  - "Distribution"
notionPageId: "3ed410cd-c737-80ba-815e-d5e1ce548ae6"
---

<!-- notion-sync: generated -->

리눅스 배포판은 하나의 줄기에서 갈라져 나온 것이 아니다. 몇 개의 독립된 원조가 있고, 그 원조를 기반으로 파생 배포판이 생겨났다. 이 묶음을 흔히 "계열"이라고 부른다.
Ubuntu, RHEL, Rocky Linux, Amazon Linux처럼 클라우드에서 매일 마주치는 배포판들이 서로 어떤 관계인지 정리해본다. 그 과정에서 업스트림·다운스트림, 바이너리 호환, CentOS와 CentOS Stream의 차이도 함께 짚고 넘어간다.
## 배포판은 하나의 줄기에서 나오지 않았다
모든 배포판의 공통분모는 리눅스 커널 하나뿐이다. 1990년대 초에 Slackware(1993), Debian(1993), Red Hat Linux(1994)가 각자 독립적으로 시작됐다. 서로 fork한 관계가 아니다.
그렇다면 "배포판"은 정확히 무엇일까. 커널만으로는 쓸 수 있는 OS가 되지 않는다. 배포판은 다음 요소들을 골라 하나로 묶어 배포하는 프로젝트다.
- 리눅스 커널
- 기본 도구와 라이브러리: GNU 도구, glibc 같은 C 라이브러리, 셸
- 패키지 관리자와 소프트웨어 저장소
- 기본 설정과 관습: 설정 파일 위치, init 시스템, 보안 정책
- 릴리스 정책: 버전 주기, 지원 기간
같은 커널을 써도 나머지를 어떻게 고르고 운영하느냐에 따라 전혀 다른 배포판이 된다.
## 계열을 나누는 기준: 패키지 관리 체계
계열을 가르는 가장 실질적인 기준은 패키지 관리 체계다. 소프트웨어를 어떤 형식으로 묶고, 어떤 도구로 설치하며, 어느 저장소에서 받아오는지가 계열마다 다르다.
<table header-row="true">
<tr>
<td>계열</td>
<td>패키지 형식</td>
<td>저수준 도구</td>
<td>고수준 도구</td>
</tr>
<tr>
<td>Debian</td>
<td>.deb</td>
<td>dpkg</td>
<td>apt</td>
</tr>
<tr>
<td>Red Hat</td>
<td>.rpm</td>
<td>rpm</td>
<td>dnf (구 yum)</td>
</tr>
<tr>
<td>SUSE</td>
<td>.rpm</td>
<td>rpm</td>
<td>zypper</td>
</tr>
<tr>
<td>Arch</td>
<td>.pkg.tar.zst</td>
<td>—</td>
<td>pacman</td>
</tr>
<tr>
<td>Alpine</td>
<td>.apk</td>
<td>—</td>
<td>apk</td>
</tr>
</table>
이 차이는 설정 파일 위치, 네트워크 설정 방식, 서비스 기본값 같은 관습의 차이로 이어진다. 그래서 같은 계열 안에서는 명령어와 경로 감각이 대부분 그대로 통한다.
한 가지 주의할 점이 있다. SUSE도 rpm을 쓰지만 Red Hat 계열로 분류하지 않는다. 패키지 형식이 같아도 저장소, 도구, 개발 주체가 다르기 때문이다.
## 리눅스 배포판 계열 지도
주요 원조와 파생 배포판의 관계를 정리하면 다음과 같다. 화살표는 "이 배포판을 기반으로 만들어졌다"는 뜻이다.
```plain text
[Debian 계열]
Debian (1993)
├── Ubuntu (2004)
│   ├── Linux Mint
│   └── Pop!_OS
├── Kali Linux
└── Raspberry Pi OS

[Red Hat 계열]
Red Hat Linux (1994, 2003년 종료)
└── Fedora ─→ CentOS Stream ─→ RHEL
    │                            └── Rocky Linux, AlmaLinux, Oracle Linux (RHEL 호환 재빌드)
    └── Amazon Linux 2023

[SUSE 계열]
Slackware (1993)
└── SUSE ─→ openSUSE, SUSE Linux Enterprise (초기 이후 독립)

[Arch 계열]
Arch Linux (2002)
└── Manjaro, EndeavourOS

[기타 독립 배포판]
Gentoo (2002) ─→ ChromeOS (빌드 시스템 Portage 사용)
Alpine (2005)  : musl + BusyBox, 컨테이너 베이스 이미지로 인기
```
Red Hat 계열은 다른 계열과 모양이 다르다. 가지가 갈라지는 나무라기보다 Fedora → CentOS Stream → RHEL로 이어지는 한 줄의 파이프라인에 가깝다. 이 구조는 아래에서 자세히 다룬다.
## 배포판 관계의 세 가지 유형
배포판 사이의 관계는 대부분 다음 셋 중 하나다. 코드를 한 번 복사해 완전히 갈라서는 진짜 fork는 오히려 드물다.
그 전에 용어 하나만 짚자. 원본을 만드는 쪽을 업스트림, 그것을 받아 가공해 쓰는 쪽을 다운스트림이라고 한다. Ubuntu 입장에서 Debian은 업스트림이고, 업스트림에서 고친 버그는 시간이 지나면 다운스트림으로 흘러 내려온다.
1. **지속적으로 동기화하는 파생(derivative)**: Ubuntu는 릴리스 주기마다 Debian의 개발 브랜치(unstable)에서 패키지를 가져와 자체 패치와 설정을 얹는다. Linux Mint는 Ubuntu 저장소를 그대로 쓰고 데스크톱 환경 등 일부만 바꾼다.
2. **업스트림·다운스트림 파이프라인**: Fedora에서 새 기술을 시험하고, 그중 일부가 CentOS Stream을 거쳐 RHEL에 들어간다. 셋은 경쟁 관계가 아니라 하나의 개발 흐름에서 서로 다른 단계에 있다.
3. **리빌드(클론)**: RHEL의 소스를 가져와 Red Hat 상표와 로고만 걷어내고 다시 빌드한다. Rocky Linux, AlmaLinux, Oracle Linux가 여기에 해당한다.
리빌드의 목표는 바이너리 호환이다. RHEL용으로 빌드된 실행 파일을 다시 컴파일하지 않고 그대로 실행할 수 있게 하는 것이다. 이를 위해 glibc 같은 라이브러리의 버전과 호출 방식(ABI)을 RHEL과 맞춘다. 그래서 "RHEL 9 지원" rpm은 Rocky 9에서도 그대로 돈다.
같은 리눅스라도 이런 관계가 아니면 바이너리 호환은 보장되지 않는다. Ubuntu에서 빌드한 실행 파일을 RHEL에 가져가면 라이브러리 버전 차이로 실행되지 않을 수 있다.
## Red Hat 계열 자세히 보기
Red Hat 계열은 RHEL을 기준으로 각 배포판이 앞에 있는지, 뒤에 있는지로 보면 쉽다. 원래 Red Hat Linux라는 단일 제품이었는데, 2003년경 커뮤니티 배포판 Fedora와 유료 기업용 RHEL로 나뉘었다.
```plain text
2020년 이전:  Fedora ─→ RHEL ─→ CentOS Linux
2021년 이후:  Fedora ─→ CentOS Stream ─→ RHEL ─→ Rocky Linux / AlmaLinux
```
이름이 비슷한 CentOS와 CentOS Stream은 위치가 정반대다. 흔히 "CentOS"라 부르던 CentOS Linux는 RHEL 출시 후 소스를 재빌드한 다운스트림 클론이라, 사실상 무료 RHEL처럼 쓰였다. 반면 CentOS Stream은 RHEL 다음 버전의 개발 브랜치, 즉 RHEL보다 앞선 업스트림이다.
2020년 12월 Red Hat이 CentOS를 Stream 중심으로 전환하면서 CentOS Linux 8은 2021년 말 조기 종료됐고, 7도 2024년 6월 지원이 끝났다. 빈자리는 CentOS 공동 창립자가 시작한 Rocky Linux와 CloudLinux 쪽의 AlmaLinux가 이어받았다. 2023년 Red Hat이 RHEL 소스 공개 방식을 제한한 뒤로, Rocky는 RHEL과의 1:1 동일성을, AlmaLinux는 ABI 호환을 목표로 삼고 있다.
운영 중인 서버에 CentOS 7이 남아 있다면 더 이상 보안 패치가 나오지 않는 상태다. Rocky, Alma, RHEL 같은 다른 OS로 옮겨야 할 마이그레이션 대상이다.
Amazon Linux 2023은 Fedora를 기반으로 하고 dnf를 쓰니 넓게 보면 Red Hat 계열이다. 하지만 RHEL과 바이너리가 호환되는 클론은 아니어서, RHEL용 패키지가 그대로 돈다고 가정하면 안 된다.
## RHEL 대신 Rocky를 쓰면 안 될까
그 서버에 Red Hat의 지원과 인증이 필요 없다면 써도 된다. 실제로 많은 회사가 그렇게 한다. RHEL 구독료는 OS 파일 값이 아니라 그 OS를 둘러싼 지원과 보증에 내는 돈이기 때문이다.
다만 Rocky가 RHEL과 아예 똑같지는 않다. 재빌드 구조라 보안 패치가 보통 RHEL보다 며칠 늦게 반영된다. 재부팅 없이 커널 패치를 적용하는 라이브 패치, 취약점을 분석하는 Red Hat Insights, 대규모 패치 관리 도구 Satellite 같은 구독 기능도 없다. 기술적으로 잘 돌아가는 것과 벤더가 공식 지원해주는 것도 별개다.
RHEL 구독료로 사는 것은 다음과 같다.
<table header-row="true">
<tr>
<td>항목</td>
<td>의미</td>
</tr>
<tr>
<td>기술 지원</td>
<td>장애 시 Red Hat에 케이스를 열어 엔지니어 분석을 받는다. Rocky는 커뮤니티나 자체 해결에 의존한다.</td>
</tr>
<tr>
<td>서드파티 벤더 인증</td>
<td>SAP, 일부 상용 DB와 보안 솔루션은 지원 OS 목록에 RHEL만 올리는 경우가 많다.</td>
</tr>
<tr>
<td>규정과 인증</td>
<td>금융·공공 프로젝트는 상용 지원 OS나 FIPS 같은 보안 인증을 요구하기도 한다.</td>
</tr>
<tr>
<td>긴 지원 기간</td>
<td>마이너 버전 연장 지원(EUS), 지원 종료 후 연장 지원(ELS)을 유료로 제공한다.</td>
</tr>
</table>
이를 상황별로 정리하면 다음과 같다.
<table header-row="true">
<tr>
<td>상황</td>
<td>추천</td>
</tr>
<tr>
<td>개발·테스트 환경, 쉽게 다시 만드는 서버</td>
<td>Rocky / Alma</td>
</tr>
<tr>
<td>팀이 OS 문제를 스스로 해결할 역량이 있음</td>
<td>Rocky / Alma</td>
</tr>
<tr>
<td>장애 시 책임을 물을 곳이 필요한 핵심 시스템</td>
<td>RHEL</td>
</tr>
<tr>
<td>지원 OS 목록에 RHEL만 있는 상용 소프트웨어</td>
<td>RHEL</td>
</tr>
<tr>
<td>계약·규정상 상용 지원 OS가 요구됨</td>
<td>RHEL</td>
</tr>
</table>
중간 선택지도 있다. Rocky는 CIQ, Alma는 TuxCare 같은 업체가 유료 상용 지원을 판매한다. 반대로 RHEL도 개인 개발자용 무료 구독이 있고, 클라우드에서는 라이선스 비용이 인스턴스 시간당 요금에 포함돼 쓴 만큼만 낼 수 있다.
MSP나 SI 프로젝트라면 OS를 고르기 전에 고객사 요구 사항, 올라갈 소프트웨어의 지원 OS 목록, 장애 대응 책임 주체부터 확인하는 것이 순서다.
## 그 밖의 계열
<table header-row="true">
<tr>
<td>배포판</td>
<td>특징</td>
<td>주로 쓰이는 곳</td>
</tr>
<tr>
<td>SUSE (openSUSE, SLES)</td>
<td>Slackware 기반으로 시작해 일찍 독립. rpm + zypper 사용</td>
<td>유럽 기업, SAP 환경</td>
</tr>
<tr>
<td>Arch Linux</td>
<td>버전 번호 없이 계속 최신으로 갱신하는 롤링 릴리스. pacman 사용</td>
<td>개인 데스크톱, 학습용</td>
</tr>
<tr>
<td>Manjaro</td>
<td>Arch를 좀 더 안정적이고 쉽게 다듬은 파생</td>
<td>데스크톱</td>
</tr>
<tr>
<td>Gentoo</td>
<td>소스를 직접 컴파일해서 설치. ChromeOS가 Gentoo의 빌드 시스템 Portage를 사용</td>
<td>고급 사용자, 임베디드</td>
</tr>
<tr>
<td>Alpine</td>
<td>glibc 대신 musl, BusyBox를 쓰는 초경량 배포판</td>
<td>컨테이너 베이스 이미지</td>
</tr>
</table>
Alpine은 이미지 크기가 작아 Docker 베이스 이미지로 인기가 많다. 다만 glibc를 전제로 빌드된 바이너리가 그대로 돌지 않을 수 있다. 앞에서 본 바이너리 호환 문제가 실제로 자주 드러나는 곳이다.
