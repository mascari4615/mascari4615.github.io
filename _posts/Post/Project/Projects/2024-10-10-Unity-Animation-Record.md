---
title: "Unity 런타임 애니메이션 녹화"
# description: ""
categories: [📀Post, 🫐Project]
tags: [Unity]
image: "/assets/img/background/20230112_151539.jpg"
hidden: true

date: 2024-10-10. 15:02
# last_modified_at: 2024-10-10. 15:13 # Init
last_modified_at: 2024-10-21. 13:27 # 작업
---

{% include embed/youtube.html id = "" %}

## 📀 말머리

---

## 📀 시작

---

### 💿 목표

Chanity에 사용될 모션녹화 모듈 개발.  

#### 아바타 Transform을 이용해서 FBX파일로

- `XsAnimationRecorder.cs`에서 Unity Animation 파일로 뽑아내는 건 있고 (에디터 스크립트라, Only 에디터 타임에)
- Unity Animation을 FBX 파일로 변환하는 건 [이런거](https://github.com/newyellow/Unity-Runtime-Animation-Recorder) 참고

#### 아바타 Animation 데이터는

- 아바타 Animator 컴포넌트에서 `.GetHumanBone()` 아니면 `.GetMuscle()`로 값을 가져오는걸로 하는게 좋을 것. (구상)
- 접근 가능한 값은 Animator랑 Avatar 클래스 (Chanity Avatar 클래스겠지?)

#### 목표

- [Banana Man](https://marketplace.unity.com/packages/3d/characters/humanoids/banana-man-196830?locale=ko-KR) 샘플 모델 아바타에 위에 Unity쟝 Animation 모션 넣어서 재생시키고 녹화 테스트

![목표 결과물](https://cdn.discordapp.com/attachments/1276598931685376185/1293806558441898006/image.png?ex=67168e81&is=67153d01&hm=b2575ae1394afa5e2e1a3d977fc36a33b1032657d104600dd556874fb85c3a27&)

최종적으로 위처럼 모델, 애니메이션, 본이 포함된 FBX 파일을 뽑으면 된다.  
녹화하면 보통 FBX로 파일 뽑아주 는 듯하다.  

## 📀 과정

---

### 💿 XsAnimationRecorder 분석

런타임에서 애니메이션을 녹화하는 방식을 알아내기 위해 `XsAnimationRecorder.cs` 파일을 분석한다.  

에디터용 스크립트다.  
`#if UNITY_EDITOR`로 감싸져있어 빌드에서는 사용할 수 없다.  

동작은 다음과 같다.  

1. `Start()` : `EditorCurveBinding[]`, `AnimationCurve[]` 초기화
2. `Record()` : 
3. `SaveRecording()`에서 애니메이션 클립을 만들어 저장한다.

- 알아야 할 것
  - `EditorCurveBinding`
  - `HumanPose`, `HumanPoseHandler`
  - `AnimationUtility.GetAnimatableBindings`
  - `HumanTrait`
  - `HumanTrait.MurcleName`
  - `AnimationCurve`
  - `Animator.avatar`
  - `HumanPoseHandler`

```cs
/// <summary>
/// Use the AnimationUtility to save our AnimationCurves to the correct EditorCurveBindings and then save our new clip to disk
/// </summary>
void SaveRecording()
{
	//Creates a new clip so we can save all of our curves.
	AnimationClip clip = new();

	//Iterate through all curves and add the data to the currect EditorCurveBindings
	for (int i = 0; i < recordedCurvesCount; i++)
	{
		AnimationUtility.SetEditorCurve(clip, indexToCurve[i], curves[i]);
	}

	//Save the clip to disk
	AssetDatabase.CreateAsset(clip, filePath + fileName + ".anim");
	AssetDatabase.SaveAssets();

	Debug.Log("[xens] Animation Clip <b>\"" + fileName + ".anim\"</b> saved successfuly in <b>" + filePath + "</b>");
}
```

### 💿 HumanPose

캐릭터의 포즈를 나타내는 구조체.  
캐릭터의 위치, 회전, 근육 값을 포함.  

- `Vector3 bodyPosition`: 캐릭터의 몸 위치
- `Quaternion bodyRotation`: 캐릭터의 몸 회전
- `float[] muscles`: 캐릭터의 근육 값 배열

#### HumanPoseHandler

`HumanPose`를 관리하고 조작하는 클래스.  
`HumanPose`를 가져오거나 설정.  

- `HumanPoseHandler(Avatar avatar, Transform root)` : 생성자. Avatar와 Transform을 사용하여 HumanPoseHandler를 초기화합니다
- `void GetHumanPose(ref HumanPose humanPose)` : 현재 포즈를 HumanPose 구조체에 저장합니다.
- `void SetHumanPose(ref HumanPose humanPose)` : HumanPose 구조체에 저장된 포즈를 설정합니다.

```cs
using UnityEngine;

public class HumanPoseHandlerExample : MonoBehaviour
{
    public Animator animator;

    void Start()
    {
        HumanPoseHandler poseHandler = new HumanPoseHandler(animator.avatar, animator.transform);
        HumanPose pose = new HumanPose();

        // 현재 포즈 가져오기
        poseHandler.GetHumanPose(ref pose);

        // 포즈 정보 출력
        Debug.Log("Body Position: " + pose.bodyPosition);
        Debug.Log("Body Rotation: " + pose.bodyRotation);
        Debug.Log("Muscles: " + string.Join(", ", pose.muscles));

        // 포즈 수정
        pose.bodyPosition += Vector3.up * 0.1f; // 몸 위치를 약간 위로 이동
        pose.bodyRotation *= Quaternion.Euler(0, 10, 0); // 몸을 약간 회전

        // 수정된 포즈 설정
        poseHandler.SetHumanPose(ref pose);
    }
}
```

### 💿 AnimationUtility

#### AnimationUtility.GetAnimatableBindings

2021.3 기준.  

[`AnimationUtility.GetAnimatableBindings(Gameobject targetObject, GameObject root)'`](https://docs.unity3d.com/2021.3/Documentation/ScriptReference/AnimationUtility.GetAnimatableBindings.html)  

TargetObject의 Animatable한 것들을 `EditorCurveBinding[]`으로 반환.  

root는 반드시 targetObject의 루트일 필요 없음.  
targetObject랑 같거나 더 상위 계층의 오브젝트.  

#### AnimationUtility.SetEditorCurve

### 💿 AnimationClip To FBX

먼저 에디터에서만 사용 가능한 `AnimationUtility.SetEditorCurve`를 `AnimationClip.SetCurve`로 대신한다.  

```cs
for (int i = 0; i < recordedCurvesCount; i++)
{
    // AnimationUtility.SetEditorCurve(clip, indexToCurve[i], curves[i]);
    clip.SetCurve(indexToCurve[i].path, indexToCurve[i].type, indexToCurve[i].propertyName, curves[i]);
}
```

`XsAnimationRecorder.cs`에서는 이 다음 애니메이션 클립을 `AssetDatabase`를 이용해 파일로 저장하는데, `AssetDatabase` 역시 에디터에서만 사용 가능하다.  

현재 만들고자 하는 모듈의 목표는, `AnimationClip`을 FBX로 변환하여 저장하는 것이라서 굳이 이 부분은 바꿔 쓸 필요가 없다. 지워준다.  

```cs
// Save the clip to disk
// AssetDatabase.CreateAsset(clip, filePath + fileName + ".anim");
// AssetDatabase.SaveAssets();
```

`AnimationClip`을 FBX로 변환한다.  
이를 위해 

## 📀 메모/생각

---

- <https://docs.unity3d.com/2021.3/Documentation/ScriptReference/AnimationUtility.SetEditorCurves.html>
- <https://mgun.tistory.com/2046>
- <https://discussions.unity.com/t/animationutility-seteditorcurve-makes-clip-file-size-bigger/630221>
