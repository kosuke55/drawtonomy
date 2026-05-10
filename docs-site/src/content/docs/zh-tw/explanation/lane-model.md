---
title: 車道連接模型
description: drawtonomy 如何表示道路拓樸,以及這帶來什麼好處。
keywords:
  - 車道連接模型
  - 道路拓樸
  - drawtonomy 車道
  - 自駕車道網路
  - Next Previous Left Right
  - 車道相鄰關係
---

drawtonomy 的車道不只有兩條邊界與一條中心線;還帶有四個連接欄位——**Next**、**Previous**、**Left** 與 **Right**——將其連結到道路網路中。

## 四個欄位

| 欄位 | 含義 |
|---|---|
| **Next** | 此車道車流流入的車道。 |
| **Previous** | 流入此車道的車道。 |
| **Left** | 緊鄰左側、共享邊界的車道。 |
| **Right** | 緊鄰右側、共享邊界的車道。 |

連接是雙向的:將車道 A 的 Next 設為 B,也會將 B 的 Previous 設為 A。編輯器會為您維護這項不變式。

## 連接帶來的好處

### 協調編輯

當兩條車道共享邊界——因為它們是 Left/Right 鄰居,或因為 Next/Previous 車道首尾相接——該邊界是一個物件。在其上拖曳一個點,兩條車道都會更新。

拓樸已經說明了什麼黏在什麼上,所以幾何不需要在每次調整車道時手動修復。

### 一致的匯出

[OpenDRIVE](https://www.asam.net/standards/detail/opendrive/) 與 [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) 都會編碼車道連通性。drawtonomy 的匯出器直接使用連接欄位,沒有會在邊角案例失效的推論或啟發法。在編輯器中看起來正確的場景會匯出成真正的道路網路,而非一堆折線。

### 與匯入雙向轉換

Lanelet2 匯入器從 `.osm` 檔案讀取相同的連接模型。您可以在 drawtonomy 中編輯 Lanelet2 地圖,並匯出回去而不失去拓樸。

## 何時自動推斷連接

當意圖明確時,drawtonomy 會自動設定連接:

- 繪製從既有車道端點開始的車道,會設定 **Previous**。
- 平行車道快捷鍵(<kbd>Alt</kbd>+點擊車道工具)會設定 **Left** 或 **Right**。
- 放置[路口範本](/zh-tw/guides/participants/)會串接每條進入車道。
- 在明確的情況下,[車道產生器](/zh-tw/guides/lane-from-map/)會從 OSM 拓樸推斷連接。

其他情況請在屬性面板中手動設定——請參閱[管理車道連接](/zh-tw/guides/lane-connections/)。

## 連接不編碼的內容

- **行駛方向**由 Next/Previous 隱含,但未獨立編碼。雙向道路以兩條相反方向的車道,各自擁有自己的 Next/Previous 鏈來建模。
- **路口處的轉向限制**在 drawtonomy 本身不建模。它們透過產生它們的路口範本出現在 OpenDRIVE/OpenSCENARIO 匯出中。
- **速度限制、路面類型、照明**——皆無。drawtonomy 是幾何加拓樸;語意屬性不在範圍內。

## 另請參閱

- [管理車道連接](/zh-tw/guides/lane-connections/) — 編輯器步驟。
- [drawtonomy.svg 格式](/zh-tw/reference/drawtonomy-svg/) — 連接如何在儲存時保留。
