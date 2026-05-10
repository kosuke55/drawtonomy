---
title: 扩展 drawtonomy
description: 构建扩展、新增目标格式、贡献模板。
sidebar:
  order: 0
keywords:
  - drawtonomy 扩展开发
  - 扩展 drawtonomy
  - 自定义场景工具
  - 自定义导出器
  - drawtonomy 模板贡献
---

drawtonomy 在设计上就是为扩展而生的。驱动内置扩展(AI 场景生成器、
模板预览、导出器实验室)的同一套 SDK,也正是你要使用的。

## 选择扩展点

| 你想… | 阅读 |
|---|---|
| 添加一个与编辑器并行运行的面板、生成器或工具 | [扩展 SDK](/zh-cn/extend/extension-sdk/) |
| 新增一个导出目标(CARLA、Unity、SUMO 等) | [导出器 SDK](/zh-cn/extend/exporter-sdk/) |
| 贡献一个新的 SVG 模板(车辆、行人、路标) | [模板](/zh-cn/extend/templates/) |

## 源码所在

所有内容都位于公开的
[drawtonomy GitHub 仓库](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — 开发用的本地编辑器
- `extensions/` — 内置扩展,可作参考
- `templates/` — 内置图形模板

欢迎提 PR。
[模板贡献指南](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
完整介绍如何添加一个自定义图形,从零到合并。
