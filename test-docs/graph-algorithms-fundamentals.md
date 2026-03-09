---
title: "Graph Algorithms Fundamentals for ACM-ICPC"
author: "CompetitionTutor Team"
tags:
  - graph-algorithms
  - shortest-path
  - minimum-spanning-tree
  - ACM-ICPC
  - competitive-programming
difficulty: intermediate
prerequisite_topics:
  - basic-data-structures
  - priority-queues
  - recursion
related_topics:
  - dynamic-programming
  - greedy-algorithms
  - data-structures
---

# Graph Algorithms Fundamentals for ACM-ICPC

## Graph Representations

Before diving into algorithms, choosing the right graph representation is critical for both correctness and performance. The two primary representations are adjacency matrices and adjacency lists.

An **adjacency matrix** uses a 2D array where `matrix[i][j]` stores the edge weight between vertices i and j (or a boolean for unweighted graphs). This provides O(1) edge lookup but requires O(V^2) space, making it suitable only for dense graphs or small vertex counts (V <= 5000 in competitive programming).

An **adjacency list** stores, for each vertex, a list of its neighbors and edge weights. This uses O(V + E) space and is the standard choice for competitive programming since most contest problems feature sparse graphs.

```cpp
// Adjacency list representation
struct Edge {
    int to, weight;
};
vector<vector<Edge>> adj(N);

// Add undirected edge
adj[u].push_back({v, w});
adj[v].push_back({u, w});
```

A third representation, the **edge list**, stores all edges as triples (u, v, w). This is particularly useful for Kruskal's MST algorithm and Bellman-Ford, where iterating over all edges is the primary operation.

## BFS and DFS

Breadth-First Search (BFS) and Depth-First Search (DFS) are the two foundational graph traversal algorithms. Nearly every graph algorithm builds on one or both.

**BFS** explores vertices level by level using a queue. It naturally finds shortest paths in unweighted graphs and runs in O(V + E) time. BFS is the basis for algorithms like 0-1 BFS (for graphs with edge weights 0 and 1 only, using a deque) and multi-source BFS (starting from multiple sources simultaneously).

```cpp
vector<int> bfs(int start, const vector<vector<Edge>>& adj) {
    int n = adj.size();
    vector<int> dist(n, -1);
    queue<int> q;
    dist[start] = 0;
    q.push(start);

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (auto& [v, w] : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }
    return dist;
}
```

**DFS** explores as deep as possible before backtracking, using a stack (or recursion). DFS is the backbone of many advanced algorithms: cycle detection, topological sorting, finding connected components, bridge and articulation point detection, and strongly connected components (Tarjan's and Kosaraju's algorithms).

## Shortest Path Algorithms

### Dijkstra's Algorithm

Dijkstra's algorithm finds single-source shortest paths in graphs with non-negative edge weights. It uses a **priority queue** (min-heap) data structure to always process the vertex with the smallest tentative distance.

```cpp
vector<long long> dijkstra(int start, const vector<vector<Edge>>& adj) {
    int n = adj.size();
    vector<long long> dist(n, LLONG_MAX);
    priority_queue<pair<long long, int>,
                   vector<pair<long long, int>>,
                   greater<>> pq;

    dist[start] = 0;
    pq.push({0, start});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        if (d > dist[u]) continue;  // stale entry

        for (auto& [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}
```

With a binary heap, Dijkstra runs in O((V + E) log V). Using a Fibonacci heap, this improves to O(E + V log V), though Fibonacci heaps are rarely implemented in contests due to complexity.

### Bellman-Ford Algorithm

Bellman-Ford handles graphs with negative edge weights and can detect negative cycles. It relaxes all edges V-1 times, running in O(VE) time. The core relaxation step `dist[v] = min(dist[v], dist[u] + w(u,v))` is fundamentally a **Dynamic Programming** recurrence -- Bellman-Ford is DP over the number of edges in the shortest path.

The SPFA (Shortest Path Faster Algorithm) optimization uses a queue to avoid unnecessary relaxations, achieving much better average-case performance, though its worst case remains O(VE).

### Algorithm Comparison

| Algorithm | Time | Negative Weights | Negative Cycle Detection | Use Case |
|-----------|------|-------------------|--------------------------|----------|
| BFS | O(V + E) | No (unweighted) | No | Unweighted graphs |
| Dijkstra (binary heap) | O((V+E) log V) | No | No | Non-negative weights |
| Bellman-Ford | O(VE) | Yes | Yes | Negative weights |
| Floyd-Warshall | O(V^3) | Yes | Yes | All-pairs, small V |
| SPFA | O(VE) worst | Yes | Yes | Sparse, negative weights |

Floyd-Warshall, covered in detail in the **Dynamic Programming** guide, is the canonical all-pairs shortest path algorithm. Its DP formulation `dp[i][j][k]` considers paths through intermediate vertices {1, ..., k}.

## Minimum Spanning Trees

A Minimum Spanning Tree (MST) connects all vertices in an undirected weighted graph with minimum total edge weight. MST algorithms are classic examples of the **Greedy Algorithm** paradigm.

### Kruskal's Algorithm

Kruskal's algorithm sorts all edges by weight and greedily adds the lightest edge that does not create a cycle. Cycle detection is efficiently handled using a **Union-Find (Disjoint Set Union)** data structure with path compression and union by rank.

The greedy choice -- always selecting the minimum weight edge that connects two different components -- is provably optimal by the cut property of MSTs. This runs in O(E log E) time, dominated by the sorting step.

### Prim's Algorithm

Prim's algorithm grows the MST from a starting vertex, always adding the cheapest edge connecting a tree vertex to a non-tree vertex. Using a priority queue, it runs in O((V + E) log V), similar to Dijkstra's algorithm. In fact, Prim's and Dijkstra's share the same algorithmic skeleton -- the key difference is that Dijkstra tracks cumulative distances while Prim tracks individual edge weights.

Both Kruskal's and Prim's rely on the **Greedy Choice Property**: locally optimal decisions lead to a globally optimal MST. This property does NOT hold for many other graph problems (e.g., longest path in a general graph), where **Dynamic Programming** or other techniques are required.

## Topological Sort

Topological sorting produces a linear ordering of vertices in a Directed Acyclic Graph (DAG) such that for every directed edge (u, v), vertex u appears before v. This ordering exists if and only if the graph has no cycles.

Two standard algorithms exist:
1. **Kahn's Algorithm** (BFS-based): Repeatedly remove vertices with in-degree 0 and add them to the ordering. Runs in O(V + E).
2. **DFS-based**: Perform DFS and record vertices in reverse post-order. Also O(V + E).

Topological sort is a prerequisite for **DP on DAGs** -- once vertices are topologically ordered, we can compute shortest/longest paths in O(V + E) by processing vertices in order and relaxing outgoing edges. This is significantly faster than Dijkstra or Bellman-Ford and works with negative weights as long as the graph is acyclic.

Common applications in competitive programming include:
- Task scheduling with dependencies
- Course prerequisite chains
- Longest path in a DAG (critical path)
- Counting paths in a DAG (using DP after topological sort)

## Advanced Topics

Beyond the fundamentals, ACM-ICPC problems frequently combine graph algorithms with other paradigms:

- **Graph + DP**: Shortest paths with state (e.g., Dijkstra on a state-space graph where each node is (vertex, bitmask) for TSP-like problems)
- **Graph + Greedy**: Network flow algorithms use augmenting paths (BFS/DFS) with greedy residual updates
- **Graph + Data Structures**: Heavy-light decomposition, Euler tour + segment trees for path queries

Understanding when to apply **Dynamic Programming** versus **Greedy Algorithms** on graphs is a key competitive programming skill. If the problem has optimal substructure and the greedy choice property holds (as in MST), use greedy. If subproblems overlap and greedy choices are not provably optimal (as in general shortest paths with constraints), use DP.
