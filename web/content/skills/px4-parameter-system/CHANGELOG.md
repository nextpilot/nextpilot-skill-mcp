# 版本历史

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 只有 **SKILL.md 正文的改动**才影响版本号。改 README / EXAMPLE / CHANGELOG 不改 AI 行为，不 bump。

## 1.0.0 — 2026-09-19

### Added
- 初版：用途 → 参数名映射表（机型 / 姿态 / 位置 / 估计器 / 失效保护 / 电池 / 校准 / 日志 / 输出）
- `param set` + `param save` 的持久化流程与 `param diff` / `param dump` 调试链
- 自定义参数命名长度限制与 `updateParams()` 刷新机制
- 与 ArduPilot 的边界声明

### Changed
- 文件形态从扁平 `.mdx` 改为目录形态 `SKILL.md` + `README.md` + `EXAMPLE.md` + `CHANGELOG.md`
