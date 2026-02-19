# Agent Hand-off Guide

_Last updated: 2026-02-19_

## 1) 프로젝트 목표 (한 줄)
- 다권 책 구매 시, 판매처/배송비/품질을 합쳐 최저가 조합과 의사결정 근거를 제공한다.

## 2) 현재 코드 기준 핵심 파일
- 입력/설정 UI: `components/SearchAndPreferences.tsx`
- 결과 UI: `components/AnalysisResult.tsx`
- 책 식별 교정 모달: `components/IdentityOverrideModal.tsx`
- 결정 엔진: `services/decisionSystemService.ts`
- 알라딘 API 연동: `services/aladinService.ts`
- 아마존 연동: `services/amazonService.ts`
- 크롤러 연동: `services/crawlerService.ts`
- 타입: `types.ts`
- 기본 상수/기본 설정: `constants.ts`

## 3) 실행/검증 명령
- 개발 서버: `npm run dev`
- 빌드: `npm run build`

## 4) 환경 변수
- `VITE_ALADIN_TTB_KEY`: 알라딘 API 키
- `VITE_CRAWLER_API_BASE`: 국내 판매처 크롤러 API base URL
- `VITE_AMAZON_CRAWLER_API_BASE`: 아마존 원서 크롤러 API base URL
- (예정) `VITE_AMAZON_JP_CRAWLER_API_BASE`: Amazon JP 전용 API base URL
- (예정) `VITE_JPY_KRW_RATE`: 고정 환율 fallback

## 5) 다음 에이전트가 바로 할 일
1. `docs/TASK_BOARD.md`를 먼저 열고, 미완료 태스크 중 가장 위 항목부터 처리한다.
2. 태스크 완료 즉시 커밋하고, 해당 줄 `Commit`에 해시를 기록한다.
3. 한 태스크당 한 커밋 원칙을 지킨다.
4. `npm run build` 확인 후 다음 태스크로 넘어간다.

## 5-1) 현재 우선 작업
- 알라딘 API에서 원제가 비어 있는 번역서에 대해 원서명을 자동 추정하는 fallback 파이프라인을 구현한다.
- 후보 소스는 Google Books/Open Library를 우선 사용하고, 결과는 확신도와 함께 표시한다.

## 6) 주의 사항
- 사용자 수정 파일(`vite.config.ts` 등)은 요청이 없는 한 되돌리지 않는다.
- 검색 매칭은 오탐이 발생하기 쉬우므로, ISBN/저자 우선 필터를 항상 보수적으로 유지한다.
- 배송비 로직은 반드시 "원가/묶음 반영가" 둘 다 결과에 노출되도록 유지한다.

## 7) 완료 정의 (Definition of Done)
- 태스크 체크 + 커밋 해시 기록 + 빌드 성공 + 주요 흐름 수동 검증까지 완료되어야 Done으로 간주한다.
