---
title: '@drawtonomy/sdk 概览'
description: SDK 的包结构、入口,以及它与编辑器的协作方式。
keywords:
  - drawtonomy SDK
  - 自动驾驶 SDK
  - 场景生成 SDK
  - OpenSCENARIO SDK
  - Lanelet2 解析器
---

`@drawtonomy/sdk` 是扩展开发者和无界面工具(headless tooling)
所依赖的包。它对外提供:

| 模块 | 作用 |
|---|---|
| `ExtensionClient` | 面向 iframe 扩展的 postMessage 客户端。 |
| 图形工厂函数 | `createLane()`、`createVehicle()` 等。 |
| `createSnapshot()` | 由一组图形构建 `DrawtonomySnapshot`。 |
| `exporter.*` | 一组将快照转换为 OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM 的纯函数,内含一个 Lanelet2 解析器。 |
| 类型 | `BaseShape`、`LaneShape`、`VehicleShape`、`DrawtonomySnapshot` 等。 |

## 安装

```bash
pnpm add @drawtonomy/sdk
```

## 配套包

| 包 | 作用 |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | SDK 本身。 |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | 本地开发服务器,用于扩展开发期间托管编辑器。 |

## 源码

SDK 的源码、测试与示例都在
[drawtonomy GitHub 仓库](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk) 中。

## 另请参阅

- [扩展 SDK API](/zh-cn/extend/extension-sdk/) — 构建 iframe 扩展。
- [导出器 SDK API](/zh-cn/extend/exporter-sdk/) — 新增目标格式。
