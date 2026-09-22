# e2e 自检在触发浏览器端解析后卡死（CDP 渲染进程无响应）—— 复现与排查交接

> 状态：**未定位根因，怀疑 Chrome headless 运行时随复用退化，或 dev 下 Worker 按需编译与跨源脚本加载的交互。**
> 业务逻辑本身已独立验证通过（见文末「重要：不影响的结论」），本问题只阻塞**自动化 e2e 冒烟脚本**。

## 1. 现象

`tools/browser/check-upload.mjs` 通过 CDP（Chrome DevTools Protocol）驱动无头 Chrome 做端到端自检：
打开 `/analyze` → 清空本机历史（绕过「此前已分析过」去重）→ 把一个真实 `.ulg` 塞进
`<input type="file">` 并派发 `change` → 等待报告渲染 → 截图。

在 `DOM.setFileInputFiles` + 派发 `change` 成功（返回正常）之后约 **1–3 秒**，该标签页的
**渲染进程对 CDP 永久无响应**：

- 之后任意 `Runtime.evaluate`（哪怕表达式只是 `1`）永不回包（我加了 5–8 秒超时，必然触发）；
- 同一 target 上 `Page.navigate`、`Debugger.pause` 也都不返回；
- 新开的 `about:blank` / 其它标签页一切正常，浏览器级 endpoint（`/json/version`、
  `Target.getTargets`）正常 —— 所以不是 Chrome 整体挂了，是**这一个渲染目标卡死**；
- 卡死标签只能 `GET /json/close/<id>` 关掉；
- 页面上看不到 `worker.onerror` 会设置的「本地解析引擎加载失败」文案（但渲染进程已冻住，
  文案也读不出来）。

## 2. 环境

- Windows 10，Chrome `152.0.7977.84`，启动方式：

  ```shell
  chrome.exe --headless=new --remote-debugging-port=9222 --disable-gpu --hide-scrollbars \
    --user-data-dir=C:/Users/zhanfuyu/AppData/Local/Temp/cdp-profile about:blank
  ```

- Node `v22.22.3`（CDP 走原生 `WebSocket`，无 puppeteer）
- Next.js `16.3.5`（App Router + **Turbopack dev**，`next dev`，localhost:3000）
- 浏览器端引擎：Pyodide `v0.27.7`（从 `https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`
  动态加载）跑在 **module worker**（`web/workers/pyodide-px4log-worker.ts`）里，解析在 worker 线程，
  主线程只接收结果并渲染（含 plotly 图表）。
- 测试日志：`tools/calibrate/logs/ce302d3b-06bc-43ab-9c2a-027d29fcefd3.ulg`（约 9.5 MB 量级）

## 3. 复现步骤

```bash
# 1) 起 dev（pnpm dev 会先跑 node scripts/build-knowledge.mjs）
cd web && pnpm dev

# 2) 用上面的命令行起 headless Chrome（远程调试 9222）

# 3) 跑 e2e（脚本会自己开一个干净标签页、清历史、上传、等结果、截图）
node tools/browser/check-upload.mjs \
  tools/calibrate/logs/ce302d3b-06bc-43ab-9c2a-027d29fcefd3.ulg /tmp/shot.png
```

典型输出（在「已清空本机历史」之后再无任何进展，直到外部超时杀进程）：

```text
新标签页: 49C60F31…
页面已 hydrate（等待 0.5s）
页面: /analyze
已清空本机历史（强制重新解析）；加 keep-history 参数可保留
…（永久挂起；实测此时该 target 连 1+1 都不返回）
```

最小手动 CDP 序列（不依赖 check-upload，用任意 ws 客户端即可复现/对照）：
`Page.enable / DOM.enable / Runtime.enable` →
`Emulation.setDeviceMetricsOverride{1440,1300,deviceScaleFactor:2}` →
`Page.navigate /analyze` → 等 input hydrate →
清 `localStorage` + `awaitPromise` 删 IndexedDB →
`DOM.getDocument/querySelector/setFileInputFiles` →
`dispatchEvent(new Event('change'))` → 1–3 秒后所有 evaluate 无响应。

## 4. 关键矛盾（重要）

同一套手动 CDP 序列（含 `deviceScaleFactor:2`、清 IndexedDB、setFileInputFiles、change），
在排查早期**连续成功多次**：报告完整渲染、F04/F05 结论正确、视口截图 90–300ms 返回。
之后同样的脚本开始**稳定卡死**。即：不是 100% 确定性复现，存在「随时间/运行次数退化」特征。

## 5. 已排除 / 已修

- **Pyodide CDN 不可达**：排除。`curl` 拉 `pyodide.js` / `pyodide.asm.wasm` 均 200、<1s。
- **dev server 挂了**：排除。卡顿时 `curl localhost:3000/analyze` 仍 200。
- **去重捷径导致根本没解析**：已修。脚本现在会清 localStorage + IndexedDB；
  调试时能看到 UI 阶段从「加载 Pyodide → 安装 pyulog → 解析日志」正常推进。
- **`Page.captureScreenshot({captureBeyondViewport:true})` 堵死 CDP 队列**：已修。
  长报告整页截图曾永不返回、把该 target 后续命令全堵住；已改成视口截图
  （在存活页面上实测 90ms 返回）。但当前的卡死发生在**截图之前的解析阶段**，是另一个问题。
- **复用残留调试状态的旧标签页**：脚本已改为每次 `/json/new` 开全新标签；无效。
- **标签直接开 `/analyze` 又 navigate 一次的双加载竞态**：改成从 `about:blank` 单次导航；无效。
- **删 IndexedDB 没等完成的竞态**：改成 `Runtime.evaluate{awaitPromise:true}` 等删除结束；无效。
- **多次 setFileInputFiles 重试导致重复解析**：首个 change 之后 target 就已不响应，与重试无关。

## 6. 建议的排查方向（按优先级）

1. **完全重启 Chrome（全新临时 `--user-data-dir`，不是只关标签页）后，立刻只跑一次
   `check-upload.mjs`**。排查期间我反复跑了几十次、且多次在中途强杀 node 客户端，
   怀疑 headless 运行时/共享线程或 Turbopack HMR 连接累积退化。若重启后首跑恢复，
   说明与「复用 + 强杀」有关，需要让脚本在结束/超时时可靠关闭标签并避免强杀。
2. **去掉 `--headless=new`（用有头 Chrome）跑同一条链路**，判断是否 headless 特有
   （`--disable-gpu` 软件合成 + plotly/canvas 是常见嫌疑，尽管本次卡死早于图表渲染）。
3. 重启 `next dev`，排除 Turbopack dev 对 module worker（
   `new Worker(new URL('../workers/pyodide-px4log-worker.ts', import.meta.url), {type:'module'})`，
   按需经 `turbopack-worker-[client-fs]` 编译）的劣化状态。
4. 用 `Target.setAutoAttach` 抓到 Pyodide worker target，在其 Runtime 里埋点/收 console，
   确认卡顿时 worker 是否还活着、停在哪一步（加载 pyodide.js / micropip / pyulog / 执行 Python）。
5. 用生产构建（`pnpm build && pnpm start`）替代 dev 跑同一 e2e：若生产不复现，
   根因锁定在 Turbopack dev 的 worker/HMR 通道。
6. 若确认是跨源 `import(/* webpackIgnore */ cdn.../pyodide.js)` 在 dev worker 里的问题，
   可改成本地托管 Pyodide（项目本来就计划放 EdgeOne Blob）再试。

## 7. 重要：不影响的结论（业务侧）

本次真正要交付的「检查规则迁移到一经验一个 YAML」并不依赖这个 e2e 脚本，已分别验证：

- 5 个真实日志的**冻结基线**逐条逐字段完全一致
  （`python tools/calibrate/compare_baseline.py` 全绿）；
- 对**生成产物**实际执行（不只是语法）通过
  （`python tools/calibrate/check-artifact.py`）；
- 浏览器 Pyodide 端有过一次完整成功解析，F04「电芯电压严重过低 3.339 V/cell critical」、
  F05「电池剩余电量极低 8% critical」均正确渲染。

即：规则引擎是对的；待修的是这个 CDP 冒烟脚本所依赖的 headless 运行时稳定性。
