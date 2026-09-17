# 开发工具（tools/）

**人手动跑**的开发与验证工具。构建生命周期里自动执行的脚本在 `web/scripts/`
（如 `build-knowledge.mjs`，由 `pnpm dev` / `pnpm build` 前置调用）。

| 工具 | 用途 |
| --- | --- |
| `ci/` | **仓库校验的统一入口**（`python tools/ci/check_all.py`）：CI（`.github/workflows/ci.yml`）与 `.githooks/pre-push` 都只调它。分「不需要日志」与「需要日志」两组，后者云 CI 跑不了 |
| `calibrate/` | 日志规则校准与本地回归（阈值定标、数据层自检、字段探查）。见 [calibrate/README.md](calibrate/README.md) |
| `check-upload.mjs` | 浏览器端日志分析链路自检：CDP 上传 `.ulg` → 等报告渲染 → 截图 + 抓异常。用 `node tools/check-upload.mjs <ulog> <out.png> [baseUrl]` |
| `shot.mjs` | 页面截图（核对配色/布局），`node tools/shot.mjs <url> <out.png> [light\|dark] [w] [h] [full]` |
| `grab-page.mjs` | 抓取线上页面 HTML，用于比对参考站点 |
| `make-icons.mjs` / `icon-preview.mjs` | 生成与预览站点图标 |

依赖：`check-upload.mjs` / `shot.mjs` 需要已用 `--remote-debugging-port=9222`
启动的 Chrome；`calibrate/` 需要 `pip install pyulog numpy` 且 Python ≥ 3.11。
