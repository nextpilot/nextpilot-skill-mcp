# 版本历史

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

> 只有 **SKILL.md 正文的改动**才影响版本号。改 README / EXAMPLE / CHANGELOG 不改 AI 行为，不 bump。

## 1.0.0 — 2026-09-19

### Added
- 初版：定义 / 发布 / 订阅 / 多实例四环节的排查逻辑
- 「症状 → 原因」对照与 `uorb top` → `listener` 的命令链
- 多实例按 `device_id` 区分的原则
- 与 v1.13 老 C API 的兼容性说明

### Changed
- 文件形态从扁平 `.mdx` 改为目录形态 `SKILL.md` + `README.md` + `EXAMPLE.md` + `CHANGELOG.md`
