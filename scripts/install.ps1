# urimal-for-socialworker — 설치 스크립트 (Windows PowerShell)
#
# 사용법:
#   .\scripts\install.ps1                       # 글로벌 설치 (~\.claude\)
#   .\scripts\install.ps1 -Target .\proj        # 프로젝트 설치 (.\proj\.claude\)
#   .\scripts\install.ps1 -SkipNpm              # kordoc npm install 생략

[CmdletBinding()]
param(
    [string]$Target = $env:USERPROFILE,
    [switch]$SkipNpm
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$ClaudeDir = Join-Path $Target '.claude'
$SkillsDir = Join-Path $ClaudeDir 'skills'
$CommandsDir = Join-Path $ClaudeDir 'commands'

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  urimal-for-socialworker 설치"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  소스 : $RepoRoot"
Write-Host "  대상 : $ClaudeDir"
Write-Host ""

# ─── 사전 확인 ──────────────────────────────────────────────
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  Claude Code CLI(claude)가 설치돼 있지 않습니다." -ForegroundColor Yellow
    Write-Host "    https://claude.com/claude-code 에서 설치 후 다시 실행해 주세요." -ForegroundColor Yellow
    exit 1
}

if (-not $SkipNpm -and -not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  Node.js가 필요합니다 (kordoc 파서 실행용)." -ForegroundColor Yellow
    Write-Host "    https://nodejs.org 에서 설치하거나 -SkipNpm 옵션으로 우회하세요." -ForegroundColor Yellow
    exit 1
}

# ─── 디렉토리 준비 ──────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null
New-Item -ItemType Directory -Force -Path $CommandsDir | Out-Null

# ─── 메인 스킬 복사 ─────────────────────────────────────────
Write-Host "▶ 메인 스킬 복사 중..."
$MainSkillTarget = Join-Path $SkillsDir 'urimal-for-socialworker'
if (Test-Path $MainSkillTarget) {
    Remove-Item -Recurse -Force $MainSkillTarget
}
Copy-Item -Recurse (Join-Path $RepoRoot 'skills\urimal-for-socialworker') $MainSkillTarget

# ─── kordoc 스킬 복사 ───────────────────────────────────────
Write-Host "▶ kordoc 스킬 복사 중..."
$KordocTarget = Join-Path $SkillsDir 'kordoc'
if (Test-Path $KordocTarget) {
    Remove-Item -Recurse -Force $KordocTarget
}
Copy-Item -Recurse (Join-Path $RepoRoot 'skills\kordoc') $KordocTarget

# ─── 슬래시 커맨드 복사 ──────────────────────────────────────
Write-Host "▶ 슬래시 커맨드 복사 중..."
Copy-Item (Join-Path $RepoRoot 'commands\윤문.md') (Join-Path $CommandsDir '윤문.md') -Force
Copy-Item (Join-Path $RepoRoot 'commands\윤문-redo.md') (Join-Path $CommandsDir '윤문-redo.md') -Force

# ─── kordoc 의존성 설치 ─────────────────────────────────────
if (-not $SkipNpm) {
    $KordocPkgDir = Join-Path $SkillsDir 'kordoc\scripts\kordoc'
    if (Test-Path (Join-Path $KordocPkgDir 'package.json')) {
        Write-Host "▶ kordoc 런타임 의존성 설치 중 (npm install — 빌드 산출물 dist/는 동봉돼 있어 빌드는 불필요)..."
        Push-Location $KordocPkgDir
        try {
            & npm install --omit=optional --silent
            if ($LASTEXITCODE -ne 0) {
                Write-Host "⚠️  npm install 실패. 수동으로 다음을 실행하세요:" -ForegroundColor Yellow
                Write-Host "    cd $KordocPkgDir; npm install" -ForegroundColor Yellow
            }
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Host "▶ -SkipNpm 옵션: kordoc npm install 생략됨."
    Write-Host "  HWP 입력을 사용하려면 다음을 실행하세요:"
    Write-Host "    cd $SkillsDir\kordoc\scripts\kordoc; npm install"
}

Write-Host ""
Write-Host "✅ 설치 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "  설치 위치 : $ClaudeDir"
Write-Host "  사용 방법 : 'claude' 실행 후 자연어로 요청하거나 /윤문 사용"
Write-Host ""
Write-Host "  예시:"
Write-Host "    claude"
Write-Host "    > /윤문 docs\사업계획서.hwpx"
Write-Host "    > 이 보고서 윤문해줘:"
Write-Host ""
