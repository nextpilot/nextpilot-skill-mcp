# params/ —— 参数字典（生成物，一 tag 一文件）

`params/<tag>.json`：该版本的参数元数据（type/default/min/max/unit/group/desc/枚举）。

生成（不要手写）：

```bash
python tools/topics/sync-px4-msg.py --tags v1.15.0,v1.16.0,main
```

上游：PX4 构建系统发布的 `parameters.json`（px4-travis S3）。
**实测结论**：release tag 下没有该文件（404），只有 `main` / `master` 分支键下有——
flight_review 自己也是只用一份 master 参数定义（日志里的实际参数值来自 `.ulg` 的
initial_parameters），所以默认只同步一份 `main.json`；需要时用 `--params-url` 覆盖。

全量 2656 个参数，构建期内联时只注入被经验引用到的子集，避免把数 MB JSON 塞进 Pyodide。
