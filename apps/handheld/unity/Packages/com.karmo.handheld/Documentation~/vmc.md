# 밖으로 내보내기. VMC Protocol

> 코드: `Runtime/VmcCameraSender.cs` (보내는 쪽), `Runtime/VmcCameraReceiver.cs` (받는 쪽)
>, 인코더 `Runtime/Core/OscWriter.cs` / 디코더 `Runtime/Core/OscReader.cs`

손카메라가 **다른 프로세스나 다른 PC** 에서 돌 때 쓴다. 같은 프로세스면 리그가 카메라를
직접 몰므로 이게 필요 없다.

## 왜 VMC 인가

바퀴를 새로 만들 필요가 없다. VMC Protocol 의 `/VMC/Ext/Cam` 이 **우리가 만드는 값과
정확히 1:1** 이고, VSeeFace, VNyan, Warudo 가 이미 그 말을 한다. 우리가 표준을 쓰면
남의 앱에도 설정 한 줄로 꽂힌다.

```
/VMC/Ext/Cam (string)name (float)p.x (float)p.y (float)p.z
             (float)q.x (float)q.y (float)q.z (float)q.w (float)fov
```

- v2.1 도입, **v2.3 부터 양방향** (Performer→Marionette)
- 기본 포트 **39539** (받는 쪽), 하트비트 `/VMC/Ext/T (float)time`
- 좌표는 유니티 그대로. 왼손, 미터, 유니티 사원수

## 표준이 안 나르는 것. 곁가지

`/VMC/Ext/Cam` 이 나르는 렌즈 값은 **fov 하나뿐**이다. 우리가 쌓은 초점거리(mm), 초점
거리(m), 조리개, 센서 크기는 그 전선을 못 건넌다. 그래서 곁가지를 하나 더 쏜다:

```
/karmo/Ext/Lens (string)name (float)zoom (float)focalMm
                (float)focusM (float)apertureF (float)sensorMm
```

**표준을 안 깨뜨린다**. OSC 는 모르는 주소를 그냥 버린다. 우리 앱이 받으면 렌즈가
전부 살고(물리 카메라 + 피사계 심도), 남의 앱이 받으면 fov 만 살아 그대로 돈다.

## 쓰는 법

보내는 쪽(손카메라가 도는 프로젝트). 리그 옆에 `VmcCameraSender`:

| 칸 | 뜻 |
| --- | --- |
| `host` / `port` | 받는 쪽. 같은 PC 면 `127.0.0.1:39539` |
| `cameraName` | 받는 쪽에서 이 카메라를 부르는 이름 |
| `sendHz` | 포즈가 오는 만큼(30~60)이면 충분 |
| `sendLensExtras` | 곁가지를 같이 보낼지 |

받는 쪽(그림을 그리는 앱). 카메라에 `VmcCameraReceiver`. 같은 `cameraName` 을 넣으면
그 이름의 통만 받는다(비우면 아무거나).

## 전선에서 오는 것은 전부 의심한다

수신부는 **던지지 않는다.** 잘린 통, 타입태그가 다른 통, 모르는 주소, 남의 이름은
조용히 버리고 자세를 안 바꾼다. 수신 루프가 예외로 죽으면 방송이 멈추기 때문이다.
그 네 가지는 전부 시험에 박혀 있다(`Tests/OscRoundTripTests.cs`).

## 어디까지 확인했나

**소켓을 실제로 열고 값이 건너가는 것까지** 봤다 (`PlayTests/VmcLoopbackTests.cs`).
인코더, 디코더 단위 시험이 다 초록이어도 배선이 어긋나면(포트, 이름, 주기, 스레드) 전선에는
아무것도 안 온다. 그건 단위 시험이 못 잡는 자리라 Play 모드로 따로 잰다.

```
Unity.exe -batchmode -nographics -projectPath <프로젝트>   -runTests -testPlatform PlayMode -testFilter Karmo.Handheld.PlayTests   -testResults PlayResults.xml
```

한 프로세스 안의 되돌림이라 **다른 PC 에서도 된다의 증거는 아니다.** 규약과 배선이
맞다는 것까지만 닫힌다.

## 아직 안 한 것

- 실제 앱(VSeeFace 등)이 `/VMC/Ext/Cam` 을 **수신**하는지는 앱마다 다르다. 규격은
  양방향이지만 구현이 다 따라간다는 보장이 없다.
- 그림 되받기(Spout2 / NDI)는 컴파일과 배선까지만 확인했음. `embedding.md` § 참조.
