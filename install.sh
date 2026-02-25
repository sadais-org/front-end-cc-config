#!/usr/bin/env bash
# =============================================================================
# Sadais Team Claude Code Configuration Installer
# Supports: macOS · Linux · Windows (Git Bash / MSYS2 / Cygwin)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/sadais-org/front-end-cc-config/main/install.sh | bash
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
REPO_URL="https://github.com/sadais-org/front-end-cc-config.git"
BRANCH="main"
CLAUDE_DIR="${HOME}/.claude"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
ok()      { printf "${GREEN}[ ✓ ]${NC}  %s\n" "$*"; }
warn()    { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
fatal()   { printf "${RED}[FAIL]${NC}  %s\n" "$*" >&2; exit 1; }
section() { printf "\n${BOLD}▶ %s${NC}\n" "$*"; }

# ── OS Detection ──────────────────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin*)               echo "mac"     ;;
    Linux*)                echo "linux"   ;;
    MSYS*|MINGW*|CYGWIN*)  echo "windows" ;;
    *)                     fatal "Unsupported OS: $(uname -s)" ;;
  esac
}

# ── JSON Deep Merge (team keys win on conflict) ───────────────────────────────
# Strategy: python3 → node → overwrite
merge_json() {
  local existing="$1" team="$2" output="$3"

  if command -v python3 &>/dev/null; then
    info "Merging with python3..."
    python3 - "$existing" "$team" "$output" << 'PYEOF'
import json, sys

def deep_merge(base, override):
    """Recursively merge; override wins on key conflicts."""
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
PYEOF
    return
  fi

  if command -v node &>/dev/null; then
    info "Merging with node..."
    node - "$existing" "$team" "$output" << 'JSEOF'
const fs = require('fs');
const [,, ef, tf, of] = process.argv;

function deepMerge(base, override) {
  const result = { ...base };
  for (const [k, v] of Object.entries(override)) {
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    result[k] = (k in result && isObj(result[k]) && isObj(v))
      ? deepMerge(result[k], v)
      : v;
  }
  return result;
}

const base   = JSON.parse(fs.readFileSync(ef, 'utf8'));
const team   = JSON.parse(fs.readFileSync(tf, 'utf8'));
const merged = deepMerge(base, team);

fs.writeFileSync(of, JSON.stringify(merged, null, 2) + '\n');
JSEOF
    return
  fi

  # Fallback: no merge tool available
  warn "python3 and node not found — overwriting settings.json with team version (no merge)."
  cp "$team" "$output"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  printf "\n${BOLD}╔══════════════════════════════════════════╗${NC}\n"
  printf "${BOLD}║  Sadais Team Claude Code Configuration   ║${NC}\n"
  printf "${BOLD}╚══════════════════════════════════════════╝${NC}\n\n"

  # Pre-flight check
  command -v git &>/dev/null || fatal "git is required. Install Git and retry."

  local os; os=$(detect_os)
  info "OS: $os"

  # Temp workspace (auto-cleaned on exit)
  local tmp_dir; tmp_dir=$(mktemp -d)
  trap 'rm -rf "$tmp_dir"' EXIT

  # ── Clone ────────────────────────────────────────────────────────────────
  section "Cloning configuration repository..."
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "${tmp_dir}/repo" \
    || fatal "Clone failed. Check your network connection and repo access."
  local repo="${tmp_dir}/repo"

  mkdir -p "$CLAUDE_DIR"

  # ── 1. CLAUDE.md ─────────────────────────────────────────────────────────
  section "Installing CLAUDE.md"
  local claude_md="${CLAUDE_DIR}/CLAUDE.md"
  if [[ -f "$claude_md" ]]; then
    local bak="${claude_md}.bak.${TIMESTAMP}"
    cp "$claude_md" "$bak"
    warn "Backed up existing CLAUDE.md → $(basename "$bak")"
  fi
  cp "${repo}/CLAUDE.md" "$claude_md"
  ok "CLAUDE.md installed"

  # ── 2. settings.json ─────────────────────────────────────────────────────
  section "Installing settings.json"
  local user_cfg="${CLAUDE_DIR}/settings.json"
  local team_cfg="${repo}/settings.json"

  if [[ -f "$user_cfg" ]]; then
    local bak="${user_cfg}.bak.${TIMESTAMP}"
    cp "$user_cfg" "$bak"
    warn "Backed up existing settings.json → $(basename "$bak")"
    merge_json "$user_cfg" "$team_cfg" "$user_cfg"
    ok "settings.json merged (team keys win on conflicts)"
  else
    cp "$team_cfg" "$user_cfg"
    ok "settings.json installed"
  fi

  # ── 3. ccline ────────────────────────────────────────────────────────────
  section "Installing ccline"
  local ccline_dir="${CLAUDE_DIR}/ccline"
  mkdir -p "$ccline_dir"

  # Config files (always copy, safe to overwrite)
  [[ -f "${repo}/ccline/config.toml" ]] && cp "${repo}/ccline/config.toml" "$ccline_dir/"
  [[ -f "${repo}/ccline/models.toml" ]] && cp "${repo}/ccline/models.toml" "$ccline_dir/"
  [[ -d "${repo}/ccline/themes"      ]] && cp -r "${repo}/ccline/themes"   "$ccline_dir/"

  # Platform binary
  local bin_name="ccline"
  [[ "$os" == "windows" ]] && bin_name="ccline.exe"

  if [[ -f "${repo}/ccline/${bin_name}" ]]; then
    cp "${repo}/ccline/${bin_name}" "$ccline_dir/"
    chmod +x "${ccline_dir}/${bin_name}" 2>/dev/null || true
    ok "ccline binary installed (${bin_name})"
  elif [[ "$os" == "windows" && -f "${repo}/ccline/ccline" ]]; then
    # Fallback: copy the Unix binary, may work under Git Bash
    cp "${repo}/ccline/ccline" "$ccline_dir/"
    chmod +x "${ccline_dir}/ccline" 2>/dev/null || true
    warn "ccline.exe not found; installed Unix binary — works in Git Bash only"
  else
    warn "ccline binary not found for $os — skipping"
  fi

  # ── 4. skills ────────────────────────────────────────────────────────────
  section "Installing skills"
  if [[ -d "${repo}/skills" ]]; then
    mkdir -p "${CLAUDE_DIR}/skills"
    cp -r "${repo}/skills/." "${CLAUDE_DIR}/skills/"
    local count; count=$(find "${repo}/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
    ok "Installed ${count} skill(s)"
  else
    warn "No skills/ directory found — skipping"
  fi

  # ── Done ─────────────────────────────────────────────────────────────────
  printf "\n${GREEN}${BOLD}✨ Done! Restart Claude Code to apply changes.${NC}\n"
  printf "   Config dir: ${BLUE}%s${NC}\n\n" "$CLAUDE_DIR"
}

main "$@"
