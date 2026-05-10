---
title: จานสี
description: คีย์สีของ drawtonomy และค่า HEX
---

drawtonomy ใช้จานสีแบบ Tailwind / Material: grey-100 (สว่าง
ที่สุด) ถึง grey-900 (เข้มที่สุด) พร้อมสีที่ตั้งชื่อ

## โทนเทา

| คีย์ | HEX | หมายเหตุ |
|---|---|---|
| `grey-100` | `#e6e6e6` | สว่างที่สุด ค่าเริ่มต้นของ Vehicle (Simple) |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | ค่าเริ่มต้นของ Pedestrian (Walking & Simple) |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | สีเทากลาง |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | เข้มที่สุด |

ตัวเลขน้อย = สว่างกว่า ตรงกับธรรมเนียมของ Tailwind

## ค่าเริ่มต้นของเทมเพลต

| เทมเพลต | สีเริ่มต้น |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| รูปทรงอื่น | `black` |

## ตั้งสีเชิงโปรแกรม

ใช้ `resolveColor()` ของ SDK เพื่อแปลงคีย์เป็นค่า HEX ดู
[API ของ Extension SDK](/th/extend/extension-sdk/) สำหรับรายละเอียด
