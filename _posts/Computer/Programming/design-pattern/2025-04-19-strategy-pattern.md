---
title: "Strategy Pattern"
# description: ""
categories: [컴퓨터, 프로그래밍]
tags: [Design-Pattern]
image: "/assets/img/background/kururu-lab.jpg"

date: 2025-04-19. 01:17 # Init
# last_modified_at: 2025-04-19. 01:17
---

## 머리말

---

## Strategy Pattern

---

## Code Block

---

팩토리 패턴과 함께 이런식으로 쓸 수 있다.  

```cs
public abstract class SomeStrategy
{
    public abstract void CreateSomeThing(ref SomeObject someObject);
}

public class SomeStrategyA: SomeStrategy
{
    public SomeStrategyA() { /* Constructor */ }

    public override void CreateSomeThing(ref SomeObject someObject)
    {
        someObject = new SomeObjectA();
    }
}

public class SomeClassB: SomeStrategy
{
    private SomeVariable someVariable; // Only for SomeClassB

    public SomeClassB(int a, int b)
    {
        someVariable = new SomeVariable();
    }

    public override void CreateSomeThing(ref SomeObject someObject)
    {
        someObject = new SomeObjectB();
    }
}

public class SomeFactory
{
    public SomeStrategy CreateSomeStrategy() => someEnum switch
    {
        SomeEnum.A => new SomeStrategyA(),
        SomeEnum.B => new SomeStrategyB(1, 2),
        _ => throw new ArgumentOutOfRangeException(nameof(someEnum), someEnum, null)
    };
}
```
