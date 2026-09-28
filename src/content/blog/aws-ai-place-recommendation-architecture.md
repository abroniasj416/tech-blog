---
title: "AI 장소 추천 서비스의 AWS 설계: 서버·검색·외부 API 연결하기"
description: "AI 장소 추천 서비스를 위한 AWS 인프라 설계 과정을 정리했습니다. Private Subnet의 EC2와 NAT Gateway를 통한 외부 API 연동, RDS·OpenSearch·S3의 역할 분리, RAG 검색 흐름과 확장·모니터링을 고려한 설계 이유를 소개합니다."
pubDate: "2026-06-30"
category: "Cloud"
tags:
  - "AWS"
  - "Cloud Architecture"
  - "3-Tier"
  - "RAG"
  - "OpenSearch"
  - "Auto Scaling"
notionPageId: "3e9410cd-c737-807c-b9a8-ecc892edd556"
---

<!-- notion-sync: generated -->

AI와 대화한 뒤 지금 기분에 어울리는 장소를 추천받는 서비스를 생각해 보자. 화면에서는 대화창과 추천 장소 몇 개가 보이지만, 그 뒤에서는 여러 작업이 함께 일어난다. 대화 내용을 처리하고, 외부 AI API를 호출하고, 장소를 검색하고, 추천 이력과 사진을 불러와야 한다.
이번 프로젝트에서는 **AI 멀티 페르소나 기반 감성 장소 추천 플랫폼**을 위한 AWS 인프라를 설계했다. 사용자가 선택한 AI 페르소나와 대화하면 감정 상태를 분석하고, 그에 어울리는 장소를 지도 정보와 함께 제공하는 모바일 서비스이다.
이 글에서는 서비스 요구사항을 인프라 구성으로 어떻게 연결했는지 정리한다. 구축 성능이나 운영 성과보다는 서버 배치, 통신 경로, 데이터 저장소를 선택한 이유에 초점을 맞췄다.
## 서비스 흐름에서 필요한 구성 찾기
서비스의 큰 흐름은 다음과 같다.
1. 사용자가 AI 페르소나를 선택하고 대화를 시작한다.
2. 대화 내용을 바탕으로 감정 상태와 원하는 분위기를 파악한다.
3. 참고 문서를 검색해 AI 응답에 사용할 맥락을 보강한다.
4. 장소의 분위기 데이터를 검색하고 추천 후보를 찾는다.
5. 장소 설명, 사진, 지도 정보를 조합해 사용자에게 보여준다.
참고 자료에는 Plutchik의 감정 모델과 Gross의 감정 조절 모델 관련 문서를 활용하는 구상을 담았다. 여기서 문서를 검색해 생성 모델에 함께 전달하는 방식을 RAG(Retrieval-Augmented Generation, 검색 증강 생성)라고 한다.
이 흐름을 보면 필요한 데이터의 성격이 서로 다르다. 회원 정보와 추천 이력은 정확하게 저장하고 조회해야 한다. 장소 분위기와 참고 문서는 의미가 비슷한 내용을 검색해야 한다. 사진과 원본 문서는 파일로 보관해야 한다.
따라서 애플리케이션 서버를 중심으로 관계형 데이터베이스, 검색 엔진, 객체 스토리지를 나누는 방향으로 설계했다.
## 전체 아키텍처
![](/notion-assets/aws-ai-place-recommendation-architecture/image-001.png)
AI 장소 추천 서비스의 AWS 인프라 개념도. 서비스 간 연결과 Public/Private 영역의 역할을 표현했다.
그림은 통신 관계를 중심으로 단순화되어 있다. 일반적인 AWS 리전의 Availability Zone에 ALB를 배포하려면 서로 다른 가용 영역의 서브넷을 최소 두 개 선택해야 한다. RDS의 Primary와 Standby도 Multi-AZ 구성에서는 서로 다른 가용 영역에 배치된다. 그림처럼 하나의 서브넷 안에 두 DB를 넣는 구성을 의미하지 않는다.
### 3-Tier와 AWS 리소스를 연결해서 보기
3-Tier를 이 서비스에 적용하면 사용자 화면은 모바일 앱이, 비즈니스 로직은 EC2 애플리케이션이, 데이터 관리는 RDS와 OpenSearch가 맡는다. ALB는 서버 쪽 요청 진입점이다. ALB 자체를 HTML을 제공하는 웹 서버와 동일하게 보는 것은 피해야 한다.
<table header-row="true">
<tr>
<td>구성 요소</td>
<td>이 설계에서 맡은 역할</td>
</tr>
<tr>
<td>모바일 앱</td>
<td>사용자 입력과 추천 결과 표시</td>
</tr>
<tr>
<td>Load Balancer</td>
<td>외부 API 요청을 받아 애플리케이션 서버로 전달</td>
</tr>
<tr>
<td>EC2 · Auto Scaling Group</td>
<td>애플리케이션 실행과 서버 수 조절</td>
</tr>
<tr>
<td>RDS</td>
<td>회원·장소 기본 정보·추천 이력 저장</td>
</tr>
<tr>
<td>OpenSearch</td>
<td>참고 문서 검색과 장소 벡터 검색</td>
</tr>
<tr>
<td>S3</td>
<td>장소 사진·문서 원본·전처리 결과 보관</td>
</tr>
<tr>
<td>CloudWatch</td>
<td>리소스 지표와 수집하도록 설정한 로그 확인</td>
</tr>
</table>
## 1. 사용자 요청은 Load Balancer로, 서버는 Private Subnet으로
VPC는 `192.168.0.0/16`으로 잡고 Public 영역과 Private 영역을 나눴다. 외부 요청을 받을 Load Balancer는 Public Subnet에, 애플리케이션 EC2는 Private Subnet에 두는 구조이다.
서비스의 API 요청은 HTTP/HTTPS를 사용하므로, 그림의 Elastic Load Balancer는 실제 구현에서 **Application Load Balancer(ALB)**를 선택하는 방향으로 구체화할 수 있다. 사용자는 ALB에 접속하고, ALB는 등록된 EC2의 사설 IP로 요청을 전달한다.
이렇게 하면 사용자가 접속할 주소와 실제 애플리케이션 서버를 분리할 수 있다. 서버가 교체되거나 여러 대로 늘어나도 클라이언트는 같은 서비스 진입점으로 요청을 보낸다.
다만 Private Subnet에 배치했다는 사실만으로 접근 제어가 완성되지는 않는다. 실제 배포에서는 다음과 같이 보안 그룹과 접근 권한을 함께 구성해야 한다.
- ALB는 서비스에 필요한 HTTPS 요청을 받는다.
- EC2의 애플리케이션 포트와 헬스체크 포트는 ALB 보안 그룹을 소스로 허용한다.
- RDS의 DB 포트는 애플리케이션 보안 그룹을 소스로 허용한다.
- VPC에 배치한 OpenSearch는 애플리케이션에서 필요한 접근만 허용하고, 도메인 접근 정책과 인증도 설정한다.
핵심은 외부에서 들어오는 요청이 데이터 계층까지 바로 도달하지 않고, 애플리케이션의 인증과 처리 로직을 거치게 만드는 것이다.
## 2. Private Subnet에서도 외부 AI API를 호출해야 한다
이 서비스의 EC2는 외부 LLM API와 지도 관련 API를 호출해야 한다. 서버를 Private Subnet에 두더라도 서버가 먼저 시작하는 인터넷 통신은 필요하다.
그래서 Public Subnet에 **Public NAT Gateway**를 두고, EC2의 외부 API 호출이 NAT Gateway와 Internet Gateway를 거치도록 설계했다. 이 글의 그림은 서브넷에 배치하는 NAT Gateway 구성을 기준으로 한다.
IPv4 기본 경로는 다음과 같이 연결된다.
<table header-row="true">
<tr>
<td>연결 대상</td>
<td>목적지</td>
<td>경로</td>
</tr>
<tr>
<td>Public Subnet의 라우팅 테이블</td>
<td>0.0.0.0/0</td>
<td>Internet Gateway</td>
</tr>
<tr>
<td>애플리케이션 Private Subnet의 라우팅 테이블</td>
<td>0.0.0.0/0</td>
<td>Public NAT Gateway</td>
</tr>
<tr>
<td>VPC 내부 통신</td>
<td>192.168.0.0/16</td>
<td>local</td>
</tr>
</table>
EC2가 LLM API로 요청을 보내면 NAT Gateway가 주소를 변환하고, Internet Gateway를 통해 인터넷으로 나간다. 인터넷 쪽에서는 NAT Gateway에 연결된 Elastic IP가 출발지로 보인다. 응답은 이 연결을 따라 EC2로 돌아온다.
이때 두 종류의 통신을 구분해야 한다. **사용자가 서비스를 호출할 때는 ALB를 거치고, 서버가 외부 API를 호출할 때는 NAT Gateway를 거친다.** 사용자의 모든 요청이나 EC2의 모든 응답이 NAT Gateway로 향하는 것은 아니다.
EC2가 RDS나 VPC의 OpenSearch에 접근하는 내부 통신도 기본적으로 VPC 내부 경로를 사용한다. NAT Gateway는 이 데이터 조회 경로에 끼어들지 않는다.
위 경로는 서버가 외부 API를 호출하는 경우에 해당한다. 모바일 앱이 지도 SDK를 통해 직접 보내는 요청은 AWS NAT Gateway를 거치지 않는다.
## 3. Auto Scaling은 요청을 받는 서버 수를 조절한다
애플리케이션은 EC2에서 실행하고, EC2 Auto Scaling Group으로 서버 수를 조절할 수 있도록 설계했다.
여기서 Auto Scaling Group은 패킷이 통과하는 중간 서버가 아니다. 요청은 ALB에서 대상 EC2로 전달된다. Auto Scaling Group은 그 EC2들을 생성하거나 종료하고, 설정된 용량과 조정 정책에 따라 수를 관리한다. ALB의 대상 그룹을 연결하면 새 인스턴스의 등록과 해제도 연동할 수 있다.
실제 배포 시에는 최소·최대 서버 수, 확장 지표와 헬스체크도 설정해야 한다.
특히 이 서비스는 외부 LLM의 응답을 기다리는 시간이 발생할 수 있다. 따라서 운영 단계에서는 CPU 사용률뿐 아니라 동시 요청 수, 응답 시간, 외부 API 호출 제한도 함께 봐야 한다. 외부 API가 병목이면 EC2 수만 늘려서는 문제가 해결되지 않을 수 있다.
또한 다음 요청이 다른 EC2에 도착하더라도 대화를 이어갈 수 있도록, 필요한 대화 상태는 공용 저장소에서 관리하는 방식을 정해야 한다.
## 4. RDS, OpenSearch, S3를 나눈 이유
세 저장소는 모두 데이터를 다루지만, 서비스에서 필요한 조회 방식이 다르다.
<table header-row="true">
<tr>
<td>저장소</td>
<td>데이터 예시</td>
<td>선택한 이유</td>
</tr>
<tr>
<td>RDS</td>
<td>회원 정보, 대화 세션 메타데이터, 장소 기본 정보, 추천 이력</td>
<td>데이터 관계와 트랜잭션을 관리</td>
</tr>
<tr>
<td>OpenSearch</td>
<td>장소 분위기 벡터, 감정 태그, 검색용 문서와 임베딩</td>
<td>조건 검색과 의미 기반 유사도 검색</td>
</tr>
<tr>
<td>S3</td>
<td>장소 사진, RAG 문서 원본, 장소 데이터 원본</td>
<td>파일을 서버 수명과 분리해 보관</td>
</tr>
</table>
예를 들어 “이 사용자가 지난번에 어떤 장소를 추천받았는가?”는 사용자와 추천 기록의 관계를 조회하는 문제이다. RDS에 적합한 작업이다.
반면 “혼자 조용히 쉬고 싶다는 요청과 분위기가 비슷한 장소는 어디인가?”는 의미를 비교하는 검색에 가깝다. 장소 설명을 임베딩이라는 숫자 벡터로 표현하고, 검색 요청의 벡터와 비교하는 방식으로 접근할 수 있다.
다만 감정 점수와 장소 임베딩을 아무 준비 없이 비교할 수 있는 것은 아니다. **비교할 벡터의 차원과 의미 체계를 맞춰야 한다.** 임베딩을 사용한다면 질의와 장소 데이터를 같은 모델과 규칙으로 표현하는 과정이 필요하다.
또한 “슬프다”는 감정과 비슷한 장소를 찾는 것이 곧 좋은 추천은 아닐 수 있다. 사용자가 조용히 쉬고 싶은지, 활기찬 곳에서 기분을 전환하고 싶은지에 따라 추천 방향이 달라진다. 감정 분석 결과를 어떤 검색 조건으로 바꿀지는 애플리케이션의 추천 로직에서 정해야 한다.
OpenSearch는 정해진 조건과 벡터로 후보를 검색한다. 추천 품질은 별도로 평가해야 한다.
### RDS의 Standby는 장애에 대비하기 위한 구성이다
그림의 Primary와 Standby는 RDS Multi-AZ DB 인스턴스 구성을 고려한 표현이다. 이 구성에서 평소 읽기와 쓰기는 Primary가 처리하고, Standby는 장애 조치에 대비한다. Standby를 일반적인 읽기 분산 서버처럼 사용하는 구조는 아니다.
읽기 성능 확장이 필요하다면 Read Replica 등 별도 선택지를 검토해야 한다. 읽기 가능한 Standby를 제공하는 Multi-AZ DB 클러스터도 별도 배포 유형이므로 구분할 필요가 있다.
## 5. 문서를 S3에 넣는 것과 RAG 검색을 준비하는 것은 다르다
아키텍처에는 문서가 S3에 저장되고 OpenSearch로 이어지는 화살표가 있다. 이 연결을 “S3에 파일을 올리면 자동으로 검색 준비가 끝난다”는 뜻으로 보면 안 된다.
RAG를 위해서는 별도의 전처리와 적재 과정이 필요하다.
1. 문서 원본을 S3에 저장한다.
2. 문서에서 텍스트를 추출하고 검색하기 적절한 단위로 나눈다.
3. 각 조각을 임베딩 모델로 벡터화한다.
4. 벡터, 원문 조각, 출처 등의 메타데이터를 OpenSearch에 적재한다.
사용자 요청이 들어왔을 때는 이 데이터에서 관련 문서를 검색하고, 검색 결과를 대화 내용과 함께 LLM에 전달한다. LLM이 참고할 맥락을 애플리케이션이 구성하는 것이다.
S3는 원본과 전처리 결과를 보관하는 공간이고, OpenSearch는 요청 시 검색하는 공간이다. 임베딩 모델이나 문서 분할 기준이 바뀌었을 때 원본에서 검색 데이터를 다시 만들 수 있다는 점도 두 역할을 나눈 이유이다.
## 6. 장소 사진도 EC2의 수명과 분리한다
장소 사진은 EC2의 로컬 디스크에 쌓아두는 대신 S3에 보관하도록 설계했다. Auto Scaling으로 서버가 늘거나 교체되더라도 모든 서버가 같은 사진을 참조할 수 있어야 하기 때문이다.
그림은 EC2가 사진을 조회하는 관계를 표현한다. 실제 전달 방식은 EC2가 파일을 읽어 보내거나, 접근 가능한 이미지 URL을 앱에 전달하는 방식으로 구체화할 수 있다. 이미지의 공개 범위에 맞는 접근 권한도 함께 정해야 한다.
EC2에서 S3로 접근할 경로도 별도로 정해야 한다. 같은 리전의 S3에 접근하는 경우에는 Gateway VPC Endpoint를 사용해 NAT Gateway나 Internet Gateway를 거치지 않는 경로를 만들 수 있다. 이 엔드포인트는 현재 그림에는 없으며, 실제 배포 시 보완할 항목이다.
## 7. 장애를 찾을 수 있는 구조까지 생각하기
추천 결과가 늦게 도착했을 때 원인은 여러 곳에 있을 수 있다. EC2가 바쁠 수도 있고, 외부 LLM API가 느릴 수도 있고, OpenSearch 검색이나 RDS 조회에서 지연이 발생했을 수도 있다.
그래서 CloudWatch를 통해 주요 리소스의 지표와 애플리케이션 로그를 함께 확인하는 구성을 고려했다.
- ALB: 요청 수, 대상 응답 시간, 오류, 정상 대상 수
- EC2: CPU, 네트워크, 상태 검사
- RDS: 연결 수, CPU, 저장 공간과 읽기·쓰기 지연
- OpenSearch: 클러스터 상태, JVM 메모리 부담, 검색 지연
- 애플리케이션: 외부 API 응답 시간, 타임아웃, 검색·DB 처리 시간
CloudWatch를 구성도에 넣는 것만으로 모든 데이터가 자동 수집되지는 않는다. EC2의 메모리 사용률이나 애플리케이션 로그는 CloudWatch Agent 등 수집 방법을 설정해야 한다. 외부 LLM의 지연도 애플리케이션에서 호출 시간을 기록해야 내부 처리 시간과 구분할 수 있다.
## 설계하면서 남은 판단 기준
이번 설계에서 중심에 둔 것은 요청이 들어오는 경로, 서버가 외부로 나가는 경로, 내부 데이터를 조회하는 경로를 구분하는 일이었다. 경로를 나누고 나니 각 리소스의 배치와 접근 권한을 설명하기가 쉬워졌다.
실제 배포 단계에서는 여러 가용 영역에 걸친 ALB·EC2·RDS 배치, OpenSearch의 가용성 구성, NAT 경로의 장애 범위를 더 구체화해야 한다. ASG를 넣었다고 가용 영역 장애까지 자동으로 해결되는 것은 아니다.
비용도 함께 볼 필요가 있다. NAT Gateway, RDS의 대기 인스턴스, OpenSearch 등은 서비스 규모에 따라 부담이 될 수 있다. 초기 검증 단계에서 필요한 구성과 운영 단계에서 필요한 가용성 수준을 나누고, 예상 요청량과 데이터 규모를 기준으로 결정해야 한다.
AI 기능은 외부 API로 연결하더라도, 사용자에게 결과를 전달하는 서비스는 결국 네트워크와 애플리케이션, 저장소 위에서 동작한다. 이번 구조는 그 사이의 역할과 통신 관계를 정리하기 위한 설계였다.
## 참고 자료
- [AWS — Application Load Balancer의 서브넷과 가용 영역](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- [AWS — ALB 대상 등록과 Auto Scaling 연동](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-register-targets.html)
- [AWS — NAT Gateway 동작 방식](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html)
- [AWS — OpenSearch 벡터 검색](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/vector-search.html)
- [AWS — OpenSearch의 VPC 배치](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/vpc.html)
- [AWS — RDS Multi-AZ 배포](https://aws.amazon.com/rds/features/multi-az/)
- [AWS — RAG 검색 데이터 준비](https://docs.aws.amazon.com/prescriptive-guidance/latest/retrieval-augmented-generation-options/rag-custom-retrievers.html)
- [AWS — S3 Gateway Endpoint](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html)
- [AWS — CloudWatch Agent 설치와 수집 구성](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Agent-on-EC2-Instance.html)
