---
title: 快速入门 — 在浏览器中画出第一条车道
description: 打开 drawtonomy.com,绘制车道,放置车辆并导出。一条 5 分钟的路径,带你穿过这款免费在线行车场景白板。
sidebar:
  label: 快速入门
  order: 2
keywords:
  - drawtonomy 快速入门
  - 在线绘制车道教程
  - 浏览器道路示意图工具
  - 自动驾驶草图教程
  - 自动驾驶白板入门
  - 在线场景图工具
  - 自动驾驶图工具教程
---

5 分钟,从一张空白画布走到一个导出好的场景。无需安装。

## 1. 打开应用

访问 [drawtonomy.com](https://drawtonomy.com)。所有内容都在
浏览器中运行,任何数据都不会上传。

## 2. 画一条车道

1. 按 <kbd>N</kbd>,或在工具栏中点击 **车道(Lane)** 工具。
2. 在画布上点击,放置中心线起点;再次点击放置下一个顶点;
   按 <kbd>Enter</kbd> 完成。
3. 左右两条边界会自动生成。

:::tip
绘制时按住 <kbd>Shift</kbd> 可以临时跳过 [自动吸附](/zh-cn/guides/snap/),
仅对当前这一次点击生效。
:::

## 3. 放置一辆车

1. 按 <kbd>P</kbd> 打开 **参与者(Participants)** 工具。
2. 选 **车辆 → 轿车(Sedan)**,然后点击刚画好的车道。
3. 拖动角落手柄改变大小,或使用旋转手柄使车身与车道方向对齐。

## 4. 导出场景

打开导出菜单,选择一种格式:

- **PNG / SVG / PDF** — 作为静态图片分享。
- **drawtonomy.svg** — 保存所有连接关系,你或同事都可以
  重新打开继续编辑。
- **导出 esmini 包** — 一个 zip,包含 OpenDRIVE + OpenSCENARIO,
  可以在 [esmini](https://github.com/esmini/esmini) 中直接回放。

[导出场景](/zh-cn/guides/export/) 里详细介绍了每种格式。

## 接下来呢?

- 一节更长的课:[绘制你的前三条车道](/zh-cn/tutorials/your-first-lanes/)。
- 针对具体任务的操作指南——
  [从卫星地图生成车道](/zh-cn/guides/lane-from-map/)、
  [导入 Lanelet2 文件](/zh-cn/guides/import-lanelet2/) 等等。
- 给扩展开发者:[扩展 drawtonomy](/zh-cn/extend/)。
