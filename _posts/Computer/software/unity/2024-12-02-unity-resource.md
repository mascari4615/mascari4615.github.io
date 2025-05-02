---
title: "Unity | Resource, AssetBundle, Addressable"
# description: ""
categories: [컴퓨터, 소프트웨어]
tags: [유니티]
image: "/assets/img/background/kururu-lab.jpg"
hidden: true

date: 2024-12-02. 19:03 # Init
last_modified_at: 2025-03-15. 09:33 # Unity-Asset -> Unity-Resource
---

## Resources

---

- <https://blog.naver.com/sorang226/223792661583>

## AssetBundle

---

### AssetBundle

AssetBundle로 불러오는 방법으로는 씬에 포함된 스크립트가 불러와지지 않는다.  

AssetBundle로 씬을 묶어오면, 최상위 오브젝트들의 순서가 뒤죽박죽이 되어버린다. (일정하지 않는다?) (알파벳 순으로 정렬된다?)  

또 에디터에서 불러올 때랑, 런타임에서 불러올 때랑 다르게 불러와진다.  

## Addressable

---

### Addressable

- AddressableDownloadRequest
