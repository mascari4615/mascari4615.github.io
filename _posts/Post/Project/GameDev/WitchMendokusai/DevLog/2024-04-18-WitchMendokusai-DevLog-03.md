---
title: "🫐 WitchMendokusai DevLog 03"
categories: [📀Post, 🫐Project, 🫐WitchMendokusai]
tags: [Project, Game-Dev, WitchMendokusai]

date: 2024-04-18. 21:34
# last_modified_at: 2024-04-04. 11:34
# last_modified_at: 2024-04-25. 21:38
last_modified_at: 2024-08-29. 21:51
---

{% include embed/youtube.html id='BnGTGZ-eqCU' %}

## 📀 _

---

일지를 꾸준히 적는게 참 어렵다.  

## 📀 변경점 : 인게임

- 던전 보상 UI
  - 기존 퀘스트 보상 UI를 추상화하여 재사용
- 던전 스테이지
  - 기존 스테이지를 추상화하여 재사용
  - 단순 뱀서류에서 로그라이크 식 맵 모양으로 기획 변경
- 던전 제약
  - 기존 난이도 삭제
  - 명일방주 제약, 리스크 오브 레인 유물 개념의 제약 추가
  - 토글 가능하도록
    - `UISlot`에 활성화/비활성화 기능 추가

- `Monster` => `Mob`

- 상점 기능 디벨롭
- `Artifact`를 `DataSO`로 이름 변경
- `DataBuffer`도 `DataSO`를 상속받음
- `UIDataBuffer`를 `UI~Grid`로 이름 변경
- `DataBuffer`가 자신을 사용하는 `UI~Grid`를 추적하여 업데이트

- 플레이어 인터렉션을 일반 클래스로 변경 (기존 `MonoBehaviour` 상속 제거)
- 스킬
  - `SkillHandler` 추가
  - `Skill`에서 `Skill`, `SkillData`로 분리
  - 쿨타임이 `TimeManager.Tick`에 의해 관리되도록 변경 (기존엔 Update에서 돌아가서, 일시정지를 해도 쿨타임이 돌아감)
  - 임시 근접 공격

- 새 BGM
  - BY PROTODOME

- `InputSystem`, `Addressable` 패키지 추가
- `InputSystem`을 이용한 UI 키보드 조작
  - `UISlot`, Select와 Click 이벤트 분리

- UI 디벨롭

## 📀 변경점 : 인게임과 관련없는

### 💿 ScriptableObject 이름 검사 개선

[커밋 : SO 파일 이름 검사 시, ID뿐만 아니라 이름도 확인하고 수정하도록 수정](https://github.com/Mascari4615/Witch-Mendokusai/commit/cf3a8e2e2d01ab90924ee51452527b0329d63509)  
[커밋 : SO 파일 이름 수정 시, 파일명으로 쓸 수 없는 문자 제거](https://github.com/Mascari4615/Witch-Mendokusai/commit/690807aa858a0336c09d2787ab1c62c087c6d6ce)  

```cs
string goodName = $"{assetPrefixes[typeof(T)]}_{asset.ID}_{asset.Name}";
// if (asset.name.StartsWith($"{assetPrefixes[typeof(T)]}_{asset.ID}") == false)

// 파일 이름에 사용할 수 없는 문자를 제거
Regex regex = new(string.Format("[{0}]", Regex.Escape(new string(Path.GetInvalidFileNameChars()))));
goodName = regex.Replace(goodName, string.Empty);

if (asset.name.Equals(goodName) == false)
{
	Debug.Log($"에셋 이름을 변경합니다. {asset.name} -> {goodName}");
	AssetDatabase.RenameAsset(filePath, goodName);
}
```

`ScriptableObject`의 파일 이름 유효성 검사시,  

기존에는 해당 `ScriptableObject`의 ID만 검사했는데,  
이름을 포함하여 적절한 이름을 가지고 있는지 확인하고 수정하도록 개선  

이때, 파일 이름에 사용할 수 없는 문자를 `Regex`를 이용하여 제거  
예를 들어 `2장 : 위상` 같은 이름을 가진 퀘스트 `ScriptableObject`를 만들었는데,  
문자 `:`가 파일 이름에 사용할 수 없는 문자라서 `2장  위상`으로 변경되도록 함  

띄어쓰기가 좀 어색해서 지워야 하나 싶긴한데, 일단 보류.  

[참고 : C# 파일명 유효성 체크](https://findfun.tistory.com/681)  
[참고 : 파일 명으로 사용할 수 없는 문자 (나무위키)](https://namu.wiki/w/%ED%8C%8C%EC%9D%BC%20%EC%9D%B4%EB%A6%84%EC%9C%BC%EB%A1%9C%20%EC%82%AC%EC%9A%A9%ED%95%A0%20%EC%88%98%20%EC%97%86%EB%8A%94%20%EB%AC%B8%EC%9E%90)  

### 💿 원인모를 TextMeshPro 에러 로그

[커밋 : 테스트를 위한 폴리싱 + TMP 오류 수정을 위한 패키지 버전업](https://github.com/Mascari4615/Witch-Mendokusai/commit/690807aa858a0336c09d2787ab1c62c087c6d6ce)  

`MissingReferenceException: The variable m_AtlasTextures of TMP_FontAsset doesn't exist anymore.` 에러 로그가 계속 뜨는데, 원인을 모르겠다.  

사용하고 있는 `TMP Font Asset`를 `Reset`하고 `Clear Dynamic Data`하는 방법이 있다고는 하는데 나에게는 적용되지 않았고,  
나는 `TextMeshPro` 패키지를 `3.0.8`에서 `3.2.0-pre.9` 버전으로 업그레이드하는 것으로 해결했다.  

[참고 : MissingReferenceException: The variable m_AtlasTextures of TMP_FontAsset doesn't exist anymore.](https://forum.unity.com/threads/missingreferenceexception-the-variable-m_atlastextures-of-tmp_fontasset-doesnt-exist-anymore.1048091/)  

![To Be Continued..](/assets/img/common/ToBeContinued.png)  
