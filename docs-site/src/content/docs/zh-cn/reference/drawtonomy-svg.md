---
title: drawtonomy.svg 格式
description: 可重新编辑的 drawtonomy 文件在磁盘上的结构。
keywords:
  - drawtonomy.svg
  - 可编辑 SVG
  - 自动驾驶场景文件格式
  - drawtonomy 文件格式
  - SVG 元数据
---

`drawtonomy.svg` 是一个普通 SVG 文件,额外附带元数据,用来记录
仅编辑器关心的状态。

## 结构

- 视觉内容(路径、文本、图片)是普通 SVG。任何 SVG 查看器都能正确渲染。
- 文档顶部有一个 `<metadata>` 块,保存 drawtonomy 专属的数据:
  - 图形 ID 与每个图形的属性(模板、样式等)
  - 车道连接槽(`next`、`previous`、`left`、`right`)
  - 共享点引用
  - 足迹组归属
  - 层级(z-order)

## 兼容性

如果在通用 SVG 编辑器(Illustrator、Inkscape、浏览器)里编辑
`drawtonomy.svg` 并保存,元数据块通常会被丢弃,除非你显式保留它。
drawtonomy 仍然能打开这种结果文件,但其中的连接和共享点会丢失。

如果想在 drawtonomy 之外做可往返的编辑,请使用 SDK
([`@drawtonomy/sdk`](/zh-cn/reference/sdk/))——它能脱离编辑器
读写本格式。

## 版本兼容

旧文件在导入时会自动迁移。SDK 中的 `resolveColorKey()` 助手函数
会把旧的颜色 key(例如 v1.x 时代的 `grey-700`)转换为当前规范。

## 另请参阅

- [导出场景](/zh-cn/guides/export/)
- [`@drawtonomy/sdk` 概览](/zh-cn/reference/sdk/)
