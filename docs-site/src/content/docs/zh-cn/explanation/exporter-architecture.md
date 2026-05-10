---
title: 导出器架构
description: 一张画布如何变成快照,快照又如何变成文件。
keywords:
  - drawtonomy 导出器
  - 导出管线
  - DrawtonomySnapshot
  - OpenDRIVE 导出实现
  - 自动驾驶场景导出架构
---

导出器是 drawtonomy 编辑器内部数据与外部格式——OpenDRIVE、
OpenSCENARIO、Lanelet2,或你接入的任何下一个目标——之间的桥梁。
新增目标格式之前,先理解整条管线很重要。

## 管线

```
编辑器状态 ──► DrawtonomySnapshot ──► 导出器 ──► 文件 / blob
                  (可序列化)         (纯函数)
```

### 1. `DrawtonomySnapshot`

快照是一个普通对象:一组图形,加上版本号和时间戳。
它是可序列化的,不持有任何 DOM 引用,是导出器接受的唯一输入。

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

可以用 `createSnapshot(shapes)` 构造快照,或用
`parseDrawtonomySvg(svg)` 解析一个保存好的 `drawtonomy.svg`。

### 2. 导出器模块

每个目标格式都是一个独立的纯函数:

- `exporter.exportToOpenDrive(snapshot, options) → string`(XML)
- `exporter.exportToOpenScenario(snapshot, options) → string`(XML)
- `exporter.exportToLanelet2(snapshot, options) → string`(OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

它们接收快照,返回字符串或 blob。不访问编辑器、不操作 DOM、
不依赖异步资源。同样的输入,同样的输出。

### 3. 双向兼容

针对 Lanelet2,SDK 还提供解析器:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

这就是 [Lanelet2 导入](/zh-cn/guides/import-lanelet2/) 流程的底层实现。

## 为什么要用纯函数

导出器在浏览器中、Node CI 脚本中、服务端管线中、
浏览器扩展中,都走完全相同的代码路径。
测试基于快照 fixture 运行,不需要无头浏览器。

这就是导出器为何位于 `@drawtonomy/sdk` 而不是编辑器内部——
编辑器依赖 SDK,反过来则不会。

## 新增目标格式

导出器是新目标(CARLA、Unity、SUMO、自定义 DSL)的主要扩展点。
配方如下:

1. 在 `packages/drawtonomy-sdk/src/exporter/` 下新增模块。
2. 输入 `DrawtonomySnapshot`,返回字符串或 blob。
3. 在 `packages/drawtonomy-sdk/__tests__/exporter/` 中
   基于快照 fixture 添加测试。
4. 如果希望编辑器的 Export 菜单展示它,接上 UI 入口
   (可选——许多用户会以编程方式调用它)。

完整开发者指南位于公开仓库:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)。

## 另请参阅

- [导出至 OpenDRIVE / OpenSCENARIO / esmini](/zh-cn/guides/export-asam/) —
  面向用户的流程。
- [`@drawtonomy/sdk` 概览](/zh-cn/reference/sdk/)
- [导出器 SDK API](/zh-cn/extend/exporter-sdk/)
