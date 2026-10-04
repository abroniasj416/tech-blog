---
title: "[Linux] 나만의 dnf 저장소 만들기"
description: "Rocky Linux에서 RPM 파일과 createrepo_c로 로컬 저장소를 만들고, Nginx를 통한 HTTP 제공, 클라이언트 등록·설치, 메타데이터 갱신과 GPG 서명 검사까지 실습합니다."
pubDate: "2026-01-10"
category: "Linux"
tags:
  - "Linux"
  - "Nginx"
notionPageId: "3ee410cd-c737-804f-b8c4-c2f328381b98"
---

<!-- notion-sync: generated -->

## 들어가며
dnf 저장소는 rpm 파일, `createrepo_c`로 만든 메타데이터, 그리고 파일을 내려주는 웹 서버만 있으면 누구나 만들 수 있다. 이 글에서는 세 가지를 직접 준비해 나만의 저장소를 띄워 본다.
지금까지 세 편은 저장소를 "쓰는" 쪽에서 봤다.
- 1편 **\[dnf install은 어떻게 패키지를 찾는가\]**: dnf가 여러 저장소의 메타데이터를 모아 패키지를 찾는 과정
- 2편 **\[dnf는 메타데이터를 어디에, 어떻게 저장하는가\]**: 메타데이터의 시작점인 repomd.xml과 dnf 캐시 구조
- 3편 **\[해시의 두 가지 얼굴: 이름표와 검증 도구, 그리고 GPG 서명\]**: 받은 파일을 해시와 GPG 서명으로 검증하는 방법
이번에는 반대편에 서서 저장소를 "만드는" 쪽이 되어 본다. 직접 만들어 보면 앞의 세 편에서 설명한 구조가 왜 그렇게 생겼는지 손으로 확인할 수 있다.
## 저장소에 필요한 세 가지
.repo 파일 하나만 만든다고 저장소가 생기지는 않는다. .repo 파일은 "저장소가 어디 있는가"를 적은 주소일 뿐이고, 그 주소 반대편에 다음 세 가지가 준비되어 있어야 한다.
<table header-row="true">
<tr>
<td>재료</td>
<td>역할</td>
<td>준비 방법</td>
</tr>
<tr>
<td>rpm 파일</td>
<td>실제로 설치될 패키지</td>
<td>디렉터리에 모아 둔다</td>
</tr>
<tr>
<td>메타데이터 (`repodata/`)</td>
<td>어떤 패키지가 있는지 알려주는 목차</td>
<td>`createrepo_c` 명령으로 생성한다</td>
</tr>
<tr>
<td>웹 서버</td>
<td>파일을 HTTP로 내려준다</td>
<td>nginx나 Apache를 설치해 실행한다</td>
</tr>
</table>
도서관에 비유하면 rpm은 책, 메타데이터는 도서 목록, 웹 서버는 도서관 문을 여는 일이다. .repo 파일은 이용자가 수첩에 적어 둔 도서관 주소다.
특히 `createrepo_c`에 대해 오해하기 쉽다. 이 명령은 메타데이터 파일을 만들고 끝난다. 네트워크 포트를 열거나 서버를 띄우지 않는다. 다른 서버가 이 저장소를 쓰게 하려면 웹 서버는 따로 설치해야 한다.
## 실습 환경과 진행 순서
Rocky Linux 9 서버 두 대로 진행한다. 한 대뿐이라면 실습 2까지는 그대로 따라 하고, 실습 3\~4에서는 클라이언트 주소 자리에 `localhost`를 넣으면 된다.
<table header-row="true">
<tr>
<td>역할</td>
<td>예시 이름</td>
<td>예시 IP</td>
</tr>
<tr>
<td>저장소 서버</td>
<td>repo-server</td>
<td>192.168.0.10</td>
</tr>
<tr>
<td>클라이언트</td>
<td>node1</td>
<td>192.168.0.20</td>
</tr>
</table>
저장소에 넣을 예시 패키지는 `tree`(디렉터리 구조를 나무 모양으로 보여주는 프로그램)와 `jq`(JSON 데이터를 보기 좋게 정리하는 프로그램)로 정했다. 둘 다 작고, 아직 설치되어 있지 않은 경우가 많아 결과를 확인하기 좋다.
진행 순서는 다음과 같다.
1. **실습 1**: 저장소 서버에서 rpm을 모으고 메타데이터를 만든다.
2. **실습 2**: 웹 서버 없이 같은 서버에서 `file://` 주소로 저장소를 써 본다.
3. **실습 3**: nginx를 설치해 저장소를 네트워크에 공개한다.
4. **실습 4**: 클라이언트에서 .repo 파일을 만들고 패키지를 설치한다.
실습 2를 따로 둔 이유가 있다. 웹 서버 없이도 저장소가 동작하는 것을 먼저 보면, "저장소는 결국 rpm과 메타데이터가 든 디렉터리"라는 점이 분명해진다.
## 실습 1: rpm 모으고 메타데이터 만들기
저장소 서버에서 rpm 파일을 한 디렉터리에 모은 뒤 `createrepo_c`를 실행하면 저장소의 내용물이 완성된다.
### 필요한 도구 설치
```bash
sudo dnf install -y createrepo_c dnf-plugins-core
```
`createrepo_c`는 메타데이터를 만드는 도구다. `dnf-plugins-core`에는 설치하지 않고 rpm 파일만 내려받는 `dnf download` 명령이 들어 있다.
### rpm 파일 모으기
```bash
sudo mkdir -p /srv/repo/soojin/Packages
cd /srv/repo/soojin/Packages
sudo dnf download --resolve tree jq
ls
```
- `-resolve`는 의존성까지 함께 받으라는 옵션이다. 실행해 보면 `tree`, `jq` 외에 `oniguruma` 같은 rpm이 함께 받아진다. jq가 동작하려면 oniguruma라는 라이브러리가 필요하기 때문이다. 저장소에 jq만 있고 oniguruma가 없으면, 이 저장소만 쓰는 서버에서는 jq를 설치할 수 없다.
한 가지 주의할 점이 있다. `--resolve`는 지금 이 서버에 설치되어 있지 않은 의존성만 받는다. 이미 설치된 라이브러리는 받지 않으므로, 아무것도 설치되지 않은 서버를 위한 저장소를 만들 때는 의존성을 따로 챙겨야 한다.
### 메타데이터 만들기
```bash
sudo createrepo_c /srv/repo/soojin
```
이 명령은 디렉터리 안의 rpm을 하나씩 열어 이름, 버전, 의존성, 체크섬을 읽고 `repodata/`를 만든다. 결과를 확인해 보자.
```bash
$ tree /srv/repo/soojin       # tree가 아직 없다면 ls -R 사용
/srv/repo/soojin
├── Packages
│   ├── jq-1.6-...el9.x86_64.rpm
│   ├── oniguruma-6.9.6-...el9.x86_64.rpm
│   └── tree-1.8.0-...el9.x86_64.rpm
└── repodata
    ├── 3a1f...-primary.xml.gz
    ├── 9c2e...-filelists.xml.gz
    ├── 7b4d...-other.xml.gz
    └── repomd.xml
```
2편에서 본 구조가 그대로 만들어졌다. repomd.xml은 이름이 고정되어 있고, 나머지 파일은 이름 앞에 내용의 해시가 붙어 있다. `cat /srv/repo/soojin/repodata/repomd.xml`로 열어 보면 primary, filelists, other 파일의 위치와 체크섬이 적혀 있다.
## 실습 2: file://로 같은 서버에서 쓰기
웹 서버 없이도 저장소는 동작한다. baseurl에 `http://` 대신 `file://`로 시작하는 로컬 디렉터리 경로를 적으면, dnf가 네트워크를 거치지 않고 디렉터리에서 직접 파일을 읽는다.
저장소 서버에 .repo 파일을 만든다. 확장자는 반드시 `.repo`여야 한다. dnf는 다른 확장자의 파일은 읽지 않는다.
```bash
sudo vi /etc/yum.repos.d/soojin-local.repo
```
```plain text
[soojin-local]
name=Soojin Local Repo
baseurl=file:///srv/repo/soojin
enabled=1
gpgcheck=0
```
`file://` 뒤에 경로 `/srv/repo/soojin`이 붙어서 슬래시가 세 개가 된다. `gpgcheck=0`은 실습을 단순하게 하려고 서명 검사를 잠시 끈 것이다. 서명 검사를 켜는 방법은 뒤에서 다룬다.
이제 저장소가 인식되는지 확인한다.
```bash
# 저장소 목록에 soojin-local이 보이는지 확인
dnf repolist

# 이 저장소의 메타데이터만 받아 캐시 만들기
sudo dnf makecache --repo=soojin-local

# 이 저장소에 있는 패키지 목록 보기
dnf list --repo=soojin-local --available
```
마지막 명령에서 tree, jq, oniguruma가 보이면 성공이다. dnf가 `/srv/repo/soojin/repodata/repomd.xml`을 읽고, 거기 적힌 primary.xml에서 패키지 목록을 가져온 것이다. 1편과 2편에서 설명한 과정이 웹 서버 없이 그대로 일어났다.
실습 3으로 넘어가기 전에 이 파일은 꺼 두자. 실습 4에서 같은 패키지를 네트워크 저장소로 받는지 확인할 때 헷갈리지 않게 하기 위해서다.
```bash
sudo dnf config-manager --set-disabled soojin-local
```
## 실습 3: nginx로 네트워크에 공개하기
다른 서버가 이 저장소를 쓰려면 파일을 HTTP로 내려줄 웹 서버가 필요하다. 저장소 서버에 nginx를 설치하고, `/srv/repo` 디렉터리를 웹으로 공개한다.
### nginx 설치와 설정
```bash
sudo dnf install -y nginx
sudo vi /etc/nginx/default.d/repo.conf
```
```plain text
location /soojin/ {
    root /srv/repo;
    autoindex on;
}
```
이 설정의 뜻은 다음과 같다.
- `location /soojin/`: 주소가 `/soojin/`으로 시작하는 요청을 이 블록이 처리한다.
- `root /srv/repo`: 요청 주소를 `/srv/repo` 뒤에 붙여 파일을 찾는다. `http://서버/soojin/repodata/repomd.xml`을 요청하면 `/srv/repo/soojin/repodata/repomd.xml`을 내려준다.
- `autoindex on`: 브라우저로 접속했을 때 디렉터리 안의 파일 목록을 보여준다. dnf에는 필요 없지만 확인할 때 편하다.
Rocky Linux의 기본 nginx 설정은 `/etc/nginx/default.d/` 안의 `.conf` 파일을 기본 서버 블록에 포함시킨다. 그래서 파일 하나만 추가하면 된다.
### SELinux 설정
Rocky Linux에는 SELinux라는 보안 기능이 기본으로 켜져 있다. SELinux는 파일마다 "누가 읽어도 되는가"를 표시한 꼬리표(컨텍스트)를 붙여 두고, 꼬리표가 맞지 않으면 접근을 막는다. nginx는 웹 콘텐츠용 꼬리표(`httpd_sys_content_t`)가 붙은 파일만 읽을 수 있다. `/srv/repo`는 우리가 새로 만든 디렉터리라 이 꼬리표가 없으므로 붙여 줘야 한다.
```bash
sudo dnf install -y policycoreutils-python-utils     # semanage 명령
sudo semanage fcontext -a -t httpd_sys_content_t "/srv/repo(/.*)?"
sudo restorecon -Rv /srv/repo
```
`semanage`는 "이 경로 아래 파일에는 이 꼬리표를 붙인다"는 규칙을 등록하고, `restorecon`은 그 규칙대로 실제 파일에 꼬리표를 붙인다. 이 과정을 빼먹으면 파일이 분명히 있는데도 403 오류가 난다.
### nginx 실행과 방화벽 열기
```bash
sudo nginx -t                                   # 설정 문법 검사
sudo systemctl enable --now nginx               # 지금 실행하고, 재부팅 후에도 자동 실행
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --reload
```
`systemctl enable --now nginx`를 실행한 순간 nginx가 80번 포트에서 요청을 기다리기 시작한다. 방화벽(firewalld)은 기본적으로 외부에서 들어오는 80번 포트 접속을 막고 있으므로, http 서비스를 허용해야 다른 서버가 접속할 수 있다.
### 공개 확인
저장소 서버에서 먼저 확인한다.
```bash
curl http://localhost/soojin/repodata/repomd.xml
```
repomd.xml 내용이 출력되면 저장소가 네트워크에 공개된 것이다.
## 실습 4: 다른 서버에서 저장소 사용하기
클라이언트에서 할 일은 .repo 파일 하나를 만드는 것이 전부다. 저장소 쪽 준비가 끝났기 때문이다.
### 접속 확인
클라이언트(node1)에서 저장소 서버에 닿는지 먼저 확인한다.
```bash
curl http://192.168.0.10/soojin/repodata/repomd.xml
```
저장소 서버에서 실행했을 때와 같은 내용이 나오면 네트워크, 방화벽, nginx가 모두 정상이다. 여기서 막히면 .repo 파일을 만들어도 dnf가 똑같이 실패하므로, 이 단계에서 먼저 해결하는 것이 좋다.
### .repo 파일 만들기
```bash
sudo vi /etc/yum.repos.d/soojin.repo
```
```plain text
[soojin]
name=Soojin Repo
baseurl=http://192.168.0.10/soojin/
enabled=1
gpgcheck=0
```
### 저장소 확인과 패키지 설치
```bash
# 1. 저장소가 목록에 보이는지
dnf repolist

# 2. 이 저장소에 있는 패키지
dnf list --repo=soojin --available

# 3. 다른 저장소는 모두 끄고 이 저장소만으로 설치
sudo dnf install --disablerepo='*' --enablerepo=soojin jq
```
3번 명령은 공식 저장소를 모두 끄고 우리가 만든 저장소만 쓰도록 지정한다. 설치가 성공하면 jq와 의존성인 oniguruma가 모두 우리 저장소에서 왔다는 뜻이다. 설치 화면의 Repository 열에 `soojin`이 표시되는지 확인해 보자.
1편에서 본 "다운로드 URL은 baseurl과 패키지 위치를 합친 것"이라는 내용도 확인할 수 있다.
```bash
dnf repoquery --repo=soojin --location jq
# http://192.168.0.10/soojin/Packages/jq-1.6-...el9.x86_64.rpm
```
저장소 서버에서 nginx 접속 기록을 보면 클라이언트가 실제로 어떤 순서로 요청했는지도 보인다.
```bash
sudo tail /var/log/nginx/access.log
```
repomd.xml을 먼저 요청하고, 그다음 primary.xml, 마지막에 rpm 파일을 요청한 기록이 남는다. 2편에서 설명한 요청 순서가 그대로 나타난다.
## 패키지를 추가하거나 지웠을 때
rpm 파일을 넣거나 빼기만 해서는 dnf가 알아채지 못한다. dnf는 디렉터리를 직접 둘러보지 않고 메타데이터만 읽기 때문이다. 그래서 rpm을 바꿀 때마다 메타데이터를 다시 만들어야 한다.
### 저장소 서버에서
```bash
cd /srv/repo/soojin/Packages
sudo dnf download --resolve htop        # 새 패키지 추가 (EPEL이 켜져 있어야 함)
sudo createrepo_c --update /srv/repo/soojin
sudo restorecon -Rv /srv/repo            # 새 파일에도 SELinux 꼬리표 붙이기
```
- `-update`는 기존 메타데이터를 참고해서 바뀐 rpm만 새로 읽는 옵션이다. rpm이 수천 개인 저장소에서는 시간 차이가 크다. 새로 만들어진 메타데이터는 내용이 바뀌었으므로 파일 이름 앞의 해시도 바뀌고, repomd.xml에도 새 체크섬이 기록된다.
### 클라이언트에서
클라이언트는 캐시가 아직 유효하면 옛 목록을 그대로 쓴다. 2편에서 본 것처럼 기본 유효 기간은 48시간이다. 바로 반영하려면 새로 확인하라고 지시한다.
```bash
dnf --refresh list --repo=soojin --available
```
자주 갱신되는 사내 저장소라면 .repo 파일에 `metadata_expire=1h`처럼 짧은 유효 기간을 지정해 두는 방법도 있다.
## GPG 서명 검사 켜 두기
지금까지는 실습을 단순하게 하려고 `gpgcheck=0`으로 서명 검사를 껐다. 그런데 이 저장소에 넣은 rpm은 공식 저장소에서 받은 것이라, 원래의 서명이 그대로 남아 있다. 그래서 서명 검사를 켜도 문제없이 동작한다.
3편에서 본 것처럼 서명은 rpm 파일 안에 들어 있다. `dnf download`로 받아서 다른 디렉터리에 옮기고 `createrepo_c`로 목록을 새로 만들어도, rpm 파일 자체는 그대로이므로 서명도 바뀌지 않는다.
```bash
rpm -K /srv/repo/soojin/Packages/*.rpm
# jq-1.6-...rpm: digests signatures OK
```
클라이언트의 .repo 파일을 다음과 같이 고친다.
```plain text
[soojin]
name=Soojin Repo
baseurl=http://192.168.0.10/soojin/
enabled=1
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-9
       file:///etc/pki/rpm-gpg/RPM-GPG-KEY-EPEL-9
```
`gpgkey`에는 공개 키를 여러 개 적을 수 있다. 이 저장소에는 Rocky 공식 저장소의 패키지(tree, jq)와 EPEL의 패키지(htop)가 섞여 있으므로 두 키를 모두 적었다. EPEL 키 파일은 클라이언트에 `epel-release` 패키지가 설치되어 있어야 존재한다.
이렇게 해 두면 누군가 저장소 서버의 rpm을 바꿔치기해도, 개인 키가 없는 한 서명이 맞지 않아 설치가 거부된다.
직접 빌드한 rpm을 저장소에 넣는다면 이야기가 달라진다. 그 rpm에는 서명이 없으므로 직접 GPG 키를 만들어 서명해야 한다. 이 과정은 이 글의 범위를 넘어가므로 다루지 않는다.
## 자주 만나는 오류와 해결 방법
대부분의 오류는 클라이언트에서 `curl`로 repomd.xml을 직접 요청해 보면 원인이 드러난다. dnf의 오류 메시지보다 curl의 응답이 더 구체적이기 때문이다.
<table header-row="true">
<tr>
<td>증상</td>
<td>원인</td>
<td>해결</td>
</tr>
<tr>
<td>`Status code: 404`</td>
<td>요청한 경로에 파일이 없음. baseurl 오타, nginx `root` 경로 오류, `createrepo_c` 미실행</td>
<td>저장소 서버에서 `ls /srv/repo/soojin/repodata/`로 파일 확인, baseurl과 nginx 설정의 경로 대조</td>
</tr>
<tr>
<td>`Status code: 403`</td>
<td>파일은 있지만 nginx가 읽을 수 없음. 대부분 SELinux 꼬리표 누락</td>
<td>`sudo restorecon -Rv /srv/repo` 실행, `ls -Z`로 `httpd_sys_content_t` 확인</td>
</tr>
<tr>
<td>`Connection refused`</td>
<td>80번 포트에서 기다리는 프로그램이 없음</td>
<td>`systemctl status nginx`로 nginx 실행 여부 확인</td>
</tr>
<tr>
<td>`Connection timed out`</td>
<td>방화벽이 접속을 막음</td>
<td>`firewall-cmd --list-services`에 http가 있는지 확인</td>
</tr>
<tr>
<td>새로 넣은 패키지가 안 보임</td>
<td>메타데이터를 다시 만들지 않았거나, 클라이언트가 옛 캐시를 사용</td>
<td>서버에서 `createrepo_c --update`, 클라이언트에서 `dnf --refresh`</td>
</tr>
<tr>
<td>저장소 목록에 아예 안 보임</td>
<td>.repo 파일 확장자 오류 또는 `enabled=0`</td>
<td>파일 이름이 `.repo`로 끝나는지, `enabled=1`인지 확인</td>
</tr>
<tr>
<td>`GPG check FAILED`</td>
<td>서명 확인용 공개 키가 없거나 잘못 지정됨</td>
<td>`gpgkey` 경로의 파일이 실제로 있는지, rpm의 서명 키와 맞는지 확인</td>
</tr>
</table>
SELinux 때문에 막혔는지 확실하지 않다면 저장소 서버에서 `sudo ausearch -m avc -ts recent`를 실행해 보자. SELinux가 최근에 차단한 기록이 있으면 여기에 나온다.
## 정리
1. 저장소는 rpm 파일, 메타데이터, 웹 서버 세 가지로 이루어진다. .repo 파일은 그 위치를 가리키는 주소일 뿐이다.
2. `createrepo_c`는 rpm을 읽어 `repodata/`를 만들 뿐, 서버를 띄우지 않는다.
3. 웹 서버 없이 `file://` 주소로도 저장소는 동작한다. 저장소의 본질은 rpm과 메타데이터가 든 디렉터리다.
4. 다른 서버에 공개하려면 nginx 같은 웹 서버를 설치하고, Rocky Linux에서는 SELinux 꼬리표와 방화벽까지 챙겨야 한다.
5. rpm을 바꾸면 `createrepo_c --update`로 메타데이터를 다시 만들고, 클라이언트는 `-refresh`로 새 목록을 받는다.
6. 공식 저장소에서 받은 rpm은 원래 서명이 남아 있으므로 `gpgcheck=1`을 켜 둘 수 있다.
이번 글에서는 rpm 몇 개를 손으로 골라 저장소를 만들었다. 실무에서는 공식 저장소 전체를 통째로 복제해 두는 경우가 많다. 인터넷이 막힌 폐쇄망 서버들이 패키지를 설치할 수 있도록 사내에 미러를 두는 것이다.
<empty-block/>
