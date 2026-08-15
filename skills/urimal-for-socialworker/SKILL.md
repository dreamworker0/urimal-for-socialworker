---
name: urimal-for-socialworker
description: 사회복지사가 쓴 계획서·주간업무보고서 등 문서를 한덕연 선생님의 우리말 36항목 + 사회복지 14개 카테고리 + AI 티 두 레이어로 윤문해주는 스킬. v2.1 Fast Path(monolith 1콜) 디폴트, Strict(6+1인 파이프라인) 옵션. 트리거 — "이 문서 윤문해줘", "계획서 다듬어줘", "보고서 우리말 교정", "사회복지 문서 윤문", "우리말 답게 고쳐줘".
---

# urimal-for-socialworker — 사회복지 문서 전문 윤문 하네스 (v2.1)

## 프로젝트 개요

사회복지사가 직접 작성한 한글 문서를 **한덕연 선생님의 우리말 36항목** + **사회복지 14개 카테고리** + **AI 티(번역투·관용구·구조)** 세 레이어로 정밀 분석하여 자연스럽고 바른 문체로 다듬는 스킬.

- 호응 오류, 논리 오류, `관계하다`·`고민하다`·`해 주다` 오남용, 사업화 문체, 수동태 남발, 차별·시혜 표현 등 사회복지 문서에 자주 나타나는 패턴을 탐지·교정.
- **내용은 한 글자도 건드리지 않고** 문체·표현·호응만 재작성.
- 최종 결과물에 **무엇을 왜 바꿨는지** 변경 이유 표를 함께 제공하여 글쓰기 공부에 도움.

## v2.1 — Fast Path 도입

upstream `epoko77-ai/im-not-ai v1.5`의 monolith 아키텍처를 사회복지 도메인에 맞게 재구성:

- **Fast 모드(디폴트)** — `urimal-monolith` 1콜에 SW + 36항목 + AI 티 핵심을 일괄 처리. 도구 호출 3회. **5,000자 wall-clock 2~3분**.
- **Strict 모드(`--strict` 또는 자동 승급)** — 기존 6+1인 파이프라인. 8,000자+, 정밀 검증, 부분 재실행, SW-14 차별 표현 잔존 시.

기존 v2.0의 6+1인 파이프라인 대비 약 **86% 시간 단축**, **모델 호출 비용 1/6 수준**.

## 철칙

1. **의미 불변** — 사실·주장·수치·날짜·고유명사·기관명·사업명·인용은 100% 원문 보존.
2. **근거 기반** — 모든 변경은 탐지 finding에 연결. 탐지 없는 구간은 건드리지 않음.
3. **장르 유지** — 계획서를 에세이로, 보고서를 칼럼으로 옮기지 않음.
4. **register 보존** — 합쇼체 입력 → 합쇼체 출력. 사회복지 공문서 표준.
5. **차별·시혜 표현(SW-14) 절대 잔존 금지** — Fast에서 잔존 시 즉시 strict 승급 권고.
6. **과윤문 금지** — 변경률 30% 초과 시 경고, 50% 초과 시 강제 중단.
7. **교육 목적 유지** — final.md / summary.md에 우리말 항목 번호와 변경 이유 반드시 포함.

## 디렉토리 구조

```
skills/urimal-for-socialworker/
├── SKILL.md                              # 본 파일 — 진입점
├── resources/
│   ├── agents/
│   │   ├── urimal-monolith.md           # [v2.1 신규] Fast Path 단일 호출 에이전트
│   │   ├── humanize-monolith.md         # [v2.1 신규] 일반 한글 monolith (참조용)
│   │   ├── sw-pattern-detector.md       # 우리말 36항목 탐지기 (strict)
│   │   ├── ai-tell-detector.md          # AI 티 탐지기 (strict)
│   │   ├── korean-style-rewriter.md     # 윤문가 (strict)
│   │   ├── content-fidelity-auditor.md  # 의미 감사관 (strict)
│   │   ├── naturalness-reviewer.md      # 자연스러움 리뷰어 (strict)
│   │   ├── korean-ai-tell-taxonomist.md # 분류 체계 관리자
│   │   └── humanize-web-architect.md    # 웹 확장용
│   └── references/
│       ├── quick-rules-sw.md            # [v2.1 신규] Fast 모드 슬림 룰북 (사회복지)
│       ├── quick-rules.md               # [v2.1 신규] 일반 한글 슬림 룰북
│       ├── sw-tell-taxonomy.md          # 사회복지 14개 카테고리 SSOT
│       ├── sw-rewriting-playbook.md     # 사회복지 윤문 처방
│       ├── urimal-source.md             # 한덕연 36항목 원천 자료
│       ├── ai-tell-taxonomy.md          # [v2.1 갱신] v2.0 AI 티 분류 체계 (한국 번역학계 8유형 흡수)
│       ├── rewriting-playbook.md        # 일반 윤문 처방 (v2.0)
│       ├── scholarship.md               # [v2.1 신규] 학술 인용 (Toral 2019, 김도훈 2009 등)
│       ├── metrics.py                   # [v2.1 신규] 정량 점수 계산기
│       ├── baseline.json                # [v2.1 신규] KatFish 3장르 baseline
│       └── web-service-spec.md          # 웹 확장 스펙
└── scripts/
    ├── orchestrator.md                  # 오케스트레이터 (fast/strict 분기)
    ├── prepare_monolith_input.py        # [v2.1 신규] monolith 사전 처리
    └── make_thumbnail.py
```

런타임 산출물 (cwd 기준 `_workspace/{run_id}/`):
- Fast: `final.md` (URIMAL-SUMMARY 메타 블록 포함)
- Strict: `01_input.txt` → `02a/02b_detection.json` → `02_combined_detection.json` → `03_rewrite.md` → `04_fidelity_audit.json` + `05_naturalness_review.json` → `final.md` + `summary.md`

## 모드별 데이터 흐름

### Fast 모드 (디폴트)
```
입력 → urimal-monolith (1콜)
        ├ Read 입력
        ├ Read quick-rules-sw
        ├ 메모리: 탐지 + 윤문 + 자체검증 7항
        └ Write final.md (URIMAL-SUMMARY 메타 포함)
```

### Strict 모드
```
입력
  ↓ [sw-pattern-detector]   → 02a_sw_detection.json
  ↓ [ai-tell-detector]      → 02b_ai_detection.json
  ↓ [korean-style-rewriter] → 03_rewrite.md
  ↓ [병렬 팀]
  ├→ [content-fidelity-auditor]  → 04_fidelity_audit.json
  └→ [naturalness-reviewer]      → 05_naturalness_review.json
  ↓ 종합 판정 → final.md + summary.md
```

## 심각도 / 품질 등급

**심각도**
- **S1 결정적**: 한 번만 나와도 오류 확신. 무조건 수정.
- **S2 강함**: 1~2회 허용, 3회+ 반복 시 수정.
- **S3 약함**: 다른 패턴과 중첩될 때만 수정.

**품질 등급 (Fast 자가 채점 / Strict 검증 후)**
- **A**: S1 0건, S2 2건 이하, 변경률 10~25%, 자체검증 7/7
- **B**: S1 0건, S2 4건 이하, 자체검증 6항+ 통과
- **C**: S1 1~2건 또는 자체검증 5항 이하 — strict 모드 권고
- **D**: S1 3+ 또는 SW-14 잔존 또는 변경률 50% 초과 — 사람 검토

## 사용 방법

### 1. 자연어 트리거

```
이 계획서 윤문해줘:

[계획서 본문 또는 파일 경로]
```

자동 발동 표현: "보고서 다듬어줘", "사회복지 문서 교정", "우리말 답게 고쳐줘" 등.

### 2. 슬래시 커맨드

- `/윤문 [텍스트 또는 파일 경로]` — Fast 모드 디폴트
- `/윤문 ... --strict` — 6+1인 파이프라인 강제
- `/윤문 ... 정밀 모드` — 모델을 opus로 고정
- `/윤문-redo [지시사항]` — 직전 결과를 사용자 지시에 따라 재처리 (자동 strict)

### 3. 모델 정책

- **기본값**: `claude-sonnet-5` (사회복지 현장 비용 효율)
- **정밀 모드**: `claude-opus-5` — 외부 제출 보고서·시군구 제출 사업계획서. 트리거: "정밀 모드", "opus로"

### 4. HWP·HWPX 입력

본 리포의 `kordoc` 스킬이 HWP·HWPX·PDF·XLSX·DOCX를 마크다운으로 변환한다. 사회복지 현장에서 HWP가 표준이므로 함께 설치 권장.

## 주요 금기

- 수치·단위·날짜·금액 변경 금지
- 고유명사·기관명·사업명·인명 변경 금지
- 큰따옴표 인용문 내부 변경 금지
- 법률 조문·학술 개념어 임의 치환 금지 (임파워먼트·사례관리·슈퍼비전 등)
- 새로운 주장·사실·예시 추가 금지
- 원문에 있던 정보 누락 금지
- **차별·시혜·권위적 표현(SW-14)을 그대로 두는 일** — 사회복지 도메인 결정적 실패

## 참고

**[Fast 모드]**
- 사회복지 슬림 룰북: `resources/references/quick-rules-sw.md`
- 일반 한글 슬림 룰북: `resources/references/quick-rules.md`

**[Strict 모드 본진]**
- 사회복지 14개 카테고리: `resources/references/sw-tell-taxonomy.md`
- 사회복지 윤문 처방: `resources/references/sw-rewriting-playbook.md`
- 한덕연 36항목 원천: `resources/references/urimal-source.md`
- AI 티 v2.0 본진: `resources/references/ai-tell-taxonomy.md`
- 일반 윤문 처방: `resources/references/rewriting-playbook.md`
- 학술 인용: `resources/references/scholarship.md`

**[정량 점수 레이어]**
- 메트릭 계산기: `resources/references/metrics.py`
- 베이스라인: `resources/references/baseline.json`
- 사전 처리 스크립트: `scripts/prepare_monolith_input.py`
