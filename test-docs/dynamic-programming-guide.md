---
title: "Dynamic Programming for Competitive Programming"
author: "CompetitionTutor Team"
tags:
  - dynamic-programming
  - algorithms
  - ACM-ICPC
  - optimization
difficulty: intermediate
prerequisite_topics:
  - recursion
  - mathematical-induction
  - basic-data-structures
related_topics:
  - graph-algorithms
  - greedy-algorithms
  - divide-and-conquer
---

# Dynamic Programming for Competitive Programming

## Introduction

Dynamic Programming (DP) is one of the most powerful algorithmic paradigms in competitive programming. At its core, DP solves complex problems by breaking them into overlapping subproblems and storing solutions to avoid redundant computation. Unlike **Divide and Conquer**, which works best when subproblems are independent, DP thrives when subproblems share structure and overlap significantly.

The two essential properties that a problem must exhibit for DP to apply are:

1. **Optimal Substructure**: An optimal solution to the problem contains optimal solutions to its subproblems. This property is shared with **Greedy Algorithms**, but greedy methods make irrevocable local choices whereas DP considers all possibilities.
2. **Overlapping Subproblems**: The same subproblems are solved multiple times during a naive recursive approach. This is what distinguishes DP from standard divide and conquer.

In ACM-ICPC and similar contests, DP problems appear in roughly 30-40% of problem sets. Mastering DP patterns is essential for advancing past the intermediate level.

## Memoization vs Tabulation

There are two primary implementation strategies for dynamic programming: top-down memoization and bottom-up tabulation.

### Top-Down Memoization

Memoization starts from the original problem and recursively breaks it down, caching results as they are computed. This approach is intuitive because it mirrors the recursive structure of the problem directly.

```python
def fib_memo(n, memo={}):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib_memo(n - 1, memo) + fib_memo(n - 2, memo)
    return memo[n]
```

Advantages: only computes subproblems that are actually needed; natural to write from the recurrence relation. Disadvantage: recursive call stack overhead, which can cause stack overflow for large inputs (a common issue in competitive programming where `n` can reach 10^6 or more).

### Bottom-Up Tabulation

Tabulation builds solutions iteratively from the smallest subproblems upward. It eliminates recursion overhead and is generally preferred in competition settings for its predictable memory and time behavior.

```python
def fib_tab(n):
    if n <= 1:
        return n
    dp = [0] * (n + 1)
    dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]
    return dp[n]
```

In practice, experienced competitors default to bottom-up tabulation for most problems, switching to memoization only when the state space is sparse or the dependency order is complex.

## Common DP Patterns

### 0/1 Knapsack

The 0/1 Knapsack problem asks: given `n` items with weights `w[i]` and values `v[i]`, and a capacity `W`, maximize total value without exceeding capacity. Each item is either taken or left (unlike **Fractional Knapsack**, which can be solved greedily).

The recurrence relation is:

`dp[i][w] = max(dp[i-1][w], dp[i-1][w - w[i]] + v[i])` for `w >= w[i]`

This runs in O(nW) time and O(nW) space, though space can be optimized to O(W) by processing weights in reverse order. Note that this is pseudo-polynomial time -- when W is exponentially large, the problem becomes NP-hard and no true polynomial algorithm is known.

```cpp
int knapsack(int W, vector<int>& wt, vector<int>& val, int n) {
    vector<int> dp(W + 1, 0);
    for (int i = 0; i < n; i++) {
        for (int w = W; w >= wt[i]; w--) {
            dp[w] = max(dp[w], dp[w - wt[i]] + val[i]);
        }
    }
    return dp[W];
}
```

The **Greedy Algorithm** approach of selecting items by value-to-weight ratio works for the fractional variant but fails for 0/1 knapsack. This is a classic example of when greedy falls short and DP is required.

### Longest Increasing Subsequence (LIS)

Given a sequence of numbers, find the length of the longest strictly increasing subsequence. The standard DP recurrence is:

`dp[i] = max(dp[j] + 1)` for all `j < i` where `a[j] < a[i]`

The naive DP solution runs in O(n^2). However, there exists an elegant O(n log n) solution using binary search with a patience sorting approach, which maintains a list of smallest tail elements for increasing subsequences of each length.

### Longest Common Subsequence (LCS)

Given two strings X and Y of lengths m and n, find the longest subsequence common to both. The recurrence is:

```
dp[i][j] = dp[i-1][j-1] + 1                  if X[i] == Y[j]
dp[i][j] = max(dp[i-1][j], dp[i][j-1])       otherwise
```

This runs in O(mn) time. LCS has applications in diff utilities, bioinformatics (DNA sequence alignment), and version control systems. It can also be reduced to LIS in special cases, providing an O(n log n) solution when the alphabet is small.

### DP on Graphs

Dynamic programming is deeply connected to **Graph Algorithms**. Shortest path algorithms like Bellman-Ford are essentially DP over graph edges. The recurrence `dist[v] = min(dist[u] + w(u,v))` for all edges (u,v) is iterated until convergence. Floyd-Warshall for all-pairs shortest paths is another classic DP-on-graphs algorithm with recurrence:

`dp[i][j][k] = min(dp[i][j][k-1], dp[i][k][k-1] + dp[k][j][k-1])`

DAG (Directed Acyclic Graph) shortest/longest paths can be computed in O(V+E) using topological sort followed by DP relaxation, which is faster than general shortest path algorithms.

## Time Complexity Analysis

Understanding the time complexity of DP solutions is critical in competitive programming where time limits are strict (typically 1-2 seconds).

| Pattern | Time Complexity | Space Complexity | Notes |
|---------|----------------|-----------------|-------|
| 0/1 Knapsack | O(nW) | O(W) optimized | Pseudo-polynomial |
| LIS (naive) | O(n^2) | O(n) | Simple but slow |
| LIS (optimal) | O(n log n) | O(n) | Binary search approach |
| LCS | O(mn) | O(min(m,n)) optimized | Hirschberg for space |
| Floyd-Warshall | O(V^3) | O(V^2) | All-pairs shortest path |
| Bitmask DP | O(2^n * n) | O(2^n) | For n <= 20 typically |

A common technique for optimizing DP is **state compression**: reducing the number of dimensions by observing that only a sliding window of previous states is needed. For knapsack, this reduces space from O(nW) to O(W). For LCS, Hirschberg's algorithm achieves O(min(m,n)) space while maintaining O(mn) time.

When DP states grow too large, consider whether the problem might admit a **Greedy Algorithm** solution or a **Divide and Conquer** optimization like the Knuth optimization or Divide and Conquer DP optimization, which can reduce O(n^2) transitions to O(n log n).

## Practice Problems

For ACM-ICPC preparation, the following progression is recommended:

1. Fibonacci variants (warm-up)
2. Coin change and knapsack variants
3. LIS and LCS problems
4. Interval DP (matrix chain multiplication)
5. Tree DP (rooted tree problems)
6. Bitmask DP (TSP, assignment)
7. DP with graph algorithms (shortest paths, DAG DP)

Each category builds on the previous, and cross-referencing with **Graph Algorithms** and **Greedy Algorithms** problems strengthens understanding of when each paradigm applies.
