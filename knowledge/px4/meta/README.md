# meta/ —— 固件元数据（生成物，一 tag 一份）

`meta/<tag>.json` 同时包含该版本的**字段字典**与**参数字典**：

```jsonc
{
  "tag": "main",
  "topicCount": 288,
  "topics": { "vehicle_status": { "file": "VehicleStatus.msg", "fields": { ... } }, ... },
  "paramCount": 2656,
  "parameters": { "MPC_XY_CRUISE": { "type": "float", "default": 5.0, "min": 3.0, ... }, ... }
}
```

**为什么合并成一份**：两者都是"某固件版本的字段/参数语义"，都只被机器读写；
同一个 tag 的东西放一份文件里，取某版本的全部元数据只需读一处。

**为什么是 JSON 而不是 YAML**：只有机器读写，JSON 没有 YAML 的引号/缩进陷阱，
且引擎构建期内联的就是 JSON，少一次转换。
**为什么不拆细**：一个 tag 有 200+ topic，拆开会把仓库浏览与 diff 淹没
（早期形态 730 个文件已收敛为 3 个）。

生成（不要手写）：

```bash
python tools/dev/fetch_px4_uorb_msg.py --tags v1.15.0,v1.16.0,main
python tools/dev/fetch_px4_uorb_msg.py --check     # 只比对不写入（CI）
```

上游：

- `topics` ← PX4/PX4-Autopilot 各 tag 的 `msg/*.msg`
- `parameters` ← PX4 构建系统发布的 `parameters.json`（px4-travis S3）。
  **实测**：release tag 下没有该文件（404），只有分支构建（`main`/`master`）有，
  所以 `v1.15.0.json`、`v1.16.0.json` 的 `parameters` 为 `null` 并附说明；
  flight_review 也是只用一份 master 参数定义（日志里的实际参数值来自 `.ulg` 的
  initial_parameters）。需要时用 `--params-url` / `--params-tag` 覆盖。

跨 tag 的人工语义（字段别名 `aliases`、命名集合 `groups`、无效值 `invalid`）
放在 `../topic-overrides.yaml`，不散在生成物里。
