#!/usr/bin/env bash
# 一键装好本机开发环境（Python 走 uv，Node 走 pnpm）—— Windows 用同目录的 setup.ps1。
#
# 两份脚本做的事必须一致，所以它们只写"步骤"，不写"装什么"：装什么由
# requirements-dev.txt / requirements-logs.txt 决定，改动只改那两份。
# 末尾的自检用仓库既有的 tools/common/check_prereq.py，不在这里另写一遍工具链判断。
#
# 用法：
#   ./tools/setup/setup.sh                  # 全套：Python + Node + git hook + 自检
#   ./tools/setup/setup.sh --skip-node      # 只装 Python
#   ./tools/setup/setup.sh --skip-logs      # 不装 pyulog
#   ./tools/setup/setup.sh --skip-hooks     # 不动 git 的 core.hooksPath
#   ./tools/setup/setup.sh --recreate       # 删掉现有 .venv 重建
#   ./tools/setup/setup.sh --install-uv     # 允许本脚本联网装 uv（默认只打印命令）
#   ./tools/setup/setup.sh --index-url https://mirrors.aliyun.com/pypi/simple/
set -euo pipefail

SKIP_NODE=0
SKIP_HOOKS=0
SKIP_LOGS=0
RECREATE=0
INSTALL_UV=0
PYTHON="3.11"
INDEX_URL="https://pypi.org/simple"

usage() {
    sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
    case "$1" in
    --skip-node) SKIP_NODE=1 ;;
    --skip-hooks) SKIP_HOOKS=1 ;;
    --skip-logs) SKIP_LOGS=1 ;;
    --recreate) RECREATE=1 ;;
    --install-uv) INSTALL_UV=1 ;;
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
        echo "未识别的参数：$1（用 --help 看用法）" >&2
        exit 2
        ;;
    esac
    shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# tools/setup -> tools -> 仓库根。.venv 必须在仓库根：pyrightconfig.json 写的是
# venvPath "." + venv ".venv"，换地方 knowledge/engine/ 的类型检查就会集体报 import 解析不了。
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

# ── 1. uv ────────────────────────────────────────────────────────────
step "1/6 uv（Python 侧一律由它装）"
if ! command -v uv >/dev/null 2>&1; then
    if [ "$INSTALL_UV" = "1" ]; then
        echo "  uv 不在 PATH 上，用官方安装脚本装："
        run curl -LsSf https://astral.sh/uv/install.sh | sh
        # 安装脚本把它放进 ~/.local/bin，当前 shell 的 PATH 里没有。
        export PATH="$HOME/.local/bin:$PATH"
    fi
    if ! command -v uv >/dev/null 2>&1; then
        echo "没找到 uv。装它后重跑本脚本：" >&2
        echo "    curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
        echo "  （加 --install-uv 可以让本脚本代跑这条。）" >&2
        exit 1
    fi
fi
run uv --version

# ── 2. 虚拟环境 ──────────────────────────────────────────────────────
step "2/6 Python 虚拟环境（$VENV）"
if [ -d "$VENV" ] && [ "$RECREATE" = "1" ]; then
    echo "  --recreate：删除已有 .venv"
    rm -rf "$VENV"
fi
if [ -x "$VENV_PY" ]; then
    echo "  复用现有 .venv（要重建加 --recreate）"
else
    # 显式写死 3.11：不指定的话 uv 自己挑版本，"这台机器装的哪个 Python" 会随 uv 版本漂移。
    # 3.11 与 pyproject.toml 的 target-version 对齐。
    run uv venv "$VENV" --python "$PYTHON"
fi
if [ ! -x "$VENV_PY" ]; then
    echo ".venv 建好了但找不到 $VENV_PY —— 虚拟环境不完整，加 --recreate 重来一次。" >&2
    exit 1
fi

# ── 3. Python 依赖 ───────────────────────────────────────────────────
step "3/6 Python 依赖（uv pip install）"
# 显式给 --index-url：源写死在命令里，换台机器也是同一结果（不依赖本机 pip 的配置）。
set -- pip install --python "$VENV_PY" --index-url "$INDEX_URL" -r requirements-dev.txt
if [ "$SKIP_LOGS" = "1" ]; then
    echo "  --skip-logs：跳过 requirements-logs.txt（不装 pyulog）"
else
    set -- "$@" -r requirements-logs.txt
fi
run uv "$@"

# ── 4. Node 依赖 ─────────────────────────────────────────────────────
step "4/6 Node 依赖（pnpm install）"
if [ "$SKIP_NODE" = "1" ]; then
    echo "  --skip-node：跳过"
else
    if ! command -v pnpm >/dev/null 2>&1; then
        echo "没找到 pnpm。装它后重跑：npm i -g pnpm（或 corepack enable pnpm）" >&2
        exit 1
    fi
    # 在仓库根装：根 pnpm-workspace.yaml 只列了 web，装完 web/node_modules 才有东西。
    run pnpm install
fi

# ── 5. Git hook ──────────────────────────────────────────────────────
step "5/6 Git hook 指向 .githooks"
if [ "$SKIP_HOOKS" = "1" ]; then
    echo "  --skip-hooks：跳过"
else
    # 每台机器做一次，重复执行幂等。放进脚本的理由：漏了它 pre-commit / pre-push
    # 永远不跑，而"没跑"和"跑了全绿"在 git 这边长得一模一样。
    run git config core.hooksPath .githooks
    echo "  core.hooksPath = $(git config core.hooksPath)"

    # 同 Windows 版：照 git 的方式（PATH 上的 python）真跑一次钩子里的解释器切换，
    # 核对它最终落在 .venv 上。"钩子悄悄用了另一个 Python"不报错也不失败，只能这样拦。
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
    # 必须落成文件再跑，不能用 python -c：-c 模式下 sys.argv 只有 ['-c']，
    # 而切换解释器就是把整个 argv 交给 .venv 的 python 重跑一遍，代码本身不在
    # argv 里，切完就没了。
    probe_file="$ROOT/.workbuddy/tmp/hook_probe.py"
    mkdir -p "$(dirname "$probe_file")"
    printf '%s\n' "$probe" >"$probe_file"
    hook_exec=""
    if command -v python3 >/dev/null 2>&1; then
        hook_exec=$(python3 "$probe_file" 2>/dev/null | sed -n 's/^EXEC=//p' | tail -n 1)
    elif command -v python >/dev/null 2>&1; then
        hook_exec=$(python "$probe_file" 2>/dev/null | sed -n 's/^EXEC=//p' | tail -n 1)
    else
        echo "  PATH 上没有 python，跳过钩子解释器核对"
    fi
    rm -f "$probe_file"
    if [ -z "$hook_exec" ]; then
        echo "  [WARN] 没能确认钩子切到 .venv（探测没输出），手工核对：$VENV_PY"
    elif [ "$hook_exec" = "$VENV_PY" ]; then
        echo "  钩子解释器 = .venv  $hook_exec"
    else
        echo "  [WARN] 钩子切到了别的解释器：$hook_exec（期望 $VENV_PY）"
    fi
fi

# ── 6. 自检 ──────────────────────────────────────────────────────────
step "6/6 自检（tools/common/check_prereq.py）"
if [ "$SKIP_LOGS" = "1" ]; then
    run "$VENV_PY" tools/common/check_prereq.py
else
    run "$VENV_PY" tools/common/check_prereq.py --with-logs
fi

printf '\n环境就绪。接下来：\n'
printf '  1) 复制环境变量模板：cp web/.env.example web/.env.local（填 DEEPSEEK_API_KEY）\n'
printf '  2) 起开发服务器：    pnpm web:dev\n'
printf '  3) 跑校验：          %s tools/ci/check_all.py --stage push\n' "$VENV_PY"
printf '\n'
printf '  校验要用 .venv 里的 python：check_all.py 走 sys.executable -m ruff，\n'
printf '  系统 python 里通常没装 ruff。激活方式：source .venv/bin/activate\n'
if [ "$SKIP_LOGS" != "1" ]; then
    printf '\n'
    printf '  pyulog 没钉版本（与浏览器侧 micropip 现装保持一致），已知代价：\n'
    printf '  6 条冻结基线是 1.1.0 冻的，compare_baseline.py 可能 6/6 红。\n'
    printf '  二选一：钉回 pyulog==1.1.0，或重冻基线 python tools/engine/dump_baseline.py\n'
fi
