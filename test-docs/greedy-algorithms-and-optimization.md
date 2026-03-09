---
title: "Greedy Algorithms and Optimization Techniques"
author: "CompetitionTutor Team"
tags:
  - greedy-algorithms
  - optimization
  - ACM-ICPC
  - competitive-programming
difficulty: intermediate
prerequisite_topics:
  - sorting
  - basic-proof-techniques
  - basic-data-structures
related_topics:
  - dynamic-programming
  - graph-algorithms
  - divide-and-conquer
---

# Greedy Algorithms and Optimization Techniques

## The Greedy Choice Property

A greedy algorithm builds a solution incrementally, making the locally optimal choice at each step with the hope that these local optima lead to a global optimum. For this strategy to produce correct results, the problem must satisfy two properties:

1. **Greedy Choice Property**: A globally optimal solution can be arrived at by making locally optimal choices. Formally, there exists an optimal solution that includes the greedy choice at each step.
2. **Optimal Substructure**: An optimal solution to the problem contains optimal solutions to its subproblems. This property is shared with **Dynamic Programming**, but DP does not require the greedy choice property.

The proof technique for greedy correctness typically follows an **exchange argument**: assume an optimal solution that differs from the greedy solution, then show that swapping in the greedy choice does not worsen the solution. If `OPT` is an optimal solution and `G` is the greedy choice, we show:

`cost(OPT with G swapped in) <= cost(OPT)`

This exchange argument is the foundation for proving greedy optimality and is frequently tested in ACM-ICPC problem analysis.

## Activity Selection Problem

The Activity Selection problem is the canonical greedy problem: given n activities with start and finish times, select the maximum number of non-overlapping activities.

**Greedy strategy**: Sort activities by finish time and greedily select the next activity that starts after the current one ends.

```python
def activity_selection(activities):
    """
    Select maximum non-overlapping activities.
    activities: list of (start, finish) tuples
    Returns: list of selected activities
    """
    sorted_acts = sorted(activities, key=lambda x: x[1])
    selected = [sorted_acts[0]]
    last_finish = sorted_acts[0][1]

    for start, finish in sorted_acts[1:]:
        if start >= last_finish:
            selected.append((start, finish))
            last_finish = finish

    return selected

# Example
activities = [(1, 4), (3, 5), (0, 6), (5, 7), (3, 9), (5, 9),
              (6, 10), (8, 11), (8, 12), (2, 14), (12, 16)]
result = activity_selection(activities)
# Selects: (1,4), (5,7), (8,11), (12,16) -> 4 activities
```

The correctness proof uses the exchange argument: if any optimal solution does not include the activity with the earliest finish time, we can swap in that activity without reducing the count. Time complexity is O(n log n) due to sorting.

This problem generalizes to **interval scheduling** variants commonly seen in competitions: weighted activity selection (requires **Dynamic Programming** since greedy fails when activities have different weights), interval partitioning (minimum number of resources), and interval graph coloring.

## Huffman Coding

Huffman coding constructs an optimal prefix-free binary code for data compression. It is a fundamental application of the greedy paradigm and uses a **priority queue** data structure (the same structure central to **Graph Algorithms** like Dijkstra and Prim).

**Greedy strategy**: Repeatedly merge the two lowest-frequency symbols into a combined node. This bottom-up tree construction produces the minimum expected codeword length.

The algorithm runs in O(n log n) time where n is the alphabet size. Huffman coding achieves the theoretical lower bound for prefix-free codes, producing an encoding within 1 bit of the Shannon entropy `H = -sum(p_i * log2(p_i))` per symbol.

In competitive programming, Huffman coding appears in problems involving optimal merge patterns (merging sorted lists, cutting rods with minimum cost) where the greedy merge-smallest-first strategy applies.

## Fractional Knapsack

The Fractional Knapsack problem allows taking fractions of items. Unlike the 0/1 Knapsack (which requires **Dynamic Programming**), the fractional variant admits a simple greedy solution.

**Greedy strategy**: Sort items by value-to-weight ratio `v[i]/w[i]` in decreasing order. Take as much of each item as possible until the knapsack is full.

This works because taking items with the highest value density is provably optimal when fractions are allowed. The exchange argument: if an optimal solution takes less of a higher-density item in favor of more of a lower-density item, swapping fractions strictly improves (or maintains) total value.

Time complexity: O(n log n) for sorting.

**Critical distinction**: For the **0/1 Knapsack** problem, this greedy approach FAILS. Consider items with (weight, value): (10, 60), (20, 100), (30, 120) and capacity W=50. Greedy by ratio selects items 1 and 2 (value=160), but the optimal is items 2 and 3 (value=220). The 0/1 constraint destroys the greedy choice property, necessitating the **Dynamic Programming** approach with recurrence `dp[i][w] = max(dp[i-1][w], dp[i-1][w-w[i]] + v[i])`.

## When Greedy Fails

Recognizing when greedy does NOT work is as important as knowing when it does. Common failure patterns include:

**Coin Change Problem**: With standard denominations (1, 5, 10, 25), greedy works. But for arbitrary denominations like {1, 3, 4}, greedy fails: making change for 6 gives 4+1+1=3 coins, while optimal is 3+3=2 coins. The general coin change problem requires **Dynamic Programming**.

**Longest Path in General Graphs**: While shortest paths in DAGs can be solved greedily after topological sort (see **Graph Algorithms**), finding the longest path in a general graph is NP-hard. No greedy or polynomial-time algorithm exists (unless P=NP).

**Traveling Salesman Problem (TSP)**: The nearest-neighbor greedy heuristic can produce solutions far from optimal. Exact solutions require **Dynamic Programming** with bitmask states (O(2^n * n)) or other exponential-time methods.

**General rule of thumb**: Greedy works when choices are independent and locally optimal decisions do not constrain future choices in harmful ways. When choices interact or early decisions close off better future options, **Dynamic Programming** is likely needed.

## Greedy in Graph Algorithms

Several key **Graph Algorithms** are fundamentally greedy:

- **Kruskal's MST**: Greedily add the minimum weight edge that does not form a cycle
- **Prim's MST**: Greedily add the closest vertex to the current tree
- **Dijkstra's Shortest Path**: Greedily process the vertex with minimum tentative distance

All three rely on the greedy choice property, which is proven via the cut property (for MST) or the non-negative weight condition (for Dijkstra). When edge weights can be negative, Dijkstra's greedy approach fails and we need the Bellman-Ford algorithm, which uses a **Dynamic Programming** relaxation strategy instead.

Understanding the boundary between greedy-solvable and DP-required graph problems is a crucial skill in competitive programming. The key question is: can a locally optimal edge/vertex choice ever be suboptimal in the global solution? If yes, DP is required. If no (provable via exchange argument or cut property), greedy suffices.

## Comparison: Greedy vs Dynamic Programming vs Divide and Conquer

| Property | Greedy | Dynamic Programming | Divide and Conquer |
|----------|--------|--------------------|--------------------|
| Subproblem overlap | Not considered | Exploits overlap | No overlap |
| Choice strategy | Locally optimal | Considers all options | Recursive split |
| Proof of correctness | Exchange argument | Bellman optimality | Induction |
| Typical complexity | O(n log n) | O(n^2) or O(nW) | O(n log n) |
| Example | Activity selection | 0/1 Knapsack | Merge sort |

In competition settings, always consider greedy first (simpler, faster), then check if the greedy choice property holds. If not, fall back to **Dynamic Programming**. If subproblems are independent (no overlap), consider **Divide and Conquer** instead.
