---
title: Shape catalog
description: drawtonomy जो हर shape बना सकता है, उद्देश्य के अनुसार group किया गया।
---

## ड्राइविंग-सिनारियो shapes

| Shape | उद्देश्य |
|---|---|
| **Linestring** | निरंतर line, लेन बाउंड्री, curbs, markings के लिए उपयोग की जाती है। |
| **Lane** | दो बाउंड्री, एक centerline, और कनेक्शन slots (Next / Previous / Left / Right) के साथ एक drivable लेन। |
| **Vehicle** | Templated वाहन (Sedan, Bus, Truck, Motorcycle)। |
| **Pedestrian** | Templated पैदल यात्री (Walking, Simple)। |
| **Path** | तीरों, footprint groups, या सिनारियो paths के लिए उपयोग की जाने वाली trajectory। तीर या band शैली। |
| **Polygon** | बंद क्षेत्र (parking lot, hatched zone)। |
| **Crosswalk** | Pre-styled पैदल यात्री crossing। |
| **TrafficLight** | वाहन या पैदल यात्री signal। |
| **Intersection** | Multi-lane junction टेम्पलेट। |

## Basic shapes

| Shape | उद्देश्य |
|---|---|
| **LineArrow** | Single-segment तीर। |
| **Arrow** | Free-form तीर। |
| **Text** | Plain या annotated text। |
| **Freehand** | pen-like stroke के साथ ड्रॉ किया गया। |
| **Rectangle** | Axis-aligned आयत। |
| **Ellipse** | Axis-aligned ellipse। |
| **Image** | इम्पोर्ट किया गया PNG / JPG / SVG। |

## कस्टम टेम्पलेट

आप वाहन, पैदल यात्री, सड़क के निशान, और signs के लिए SVG
टेम्पलेट जोड़ सकते हैं। योगदान flow
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
में है।
