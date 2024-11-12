---
title: "LIS"
# description: ""
categories: [💫Computer, 🌓PS-Algorithm]
tags: [Algorithm, Dynamic-Programming, DP, LIS, Longest-Increasing-Subsequence]
image: "/assets/img/background/kururu-lab.jpg"

date: 2024-11-13. 01:24
last_modified_at: 2024-11-13. 01:24 # Init
---

## 💫 LIS

---

Longest Increasing Subsequence | 최장 증가 부분 수열  

DP로 풀 수 있는 문제.  
수열에서 가장 긴 증가 부분 수열을 찾는 문제.  

### 🫧 용어 정리

**부분 수열**  
= 수열의 원소 중 일부를 선택해서(혹은 제거해서) 만든 수열  
i.e. `1 2 3 4`에서 `1 3 4`, `2 4` 등  

**증가 부분 수열**  
= 오름차순으로 정렬된 부분 수열  
i.e. `1 2 3 4`, `3 5 7 9` 등  

**최장 증가 부분 수열**  
= 가장 긴 증가 부분 수열  

## 💫 알고리즘

---

### 🫧 O(N^2)

```cs
const int MX = 1005;
int a[MX];
int d[MX];

int main()
{
	int n;
	cin >> n;

	for (int i = 1; i <= n; i++)
		cin >> a[i];

	int mxLen = 0;
	for (int i = 1; i <= n; i++)
	{
		int curA = a[i];
		int curDMax = 0;

		for (int j = 0; j < i; j++)
		{
			int tarA = a[j];
			int tarD = d[j];

			if (tarA < curA)
				if (tarD >= curDMax)
					curDMax = tarD;
		}

		d[i] = curDMax + 1;
		mxLen = max(mxLen, d[i]);
	}

	cout << mxLen;
}
```

```cpp
int n;
cin >> n;

vector<int> a(n);
vector<int> d(n);

for (int i = 0; i < n; i++)
	cin >> a[i];

for (int i = 0; i < n; i++)
{
	d[i] = 1;
	
	for (int j = 0; j < i; j++)
		if (a[j] < a[i] && d[i] < d[j] + 1)
			d[i] = d[j] + 1;
}

cout << *max_element(d.begin(), d.end());
```

### 🫧 O(N log N)

TODO:  

## 💫 기록

---

- [참고 : '나무위키 - 최장 증가 부분 수열'](https://namu.wiki/w/최장%20증가%20부분%20수열)  

## 💫 문제

---

- [문제집](https://www.acmicpc.net/workbook/view/5079)
  - [X] [가장 긴 증가하는 부분 수열 (11053)](https://www.acmicpc.net/problem/11053)
  - [ ] [가장 긴 증가하는 부분 수열 2 (12015)](https://www.acmicpc.net/problem/12015)
  - [ ] [가장 긴 증가하는 부분 수열 3 (12738)](https://www.acmicpc.net/problem/12738)
  - [X] [가장 긴 증가하는 부분 수열 4 (14002)](https://www.acmicpc.net/problem/14002)
  - [ ] [가장 긴 증가하는 부분 수열 5 (14003)](https://www.acmicpc.net/problem/14003)
  - [ ] [가장 긴 증가하는 부분 수열 6 (17411)](https://www.acmicpc.net/problem/17411)
  - [ ] [가장 긴 증가하는 부분 수열 K (18837)](https://www.acmicpc.net/problem/18837)
  - [ ] [가장 긴 증가하는 부분 수열 k (18838)](https://www.acmicpc.net/problem/18838)
  - [ ] [가장 긴 증가하는 부분 수열 ks (18892)](https://www.acmicpc.net/problem/18892)
  - [X] [가장 큰 증가하는 부분 수열 (11055)](https://www.acmicpc.net/problem/11055)
  - [ ] [가장 큰 감소 부분 수열 (17216)](https://www.acmicpc.net/problem/17216)
  - [ ] [가장 긴 바이토닉 부분 수열 (11054)](https://www.acmicpc.net/problem/11054)
  - [X] [가장 긴 감소하는 부분 수열 (11722)](https://www.acmicpc.net/problem/11722)
  - [ ] [가장 긴 증가하는 팰린드롬 부분수열 (16161)](https://www.acmicpc.net/problem/16161)
