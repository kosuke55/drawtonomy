---
title: 车道连接模型
description: drawtonomy 如何表示道路拓扑,以及这能带来什么好处。
keywords:
  - 车道连接模型
  - 道路拓扑
  - 自动驾驶车道关系
  - drawtonomy 数据模型
  - Next Previous Left Right
---

drawtonomy 的车道(Lane)不止包含两条边界和一条中心线;
它还带有四个连接槽——**Next**、**Previous**、**Left**、
**Right**——把它接入路网。

## 四个槽位

| 槽位 | 含义 |
|---|---|
| **Next** | 当前车道的车流流向哪些车道。 |
| **Previous** | 哪些车道流入当前车道。 |
| **Left** | 紧邻左侧、共享一条边界的车道。 |
| **Right** | 紧邻右侧、共享一条边界的车道。 |

连接是双向的:把车道 A 的 Next 设为 B,也会把 B 的 Previous
设为 A。编辑器会自动维护这一不变量。

## 连接关系能带来什么

### 协调编辑

当两条车道共享一条边界——因为它们是 Left/Right 邻居,
或者 Next/Previous 车道首尾相接——这条边界本质上是同一个对象。
拖动其中的某个点,两条车道会一起更新。

拓扑已经表明"什么粘在什么上面",所以你每次微调车道时,
几何不需要手工修补。

### 一致的导出

[OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
和
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
都会编码车道连通性。drawtonomy 的导出器直接使用连接槽,
不依赖会在边角案例下崩溃的推断或启发式算法。
在编辑器里看起来对的场景,导出后就是真正的路网,
而不是一堆折线。

### 与导入双向兼容

Lanelet2 导入器从 `.osm` 文件中读取同样的连接模型。
你可以在 drawtonomy 中编辑一张 Lanelet2 地图,再导出回去,
拓扑不会丢失。

## 何时自动建立连接

意图明确时,drawtonomy 会自动设置连接:

- 新车道的起点落在某条已有车道的端点上,会自动设置 **Previous**。
- 平行车道快捷方式(车道工具下按 <kbd>Alt</kbd>+点击)
  会设置 **Left** 或 **Right**。
- 放置 [路口模板](/zh-cn/guides/participants/) 时,所有进入车道
  都会被自动接好。
- [Lane Generator](/zh-cn/guides/lane-from-map/) 会在 OSM 拓扑明确时
  推断出连接。

其余情况请在属性面板里手工设置——参见
[管理车道连接](/zh-cn/guides/lane-connections/)。

## 连接关系**不**编码什么

- **行驶方向** 通过 Next/Previous 隐含表达,不会单独编码。
  双向道路被建模为两条相对的车道,各自维护自己的 Next/Previous 链。
- **路口转向限制** 在 drawtonomy 本身中并不建模。
  它们会通过生成它们的路口模板,出现在 OpenDRIVE/OpenSCENARIO
  的导出结果中。
- **限速、路面类型、照明** —— 都没有。drawtonomy 是几何加拓扑;
  语义属性不在范围内。

## 另请参阅

- [管理车道连接](/zh-cn/guides/lane-connections/) — 编辑器层面的步骤。
- [drawtonomy.svg 格式](/zh-cn/reference/drawtonomy-svg/) — 连接关系
  在保存时是如何持久化的。
