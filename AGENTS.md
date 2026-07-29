# AGENTS.md

## 1. 프로젝트 목적

이 저장소는 개인 기술 블로그와 게시 자동화 시스템을 개발하기 위한 프로젝트다.

사용자는 기술 내용을 Notion 데이터베이스에서 작성하고 관리한다. 자동화 프로그램은 Notion에서 발행 대상 글을 읽어 Astro가 사용하는 Markdown 게시글로 변환한다. 변환된 파일은 GitHub 저장소에 저장되고, 이후 정적 사이트 배포 플랫폼을 통해 블로그로 배포된다.

최종적으로 구현하려는 흐름은 다음과 같다.

```text
사용자가 Notion에서 글 작성
→ 상태를 "발행 대기"로 변경
→ 자동화 스크립트가 Notion API 호출
→ Notion 페이지 속성과 본문 조회
→ Astro용 Markdown 및 frontmatter 생성
→ src/content/blog/에 파일 저장
→ 빌드 검증
→ GitHub commit/push
→ 정적 블로그 배포
→ Notion 상태를 "발행 완료"로 변경
→ Notion의 "발행 URL" 속성 갱신
```

현재는 로컬 Node.js 스크립트와 GitHub Actions를 이용하는 구조를 우선 구현한다.

---

## 2. 현재 기술 스택

- Astro
- Astro 공식 blog template
- Node.js
- npm
- JavaScript ES Modules (`.mjs`)
- Notion API
- Git 및 GitHub
- 향후 GitHub Actions
- 향후 GitHub Pages 또는 Cloudflare Pages

가능하면 현재 프로젝트의 기존 기술 스택을 유지한다. 특별한 이유가 없다면 TypeScript, React, 별도의 서버 프레임워크나 대규모 라이브러리를 추가하지 않는다.

---

## 3. 현재까지 완료된 작업

- Astro blog template 프로젝트 생성
- npm 의존성 설치
- 로컬 개발 서버 실행 검증
- Git 저장소 초기화
- GitHub 원격 저장소 연결
- `main` 브랜치 push
- Notion `Tech Blog` 데이터베이스 생성
- 테스트 게시글 작성
- Notion 내부 연결 `Tech Blog Publisher` 생성
- 해당 연결을 Tech Blog 페이지에 연결
- 프로젝트 루트에 `.env` 생성
- `.gitignore`에서 `.env` 제외 확인

---

## 4. Notion 데이터베이스 구조

Notion 데이터베이스에는 다음 속성이 있다.

| 속성명 | Notion 유형 | 용도 |
|---|---|---|
| 제목 | Title | 게시글 제목 |
| 상태 | Status | 작성 중 / 발행 대기 / 발행 완료 |
| Slug | Text | 게시글 URL과 Markdown 파일명 |
| 설명 | Text | Astro 게시글 description |
| 카테고리 | Select | 글의 상위 분류 |
| 태그 | Multi-select | 세부 키워드 |
| 작성일 | Date | 게시일 |
| 발행 URL | URL | 실제 배포된 게시글 주소 |

상태 이름은 다음 문자열과 정확히 일치한다.

```text
작성 중
발행 대기
발행 완료
```

자동 발행 대상은 상태가 `발행 대기`인 페이지만 해당한다.

---

## 5. 환경변수

로컬 비밀정보는 프로젝트 루트의 `.env`에서 관리한다.

현재 사용하는 환경변수는 다음과 같다.

```text
NOTION_API_TOKEN
NOTION_DATABASE_ID
```

향후 다음 변수가 추가될 수 있다.

```text
NOTION_DATA_SOURCE_ID
BLOG_BASE_URL
```

### 보안 규칙

- `.env`의 실제 값을 출력하지 않는다.
- API 토큰을 코드에 하드코딩하지 않는다.
- Authorization 헤더를 로그에 출력하지 않는다.
- 토큰의 일부라도 불필요하게 출력하지 않는다.
- `.env`를 Git 추적 대상으로 추가하지 않는다.
- README, 예제, 테스트 파일에는 가짜 placeholder만 사용한다.
- 비밀값이 Git에 포함되었는지 의심되면 작업을 멈추고 사용자에게 알린다.
- `.env` 자체를 수정해야 한다면 실제 값을 보존하고 임의로 덮어쓰지 않는다.

---

## 6. 주요 디렉터리 계획

```text
tech-blog/
├─ AGENTS.md
├─ .env
├─ .gitignore
├─ package.json
├─ astro.config.mjs
├─ scripts/
│  ├─ get-notion-data-source.mjs
│  └─ sync-notion.mjs
├─ src/
│  └─ content/
│     └─ blog/
└─ .github/
   └─ workflows/
      └─ sync-notion.yml
```

각 파일의 역할은 다음과 같다.

- `scripts/get-notion-data-source.mjs`
  - Database ID로 Data Source ID를 조회하는 초기 연결 검증 도구
- `scripts/sync-notion.mjs`
  - 발행 대기 글을 조회하고 Markdown으로 변환하는 본 자동화 프로그램
- `src/content/blog/`
  - Astro가 읽는 Markdown 게시글 저장 위치
- `.github/workflows/sync-notion.yml`
  - 향후 주기 실행 또는 수동 실행을 위한 GitHub Actions 워크플로

---

## 7. 구현 단계

작업은 가능한 한 아래 순서대로 진행한다.

### 1단계: 연결 검증

- `.env` 로드
- Notion Database 조회
- Data Source ID 확인
- 연결 및 권한 오류 처리

### 2단계: 게시 대상 조회

- Data Source 조회
- 상태가 `발행 대기`인 페이지 필터링
- 페이지 속성 파싱
- 필수 속성 검증

### 3단계: 본문 조회 및 Markdown 생성

- Notion 페이지 본문을 Markdown으로 조회
- Astro frontmatter 생성
- `src/content/blog/{slug}.md` 저장
- 파일명 및 Slug 검증

### 4단계: 게시 후 Notion 업데이트

- 상태를 `발행 완료`로 변경
- `발행 URL` 기록
- 실패한 글은 완료 상태로 바꾸지 않음

### 5단계: GitHub Actions 자동화

- 수동 실행 지원
- 정기 실행 지원
- GitHub Actions Secrets 사용
- 변경 파일이 있을 때만 commit/push
- 빌드 성공 후에만 게시 완료 처리하는 방안 검토

현재 요청된 단계보다 이후 단계를 임의로 한꺼번에 구현하지 않는다.

---

## 8. Astro 게시글 형식

실제 Astro 콘텐츠 스키마는 저장소의 현재 파일을 먼저 확인하고 그 정의를 기준으로 한다.

예상하는 게시글 형식은 다음과 유사하다.

```markdown
---
title: "HTTP Redirect 테스트"
description: "HTTP Redirect 동작을 설명하는 테스트 글입니다."
pubDate: 2026-07-29
category: "Network"
tags:
  - "HTTP"
  - "Redirect"
---

## HTTP Redirect란?

본문
```

다만 frontmatter의 정확한 필드명과 필수 여부는 반드시 다음 파일과 기존 샘플 게시글을 확인해서 결정한다.

```text
src/content.config.ts
src/content/config.ts
src/content/blog/
```

존재하지 않는 스키마를 추측해 작성하지 않는다.

---

## 9. 코딩 규칙

- Node.js ES Modules 방식을 사용한다.
- 스크립트 파일은 기본적으로 `.mjs`를 사용한다.
- 함수와 변수 이름은 역할이 명확한 영어 이름을 사용한다.
- 사용자에게 출력되는 로그와 오류 메시지는 이해하기 쉬운 한국어로 작성해도 된다.
- API 호출은 HTTP 상태를 반드시 검사한다.
- 실패 응답 본문을 가능한 범위에서 출력하되 비밀정보는 출력하지 않는다.
- 환경변수 누락 시 즉시 명확한 오류로 종료한다.
- 오류 종료 시 `process.exitCode = 1` 또는 적절한 예외 처리를 사용한다.
- 불필요한 추상화와 복잡한 클래스 구조를 피한다.
- 짧고 읽기 쉬운 함수 단위로 구현한다.
- 동일 동작을 중복 구현하지 않는다.
- 외부 패키지는 꼭 필요한 경우에만 추가한다.
- 새 패키지를 설치하면 이유를 설명한다.
- 기존 Astro 템플릿 파일은 관련 없는 작업에서 수정하지 않는다.
- 현재 요청 범위를 넘어선 대규모 리팩터링을 하지 않는다.

---

## 10. Notion API 작업 규칙

- 작업 전에 현재 Notion API 공식 문서와 사용 중인 API 버전을 확인한다.
- Database와 Data Source 개념을 구분한다.
- 데이터베이스 URL에서 얻은 ID는 `NOTION_DATABASE_ID`다.
- 최신 API에서 행 조회에 Data Source ID가 필요하면 Database 조회 응답의 `data_sources`를 사용한다.
- API 버전은 모든 요청에서 일관되게 사용한다.
- 속성 이름은 현재 한국어 속성명을 정확하게 사용한다.
- Notion 응답 구조가 예상과 다르면 추측으로 계속 진행하지 말고 실제 응답 구조를 안전하게 확인한다.
- 전체 API 응답을 그대로 로그에 출력하지 않는다. 사용자 데이터나 내부 정보가 포함될 수 있다.
- 페이지를 업데이트하기 전 필수 속성이 모두 검증되었는지 확인한다.
- 일부 글 처리에 실패했다고 다른 글까지 잘못 완료 처리하지 않는다.

---

## 11. 파일 생성 및 업데이트 안전 규칙

- 기존 파일을 덮어쓰기 전에 내용을 확인한다.
- 사용자가 작성한 게시글을 임의로 삭제하지 않는다.
- 생성된 Markdown의 경로가 `src/content/blog/` 밖으로 벗어나지 않게 한다.
- Slug에 `../`, 절대 경로, Windows 경로 구분자 등 위험한 문자열이 들어오면 거부한다.
- 같은 Slug의 파일이 존재할 경우 업데이트인지 충돌인지 명확히 판단한다.
- 테스트 목적으로 실제 Notion 상태를 변경하지 않는다. 상태 변경 테스트는 사용자의 명시적 요청 이후에 수행한다.
- Git commit과 push는 사용자의 명시적 요청이 있기 전에는 수행하지 않는다.
- 위험하거나 되돌리기 어려운 명령은 실행 전에 사용자에게 알린다.

---

## 12. 실행 및 검증 명령

프로젝트 구조를 확인한 후 실제 package.json에 존재하는 명령을 사용한다.

기본적으로 다음 명령을 활용한다.

```bash
npm install
npm run dev
npm run build
git status
```

Data Source 조회 스크립트가 구현된 후에는 다음 명령을 사용한다.

```bash
npm run notion:data-source
```

Notion 동기화 스크립트가 구현된 후에는 다음 형태를 권장한다.

```bash
npm run sync:notion
```

파일을 수정한 뒤에는 가능한 범위에서 반드시 다음을 검증한다.

1. 대상 스크립트 직접 실행
2. `npm run build`
3. `git diff`
4. `git status`

다만 현재 요청 범위와 관련 없는 장시간 작업은 피한다.

---

## 13. 작업 보고 형식

작업을 완료하면 다음 내용을 사용자에게 보고한다.

1. 수행한 작업 요약
2. 생성한 파일
3. 수정한 파일
4. 설치한 패키지
5. 실행한 명령
6. 테스트 및 빌드 결과
7. 남아 있는 문제
8. 다음으로 권장하는 한 단계

코드가 성공했다고 추측하지 말고 실제 명령 실행 결과를 근거로 보고한다.

---

## 14. 현재 최우선 작업

현재 최우선 작업은 다음과 같다.

```text
Notion Database ID를 사용해 Data Source ID를 조회하고
Notion API 토큰, 연결 권한 및 환경변수 설정이 정상인지 검증한다.
```

이 단계에서는 다음 작업을 하지 않는다.

- 실제 게시글 Markdown 자동 생성
- Notion 상태 변경
- 발행 URL 수정
- Git commit 또는 push
- GitHub Actions 생성
- 배포 플랫폼 설정