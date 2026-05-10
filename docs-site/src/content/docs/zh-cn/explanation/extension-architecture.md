---
title: 扩展架构
description: drawtonomy 如何加载、隔离并与第三方扩展通信。
keywords:
  - drawtonomy 扩展
  - iframe 扩展
  - postMessage 通信
  - 扩展沙箱
  - drawtonomy 架构
---

drawtonomy 的扩展不是编译进编辑器的插件,
而是加载到 iframe 中的独立 Web 应用,通过 `postMessage`
与宿主通信。本页解释为什么这样设计,以及由此带来的影响。

## 加载

一个扩展由一个指向 `manifest.json` 的 URL 描述。
用户(或深链接)使用 `?ext=<manifestUrl>` 打开编辑器:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

编辑器会读取 manifest、创建 iframe,并加载扩展的入口 HTML。
通过重复使用 `?ext=` 参数,可以同时加载多个扩展。

## 隔离

扩展运行在拥有独立 origin 的 iframe 中,它们不能:

- 直接访问编辑器的 DOM。
- 读取 drawtonomy 的 localStorage。
- 加载超出宿主 CSP 之外的资源。

它们能做的,仅限于 manifest 的 `capabilities` 数组中申请的能力
(`shapes:read`、`shapes:write`、`ui:panel` 等),
以及 `@drawtonomy/sdk` 的 `ExtensionClient` 通过 `postMessage`
暴露的接口。

这是有意为之。扩展是第三方代码,编辑器把它们视为不可信。

## 通信

SDK 把 `postMessage` 封装成 `ExtensionClient`,提供类型化的、
基于 Promise 的 API:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

底层流程:

- 扩展把请求 post 给宿主 iframe。
- 宿主依据扩展声明的 capabilities 进行校验。
- 宿主返回结果,或拒绝请求。

## 为什么用 iframe

其他选择——npm 风格插件、Webpack module federation、
进程内脚本——都要求你信任扩展的代码,
而且会把扩展的生命周期与编辑器的构建耦合在一起。

iframe 带来的好处:

- **Origin 隔离**,由浏览器强制——无需自己维护 JS 沙箱。
- **独立部署节奏** — 扩展按自己的步骤发版。
- **任意框架** — React、Vue、Svelte、原生 JS 都行,宿主不在乎。
- **开发与生产同源代码** — 开发服务器在 `localhost:3000` 托管编辑器,
  你把扩展指向 `localhost:3001`。同样的 `?ext=` 参数,
  同样的协议。

代价是 `postMessage` 是异步的。看起来"免费"的调用
(`getShapes()`)实际要走一次 iframe 往返。SDK 在能批处理
和缓存的地方都做了——不要把它放在紧密循环里反复调用。

## 本地开发

`@drawtonomy/dev-server` 包会在本地托管编辑器,
让你在没有网络往返的情况下进行扩展开发:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # 编辑器在 :3000
cd my-extension && pnpm dev --port 3001        # 扩展在 :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

完整指南位于公开仓库:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)。

## 另请参阅

- [扩展 SDK API](/zh-cn/extend/extension-sdk/)
- [`@drawtonomy/sdk` 概览](/zh-cn/reference/sdk/)
