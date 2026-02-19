# BiblioOptima

한국어 사용자를 위한 도서 구매 의사결정 웹앱입니다.

핵심 기능:
- 다권(멀티북) 제목 검색
- 알라딘 Open API + 크롤링 오퍼 통합
- 가격/상태/배송/신뢰도 기반 추천 점수 계산
- 신간 fallback 및 설명 가능한 추천 근거
- 다권 번들 배송비 최적화

## 실행 방법

1. 의존성 설치
```bash
npm install
```

2. 환경변수 설정 (`.env.local`)
```bash
VITE_ALADIN_TTB_KEY=YOUR_ALADIN_TTB_KEY
# 선택: 실제 크롤러 API 사용 시
VITE_CRAWLER_API_BASE=http://localhost:8787
```

3. 개발 서버 실행
```bash
npm run dev
```

## 참고
- `VITE_CRAWLER_API_BASE`가 없거나 응답 실패 시 크롤링 오퍼는 제외됩니다.
- 알라딘 API 호출은 `vite.config.ts` 프록시(`/aladin-api`)를 통해 처리됩니다.
