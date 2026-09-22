# 开发工具（tools/）

**人手动跑**的开发与验证工具。构建生命周期里自动执行的脚本在 `web/scripts/`
（如 `build-knowledge.mjs`，由 `pnpm dev` / `pnpm build` 前置调用）。

| 工具         | 用途                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci/`        | **仓库校验的统一入口**（`python tools/ci/check_all.py`）：CI（`.github/workflows/ci.yml`）与 `.githooks/pre-push` 都只调它。分「不需要日志」与「需要日志」两组，后者云 CI 跑不了                                                                                        |
| `calibrate/` | 日志规则校准与本地回归（阈值定标、数据层自检、字段探查）。见 [calibrate/README.md](calibrate/README.md)                                                                                                                                                                 |
| `px4/`       | PX4 上游同步：`sync_px4_msg.py`（固件消息/字段字典）、`download_px4_logs.py`（下载公开日志）、`fetch_pyodide_assets.py`（自托管 Pyodide 资源）                                                                                                                          |
| `browser/`   | 驱动本机 headless Chrome（CDP）的站点工具：截图 `shot.mjs`、抓线上页 `grab-page.mjs`、生成/预览图标 `make-icons.mjs` / `icon-preview.mjs`、日志分析链路自检 `check-upload.mjs` / `check-restore.mjs`。见 [browser/e2e-cdp-hang-repro.md](browser/e2e-cdp-hang-repro.md) |

依赖：`browser/` 下脚本需已用 `--remote-debugging-port=9222` 启动的 Chrome；
`calibrate/` 与 `px4/` 需 `pip install pyulog numpy` 且 Python ≥ 3.11。
