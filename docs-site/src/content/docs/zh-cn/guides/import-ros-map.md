---
title: 导入 ROS OccupancyGrid (.pgm + .yaml)
description: 加载用 nav2、Cartographer 或 Gmapping 生成的 ROS map_server 占据栅格(.pgm + .yaml)作为 drawtonomy 的背景图层,然后在其上勾画路径、车道和障碍物。
keywords:
  - ROS 占据栅格标注
  - nav2 地图编辑器
  - cartographer 地图查看
  - 在 pgm 地图上绘图
  - SLAM 地图标注工具
  - 自动驾驶仓库地图
  - 机器人地图标注
  - 占据栅格编辑
---

drawtonomy 兼容 [nav2](https://navigation.ros.org/)、Cartographer、
Gmapping 等 SLAM 工具所使用的 ROS `map_server` 格式。

![一份 ROS 占据栅格被导入 drawtonomy,上面绘制了箭头和货架](/img/ros-occupancy-grid.png)

截图展示了一份真实仓库的占据栅格(占用区为黑、空闲区为白),
以及在 drawtonomy 中直接在其上绘制的路径与障碍物。

## 导入

1. 打开 **File** 菜单 → **Import**。
2. 在文件对话框中**同时选中** `.pgm` 与对应的 `.yaml` 文件。
3. drawtonomy 会读取 YAML 元数据(分辨率、阈值)
   并把栅格渲染到画布上。

如果只选择 `.pgm` 而没有 `.yaml`,drawtonomy 会使用默认值
(`resolution = 0.05 m/px`,标准占据阈值)。

## 单元格颜色

| 单元 | 颜色 |
|---|---|
| 占用 | 黑 |
| 空闲 | 白 |
| 未知 | 灰 |

栅格按与 drawtonomy 车道尺寸匹配的比例渲染,
因此你可以直接在上面绘制车道、路径和图形——就像截图一样。

## 已测试的工具

drawtonomy 已与 nav2、Cartographer 和 Gmapping 生成的地图协同使用过。
其他生成器只要输出标准的 `map_server` `.pgm` + `.yaml` 组合,
都应可正常工作。

## 另请参阅

- [导入 Lanelet2 (.osm) 文件](/zh-cn/guides/import-lanelet2/)
