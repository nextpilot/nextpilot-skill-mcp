# 版本历史

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 只有 **SKILL.md 正文的改动**才影响版本号。改 README / EXAMPLE / CHANGELOG 不改 AI 行为，不 bump。

## 1.0.0 — 2026-09-19

### Added

- 初版：`px4_add_module` + CMakeLists 模板与目录结构
- 工作队列 vs 独立任务的选型标准（有硬件总线走 INS*/SPI*，要阻塞必用独立任务）
- 启动脚本注册（rc.mc_apps / rc.fw_apps / rc.vtol_apps / rc.sensors）
- 三个沉默失败：忘调度、忘 publish、忘填 timestamp
- 四个通用队列的优先级序列
- NextPilot 差异对照表（scons / Kconfig / RT-Thread 自动初始化 / apps 目录）

### Changed

- 文件形态从扁平 `.mdx` 改为目录形态 `SKILL.md` + `README.md` + `EXAMPLE.md` + `CHANGELOG.md`
