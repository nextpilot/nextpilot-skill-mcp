#!/usr/bin/env bash
# One-shot dev environment setup: Python via uv, Node via pnpm.
# Windows: use setup.ps1 in the same directory.
#
# What to install is decided by requirements-dev.txt; this script only
# decides where and how to install, and how to verify.
# The self-check at the end is self-contained: probe logic is inline, no
# external scripts or config files are called.
#
# Usage:
#   ./tools/setup/setup.sh                  # full: Python + Node + git hook + self-check
#   ./tools/setup/setup.sh --skip-node      # Python only

#   ./tools/setup/setup.sh --skip-hooks     # skip git core.hooksPath
#   ./tools/setup/setup.sh --recreate       # delete existing .venv and recreate
#   ./tools/setup/setup.sh --install-uv     # allow this script to install uv online (default: print command only)
#   ./tools/setup/setup.sh --check-only     # skip install steps, self-check only
#   ./tools/setup/setup.sh --index-url https://mirrors.aliyun.com/pypi/simple/
#   CI=true ./tools/setup/setup.sh          # CI mode: pip install + pnpm --frozen-lockfile + playwright
set -euo pipefail

SKIP_NODE=0
SKIP_HOOKS=0
RECREATE=0
INSTALL_UV=0
CHECK_ONLY=0
PYTHON="3.11"
INDEX_URL="https://pypi.org/simple"
IS_CI=0

usage() {
    sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//' | sed '$d'
}

while [ $# -gt 0 ]; do
    case "$1" in
    --skip-node) SKIP_NODE=1 ;;
    --skip-hooks) SKIP_HOOKS=1 ;;
    --recreate) RECREATE=1 ;;
    --install-uv) INSTALL_UV=1 ;;
    --check-only) CHECK_ONLY=1 ;;
    --ci) IS_CI=1 ;;
    --python)
        PYTHON="$2"
        shift
        ;;
    --index-url)
        INDEX_URL="$2"
        shift
        ;;
    -h | --help)
        usage
        exit 0
        ;;
    *)
        echo "Unknown argument: $1 (use --help for usage)" >&2
        exit 2
        ;;
    esac
    shift
done

if [ "${CI:-}" = "true" ] || [ "${CI:-}" = "1" ]; then
    IS_CI=1
fi
if [ "$IS_CI" = "1" ]; then
    SKIP_HOOKS=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# tools/setup -> repo root. .venv lives at repo root: pyrightconfig.json hardcodes venvPath "." + venv ".venv".
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV="$ROOT/.venv"
VENV_PY="$VENV/bin/python"

step() {
    printf '\n=== %s ===\n' "$1"
}

run() {
    printf '  > %s\n' "$*"
    "$@"
}

cd "$ROOT"

# --check-only: skip install steps (1-5), go straight to self-check.
if [ "$CHECK_ONLY" = "1" ]; then
    echo "--check-only: skipping install steps, self-check only"

elif [ "$IS_CI" = "1" ]; then
    # ── CI mode: Python/Node/pnpm already set up by actions/setup-*, use system pip ──
    PYTHON_CMD="$(command -v python3 || command -v python)"
    VENV_PY="$PYTHON_CMD"

    step "1/3 Python check tools (pip install -r requirements-dev.txt)"
    run "$PYTHON_CMD" -m pip install -r requirements-dev.txt

    step "2/3 Node dependencies (pnpm install --frozen-lockfile)"
    if [ "$SKIP_NODE" != "1" ]; then
        run pnpm install --frozen-lockfile
    else
        echo "  --skip-node: skipped"
    fi

    step "3/3 Playwright browsers"
    run pnpm exec playwright install --with-deps chromium

else

# ── 1. uv ────────────────────────────────────────────────────────────
step "1/6 uv (Python package manager)"
if ! command -v uv >/dev/null 2>&1; then
    if [ "$INSTALL_UV" = "1" ]; then
        echo "  uv not on PATH, installing via official script:"
        run curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi
    if ! command -v uv >/dev/null 2>&1; then
        echo "uv not found. Install it then re-run this script:" >&2
        echo "    curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
        echo "  (add --install-uv to let this script run that for you.)" >&2
        exit 1
    fi
fi
run uv --version

# ── 2. Virtual environment ──────────────────────────────────────────
step "2/6 Python venv ($VENV)"
if [ -d "$VENV" ] && [ "$RECREATE" = "1" ]; then
    echo "  --recreate: removing existing .venv"
    rm -rf "$VENV"
fi
if [ -x "$VENV_PY" ]; then
    echo "  reusing existing .venv (add --recreate to rebuild)"
else
    # Pin 3.11 to match pyproject.toml target-version.
    run uv venv "$VENV" --python "$PYTHON"
fi
if [ ! -x "$VENV_PY" ]; then
    echo ".venv created but $VENV_PY not found — venv is incomplete, add --recreate and retry." >&2
    exit 1
fi

# ── 3. Python dependencies ───────────────────────────────────────────
step "3/6 Python dependencies (uv pip install)"
set -- pip install --python "$VENV_PY" --index-url "$INDEX_URL" -r requirements-dev.txt
run uv "$@"

# ── 4. Node dependencies ─────────────────────────────────────────────
step "4/6 Node dependencies (pnpm install)"
if [ "$SKIP_NODE" = "1" ]; then
    echo "  --skip-node: skipped"
else
    if ! command -v pnpm >/dev/null 2>&1; then
        echo "pnpm not found. Install it then re-run: npm i -g pnpm (or corepack enable pnpm)" >&2
        exit 1
    fi
    run pnpm install
fi

# ── 5. Git hook ──────────────────────────────────────────────────────
step "5/6 Git hook (core.hooksPath -> .githooks)"
if [ "$SKIP_HOOKS" = "1" ]; then
    echo "  --skip-hooks: skipped"
else
    run git config core.hooksPath .githooks
    echo "  core.hooksPath = $(git config core.hooksPath)"

    # Ensure hooks are executable (zip downloads / abnormal umask can strip the bit).
    run chmod +x .githooks/pre-commit .githooks/pre-push .githooks/commit-msg
    echo "  hook permissions: $(ls -l .githooks/pre-commit | cut -c1-10)"

    # Verify the hook interpreter switcher lands on .venv.
    probe=$(cat <<'PY'
import sys

sys.path.insert(0, ".githooks")
import _venv_python as m


def body():
    print("EXEC=" + sys.executable)
    return 0


sys.exit(m.ensure_venv_python(body))
PY
    )
    probe_file="$ROOT/.workbuddy/tmp/hook_probe.py"
    mkdir -p "$(dirname "$probe_file")"
    printf '%s\n' "$probe" >"$probe_file"
    hook_exec=""
    if command -v python3 >/dev/null 2>&1; then
        hook_exec=$(python3 "$probe_file" 2>/dev/null | sed -n 's/^EXEC=//p' | tail -n 1)
    elif command -v python >/dev/null 2>&1; then
        hook_exec=$(python "$probe_file" 2>/dev/null | sed -n 's/^EXEC=//p' | tail -n 1)
    else
        echo "  python not on PATH, skipping hook interpreter check"
    fi
    rm -f "$probe_file"
    if [ -z "$hook_exec" ]; then
        echo "  [WARN] could not confirm hook lands on .venv (no probe output), manually check: $VENV_PY"
    elif [ "$hook_exec" = "$VENV_PY" ]; then
        echo "  hook interpreter = .venv  $hook_exec"
    else
        echo "  [WARN] hook landed on a different interpreter: $hook_exec (expected $VENV_PY)"
    fi
fi

fi  # --check-only skips install steps (1-5)

# ── 6. Self-check ─────────────────────────────────────────────────
step "6/6 Self-check (do installed tools work?)"
PRE_FAIL=0
probe() {
    local name="$1"
    shift
    local out
    if out=$("$@" 2>&1); then
        printf '  [OK]   %s\n' "$name"
    else
        printf '  [FAIL] %s\n' "$name"
        printf '%s\n' "$out" | head -3 | sed 's/^/         /'
        PRE_FAIL=$((PRE_FAIL + 1))
    fi
}
probe "ruff"   "$VENV_PY" -m ruff --version
probe "pytest" "$VENV_PY" -m pytest --version
probe "numpy"  "$VENV_PY" -c "import numpy"
probe "pyulog" "$VENV_PY" -c "import pyulog"
probe "yaml"   "$VENV_PY" -c "import yaml"
if command -v node >/dev/null 2>&1; then
    printf '  [OK]   node  %s\n' "$(command -v node)"
else
    printf '  [FAIL] node not on PATH (install Node.js 22+ and re-run)\n'
    PRE_FAIL=$((PRE_FAIL + 1))
fi
NODE_BIN="$(command -v node || true)"
probe "typescript" "$NODE_BIN" "$ROOT/web/node_modules/typescript/bin/tsc" --version
probe "next" test -f "$ROOT/web/node_modules/next/package.json"
if [ "$PRE_FAIL" -gt 0 ]; then
    echo "Self-check: $PRE_FAIL item(s) failed. Python missing: uv pip install --python \"$VENV_PY\" -r requirements-dev.txt; Node missing: pnpm install" >&2
    exit 1
fi

if [ "$IS_CI" != "1" ]; then
    printf '\nEnvironment ready. Next:\n'
    printf '  1) Copy env template: cp web/.env.example web/.env.local (fill DEEPSEEK_API_KEY)\n'
    printf '  2) Start dev server:  pnpm web:dev\n'
fi