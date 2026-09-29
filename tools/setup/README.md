# Dev environment setup (tools/setup)

One command to set up the full dev environment. Python via **uv**, Node via `pnpm`, with a self-check at the end to verify the toolchain works.

```powershell
# Windows (PowerShell 5.1+)
.\tools\setup\setup.ps1
```

```bash
# Linux / macOS / WSL
./tools/setup/setup.sh
```

Both scripts do the same steps. What to install is defined in `requirements-dev.txt` at the repo root.

## Steps

| Step | Action                                                                                       | Result                         |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Locate `uv` (prints install command if missing; `-InstallUv` / `--install-uv` auto-installs) | PATH                           |
| 2    | `uv venv .venv --python 3.11` (reuse if exists)                                              | repo root `.venv`              |
| 3    | `uv pip install -r requirements-dev.txt`                                                     | `.venv`                        |
| 4    | `pnpm install`                                                                               | repo root (workspace → `web/`) |
| 5    | `git config core.hooksPath .githooks`                                                        | local `.git/config`            |
| 6    | Self-check: built-in probes (ruff / pytest / numpy / pyulog / yaml / node / tsc / next)      | —                              |

Step 6 is **self-contained**: probe logic is inline—no external scripts or config files. It only answers "do the installed tools work?"—it is NOT a full check. Full checks (prettier / eslint / markdownlint / pyright / pytest / guards / …) belong to `tools/ci/check_all.py`.

Common flags (same names, PascalCase on Windows, kebab-case on POSIX):

| Flag                          | Effect                                            |
| ----------------------------- | ------------------------------------------------- |
| `-SkipNode` / `--skip-node`   | Python only                                       |
| `-SkipHooks` / `--skip-hooks` | Skip git `core.hooksPath`                         |
| `-Recreate` / `--recreate`    | Delete existing `.venv` and recreate              |
| `-CheckOnly` / `--check-only` | Skip install steps, self-check only               |
| `-IndexUrl` / `--index-url`   | Set PyPI index, default `https://pypi.org/simple` |

## Why uv

- **No need to pre-install Python**: `uv venv --python 3.11` fetches its own 3.11 if needed.
- **Ignores local pip config**: `pip.ini` aliases (e.g. HTTP mirrors) are not read by uv. The script explicitly passes `--index-url` for reproducible results.
- **Command IS environment**: `uv pip install --python .venv/...` explicitly targets the venv—no reliance on implicit "which venv is activated?"

## After setup

- Copy env template: `cp web/.env.example web/.env.local` (fill `DEEPSEEK_API_KEY`)
- Start dev server: `pnpm web:dev`
