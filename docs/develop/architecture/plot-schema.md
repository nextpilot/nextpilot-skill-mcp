# 绘图配置 schema：container + children

> 状态：设计稿（未实现）。
> 骨架取自 `knowledge/plot-template.yml`（草案），保留其分层，修订三处（§1）。
> 相关：`knowledge/px4/plot/`、`knowledge/engine/operators.py`、`knowledge/engine/engine.py:np_series()`、`web/lib/chart-presets.ts`、`web/components/LogCharts.tsx`、`web/components/LogFlightMap.tsx`

---

## 0. 骨架

一份配置 = 一屏画出来的东西：

```yaml
id: gps
title: GPS 曲线
description: 纬度 / 经度与海拔

conditions:                  # 前置条件：整份配置是否可用
  - topics: [sensor_gps, vehicle_gps_position]   # 任一存在即可

compute:                     # 派生通道：算一次，所有输出共享
  - id: att
    op: quat_to_euler
    in: [{topic: vehicle_attitude, instance: 0, fields: [q[0], q[1], q[2], q[3]]}]
    out: {roll: {label: 横滚, unit: deg}, yaw: {label: 偏航, unit: deg}}

outputs:                     # 一屏里的若干画布
  - container: axes          # 画布类型（扩展点）
    children:                # 画布上的图元
      - mode: series
```

**三条保留理由**

1. **`container` 是扩展点，不是枚举。** 将来加 `polar` / `table` / `spectrogram`，只需新增一种容器类型和它的 children 变体，其余各层不动。反过来，若按"图表种类"分别设计子 schema（曲线一套 `panels`、地图一套 `overlays`、表格再来一套），每加一种渲染器就多一套词汇、一套校验、一套示例。
2. **`container` + `children[].mode` 是判别式联合的正当用法。** 容器决定 `mode` 的合法取值域，这正是 `oneOf` + `const` 的标准写法，TypeScript 的 discriminated union 同理；非法组合由类型本身表达，不必另维护一张组合表。
   _（本文档上一版把这一条列为「硬伤」，属误判：它批评的是"两个命名空间交叉"的表象，而判别式联合本来就是这么工作的。此处更正。）_
3. **`compute` / `conditions` 归文件级，而**不是**归某个容器。** 派生通道算一次给多个输出共用；"这份日志有没有 GPS"是整份配置的属性，不属于某个容器。
   _（草案平级放在 `outputs` 旁是对的；上一版把它塞进单个输出里，反而退步。）_

---

## 1. 三处修订

### 1.1 一条线一个对象（图元内部）

草案用并行列表表达同一个图元里的多条线：

```yaml
ydata: vehicle_gps_position.lon, vehicle_gps_position.alt
style: -^, -^
label: 经度, 海拔
color: "#ff4d4f", "#409eff"
```

"经度"对应哪条线、哪个颜色，**全靠下标位置**。加第三条线要同时改四处，漏一处就**静默错位**——图例写"经度"、颜色是海拔的，而且不报错，图就是错的。逗号分隔本身也脆：字段名带下标（`q[0]`）、单位里含逗号，都会切错。

改成一条线一个对象：

```yaml
series:
  - { field: [longitude_deg, lon], label: 经度, style: { color: series-1 } }
  - { field: [altitude_msl_m, alt], label: 海拔, style: { color: series-2 } }
```

顺带 `style: -^` 这种"紧凑线型语言"（要自写解析器、写错了静默用默认样式）也换成结构字段：`{color, width, dash, marker}`。

### 1.2 容器可持有多个具名 y 轴（`axes`）

草案把轴属性挂在容器上：`ylabel` / `range` / `flipx` / `flipy`。但**同一个容器里可以放单位不同的量**——草案自己的第一个容器就同时画 lat(度)、lon(度)、alt(米)，那 `ylabel: m` 算谁的？`range: [0, 1000000, 0, 1000000]` 同理，四个裸数字靠位置表示 `[xmin, xmax, ymin, ymax]`，漏一个就错轴、不可读。

解法不是加一层"面板"，而是**让容器持有若干个具名轴**——渲染器本来就是这么建模的：Chart.js 是 `options.scales: {y, y1}` + `dataset.yAxisID`，uPlot 是 `scales`。

```yaml
- container: axes
  title: GPS
  x: time # 容器级默认，图元可覆盖
  axes:
    deg: { label: 度, range: [-180, 180] }
    m: { label: 高度 }
  children:
    - { mode: series, y: deg, series: [{ field: [latitude_deg, lat], label: 纬度 }] }
    - { mode: series, y: m, series: [{ field: [altitude_msl_m, alt], label: 海拔 }] }
```

只有一个轴时省略 `y`（图元落到默认轴），写最短形式。

`flip` 从容器移到轴上——俯仰要翻转、油门不要，这是**轴**属性不是画布属性。

### 1.3 x 与 y 对称：`TimeSeries` 与 `xyplot` 合成一个 `mode: series`

草案用 `mode` 区分"x 是时间"和"x 显式给"。但它自己的 xyplot 例子写的是：

```yaml
- mode: xyplot
  xdata: vehicle_gps_position.timestamp # ← 这就是时间，例子自证不了区别
  ydata: vehicle_gps_position.lon
```

如果 **x 和 y 都是通道引用**（§3），那么"x 是时间"只是 `x` 省略时的默认值，不需要 `mode` 区分，也不必再维护"`mode` × `x`"的合法组合表：

```yaml
- mode: series
  # x 省略 → 时间轴（即原 TimeSeries）

- mode: series
  x: { channel: volt_v } # x 是另一个通道 → 相图（即原 xyplot）
  series: [{ field: [current_a], label: 电流 }]
```

"电压 → 电流""滚转 → 俯仰"这类相图照样能画，只是它不再是一个 `mode`，而是 x 的一种取值。**同一件事只留一种写法**，也就不存在"声明了 x 又默认时间"的两套真相。

---

## 2. `compute`：文件级，输出必须具名

字段不是唯一的取值来源——一条曲线常常是运算结果。`compute` 段描述"从列到具名通道"的求值图：

```yaml
compute:
  - id: att                                   # 可选；输出引用为 att.roll
    op: quat_to_euler
    in:
      - {topic: vehicle_attitude, instance: 0, fields: [q[0], q[1], q[2], q[3]]}
    out:                                      # 名字由 YAML 给，**个数按算子的 out_arity 校验**
      roll:  {label: 横滚, unit: deg}
      pitch: {label: 俯仰, unit: deg}
      yaw:   {label: 偏航, unit: deg}

  - op: scale_series
    in:
      - {topic: battery_status, instance: 0, fields: [voltage_v]}
    factor: 0.001
    out: {volt_v: {label: 电压, unit: mV}}

  - op: interp_to                             # 节点之间可互相引用 → 支持算子链
    in:
      - {channel: att.roll}                   # 派生通道当输入
      - {topic: vehicle_attitude, instance: 0, fields: [timestamp]}
      - {topic: vehicle_attitude, instance: 0, fields: [timestamp]}
    out: {roll_aligned: {label: 横滚(对齐), unit: deg}}
```

三条硬规矩：

1. **输出必须显式命名**，名字是下游唯一的引用方式。取代今天"靠 `out_names` 与 `labels` 位置对齐"的写法（个数一旦不等就静默错位：图例写着"横滚"、曲线是偏航）。
2. **`in` / `out` 的个数按算子签名校验**。`knowledge/engine/operators.py` 的 `SIGNATURES` 里已有 `in_arity` / `out_arity` / `out_names`，构建期直接拿来卡；名字由 YAML 定，个数必须对得上。
3. **派生通道必须显式声明 `unit`**。最容易漏的一条：`knowledge/px4/meta/*.json` 的单位只对**原始列**有效，运算之后单位不会自动跟着走——`scale_series(0.001)` 之后是 mV、`hypot(ax, ay)` 是 m/s²、`quat_to_euler` 是度。**缺 `unit` 的派生通道直接构建失败**，否则 y 轴标签会撒谎。

### 2.1 不是所有运算都能当曲线

`operators.py` 里 60+ 个算子按**输出形状**分四类，只有前两类能画：

| 形状         | 例子                                               | 输出长度             | 能否进 `series`                      |
| ------------ | -------------------------------------------------- | -------------------- | ------------------------------------ |
| 逐样本标量   | `abs_values` / `hypot` / `scale_series` / `larger` | == 输入              | ✅                                   |
| 逐样本多输出 | `quat_to_euler` / `worst_named`                    | == 输入              | ✅ 每个输出一条线                    |
| 归约标量     | `max` / `percentile` / `range_of` / `count_above`  | 1                    | ❌ 它不是曲线，是 finding 的证据     |
| 换域 / 变长  | FFT、按窗 RMS、`head_tail_median_drop`             | ≠ 输入，轴不再是时间 | ❌ 需要另立输出类型（谱图 / 统计块） |

构建期卡一条：**被 `series` 引用的 `compute` 节点，输出形状必须是「逐样本」**——由签名声明，不靠人记得。归约算子只服务 `rules/`。

### 2.2 在哪算：引擎（Python / numpy）

`operators.py` 的注释自己写了「图上的姿态换算走这个，**别在前端写**」；且这 60+ 算子被 6 份冻结基线逐字段回归覆盖——前端另实现一份 JS 版，那套回归就管不到它。前端只收 `{t, series: {名字: [...]}}` 直接画。

代价是「改一个算式要重建引擎产物」。这是**刻意的**：算式是知识，知识就该走 `knowledge/` → 构建期校验 → 冻结回归这条路。代价的边界要守住：**算子里不许出现具体 topic / 字段名**（现状守住了）。

---

## 3. 通道引用：x / y / source 吃同一种东西

| 写法                                                        | 含义                                                         | 状态                       |
| ----------------------------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| `{field: [latitude_deg, lat], unit: deg}`                   | 原始列，**候选列表**按顺序取第一个存在的（字段名随固件改过） | 已支持                     |
| `{channel: att.roll}`                                       | `compute` 的产物                                             | 已支持（但今天靠位置引用） |
| `{topic: battery_status, instance: 0, fields: [voltage_v]}` | 行内指定话题/实例，少量临时用                                | 已支持                     |

`x`、`y`、`series[].*`、地图坐标、`compute.in` 全部是这一种类型。**行内话题**之所以保留，是因为它让"只画一条、不建注册表"的简单场景不必绕路。

---

## 4. 图元类型

### `container: axes`

| `mode`   | 说明                                     |
| -------- | ---------------------------------------- |
| `series` | 一条或多条线，x 为时间（省略）或另一通道 |

### `container: map`

地图上的一切都是「拿到一串坐标，决定相邻的连不连」。**一个 map = 有序 children 列表**（顺序即绘制层级）：

| `mode`     | 连接方式               | 语义                                     | 输入形状              |
| ---------- | ---------------------- | ---------------------------------------- | --------------------- |
| `path`     | 相邻相连，**缺口断开** | 连续轨迹（实飞航迹、融合位置、设定轨迹） | **一个时序源**        |
| `points`   | 不连                   | 标记点（起飞点、家、极值点、告警时刻）   | **N 个单点**          |
| `segments` | 每段两点，段间不连     | 直线段（A→B 参考线、航段、距离线）       | **N 对单点**          |
| `area`     | 首尾闭合成环           | 围栏 / 多边形                            | 同 `segments`（闭合） |

**关键区别**：`path` 的输入是_一个序列_，`points` / `segments` 的输入是_若干单点_——两类不同的东西，所以各自一个 `mode`，而不是共用一个字段。

坐标源声明一次、多处引用（每个坐标本身也是 §3 的通道引用，`alt` 完全可以来自 `compute`）：

```yaml
- container: map
  title: 轨迹
  sources:
    raw: # 原始 GNSS
      topic: [vehicle_gps_position, sensor_gps] # 候选列表天然表达「或」
      instance: 0
      lat: { field: [latitude_deg, lat], unit: deg }
      lon: { field: [longitude_deg, lon], unit: deg }
      alt: { field: [altitude_msl_m, alt], unit: m }
    est: # EKF 融合后
      topic: vehicle_global_position
      instance: 0
      lat: { field: lat, unit: deg }
      lon: { field: lon, unit: deg }
      alt: { field: alt, unit: m }
  children: [...]
```

这样就**不必**在坐标里写 `ref("sensor_gps[0].lat", "vehicle_gps_position.lat", unit=deg)` 这种把话题、实例、字段候选、单位压进一个函数字符串的写法——字符串在 YAML 层无法校验参数（`unit=dge` 拼错要等运行期），而结构化写法里 `topic` 查话题字典、`field` 查字段字典、`unit` 查量纲，构建期就能失败。

---

## 5. 点解析（point resolver）

「画一点」和「画直线」真正难的不在画，在**取一个坐标**。四种取法：

| `t`                    | 含义                                        |
| ---------------------- | ------------------------------------------- |
| `12.3`                 | 该时刻的采样（在 source 上按时间查表）      |
| `first` / `last`       | 首个 / 末个有效样本                         |
| `{max_of: alt}`        | 极值样本（如最高点）                        |
| `{finding: ekf-reset}` | **规则引擎命中的时刻** ← 与 findings 层的桥 |

于是：**点** = 1 个 resolver，**线段** = 2 个 resolver 的有序对（arity 由 schema 强制，写不出"3 个端点的线段"），**path** = 一个 source。

`t` 为数字时是「最近样本」还是「线性插值」要定死（见 §9）；无论哪种，**跨缺口的查表必须失败**，而不是给一个假坐标——与 §6 共用同一个 `gap` 阈值，判定才不会分叉。

---

## 6. 直线必须是「故意的」（顺带一个既存缺陷）

同一个 map 上的「直线」有两类，语义相反：

- `segments`：**故意**直连 A → B，不管中间发生过什么；
- `path`：**顺便**连相邻样本，所以**缺口处必须断开**。

今天的 `get_flight_track()` 没做这个区分。它先用有效掩码**剔除**未定位采样（`knowledge/engine/providers/px4.py:321-329`，注释里写的正是「一条直线就从那儿连到真正的航迹上——地图上看着完全不对」），再把剩下的点顺序连起来。

剔除发生在**开头**时是对的：整段都没了，连不起来。但发生在**中途**时——GPS 短暂丢失、lat/lon 记 0 二十秒后恢复——被剔掉的只是中间那几百个采样，**前后两段会被连成一条横穿地图的假直线**。注释诊断对了，但「剔除」只解决了开头那一次。**剔除 ≠ 断开。**

修法（不用改 schema，先修行为）：

1. 返回值把 `dropped: <计数>` 扩成 `breaks: [i, ...]`——「第 i 个保留点与第 i+1 个保留点之间原本存在无效采样」；
2. `LogFlightMap` 收到 `breaks` 后把一条路径**拆成多条 `Polyline`**；
3. 文案改成「剔除 N 个未定位采样，路径在 M 处断开」——计数还在，但多了一个更重要的信息。

---

## 7. 属性归哪一层

```yaml
文件      conditions · compute · sources(可选)     ← 整份配置共享的：前置条件、派生通道
└─ 容器  container · title · x · axes · grid/legend  ← 画布：几个坐标系、默认 x、图例与网格开关
└─ 图元  mode · source|y · decimate · gap      ← 一组几何：抽稀、缺口阈值、挂在哪个轴上
└─ 序列  field|channel · unit · label · style   ← 一条线一个对象
```

| 属性                                        | 归属                         | 理由                                         |
| ------------------------------------------- | ---------------------------- | -------------------------------------------- |
| `unit` / `range` / `flip`                   | **轴**（`axes`）             | 同一画布可放单位不同的量，轴才是它们的分界线 |
| `x`                                         | **容器**默认，**图元**可覆盖 | 同一屏通常同一时间轴；相图要单独指定         |
| `label`（图例）/ `color` / `width` / `dash` | **序列**                     | 一条线一个对象，不靠下标对齐                 |
| `decimate` / `gap`                          | **图元**                     | 实飞轨迹要抽稀，计划航线只有几十个航点不能抽 |
| 有序性（绘制层级）                          | **children 顺序**            | 后声明的画在上层，不引入 `z` 字段            |
| `grid` / `legend`                           | **容器**                     | 是画布开关，不是线属性                       |

---

## 8. 落到实现

| 层         | 改动                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| engine     | `report_data.py`：`np_series` 换成"按 `compute` 图求值"（拓扑序执行、输出按**名字**入 `series`）；`px4.py` 新增 `get_map_layers()`（抽稀 / 断开 / 点解析都在 Python 侧）             |
| 契约       | `providers/api.py` 登记可选能力 `map_layers`；`np_series` 返回从「键 = `out_names`」改成「键 = YAML 给的名字」                                                                       |
| 前端       | `LogCharts.tsx` 删掉 `opLabels[i]` 位置对齐、改按名字取图例；`LogFlightMap` 改成吃 `layers[]`，按 `mode` 分派到 Leaflet 的 `Polyline` / `CircleMarker` / 2 点 `Polyline` / `Polygon` |
| 构建期校验 | 见下表——**声明式配置的成败在这**，否则"字段写错就跳过"的结果是页面少一条线、没人发现                                                                                                 |
| 回归       | 沿用 `tools/engine/`：`guard_provider_contract.py` 对 6 份冻结基线逐份校验 `map_layers` 契约；`compute` 求值进基线逐字段比对                                                         |

构建期必须卡住的：

- `container` / `mode` 在注册表里，且 `mode` 属于该容器的合法集合；
- `y` 引用的轴名在该容器的 `axes` 里；
- `channel` 引用的名字在 `compute` 的输出里；
- `op` 在 `OPERATORS` 里，`in` / `out` 个数合 `SIGNATURES`；
- 被 `series` 引用的 `compute` 节点，输出形状必须是「逐样本」；
- 派生通道缺 `unit` → 失败；
- `topic` 在话题字典里，`field` 在字段字典里；
- `{finding: x}` 的 `x` 在规则 id 集合里；
- `source:` 引用的名字在 `sources` 里；
- `points` 每项 1 个 resolver、`segments` 每项 2 个（arity）。

---

## 9. 完整示例

### 9.1 一屏两容器：曲线（多轴）+ 地图（四类图元）

```yaml
id: flight-overview
title: 飞行概览
description: 姿态、高度与轨迹对照

conditions:
  - topics: [sensor_gps, vehicle_gps_position]

compute:
  - id: att
    op: quat_to_euler
    in: [{topic: vehicle_attitude, instance: 0, fields: [q[0], q[1], q[2], q[3]]}]
    out:
      roll:  {label: 横滚, unit: deg}
      pitch: {label: 俯仰, unit: deg}
      yaw:   {label: 偏航, unit: deg}

outputs:
  - container: axes
    title: 姿态与高度
    x: time
    grid: true
    legend: true
    axes:
      att: {label: deg, range: [-180, 180], flip: false}
      alt: {label: 高度, unit: m}
    children:
      - mode: series
        y: att
        series:
          - {channel: att.roll,  label: 横滚, style: {color: series-1}}
          - {channel: att.pitch, label: 俯仰, style: {color: series-2}}
          - {channel: att.yaw,   label: 偏航, style: {color: series-3, dash: true}}
      - mode: series
        y: alt
        series:
          - {field: [altitude_msl_m, alt], label: 海拔, style: {color: series-4}}

      # 相图：x 换成另一个通道，不需要单独的 mode
      - mode: series
        y: att
        x: {channel: att.pitch}
        series: [{channel: att.roll, label: 滚转 vs 俯仰, style: {marker: none}}]

  - container: map
    title: 轨迹
    sources:
      raw: {topic: [vehicle_gps_position, sensor_gps], instance: 0,
            lat: {field: [latitude_deg, lat], unit: deg},
            lon: {field: [longitude_deg, lon], unit: deg},
            alt: {field: [altitude_msl_m, alt], unit: m}}
      est: {topic: vehicle_global_position, instance: 0,
            lat: {field: lat, unit: deg}, lon: {field: lon, unit: deg}, alt: {field: alt, unit: m}}
    children:
      - mode: path
        source: est
        label: 融合位置
        decimate: 1500
        gap: 2
        style: {color: series-1, width: 2}
      - mode: path
        source: raw
        label: 原始 GNSS
        decimate: 1500
        gap: 2
        style: {color: series-2, width: 1, dash: true}
      - mode: points
        label: 关键点
        style: {icon: pin}
        points:
          - {source: raw, t: first, label: 起飞}
          - {source: raw, t: last,  label: 落地}
          - {source: raw, t: {max_of: alt}, label: 最高点}
          - {source: raw, t: {finding: ekf-reset}, label: 告警处}
          - {lat: 31.2304, lon: 121.4737, label: 基准点}
      - mode: segments
        label: 参考线
        style: {color: warning, dash: true}
        segments:
          - {a: {source: raw, t: first}, b: {source: raw, t: {finding: ekf-reset}}, label: 起飞→告警}
```

`est` 与 `raw` 两条 `path` 的实用价值：**它们本该重合，分叉就是 EKF 出问题**——这才是"多条曲线"在日志分析里最常见的真实用途，不是画着好看。

---

## 10. 待定（实现前必须先定）

1. **跨话题的 `compute` 节点怎么对齐时间轴？** 多话题 = 多条时间轴。注册表里 `interp_to` / `fill_to` 已有，只是今天图表够不到。要么强制这类节点显式带 `ts` 入参，要么禁止隐式对齐直接报错。
2. **`sources` 放哪一级**：容器内（只有该地图用）还是文件级（多个地图共享同一份坐标源定义）？示例暂放容器内。
3. **`t` 为数字时：最近样本 还是 线性插值？** 无论哪种，跨缺口必须失败（§5）。
4. **颜色用语义槽还是裸 hex？** 裸 hex 会让"每台机器截图都不一样"；`series-1` / `warning` / `critical` 更稳（示例已按语义槽写）。
5. **`area` 现在做不做？** PX4 的围栏顶点似乎没记进日志——可能没有真数据可画，先别写实现。
