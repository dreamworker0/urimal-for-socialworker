---
name: urimal-for-socialworker
version: "2.1.1"
description: 사회복지사가 직접 쓴 계획서·주간업무보고서 등 문서를 한덕연 선생님의 우리말 36개 항목 + 사회복지 14개 카테고리 + AI 티 두 레이어로 정밀 분석하여 자연스럽고 바른 문체로 윤문하는 오케스트레이터. v2.1부터 Fast Path(monolith 1콜) 디폴트, Strict Path(6+1인 파이프라인) 옵션. 내용은 한 글자도 건드리지 않고 문체·호응·표현만 재작성하며, 최종 결과물에 변경 이유 표를 함께 제공한다. 트리거 — "윤문해줘", "문서 다듬어줘", "이 보고서 다듬어줘", "계획서 윤문", "우리말 오류 잡아줘", "사회복지 문서 교정". 후속 작업 — "특정 항목만 다시", "이 문단만", "2차 윤문" 도 모두 이 스킬.
---

# urimal-for-socialworker — 사회복지 문서 윤문 오케스트레이터 (v2.1)

> **v2.1 변경 고지 (2026-05-10) — Fast Path 도입**
> 6+1인 파이프라인이 5,000자 입력에 25분 걸리던 문제를 upstream `im-not-ai v1.5`(monolith)에서 가져와 사회복지 도메인에 맞게 재구성했다.
>
> - **Fast 모드(디폴트)** — `urimal-monolith` 에이전트가 한 콜에서 SW 14개 카테고리 + 한덕연 36항목 + AI 티 핵심을 일괄 처리. 도구 호출 3회. 5,000자 이하 wall-clock 2~3분 목표.
> - **Strict 모드(`--strict`)** — 기존 6+1인 파이프라인 그대로(sw-pattern-detector·ai-tell-detector·korean-style-rewriter·content-fidelity-auditor·naturalness-reviewer + taxonomist·web-architect). 정밀 검증·장문(8,000자+) 처리·차별 표현 잔존 시 자동 승급.
> - **유지됨**: 사회복지 14개 카테고리 본진(sw-tell-taxonomy.md)·한덕연 36항목 원천(urimal-source.md)·6+1인 에이전트 정의(strict 백본).
> - **삭제됨**: voice profile·candidate pool·promotion-checklist·sample-collection (upstream v1.5 폐기 흡수).

## Phase 0: 컨텍스트 확인 및 모드 결정

작업 시작 시 가장 먼저 다음 한 줄을 사용자에게 출력한다.

```
urimal-for-socialworker v2.1.1 — {fast|strict} 모드 / model: {sonnet|opus} / run_id: {YYYY-MM-DD-NNN}
```

### 모드 결정 (자동)
- 사용자가 `--strict`·"정밀 모드"·"6인 파이프라인" 명시 → **strict**
- 입력 8,000자 초과 → **strict** (자동 승급 + 사용자에 1줄 고지)
- 사용자가 "특정 카테고리만 다시"·"이 문단만"·"2차 윤문" 등 부분 재실행 신호 → **strict** (자동 승급)
- 그 외 모두 → **fast (디폴트)**

### 모델 결정
- 사용자가 "정밀 모드"·"opus"·"최고 품질" 명시 → `model: "opus"` (`claude-opus-5`)
- 그 외 → `model: "sonnet"` (`claude-sonnet-5`) — 사회복지 현장 비용 효율

### run_id 결정
- 모든 경로는 **cwd 기준**. `_workspace/{YYYY-MM-DD-NNN}/`
- 기존 시퀀스 확인은 **`Glob` 도구**로 표지 파일을 매칭해 간접 조회.
  올바른 사용법: `Glob(pattern="_workspace/YYYY-MM-DD-*/01_input.txt")` → 결과에서 폴더명 추출 후 NNN 최댓값 + 1.
  주의: Glob은 디렉토리 자체는 매칭하지 못한다. 반드시 그 안의 표지 파일(`01_input.txt`)을 매칭할 것.
- 당일 폴더가 없으면 NNN = 001. 있으면 마지막 NNN + 1.

## Fast 모드 (디폴트)

### Phase 1: 입력 저장 + 사전 처리
1. cwd 기준 `_workspace/{run_id}/` 생성
2. 입력 텍스트를 `01_input.txt`에 저장
3. 첫 300자로 장르 자동 추정 (사용자 명시 시 우선)
4. (선택) `python <skill>/scripts/prepare_monolith_input.py --input 01_input.txt --genre 계획서 --output 00_metrics.json` 실행 → 결합 입력 `01_input_with_metrics.txt` 생성. 정량 점수 사전 계산으로 monolith가 도구 호출 예산을 더 효율적으로 사용. **선택 사항** — Python 미설치 환경에서는 건너뛰고 monolith가 그대로 처리.

### Phase 2: Monolith 호출
`urimal-monolith` 에이전트를 `Agent` 도구로 1회 호출.

입력:
```
input_path: <abs path>/_workspace/{run_id}/01_input.txt
quick_rules_path: <abs path>/<skill>/resources/references/quick-rules-sw.md
genre_hint: 계획서 | 보고서 | 안내문 | 공적연설 | null
```

출력 (에이전트가 직접 작성):
- `_workspace/{run_id}/final.md` — 윤문본 + 본문 끝 `<!-- URIMAL-SUMMARY -->` 메타 블록

monolith는 단일 호출 안에서 다음을 모두 수행 (자세히는 `resources/agents/urimal-monolith.md` 참조):
1. quick-rules-sw 룰북 로드 → 메모리에서 SW + 36항목 + AI 티 핵심 패턴 탐지 + 윤문 + 자체검증 7항 점검
2. 변경률 50% 초과 시 자동 롤백
3. 자체검증 위반 시 1회 부분 재실행
4. SW-14(차별·시혜) 잔존은 결정적 실패로 strict 모드 권고

### Phase 3: 결과 전달
사용자에게 다음 4~5개를 반환:
1. 한 줄 상태: `완료. 변경률 X% / 등급 Y / 자체검증 N/7 통과`
2. 윤문본 본문 (마크다운 블록)
3. URIMAL-SUMMARY의 핵심 표 (메트릭 + 카테고리 탐지 + 자체검증 + 우리말 항목 번호)
4. 등급 B 이하면 "정밀 검증이 필요하면 `--strict`로 6+1인 파이프라인" 안내
5. SW-14 잔존 시 "**차별·시혜 표현 잔존 — strict 모드 강력 권고**"

**디폴트 wall-clock 목표:** 5,000자 이하 2~3분, 8,000자 5~7분.

## Strict 모드 (`--strict` 또는 자동 승급)

기존 6+1인 파이프라인 그대로. 정밀 검증·장문 처리·SW-14 결정적 실패 시만 사용.

### Phase A: 사회복지 특화 탐지
`sw-pattern-detector` 호출 (`model: sonnet` 또는 사용자 지정) → `02a_sw_detection.json`

입력:
```
run_id: {run_id}
input_path: _workspace/{run_id}/01_input.txt
taxonomy_path: resources/references/sw-tell-taxonomy.md
urimal_source_path: resources/references/urimal-source.md
playbook_path: resources/references/sw-rewriting-playbook.md
```

### Phase B: AI 티 탐지
`ai-tell-detector` 호출 → `02b_ai_detection.json`

입력:
```
run_id: {run_id}
input_path: _workspace/{run_id}/01_input.txt
taxonomy_path: resources/references/ai-tell-taxonomy.md
genre_hint: {계획서|보고서|안내문|공적연설|null}
options: { min_severity: S2, include_document_level: true }
```

### Phase C: Finding 합산
오케스트레이터가 `02a` + `02b`를 심각도 순으로 병합 → `02_combined_detection.json`

**게이트**: `total_findings == 0` 이면 "오류 패턴이 거의 없습니다. 윤문 불필요" 메시지로 종료.

### Phase D: 윤문 (최대 3회 루프)
`korean-style-rewriter` 호출 → `03_rewrite.md` + `03_rewrite_diff.json`

입력:
```
run_id: {run_id}
input_path: _workspace/{run_id}/01_input.txt
detection_path: _workspace/{run_id}/02_combined_detection.json
playbook_path: resources/references/rewriting-playbook.md
sw_playbook_path: resources/references/sw-rewriting-playbook.md
```

**게이트**: `over_polish_warning: true` 이면 즉시 Phase E로 (감사관이 롤백 판정).

### Phase E: 병렬 검증 (에이전트 팀)
`TeamCreate`로 `urimal-review-team` 구성:
- `content-fidelity-auditor` → `04_fidelity_audit.json` (의미 동등성 13항)
- `naturalness-reviewer` → `05_naturalness_review.json` (잔존·과윤문 판정)

`TeamDelete` 후 종합 판정 매트릭스에 따라 분기:

| fidelity | naturalness | 종합 | 후속 |
|---|---|---|---|
| full_pass | accept / accept_with_note | **최종 승인** | Phase F |
| full_pass | rewrite_round_2 | **2차 윤문** | Phase D 재호출 (target finding) |
| full_pass | rollback_and_rewrite | **롤백 후 재윤문** | 윤문가에 edit 롤백 지시 |
| conditional_pass | - | **롤백된 edit만 재시도** | Phase D 재호출 |
| fail | - | **전면 재작업** | Phase D 전면 재호출 |

2차/3차 윤문 진입 시 `03_rewrite_v2.md`·`v3.md`로 버전 분리. **최대 3회 후 미해결이면 `hold_and_report`**로 사람 개입.

### Phase F: 최종 출력
1. 최종 윤문본을 `final.md`로 복사
2. 요약 리포트 `summary.md` 생성 (변경 이유 표 + 우리말 항목 번호 포함)

```markdown
## 윤문 요약

**원문 변경률**: X%  |  **품질 등급**: A/B/C/D

### 변경 내역

| # | 원문 | 수정문 | 탐지 근거 | 우리말 항목 |
|---|------|--------|----------|------------|
| 1 | (원문 span) | (수정문) | (패턴명) | (우리말 항목번호) |

### 특이사항
(롤백·재윤문 이력, 미해결 항목 등)
```

## Phase 5: 웹 확장 (옵션)

사용자가 "웹 서비스로 만들어줘" / "API 배포" 요청 시 `humanize-web-architect`를 호출 (`model: "opus"`).

산출물: `_workspace/web/01_architecture.md`·`02_api_spec.md`·`03_ux_flow.md`.

## Phase 6: 피드백 수집 (진화 루프)

결과 전달 후 사용자에게:
> "윤문 결과에서 개선할 부분이 있나요? 예) '이 카테고리가 과하게 고쳐졌다', '이 표현은 그대로 두는 게 낫다', '리듬이 부자연스럽다'"

피드백 유형별:
- 개별 edit 이의: 해당 edit 롤백 후 재윤문 (자동 strict 승급)
- 카테고리 전역 이의: 해당 카테고리 finding 재감사
- 장르 추정 오류: genre_hint 수정 후 Phase A부터 재실행
- 새 패턴 제보: 분류학자에 "taxonomy 확장 후보" 에스컬레이션

## 부분 재실행 / 후속 명령 (모두 strict 자동 승급)

| 사용자 신호 | 처리 |
|---|---|
| "특정 카테고리만 다시" | strict 모드, 해당 카테고리 finding만 Phase D 재실행 |
| "이 문단만" | strict 모드, 해당 문단만 입력으로 새 run_id 생성 |
| "2차 윤문"·"`/윤문-redo`" | 기존 run_id의 `final.md`를 새 입력으로 strict Phase D 재실행 |
| "윤문 강도 조정" | strict 모드, `min_severity` 옵션 변경 후 Phase A부터 재실행 |
| "장르 바꿔서" | `genre_hint` 변경 후 Phase A부터 재실행 |

## 옵션 (인자 끝에 자연어로)

- `장르: 계획서|보고서|안내문|공적연설` — 장르 명시 (생략 시 자동 추정)
- `강도: 보수|기본|적극` — 윤문 강도 (기본값: 기본)
- `최소심각도: S1|S2|S3` — 탐지 임계값 (기본값: S2)
- `--strict` — 6+1인 파이프라인 강제 사용
- `정밀 모드` / `opus` — 모델을 opus로 고정

## 데이터 흐름 요약

### Fast 모드 (디폴트)
```
01_input.txt
    ↓ [(선택) prepare_monolith_input.py — metrics 사전 계산]
01_input_with_metrics.txt
    ↓ [urimal-monolith — 단일 호출]
    ├ 메모리: quick-rules-sw 로드 → 탐지(SW + 36항목 + AI) → 윤문 → 자체검증 7항
    └→ final.md (URIMAL-SUMMARY 메타 블록 포함)
```

### Strict 모드
```
01_input.txt
    ↓ [sw-pattern-detector]      → 02a_sw_detection.json
    ↓ [ai-tell-detector]         → 02b_ai_detection.json
    ↓ [finding 합산]             → 02_combined_detection.json
    ↓ [korean-style-rewriter]
03_rewrite.md + 03_rewrite_diff.json
    ↓ [병렬 팀]
    ├→ [content-fidelity-auditor] → 04_fidelity_audit.json
    └→ [naturalness-reviewer]      → 05_naturalness_review.json
    ↓ [오케스트레이터 종합]
    ├→ (재작업) Phase D로 복귀 (최대 3회)
    └→ (승인) final.md + summary.md (변경 이유 표 + 우리말 항목 번호)
```

## 에이전트 호출 규칙

**모든 Agent 호출은 모델을 명시한다.**
- **기본값: `model: "sonnet"`** (`claude-sonnet-5`) — 비용 효율
- **정밀 모드: `model: "opus"`** (`claude-opus-5`) — 사용자 요청 시 또는 중요 외부 제출 문서

**에이전트 정의 위치:** Claude Code가 다음 우선순위로 자동 탐색.
1. `<cwd>/.claude/agents/` (프로젝트 로컬)
2. `~/.claude/agents/` (글로벌)
3. `<skill>/resources/agents/` (스킬 동봉)

필요 에이전트 8종:
- **fast 전용**: `urimal-monolith` (v2.1 신규)
- **strict 전용**: `sw-pattern-detector` · `ai-tell-detector` · `korean-style-rewriter` · `content-fidelity-auditor` · `naturalness-reviewer`
- **공통**: `korean-ai-tell-taxonomist` (분류 체계 유지·확장 — 별도 명령으로만 트리거) · `humanize-web-architect` (웹 확장 옵션)

## 주의 사항

- **의미 불변이 최상위 불문율.** fast·strict 모두에서 위반 즉시 롤백.
- **수치·고유명사·기관명·사업명·인용은 탐지/윤문 대상 아님.** Do-NOT list 엄수.
- **장르 이탈 금지.** 계획서가 에세이·블로그로 옮기지 않는다.
- **register 보존.** 합쇼체 입력 → 합쇼체 출력. 사회복지 공문서 표준.
- **차별·시혜 표현(SW-14) 잔존 절대 금지.** Fast에서 잔존 시 즉시 strict 승급 권고.
- **변경률 30% 초과 → 경고, 50% 초과 → 강제 중단.**

## 참고 자료

**[Fast 모드 — 슬림 룰북]**
- 사회복지 핵심 룰북: `resources/references/quick-rules-sw.md` (~200줄, SW S1·S2 + 한덕연 36항목 핵심 + AI 티 S1)
- 일반 AI 티 룰북: `resources/references/quick-rules.md` (사회복지가 아닌 일반 한글에 활용)

**[Strict 모드 — 본진]**
- 사회복지 14개 카테고리 SSOT: `resources/references/sw-tell-taxonomy.md`
- 사회복지 윤문 처방: `resources/references/sw-rewriting-playbook.md`
- 한덕연 36항목 원천: `resources/references/urimal-source.md`
- AI 티 분류 체계 v2.0: `resources/references/ai-tell-taxonomy.md` (10대분류 × 40+ 패턴, 한국 번역학계 8유형 흡수)
- 일반 윤문 처방: `resources/references/rewriting-playbook.md`
- 학술 인용 (v2.0): `resources/references/scholarship.md`

**[정량 점수 레이어 (v2.1 신규)]**
- 메트릭 계산기: `resources/references/metrics.py` (표준 라이브러리만)
- 베이스라인: `resources/references/baseline.json` (KatFish 3장르)
- 사전 처리 스크립트: `scripts/prepare_monolith_input.py`
