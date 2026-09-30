---
title: "IIS에 SSL 인증서 적용하고 DNS 변경 없이 HTTPS 접속 확인하기"
description: "Windows 서버에 PFX 인증서를 가져오고 IIS에 HTTPS 바인딩을 설정한 뒤, 로컬 hosts 파일로 DNS 변경 없이 접속을 확인하는 과정을 정리합니다."
pubDate: "2026-09-02"
category: "Network"
tags:
  - "HTTPS"
  - "TLS"
  - "Security"
  - "Network"
notionPageId: "3eb410cd-c737-80b0-bd72-cf3fa3445690"
---

<!-- notion-sync: generated -->

Windows 서버에 IIS가 이미 설치되어 있고, 인증서를 적용할 웹사이트가 준비되어 있다고 가정한다. 이 글에서는 IIS 관리자에서 PFX 인증서를 가져오고 웹사이트에 HTTPS 바인딩을 설정하는 과정부터 진행한다.
이후 내 로컬 PC의 hosts 파일을 수정하여 실제 DNS 레코드를 변경하지 않고 Windows 서버에 HTTPS로 접속해 본다.
작업은 다음 순서로 진행한다.
1. IIS 관리자 실행
2. 서버에 PFX 인증서 가져오기
3. 웹사이트에 HTTPS 바인딩 설정
4. 로컬 PC의 hosts 파일 수정
5. 로컬 브라우저에서 HTTPS 접속 확인
인증서 가져오기와 바인딩은 **Windows 서버에서**, hosts 수정과 최종 접속 확인은 **내 로컬 PC에서** 진행한다.
외부의 로컬 PC에서 HTTPS로 접속할 수 있도록 서버까지의 네트워크 경로가 준비되어 있어야 한다. 클라우드 보안그룹·ACG와 Windows 방화벽에서도 테스트 PC의 **TCP 443 접근**을 허용해야 한다.
본문에서는 실제 접속 정보를 대신해 아래 예시를 사용한다.
<table header-row="true">
<tr>
<td>항목</td>
<td>예시</td>
</tr>
<tr>
<td>접속할 도메인</td>
<td>`www.example.com`</td>
</tr>
<tr>
<td>Windows 서버의 공인 IP</td>
<td>`203.0.113.10`</td>
</tr>
<tr>
<td>Windows 서버에 복사한 인증서</td>
<td>`C:\cert.pfx`</td>
</tr>
<tr>
<td>인증서를 적용할 IIS 사이트</td>
<td>`Default Web Site`</td>
</tr>
</table>
위 IP와 도메인은 설명용이다. 실습할 때는 실제 서버 IP와 인증서가 유효한 도메인으로 바꿔야 한다.
## 1. IIS 관리자 실행하기
Windows 서버의 시작 메뉴에서 **서버 관리자**를 실행한다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-001.png)
<empty-block/>
서버 관리자 오른쪽 위에서 **도구 → IIS(인터넷 정보 서비스) 관리자**를 선택한다.
![](file://%7B%22source%22%3A%22attachment%3Ab2a472ab-d921-4e28-a71a-43aa2c215b9e%3A4._%EC%9A%B0%EC%83%81%EB%8B%A8%EC%9D%98_%EB%8F%84%EA%B5%AC_%ED%81%B4%EB%A6%AD%ED%95%98%EA%B3%A0_IIS(%EC%9D%B8%ED%84%B0%EB%84%B7_%EC%A0%95%EB%B3%B4_%EC%84%9C%EB%B9%84%EC%8A%A4)_%EA%B4%80%EB%A6%AC%EC%9E%90_%ED%81%B4%EB%A6%AD.png%22%2C%22permissionRecord%22%3A%7B%22table%22%3A%22block%22%2C%22id%22%3A%223eb410cd-c737-80a0-9828-c9c745b4fd66%22%2C%22spaceId%22%3A%226d7410cd-c737-8160-a3dc-0003544840ca%22%7D%7D)
**우상단의 도구 클릭하고 IIS(인터넷 정보 서비스) 관리자 클릭**
이후 인증서 가져오기와 웹사이트 바인딩 설정은 IIS 관리자에서 진행한다.
## 2. PFX 인증서 가져오기
미리 준비한 PFX 파일을 Windows 서버에 복사한다. 이번 실습에서는 `C:\cert.pfx`에 두었다.
HTTPS 서버용으로 가져올 PFX에는 **서버 인증서와 그에 대응하는 개인 키**가 포함되어 있어야 한다.
IIS 관리자 왼쪽 **연결** 영역에서 서버 이름을 선택하고, 가운데 화면의 **서버 인증서**를 연다.
이때 선택하는 대상은 `Default Web Site`가 아니라 그 위에 있는 서버 이름이다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-002.png)
<empty-block/>
서버 인증서 화면의 **오른쪽 작업 영역에서 가져오기…**를 클릭한다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-003.png)
<empty-block/>
인증서 가져오기 창에서 다음 값을 입력한다.
<table header-row="true">
<tr>
<td>항목</td>
<td>설정</td>
</tr>
<tr>
<td>인증서 파일(.pfx)</td>
<td>서버에 복사한 `C:\cert.pfx` 선택</td>
</tr>
<tr>
<td>암호</td>
<td>PFX 생성 시 설정한 비밀번호 입력. 설정하지 않았다면 빈칸</td>
</tr>
<tr>
<td>인증서 저장소 선택</td>
<td>`개인`</td>
</tr>
<tr>
<td>이 인증서를 내보내도록 허용</td>
<td>추후 개인 키를 포함해 내보낼 필요에 따라 선택</td>
</tr>
</table>
사진에서는 **이 인증서를 내보내도록 허용**이 체크되어 있다. 이 옵션은 추후 인증서를 개인 키와 함께 내보낼 수 있도록 하는 설정이며, HTTPS 접속에 반드시 필요한 옵션은 아니다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-004.png)
<empty-block/>
**확인**을 누른 뒤 서버 인증서 목록에 가져온 인증서가 나타나는지 확인한다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-005.png)
<empty-block/>
여기까지는 Windows 서버에 인증서를 등록한 단계다. 이어서 웹사이트의 HTTPS 바인딩에서 이 인증서를 선택한다.
## 3. 웹사이트에 HTTPS 바인딩 설정하기
바인딩은 **어떤 IP·포트·호스트 이름으로 들어오는 요청을 해당 웹사이트에서 처리할지 지정하는 설정**이다. HTTPS 바인딩에서는 사용할 인증서도 함께 연결한다.
IIS 관리자 왼쪽에서 **사이트 → Default Web Site**를 선택하고, 오른쪽의 **바인딩…**을 클릭한다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-006.png)
<empty-block/>
사이트 바인딩 창에서 **추가…**를 클릭한다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-007.png)
다음과 같이 설정한다.
<table header-row="true">
<tr>
<td>항목</td>
<td>설정값</td>
<td>의미</td>
</tr>
<tr>
<td>종류</td>
<td>`https`</td>
<td>HTTPS 연결 사용</td>
</tr>
<tr>
<td>IP 주소</td>
<td>`지정하지 않은 모든 IP`</td>
<td>특정 서버 IP 하나로 바인딩을 제한하지 않음</td>
</tr>
<tr>
<td>포트</td>
<td>`443`</td>
<td>HTTPS 기본 포트</td>
</tr>
<tr>
<td>호스트 이름</td>
<td>`www.example.com`</td>
<td>브라우저에서 접속할 도메인</td>
</tr>
<tr>
<td>서버 이름 표시 필요</td>
<td>체크</td>
<td>SNI 사용</td>
</tr>
<tr>
<td>SSL 인증서</td>
<td>앞에서 가져온 인증서</td>
<td>이 HTTPS 연결에 사용할 인증서</td>
</tr>
</table>
호스트 이름에는 `https://`나 경로를 붙이지 않고 **도메인만 입력**한다. 해당 도메인은 인증서의 유효 범위에 포함되어 있어야 한다.
### ‘지정하지 않은 모든 IP’의 의미
특정 IP를 지정하면 해당 서버 IP로 들어오는 연결에 바인딩을 적용한다. `지정하지 않은 모든 IP`를 선택하면 특정 서버 IP 하나로 제한하지 않는다.
이 설정이 공인 IP를 새로 할당하거나 방화벽을 개방하는 것은 아니다. 외부 접근에 필요한 네트워크 설정은 별도로 갖춰져 있어야 한다.
### ‘서버 이름 표시 필요’의 의미
이 옵션은 **SNI(Server Name Indication)**를 사용한다는 뜻이다.
브라우저는 TLS 연결을 시작할 때 접속하려는 도메인을 전달하고, 서버는 이를 바탕으로 알맞은 인증서를 선택할 수 있다. 덕분에 같은 IP와 443 포트에서도 여러 도메인의 HTTPS 사이트를 운영할 수 있다.
SNI는 HTTP 요청 헤더가 아니라 **TLS 연결 과정에서 전달되는 정보**다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-008.png)
<empty-block/>
설정을 마쳤으면 **확인**을 누른다. 사이트 바인딩 목록에서 `https`, `443`, 입력한 호스트 이름이 표시되는지 확인한다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-009.png)
<empty-block/>
이미 같은 HTTPS 바인딩이 있다면 해당 항목을 선택하고 **편집…**에서 설정을 확인한다. 인증서가 제대로 연결되었는지는 바인딩 편집 창을 다시 열어 **SSL 인증서 선택값**까지 확인하면 된다.
## 4. 로컬 PC의 hosts 파일 수정하기
이제 **서버에서 나와, HTTPS 접속을 테스트할 내 로컬 PC에서** 작업한다.
실제 DNS가 아직 다른 서버를 가리키거나 DNS 레코드를 변경하기 어려운 상황이라면, hosts 파일에 도메인과 테스트 서버 IP를 등록할 수 있다.
이렇게 하면 내 PC에서 해당 도메인을 테스트 서버 IP로 해석할 수 있다. 공용 DNS 레코드와 다른 사용자의 접속 대상은 바뀌지 않는다.
로컬 Windows PC에서 **명령 프롬프트를 관리자 권한으로 실행**한 뒤 다음 명령을 입력한다.
```powershell
notepad C:\Windows\System32\drivers\etc\hosts
```
메모장이 열리면 기존 내용 아래에 다음 형식으로 추가한다.
```plain text
203.0.113.10    www.example.com
```
앞에는 **Windows 서버의 실제 공인 IP**, 뒤에는 **IIS 바인딩에 입력한 도메인**을 넣는다. 두 값은 공백이나 탭으로 구분한다.
도메인 앞에 `https://`를 붙이거나 뒤에 `:443`을 붙이지 않는다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-010.png)
파일을 저장한다. 새 파일로 저장하는 경우에는 `hosts.txt`가 되지 않도록 주의한다.
필요하면 다음 명령으로 Windows의 이름 해석 캐시를 비운다.
```powershell
ipconfig /flushdns
```
이후 브라우저를 완전히 종료했다가 다시 실행한다.
로컬 PC의 hosts에 `127.0.0.1`을 넣으면 원격 Windows 서버가 아니라 **내 PC 자신**을 가리키므로, 이번 실습에서는 원격 서버에 도달할 수 있는 실제 IP를 사용해야 한다.
## 5. 로컬 브라우저에서 HTTPS 접속 확인하기
로컬 PC의 브라우저에서 **`https://www.example.com`**에 접속한다. 실제 실습에서는 준비한 도메인으로 바꿔 입력한다.
hosts에 등록한 IP로 연결하더라도 주소창에는 도메인이 유지된다. 브라우저는 이 도메인을 기준으로 인증서가 올바른지 검증한다.
접속이 정상적으로 이루어지면 IIS 기본 환영 페이지가 표시된다.
![](/notion-assets/iis-pfx-https-binding-hosts-test/image-011.png)
<empty-block/>
페이지가 보이는 것과 함께 다음 항목을 확인한다.
- 주소창의 접속 방식이 **HTTPS**인지
- 인증서 경고 없이 접속되는지
- 브라우저의 연결 정보에서 의도한 인증서가 표시되는지
- 인증서의 유효기간과 대상 도메인이 올바른지
브라우저 개발자 도구의 **Network** 탭에서 요청을 선택하면, 환경에 따라 `Remote Address` 항목에서 실제 연결한 서버 IP와 포트도 확인할 수 있다.
첨부할 마지막 사진은 로컬 브라우저에서 도메인으로 IIS 페이지를 연 화면이다. 인증서 상세 정보까지 기록하려면 브라우저의 인증서 보기 화면을 추가로 캡처하면 된다.
## 참고 자료
- [Microsoft Learn — IIS SSL 설정](https://learn.microsoft.com/en-us/iis/manage/configuring-security/how-to-set-up-ssl-on-iis)
- [Microsoft Learn — IIS의 SNI](https://learn.microsoft.com/en-us/iis/get-started/whats-new-in-iis-8/iis-80-server-name-indication-sni-ssl-scalability)
- [Microsoft Learn — Windows hosts 파일](https://learn.microsoft.com/en-us/windows/powertoys/hosts-file-editor)
- [RFC 9525 — TLS 서비스 신원 검증](https://www.rfc-editor.org/rfc/rfc9525.html)
