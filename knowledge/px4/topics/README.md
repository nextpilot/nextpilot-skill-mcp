# topics/ —— 字段字典（生成物，按 tag 组织）

这里是 **PX4 uORB 字段字典**，一个 tag 一个文件夹、一个 topic 一个 YAML：

```text
topics/
  v1.15.0/vehicle_status.yaml
  v1.15.0/vehicle_gps_position.yaml
  ...（约 200 个）
  v1.16.0/...
  main/...
```

**本目录文件全部由工具生成，不要手写**：

```bash
python tools/topics/sync-px4-msg.py --tags v1.13.3,v1.14.4,v1.15.0,v1.16.0,main
```

上游来源：PX4/PX4-Autopilot 各 release tag 的 `msg/*.msg`。跨 tag 的人工语义
（字段别名 `aliases`、命名集合 `groups`、无效值 `invalid`、单位修正）统一放在
`../topic-overrides.yaml`，不要散在这些生成物里。
