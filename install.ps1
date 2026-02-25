# =============================================================================
# Sadais Team Claude Code Configuration Installer (Windows PowerShell)
#
# Usage:
#   irm https://raw.githubusercontent.com/sadais-org/front-end-cc-config/main/install.ps1 | iex
#
# Requires: Git for Windows, PowerShell 5+
# =============================================================================

$ErrorActionPreference = "Stop"

# ── Configuration ─────────────────────────────────────────────────────────────
$RepoUrl   = "https://github.com/sadais-org/front-end-cc-config.git"
$Branch    = "main"
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Info    { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok      { param($msg) Write-Host "[ ✓ ]  $msg" -ForegroundColor Green }
function Write-Warn    { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Fatal   { param($msg) Write-Host "[FAIL]  $msg" -ForegroundColor Red; exit 1 }
function Write-Section { param($msg) Write-Host "`n▶ $msg" -ForegroundColor White }

# ── JSON Deep Merge (team keys win on conflict) ───────────────────────────────
# Strategy: python3 → python → node → overwrite
function Invoke-MergeJson {
    param(
        [string]$ExistingPath,
        [string]$TeamPath,
        [string]$OutputPath
    )

    # Python script written to temp file to avoid quoting issues
    $PyScript = @'
import json, sys

def deep_merge(base, override):
    result = base.copy()
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = deep_merge(result[k], v)
        else:
            result[k] = v
    return result

with open(sys.argv[1], encoding='utf-8') as f:
    base = json.load(f)
with open(sys.argv[2], encoding='utf-8') as f:
    team = json.load(f)

merged = deep_merge(base, team)

with open(sys.argv[3], 'w', encoding='utf-8') as f:
    json.dump(merged, f, indent=2, ensure_ascii=False)
    f.write('\n')
'@

    $PyFile = Join-Path $env:TEMP "sadais_merge_$Timestamp.py"
    $PyScript | Out-File -FilePath $PyFile -Encoding UTF8

    try {
        # python3
        if (Get-Command python3 -ErrorAction SilentlyContinue) {
            Write-Info "Merging with python3..."
            python3 $PyFile $ExistingPath $TeamPath $OutputPath
            return
        }
        # python (Windows often registers as 'python')
        if (Get-Command python -ErrorAction SilentlyContinue) {
            Write-Info "Merging with python..."
            python $PyFile $ExistingPath $TeamPath $OutputPath
            return
        }
    } finally {
        Remove-Item $PyFile -ErrorAction SilentlyContinue
    }

    # Node.js fallback (inline — no quoting edge cases here)
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-Info "Merging with node..."
        $JsFile = Join-Path $env:TEMP "sadais_merge_$Timestamp.js"
        @'
const fs = require('fs');
const [,, ef, tf, of] = process.argv;
function dm(b, o) {
  const r = { ...b };
  for (const [k, v] of Object.entries(o)) {
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    r[k] = (k in r && isObj(r[k]) && isObj(v)) ? dm(r[k], v) : v;
  }
  return r;
}
const m = dm(JSON.parse(fs.readFileSync(ef,'utf8')), JSON.parse(fs.readFileSync(tf,'utf8')));
fs.writeFileSync(of, JSON.stringify(m, null, 2) + '\n');
'@ | Out-File -FilePath $JsFile -Encoding UTF8
        try {
            node $JsFile $ExistingPath $TeamPath $OutputPath
        } finally {
            Remove-Item $JsFile -ErrorAction SilentlyContinue
        }
        return
    }

    # Fallback: no merge tool
    Write-Warn "No python or node found — overwriting settings.json with team version (no merge)."
    Copy-Item $TeamPath $OutputPath -Force
}

# ── Main ──────────────────────────────────────────────────────────────────────
function Main {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  Sadais Team Claude Code Configuration   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    # Pre-flight check
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Fatal "git is required. Install Git for Windows (https://git-scm.com) and retry."
    }

    # Temp workspace
    $TmpDir = Join-Path $env:TEMP "sadais-cc-config-$Timestamp"
    New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

    try {
        # ── Clone ────────────────────────────────────────────────────────────
        Write-Section "Cloning configuration repository..."
        git clone --quiet --depth 1 --branch $Branch $RepoUrl "$TmpDir\repo"
        if ($LASTEXITCODE -ne 0) {
            Write-Fatal "Clone failed. Check your network connection and repo access."
        }
        $RepoDir = "$TmpDir\repo"

        New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null

        # ── 1. CLAUDE.md ─────────────────────────────────────────────────────
        Write-Section "Installing CLAUDE.md"
        $ClaudeMdPath = Join-Path $ClaudeDir "CLAUDE.md"
        if (Test-Path $ClaudeMdPath) {
            $Bak = Join-Path $ClaudeDir "CLAUDE.md.bak.$Timestamp"
            Copy-Item $ClaudeMdPath $Bak
            Write-Warn "Backed up existing CLAUDE.md → CLAUDE.md.bak.$Timestamp"
        }
        Copy-Item "$RepoDir\CLAUDE.md" $ClaudeMdPath -Force
        Write-Ok "CLAUDE.md installed"

        # ── 2. settings.json ─────────────────────────────────────────────────
        Write-Section "Installing settings.json"
        $UserSettings = Join-Path $ClaudeDir "settings.json"
        $TeamSettings = "$RepoDir\settings.json"

        if (Test-Path $UserSettings) {
            $Bak = "$UserSettings.bak.$Timestamp"
            Copy-Item $UserSettings $Bak
            Write-Warn "Backed up existing settings.json → settings.json.bak.$Timestamp"
            Invoke-MergeJson $UserSettings $TeamSettings $UserSettings
            Write-Ok "settings.json merged (team keys win on conflicts)"
        } else {
            Copy-Item $TeamSettings $UserSettings -Force
            Write-Ok "settings.json installed"
        }

        # ── 3. ccline ────────────────────────────────────────────────────────
        Write-Section "Installing ccline"
        $CclineDir = Join-Path $ClaudeDir "ccline"
        New-Item -ItemType Directory -Path $CclineDir -Force | Out-Null

        # Config files
        foreach ($f in @("config.toml", "models.toml")) {
            $src = "$RepoDir\ccline\$f"
            if (Test-Path $src) { Copy-Item $src $CclineDir -Force }
        }
        if (Test-Path "$RepoDir\ccline\themes") {
            Copy-Item "$RepoDir\ccline\themes" $CclineDir -Recurse -Force
        }

        # Windows binary (prefer .exe, fallback to Unix binary)
        if (Test-Path "$RepoDir\ccline\ccline.exe") {
            Copy-Item "$RepoDir\ccline\ccline.exe" $CclineDir -Force
            Write-Ok "ccline.exe installed"
        } elseif (Test-Path "$RepoDir\ccline\ccline") {
            Copy-Item "$RepoDir\ccline\ccline" $CclineDir -Force
            Write-Warn "ccline.exe not found; installed Unix binary (works in Git Bash / WSL only)"
        } else {
            Write-Warn "ccline binary not found for Windows — skipping"
        }

        # ── 4. skills ────────────────────────────────────────────────────────
        Write-Section "Installing skills"
        if (Test-Path "$RepoDir\skills") {
            $SkillsDir = Join-Path $ClaudeDir "skills"
            New-Item -ItemType Directory -Path $SkillsDir -Force | Out-Null
            Copy-Item "$RepoDir\skills\*" $SkillsDir -Recurse -Force
            $Count = (Get-ChildItem "$RepoDir\skills" -Directory).Count
            Write-Ok "Installed $Count skill(s)"
        } else {
            Write-Warn "No skills/ directory found — skipping"
        }

        # ── 5. output-styles ─────────────────────────────────────────────────
        Write-Section "Installing output-styles"
        if (Test-Path "$RepoDir\output-styles") {
            $StylesDir = Join-Path $ClaudeDir "output-styles"
            New-Item -ItemType Directory -Path $StylesDir -Force | Out-Null
            Copy-Item "$RepoDir\output-styles\*" $StylesDir -Recurse -Force
            $Count = (Get-ChildItem "$RepoDir\output-styles" -Filter "*.md").Count
            Write-Ok "Installed $Count output style(s)"
        } else {
            Write-Warn "No output-styles/ directory found — skipping"
        }

        # ── Done ─────────────────────────────────────────────────────────────
        Write-Host ""
        Write-Host "✨ Done! Restart Claude Code to apply changes." -ForegroundColor Green
        Write-Host "   Config dir: $ClaudeDir" -ForegroundColor Cyan
        Write-Host ""

    } finally {
        Remove-Item $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Main
