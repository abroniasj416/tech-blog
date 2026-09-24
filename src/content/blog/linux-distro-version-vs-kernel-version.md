---
title: "배포판 버전과 커널 버전은 서로 다른 개념이다"
description: "리눅스 배포판 버전과 커널 버전의 차이와 각각의 확인 방법을 정리합니다."
pubDate: "2026-08-07"
category: "Linux"
tags:
  - "Linux"
  - "Distribution"
  - "Kernel"
notionPageId: "3b0410cd-c737-804a-9cae-e9dee3d39e2c"
---

<!-- notion-sync: generated -->

리눅스 시스템에는 보통 다음 두 가지 버전이 동시에 존재한다.
1. 배포판 버전
2. Linux 커널 버전
이 둘은 같은 의미가 아니다.
![](/notion-assets/linux-distro-version-vs-kernel-version/image-001.webp)
<empty-block/>
---
## 1. 배포판 버전
배포판 버전은 Ubuntu, Rocky Linux, RHEL과 같은 **완성된 운영체제 제품의 버전**을 의미한다.
예를 들면 다음과 같다.
- Ubuntu 24.04
- Rocky Linux 9.6
- Red Hat Enterprise Linux 9
- Debian 13
배포판 버전에는 Linux 커널뿐만 아니라 다음과 같은 전체 구성의 버전과 정책이 포함된다.
- 기본 패키지 버전
- 시스템 라이브러리
- 패키지 관리자
- 보안 정책
- 설정 파일 구조
- 지원 기간
- 업데이트 정책
- 데스크톱 환경
- 시스템 관리 도구
따라서 배포판 버전은 운영체제 전체의 제품 버전이라고 볼 수 있다.
---
## 2. Linux 커널 버전
커널 버전은 운영체제의 핵심 부품인 **Linux 커널 자체의 버전**이다.
예를 들면 다음과 같다.
```plain text
5.14.0
6.8.0
6.12.0
```
같은 배포판 버전이라도 업데이트 상태나 배포판 정책에 따라 서로 다른 세부 커널 버전을 사용할 수 있다.
반대로 서로 다른 배포판이 동일하거나 비슷한 커널 버전을 사용할 수도 있다.
예를 들어 다음과 같은 구성이 가능하다.
```plain text
배포판: Ubuntu 24.04
커널: Linux 6.8
```
```plain text
배포판: Rocky Linux 9
커널: Linux 5.14 계열
```
Ubuntu 24.04와 Rocky Linux 9는 서로 다른 배포판이지만 둘 다 Linux 커널을 사용한다.
다만 각 배포판이 선택한 커널 버전과 패치 정책이 다르다.
---
## 3. Windows에 비유하면
정확히 일치하는 비유는 아니지만 다음과 같이 이해할 수 있다.
<table>
<tr>
<td>Linux 환경</td>
<td>Windows 환경에 비유</td>
</tr>
<tr>
<td>Linux 커널</td>
<td>Windows NT 커널과 같은 운영체제 핵심 부품</td>
</tr>
<tr>
<td>Ubuntu, Rocky Linux, Debian</td>
<td>사용자가 실제로 설치하는 완성된 Windows 제품</td>
</tr>
<tr>
<td>배포판 버전</td>
<td>Windows 10, Windows 11, Windows Server 2022 등의 제품 버전</td>
</tr>
<tr>
<td>커널 버전</td>
<td>운영체제 내부에서 사용되는 핵심 커널의 버전</td>
</tr>
</table>
Windows에서는 Microsoft가 커널과 운영체제 전체를 함께 개발하므로 사용자가 내부 커널 이름과 버전을 의식할 일이 많지 않다.
반면 Linux에서는 Linux 커널과 배포판을 서로 다른 주체가 개발할 수 있기 때문에 두 개념을 구분해서 표현하는 경우가 많다.
