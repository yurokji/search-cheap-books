# BiblioOptima Task Board

_Last updated: 2026-02-19_

## 운영 규칙
- 각 세부 태스크 완료 시 반드시 `git commit` 한다.
- 완료된 항목에는 상태를 `[x]`로 변경하고, 같은 줄의 `Commit`에 해시를 기록한다.
- 한 커밋에는 가능하면 한 태스크만 포함한다.
- 임시 수정(실험 코드)은 태스크 완료 전 정리하고 커밋한다.

## 진행 현황 요약
- 진행률: 65%
- 현재 집중 트랙: Amazon JP 일본어 원서 + 한국 번역서 연계 (MVP)

## Phase 0 - 문서 재정비
- [x] 프로젝트 개요 문서 재작성 (`PROJECT_OVERVIEW.md`) | Commit: `1629e8c`
- [x] 태스크 보드 문서 신설 (`TASK_BOARD.md`) | Commit: `1629e8c`
- [x] 에이전트 핸드오프 문서 신설 (`AGENT_HANDOFF.md`) | Commit: `1629e8c`

## Phase 1 - Amazon JP 연동 MVP
- [x] Amazon JP 수집 엔드포인트 스펙 반영 (`services/amazonService.ts`) | Commit: `42e8f54`
- [x] Amazon JP 원서 오퍼를 결정 엔진에 통합 (`services/decisionSystemService.ts`) | Commit: `42e8f54`
- [x] Amazon JP 상태 텍스트 매핑 강화 (`condition -> LIKE_NEW/VERY_GOOD/GOOD/ACCEPTABLE`) | Commit: `42e8f54`
- [x] 환율 반영 구조 추가 (JPY -> KRW 변환 필드/표시) | Commit: `42e8f54`
- [x] UI에 원서 소스 선택에서 Amazon JP 라벨/설명 반영 (`components/SearchAndPreferences.tsx`) | Commit: `42e8f54`
- [x] 결과 카드/테이블에 Amazon JP 출처 배지 노출 확인 (`components/AnalysisResult.tsx`) | Commit: `42e8f54`

## Phase 2 - 한국 번역서 <-> 일본어 원서 연계
- [ ] 연계 키 우선순위 정의 (ISBN > 원제 > 저자+출간년도) | Commit: `-`
- [ ] 자동 매핑 실패 시 수동 교정 UX 흐름 점검 (`IdentityOverrideModal`) | Commit: `-`
- [ ] 매핑 정확도 테스트셋 작성 (최소 30권) | Commit: `-`
- [ ] 매핑 정확도 결과 문서화 (정확도, 실패 케이스) | Commit: `-`

## Phase 3 - 안정화/성능
- [ ] 반복 검색 캐시(TTL) 추가 | Commit: `-`
- [ ] 조합 탐색 성능 점검(다권 입력 10권 기준) | Commit: `-`
- [ ] 모바일 결과 뷰 가독성 개선 | Commit: `-`

## 검증 체크리스트 (매 릴리즈 공통)
- [x] `npm run build` 성공 | Commit: `42e8f54`
- [ ] 대표 검색어 10개 수동 QA | Commit: `-`
- [ ] 잘못 매칭 교정 흐름(책 정보 수정 버튼) 정상 동작 | Commit: `-`
- [ ] 다권 최저가 계산식/셀러 링크 노출 확인 | Commit: `-`
