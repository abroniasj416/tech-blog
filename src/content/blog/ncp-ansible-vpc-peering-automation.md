---
title: "[Cloud] 여러 서버에 동일한 작업을 똑똑하게 하려면 - VPC Peering과 Ansible로 보안 조치 자동화하기"
description: "고객사 자산에 추가 구성을 최소화하면서 20대가 넘는 서버에 보안 조치를 일괄 적용한 경험을 정리합니다. 회사 계정의 제어 서버와 고객사 VPC를 Peering으로 연결하고, Ansible로 사설 통신을 통한 반복 작업을 자동화한 구성과 실행 예제를 소개합니다."
pubDate: "2026-07-30"
category: "Cloud"
tags:
  - "NCP"
  - "Ansible"
  - "VPC Peering"
  - "Automation"
  - "Security"
notionPageId: "3e9410cd-c737-80bd-8780-c11dc94577b3"
---

<!-- notion-sync: generated -->

# 고객사 서버에 하나씩 접속하지 않으려면 — VPC Peering과 Ansible로 보안 조치 자동화하기
20대가 넘는 고객사 서버에 동일한 보안 조치를 적용해야 했다. 서버 한 대에 접속해 설정을 바꾸는 것 자체는 어렵지 않다. 하지만 같은 작업을 20번 넘게 반복하면 시간이 걸리고, 어느 서버까지 처리했는지 확인하는 일도 함께 늘어난다. 일부 서버에만 설정을 빠뜨릴 가능성도 있다.
그래서 Ansible을 활용하기로 했다. 그런데 명령을 자동으로 실행하는 것보다 먼저 고민한 부분이 있었다.
**고객사 자산에 자동화를 위한 구성을 최대한 추가하지 않고, 우리 회사 쪽에서 처리할 수는 없을까?**
고객사 VPC 안에 Ansible 제어 서버를 한 대 만들거나, 기존 서버 한 대에 Ansible을 설치해 제어 서버로 사용하는 방법이 떠올랐다. 같은 VPC 안에서 사설 IP로 접근할 수 있으니 통신 구조도 단순하다.
하지만 이를 위해 고객사 계정에 서버를 추가하거나 운영 중인 서버에 자동화 도구를 설치하고 싶지는 않았다. 이미 회사 계정에 VPC가 있으니, 그곳에 제어 서버를 두고 고객사 서버까지 접근할 수 있는 경로를 만들기로 했다.
이렇게 회사 VPC와 고객사 VPC를 Peering으로 연결하고, 확보한 사설 통신 경로를 통해 Ansible로 보안 조치를 일괄 적용했다.
이 글에서는 그 구성 방식과 실행 흐름을 정리한다. 아래 IP, 서버명, 계정명, OS·버전 조합과 Playbook은 설명을 위한 예시이다. 실제 고객사 정보와 당시 사용한 보안 조치 코드를 그대로 공개한 것은 아니다.
## Ansible은 어디에 설치해야 할까?
먼저 구분할 부분이 있다. **Ansible은 관리 대상 서버마다 설치할 필요가 없다.**
Ansible 명령을 실행하는 서버를 제어 노드(Control Node), 설정을 적용받는 서버를 관리 대상 노드(Managed Node)라고 한다. 일반적인 Linux 서버 관리에서는 제어 노드가 SSH로 대상 서버에 접속해 필요한 작업을 수행한다.
따라서 이번 구성에서 Ansible이 설치되는 곳은 회사 계정의 제어 서버이다. 고객사 서버에는 상주하는 Ansible 에이전트를 추가하지 않는다.
물론 아무 준비 없이 관리할 수 있다는 의미는 아니다. 대상 서버에는 SSH 접속 수단, 작업에 필요한 권한, 사용할 Ansible 버전과 호환되는 Python이 있어야 한다. 기존 관리 계정과 실행 환경이 이 조건을 충족한다면 이를 활용할 수 있다. 일반적인 모듈 실행 과정에서 대상 서버에 임시 파일이 생성될 수도 있다.
고객사 측에서도 Peering 수락과 라우팅·접근 제어 설정은 필요하다. 목표는 **자동화를 위한 서버와 도구는 회사 쪽에 두고, 고객사 측 추가 구성을 필요한 범위로 줄이는 것**이었다.
참고: [Ansible 구성 요소](https://docs.ansible.com/projects/ansible/latest/getting_started/index.html), [설치 및 대상 서버 요구사항](https://docs.ansible.com/projects/ansible/latest/installation_guide/intro_installation.html)
## 회사 VPC에서 고객사 Private Subnet까지 연결하기
예시 환경은 다음과 같다. 두 VPC는 NCP의 동일 리전에 있고, 주소 대역이 겹치지 않는다고 가정한다.
<table header-row="true">
<tr>
<td>구분</td>
<td>회사 계정</td>
<td>고객사 계정</td>
</tr>
<tr>
<td>VPC</td>
<td>`10.10.0.0/16`</td>
<td>`10.20.0.0/16`</td>
</tr>
<tr>
<td>작업 대상 Subnet</td>
<td>`10.10.1.0/24`</td>
<td>`10.20.1.0/24`</td>
</tr>
<tr>
<td>서버</td>
<td>Ansible 제어 서버</td>
<td>보안 조치를 적용할 Linux 서버</td>
</tr>
<tr>
<td>사설 IP 예시</td>
<td>`10.10.1.10`</td>
<td>`10.20.1.11`, `10.20.1.12` 등</td>
</tr>
</table>
제어 서버가 고객사 서버의 사설 IP로 SSH 연결을 만들고, 그 연결을 통해 작업 명령과 실행 결과를 주고받는 구조이다. 고객사 서버에 Ansible 작업용 공인 IP를 붙일 필요는 없다.
여기서 NCP의 Peering 동작을 확인해야 한다. NCP 공식 가이드는 Peering을 단방향으로 설명하며, **TCP처럼 양방향 통신이 필요하면 요청 VPC와 수락 VPC를 바꾼 Peering 두 개를 구성하도록 안내한다.** SSH도 TCP를 사용하므로 요청과 응답 경로를 함께 구성한다.
예시에서는 다음 두 연결을 사용한다.
<table header-row="true">
<tr>
<td>Peering 이름</td>
<td>요청 VPC</td>
<td>수락 VPC</td>
</tr>
<tr>
<td>`peer-company-customer`</td>
<td>회사 VPC</td>
<td>고객사 VPC</td>
</tr>
<tr>
<td>`peer-customer-company`</td>
<td>고객사 VPC</td>
<td>회사 VPC</td>
</tr>
</table>
콘솔의 `VPC > VPC Peering`에서 연결을 생성한다. 상대 VPC가 다른 계정에 있으므로 수락 VPC에 `다른계정`을 선택하고 상대 계정과 VPC 정보를 입력한다. 이후 상대 계정에서 요청을 수락한다. 반대 방향도 같은 방식으로 구성한다.
참고: [NCP VPC Peering](https://guide.ncloud-docs.com/docs/networking-vpc-vpcdetailedpeering)
Peering 생성 후에는 각 서버가 속한 Subnet에 실제로 적용되는 Route Table에 경로를 추가한다. 이 예시에서는 작업에 필요한 상대 Subnet 대역만 목적지로 지정한다.
<table header-row="true">
<tr>
<td>적용할 Route Table</td>
<td>목적지</td>
<td>Target 유형</td>
<td>Target 이름</td>
</tr>
<tr>
<td>회사 제어 서버 Subnet의 Route Table</td>
<td>`10.20.1.0/24`</td>
<td>`VPCPEERING`</td>
<td>`peer-company-customer`</td>
</tr>
<tr>
<td>고객사 대상 서버 Subnet의 Route Table</td>
<td>`10.10.1.0/24`</td>
<td>`VPCPEERING`</td>
<td>`peer-customer-company`</td>
</tr>
</table>
고객사 서버가 여러 Subnet에 나뉘어 있다면 대상 대역과 각 Subnet의 Route Table도 함께 확인한다. 경로를 올바르게 추가했더라도 다른 Subnet에 적용되는 테이블을 수정했다면 해당 서버의 통신은 달라지지 않는다.
이 경로는 NCP의 VPC Route Table에서 설정한다. 제어 서버의 Linux에 `ip route add`만 실행해서 Peering 구성을 대신할 수는 없다.
참고: [NCP Route Table](https://guide.ncloud-docs.com/docs/networking-vpc-vpcdetailedroutetable)
## 사설 경로와 SSH 허용은 별도로 확인한다
경로가 있어도 접근 제어에서 막히면 SSH로 접속할 수 없다. SSH 포트가 TCP 22라고 가정하면, ACG는 다음 흐름을 허용해야 한다.
<table header-row="true">
<tr>
<td>위치</td>
<td>방향</td>
<td>상대 IP</td>
<td>목적지 포트</td>
</tr>
<tr>
<td>회사 제어 서버 ACG</td>
<td>Outbound</td>
<td>고객사 대상 서버 IP 또는 필요한 Subnet 대역</td>
<td>TCP 22</td>
</tr>
<tr>
<td>고객사 대상 서버 ACG</td>
<td>Inbound</td>
<td>제어 서버 `10.10.1.10/32`</td>
<td>TCP 22</td>
</tr>
</table>
기존 규칙에서 이미 허용한 경우에는 중복 규칙을 추가할 필요가 없다. 고객사 서버의 SSH 접근 소스는 제어 서버 한 대의 사설 IP로 제한할 수 있다.
ACG는 연결 상태를 추적하지만 Network ACL은 그렇지 않다. 제한적인 Network ACL을 사용한다면 SSH 요청뿐 아니라 응답도 허용해야 한다. 응답 패킷은 제어 서버가 연결할 때 사용한 임시 포트로 돌아온다.
<table header-row="true">
<tr>
<td>Network ACL 위치</td>
<td>방향</td>
<td>상대 주소</td>
<td>허용할 TCP 목적지 포트</td>
</tr>
<tr>
<td>회사 Subnet</td>
<td>Outbound</td>
<td>고객사 대상 서버</td>
<td>22</td>
</tr>
<tr>
<td>고객사 Subnet</td>
<td>Inbound</td>
<td>회사 제어 서버</td>
<td>22</td>
</tr>
<tr>
<td>고객사 Subnet</td>
<td>Outbound</td>
<td>회사 제어 서버</td>
<td>제어 서버의 임시 포트 범위</td>
</tr>
<tr>
<td>회사 Subnet</td>
<td>Inbound</td>
<td>고객사 대상 서버</td>
<td>제어 서버의 임시 포트 범위</td>
</tr>
</table>
임시 포트 범위는 회사 제어 서버에서 확인할 수 있다.
```bash
cat /proc/sys/net/ipv4/ip_local_port_range
```
이와 함께 고객사 서버의 OS 방화벽과 SSH 서비스 설정도 확인한다. Peering은 네트워크 경로를 제공하고, ACG·Network ACL·OS 방화벽은 그 경로의 통신을 허용할지 결정한다.
참고: [NCP Network ACL과 ACG 비교](https://guide.ncloud-docs.com/docs/vpc-nacl-vpc)
## 회사 제어 서버에 Ansible 실행 환경 준비하기
여기부터 나오는 터미널 명령은 별도 언급이 없으면 모두 **회사 계정의 제어 서버**에서 실행한다. 명령을 입력하는 위치는 제어 서버이지만, Playbook의 작업 대상은 고객사 서버이다.
설치 예시는 Rocky Linux 9 계열의 제어 서버에 Python 3.12와 `ansible-core` 2.20 계열을 사용하는 구성이다. 대상 서버는 Python 3.9\~3.14 중 지원되는 버전이 이미 준비되어 있다고 가정한다. 이는 예시 조합이며 당시 실제 사용 버전을 의미하지 않는다.
특히 Rocky Linux 8처럼 기본 Python이 오래된 환경은 OS 이름만 보고 호환된다고 판단하면 안 된다. 대상 서버의 Python 버전을 먼저 확인하고, Ansible 지원표에 맞춰 실행 환경을 선택해야 한다. 조건이 맞지 않으면 별도 Python 준비 등의 변경이 필요할 수 있다.
```bash
sudo dnf install -y python3.12 python3.12-pip openssh-clients

umask 077
mkdir -p ~/ansible-security
cd ~/ansible-security

python3.12 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install 'ansible-core>=2.20,<2.21'

ansible --version
python -m pip freeze > requirements-lock.txt
```
가상 환경은 제어 서버의 기본 Python 패키지와 Ansible 실행 환경을 분리하기 위해 사용한다. `requirements-lock.txt`에는 실제 설치된 버전을 남긴다. 새 터미널에서는 작업 폴더로 이동한 뒤 `source .venv/bin/activate`를 다시 실행한다.
패키지 설치에는 회사 제어 서버에서 저장소에 접근할 경로가 필요하다. Private Subnet에 있다면 회사의 NAT·프록시·내부 저장소 구성을 활용한다. 이 설치 경로와 고객사로 향하는 Peering 경로는 용도가 다르다.
참고: [Ansible 버전별 Python 지원 범위](https://docs.ansible.com/projects/ansible/latest/reference_appendices/release_and_maintenance.html#ansible-core-support-matrix), [Rocky Linux 9 공식 패키지 저장소](https://dl.rockylinux.org/pub/rocky/9/AppStream/x86_64/os/Packages/p/)
### SSH로 실제 대상 서버 확인하기
예시에서는 고객사에 이미 존재하는 관리 계정 `opsadmin`과 사용 권한이 있는 개인키를 이용한다. 실제 계정명과 키 경로로 바꿔 사용한다.
```bash
chmod 600 ~/.ssh/customer_ops_key

ssh -i ~/.ssh/customer_ops_key opsadmin@10.20.1.11
```
첫 접속 시 표시되는 호스트 키 지문은 고객사 서버 콘솔 등 신뢰할 수 있는 경로로 확인한 값과 비교한다. 정상적인 서버임을 확인한 후 등록하며, 나머지 대상 서버도 같은 방식으로 신뢰할 수 있는 호스트 키를 준비한다. 자동화 때문에 호스트 키 검증을 끄지는 않는다.
접속한 고객사 서버에서 다음을 확인한 뒤 제어 서버로 돌아온다.
```bash
python3 --version
command -v python3
sudo -l
exit
```
이 단계에서 사설 IP로 SSH 접속이 되는지, Python 경로가 무엇인지, 보안 조치에 필요한 `sudo` 권한이 있는지 확인한다. 계정이나 키가 준비되지 않았다면 별도 권한 설정이 필요하며, Peering만으로 로그인 권한까지 생기는 것은 아니다.
## 대상 서버 목록과 보안 조치를 코드로 작성하기
제어 서버의 `~/ansible-security`에 다음 세 파일을 만든다.
<table header-row="true">
<tr>
<td>파일</td>
<td>역할</td>
</tr>
<tr>
<td>`ansible.cfg`</td>
<td>Ansible 실행 설정</td>
</tr>
<tr>
<td>`inventory.ini`</td>
<td>접속할 서버와 계정 정보</td>
</tr>
<tr>
<td>`security.yml`</td>
<td>적용할 작업을 정의한 Playbook</td>
</tr>
</table>
`ansible.cfg`는 다음과 같이 작성한다.
```plain text
[defaults]
inventory = ./inventory.ini
host_key_checking = True
forks = 5
timeout = 15
```
`forks`는 병렬 작업 프로세스 수를 제한한다. 아래 Playbook의 `serial`과 함께 적용 범위를 조절하는 데 사용한다.
`inventory.ini`에는 고객사 서버의 사설 IP를 등록한다. 예시에는 두 대만 적었으며, 실제로는 승인된 작업 대상 전체를 등록한다.
```plain text
[customer_linux]
customer-svr01 ansible_host=10.20.1.11
customer-svr02 ansible_host=10.20.1.12

[customer_linux:vars]
ansible_connection=ssh
ansible_user=opsadmin
ansible_port=22
ansible_ssh_private_key_file=~/.ssh/customer_ops_key
ansible_python_interpreter=/usr/bin/python3
```
`customer-svr01`은 Ansible에서 사용할 별칭이다. 실제 SSH 접속 주소는 `ansible_host`이다. Python 경로, 계정, SSH 포트가 서버마다 다르면 각 호스트 또는 그룹에 맞춰 분리한다. 비밀번호나 개인키 본문은 이 파일에 넣지 않는다.
이제 대상 목록과 기본 연결을 확인한다.
```bash
ansible-inventory --graph
ansible customer_linux -m ansible.builtin.ping
```
정상적으로 통신하고 대상 서버에서 Python 모듈을 실행할 수 있으면 `pong`이 반환된다. 여기서 `ping`은 ICMP 요청이 아니라 **SSH 연결과 Python 실행을 확인하는 Ansible 모듈**이다.
참고: [Ansible ping 모듈](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/ping_module.html)
### 보안 조치 Playbook 예시
실제 작업에서는 고객사와 합의한 점검 항목을 Playbook으로 작성한다. 아래는 구조를 보여주기 위해 세 파일의 소유자와 권한을 관리하는 예제이다. 당시 적용한 조치 목록이나 모든 Linux에 공통 적용할 보안 기준을 뜻하지 않는다.
<table header-row="true">
<tr>
<td>대상 파일</td>
<td>소유자·그룹</td>
<td>예시 권한</td>
</tr>
<tr>
<td>`/etc/passwd`</td>
<td>`root:root`</td>
<td>`0644`</td>
</tr>
<tr>
<td>`/etc/group`</td>
<td>`root:root`</td>
<td>`0644`</td>
</tr>
<tr>
<td>`/etc/ssh/sshd_config`</td>
<td>`root:root`</td>
<td>`0600`</td>
</tr>
</table>
환경에서 요구하는 기준과 기존 예외를 확인한 뒤, `security.yml`을 작성한다.
```yaml
---
- name: Apply approved file permissions
  hosts: customer_linux
  become: true
  gather_facts: false
  serial: 5
  any_errors_fatal: true

  vars:
    security_files:
      - path: /etc/passwd
        mode: '0644'
      - path: /etc/group
        mode: '0644'
      - path: /etc/ssh/sshd_config
        mode: '0600'

  pre_tasks:
    - name: Read current ownership and permissions
      ansible.builtin.command:
        argv:
          - stat
          - -c
          - '%n uid=%u gid=%g mode=%a'
          - /etc/passwd
          - /etc/group
          - /etc/ssh/sshd_config
      register: before_permissions
      changed_when: false
      check_mode: false

    - name: Show current ownership and permissions
      ansible.builtin.debug:
        var: before_permissions.stdout_lines

  tasks:
    - name: Set approved ownership and permissions
      ansible.builtin.file:
        path: '{{ item.path }}'
        state: file
        owner: root
        group: root
        mode: '{{ item.mode }}'
      loop: '{{ security_files }}'
      loop_control:
        label: '{{ item.path }}'
```
먼저 `stat`으로 변경 전 소유자와 권한을 출력한다. `changed_when: false`는 이 조회 작업을 변경으로 집계하지 않도록 한다. `check_mode: false`는 이 읽기 작업을 점검 모드에서도 실제 수행하도록 한 설정이다.
이후 `file` 모듈이 각 파일을 지정한 상태로 맞춘다. 이미 일치하면 그대로 두고, 다를 때만 변경한다. `state: file`이므로 대상 파일이 없다면 새로 만들어 진행하지 않고 실패한다. 이 예제는 파일 내용이나 SSH 인증 설정을 변경하지 않는다.
`serial: 5`는 최대 다섯 대씩 묶어서 진행하도록 한다. `any_errors_fatal: true`는 처리되지 않은 오류가 발생하면 현재 배치의 해당 작업을 마친 후 나머지 진행을 중단하도록 한다. 이미 적용한 변경을 자동으로 원복해 주는 기능은 아니다.
참고: [Ansible file 모듈](https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/file_module.html), [배치 실행](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_strategies.html#setting-the-batch-size-with-serial), [오류 발생 시 중단](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_error_handling.html#aborting-on-the-first-error-any-errors-fatal)
## 한 대에서 확인한 뒤 적용 범위 넓히기
Playbook을 작성했다고 바로 전체 서버에 적용하지는 않는다. 먼저 실행할 대상과 문법을 확인한다.
```bash
ansible-playbook security.yml --list-hosts
ansible-playbook security.yml --syntax-check
```
그다음 대표 서버 한 대에서 변경 예상 내용을 확인한다. 예시는 `sudo` 비밀번호를 입력하는 환경을 기준으로 한다.
```bash
ansible-playbook security.yml \
  --limit customer-svr01 \
  --check --diff \
  --ask-become-pass
```
- `-check`는 지원되는 작업의 변경을 예측하고, `-diff`는 지원되는 변경 내역을 보여준다. 실제 적용 성공이나 서비스 영향까지 보장하는 것은 아니다. 위 Playbook에서는 조회용 `stat`만 실제 실행하고, 권한 변경은 예상 결과를 확인한다.
검토 후 같은 서버 한 대에 실제 적용한다. 변경 전 정보와 결과를 남기기 위해 실행별 로그 파일도 지정한다.
```bash
umask 077
export ANSIBLE_LOG_PATH="$PWD/pilot-$(date +%Y%m%d-%H%M%S).log"

ansible-playbook security.yml \
  --limit customer-svr01 \
  --diff \
  --ask-become-pass
```
적용 후에는 파일 권한과 관련 서비스 동작을 확인하고 나머지 서버로 범위를 넓힌다. 최종 대상 목록을 검토한 뒤 전체 그룹을 실행하면 Playbook의 `serial: 5`에 따라 순차 배치로 처리된다.
```bash
export ANSIBLE_LOG_PATH="$PWD/apply-$(date +%Y%m%d-%H%M%S).log"

ansible-playbook security.yml --ask-become-pass
```
이미 허용된 비밀번호 없는 `sudo`를 사용하는 환경이라면 `--ask-become-pass`를 생략할 수 있다. 서버마다 `sudo` 비밀번호가 다르면 한 번 입력한 값으로 모두 처리할 수 없으므로 인증 조건별로 실행을 나누거나 Ansible Vault 등으로 호스트별 정보를 관리한다.
변경 후 권한은 다음처럼 전체 대상에서 조회할 수 있다.
```bash
ansible customer_linux \
  -m ansible.builtin.command \
  -a 'stat -c "%n uid=%u gid=%g mode=%a" /etc/passwd /etc/group /etc/ssh/sshd_config' \
  --become --ask-become-pass
```
실행 마지막의 `PLAY RECAP`에서는 서버별 결과를 확인한다.
<table header-row="true">
<tr>
<td>항목</td>
<td>확인할 내용</td>
</tr>
<tr>
<td>`ok`</td>
<td>성공적으로 처리한 작업 수. 변경된 작업도 포함한다.</td>
</tr>
<tr>
<td>`changed`</td>
<td>실제 상태를 변경한 작업 수. 점검 모드에서는 예상 변경 수이다.</td>
</tr>
<tr>
<td>`unreachable`</td>
<td>연결할 수 없었던 대상이 있는지 확인한다.</td>
</tr>
<tr>
<td>`failed`</td>
<td>실행 중 실패한 작업이 있는지 확인한다.</td>
</tr>
</table>
이 예제처럼 현재 상태를 비교하는 모듈을 사용하면 같은 Playbook을 다시 실행했을 때 불필요한 변경을 줄일 수 있다. 다만 `changed=0`은 Playbook에 작성한 항목이 이미 목표 상태라는 의미이며, 서버 전체의 보안 점검이 끝났다는 뜻은 아니다.
연결 실패나 작업 실패가 있었다면 원인을 해결하고 해당 서버만 다시 지정해 실행할 수 있다. 권한 복구가 필요한 경우에는 로그에 남긴 변경 전 UID·GID·mode를 기준으로 되돌린다. 파일 내용까지 바꾸는 작업이라면 별도의 백업과 복구 절차도 함께 작성해야 한다.
참고: [Ansible Check Mode와 Diff Mode](https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_checkmode.html)
## 반복 작업을 줄이기 위해 먼저 만든 것은 통신 경로였다
이번 작업에서는 회사 계정의 제어 서버에서 고객사 서버의 사설 IP로 접근할 수 있도록 네트워크를 구성하고, 그 위에서 동일한 보안 조치를 일괄 실행했다. 이를 통해 서버마다 반복해서 접속하는 작업을 줄이고 설정을 일관되게 적용했다.
고객사 환경 안에 제어 서버를 두는 구성도 충분히 합리적이다. 다만 이번에는 자동화 도구를 어디에서 운영할지까지 함께 고민했고, 회사 쪽에서 실행 환경을 관리하는 방식을 선택했다.
이 구조에서는 제어 서버의 접근 권한과 인증 정보 관리도 중요해진다. 지속해서 사용할 관리 경로라면 접근 범위를 관리하고, 일회성 작업이라면 작업 후 임시 권한과 연결을 정리할 기준도 정해 두어야 한다.
Ansible로 명령을 반복 실행하는 방법만큼 중요한 것은, **제어 서버가 어디에서 어떤 권한으로 대상 서버에 도달할지 설계하는 일**이었다. Private Subnet이라는 제약을 네트워크 구성으로 해결했기 때문에 자동화도 적용할 수 있었다.
