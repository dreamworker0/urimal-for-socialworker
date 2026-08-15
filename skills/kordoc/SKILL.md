---
name: kordoc
description: HWP, HWPX, PDF, XLSX, DOCX 공문서 포맷을 Markdown으로 파싱하고 양식을 채우는 스킬
---

# kordoc 문서 파싱 스킬

## 개요
이 스킬은 한국 공공기관 및 업무 환경에서 주로 사용되는 HWP 5.x, HWPX 문서를 비롯해 PDF, XLSX, DOCX 파일을 Markdown 형식으로 변환해 줍니다.
또한 문서 양식의 빈칸을 자동으로 채워넣는 기능(Form Filler)을 제공하여 서식을 100% 보존한 채로 새로운 문서를 생성할 수 있습니다.

## 핵심 기능 및 에이전트 사용법

kordoc은 Node.js 기반 CLI 도구로 동작하며, 에이전트는 **`Bash` 도구**로 파서를 직접 실행합니다.

CLI 진입점은 **이 스킬 디렉토리 기준 `scripts/kordoc/dist/cli.js`** 입니다. 설치 위치에 따라 실제 절대경로가 달라지므로(글로벌 설치는 `~/.claude/skills/kordoc/`, 프로젝트 설치는 `<프로젝트>/.claude/skills/kordoc/`), 아래 예시의 `$KORDOC`를 실제 경로로 바꿔 사용하세요.

```bash
# macOS / Linux — 글로벌 설치 기준
KORDOC="$HOME/.claude/skills/kordoc/scripts/kordoc/dist/cli.js"
```

```powershell
# Windows PowerShell — 글로벌 설치 기준
$KORDOC = "$env:USERPROFILE\.claude\skills\kordoc\scripts\kordoc\dist\cli.js"
```

### 1. 일반 문서 파싱 (Markdown 변환)
어떤 포맷이든 지정된 파일을 마크다운 형식으로 읽어옵니다.

```bash
node "$KORDOC" <입력파일_절대경로> -o <출력파일_절대경로.md>
```

*Tip: `-o` 없이 실행하면 stdout으로 마크다운 결과가 바로 출력됩니다.*

주요 옵션: `-p, --pages <range>` (페이지·섹션 범위), `--format json` (구조화 출력), `--no-header-footer` (PDF 머리글·바닥글 제거), `--silent` (진행 메시지 숨김).

### 2. 양식 채우기 (Form Filler)
공문서 양식(HWPX 등)에 특정 값을 채워넣고 새로운 파일로 저장합니다. 인자는 **템플릿 하나**만 받고, 채울 값과 출력 경로는 옵션으로 지정합니다.

```bash
# key=value 쉼표 구분
node "$KORDOC" fill <원본양식.hwpx> -f '성명=홍길동,날짜=2026-04-26' -o <출력.hwpx>

# JSON 파일로 값 전달
node "$KORDOC" fill <원본양식.hwpx> -j values.json -o <출력.hwpx>

# 채우지 않고 서식의 빈칸 목록만 먼저 확인
node "$KORDOC" fill <원본양식.hwpx> --dry-run
```

출력 포맷은 기본값이 `hwpx-preserve`(원본 스타일 보존)이며, `--format hwpx | markdown`으로 바꿀 수 있습니다.

### 3. 그 밖의 하위 명령
`watch <dir>` (디렉토리 감시·자동 변환), `mcp` (MCP 서버 실행), `setup` (AI 클라이언트 등록 마법사), `check-formula-models` (PDF 수식 OCR 모델 상태 확인).

> **문서 비교(신구조문 대비표)는 CLI 하위 명령이 아닙니다.** 라이브러리 API로만 제공되며(`compare`, `diffBlocks` — `dist/index.js`에서 import), CLI에 `diff` 명령은 없습니다.

## 에이전트 주의사항 (Agent Guidelines)
1. **절대경로 사용 권장**: 파일 입출력 경로는 절대경로로 지정하는 것이 가장 안전합니다.
2. **의존성 상태**: 실행에는 스킬 디렉토리 내 `scripts/kordoc/node_modules`가 설치돼 있어야 합니다(설치 스크립트가 수행). 빌드 산출물 `dist/`는 저장소에 동봉돼 있으므로 별도 빌드가 필요 없습니다. 소스를 수정한 경우에만 `scripts/kordoc`에서 `npm install && npm run build`를 실행하세요.
3. **PDF 입력**: `pdfjs-dist`(37MB)는 선택 peer 의존성이지만 devDependencies에도 올라 있어 설치 스크립트 실행 시 함께 설치됩니다. PDF 파싱이 `Cannot find module 'pdfjs-dist'`로 실패한다면 `scripts/kordoc`에서 `npm install pdfjs-dist`를 실행하세요.
4. HWP 문서 중 "배포용 문서"의 경우에도 Windows 환경이라면 COM 객체 폴백(Fallback)을 통해 자동으로 텍스트가 추출됩니다.
