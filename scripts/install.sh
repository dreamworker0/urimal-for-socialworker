#!/usr/bin/env bash
# urimal-for-socialworker — 설치 스크립트 (macOS / Linux)
#
# 사용법:
#   bash scripts/install.sh                  # 글로벌 설치 (~/.claude/)
#   bash scripts/install.sh --target ./proj  # 프로젝트 설치 (./proj/.claude/)
#   bash scripts/install.sh --skip-npm       # kordoc npm install 생략
#   bash scripts/install.sh --help           # 도움말

set -euo pipefail

# ─── 설정 ───────────────────────────────────────────────────
TARGET_BASE="${HOME}"
SKIP_NPM=0
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── 인자 파싱 ──────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_BASE="$(cd "$2" && pwd)"
      shift 2
      ;;
    --skip-npm)
      SKIP_NPM=1
      shift
      ;;
    --help|-h)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "알 수 없는 옵션: $1" >&2
      exit 1
      ;;
  esac
done

CLAUDE_DIR="${TARGET_BASE}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
COMMANDS_DIR="${CLAUDE_DIR}/commands"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  urimal-for-socialworker 설치"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  소스 : ${REPO_ROOT}"
echo "  대상 : ${CLAUDE_DIR}"
echo ""

# ─── 사전 확인 ──────────────────────────────────────────────
if ! command -v claude >/dev/null 2>&1; then
  echo "⚠️  Claude Code CLI(claude)가 설치돼 있지 않습니다." >&2
  echo "    https://claude.com/claude-code 에서 설치 후 다시 실행해 주세요." >&2
  exit 1
fi

if [[ ${SKIP_NPM} -eq 0 ]] && ! command -v node >/dev/null 2>&1; then
  echo "⚠️  Node.js가 필요합니다 (kordoc 파서 실행용)." >&2
  echo "    https://nodejs.org 에서 설치하거나 --skip-npm 으로 우회하세요." >&2
  exit 1
fi

# ─── 디렉토리 준비 ──────────────────────────────────────────
mkdir -p "${SKILLS_DIR}" "${COMMANDS_DIR}"

# ─── 메인 스킬 복사 ─────────────────────────────────────────
echo "▶ 메인 스킬 복사 중..."
rm -rf "${SKILLS_DIR}/urimal-for-socialworker"
cp -R "${REPO_ROOT}/skills/urimal-for-socialworker" "${SKILLS_DIR}/urimal-for-socialworker"

# ─── kordoc 스킬 복사 ───────────────────────────────────────
echo "▶ kordoc 스킬 복사 중..."
rm -rf "${SKILLS_DIR}/kordoc"
cp -R "${REPO_ROOT}/skills/kordoc" "${SKILLS_DIR}/kordoc"

# ─── 슬래시 커맨드 복사 ──────────────────────────────────────
echo "▶ 슬래시 커맨드 복사 중..."
cp "${REPO_ROOT}/commands/윤문.md" "${COMMANDS_DIR}/윤문.md"
cp "${REPO_ROOT}/commands/윤문-redo.md" "${COMMANDS_DIR}/윤문-redo.md"

# ─── kordoc 의존성 설치 ─────────────────────────────────────
if [[ ${SKIP_NPM} -eq 0 ]]; then
  KORDOC_DIR="${SKILLS_DIR}/kordoc/scripts/kordoc"
  if [[ -f "${KORDOC_DIR}/package.json" ]]; then
    echo "▶ kordoc 런타임 의존성 설치 중 (npm install — 빌드 산출물 dist/는 동봉돼 있어 빌드는 불필요)..."
    (cd "${KORDOC_DIR}" && npm install --omit=optional --silent) || {
      echo "⚠️  npm install 실패. 수동으로 'cd ${KORDOC_DIR} && npm install' 실행 필요." >&2
    }
  fi
else
  echo "▶ --skip-npm 옵션: kordoc npm install 생략됨."
  echo "  HWP 입력을 사용하려면 다음을 실행하세요:"
  echo "    cd ${SKILLS_DIR}/kordoc/scripts/kordoc && npm install"
fi

echo ""
echo "✅ 설치 완료!"
echo ""
echo "  설치 위치 : ${CLAUDE_DIR}"
echo "  사용 방법 : 'claude' 실행 후 자연어로 요청하거나 /윤문 사용"
echo ""
echo "  예시:"
echo "    claude"
echo "    > /윤문 docs/사업계획서.hwpx"
echo "    > 이 보고서 윤문해줘:"
echo ""
