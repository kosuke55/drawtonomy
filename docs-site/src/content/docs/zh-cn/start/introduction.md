---
title: 简介 — 自动驾驶场景白板
description: drawtonomy 是一款免费、基于浏览器的自动驾驶场景白板。绘制车道、路口、车辆和行人,用于论文、幻灯片、设计讨论和场景编写。可导出为 OpenDRIVE、OpenSCENARIO 与 Lanelet2。
sidebar:
  label: 简介
  order: 1
keywords:
  - 自动驾驶场景白板
  - 自动驾驶场景图工具
  - 自动驾驶图示工具
  - 自动驾驶论文配图
  - 自动驾驶演示插图
  - 在线绘制自动驾驶场景
  - 交通场景草图工具
  - 浏览器车道图编辑器
  - 设计评审场景图
  - 自动驾驶团队白板
  - drawtonomy 是什么
  - 智能驾驶场景图
  - 高精地图绘图工具
---

drawtonomy 是一块用于自动驾驶场景的白板。它适合用来绘制
论文里的插图、设计评审前临时画的幻灯片、电话会议中给团队
解释边角案例时的示意图,或在编写 OpenSCENARIO 文件之前先
勾勒出来的那个场景。

车道、路口、车辆、行人、信号灯、路面标线和人行横道都是内置图形。
车道具备拓扑感知能力——带有 Next / Previous / Left / Right
四组连接关系——所以场景图是一张可以编辑的网络,而不是道路一变
就需要重画的图片。

应用入口在 [drawtonomy.com](https://drawtonomy.com)。SDK、
扩展以及本文档站点的源代码都在
[GitHub](https://github.com/kosuke55/drawtonomy) 上。

## 大家用它做什么

- **论文、学位论文与技术报告配图。** 矢量输出
  (`drawtonomy.svg`、PDF、EPS),可以干净地嵌入 LaTeX、
  Markdown 和幻灯片。
- **幻灯片与演讲。** 变道、路口、遮挡场景等驾驶场景示意图——
  几秒画完,而不是每个图形要花几分钟。
- **设计与算法讨论。** 一块共享的草图画板,用来与同事讨论
  驾驶行为、边角案例和安全论证。
- **场景编写。** 在写 OpenSCENARIO XML 之前先画出场景,
  或者导入已有的 `.xosc` 在画布上可视化编辑。
- **地图与 ROS 标注。** 在卫星图背景上描出车道、编辑
  Lanelet2 OSM 地图,或在 ROS 占据栅格上标注路径与障碍物。

## 适合谁

- **自动驾驶与 ADAS 工程师** 撰写内部文档、设计评审材料、
  事故分析报告时画图用。
- **自动驾驶研究人员与学生** 制作论文、学位论文和会议演讲的
  配图。
- **场景作者** 配合 [esmini](https://github.com/esmini/esmini)、
  CARLA 或自研工具开展场景编写工作。
- **高精地图与 Lanelet2 用户** 在已有路网上勾画修改方案。
- **ROS 与机器人团队** 在 nav2、Cartographer 或 Gmapping 生成
  的占据栅格上画图。
- **驾校教官与教育工作者** 制作教学材料中的示意图。
- **工具开发者** 通过[扩展 SDK](/zh-cn/extend/) 为编辑器添加新的
  导出器、导入器或 AI 辅助功能。

## 文档结构

本站采用 [Diátaxis](https://diataxis.fr/) 文档框架。
请挑选与你当前任务最匹配的章节。

| 章节 | 适用场景 |
|---|---|
| [教程](/zh-cn/tutorials/) | 你刚接触 drawtonomy,希望边做边学。 |
| [操作指南](/zh-cn/guides/) | 你已知道目标,只需要具体步骤。 |
| [参考](/zh-cn/reference/) | 你只想查一个具体的事实——快捷键、格式或 API。 |
| [原理说明](/zh-cn/explanation/) | 你想理解 drawtonomy 为什么这样设计。 |
| [扩展 drawtonomy](/zh-cn/extend/) | 你要在 drawtonomy 之上构建工具。 |

如果不知道从哪里开始,
[快速入门](/zh-cn/start/quickstart/) 只需五分钟,
就能从一张空白画布走到一个导出好的场景。
