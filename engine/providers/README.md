# providers/ —— 日志适配器（一格式一个文件）

**这里唯一认识"某一种日志"的地方。** 框架（`../rule_engine.py`、`../report_data.py`）与算子
（`../operators.py`）都不认识 topic 名、字段名、info 键名、码值——它们只认 `api.py` 那份契约。

```text
日志字节 ──→ providers/<格式>.py ──→ 契约（名字 + 类型 + 失败语义） ──→ facts / rule / plot
                    ↑
        knowledge/<格式>/facts.yaml（它那一份纯数据：码表 / 文案 / 展示口径）
```

## 文件

| 文件 | 是什么 |
| --- | --- |
| `api.py` | **契约本体**。三张常量表（REQUIRED / OPTIONAL / SEMANTICS）+ `open_log()` + 运行期自检 |
| `px4.py` | PX4 `.ulg`（ULog）适配器。含固件解码、机型识别、armed 区间、飞行阶段、载具身份、轨迹取数、事件解码…… |
| （未来）`ardupilot.py` | ArduPilot `.bin`（pymavlink）。加它就是加一个文件，引擎一行不改 |

## 加一个适配器要做什么

1. 写一个类，实现 `api.py` 的 `REQUIRED` 全部能力（`OPTIONAL` 按这份日志能给的东西实现，
   缺席是合法的——报告页对应 tab 会自动隐藏）；
2. 写它那一份数据文件 `knowledge/<格式>/facts.yaml`（码表 / 文案 / 展示口径；**不放取数逻辑**）；
3. 文件末尾把 `(探测器, 工厂, 说明)` 追加进 `FORMATS`。探测按**文件头 magic**，
   不看扩展名（用户上传的文件名不可信）；
4. 跑 `python tools/calibrate/check_provider.py <该格式的日志...>`，把契约测试跑绿。

## 契约怎么被确认（三道，缺一不可）

| 那道 | 在哪 | 查什么 | 查不了什么 |
| --- | --- | --- | --- |
| 构建期 | `web/scripts/build-knowledge.mjs` | 每个适配器**定义了**契约要求的方法吗；`semantics()` 的字典字面量键齐不齐 | 方法体里的事 |
| 运行期自检 | `api.py` 的 `check_provider()`，`open_log()` 里立刻调 | 名字取得出来吗、`semantics()` 的类型对吗、每次是不是新 dict | 值对不对 |
| 契约测试 | `tools/calibrate/check_provider.py` | **语义**：取不到必须返回 `None`、`messages()` 与 `series()` 自洽、`armed_intervals` 的形状、`facts()` 与 `semantics()` 不矛盾、`match_firmware` 的边界与非法串…… | — |

为什么不写 `typing.Protocol` 靠 mypy 查：**两端都没有类型检查器**——构建期不执行 `engine/` 下的
Python（只当文本搬运，见 `../README.md`），Pyodide 里也没有 mypy。写注解只会"看着有约束、
实际没人管"。所以契约做成可执行的：常量表 + 三道机器检查。

## 几个必须守住的点

- **取不到一律返回 `None`，不抛异常**。引擎把 `None` 当"数据不足"（那条规则静默不出结论）；
  抛异常会顺着 `_eval_compute` 的兜底变成同一种静默，但更难查。这条是契约测试第一个查的。
- **`semantics()` 每次返回新 dict**：引擎会把 compute 的输出直接写进它。
- **`no_data` / `has_topic` 不在这里**：前者由框架置（compute 失败后为真），
  后者是框架给 `provider.has` 起的别名（表达式里唯一放行的函数调用）。
- **别把取数逻辑搬回 YAML**：候选字段、异常回退、位解码、按版本挑分支——这些是逻辑，
  用 YAML 表达只能再造一门小语言（本项目已经删掉两门了）。
- **这里会整份进浏览器**：`api.py` 与各适配器都被内联进 `web/workers/ulog-check-script.ts`，
  在 Pyodide 里执行。只能用 Pyodide 自带的（`numpy` / `ast` / `json` / `lzma`）。
  （`knowledge/*/meta/*.json` 是例外：太大且与具体日志无关，**不进产物**，按需从
  `web/public/params/` 拉。）
