# topics/ —— 字段字典（生成物，一 tag 一文件）

`topics/<tag>.json`：该版本全部 uORB topic 的字段定义（含枚举/位掩码/单位/注释）。

**为什么是 JSON 而不是 YAML**：这些文件只有机器读写（上游 msg → 引擎消费），
JSON 没有 YAML 的引号/缩进陷阱，且引擎构建期内联的就是 JSON，少一次转换。
**为什么不拆成一 topic 一文件**：一个 tag 有 200+ topic，三个 tag 就是 700+ 文件，
会把仓库浏览与 diff 淹没（原先 730 个文件已改回 4 个）。

生成（不要手写）：

```bash
python tools/topics/sync-px4-msg.py --tags v1.15.0,v1.16.0,main
python tools/topics/sync-px4-msg.py --check    # 只比对不写入（CI）
```

上游：PX4/PX4-Autopilot 各 release tag 的 `msg/*.msg`。
跨 tag 的人工语义（字段别名 `aliases`、命名集合 `groups`、无效值 `invalid`）放在
`../topic-overrides.yaml`，不散在生成物里。
