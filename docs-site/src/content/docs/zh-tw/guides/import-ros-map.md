---
title: 匯入 ROS OccupancyGrid (.pgm + .yaml)
description: 載入由 nav2、Cartographer 或 Gmapping 建立的 ROS map_server 佔據網格(.pgm + .yaml)作為 drawtonomy 的背景圖層,然後在其上勾勒路徑、車道與障礙物。
keywords:
  - ROS 佔據網格標註
  - nav2 地圖編輯器
  - cartographer 地圖檢視器
  - 在 pgm 地圖上繪製
  - SLAM 地圖標註工具
  - 機器人地圖標註
  - 自駕場景 ROS
---

drawtonomy 可理解 [nav2](https://navigation.ros.org/)、Cartographer、Gmapping 等 SLAM 工具使用的 ROS `map_server` 格式。

![匯入 drawtonomy 的 ROS 佔據網格,上面繪製了箭頭與貨架](/img/ros-occupancy-grid.png)

截圖顯示真實倉庫的佔據網格(已佔用儲存格為黑色,空閒儲存格為白色),其上直接於 drawtonomy 中繪製路徑與障礙物。

## 匯入

1. 開啟**檔案**選單 → **匯入**。
2. 在檔案對話框中**同時**選擇 `.pgm` 與對應的 `.yaml` 檔案。
3. drawtonomy 會讀取 YAML 詮釋資料(解析度、閾值)並在畫布上呈現網格。

如果只選擇 `.pgm` 而沒有 `.yaml`,drawtonomy 會使用預設值(`resolution = 0.05 m/px`、標準佔據閾值)。

## 儲存格上色

| 儲存格 | 顏色 |
|---|---|
| 已佔用 | 黑色 |
| 空閒 | 白色 |
| 未知 | 灰色 |

儲存格以與 drawtonomy 車道尺寸相符的比例呈現,因此您可直接在其上繪製車道、路徑與形狀——就像上方截圖那樣。

## 已測試的工具

drawtonomy 已測試過 nav2、Cartographer 與 Gmapping 產生的地圖。其他產生器只要輸出標準 `map_server` `.pgm` + `.yaml` 配對應該也能運作。

## 另請參閱

- [匯入 Lanelet2 (.osm) 檔案](/zh-tw/guides/import-lanelet2/)
