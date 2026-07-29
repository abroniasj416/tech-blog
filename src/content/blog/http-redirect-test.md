---
title: "HTTP Redirect 테스트"
description: "HTTP Redirect 동작을 설명하는 테스트 글입니다."
pubDate: "2026-07-29"
category: "Network"
tags:
  - "HTTP"
  - "Redirect"
notionPageId: "3ac410cd-c737-80e1-bb31-c132523fbbb6"
---

<!-- notion-sync: generated -->

## HTTP Redirect란?
HTTP Redirect는 서버가 클라이언트에게 다른 URL로 이동하도록 안내하는 방식입니다.
### 주요 상태 코드
- 301: 영구 이동
- 302: 임시 이동
- 307: HTTP 메서드를 유지하는 임시 이동
```plain text
location /old {
    return 301 /new;
}
```
