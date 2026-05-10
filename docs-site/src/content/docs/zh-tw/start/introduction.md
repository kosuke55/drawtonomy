---
title: 簡介 — 自動駕駛場景白板
description: drawtonomy 是一款免費、純瀏覽器運作的自動駕駛場景白板。為論文、簡報、設計討論與場景撰寫,輕鬆繪製車道、路口、車輛與行人。可匯出 OpenDRIVE、OpenSCENARIO 與 Lanelet2。
sidebar:
  label: 簡介
  order: 1
keywords:
  - 自動駕駛場景白板
  - 自駕場景圖工具
  - 自動駕駛示意圖工具
  - 論文用自動駕駛配圖
  - 簡報用自動駕駛配圖
  - 線上繪製自駕場景
  - 交通場景草圖工具
  - 瀏覽器車道圖編輯器
  - 設計審查場景示意圖
  - 自駕團隊白板
  - drawtonomy 是什麼
  - 自駕論文配圖工具
  - 免費自駕繪圖工具
---

drawtonomy 是一款自動駕駛場景白板。您放在論文裡的圖、設計審查前在簡報上勾勒的草圖、會議中向團隊解釋邊角案例時繪製的示意圖,以及撰寫 OpenSCENARIO 檔案前先描繪的場景,都屬於它的應用範疇。

車道、路口、車輛、行人、紅綠燈、道路標線與行人穿越道皆為內建形狀。車道具備拓樸感知能力——帶有 Next / Previous / Left / Right 連接——所以圖形是可編輯的網路,而不是道路幾何一變就得重畫的圖片。

應用程式位於 [drawtonomy.com](https://drawtonomy.com)。SDK、擴充功能與本文件網站的原始碼放在 [GitHub](https://github.com/kosuke55/drawtonomy)。

## 大家用它做什麼

- **論文、學位論文與技術報告的配圖。**向量輸出(`drawtonomy.svg`、PDF、EPS)可乾淨嵌入 LaTeX、Markdown 與簡報。
- **簡報與發表。**變換車道操作、路口、遮蔽情境等自駕場景示意圖——每個形狀以秒為單位完成,而不是花上數分鐘。
- **設計與演算法討論。**作為共享草圖介面,與隊友討論駕駛行為、邊角案例與安全論點。
- **場景撰寫。**撰寫 OpenSCENARIO XML 之前先繪製場景,或匯入既有的 `.xosc` 並以視覺方式編輯。
- **地圖與 ROS 標註。**在衛星背景上描繪車道、編輯 Lanelet2 OSM 地圖,或在 ROS 佔據網格上標註路徑與障礙物。

## 適用對象

- **自駕與 ADAS 工程師**為內部文件、設計審查與事故報告繪製示意圖。
- **AV 研究人員與學生**為論文、學位論文與會議報告製作配圖。
- **場景作者**搭配 [esmini](https://github.com/esmini/esmini)、CARLA 或內部工具等模擬器使用。
- **高精地圖與 Lanelet2 使用者**針對既有道路網路勾勒變更。
- **ROS 與機器人團隊**在 nav2、Cartographer 或 Gmapping 建立的佔據網格上繪圖。
- **駕駛訓練講師與教育工作者**製作教材示意圖。
- **工具開發者**透過[擴充 SDK](/zh-tw/extend/) 為編輯器加入新的匯出器、匯入器或 AI 輔助功能。

## 文件如何組織

本網站採用 [Diátaxis](https://diataxis.fr/) 分類法。請挑選符合您目前需求的章節。

| 章節 | 何時閱讀 |
|---|---|
| [教學](/zh-tw/tutorials/) | 您是新手,想從做中學。 |
| [操作指南](/zh-tw/guides/) | 您知道要完成什麼任務,需要步驟。 |
| [參考資料](/zh-tw/reference/) | 您要查閱確切的事實——快速鍵、格式、API。 |
| [說明](/zh-tw/explanation/) | 您想了解 drawtonomy 為何如此設計。 |
| [擴充 drawtonomy](/zh-tw/extend/) | 您想在 drawtonomy 之上開發。 |

如果不知道從哪裡開始,[快速入門](/zh-tw/start/quickstart/)只需五分鐘,即可從空白畫布走到匯出場景。
