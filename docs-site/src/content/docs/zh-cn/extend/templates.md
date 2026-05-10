---
title: 贡献模板
description: 为车辆、行人、路标或路面标线添加新的模板。
keywords:
  - drawtonomy 模板
  - 自定义车辆模板
  - 自定义路标 SVG
  - 自动驾驶图形贡献
  - 图形模板贡献
  - 车辆 SVG 模板
---

模板由 SVG 文件加上 manifest 注册项构成。一旦贡献成功,
它们会出现在编辑器的 Participants 与图形菜单中,
与内置模板并列。

贡献流程位于公开仓库:

➡ **[模板贡献指南](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## 分类

| 文件夹 | 示例 |
|---|---|
| `templates/vehicle/` | Sedan、Bus、Truck、Motorcycle |
| `templates/pedestrian/` | Walking、Simple |
| `templates/road_marking/` | 人行横道、箭头标线 |
| `templates/sign/` | 停车牌、让行牌、信号灯灯组 |
| `templates/other/` | 其他 |

## 流程

1. 把 SVG 放进合适的分类文件夹。
2. 在 `templates/manifest.json` 中注册它。
3. 提交 PR。请附一张该模板放到画布上的截图。

## 什么是好的模板

- 默认尺寸合理(轿车约 4–5 米)。
- 用一个已知 fill 标记一处可改色区域,
  这样属性面板的取色器才能给它换色。
- 不引用外部字体——如有文字,转换为路径。
- 文件大小适中(车辆级模板控制在 ~30 KB 以内)。
