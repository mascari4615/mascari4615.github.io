---
title: Code Block - Image-Zoom
date: "2025-03-15T08:55:00+09:00"
categories: [컴퓨터, 프로그래밍]
tags: []
image: /assets/img/background/kururu-lab.jpg
board: info
---

## Image-Zoom

---

- UpdateScreenPos
  - setParent(null)
  - targetX = SWHalf - focusX
  - clamp(targetX, -SWH, SWH)
  - setParent(maskImage)
- UpdateMaskPosUp
  - ~
  - targetY = focusY - SHH - maskHH + maskImageYDistance (var)
  - ~
- UpdateMaskPos
  - maskWH = maskSizeDelta.x / 2
  - Move
    - targetX = focusX - SWH
    - clamp(targetX, maskWH - SWH, SWH - MWH)
    - mask.localPos = new ~
- Darg Screen
  - curScale = rawImage.localScale.x
  - targetX = ri.localPos.deltaX
  - maxX = sWH * (curScale - 1)
  - clamp (target, -max, max)
  - ri.localPos = new (~)

## 임의로 Touch Event

---

- PointerEventData = new (EventSystem.current) {position = new()}
- EventSystem.current.RayCastAll(pointerEventData.list)
- ExecuteEvents.Execute(targetObject_raycastObject, EventData, ExecuteEvents, PointerClickHandler )
