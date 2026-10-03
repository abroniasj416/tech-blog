---
title: "[Cloud] UDP 서비스가 죽어도 Load Balancer 헬스체크는 정상? NCP LB 트러블슈팅 과정"
description: "NCP Load Balancer의 TCP 헬스체크 한계를 보완하기 위해 UDP 포트 상태를 수집하고, Cloud Insight와 Cloud Functions로 타겟 제외·복구를 자동화하는 구조를 정리합니다."
pubDate: "2026-09-16"
category: "Cloud"
tags:
  - "NCP"
  - "UDP"
  - "Load Balancer"
  - "Cloud Insight"
  - "Cloud Functions"
  - "Automation"
notionPageId: "3e9410cd-c737-8062-8e75-fcab4b161f12"
---

<!-- notion-sync: generated -->

UDP 9881 포트를 사용하는 서비스를 NCP의 Network Load Balancer(NLB)에 연결하면서, 헬스체크에서 한 가지 제약을 만났다. UDP 트래픽을 전달하도록 설정할 수는 있지만, 해당 타겟 그룹의 기본 헬스체크는 TCP로 수행해야 한다는 점이었다.
문제는 TCP 포트의 응답만으로 UDP 서비스의 상태를 판단하기 어렵다는 것이다. 예를 들어 SSH용 TCP 22 포트는 열려 있는데 UDP 9881을 사용하는 프로세스만 종료된 상황을 생각해 볼 수 있다. TCP 22에 대한 헬스체크가 성공해도 UDP 서비스는 동작하지 않을 수 있다.
이 문제를 보완하기 위해 타겟 서버 내부에서 UDP 9881 포트의 상태를 1분마다 확인하고, 결과를 Cloud Insight로 보내는 스크립트를 작성했다. 여기에 Cloud Functions와 NLB API를 연결하면 장애 서버를 타겟 그룹에서 제외하고, 복구 시 다시 등록하는 흐름을 구성할 수 있다.
이 글에서는 작성한 상태 수집 방식과, 공식 문서로 구현 가능성을 확인한 타겟 관리 자동화 구조를 정리한다.
## TCP 헬스체크만으로는 확인하기 어려웠던 것
NCP의 [타겟 그룹 생성 API](https://api.ncloud-docs.com/docs/networking-vloadbalancer-targetgroup-createtargetgroup)를 보면 서비스 트래픽에 사용하는 프로토콜과 헬스체크 프로토콜이 별도 항목으로 정의되어 있다.
<table header-row="true">
<tr>
<td>구분</td>
<td>이 구성에서 사용하는 값</td>
</tr>
<tr>
<td>서비스 트래픽 프로토콜</td>
<td>UDP</td>
</tr>
<tr>
<td>서비스 포트</td>
<td>9881</td>
</tr>
<tr>
<td>UDP 타겟 그룹에서 지원하는 기본 헬스체크 프로토콜</td>
<td>TCP</td>
</tr>
</table>
여기서 구분해야 할 것은 **TCP와 UDP가 같은 포트 번호를 사용하더라도 서로 다른 소켓이라는 점**이다. TCP 9881에 연결을 시도해 성공하거나 실패한 결과를 UDP 9881의 상태로 그대로 해석할 수는 없다.
그래서 UDP 서비스를 실행하는 서버가 자신의 포트 상태를 확인하고, 그 결과를 별도의 지표로 보내도록 구성했다. NLB의 기본 TCP 헬스체크 설정은 유지하면서, UDP 상태를 타겟 등록 여부에 반영하는 방식이다.
## 서버 내부에서 UDP 포트 상태 수집하기
확인에 사용한 명령은 다음과 같다. UDP 서비스를 실행하는 타겟 서버 내부에서 수행한다.
```bash
netstat -nlpu
```
UDP 소켓을 숫자 주소와 포트로 확인하고, 관련 프로세스 정보도 함께 보는 명령이다. 다른 사용자 소유의 프로세스 정보까지 확인하려면 실행 권한도 고려해야 한다.
스크립트는 이 결과에서 로컬 UDP 9881 소켓이 존재하는지 확인하고, 상태를 다음처럼 표현한다.
<table header-row="true">
<tr>
<td>값</td>
<td>의미</td>
</tr>
<tr>
<td>`1`</td>
<td>UDP 9881 소켓이 확인됨</td>
</tr>
<tr>
<td>`0`</td>
<td>UDP 9881 소켓이 확인되지 않음</td>
</tr>
</table>
단순히 출력 전체에 `9881`이라는 문자열이 있는지만 검사하면 다른 필드나 다른 포트 번호를 잘못 인식할 수 있다. 로컬 주소의 포트가 정확히 9881인지 확인하고, 서비스가 바인딩해야 하는 주소도 함께 고려해야 한다.
이때 `1`의 의미는 **UDP 소켓이 존재한다는 것**이다. 프로세스가 실제 요청을 정상적으로 처리한다는 의미까지 포함하지는 않는다. 이번 수집 방식은 우선 서비스 포트의 존재 여부를 감시하는 데 범위를 둔다.
## Cloud Insight에 상태를 지표로 전달하기
Cloud Insight에는 사용자가 직접 정의한 데이터를 수집할 수 있는 Custom Schema 기능이 있다. 어떤 값을 측정할지 나타내는 Metric과, 어느 대상의 데이터인지 구분하는 Dimension을 정의한다.
예를 들어 다음과 같이 구성할 수 있다. 아래 이름과 값은 설명을 위한 예시이다.
<table header-row="true">
<tr>
<td>항목</td>
<td>예시</td>
<td>역할</td>
</tr>
<tr>
<td>ID Dimension</td>
<td>`target_id`</td>
<td>측정 대상 서버 구분</td>
</tr>
<tr>
<td>Metric</td>
<td>`udp_9881_alive`</td>
<td>UDP 9881 소켓의 존재 여부</td>
</tr>
<tr>
<td>Metric 값</td>
<td>`0` 또는 `1`</td>
<td>미확인 또는 확인</td>
</tr>
</table>
스크립트에서 만든 값은 Custom Schema에 맞는 JSON으로 구성하여 [SendData API](https://api.ncloud-docs.com/docs/management-cloudinsight-senddata)로 전송한다.
```json
{
  "cw_key": "YOUR_CW_KEY",
  "data": {
    "target_id": "udp-server-01",
    "udp_9881_alive": 1
  }
}
```
`cw_key`에는 생성한 Custom Schema의 키를 넣는다. `target_id`와 `udp_9881_alive`는 실제로 정의한 필드 이름과 일치해야 한다.
각 서버에서 이 수집과 전송을 1분마다 반복하면, Cloud Insight에서 서버별 포트 상태를 지표로 확인할 수 있다. NCP의 [Cloud Insight FAQ](https://guide.ncloud-docs.com/docs/cloudinsight-faq)에서도 Custom Schema 정의, 지표 수집, SendData 전송, 주기적 실행으로 이어지는 방식을 안내한다.
여기서 Custom Schema는 데이터의 구조를 정의하는 역할을 한다. **어떤 값을 장애로 판단하고 어떤 동작을 실행할지는 Event Rule에서 설정한다.**
## 장애 발생과 복구를 Cloud Functions에 연결하기
이제 `udp_9881_alive`가 0일 때 장애 이벤트가 발생하도록 Event Rule을 구성한다. 실제 조건을 정할 때는 지표의 집계 방식과 조건 유지 시간도 함께 설정해야 한다.
Cloud Insight는 Event Rule의 액션으로 Cloud Functions 트리거를 연결할 수 있다. 이벤트가 발생하면 연결된 함수에 이벤트 정보를 전달하고, 함수는 이를 바탕으로 필요한 API를 호출한다.
공식 [Cloud Insight 타입 트리거 문서](https://guide.ncloud-docs.com/docs/cloudfunctions-cloudinsight-vpc)에 나오는 `eventStatus`를 기준으로 다음과 같이 처리할 수 있다.
<table header-row="true">
<tr>
<td>이벤트 상태</td>
<td>의미</td>
<td>구성할 동작</td>
</tr>
<tr>
<td>`OPEN`</td>
<td>장애 조건을 충족하여 이벤트 발생</td>
<td>해당 서버를 NLB 타겟 그룹에서 제외</td>
</tr>
<tr>
<td>`REMIND`</td>
<td>진행 중인 이벤트에 대한 리마인드</td>
<td>현재 상태를 확인하고 중복 처리 방지</td>
</tr>
<tr>
<td>`RESOLVE`</td>
<td>이벤트 종료</td>
<td>정상 복구를 확인한 뒤 타겟 그룹에 재등록</td>
</tr>
</table>
복구까지 연결하려면 Cloud Insight의 **‘종료 시 재호출’을 ON**으로 설정해야 한다. 이 옵션을 켜면 이벤트가 종료될 때도 선택한 Cloud Functions 트리거를 호출한다. 설정 위치는 [Event Rule 사용 가이드](https://guide.ncloud-docs.com/docs/cloudinsight-use-eventrule)에서 확인할 수 있다.
API로 트리거를 설정한다면 [Put Trigger API](https://api.ncloud-docs.com/docs/compute-cloudfunctions-v2-puttrigger)의 `insightLink`에서 `enableNotiWhenEventClose`를 `true`로 지정한다. 해당 옵션의 기본값은 `false`이다.
따라서 이 구조는 매분 들어오는 0과 1을 모두 함수 실행으로 연결하는 방식이 아니다. **설정한 조건에 따라 발생하거나 종료되는 이벤트를 함수 실행에 연결하는 방식**이다.
복구 처리에서는 종료 이벤트만 보고 바로 등록하기보다, 해당 서버의 최근 정상 지표와 수집 시각도 확인하도록 구성하는 것이 좋다.
## NLB 타겟을 제외하고 다시 등록하는 API
Cloud Functions에서 사용할 NLB API도 공식 문서에서 확인할 수 있었다.
<table header-row="true">
<tr>
<td>API</td>
<td>역할</td>
</tr>
<tr>
<td>[getTargetList](https://api.ncloud-docs.com/docs/networking-vloadbalancer-targetgroup-gettargetlist)</td>
<td>타겟 그룹에 현재 등록된 서버 목록 조회</td>
</tr>
<tr>
<td>[removeTarget](https://api.ncloud-docs.com/docs/networking-vloadbalancer-targetgroup-removetarget)</td>
<td>지정한 서버를 타겟 그룹에서 제외</td>
</tr>
<tr>
<td>[addTarget](https://api.ncloud-docs.com/docs/networking-vloadbalancer-targetgroup-addtarget)</td>
<td>지정한 서버를 타겟 그룹에 추가</td>
</tr>
</table>
추가·제외 요청에는 대상 리전을 나타내는 `regionCode`, NLB 타겟 그룹 번호인 `targetGroupNo`, 처리할 타겟 번호인 `targetNoList.1` 등을 전달한다.
여기서 Cloud Insight에 보낸 `target_id`는 직접 정의한 식별값이다. NLB API가 사용하는 `targetNo`와 자동으로 연결되는 것은 아니다. 따라서 어느 서버의 이벤트가 어느 타겟을 변경해야 하는지 매핑 정보를 별도로 유지해야 한다. 타겟을 제외한 뒤에도 재등록에 필요한 번호를 확인할 수 있어야 한다.
함수의 처리 순서는 다음과 같이 설계할 수 있다.
1. 전달받은 이벤트의 서버 식별값과 상태를 확인한다.
2. 미리 정의한 매핑에서 해당 서버의 타겟 그룹 번호와 타겟 번호를 찾는다.
3. `getTargetList`로 현재 등록 여부를 확인한다.
4. 장애 이벤트이고 등록된 상태라면 `removeTarget`을 호출한다.
5. 복구가 확인되고 미등록 상태라면 `addTarget`을 호출한다.
6. API 응답과 처리 결과를 기록하고, 실패 시 재시도할 수 있도록 구성한다.
`addTarget`은 이미 등록된 타겟을 다시 추가할 수 없다. 현재 상태를 먼저 확인하는 이유도 같은 이벤트가 반복되었을 때 불필요한 변경이나 오류를 줄이기 위해서이다.
API 호출에는 Access Key, 타임스탬프, Secret Key로 생성한 HMAC-SHA256 서명도 필요하다. 함수 실행 환경에서 NCP API에 접근할 수 있어야 하며, 사용하는 인증 정보에는 대상 리소스를 변경할 권한이 있어야 한다. 인증 형식은 [Load Balancer API 개요](https://api.ncloud-docs.com/docs/en/networking-vloadbalancer)에 정리되어 있다.
타겟 그룹에 다시 등록한 이후의 상태는 기존 TCP 헬스체크 결과도 함께 확인해야 한다. 등록 API의 성공과 실제 트래픽 처리 재개는 별도로 검증할 항목이다.
## 운영에 반영하기 전에 확인할 부분
자동화 흐름을 만들 수 있다는 것과, 운영에서 장애를 정확하게 처리한다는 것은 각각 확인해야 한다.
우선 **소켓 존재 여부와 애플리케이션 정상 동작은 구분해야 한다.** UDP 포트가 열려 있어도 프로세스가 요청을 처리하지 못하거나, 필요한 DB 연결에 문제가 생길 수 있다. 서비스 프로토콜이 허용한다면 실제 요청과 응답을 검증하는 방식으로 감시 범위를 넓힐 수 있다.
또한 **데이터가 들어오지 않는 상태를 별도로 다뤄야 한다.** 서버가 꺼지거나 수집 스크립트가 중단되면 0을 보낼 수도 없다. 마지막 값이 1이었다는 이유로 정상으로 판단하지 않도록, 최근 수집 시각과 데이터 미수신 감시를 함께 고려해야 한다. 상태 확인 명령 자체의 실패도 포트가 없다는 결과와 구분하는 편이 좋다.
1분 수집 주기가 곧 1분 이내 조치를 보장하는 것도 아니다. 다음 수집까지의 대기, Cloud Insight의 집계와 조건 유지 시간, 이벤트 전달, 함수 실행, 타겟 변경 반영에 시간이 필요하다. 서비스 중단부터 타겟 제외까지 걸리는 시간은 실제로 측정해야 한다.
짧은 시간에 상태가 반복해서 바뀌는 경우도 생각해야 한다. 순간적인 변화마다 제외와 등록을 반복하지 않도록 연속 실패·성공 기준이나 대기 시간을 설계할 수 있다. 지연된 과거 이벤트가 최신 상태를 뒤집지 않도록 하는 처리도 필요하다.
이번에 작성한 것은 UDP 포트 상태를 수집·전송하는 스크립트이며, 타겟 제외·복구 자동화는 공식 문서에서 필요한 API와 이벤트 연동 기능을 확인했다. 전체 흐름의 검증에서는 UDP 서비스 중단과 재시작뿐 아니라, 수집 스크립트 중단과 API 호출 실패 상황도 함께 재현해 볼 필요가 있다.
*공식 문서 확인 기준: 2026년 9월 29일.*
