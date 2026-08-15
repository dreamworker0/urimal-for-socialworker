---
description: 직전 윤문 결과를 사용자 지시에 따라 재처리 (특정 문단·카테고리·강도 재조정)
argument-hint: [재처리 지시사항 — 예: "이 문단만 다시", "사업화 문체만 더 손봐줘", "강도 낮춰줘"]
---

# /윤문-redo

직전 `/윤문` 실행 결과를 사용자 지시에 따라 부분적으로 재처리한다. `urimal-for-socialworker` 스킬의 오케스트레이터 Phase 7(피드백 수집·재처리) 흐름에 진입한다.

## 사용

```
/윤문-redo "이 문단만 다시 윤문해줘"
/윤문-redo "사업화 문체만 더 강하게 손봐줘"
/윤문-redo "관계하다 패턴만 다시"
/윤문-redo "윤문 강도 낮춰줘"
/윤문-redo "원문 톤을 더 살려줘"
/윤문-redo "2차 윤문해줘"
```

## 직전 run의 모드 판별 (먼저 수행)

가장 최근 `_workspace/{run_id}/`을 찾은 뒤, **그 run이 fast였는지 strict였는지 먼저 확인한다.** 아래 분기표는 strict 산출물(탐지 JSON·`03_rewrite.md`·`summary.md`)이 있어야 그대로 적용된다.

- `02a_sw_detection.json`이 **있으면** → strict run. 아래 분기표대로 해당 Phase만 재호출한다.
- `02a_sw_detection.json`이 **없으면** → fast run (산출물은 `01_input.txt`·`final.md` 뿐). 재호출할 중간 산출물이 없으므로 **`01_input.txt`를 입력으로 strict 모드 전체를 새로 실행**한다(오케스트레이터의 부분 재실행 → strict 자동 승급 규칙과 동일). 사용자에게 "직전 결과가 fast 모드라 정밀 재처리를 위해 strict로 다시 돌립니다" 한 줄을 고지한다.

## 처리 분기 (strict run 기준)

| 사용자 지시 | 처리 |
|------------|------|
| 특정 문단 / 특정 영역 | 해당 span만 Phase 3(`korean-style-rewriter`) 재호출 |
| 특정 카테고리 / 항목 | 해당 finding만 필터링하여 Phase 3 재호출 |
| "강도 낮춰줘" / "보수적으로" | `over_polish_threshold` 0.30 → 0.20으로, `min_severity` 한 단계 상향 후 Phase 3 재호출 |
| "원문 톤을 더 살려줘" | `over_polish_threshold` 0.15, S1만 처리 |
| "2차 윤문해줘" | 현재 `final.md`를 `01_input.txt`로 복사 후 새 run 시작 |
| 새 패턴 제보 | `korean-ai-tell-taxonomist`에 후보 등재 에스컬레이션 |

## 출력

- strict run을 부분 재호출한 경우: `_workspace/{run_id}/03_rewrite_v2.md`, 그리고 같은 run의 `summary.md`에 변경 이력 누적 기록
- fast run에서 승급했거나 "2차 윤문"으로 새 run을 시작한 경우: 새 `_workspace/{run_id}/`에 strict 산출물 일습(`final.md` + `summary.md`)을 생성
- 두 경우 모두 사용자에게 변경된 부분 diff와 변경률을 보고
