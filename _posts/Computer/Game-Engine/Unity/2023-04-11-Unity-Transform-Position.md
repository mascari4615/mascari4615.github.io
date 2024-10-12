---
title: "🌔 Unity Transform Position"
categories: [💫Computer,🌔Game-Engine]
tags: [Unity, Transform, Position]

date: 2023-04-11. 13:44
# last_modified_at: 2023-04-13. 14:51
last_modified_at: 2024-08-29. 22:30
---

- [유니티 Vector3는 스택에 생성된다, 값 형식이다, Struct](https://3dmpengines.tistory.com/1566)  
- [유니티 Vector3 Struct](https://answers.unity.com/questions/1033383/code-performance-when-to-use-new-on-vector3.html)  
- [C# new Struct](https://asta8080.tistory.com/5)  

<http://smilejsu.tistory.com/560>

<https://velog.io/@csm2652/C-Struct%EC%97%90%EC%84%9C%EC%9D%98-NEW-%ED%82%A4%EC%9B%8C%EB%93%9C>

<https://answers.unity.com/questions/225729/gameobject-positionset-not-working.html>

<https://forum.unity.com/threads/vector3-and-other-structs-optimization-of-operators.477338/>

<https://answers.unity.com/questions/1033383/code-performance-when-to-use-new-on-vector3.html>

<https://stackoverflow.com/questions/18732930/how-is-vector3-implemented-why-are-the-properties-readonly>

## 💫 다루는 주제

---

- transform.position = new Vector3(n, n, n);
  - 반복적인 'new' Vector3 는 퍼포먼스에 영향을 주지 않는가?
  - 왜 transform.position.Set() 은 의도대로 작동하지 않는가?
  - 왜 transform.position = new Vector3(n, n, n); 은 의도대로 작동하는가?
  - transform.position 는 어떻게 돌아가는 걸까? (뇌피셜)
  - transform.position.x 는 왜 readonly 인가?

## 💫 반복적인 'new' Vector3 는 퍼모먼스에 영향을 주지 않는가?

---

Vector3는 Class가 아니라 Struct.  
C#에서 Struct 생성 시 new 를 사용하는 것은, 단순히 구조체를 초기화하는 방법 중 하나  

스택에 단순히 Value 값 생성 파괴하는 것이기 때문에,  
힙에 클래스 생성 파괴할 때처럼 가비지가 생기지 않음  

참고 : 물론 Struct 생성자는 계속 호출되고 있음 !  

## 💫 왜 transform.position.Set() 은 의도대로 작동하지 않는가?

## 💫 왜 transform.position = new Vector3(n, n, n); 은 의도대로 작동하는가?

## 💫 transform.position 는 어떻게 돌아가는 걸까? (유추)

---

transform.position.Set() 은 의도대로 작동하지 않는다.  
근데 또 transform.position = new Vector3(n, n, n); 는 의도대로 작동한다.  
이건 처음 유니티를 다룰 때 겪게되는 경험과 사실  

transform.position은 프로퍼티인게 아닐까?  

```c#

private Vector3 realPosition;
public Vector3 position
{
	get => realPosition;
	set => realPosition = value;
}

```

Vector3는 위에서 언급했듯 Struct  

transform.position 역시 Vector3, Struct 이므로,  
transform.position으로 Get한 Vector3는, transform 내부에서 작동하는 실제 position이 아니라,  
실제 position과 값이 똑같은, 실제 position의 복사본 Vector3이 리턴되는 것  

때문에 복제되어 return된 Vector3를 아무리 Set() 해도, 실제 transform.position에 영향을 주지 않음.  

반대로 대입연산자로 프로퍼티에 직접적으로 Set 할 때는,  
넘겨준 Vector3가 프로퍼티가 가리키는 실제 포지션 값에 대입하기 때문에 의도대로 작동하지 않을까 싶음 !  

```c#

private Vector3 realPosition;
public Vector3 position
{
	get
	{
		return 월드 좌표계 기준 position;
	}
	set
	{
		realPosition = 로컬 좌표계 기준 value;
		오브젝트 위치 처리();
	}
}

```

물론 !  

실제로 내부 처리가 어떤지 잘 모르겠지만,  
위처럼 같은 일련의 처리과정이 더 복잡하게 있지 않을까 싶다  

## 💫 transform.position.x 는 왜 readonly 인가?

---

transform.position은 Vector3, Struct  

transform.position으로 Get하여 가져온 복제된 Vector3는,  
원본이 없는, 변수가 아닌, 사는 공간이 없는 Struct '값'  

Struct와 같은 값 형식인 int에 대하여, 100 = 0; 이 의미 없는 명령인 것 처럼,  
Struct도 '값' 에 값을 대입하는 일은 의미가 없다  

```c#
SomeStruct ss;
ss.SomeVar = 1;
```

이건 의미가 있다  
ss 라는 SomeStruct 변수의 SomeVar 값을 바꾸고 저장한다.  
결과가 남는다.  
