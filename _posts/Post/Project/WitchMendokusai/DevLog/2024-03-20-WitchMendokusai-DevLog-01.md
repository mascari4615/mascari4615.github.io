---
title: "WitchMendokusai DevLog 01"
# description: ""
categories: [📀Post, 🫐Project, 🫐WitchMendokusai]
tags: [Project, Game-Dev, WitchMendokusai]
image: "/assets/img/background/20230112_151539.jpg"
hidden: true

date: 2024-03-28. 15:52
# last_modified_at: 2024-03-20. 13:26
# last_modified_at: 2024-03-25. 01:39
# last_modified_at: 2024-03-28. 15:52
last_modified_at: 2024-08-29. 21:48
---

## 📀 _

---

![커밋](/assets/img/post/2024/240328_00.png)  
![너무 많은 일이 잇엇어](/assets/img/post/embed/Tired.jpg)  

저번 일지와 마찬가지로,  
이번 일지에서도 마을 의뢰를 만들기 위해 구현한 기능들을 기록해본다.  

## 📀 데이터 저장

---

저번 일지에서 퀘스트와 일이 기능적으로 동작하는 것까지 만들었다.  
이제 퀘스트와 일 정보를 저장하고 불러오는 걸 구현해본다.  

정말 많은 일이 있었다.  

### 💿 1. 일단 저장해봐 !

```cs
[Serializable]
public struct QuestData
{
	public int QuestID;
	public QuestState State;

	public QuestData(int questID, QuestState state)
	{
		QuestID = questID;
		State = state;
	}
}
```

```cs
[Serializable]
public class GameData
{
	public Dictionary<int, List<Work>> works = new();
	public List<QuestData> questDatas = new();
	// ...
}
```

단순히 `QuestData`를 새로 정의하고 `GameData`에 추가했다.  
간단하게 퀘스트 정보와 일 정보를 저장할 수 있게 됐다.  

### 💿 2. 조건 정보 저장 (Criteria, RuntimeCriteria)

하지만 문제가 있다.  

퀘스트를 완료하기 위한 서브 퀘스트를 `Criteria`, `조건`으로 칭하겠다.  
퀘스트와 마찬가지로 스크립터블 오브젝트로 존재한다.  

런타임에서 계속 진행상황을 체크할 수 있는 조건들도 있지만,  
딱 한 번만 달성해도 되거나, 랜덤한 요소를 가지는 등의 특징을 가진 조건들도 있다.  

이런 조건들은 게임이 껐다켰을 때 정보를 불러올 수 있어야 한다.  
때문에 이런 조건들의 정보나 진행 상황을 저장해야 한다.  

처음엔 `QuestData`와 마찬가지로 `CriteriaData`를 만들어 `CriteriaID`, `IsCompleted`, `Value` 등을 저장해보려 했다.  

`Quest` 스크립터블 오브젝트에 기존 `State`와 마찬가지로 `[NonSerialized]`인 `List<bool> IsCompleted`와 `List<SomeValue> CriteriaValue`를 추가한 다음,  
`CriteriaData`를 읽어볼 때 각 조건의 ID에 맞춰 완료 여부나 정보를 저장하는 방식이다.  

..대충봐도 아름답지는 않은 방식이다. 실제로 아래와 같은 문제들이 있다.  

- 순서가 존재하긴 하지만, ID가 똑같은 조건이 있다면 모호해진다.
- `CriteriaValue`를 어떤 타입으로 만들어 저장할지가 고민스럽다. 조건마다 필요한 부가 정보가 다를 것이기 때문이다.
- 조건과 관련된 변수가 `Criterias`, `IsCompleted`, `Value`나 생긴다. 하나로 합치면 좋을 것 같다.
- 스크립터블 오브젝트에 너무 많은 정보가 들어간다. 특히 `[NonSerialized]` 한 정보들이 많아진다. 분리할 필요가 있다.

이런 문제들을 해결하기 위해 아래처럼 구조를 바꾸고 구현했다.  

- `Criteria`
  - 기존 `Criteria`는 `CriteriaSO`로 변경
  - 새로 `Criteria` 클래스를 만들어서, 동적으로도 `Criteria`를 생성할 수 있도록 변경
  - 새로 `RuntimeCriteria` 클래스를 만들어서, `Criteria`, `IsCompleted` 등을 저장

- `Quest` 분리
  - 기존 `Quest`는 에디터 타임에서 정적인 데이터만을 저장하도록 `QuestData`로 변경
  - 기존 `QuestData`는 `QuestDataSave`로 변경
  - 새로 `Quest` 클래스를 만들어서, `QuestData`와 `RuntimeCriteria`를 저장
  - `GameData`에 `List<Quest>`를 추가해서 바로 직렬화

이렇게 있을 법한 문제들을 해결하고자 했다.  
`CriteriaValue`의 타입 결정 문제는, JSON 데이터 저장 시 `TypeNameHandling = TypeNameHandling.Auto` 옵션을 켜서, `Criteria` 타입으로 저장하더라도 파생 클래스의 필드 역시 저장할 수 있도록하여 해결했다.  

그렇게 만들어진 클래스들은 아래 같은 모양을 가지게 됐다.  

```cs
public class RuntimeCriteria : ICriteria
{
	public Criteria Criteria { get; private set; }
	// 한 번만 달성하면 되는지
	public bool JustOnce { get; private set; }
	public bool IsCompleted { get; private set; }

	public bool Evaluate()
	{
		if (JustOnce && IsCompleted)
			return true;

		return IsCompleted = Criteria.Evaluate();
	}

	public float GetProgress()
	{
		return Criteria.GetProgress();
	}

	[JsonConstructor]
	public RuntimeCriteria(Criteria criteria, bool justOnce = false)
	{
		Criteria = criteria;
		JustOnce = justOnce;
	}

	public RuntimeCriteria(CriteriaInfo criteriaInfo)
	{
		Criteria = criteriaInfo.CriteriaSO.Data;
		JustOnce = criteriaInfo.JustOnce;
	}
}
```

```cs
public class Quest
{
	public Guid? Guid { get; private set; }
	public int DataID { get; private set; }
	public QuestState State { get; private set; }
	public List<RuntimeCriteria> Criterias { get; private set; }

	public QuestData GetData()
	{
		return DataManager.Instance.QuestDic[DataID];
	}

	[JsonConstructor]
	public Quest(Guid? guid, int dataID, QuestState state, List<RuntimeCriteria> criterias)
	{
		Guid = guid;
		DataID = dataID;
		State = state;
		Criterias = criterias;

		StartQuest();
	}

	public Quest(QuestData questData)
	{
		Guid = System.Guid.NewGuid();
		DataID = questData.ID;
		Criterias = Data.Criterias.ConvertAll(criteriaData => new RuntimeCriteria(criteriaData));

		StartQuest();
	}

	// ...
}
```

### 💿 3. 통계와 스탯 저장

조건의 세부 정보는 `Criteria`가 직접 들고 있다.  

예를 들어, '몹을 10마리 잡으시오' 같은 조건이 있다고 한다면,  
`MonsterKill` 값을 지켜보면서, 값이 10 이상일 때 `Criteria.Evaluate()` 함수에서 `true`를 반환한다.  

기존에는 `MonsterKill` 같은 통계 값이나 스탯들을 스크립터블 오브젝트로 만들어 관리했기 때문에,  
`Criteria`에서도 이런 스크립터블 오브젝트를 필드로 가지고 있었다.  

하지만 위에서 데이터 저장 구조를 바꾸면서 이런 방식에 문제가 생겼다.  

`Criteria`도 이제 `RuntimeCriteria`의 필드로서 데이터로 저장이 되는데,
이러면 `Criteria`를 직렬화/역직렬화 할 때 값은 저장돼도 레퍼런스가 사라져서 번거롭게 직접 레퍼런스를 연결해주는 작업이 필요하게 된다.  

이를 해결하기 위해 통계 값을 저장하는 방식을 스크립터블 오브젝트에서 `Enum`으로 변경하고,  
별도로 `Statistics` SO를 만들어서 `Dictionaty<StatisticsType, int>`로 관리하기 시작했다.  

이러면 `Enum` 정수값으로 데이터가 저장되고, `Evaluate()` 등에서 통계 값을 알고자 할 때는 `Statistics`에서 가져오면 된다.  

전체적으로 아래와 같은 모양이 된다.  

```cs
public abstract class Criteria : ICriteria
{
	public abstract int GetCurValue();
	public abstract int GetTargetValue();
	public abstract bool Evaluate();

	// NewtonSoft로 Json 직렬화/역직렬화를 시키고 있는데,
	// 화살표 함수를 직렬화하는 것 같아서 일반적인 함수 모양으로 만들었다.
	// 좀 더 알아봐야 할 듯
	public virtual float GetProgress()
	{
		return (float)GetCurValue() / GetTargetValue();
	}
}
```

```cs
public abstract class NumCriteria : Criteria
{
	public ComparisonOperator ComparisonOperator { get; private set; }
	public int TargetValue { get; private set; }

	// ...
}
```

```cs
public class StatisticsCriteria : NumCriteria
{
	public StatisticsType Type { get; private set; }

	public override int GetCurValue()
	{
		return SOManager.Instance.Statistics[Type];
	}

	// ...
}
```

```cs
public class Statistics : ScriptableObject, ISerializationCallbackReceiver
{
	[SerializeField] private List<StatisticsInfo> initStatistics = new();

	[NonSerialized] private Dictionary<StatisticsType, int> statistics = new();

	public int this[StatisticsType type]
	{
		get
		{
			if (!statistics.ContainsKey(type))
				statistics[type] = 0;
				
			return statistics[type];
		}
		set
		{
			if (!statistics.ContainsKey(type))
				statistics[type] = 0;

			statistics[type] = value;
		}
	}

	// ...
}
```

{% include embed/youtube.html id = "B2JsymHzgvE" %}

위 영상을 참고했다.  

영상에서 소개하는 것처럼, 스탯도 스크립터블 오브젝트에서 `Enum`으로 바꾸고,  
별도로 `Dictionaty<StatType, int>`를 가지는 `Stat` 클래스로 관리하기 시작했다.  

이런 방식이 쓸 때나 저장하고 관리할 때나 편하긴한데,  
한 가지 문제점이라 한다면 `Enum` 값의 순서를 바꾸거나 한다면 데이터가 꼬인다는 것이다.  

그래서 최대한 변경을 피하도록 아래와 같이 응집성이 있는 것들을 100 단위로 분류했다.  

어떤 스탯을 어떤 분류에 배치해야 하는지 등의 경계의 문제도 있을 것이고, 언젠가 불가피하게 변경이 필요한 날이 있을테지만.. 일단 계속 구현해보도록 한다.  

```cs
public enum StatType
{
	// 체력
	HP_CUR = 0,
	HP_MAX = 1,

	// 경험치, 레벨
	EXP_CUR = 100,
	EXP_MAX = 101,
	LEVEL_CUR = 102,

	// 마나
	MANA_CUR = 200,
	MANA_MAX = 201,

	// 이동
	MOVEMENT_SPEED = 300,
	MOVEMENT_SPEED_BONUS = 301,

	// 스킬
	COOLTIME_BONUS = 400,

	// 데미지
	DAMAGE_BONUS = 500,

	// 키워드
	PLAYER_EXP_COLLIDER_SCALE = 10000,
	SATELLITE_COUNT = 100001,
}
```

### 💿 4. Reward

조건과 마찬가지로 보상도 저장해야한다. (보상도 랜덤일 수 있고, 크게는 퀘스트를 동적으로 생성하기 위해)  
이를 위한 구조체, 클래스들을 정의했다.  

```cs
public enum RewardType
{
	Item,
	Gold,
	Exp,
}
```

```cs
[Serializable]
public struct RewardInfo
{
	public RewardType Type;
	public Artifact Artifact;
	public int Amount;
}
```

```cs
[Serializable]
public struct RewardData
{
	public RewardType Type;
	public int ArtifactID;
	public int Amount;

	public RewardData(RewardInfo rewardInfo)
	{
		Type = rewardInfo.Type;
		ArtifactID = rewardInfo.Artifact ? rewardInfo.Artifact.ID : Artifact.NONE_ID;
		Amount = rewardInfo.Amount;
	}
}
```

```cs
public class Reward
{
	public static void GetReward(RewardData reward)
	{
		switch (reward.Type)
		{
			case RewardType.Item:
				ItemData itemData = DataManager.Instance.ItemDic[reward.ArtifactID];
				SOManager.Instance.ItemInventory.Add(itemData, reward.Amount);
				break;
			case RewardType.Gold:
				SOManager.Instance.Nyang.RuntimeValue += reward.Amount;
				break;
			case RewardType.Exp:
				SOManager.Instance.VQExp.RuntimeValue += reward.Amount;
				break;
		}
	}
}
```

이렇게 구현한 구조체, 클래스들을 `QuestData`와 `Quest`에서 저장하여 사용한다.  

## 📀 그 외

---

- 퀘스트 UI를 개선하면서, 퀘스트의 툴팁에 조건과 보상 정보를 표시하기 시작했다.

- 인형과 카메라 사이에 있는 오브젝트들을 투명하게 처리하기 시작했다.
  - 사실 기능은 기존에도 있었는데, 제대로 작동하지 않던 문제를 수정하면서 리팩토링을 진행했다.

- 데이터를 로컬 JSON 파일로 저장하기 시작했다.
  - 기존에는 PlayFab으로 데이터를 저장했는데, 당장 저장 데이터 구조가 계속 바뀌는 상황에서 PlayFab 페이지까지 들어가 수정하고 지우는 과정이 번거로웠기에..

### 💿 ISavable

```cs
public interface ISavable<T>
{
	void Load(T saveData);
	T Save();
}
```

간단한 인터페이스를 만들었다.

## 📀 현재까지의 진행 상황

---

{% include embed/youtube.html id = "1ZtAxI-Fu1U" %}

## 📀 다음 목표

---

얼추 마을 의뢰가 만들어졌다.  

마을 의뢰를 만들면서 여러 스크립터블 오브젝트들을 관리하게 됐는데,  
매번 느꼈던 것이 번거로움이었다.  

프로젝트에서 사용하는 모든 스크립터블 오브젝트는, 내가 만든 클래스인 `Artifact`를 상속받는다.  
`Artifact`에는 고유한 숫자인 `ID`가 속성으로 있고, 이 `ID`를 통해 `Artifact`를 구별한다.  

하지만 이를 설정하는 건 온전히 내 몫이기 때문에,  
이것저것 관리하면서 `Artifact`를 새로 만들거나 수정할 때 매번 적절한 `ID`를 찾아 설정해줘야한다.  
여간 번거로운 것이 아니다.  

또, 이런 `Artifact`들을 분류에 맞게 저장해야 할 때가 있다.  
단순히 특정 분류의 모든 `Artifact`를 모두 모아야 하는 경우도 있고, (데이터 접근을 위한 딕셔너리들)  
목적에 맞게 모아야 하는 경우도 있다. (특정 덱에 들어갈 카드들)  

이를 하나하나 드래그/드롭하는것도 참 귀찮은 작업이다.  

이런 문제들을 해결하기 위해, UI ToolKit을 이용한 에셋 관리 툴을 만들어볼 것이다.  

![To Be Continued..](/assets/img/post/embed/ToBeContinued.png)  
