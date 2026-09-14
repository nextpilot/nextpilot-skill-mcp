# params/ —— 参数字典（生成物，按 tag 组织）

这里是 **PX4 参数字典**，一个 tag 一个文件：

```text
params/
  v1.15.0.yaml
  v1.16.0.yaml
  main.yaml
```

**本目录文件全部由工具生成，不要手写**：

```bash
python tools/topics/sync-px4-msg.py --tags v1.13.3,v1.14.4,v1.15.0,v1.16.0,main
```

上游来源：各 release tag 的 `parameters.json`（PX4 构建系统生成的参数元数据）。
字段精简为 `name / type / default / min / max / unit / reboot_required / airframes / description`，
供"参数审计"类经验（配置是否合理 / 是否被改动）引用。

全量参数有数千条，构建期内联时只注入被经验引用到的子集，避免把数 MB JSON 塞进 Pyodide。
