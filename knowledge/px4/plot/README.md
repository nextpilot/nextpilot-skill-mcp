# plot/ —— 结果页曲线预设（一组图一个文件）

每个 YAML 描述结果页「曲线」tab 里的一组图：**读哪个 topic 的哪些字段、怎么画、参考线画在哪**。
用户加/改图只改这里，不用碰前端代码——构建期由 `web/scripts/build-knowledge.mjs` 生成
`web/lib/knowledge/plots.generated.ts`，页面读它渲染（**不经 Pyodide，纯前端**）。

## 字段

| 键 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✓ | 锚点与去重用，别改（页面里 tab 内定位靠它） |
| `title` / `description` | ✓ | 卡片标题与一句话说明 |
| `panels[]` | ✓ | 一组面板（共享时间轴） |
| `panels[].title` | ✓ | 面板标题，可用占位符 `{instance}`、`{topic}` |
| `panels[].yLabel` | ✓ | y 轴单位 |
| `panels[].topic` | ✓ | 读哪个 topic |
| `panels[].topics` | | 候选 topic 列表，取**第一个存在**的（新老固件话题改名时用，与 `topic` 二选一） |
| `panels[].instance` | | `first`（缺省，只画第一个实例）｜`all`（每个实例一个面板，如每个 IMU） |
| `panels[].op` | | **预处理算子**：图上要先换算时用（如 `{name: quat_to_euler, labels: [Roll, Pitch, Yaw]}`）。算子必须是 `engine/operators.py` 里注册的，**换算在引擎侧做，前端只画**——别在前端写数学 |
| `panels[].fields[]` | ✓ | 画哪些线。两种写法：字符串（图例=字段名）｜`{label: 中文名, fields: [候选…]}`（取第一个存在的字段，图例用 label） |
| `fields[].only_when_missing` | | 回退写法：仅当这个字段**不存在**时才画本条（如老固件没有 `hdg_test_ratio` 才画 `mag_test_ratio`） |
| `panels[].hlines[]` | | 参考线：`{value, level: ok\|warning\|critical, label}`（颜色由前端按 level 取，别在这里写色值） |

## 约定

- **字段可选**：某个字段在日志里不存在时自动跳过；若一个面板一条线都没有，该面板不显示；
  一组图一个面板都不剩，该组整体不显示（所以老固件缺话题不会报错，只是不画）。
- 这里只声明**画什么**；数据由 Worker 里的 `np_series`（LTTB 降采样；带 `op` 时先算后采样）按需取，图表交互在 `web/components/LogCharts.tsx`。
- 需要新算子（如滤波、积分、夹角）就加在 `engine/operators.py`，规则与图共用同一套。
