---
title: "[Linux] dnf install은 어떻게 패키지를 찾는가"
description: "dnf install이 저장소 메타데이터를 모아 패키지와 의존성을 찾고, 후보 선택과 다운로드 URL 결정, 체크섬·GPG 서명 검증을 거쳐 설치하는 과정을 정리합니다."
pubDate: "2026-01-01"
category: "Linux"
tags:
  - "Linux"
notionPageId: "3ee410cd-c737-805d-b08b-db79785c2203"
---

<!-- notion-sync: generated -->

## 들어가며
dnf는 nginx를 찾으려고 repo URL을 하나씩 찾아다니지 않는다. 모든 활성화된 저장소의 목록(메타데이터)을 먼저 받아 합쳐 놓고, 그 안에서 nginx를 검색한다.
Rocky Linux 서버에서 `/etc/yum.repos.d/`를 열어 보면 .repo 파일이 여러 개 있다.
```plain text
[soojin@hsj-public-svr yum.repos.d]$ ll
-rw-r--r--  1 root root 1052 Apr 23  2025 epel-cisco-openh264.repo
-rw-r--r--  1 root root 1333 Apr 23  2025 epel.repo
-rw-r--r--  1 root root 1432 Apr 23  2025 epel-testing.repo
-rw-r--r--. 1 root root 6466 Jun  9  2025 rocky-addons.repo
-rw-r--r--. 1 root root 1141 Jun  9  2025 rocky-devel.repo
-rw-r--r--. 1 root root 2339 Jun  9  2025 rocky-extras.repo
-rw-r--r--. 1 root root 3345 Jun  9  2025 rocky.repo
-rw-r--r--. 1 root root 1425 May 24 00:27 rocky-security.repo
```
여기서 `dnf install nginx`를 실행하면 dnf는 이 많은 파일 중 어디로 가야 nginx가 있는지, 한 파일 안에 주소가 여러 개면 어느 주소로 가야 하는지 어떻게 알까? 처음에는 dnf가 .repo 파일의 URL을 차례로 찾아가 nginx를 찾는다고 생각하기 쉽다. 실제 동작은 그렇지 않다. 이 글에서는 그 과정을 네 단계로 나누어 정리한다.
## 먼저 알아둘 용어
이 글에 나오는 다섯 가지 용어부터 정리한다. 이것만 알면 나머지 내용을 따라올 수 있다.
**패키지(rpm)**: 프로그램을 설치하기 좋게 묶어 둔 파일이다. 실행 파일, 설정 파일, 문서와 함께 "이 프로그램의 이름과 버전은 무엇이고, 실행하려면 무엇이 더 필요한가" 같은 정보가 들어 있다. Rocky Linux, RHEL 계열에서는 `.rpm` 확장자를 쓴다. 예를 들어 nginx는 `nginx-1.20.1-16.el9.x86_64.rpm` 같은 파일로 배포된다.
**의존성**: 어떤 패키지가 동작하려면 먼저 설치되어 있어야 하는 다른 패키지다. nginx는 암호화 통신을 위해 `openssl-libs`가 필요하다. 이때 nginx는 openssl-libs에 의존한다고 말한다.
**저장소(repository)**: 패키지 파일을 모아 둔 서버의 디렉터리다. 앱스토어를 떠올리면 된다. Rocky Linux 공식 저장소, EPEL 저장소처럼 운영 주체별로 여러 저장소가 있다.
**메타데이터**: "데이터에 대한 데이터"라는 뜻이다. 여기서는 저장소에 어떤 패키지가 있는지 정리한 목록을 말한다. 패키지 이름, 버전, 의존성, 파일 위치가 담겨 있다. 도서관으로 치면 책이 패키지이고, 도서 목록이 메타데이터다.
**dnf**: 패키지를 찾아서 받고, 의존성까지 계산해 설치해 주는 패키지 관리자다. Rocky Linux 8부터 기본으로 쓰이며, 예전 yum의 후속이다. 그래서 설정 디렉터리 이름이 아직 `yum.repos.d`다.
이 용어로 dnf가 하는 일을 한 문장으로 쓰면 이렇다. **dnf는 여러 저장소의 메타데이터를 읽고, 원하는 패키지와 그 의존성을 찾아 내려받아 설치한다.** 아래에서는 이 과정을 하나씩 따라간다.
## .repo 파일과 저장소의 관계
.repo 파일 하나가 저장소 하나는 아니다. 파일 안의 `[섹션]` 하나하나가 독립된 저장소(repo)다.
예를 들어 `rocky.repo` 안에는 `[baseos]`, `[appstream]`, `[crb]` 같은 섹션이 여러 개 들어 있다. 파일 이름은 사람이 관리하기 편하도록 나눈 것일 뿐이다. dnf는 디렉터리 안의 모든 `.repo` 파일에서 섹션을 모아 하나의 저장소 목록으로 다룬다. 확장자가 `.repo`가 아닌 파일은 읽지 않는다.
섹션 하나는 다음처럼 생겼다. 대괄호 안의 이름이 저장소 id이고, 그 아래 줄들이 이 저장소의 설정이다.
```plain text
[appstream]
name=Rocky Linux $releasever - AppStream
mirrorlist=https://mirrors.rockylinux.org/mirrorlist?arch=$basearch&repo=AppStream-$releasever
#baseurl=http://dl.rockylinux.org/$contentdir/$releasever/AppStream/$basearch/os/
gpgcheck=1
enabled=1
```
`$releasever`(OS 버전, 예: 9)와 `$basearch`(CPU 종류, 예: x86_64)는 dnf가 실행될 때 실제 값으로 바꿔 넣는 변수다. 줄 앞의 `#`은 주석이라 무시된다.
섹션 안의 주요 항목은 다음과 같다.
<table header-row="true">
<tr>
<td>항목</td>
<td>의미</td>
</tr>
<tr>
<td>`baseurl`</td>
<td>저장소의 주소. 여러 개를 적으면 같은 내용을 가진 미러 목록으로 취급한다</td>
</tr>
<tr>
<td>`mirrorlist`</td>
<td>사용 가능한 미러 목록을 돌려주는 주소</td>
</tr>
<tr>
<td>`metalink`</td>
<td>미러 목록에 최신 repomd.xml의 체크섬까지 함께 돌려주는 주소</td>
</tr>
<tr>
<td>`enabled`</td>
<td>1이면 사용, 0이면 무시. 섹션(저장소) 단위 설정이다</td>
</tr>
<tr>
<td>`priority`</td>
<td>저장소 우선순위. 숫자가 작을수록 우선이며 기본값은 99</td>
</tr>
</table>
Rocky 기본 파일에서는 `baseurl`이 주석 처리되어 있고 `mirrorlist`를 쓰는 경우가 많다. 직접 확인해 보면 구조가 잘 보인다.
```bash
grep -E '^\[|^baseurl|^mirrorlist|^metalink|^enabled' /etc/yum.repos.d/rocky.repo
```
## 1단계: 메타데이터 수집
dnf는 먼저 enabled=1인 모든 저장소에서 메타데이터를 받아 로컬 캐시에 저장한다. 패키지를 찾기 전에 목록부터 확보하는 단계다.
저장소 서버에는 rpm 파일과 함께 `repodata/` 디렉터리가 있다. dnf는 `baseurl + /repodata/repomd.xml`을 가장 먼저 요청한다.
```plain text
baseurl/
├── repodata/
│   ├── repomd.xml           ← 목차: 아래 파일들의 이름과 체크섬
│   ├── xxxx-primary.xml.gz  ← 패키지 이름, 버전, 의존성, 파일 위치
│   ├── xxxx-filelists.xml.gz
│   └── xxxx-other.xml.gz
└── Packages/
    └── n/nginx-...rpm
```
repomd.xml은 목차 역할을 한다. dnf는 여기에 적힌 primary.xml 등을 이어서 받는다. 이 메타데이터는 저장소 운영자가 `createrepo_c` 같은 도구로 미리 만들어 둔 것이고, dnf는 읽어오기만 한다.
### repomd.xml: 목차
repomd.xml에는 패키지 정보가 하나도 없다. 이 저장소에 어떤 메타데이터 파일이 있고, 각각 어디에 있으며, 체크섬이 무엇인지만 적혀 있다. 체크섬은 파일 내용으로 계산한 고유한 값으로, 받은 파일이 원본과 같은지 확인하는 데 쓴다.
```xml
<repomd>
  <data type="primary">
    <checksum type="sha256">3a1f...</checksum>
    <location href="repodata/3a1f...-primary.xml.gz"/>
    <timestamp>1727912345</timestamp>
    <size>2483921</size>
  </data>
  <data type="filelists"> ... </data>
  <data type="other"> ... </data>
  <data type="updateinfo"> ... </data>
  <data type="modules"> ... </data>
  <data type="group"> ... </data>
</repomd>
```
`type`마다 가리키는 파일의 역할은 다음과 같다.
<table header-row="true">
<tr>
<td>type</td>
<td>내용</td>
</tr>
<tr>
<td>primary</td>
<td>패키지 이름, 버전, 의존성, 위치 등 핵심 정보</td>
</tr>
<tr>
<td>filelists</td>
<td>각 패키지가 설치하는 전체 파일 목록</td>
</tr>
<tr>
<td>other</td>
<td>패키지별 변경 이력(changelog)</td>
</tr>
<tr>
<td>updateinfo</td>
<td>보안 업데이트 정보</td>
</tr>
<tr>
<td>modules</td>
<td>모듈 스트림 정의 (3단계에서 설명)</td>
</tr>
<tr>
<td>group</td>
<td>패키지 그룹 정보. `dnf group install`에서 쓴다</td>
</tr>
</table>
### primary.xml: 패키지 정보 본문
primary.xml에는 저장소에 있는 rpm마다 `<package>` 항목이 하나씩 있다. nginx 항목을 간단히 줄이면 다음과 같다.
```xml
<package type="rpm">
  <name>nginx</name>
  <arch>x86_64</arch>
  <version epoch="2" ver="1.20.1" rel="16.el9"/>
  <checksum type="sha256">5b7d...</checksum>
  <summary>A high performance web server and reverse proxy server</summary>
  <location href="Packages/n/nginx-1.20.1-16.el9.x86_64.rpm"/>
  <format>
    <rpm:provides> <rpm:entry name="nginx"/> <rpm:entry name="webserver"/> </rpm:provides>
    <rpm:requires> <rpm:entry name="nginx-core"/> <rpm:entry name="openssl-libs"/> </rpm:requires>
  </format>
</package>
```
이 글의 나머지 단계는 모두 이 항목을 사용한다.
<table header-row="true">
<tr>
<td>항목</td>
<td>의미</td>
<td>쓰이는 곳</td>
</tr>
<tr>
<td>`name`, `version`, `arch`</td>
<td>패키지 이름, 버전, 대상 CPU 종류</td>
<td>3단계: 후보 선택</td>
</tr>
<tr>
<td>`requires`</td>
<td>이 패키지에 필요한 것</td>
<td>2단계: 의존성 계산</td>
</tr>
<tr>
<td>`provides`</td>
<td>이 패키지가 제공하는 것</td>
<td>2단계: 의존성 계산</td>
</tr>
<tr>
<td>`location href`</td>
<td>저장소 안에서 rpm 파일의 위치</td>
<td>4단계: 다운로드 URL</td>
</tr>
<tr>
<td>`checksum`</td>
<td>rpm 파일의 체크섬</td>
<td>4단계: 받은 파일 검증</td>
</tr>
</table>
### 왜 나눠 두었을까
모든 정보를 한 파일에 담으면 dnf가 매번 거대한 파일을 받아야 한다. 그래서 거의 모든 작업에 필요한 primary는 항상 받고, 용량이 큰 filelists나 changelog가 담긴 other는 필요할 때만 받는다.
repomd.xml은 이름이 항상 고정되어 있어서 dnf가 처음 찾아가는 출발점이 된다. 나머지 파일은 이름 앞에 체크섬이 붙어 있어서 내용이 바뀌면 이름도 바뀐다. 그래서 dnf는 repomd.xml만 다시 받아 보면 어느 파일이 바뀌었는지 바로 알 수 있다.
받은 메타데이터는 한 파일에 합쳐지지 않고 저장소마다 따로 저장된다.
```plain text
/var/cache/dnf/
├── baseos-<해시>/repodata/
├── appstream-<해시>/repodata/
├── epel-<해시>/repodata/
├── baseos.solv
├── appstream.solv
└── epel.solv
```
디렉터리 이름 뒤의 해시는 baseurl(또는 mirrorlist/metalink) 문자열로 만든 값이다. 같은 저장소 id라도 주소가 바뀌면 다른 캐시로 구분된다. `.solv` 파일은 primary.xml을 빠르게 읽을 수 있도록 바이너리로 변환한 것이다.
`dnf install`을 할 때마다 요청을 보내지는 않는다. 캐시가 `metadata_expire`(기본 48시간) 안에 있으면 네트워크 없이 캐시를 그대로 쓴다. 만료됐을 때도 repomd.xml만 먼저 받아 체크섬이 바뀐 경우에만 나머지를 다시 받는다. 이 단계를 직접 실행하는 명령이 `dnf makecache`다.
## 2단계: 메모리에서 합쳐서 검색
저장은 저장소별로 따로 하지만, 검색은 메모리에서 하나로 합쳐서 한다.
dnf가 실행되면 저장소별 `.solv` 파일을 모두 읽어 메모리에 하나의 패키지 풀을 만든다. 이 작업은 libsolv라는 라이브러리(여러 프로그램이 가져다 쓰는 기능 모음)가 맡는다. libsolv는 "이 패키지를 설치하려면 무엇이 더 필요한가"를 빠르게 계산하는 데 특화되어 있다. nginx가 어느 저장소에 있는지, 의존성으로 무엇을 함께 설치해야 하는지는 이 풀에서 한 번에 계산한다.
그래서 dnf는 nginx가 어느 .repo 파일에 있는지 미리 알 필요가 없다. 모든 저장소의 목록이 이미 한곳에 모여 있으니, 그 안에서 이름이 `nginx`인 패키지를 찾기만 하면 된다.
저장을 나눠 두는 데는 이유가 있다. 저장소 하나만 갱신됐을 때 그 저장소의 캐시만 다시 받으면 되기 때문이다.
## 3단계: 후보가 여러 개일 때의 선택 규칙
같은 이름의 패키지가 여러 저장소에 있으면 dnf는 정해진 순서로 후보를 걸러낸다.
1. **제외 설정**: `exclude`, `excludepkgs`, `includepkgs`로 걸러진 패키지는 처음부터 후보에서 빠진다.
2. **모듈 필터링**: 모듈은 한 프로그램의 여러 버전을 저장소 하나에 함께 담아 두는 방식이고, 각 버전 줄기를 스트림이라고 부른다. Rocky 8/9의 AppStream에는 nginx가 1.22, 1.24 같은 스트림으로도 들어 있다. 사용자가 고른(활성화한) 스트림의 패키지만 후보가 되고, 나머지 스트림은 보이지 않는다.
3. **priority**: 저장소 사이의 우선순위를 정하는 값이다. 숫자가 작은 저장소의 패키지가 이기고, 기본값은 99다. 예를 들어 사내 저장소에 priority=10을 주면, 공식 저장소에 더 높은 버전이 있어도 사내 저장소의 패키지를 쓴다.
4. **버전과 아키텍처**: 남은 후보 중 가장 높은 버전, 그리고 시스템에 맞는 아키텍처를 고른다. 아키텍처는 패키지가 동작하는 CPU 종류로, 일반 서버는 x86_64다. noarch는 스크립트나 문서처럼 CPU와 상관없이 쓸 수 있는 패키지다.
5. **cost**: 저장소에 접근하는 비용(속도나 거리)을 나타내는 값이다. 이름, 버전, 아키텍처까지 완전히 같은 패키지가 여러 저장소에 있으면 cost가 낮은 저장소에서 받는다. priority와 달리 어떤 패키지를 고를지에는 영향을 주지 않고, 어디서 받을지만 정한다.
모듈 상태와 저장소별 후보는 다음 명령으로 확인할 수 있다.
```bash
dnf module list nginx
dnf list --showduplicates nginx
```
## 4단계: 다운로드 URL 결정
다운로드할 주소는 검색 결과 안에 이미 들어 있다. 다운로드 URL은 저장소의 baseurl 뒤에 패키지의 상대 경로를 붙여 만든다.
선택된 패키지의 메타데이터에는 어느 저장소 소속인지와 저장소 안의 상대 경로(`location href`)가 기록되어 있다.
```plain text
baseurl       : http://dl.rockylinux.org/pub/rocky/9/AppStream/x86_64/os/
location href : Packages/n/nginx-1.20.1-...x86_64.rpm
최종 URL      : baseurl + location href
```
저장소 서버에는 dnf 전용 로직이 없다. 웹 서버가 메타데이터든 rpm이든 경로에 있는 파일을 그대로 내려줄 뿐이다.
### 주소가 여러 개라면
`baseurl`에 URL을 여러 개 적거나 `mirrorlist`, `metalink`로 미러 목록을 받는 경우, 그 주소들은 서로 다른 저장소가 아니다. 원본과 같은 내용을 복제해 둔 미러들이다. 그래서 nginx가 어느 주소에 있는지 따질 필요 없이 어디서 받아도 결과가 같다.
dnf는 미러를 순서대로 시도하거나, `fastestmirror=True`이면 가장 빠른 미러를 고른다. 실패하면 다음 미러로 넘어간다. metalink를 쓰면 원본 기준 최신 repomd.xml의 체크섬도 함께 받기 때문에, 아직 동기화되지 않은 오래된 미러를 걸러낼 수 있다.
마지막으로 받은 rpm은 primary.xml에 적힌 체크섬과 비교해 손상 여부를 확인하고, `gpgcheck=1`이면 GPG 서명까지 검증한 뒤 설치한다.
체크섬과 GPG 서명은 역할이 다르다. 체크섬은 파일이 전송 중 손상되지 않았는지 확인한다. 하지만 공격자가 rpm과 체크섬을 함께 바꿔치기하면 체크섬만으로는 알아챌 수 없다. GPG 서명은 저장소 운영자만 가진 비밀 키로 만든 서명이라서, 이 패키지를 정말 그 운영자가 만들었는지까지 확인해 준다.
## 직접 확인하는 명령어
위의 네 단계는 아래 명령으로 하나씩 확인할 수 있다.
```bash
dnf repolist -v                      # 저장소별 id, 주소, 패키지 수
dnf makecache                        # 1단계: 메타데이터 수집
ls /var/cache/dnf/                   # 저장소별 캐시 디렉터리와 .solv 파일
dnf list --showduplicates nginx      # 3단계: 저장소별 후보와 버전
dnf info nginx                       # 최종 후보와 출처 저장소
dnf repoquery --location nginx       # 4단계: 최종 다운로드 URL
dnf install nginx --repo=appstream   # 특정 저장소만 사용
```
특히 `dnf repoquery --location nginx`를 실행하면 baseurl과 상대 경로가 합쳐진 최종 URL이 출력된다. 4단계에서 설명한 구조를 눈으로 확인할 수 있다.
## 정리
`dnf install nginx`는 "주소를 찾아가서 패키지를 찾는" 과정이 아니라 "목록을 먼저 모으고, 그 안에서 고른 뒤, 주소를 조합해 받는" 과정이다.
1. **수집**: enabled=1인 모든 저장소에서 repomd.xml과 primary.xml 등을 받아 저장소별로 캐시한다.
2. **검색**: 저장소별 캐시를 메모리에서 하나로 합쳐 nginx와 의존성을 찾는다.
3. **선택**: 제외 설정, 모듈, priority, 버전, 아키텍처 순으로 후보를 하나로 좁힌다.
4. **다운로드**: 저장소 주소(미러)와 패키지의 상대 경로를 합쳐 rpm을 받고, 체크섬과 서명을 검증한 뒤 설치한다.
다음 글에서는 1단계에서 받아오는 repomd.xml과 dnf 캐시 구조를 더 자세히 살펴본다.
