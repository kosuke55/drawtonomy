---
title: drawtonomy.svg 格式
description: 可重新編輯的 drawtonomy 檔案在磁碟上的結構。
keywords:
  - drawtonomy.svg 格式
  - 可重新編輯 SVG
  - 自駕場景檔案格式
  - drawtonomy 檔案結構
  - 場景儲存格式
---

`drawtonomy.svg` 檔案是一般 SVG,加上記錄編輯器專屬狀態的詮釋資料。

## 結構

- 視覺內容(路徑、文字、影像)為純 SVG。任何 SVG 檢視器都能正確呈現。
- 文件頂部的 `<metadata>` 區塊保存 drawtonomy 專屬資料:
  - 形狀 ID 與每個形狀的屬性(範本、樣式等)
  - 車道連接欄位(`next`、`previous`、`left`、`right`)
  - 共享點參考
  - 足跡群組成員資格
  - z 順序

## 相容性

在一般 SVG 編輯器(Illustrator、Inkscape、瀏覽器)中編輯 `drawtonomy.svg`,儲存時會丟掉詮釋資料區塊,除非您明確保留。drawtonomy 仍能開啟結果,但連接與共享點會遺失。

要在 drawtonomy 之外進行可雙向轉換的編輯,請使用 SDK([`@drawtonomy/sdk`](/zh-tw/reference/sdk/))——它可在不經過編輯器的情況下讀寫此格式。

## 版本控制

匯入時舊檔案會自動遷移。SDK 中的 `resolveColorKey()` 輔助函式會將舊版顏色鍵(例如 v1.x 的 `grey-700`)轉換為目前的版本。

## 另請參閱

- [匯出您的場景](/zh-tw/guides/export/)
- [`@drawtonomy/sdk` 概述](/zh-tw/reference/sdk/)
