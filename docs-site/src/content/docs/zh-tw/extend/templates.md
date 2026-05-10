---
title: 貢獻範本
description: 新增車輛、行人、號誌或道路標線範本。
keywords:
  - drawtonomy 範本貢獻
  - SVG 範本
  - 自駕車輛範本
  - 行人 SVG 範本
  - 道路標線範本
  - 號誌範本
---

範本是 SVG 檔案加上資訊清單條目。一旦貢獻,它們會在編輯器的參與者與形狀選單中與內建範本並列。

貢獻流程位於公開儲存庫:

➡ **[範本指南](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## 類別

| 資料夾 | 範例 |
|---|---|
| `templates/vehicle/` | 房車、巴士、卡車、機車 |
| `templates/pedestrian/` | 行走、簡單 |
| `templates/road_marking/` | 行人穿越道、箭頭標線 |
| `templates/sign/` | 停止、讓路、號誌頭 |
| `templates/other/` | 其他任何項目 |

## 流程

1. 將您的 SVG 加入正確類別的資料夾。
2. 在 `templates/manifest.json` 中註冊。
3. 提交 PR。請附上範本放置在畫布上的螢幕截圖。

## 什麼樣的範本算好

- 以合理的預設大小繪製(房車約 4–5 公尺)。
- 用已知的填色標記單一可變色區域,讓屬性面板的顏色挑選器可重新著色。
- 無外部字型參考——若有文字,請轉換為路徑。
- 合理的檔案大小(車輛大小的範本約 30 KB 以下)。
