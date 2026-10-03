---
title: "[Linux] rpm, yum, dnf는 뭐가 다를까? - 패키지 파일과 설치의 차이부터 이해하기"
description: "rpm·yum·dnf의 역할과 관계를 비교하고, 패키지 파일 다운로드와 설치의 차이, 의존성 해결, 설치된 패키지와 로컬 RPM 파일의 조회 방법을 Rocky Linux 예제로 정리합니다."
pubDate: "2025-11-20"
category: "Linux"
tags:
  - "Linux"
notionPageId: "3ed410cd-c737-80bb-90a6-c5bf1455b623"
---

<!-- notion-sync: generated -->

Rocky Linux 서버를 다루다 보면 패키지를 설치할 때 `rpm`, `yum`, `dnf` 세 가지 명령어를 모두 마주치게 된다. 셋 다 비슷한 일을 하는 것 같은데, 정확히 무엇이 다른지 헷갈렸다. 이 글에서는 세 도구의 관계를 정리하고, 정리하는 과정에서 내가 잘못 이해하고 있던 부분까지 함께 기록해 둔다.
> 실습 환경: Rocky Linux 9.8 (Naver Cloud Platform VM)
---
## 한 줄 요약
세 가지는 모두 **RPM 패키지**를 다루지만 **계층이 다르다.**
- `rpm` — 가장 아래에 있는 저수준 도구. 패키지 파일을 설치하고, 설치된 패키지를 조회한다.
- `yum` — rpm 위에 **저장소(repository)** 와 **의존성 자동 해결**을 얹은 상위 관리자.
- `dnf` — yum의 후속작. RHEL 8부터 기본 패키지 관리자다.
<table header-row="true">
<tr>
<td>구분</td>
<td>rpm</td>
<td>yum</td>
<td>dnf</td>
</tr>
<tr>
<td>계층</td>
<td>저수준</td>
<td>상위 관리자</td>
<td>상위 관리자 (yum 후속)</td>
</tr>
<tr>
<td>의존성 자동 해결</td>
<td>X</td>
<td>O</td>
<td>O (더 빠르고 정확)</td>
</tr>
<tr>
<td>저장소에서 다운로드</td>
<td>X</td>
<td>O</td>
<td>O</td>
</tr>
<tr>
<td>주 사용 시기</td>
<td>현재도 조회용으로 사용</td>
<td>RHEL/CentOS 7까지</td>
<td>RHEL 8 이후 기본</td>
</tr>
</table>
---
## 먼저 짚고 가야 할 것: `.rpm` 파일이 있다 ≠ 설치되었다
세 도구의 차이를 이해하기 전에, 내가 처음에 헷갈렸던 부분부터 정리하고 싶다.
"로컬에 있는 `.rpm` 파일을 설치한다"는 말을 들었을 때, 나는 **"로컬에 있다면 이미 설치된 것 아닌가?"** 라고 생각했다. 하지만 이건 틀린 생각이었다.
`.rpm` 파일은 윈도우로 치면 다운로드 폴더에 있는 `setup.exe`나 `.msi` 같은 **설치 파일**이다. 설치 파일을 받아 뒀다고 프로그램이 설치된 게 아닌 것처럼, `.rpm` 파일도 실행 파일, 설정 파일, 라이브러리 등을 하나로 묶어 둔 **꾸러미**일 뿐이다.
패키지를 **설치**하면 두 가지 일이 일어난다.
1. 꾸러미 안의 파일과 디렉터리들이 `/usr/sbin/nginx`, `/etc/nginx/nginx.conf`처럼 OS 루트(`/`) 아래의 정해진 위치에 풀려서 배치된다.
2. "이 패키지가 설치되었고, 이 파일들을 소유한다"는 기록이 **rpm 데이터베이스**(`/var/lib/rpm`)에 등록된다.
즉, 패키지 파일을 디스크에 **받아만 둔 상태**와 **설치까지 완료된 상태**는 완전히 다르다. 이 구분을 잡고 나니 세 도구의 역할이 훨씬 명확하게 보였다.
---
## rpm — 저수준 패키지 도구
`rpm`은 이미 디스크에 있는 `.rpm` 파일을 설치·삭제하고, rpm 데이터베이스를 조회하는 도구다.
가장 큰 특징은 **의존성을 자동으로 해결하지 않는다**는 점이다. A 패키지가 B 패키지를 필요로 하면 rpm은 "B가 없다"는 에러를 내고 멈춘다. 필요한 패키지를 직접 찾아서 함께 설치해야 한다. 또 저장소 개념이 없기 때문에 인터넷에서 패키지를 받아오지도 않는다.
그래서 요즘은 설치보다는 **조회 용도**로 더 많이 쓴다.
bash
```bash
rpm -qa | grep nginx                 # 설치된 패키지 목록에서 검색rpm -qi nginx                        # 패키지 상세 정보rpm -ql nginx                        # 패키지가 설치한 파일 목록rpm -qf /etc/nginx/nginx.conf        # 이 파일이 어느 패키지 소속인지
```
위 명령어들은 모두 **rpm 데이터베이스**를 읽는다. 그래서 설치하지 않은 `.rpm` 파일은 여기에 나타나지 않는다.
---
## yum — 저장소와 의존성 해결을 얹은 관리자
`yum`은 rpm 위에서 동작하는 상위 관리자다. `yum install httpd`를 실행하면 저장소에서 httpd와 그에 필요한 의존 패키지를 모두 찾아 내려받고, 설치까지 한 번에 처리한다.
RHEL/CentOS 7까지 기본 패키지 관리자였지만, Python 2 기반이고 의존성 계산이 느리다는 한계가 있었다.
---
## dnf — yum의 후속작
`dnf`는 yum을 대체하기 위해 만들어졌다. **libsolv**라는 의존성 해결 엔진을 사용해서 yum보다 빠르고 정확하다. 명령어 문법은 yum과 거의 같게 만들어져서 그대로 옮겨 쓸 수 있다.
재미있는 점은 Rocky Linux 9에서 `yum`이 사실상 `dnf`를 가리키는 링크라는 것이다.
bash
```bash
ls -l /usr/bin/yum# /usr/bin/yum -> dnf-3
```
그래서 `yum install`을 입력해도 실제로는 dnf가 동작한다.
---
## dnf install은 실제로 무슨 일을 할까?
`dnf install nginx`를 실행하면 다음 흐름으로 진행된다.
1. 저장소에서 nginx 패키지 파일을 **다운로드**한다.
2. nginx 하나만 받는 게 아니라 **의존 패키지까지 전부** 함께 받는다. Rocky 9에서는 `nginx`, `nginx-core`, `nginx-filesystem` 등이 함께 설치 목록에 뜬다.
3. 받은 패키지들을 **설치**한다. 이때 nginx 실행에 필요한 파일과 디렉터리들이 루트 디스크 아래에 배치되고, rpm 데이터베이스에 등록된다.
참고로 실제 패키지 파일 이름은 `nginx.rpm`이 아니라 `nginx-1.20.1-xx.el9.x86_64.rpm`처럼 **이름-버전-릴리스.아키텍처.rpm** 형태다.
설치 중 받은 `.rpm` 파일은 `/var/cache/dnf/` 아래에 임시로 저장되고, 기본 설정(`keepcache=0`)에서는 설치가 끝나면 삭제된다. 그래서 `dnf install` 후에 현재 디렉터리에 `.rpm` 파일이 남지 않는다.
정리하면 **dnf install = 다운로드 + 설치**다.
---
## dnf download — 설치 없이 다운로드만
다운로드만 하고 싶을 때는 `dnf download`를 쓴다. 패키지 파일을 현재 디렉터리에 저장만 하고, 설치는 하지 않는다.
bash
```bash
dnf download nginx             # nginx 패키지 파일 하나만dnf download --resolve nginx   # 의존 패키지까지 함께 (이미 설치된 것은 제외)
```
`dnf install`과 달리 `dnf download`는 기본적으로 **지정한 패키지 하나만** 받는다는 점에 주의해야 한다. 의존 패키지까지 필요하다면 `--resolve` 옵션을 붙인다.
이렇게 받아 둔 파일은 인터넷이 되지 않는 **폐쇄망 서버**로 옮겨서 설치할 때 유용하다.
---
## 직접 확인해 보기: 다운로드만 한 상태 vs 설치한 상태
앞에서 정리한 "파일이 있다 ≠ 설치되었다"를 직접 확인해 볼 수 있다.
bash
```bash
# 1. 패키지 파일만 다운로드dnf download treels tree-*.rpm# tree-1.8.0-10.el9.x86_64.rpm  → 파일은 있다# 2. 설치 여부 확인rpm -q tree# package tree is not installed  → 아직 설치되지 않았다# 3. 설치되지 않은 패키지 파일 안의 내용 조회rpm -qpl tree-*.rpm# 4. 로컬 파일로 설치sudo dnf install ./tree-*.rpm# 5. 다시 확인rpm -q tree# tree-1.8.0-10.el9.x86_64  → 이제 설치된 것으로 조회된다
```
여기서 3번의 `-p` 옵션이 핵심이다.
- `p`가 **없으면** → rpm 데이터베이스에 등록된 **설치된 패키지**를 조회한다.
- `p`가 **있으면** → 아직 설치되지 않은 **패키지 파일(.rpm)** 자체를 조회한다.
`rpm -qa`도 마찬가지다. 다운로드만 한 상태에서는 `rpm -qa | grep tree`에 아무것도 나오지 않고, 설치까지 해야 목록에 나타난다.
---
## 로컬 .rpm 파일도 dnf로 설치하자
로컬에 있는 `.rpm` 파일은 `rpm -ivh`로도 설치할 수 있지만, `dnf install`을 쓰는 편이 낫다.
bash
```bash
sudo rpm -ivh ./tree-*.rpm       # 의존 패키지가 없으면 에러로 멈춤sudo dnf install ./tree-*.rpm    # 부족한 의존 패키지를 저장소에서 자동으로 채워 줌
```
`./`처럼 경로를 붙여 주면 dnf가 저장소의 패키지 이름이 아니라 로컬 파일로 인식한다.
---
## 실무에서는 이렇게 나눠 쓴다
<table header-row="true">
<tr>
<td>하고 싶은 일</td>
<td>사용할 명령어</td>
</tr>
<tr>
<td>패키지 설치 / 업데이트 / 삭제</td>
<td>`dnf install`, `dnf update`, `dnf remove`</td>
</tr>
<tr>
<td>설치 없이 패키지 파일만 받기</td>
<td>`dnf download` (`--resolve`로 의존성 포함)</td>
</tr>
<tr>
<td>특정 파일을 제공하는 패키지 찾기 (저장소 기준)</td>
<td>`dnf provides /usr/sbin/ifconfig`</td>
</tr>
<tr>
<td>설치·삭제 이력 확인 및 되돌리기</td>
<td>`dnf history`, `dnf history undo <ID>`</td>
</tr>
<tr>
<td>설치된 패키지 조회</td>
<td>`rpm -qa`, `rpm -qi`, `rpm -ql`</td>
</tr>
<tr>
<td>특정 파일이 어느 패키지 소속인지 확인</td>
<td>`rpm -qf <파일 경로>`</td>
</tr>
<tr>
<td>설치 전 패키지 파일 내용 확인</td>
<td>`rpm -qpl <파일.rpm>`</td>
</tr>
</table>
---
## 마무리
- `rpm`은 패키지 파일을 설치하고 rpm 데이터베이스를 조회하는 **저수준 도구**다. 의존성은 직접 해결해야 한다.
- `yum`과 `dnf`는 rpm 위에서 **저장소 다운로드 + 의존성 해결**을 해 주는 상위 관리자다. 지금은 dnf가 기본이고, Rocky 9의 `yum`은 dnf로 연결되어 있다.
- `.rpm` 파일이 디스크에 있다는 것과 패키지가 설치되었다는 것은 다르다. 설치되어야 파일이 루트 아래에 배치되고 rpm 데이터베이스에 등록된다.
- `dnf install`은 다운로드와 설치를 함께 하고, `dnf download`는 다운로드만 한다.
설치·관리는 `dnf`, 조회는 `rpm`. 이렇게 역할을 나눠서 기억하면 헷갈릴 일이 줄어든다.
