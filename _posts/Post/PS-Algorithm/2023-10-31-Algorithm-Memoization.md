---
title: "🌓 Memoization - 메모이제이션"
date: 2023-10-31. 14:43
last_modified_at: 2023-12-19. 02:16
categories: ⭐Computer 🌓PS-Algorithm
tag: Algorithm Memoization
--- 

## 💫 Memoization

---

분할정복의 장점(직관적이고 간결)과 동적 계획법의 장점(부문제 해답의 재사용)을 결합  
부분적인 결과들을 기록한 후 나중에 필요할 때 다시 계산할 필요 없이 재사용하는 기법  

@ 4_0001  

분할정복의 장점/외관 (직관적이고 간결)  
동적계획법의 장점/내부 (성능 - 부문제 해답의 재사용)  
결합  

분할정복의 개선이냐, DP의 하향식 접근이냐  
(어느쪽을 개선시켰는가에 대한 의견이 있지만 일단은)  

메모리를 희생시켜 실행 시간의 이점을 얻음  

```cs
int[] M = new int[MAX_SIZE]{0, 1};

int MemoFib(int n)
{
	if (n == 0) return 0;
	if (n == 1) return 1;
	if (M[n] == 0)
		M[n] = memo_fib(n - 1) + memo_fib(n - 2);
	return M[n];
}
```
