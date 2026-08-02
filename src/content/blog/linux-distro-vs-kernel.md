---
title: "배포판과 커널을 구분하는 방법"
description: "리눅스 배포판과 커널의 차이를 구분하고, 둘의 관계를 쉽게 정리합니다."
pubDate: "2026-08-03"
category: "Linux"
tags:
  - "Linux"
  - "Kernel"
  - "Distribution"
notionPageId: "3b0410cd-c737-8028-909f-dc3604e58488"
---

<!-- notion-sync: generated -->

## 1. 배포판 확인
현재 설치된 배포판의 이름과 버전은 다음 명령어로 확인할 수 있다.
```plain text
cat /etc/os-release
```
예시 출력은 다음과 같다.
![](/notion-assets/linux-distro-vs-kernel/image-001.png)
```plain text
NAME="Rocky Linux"
VERSION="9.6 (Blue Onyx)"
ID="rocky"
VERSION_ID="9.6"
```
이 결과는 현재 운영체제가 Rocky Linux라는 배포판이며, 배포판 버전이 9.6이라는 의미이다.
배포판에 따라 다음 명령어도 사용할 수 있다.
```plain text
hostnamectl
```
![](/notion-assets/linux-distro-vs-kernel/image-002.png)
```plain text
lsb_release -a
```
다만 `lsb_release` 명령어는 일부 배포판에서 별도 패키지를 설치해야 사용할 수 있다.
---
## 2. Linux 커널 버전 확인
현재 실행 중인 Linux 커널 버전은 다음 명령어로 확인할 수 있다.
```plain text
uname -r
```
예시 출력은 다음과 같다.
![](/notion-assets/linux-distro-vs-kernel/image-003.png)
```plain text
5.14.0-570.26.1.el9_6.x86_64
```
이 결과는 현재 시스템이 Linux 5.14 계열의 커널을 실행하고 있다는 의미이다.
더 자세한 정보를 확인하려면 다음 명령어를 사용할 수 있다.
```plain text
uname -a
```
![](/notion-assets/linux-distro-vs-kernel/image-004.png)
예시 출력에는 다음과 같은 정보가 포함될 수 있다.
- 커널 이름
- 호스트 이름
- 커널 릴리스
- 커널 빌드 정보
- CPU 아키텍처
---
## 3. 명령어 결과를 함께 해석하는 방법
다음과 같은 결과가 있다고 가정해 보자.
```plain text
$ cat /etc/os-release
NAME="Rocky Linux"
VERSION="9.6 (Blue Onyx)"
```
```plain text
$ uname -r
5.14.0-570.26.1.el9_6.x86_64
```
이 시스템은 다음과 같이 해석할 수 있다.
- 배포판: Rocky Linux
- 배포판 버전: 9.6
- Linux 커널 버전: 5.14 계열
- CPU 아키텍처: x86_64
여기서 Rocky Linux 9.6과 Linux 5.14는 서로 다른 버전 정보를 나타낸다.
Rocky Linux 9.6은 운영체제 전체의 버전이고, Linux 5.14는 그 운영체제에서 실행되는 핵심 커널의 버전이다.
