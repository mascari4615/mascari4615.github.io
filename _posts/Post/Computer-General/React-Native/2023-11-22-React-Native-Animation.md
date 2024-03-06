---
title: "🌒 React Native 리액트 네이티브 - Animation"
date: 2023-11-22. 13:09
last_modified_at: 2023-11-28. 15:21
categories: [⭐Computer, 🌒Programming]
tags: [Mobile, React-Native, Context]
---

@ 캐러셀 Carousel  

## 💫 Animation

---

애니메이션은 UI 요소가 작용할 때 명확한 피드백을 사용자에게 제공한다.  

리액트 네이티브가 제공하는 기능은 4가지로 요약할 수 있다.  

```js
import {Animated, Easing, PanResponder, LayoutAnimation} from 'react-native'
```

## 💫 특징

---

리액트 네이티브 애니메이션은 두 가지 모드로 동작한다.  

- 자바스크립트 엔진 애니메이션
- 네이티브 모듈 애니메이션

네이티브 모듈 애니메이션을 사용할 것을 권고한다.  

useNativeDriver 속성을 통해 어떤 모드로 애니메이션을 동작시킬지 결정할 수 있다.  

따라서 네이티브 모듈 애니메이션을 기반으로 하되, 불가능한 것들은 (fontSize, ...) useNativeDriver 속성을 이용하여 구현한다.  

## 💫 Animated가 제공하는 애니메이션 기능

---

- 애니메이션 보간값
  - `Value`
  - ValueXY

- 단일 애니메이션 제어
  - `timing()`
  - spring()
  - decay()
  - delay()
  - loop()

- 여러 개의 애니메이션 통합 제어
  - sequence()
  - parallel()
  - stagger()

- 애니메이션 연산
  - add()
  - substract()
  - multiply()
  - divide()
  - modulo()
  - diffClamp

- 애니메이션 이벤트
  - event()

- 애니메이션 대상 컴포넌트
  - `View`
  - Image
  - Text
  - ScrollView
  - FlatList
  - SectionList

### 🫧 Value 클래스

```js
export class Value
{
	constructor(value: number);
	setValue(value: numbe): void;

	// 콜백 함수를 통해 현재 보간 중인 값을 얻을 수 있다.
	// useEffect에서 add/remove 하는 식
	addListener(callback: ValueListenderCallback): string;
	removeListener(id: string): void;
	removeAllListeners(): void;

	// 입력 보간 값을 새로운 보간값으로 바꿀 수 있다.
	// i.e. 출력을 0 ~ 100, Red ~ Blue, 0deg ~ 360deg
	interpolate(config: InterpolationConfigType): AnimatedInterpolation;
	// animValue.interpolate({inputRange: [0, 1], outputRange: [0, 100]})
	// animValue.interpolate({inputRange: [0, 1], outputRange: ['red', 'blue']})
	// animValue.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']})
	// animValue.interpolate({inputRange: [0, 0.7, 1], outputRange: [Colors.lightBlue900, Colors.lime500, Colors.pink500]})

	// ~
}

type ValueListenerCallback = (stage: {value: number}) => void;

class AnimatedInterpolation
{
	interpolate(config: InterpolationConfigType): AnimatedInterpolation;
}

// inputRange를 벗어난 값이 발생했을 때 어떤 값으로 outputRange를 만들지 결정하는 속성
// clamp : 값 무시
// extend : 범위 내 값을 계산한 공식을 범위 외 값에도 똑같이 적용
// identity : 어떤 공식도 적용하지 않고 입력값 그대로 출력
type ExtrapolateType = 'extend' | 'identity' | 'clamp';

type InterpolationConfigType = 
{
	inputRange: number[];
	outputRange: number[] | string[];
	
	// Like Animated.timing
	easing?: (input: number) => number;
};
```

## 💫 동작 원리

---

리액트 네이티브 애니메이션은 CSS 애니메이션과 같은 개념이다.  

CSS 애니메이션은, transition이나 animate 스타일 속성에 애니메이션을 적용하고 싶은 다른 스타일 속성값을 조정하는 방식으로 동작한다.  

리액트 네이티브 애니메이션은, style 속성에 설정하는 opacity, transform 등의 스타일 속성에 보간한 값을 저장하는 Animated.Value 클래스 객체(인스턴스)를 설정하는 방식으로 동작한다.  

## 💫 구현

---

### 🫧 Animated.Value 클래스의 인스턴스 생성

Animated.Value 클래스의 인스턴스 생성으로 시작해도 되지만,  

리액트 네이티브 팀은 useRef 훅을 사용하여 Animated.Value 클래스의 인스턴스를 캐시하는 방법을 권장한다.  

```js
// O
const animValue = new Animated.Value(0)

// O (권장)
const animValue = useRef(new Animated.Value(0)).current
```

useRef을 사용하면, animValue를 단 한 번만 생성하고 재렌더링 시 재사용한다.  

### 🫧 Animated.Value 클래스의 인스턴스 적용

Animated.Value 클래스의 인스턴스를 컴포넌트의 스타일 속성에 적용한다.  

```js
const someViewAnimStyle= {opacity: animValue}
```

opacity 속성의 타입이 number가 아니라 Animated.Value 타입이므로 View 같은 컴포넌트는 이를 해석할 수 없다.  

때문에 Animated.View 같은 컴포넌트를 이용하여 스타일 속성 설정값이 Animated.Value 타입 객체인 스타일 속성을 처리할 수 있게 한다.  

```js
<Animated.View style={[styles.someView, someViewAnimStyle]}>
```

### 🫧 애니메이션 재생

애니메이션을 재생시키려면 onPress 등에서 코드를 실행해야 한다.  

```js
const onPress = () =>
{
	Animated.timing(animValue, {toValue:1, uesNativeDriver: true, duration: 1000}).start()
}
```

### 🫧 useRef 훅과 MutableRefObject 타입

useRef 훅은 `RefObject<T>` 또는  `MutableRefObject<T>` 을 반환할 수 있다.  

```js
function useRef<T>(initialValue: T): MutableRefObject<T>
```

MutableRefObject 제네릭 타입에는 다음 RefObject 타입처럼 current라는 속성이 있다. 다만 current의 타입은 T | null이 아니라 T이다. 즉, curren는 null이 될 수 없다.  

```js
interface MutableRefObject<T>
{
	current: T;
}
```

그러므로 animValue는 null이 될 수 없으며 변하지도 않는다. 때문에 굳이 animValue를 useMemo, useCallback의 의존성 목록에 추가할 필요가 없다.  

animValue가 아니라, animValue 내부의 value 속성의 값이 보간에 의해 0~1로 변하는 것이다.  

```js
const animValue = useRef(new Animted.Value(0)).current;
```

### 🫧 Animated.View와 Animated.createAnimatedComponent 함수

Animated.createAnimatedComponent 함수는 다른 컴포넌트를 매개변수로 입력받아 Animated.Value 타입 객체를 처리할 수 있는 기능을 가지는 새로운 컴포넌트를 만든다.  

자주 쓰이는 View, Text, Image는 굳이 생성하지 않아도 바로 사용할 수 있도록 컴포넌트를 제공한다.  

```js
type AnimatedComponent = Animated.createAnimatedComponent
export function createAnimatedComponent<T>(component: T): AnimatedComponent<T>;

Animated.View
// Animated.createAnimatedComponent(View)

Animated.Text
// Animated.createAnimatedComponent(Text)

Animated.Image
// Animated.createAnimatedComponent(Image)
```

### 🫧 Animated.timing

Animated.timing은 value와 config를 매개변수로 받아 Animated.CompositeAnimation 타입 객체를 반환하는 함수이다.  

```js
export const Animated.timing:
(
	value: Animated.Value | Animated.ValueXY,
	config: Animated.TimingAnimationConfig
) => Animated.ComposteAnimation;

// Animated.TimingAnimationConfig
interface AnimationConfig
{
	useNativeDriver: boolean;
}
interface TimingAnimationConfig extends AnimationConfig
{
	toValue: number | Animated.Value // new Animated.Value(시작값)의 끝값 설정
	duration?: number // 애니메이션 진행 시간 (millisecond)
	delay?: number // 애니메이션 진행 전 대기 시간
	easing?: (value: number) => nuber; // Easing이 사용하는 보간 함수
}

// Easing
export type EasingFunction = (value: number) => number;
export interface Easing
{
	linear: EasingFunction;
	ease: EasingFunction;
	// ~
}

// CompositeAnimation
export interface CompositeAnimation
{
	start: (callback?: EndCallback) => void;
	// ~
}
type EndResult = {finished: boolean};
type EndCallback = (result: EndResult) => void;
```

```js
// i.e.
Animated.timing
(
	// 대상
	animValue,
	// 애니메이션
	{
		useNativeDriver: true,
		toValue: show ? 0 : 1,
		duration: 1000,
		easing: Easing.bounce
	}
).start(
	(result: {finished: boolean}) => console.log(result)
	)

// result 매개변수는 항상 {finished: true} 이므로 () => console.log('animation end') 같이 구현해도 좋다
```

### 🫧 ransform Animation

@ 수업 중 생략  

### 🫧 Animated 연산 관련 함수

```js
type Value = Animated.Value
export function add(a: Value, b: Value): Animated.AnimatedInterpolation // +
export function substract(a: Value, b: Value): Animated.AnimatedInterpolation // -
export function multiply(a: Value, b: Value): Animated.AnimatedInterpolation // *
export function divide(a: Value, b: Value): Animated.AnimatedInterpolation // /
export function modulo(a: Value, b: Value): Animated.AnimatedInterpolation // %

// 매개변수가 number가 아닌 Animated.Value임을 주의
```
