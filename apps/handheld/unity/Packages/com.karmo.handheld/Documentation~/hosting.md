# 호스트 앱에 카메라를 넘기는 법

> 코드: `Runtime/Core/HandheldCameraFrame.cs`, `HandheldRig.CameraFrameUpdated`

## 창구는 하나

```csharp
rig.CameraFrameUpdated += f =>
{
    myCamera.position = f.Position;
    myCamera.rotation = f.Rotation;          // 또는 f.EulerContinuous
    myCamera.fov      = f.FovY;
};
```

우리 내부(서버, 보간, 추적 안정기)를 안 들여다봐도 이것만 받으면 카메라가 움직인다.
`rig.CameraFrame` 로 아무 때나 지금 값을 꺼내도 된다.

## 받는 쪽이 흔히 밟는 함정 셋

### ① 오일러를 그냥 보간하면 반대로 한 바퀴 돈다

자세를 사원수가 아니라 **오일러 세 개로 들고 보간하는 앱이 흔하다**
(`Mathf.Lerp(pitch, target.pitch, t)` 같은 꼴). 그 보간은 최단 경로를 모른다 . 
359 → 1 을 건널 때 358° 를 거꾸로 돈다. 생방에서 카메라가 한 바퀴 도는 사고다.

그래서 <see>EulerContinuous</see> 는 **감기지 않는다**. 359 다음이 361 이다.
사원수(`Rotation`)로 받는 쪽은 이 문제가 없다. Slerp 가 알아서 짧은 쪽으로 간다.

`Quaternion.Euler(pitch, yaw, roll)` 로 되돌리면 `Rotation` 과 같아진다. 그 약속은
시험에 박혀 있다 (`Tests/CameraFrameTests.cs`).

### ② 렌즈 값은 받는 쪽이 좁게 자른다

흔한 범위: **초점거리 1~300mm, 조리개 f/1~f/32, 초점 0.1~100m, 화각 0~179°**.
벗어나면 그쪽에서 **조용히 잘린다**. 오류는 안 나고 화면만 안 따라온다.

`f.LensInCommonRange` 로 미리 볼 수 있고, 벗어난 칸 이름은 `f.LensOutOfRange()` 다.
조종석, 인스펙터, `/diag`(`lensWarn`)에도 뜬다. 우리 조리개 슬라이더도 f/1 에서 끊어 뒀다.

배율을 크게 잡으면 초점거리가 300mm 를 넘을 수 있다. 폰 화각이 좁을수록 빨리 넘는다.

### ③ 자동 초점은 별도 칸으로 받아라

거리 한 칸에 자동을 섞어 넣는 방식(음수면 자동 같은)은 우리 쪽에서 안 쓴다.
`f.AutoFocus` 와 `f.FocusDistanceM` 을 따로 준다. 섞으면 받는 쪽에서 부호 하나로
초점이 뒤집힌다.

## 자세를 직접 못 넣는 앱이라면

카메라 상태를 손으로 못 넣는 앱이면 **프로세스를 갈라** VMC 로 보낸다 →
[vmc.md](vmc.md). 그림은 [embedding.md](embedding.md) § 를 봐라.
