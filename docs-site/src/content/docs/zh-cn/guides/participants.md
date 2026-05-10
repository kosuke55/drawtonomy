---
title: 添加车辆、行人和信号灯
description: 使用内置模板,在画布上放置参与者(actor)和交通元素。
keywords:
  - 自动驾驶车辆图标
  - 自动驾驶行人图形
  - 信号灯示意图
  - 自动驾驶场景参与者
  - 车辆模板
  - 自动驾驶图工具
  - 交通仿真场景图
---

drawtonomy 为自动驾驶场景中常见的参与者与交通元素提供了模板。

## 车辆

1. 按 <kbd>P</kbd> 打开 **参与者(Participants)**。
2. 选一个车辆模板(Sedan、Bus、Truck、Motorcycle)。
3. 点击画布放置。车辆会以模板默认大小出现。

拖动角落手柄改变大小;拖动旋转手柄让车身与车道对齐。

## 行人

在同一个 Participants 菜单中选择行人模板(Walking、Simple)。

## 信号灯

Participants 菜单也包含车辆信号灯和行人信号灯。把它们放在路口
对应位置即可。它们是静态图形,不会运行实际的信号相位。

## 自定义模板

你可以添加自己的 SVG 模板,通过 PR 贡献回项目。详见
[模板贡献指南](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)。

## 沿路径排布车辆

如果想沿一条路径排布一队车辆(用于车头时距图、跟车场景),
请使用 [Path Footprint](/zh-cn/guides/path-footprint/)。
