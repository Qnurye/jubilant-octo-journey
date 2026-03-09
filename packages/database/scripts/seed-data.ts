/**
 * Seed Data: Comprehensive ACM + Math Modeling Knowledge Base
 *
 * Designed to exercise hybrid retrieval:
 * - Multi-hop prerequisite chains (graph traversal)
 * - Cross-document concept bridging (shared Concept nodes)
 * - Comparison relationships (COMPARED_TO edges)
 * - Synonym/paraphrase coverage (vector semantic matching)
 * - Mixed content types (code, formulas, tables)
 */

export interface SeedChunk {
  section: string;
  content: string;
  concepts: string[];
  hasCode?: boolean;
  hasFormula?: boolean;
  hasTable?: boolean;
}

export interface SeedDocument {
  url: string;
  title: string;
  format: 'markdown';
  chunks: SeedChunk[];
}

export interface SeedTriple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

// ============================================================================
// Documents
// ============================================================================

export const SEED_DOCUMENTS: SeedDocument[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // 1. 算法基础与递归
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://acm/recursion-basics',
    title: '递归与分治基础',
    format: 'markdown',
    chunks: [
      {
        section: 'recursion',
        content: `# 递归基础

递归（Recursion）是一种函数直接或间接调用自身的编程技巧。递归是理解分治法、动态规划、树形结构等高级算法的基石。

## 递归三要素

1. **递归终止条件（Base Case）**：防止无限递归
2. **递归关系（Recurrence Relation）**：问题如何分解为子问题
3. **递归方向**：确保每次递归都朝终止条件逼近

## 经典示例：阶乘

\`\`\`cpp
int factorial(int n) {
    if (n <= 1) return 1;       // base case
    return n * factorial(n - 1); // recurrence
}
\`\`\`

## 递归与栈

每次递归调用会在调用栈上创建新的栈帧。递归深度过大会导致栈溢出（Stack Overflow）。竞赛中通常需要注意递归深度限制，必要时手动设置栈大小或改写为迭代。`,
        concepts: ['递归', '分治法', '调用栈', '栈溢出', '基本情况'],
        hasCode: true,
      },
      {
        section: 'divide-and-conquer',
        content: `# 分治法

分治法（Divide and Conquer）将问题分解为若干规模较小的相同子问题，递归求解后合并结果。

## 分治三步骤

1. **分解（Divide）**：将原问题划分为若干子问题
2. **解决（Conquer）**：递归求解各子问题
3. **合并（Combine）**：将子问题的解合并为原问题的解

## 经典分治：归并排序

\`\`\`cpp
void mergeSort(vector<int>& arr, int l, int r) {
    if (l >= r) return;
    int mid = (l + r) / 2;
    mergeSort(arr, l, mid);
    mergeSort(arr, mid + 1, r);
    merge(arr, l, mid, r); // 合并两个有序子数组
}
\`\`\`

时间复杂度：$T(n) = 2T(n/2) + O(n) = O(n \\log n)$

## 主定理（Master Theorem）

对于递推式 $T(n) = aT(n/b) + f(n)$：
- 若 $f(n) = O(n^{\\log_b a - \\epsilon})$，则 $T(n) = \\Theta(n^{\\log_b a})$
- 若 $f(n) = \\Theta(n^{\\log_b a})$，则 $T(n) = \\Theta(n^{\\log_b a} \\log n)$
- 若 $f(n) = \\Omega(n^{\\log_b a + \\epsilon})$，则 $T(n) = \\Theta(f(n))$`,
        concepts: ['分治法', '归并排序', '主定理', '时间复杂度'],
        hasCode: true,
        hasFormula: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. 动态规划
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://acm/dynamic-programming',
    title: '动态规划',
    format: 'markdown',
    chunks: [
      {
        section: 'dp-intro',
        content: `# 动态规划

动态规划（Dynamic Programming, DP）是一种通过将复杂问题分解为重叠子问题来求解的算法设计方法。与分治法不同，动态规划的子问题之间存在重叠，通过记忆化避免重复计算。

## 适用条件

1. **最优子结构**：问题的最优解包含子问题的最优解
2. **重叠子问题**：递归求解时存在大量重复计算

## 实现方式

| 方式 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| 自顶向下（记忆化搜索） | 递归 + 缓存 | 只计算需要的状态 | 递归栈开销 |
| 自底向上（递推） | 循环填表 | 无递归开销 | 可能计算无用状态 |

## 基本步骤

1. 定义状态
2. 推导状态转移方程
3. 确定边界条件
4. 确定遍历顺序
5. （可选）空间优化`,
        concepts: ['动态规划', '最优子结构', '重叠子问题', '记忆化搜索', '状态转移方程'],
        hasTable: true,
      },
      {
        section: 'dp-knapsack',
        content: `## 0-1 背包问题

给定 n 个物品，每个物品有重量 w[i] 和价值 v[i]，背包容量为 W，求能装入背包的最大价值。

### 状态转移方程

$$dp[i][j] = \\max(dp[i-1][j],\\; dp[i-1][j-w[i]] + v[i])$$

### 实现

\`\`\`cpp
int knapsack(int n, int W, vector<int>& w, vector<int>& v) {
    vector<vector<int>> dp(n + 1, vector<int>(W + 1, 0));
    for (int i = 1; i <= n; i++)
        for (int j = 0; j <= W; j++) {
            dp[i][j] = dp[i-1][j];
            if (j >= w[i])
                dp[i][j] = max(dp[i][j], dp[i-1][j-w[i]] + v[i]);
        }
    return dp[n][W];
}
\`\`\`

### 空间优化

利用滚动数组将空间从 $O(nW)$ 优化至 $O(W)$：

\`\`\`cpp
int knapsack_opt(int n, int W, vector<int>& w, vector<int>& v) {
    vector<int> dp(W + 1, 0);
    for (int i = 1; i <= n; i++)
        for (int j = W; j >= w[i]; j--)  // 逆序！
            dp[j] = max(dp[j], dp[j-w[i]] + v[i]);
    return dp[W];
}
\`\`\`

注意逆序遍历是保证每个物品只选一次的关键。`,
        concepts: ['背包问题', '动态规划', '状态转移方程', '空间优化', '滚动数组'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'dp-lis',
        content: `## 最长递增子序列（LIS）

给定序列 $a_1, a_2, \\ldots, a_n$，求最长严格递增子序列的长度。

### 方法一：DP $O(n^2)$

$$dp[i] = \\max_{j<i,\\; a_j < a_i}(dp[j]) + 1$$

### 方法二：贪心 + 二分 $O(n \\log n)$

维护一个 tails 数组，tails[i] 表示长度为 i+1 的递增子序列的最小末尾元素。

\`\`\`cpp
int LIS(vector<int>& a) {
    vector<int> tails;
    for (int x : a) {
        auto it = lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else *it = x;
    }
    return tails.size();
}
\`\`\`

LIS 与最长公共子序列（LCS）之间存在联系：对于排列，LIS 等价于特定的 LCS 问题。`,
        concepts: ['最长递增子序列', '动态规划', '贪心算法', '二分查找', '最长公共子序列'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'dp-tree',
        content: `## 树形 DP

在树结构上进行动态规划，通常以 DFS 后序遍历的方式自底向上转移。

### 经典问题：树的最大独立集

给定一棵树，选择若干节点使得任意两个选中节点不相邻，求最大节点数。

\`\`\`cpp
int dp[N][2]; // dp[u][0] = 不选u, dp[u][1] = 选u

void dfs(int u, int fa) {
    dp[u][0] = 0;
    dp[u][1] = 1;
    for (int v : adj[u]) {
        if (v == fa) continue;
        dfs(v, u);
        dp[u][0] += max(dp[v][0], dp[v][1]);
        dp[u][1] += dp[v][0];
    }
}
\`\`\`

树形 DP 的关键是正确定义子树上的状态，并在 DFS 回溯时完成转移。树形 DP 需要熟悉 DFS 遍历和树的基本操作。`,
        concepts: ['树形DP', '动态规划', 'DFS', '最大独立集', '树'],
        hasCode: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. 图论
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://acm/graph-theory',
    title: '图论算法',
    format: 'markdown',
    chunks: [
      {
        section: 'graph-representation',
        content: `# 图的表示

## 邻接矩阵

用 $n \\times n$ 矩阵存储边的权值。适合稠密图。

\`\`\`cpp
int graph[N][N]; // graph[u][v] = weight
\`\`\`

空间 $O(V^2)$，查询 $O(1)$，遍历邻居 $O(V)$。

## 邻接表

每个节点维护一个邻居列表。适合稀疏图。

\`\`\`cpp
vector<pair<int,int>> adj[N]; // adj[u] = {(v, w), ...}
\`\`\`

空间 $O(V+E)$，遍历邻居 $O(\\deg(v))$。

## 链式前向星

竞赛中常用的高效邻接表替代：

\`\`\`cpp
int head[N], to[M], nxt[M], w[M], cnt;
void addEdge(int u, int v, int val) {
    to[++cnt] = v; w[cnt] = val;
    nxt[cnt] = head[u]; head[u] = cnt;
}
\`\`\`

空间紧凑，缓存友好，适合大规模图。`,
        concepts: ['图', '邻接矩阵', '邻接表', '链式前向星', '稀疏图', '稠密图'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'graph-bfs-dfs',
        content: `## BFS 与 DFS

### 广度优先搜索（BFS）

BFS 按层次遍历，使用队列。

\`\`\`cpp
void bfs(int start) {
    queue<int> q;
    q.push(start);
    vis[start] = true;
    while (!q.empty()) {
        int u = q.front(); q.pop();
        for (int v : adj[u])
            if (!vis[v]) { vis[v] = true; q.push(v); }
    }
}
\`\`\`

应用：无权图最短路、层次遍历、连通分量、二分图判定。

### 深度优先搜索（DFS）

DFS 沿路径深入到底再回溯，使用递归或显式栈。

\`\`\`cpp
void dfs(int u, int fa) {
    vis[u] = true;
    for (int v : adj[u])
        if (v != fa && !vis[v]) dfs(v, u);
}
\`\`\`

应用：拓扑排序、强连通分量（Tarjan）、割点割边、欧拉路径、树的遍历。

### BFS vs DFS

| 特性 | BFS | DFS |
|------|-----|-----|
| 数据结构 | 队列 | 栈/递归 |
| 空间 | O(V)（最坏情况宽度） | O(V)（最坏情况深度） |
| 最短路 | ✅（无权图） | ❌ |
| 拓扑排序 | ✅（Kahn 算法） | ✅（逆后序） |`,
        concepts: ['BFS', 'DFS', '拓扑排序', '强连通分量', '连通分量', '二分图'],
        hasCode: true,
        hasTable: true,
      },
      {
        section: 'graph-dijkstra',
        content: `## Dijkstra 算法

Dijkstra 算法求解**非负边权**图上的单源最短路径。核心思想是贪心：每次选取当前距离最小的未确定节点。

\`\`\`cpp
vector<long long> dijkstra(int src, vector<vector<pair<int,int>>>& adj) {
    int n = adj.size();
    vector<long long> dist(n, LLONG_MAX);
    priority_queue<pair<long long,int>, vector<pair<long long,int>>, greater<>> pq;
    dist[src] = 0;
    pq.push({0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;
        for (auto [v, w] : adj[u]) {
            if (dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}
\`\`\`

时间复杂度 $O((V+E) \\log V)$（优先队列实现）。

**限制**：不能处理负权边。存在负权时需使用 Bellman-Ford 或 SPFA。`,
        concepts: ['Dijkstra', '最短路径', '贪心算法', '优先队列'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'graph-bellman-ford',
        content: `## Bellman-Ford 算法

Bellman-Ford 可以处理**负权边**，并能检测**负权环**。

### 算法

对所有边进行 V-1 轮松弛：

\`\`\`cpp
struct Edge { int u, v, w; };

vector<long long> bellmanFord(int src, int n, vector<Edge>& edges) {
    vector<long long> dist(n, LLONG_MAX);
    dist[src] = 0;
    for (int i = 0; i < n - 1; i++)
        for (auto& e : edges)
            if (dist[e.u] != LLONG_MAX && dist[e.u] + e.w < dist[e.v])
                dist[e.v] = dist[e.u] + e.w;

    // 检测负权环
    for (auto& e : edges)
        if (dist[e.u] != LLONG_MAX && dist[e.u] + e.w < dist[e.v])
            throw runtime_error("Negative cycle detected");

    return dist;
}
\`\`\`

时间复杂度 $O(VE)$。

### SPFA（队列优化）

SPFA 是 Bellman-Ford 的队列优化版本，平均复杂度更优但最坏仍为 $O(VE)$。竞赛中常被卡，建议优先使用 Dijkstra（非负权时）。

### Dijkstra vs Bellman-Ford

| 特性 | Dijkstra | Bellman-Ford |
|------|----------|-------------|
| 负权边 | ❌ | ✅ |
| 负权环检测 | ❌ | ✅ |
| 时间复杂度 | $O((V+E)\\log V)$ | $O(VE)$ |
| 适用场景 | 非负权图 | 通用 |`,
        concepts: ['Bellman-Ford', '最短路径', '负权边', '负权环', 'SPFA'],
        hasCode: true,
        hasFormula: true,
        hasTable: true,
      },
      {
        section: 'graph-mst',
        content: `## 最小生成树

最小生成树（MST）是连通无向图中边权和最小的生成树。

### Kruskal 算法

贪心思想：按边权升序加边，用并查集判连通。

\`\`\`cpp
struct Edge { int u, v, w; };

int kruskal(int n, vector<Edge>& edges) {
    sort(edges.begin(), edges.end(), [](auto& a, auto& b) {
        return a.w < b.w;
    });
    DSU dsu(n);
    int total = 0, cnt = 0;
    for (auto& e : edges) {
        if (dsu.find(e.u) != dsu.find(e.v)) {
            dsu.unite(e.u, e.v);
            total += e.w;
            if (++cnt == n - 1) break;
        }
    }
    return total;
}
\`\`\`

时间复杂度 $O(E \\log E)$。

### Prim 算法

类似 Dijkstra，每次选离当前树最近的节点加入。适合稠密图。

时间复杂度：邻接矩阵 $O(V^2)$，优先队列 $O(E \\log V)$。

### Kruskal vs Prim

| | Kruskal | Prim |
|--|---------|------|
| 思路 | 选最小边 | 选最近点 |
| 数据结构 | 并查集 | 优先队列 |
| 适合 | 稀疏图 | 稠密图 |`,
        concepts: ['最小生成树', 'Kruskal', 'Prim', '并查集', '贪心算法'],
        hasCode: true,
        hasFormula: true,
        hasTable: true,
      },
      {
        section: 'graph-tarjan',
        content: `## Tarjan 算法

Tarjan 算法基于 DFS 求解有向图的**强连通分量（SCC）**。

### 核心概念

- **dfn[u]**：节点 u 的 DFS 访问序号
- **low[u]**：u 及其子树能回溯到的最小 dfn 值
- 当 dfn[u] == low[u] 时，u 是某个 SCC 的根

\`\`\`cpp
int dfn[N], low[N], timer;
stack<int> stk;
bool inStk[N];
vector<vector<int>> sccs;

void tarjan(int u) {
    dfn[u] = low[u] = ++timer;
    stk.push(u); inStk[u] = true;
    for (int v : adj[u]) {
        if (!dfn[v]) {
            tarjan(v);
            low[u] = min(low[u], low[v]);
        } else if (inStk[v]) {
            low[u] = min(low[u], dfn[v]);
        }
    }
    if (dfn[u] == low[u]) {
        vector<int> scc;
        while (true) {
            int v = stk.top(); stk.pop();
            inStk[v] = false;
            scc.push_back(v);
            if (v == u) break;
        }
        sccs.push_back(scc);
    }
}
\`\`\`

Tarjan 需要 DFS 基础。SCC 缩点后得到 DAG，可进一步做拓扑排序 + DP。`,
        concepts: ['Tarjan', '强连通分量', 'DFS', '缩点', '拓扑排序', 'DAG'],
        hasCode: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 4. 数据结构
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://acm/data-structures',
    title: '高级数据结构',
    format: 'markdown',
    chunks: [
      {
        section: 'dsu',
        content: `# 并查集（DSU / Union-Find）

并查集维护若干不相交集合，支持合并和查询操作。

## 基本操作

\`\`\`cpp
int fa[N], rnk[N];

void init(int n) {
    for (int i = 0; i < n; i++) { fa[i] = i; rnk[i] = 0; }
}

int find(int x) {
    return fa[x] == x ? x : fa[x] = find(fa[x]); // 路径压缩
}

void unite(int x, int y) {
    x = find(x); y = find(y);
    if (x == y) return;
    if (rnk[x] < rnk[y]) swap(x, y);
    fa[y] = x;
    if (rnk[x] == rnk[y]) rnk[x]++;
}
\`\`\`

路径压缩 + 按秩合并后，单次操作近 $O(1)$（严格 $O(\\alpha(n))$）。

## 应用

- Kruskal 最小生成树中判断连通性
- 连通分量动态维护
- 判断图中是否有环`,
        concepts: ['并查集', '路径压缩', '按秩合并', '连通分量'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'segment-tree',
        content: `# 线段树

线段树是一种用于维护区间信息的树形数据结构，支持 $O(\\log n)$ 的区间查询和修改。

## 基本实现

\`\`\`cpp
int tree[4*N], lazy[4*N];

void build(int node, int l, int r, int a[]) {
    if (l == r) { tree[node] = a[l]; return; }
    int mid = (l + r) / 2;
    build(2*node, l, mid, a);
    build(2*node+1, mid+1, r, a);
    tree[node] = tree[2*node] + tree[2*node+1];
}

void update(int node, int l, int r, int ql, int qr, int val) {
    if (ql <= l && r <= qr) {
        tree[node] += (r - l + 1) * val;
        lazy[node] += val;
        return;
    }
    pushDown(node, l, r);
    int mid = (l + r) / 2;
    if (ql <= mid) update(2*node, l, mid, ql, qr, val);
    if (qr > mid) update(2*node+1, mid+1, r, ql, qr, val);
    tree[node] = tree[2*node] + tree[2*node+1];
}
\`\`\`

## 应用场景

- 区间求和、区间最值
- 区间赋值、区间加
- 配合离散化处理大值域
- 可持久化线段树（主席树）用于区间第 k 小`,
        concepts: ['线段树', '区间查询', '懒传播', '主席树'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'binary-indexed-tree',
        content: `# 树状数组（BIT / Fenwick Tree）

树状数组是线段树的轻量替代，支持单点修改和前缀查询。

\`\`\`cpp
int bit[N];

void update(int i, int delta, int n) {
    for (; i <= n; i += i & (-i))
        bit[i] += delta;
}

int query(int i) {
    int sum = 0;
    for (; i > 0; i -= i & (-i))
        sum += bit[i];
    return sum;
}

int rangeQuery(int l, int r) {
    return query(r) - query(l - 1);
}
\`\`\`

## 树状数组 vs 线段树

| | 树状数组 | 线段树 |
|--|---------|--------|
| 代码量 | 极短 | 较长 |
| 常数 | 小 | 大 |
| 功能 | 前缀和/点更新 | 任意区间操作 |
| 区间修改 | 需差分技巧 | 原生支持 |
| 扩展性 | 有限 | 强（懒传播、可持久化） |

两者都是竞赛中处理区间问题的核心工具。`,
        concepts: ['树状数组', '线段树', '前缀和', '区间查询'],
        hasCode: true,
        hasTable: true,
      },
      {
        section: 'priority-queue',
        content: `# 优先队列与堆

优先队列（Priority Queue）基于堆实现，支持 $O(\\log n)$ 插入和 $O(1)$ 查询最值。

## C++ STL 用法

\`\`\`cpp
// 最大堆（默认）
priority_queue<int> maxHeap;

// 最小堆
priority_queue<int, vector<int>, greater<int>> minHeap;

// 自定义比较
priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;
\`\`\`

## 应用

- **Dijkstra 算法**：每次取距离最小的节点
- **Prim 算法**：每次取最近的待加入节点
- **Huffman 编码**：每次合并频率最小的两棵树
- **合并 K 个有序链表**
- **中位数维护**：对顶堆（一个最大堆 + 一个最小堆）

优先队列是贪心算法中最常用的数据结构之一。`,
        concepts: ['优先队列', '堆', 'Dijkstra', 'Prim', 'Huffman编码', '贪心算法'],
        hasCode: true,
        hasFormula: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 5. 贪心算法
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://acm/greedy',
    title: '贪心算法',
    format: 'markdown',
    chunks: [
      {
        section: 'greedy-intro',
        content: `# 贪心算法

贪心算法（Greedy Algorithm）在每一步选择中都采取当前最优的选择，期望导致全局最优解。

## 贪心的正确性

贪心不总是正确的。需要证明**贪心选择性质**和**最优子结构**：
- 贪心选择性质：局部最优选择可以构成全局最优解
- 最优子结构：问题的最优解包含子问题的最优解

## 贪心 vs 动态规划

| | 贪心 | DP |
|--|------|------|
| 选择策略 | 当前最优，不回溯 | 考虑所有子问题 |
| 时间 | 通常更快 | 通常更慢 |
| 正确性 | 需要证明 | 天然最优 |
| 适用 | 能证明贪心性质时 | 最优子结构 + 重叠子问题 |

## 经典贪心问题

- 区间调度（按结束时间排序）
- Huffman 编码
- Dijkstra 最短路径
- Kruskal / Prim 最小生成树
- 分数背包（与 0-1 背包不同！）`,
        concepts: ['贪心算法', '动态规划', '最优子结构', '贪心选择性质'],
        hasTable: true,
      },
      {
        section: 'greedy-interval',
        content: `## 区间调度问题

给定 n 个区间 $[l_i, r_i]$，选择最多的互不重叠区间。

### 贪心策略

按**结束时间**升序排序，依次选择不与已选区间冲突的区间。

\`\`\`cpp
int intervalScheduling(vector<pair<int,int>>& intervals) {
    sort(intervals.begin(), intervals.end(),
         [](auto& a, auto& b) { return a.second < b.second; });
    int count = 0, lastEnd = INT_MIN;
    for (auto& [l, r] : intervals) {
        if (l >= lastEnd) {
            count++;
            lastEnd = r;
        }
    }
    return count;
}
\`\`\`

### 变体

- **区间覆盖**：最少多少个区间覆盖目标区间
- **区间分组**：最少多少组使同组区间不重叠（答案 = 最大重叠深度）
- **加权区间调度**：每个区间有权值，求最大权值 → 需要 DP 而非贪心`,
        concepts: ['区间调度', '贪心算法', '排序'],
        hasCode: true,
        hasFormula: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 6. 字符串
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://acm/string-algorithms',
    title: '字符串算法',
    format: 'markdown',
    chunks: [
      {
        section: 'kmp',
        content: `# KMP 字符串匹配

KMP（Knuth-Morris-Pratt）算法在 $O(n+m)$ 时间内完成模式匹配，核心是预处理**失败函数（next 数组）**。

## 失败函数

next[i] 表示 pattern[0..i] 的最长相等前后缀长度。

\`\`\`cpp
vector<int> buildNext(const string& p) {
    int m = p.size();
    vector<int> next(m, 0);
    for (int i = 1, j = 0; i < m; i++) {
        while (j > 0 && p[i] != p[j]) j = next[j-1];
        if (p[i] == p[j]) j++;
        next[i] = j;
    }
    return next;
}

vector<int> kmpSearch(const string& text, const string& pattern) {
    auto next = buildNext(pattern);
    vector<int> matches;
    for (int i = 0, j = 0; i < text.size(); i++) {
        while (j > 0 && text[i] != pattern[j]) j = next[j-1];
        if (text[i] == pattern[j]) j++;
        if (j == pattern.size()) {
            matches.push_back(i - j + 1);
            j = next[j-1];
        }
    }
    return matches;
}
\`\`\`

KMP 的思想与 AC 自动机（多模式匹配）和后缀数组有关联。`,
        concepts: ['KMP', '字符串匹配', '失败函数', 'AC自动机'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'string-hash',
        content: `## 字符串哈希

字符串哈希将字符串映射为整数，用于 $O(1)$ 比较子串是否相等。

### Rabin-Karp 滚动哈希

\`\`\`cpp
const long long MOD = 1e9 + 7, BASE = 131;
long long pw[N], h[N]; // pw[i] = BASE^i, h[i] = hash(s[0..i-1])

void buildHash(const string& s) {
    pw[0] = 1;
    for (int i = 1; i <= s.size(); i++) {
        pw[i] = pw[i-1] * BASE % MOD;
        h[i] = (h[i-1] * BASE + s[i-1]) % MOD;
    }
}

long long getHash(int l, int r) { // [l, r], 0-indexed
    return (h[r+1] - h[l] * pw[r-l+1] % MOD + MOD) % MOD;
}
\`\`\`

### 应用

- 子串比较：$O(1)$ 判断两个子串是否相等
- 最长回文子串：二分 + 哈希
- 字符串去重
- 后缀排序的辅助

### 注意事项

哈希有碰撞概率。竞赛中常用**双模数哈希**降低碰撞风险。`,
        concepts: ['字符串哈希', 'Rabin-Karp', '滚动哈希', '子串比较'],
        hasCode: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 7. 数学建模：线性规划
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://math-modeling/linear-programming',
    title: '线性规划与优化',
    format: 'markdown',
    chunks: [
      {
        section: 'lp-basics',
        content: `# 线性规划

线性规划（Linear Programming, LP）是数学建模中最基础的优化方法。

## 标准形式

$$\\min \\mathbf{c}^T \\mathbf{x}$$
$$\\text{s.t.} \\quad A\\mathbf{x} \\leq \\mathbf{b}, \\quad \\mathbf{x} \\geq 0$$

其中 $\\mathbf{c}$ 为目标函数系数，$A$ 为约束矩阵，$\\mathbf{b}$ 为约束右端。

## 求解方法

1. **单纯形法**：沿可行域顶点搜索，实际中非常快
2. **内点法**：从内部逼近，适合大规模问题
3. **图解法**：仅限两个变量的教学场景

## Python 求解

\`\`\`python
from scipy.optimize import linprog

c = [-1, -2]  # 最小化（原问题是最大化，取负）
A_ub = [[1, 1], [2, 1]]
b_ub = [4, 6]
result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=[(0, None), (0, None)])
print(f"最优值: {-result.fun}, 最优解: {result.x}")
\`\`\``,
        concepts: ['线性规划', '单纯形法', '内点法', '优化'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'lp-duality',
        content: `## 对偶理论

每个线性规划（原问题）都有一个对偶问题。

### 原问题与对偶问题

| | 原问题 | 对偶问题 |
|--|--------|----------|
| 目标 | $\\min \\mathbf{c}^T\\mathbf{x}$ | $\\max \\mathbf{b}^T\\mathbf{y}$ |
| 约束 | $A\\mathbf{x} \\geq \\mathbf{b}$ | $A^T\\mathbf{y} \\leq \\mathbf{c}$ |
| 变量 | $\\mathbf{x} \\geq 0$ | $\\mathbf{y} \\geq 0$ |

### 对偶定理

- **弱对偶**：对偶问题的目标值 ≤ 原问题的目标值
- **强对偶**：若原问题有最优解，则对偶问题也有最优解，且两者目标值相等
- **互补松弛条件**：$x_i(\\sum_j a_{ij}y_j - c_i) = 0$

对偶理论在灵敏度分析和经济学解释中非常重要。竞赛中网络流的最大流-最小割定理就是 LP 对偶的特殊情况。`,
        concepts: ['对偶理论', '线性规划', '强对偶', '互补松弛', '最大流最小割'],
        hasFormula: true,
        hasTable: true,
      },
      {
        section: 'integer-programming',
        content: `## 整数规划

整数规划（Integer Programming, IP）要求部分或全部变量取整数值。

### 分类

- **纯整数规划**：所有变量取整
- **混合整数规划（MIP）**：部分变量取整
- **0-1 整数规划**：变量 ∈ {0, 1}

### 求解方法

1. **分支定界法（Branch and Bound）**：系统搜索 + LP 松弛剪枝
2. **割平面法**：添加约束逐步逼近整数解
3. **分支切割法**：结合分支定界和割平面

### Python 求解

\`\`\`python
from scipy.optimize import milp, LinearConstraint, Bounds

c = [-1, -2]
constraints = LinearConstraint([[1, 1], [2, 1]], ub=[4, 6])
integrality = [1, 1]  # 两个变量都取整数
result = milp(c, constraints=constraints, integrality=integrality,
              bounds=Bounds(0, None))
print(f"最优整数解: {result.x}, 最优值: {-result.fun}")
\`\`\`

0-1 整数规划与背包问题密切相关：0-1 背包本质上是一个 0-1 整数规划问题。`,
        concepts: ['整数规划', '分支定界', '线性规划', '背包问题', '0-1规划'],
        hasCode: true,
        hasFormula: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 8. 数学建模：概率与统计
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://math-modeling/probability-statistics',
    title: '概率统计建模',
    format: 'markdown',
    chunks: [
      {
        section: 'probability-models',
        content: `# 常用概率分布

## 离散分布

| 分布 | PMF | 均值 | 方差 | 应用 |
|------|-----|------|------|------|
| 二项分布 $B(n,p)$ | $\\binom{n}{k}p^k(1-p)^{n-k}$ | $np$ | $np(1-p)$ | 独立重复试验 |
| 泊松分布 $P(\\lambda)$ | $\\frac{\\lambda^k e^{-\\lambda}}{k!}$ | $\\lambda$ | $\\lambda$ | 稀有事件计数 |
| 几何分布 $Geo(p)$ | $(1-p)^{k-1}p$ | $1/p$ | $(1-p)/p^2$ | 首次成功 |

## 连续分布

| 分布 | PDF | 均值 | 方差 |
|------|-----|------|------|
| 均匀分布 $U(a,b)$ | $\\frac{1}{b-a}$ | $\\frac{a+b}{2}$ | $\\frac{(b-a)^2}{12}$ |
| 正态分布 $N(\\mu,\\sigma^2)$ | $\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$ | $\\mu$ | $\\sigma^2$ |
| 指数分布 $Exp(\\lambda)$ | $\\lambda e^{-\\lambda x}$ | $1/\\lambda$ | $1/\\lambda^2$ |

在数学建模中，正确识别数据所服从的分布是建模的第一步。`,
        concepts: ['概率分布', '正态分布', '泊松分布', '二项分布', '数学建模'],
        hasFormula: true,
        hasTable: true,
      },
      {
        section: 'hypothesis-testing',
        content: `## 假设检验

### 基本框架

1. 建立原假设 $H_0$ 和备择假设 $H_1$
2. 选择检验统计量
3. 确定显著性水平 $\\alpha$（通常 0.05）
4. 计算 p 值或临界值
5. 做出决策

### 常用检验

\`\`\`python
from scipy import stats

# t 检验：两组均值是否有显著差异
t_stat, p_value = stats.ttest_ind(group_a, group_b)

# 卡方检验：分类变量的独立性
chi2, p, dof, expected = stats.chi2_contingency(contingency_table)

# KS 检验：数据是否服从某分布
ks_stat, p_value = stats.kstest(data, 'norm', args=(mu, sigma))
\`\`\`

### 注意事项

- p 值不是"假设为真的概率"
- 多重检验需要 Bonferroni 校正
- 效应量比 p 值更重要`,
        concepts: ['假设检验', 'p值', 't检验', '卡方检验', '显著性水平'],
        hasCode: true,
        hasFormula: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 9. 数学建模：微分方程
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://math-modeling/differential-equations',
    title: '微分方程建模',
    format: 'markdown',
    chunks: [
      {
        section: 'ode-models',
        content: `# 常微分方程建模

## SIR 传染病模型

经典的传染病动力学模型：

$$\\frac{dS}{dt} = -\\beta SI$$
$$\\frac{dI}{dt} = \\beta SI - \\gamma I$$
$$\\frac{dR}{dt} = \\gamma I$$

其中 S（易感）、I（感染）、R（恢复），$\\beta$ 为传染率，$\\gamma$ 为恢复率。

基本再生数 $R_0 = \\beta / \\gamma$：$R_0 > 1$ 时疫情爆发。

### Python 数值求解

\`\`\`python
from scipy.integrate import odeint
import numpy as np

def sir_model(y, t, beta, gamma):
    S, I, R = y
    return [-beta*S*I, beta*S*I - gamma*I, gamma*I]

t = np.linspace(0, 100, 1000)
y0 = [0.99, 0.01, 0]
sol = odeint(sir_model, y0, t, args=(0.3, 0.1))
\`\`\`

SIR 模型是线性规划之外最常考的数学建模题型之一。`,
        concepts: ['微分方程', 'SIR模型', '传染病模型', '数值求解', '数学建模'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'population-models',
        content: `## 人口增长模型

### Malthus 模型（指数增长）

$$\\frac{dN}{dt} = rN \\implies N(t) = N_0 e^{rt}$$

### Logistic 模型（受限增长）

$$\\frac{dN}{dt} = rN\\left(1 - \\frac{N}{K}\\right)$$

解为 S 型曲线：$N(t) = \\frac{K}{1 + \\left(\\frac{K}{N_0}-1\\right)e^{-rt}}$

其中 K 为环境容纳量，r 为内禀增长率。

### Lotka-Volterra 捕食者-猎物模型

$$\\frac{dx}{dt} = \\alpha x - \\beta xy$$
$$\\frac{dy}{dt} = \\delta xy - \\gamma y$$

产生周期性振荡解，解释了自然界中捕食者-猎物数量的周期变化。

这些模型展示了微分方程在生态学、流行病学中的应用，与优化方法（如参数估计）形成互补。`,
        concepts: ['Logistic模型', '微分方程', '人口模型', 'Lotka-Volterra', '数学建模'],
        hasFormula: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 10. 数学建模：图论建模
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://math-modeling/graph-modeling',
    title: '图论建模方法',
    format: 'markdown',
    chunks: [
      {
        section: 'network-flow',
        content: `# 网络流

## 最大流问题

给定有向图 G=(V,E)、源点 s、汇点 t，每条边有容量 c(u,v)，求从 s 到 t 的最大流量。

### Ford-Fulkerson 方法

反复寻找增广路径，沿路径增加流量：

\`\`\`cpp
int bfs(int s, int t, vector<int>& parent) {
    fill(parent.begin(), parent.end(), -1);
    parent[s] = s;
    queue<pair<int,int>> q;
    q.push({s, INT_MAX});
    while (!q.empty()) {
        auto [u, flow] = q.front(); q.pop();
        for (auto [v, cap] : adj[u]) {
            if (parent[v] == -1 && cap > 0) {
                parent[v] = u;
                int new_flow = min(flow, cap);
                if (v == t) return new_flow;
                q.push({v, new_flow});
            }
        }
    }
    return 0;
}
\`\`\`

### 最大流-最小割定理

最大流的值等于最小割的容量。这是线性规划对偶理论在图论中的体现。

应用：二分图匹配、项目选择、图像分割。`,
        concepts: ['网络流', '最大流', '最小割', '增广路径', '二分图匹配', '线性规划'],
        hasCode: true,
      },
      {
        section: 'tsp-vrp',
        content: `## TSP 与 VRP

### 旅行商问题（TSP）

访问所有城市恰好一次并回到起点，求最短路径。TSP 是 NP-hard 问题。

#### 精确解法
- **状态压缩 DP**：$dp[S][i]$ 表示已访问集合 S 且当前在 i 的最短距离

$$dp[S][i] = \\min_{j \\in S, j \\neq i} (dp[S \\setminus \\{i\\}][j] + d[j][i])$$

时间 $O(2^n \\cdot n^2)$，适用于 $n \\leq 20$。

#### 近似/启发式
- **最近邻启发式**：贪心，每次去最近的未访问城市
- **2-opt 局部搜索**：反复翻转子路径寻找改进
- **模拟退火 / 遗传算法**：元启发式方法

### 车辆路径问题（VRP）

TSP 的推广：多辆车、有载重约束、有时间窗。

VRP 通常用列生成、分支定价或元启发式求解，是物流优化的核心问题。TSP 和 VRP 都与图论中的最短路径算法密切相关。`,
        concepts: ['TSP', 'VRP', '状态压缩DP', '动态规划', 'NP-hard', '模拟退火', '贪心算法'],
        hasFormula: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 11. 竞赛私域信息：ACM-ICPC 赛制与规则
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://competition/acm-icpc-rules',
    title: 'ACM-ICPC 竞赛规则与赛制',
    format: 'markdown',
    chunks: [
      {
        section: 'icpc-overview',
        content: `# ACM-ICPC 竞赛概述

ACM 国际大学生程序设计竞赛（International Collegiate Programming Contest, ICPC）是全球规模最大、最具影响力的大学生编程竞赛。

## 赛制规则

- **团队组成**：每队 3 名选手 + 1 名教练（教练不参与比赛）
- **比赛时长**：5 小时
- **题目数量**：通常 10-13 题（区域赛）或 12-15 题（世界总决赛）
- **设备限制**：3 人共用 1 台电脑
- **允许资料**：可携带不超过 25 页的纸质参考资料（Team Reference Document）
- **编程语言**：C/C++、Java、Python、Kotlin（具体取决于赛站）

## 排名规则

1. 首先按**解题数**降序排列
2. 解题数相同时，按**罚时**升序排列
3. 罚时计算：每道通过的题目，罚时 = 从比赛开始到该题首次通过的时间（分钟） + 每次错误提交罚 20 分钟
4. 比赛最后一小时封榜（Frozen），不显示其他队伍的提交结果

## 竞赛层级

| 层级 | 名称 | 规模 |
|------|------|------|
| 校级 | 校赛/选拔赛 | 各高校自行组织 |
| 省级 | 省赛/邀请赛 | 区域内高校参与 |
| 区域 | 区域赛（Regional） | 各大洲多个赛站 |
| 世界 | 世界总决赛（World Finals） | 每年约 130 支队伍 |`,
        concepts: ['ACM-ICPC', '竞赛规则', '罚时', '封榜', 'Team Reference Document'],
        hasTable: true,
      },
      {
        section: 'icpc-china-regionals',
        content: `## ICPC 中国区域赛

### 赛站设置（2024-2025 赛季）

中国大陆地区通常设置 6-8 个区域赛站，每年赛站城市可能变化。2024 赛季赛站包括：

- **南京站**（Nanjing Regional）：通常为赛季首站，题目难度中等偏上
- **合肥站**（Hefei Regional）：题目风格偏重数学和构造
- **上海站**（Shanghai Regional）：传统强站，题目质量高
- **杭州站**（Hangzhou Regional）：互联网公司赞助，难度梯度明显
- **成都站**（Chengdu Regional）：西部地区最大赛站
- **沈阳站**（Shenyang Regional）：东北地区赛站

### 晋级规则

- 每支队伍可报名参加**最多 2 个区域赛站**
- 区域赛金牌队伍获得世界总决赛资格（名额按赛站分配）
- 金牌比例约为参赛队伍的 10%，银牌 20%，铜牌 30%
- 获得 WF 资格的队伍中，同一学校最多派出 1 支队伍

### 报名要求

- 参赛选手必须为在校本科生或入学不超过 5 年的研究生
- 每人最多参加 2 次世界总决赛
- 每人最多参加 5 个赛季的区域赛`,
        concepts: ['ICPC区域赛', '中国赛站', '晋级规则', '报名要求', 'World Finals'],
      },
      {
        section: 'icpc-contest-strategy',
        content: `## ICPC 比赛策略

### 开局策略（前 30 分钟）

1. **全员读题**：3 人分别快速浏览所有题目
2. **识别签到题**：找出 2-3 道最简单的题目，尽快提交
3. **难度分级**：将题目标记为 Easy / Medium / Hard / Skip

### 中期策略（30 分钟 - 3 小时）

- **并行作业**：一人写代码，一人思考下一题，一人检查/准备代码
- **题目分配**：按个人擅长领域分配（几何手给几何题，DP 手给 DP 题）
- **调试优先级**：WA（Wrong Answer）的题优先级高于未开始的题
- **手写对拍**：对于 WA 的题，写暴力程序对拍找 bug

### 后期策略（最后 2 小时）

- **封榜后不要慌**：专注于自己的解题进度
- **最后一小时**：只提交有把握的题，避免增加罚时
- **冻结代码**：对于不确定的题解，用剩余时间仔细验证

### 经典比赛格言

"No more WA than accepted" —— 错误提交数不应超过通过题数，否则说明提交策略有问题。`,
        concepts: ['比赛策略', '开局策略', '团队协作', '对拍', '罚时优化'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 12. 竞赛私域信息：CUMCM 全国数学建模竞赛
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://competition/cumcm-rules',
    title: '全国大学生数学建模竞赛（CUMCM）',
    format: 'markdown',
    chunks: [
      {
        section: 'cumcm-overview',
        content: `# 全国大学生数学建模竞赛（CUMCM）

CUMCM（China Undergraduate Mathematical Contest in Modeling）是中国规模最大的大学生课外科技竞赛之一，由中国工业与应用数学学会主办，每年 9 月举行。

## 基本信息

- **参赛形式**：每队 3 人（同一学校，可跨院系），不允许有指导教师参与
- **比赛时长**：连续 3 天（72 小时），通常为周四 18:00 至周日 20:00
- **题目设置**：A 题和 B 题（本科组），C 题和 D 题（专科组），每队选做一题
- **提交物**：论文（PDF 格式，不超过 20 页）+ 支撑材料（代码、数据）
- **工具限制**：不限编程语言和软件（MATLAB、Python、R、SPSS 等均可）
- **查重机制**：使用论文查重系统，重复率过高直接取消成绩

## 奖项设置

| 奖项 | 比例 | 说明 |
|------|------|------|
| 国家一等奖 | 约 0.6% | 最高荣誉 |
| 国家二等奖 | 约 2.5% | 含金量高 |
| 省级一等奖 | 约 8% | 各赛区评审 |
| 省级二等奖 | 约 15% | 各赛区评审 |
| 省级三等奖 | 约 25% | 各赛区评审 |

每年参赛队伍约 6 万队（18 万人），是全球参赛人数最多的数学建模竞赛。`,
        concepts: ['CUMCM', '数学建模竞赛', '论文写作', '国赛', '72小时'],
      },
      {
        section: 'cumcm-problem-types',
        content: `## CUMCM 常见题型分类

### A 题：连续型建模

A 题通常涉及物理、工程类问题，需要使用连续数学工具。

**常见方法**：
- 微分方程建模（ODE/PDE）
- 优化模型（线性规划、非线性规划）
- 数值模拟（有限元、蒙特卡洛）
- 灵敏度分析和误差分析

**典型题目举例**：
- 2023A：定日镜场的优化设计（几何+优化）
- 2022A：波浪能最大输出功率设计（物理+优化）
- 2021A：FAST 主动反射面调节（几何+最优控制）

### B 题：离散型/数据驱动型建模

B 题通常涉及社会、经济、管理类问题，数据分析比重较大。

**常见方法**：
- 统计分析与回归建模
- 图论与网络优化
- 整数规划与组合优化
- 机器学习（近年趋势）

**典型题目举例**：
- 2023B：多波束测深海底覆盖宽度（几何+优化）
- 2022B：古代玻璃制品成分分析（聚类+判别分析）
- 2021B：乙醇偶合制备 C4 烯烃（回归+优化）`,
        concepts: ['连续型建模', '离散型建模', '微分方程', '统计分析', 'CUMCM题型'],
      },
      {
        section: 'cumcm-paper-structure',
        content: `## CUMCM 论文结构规范

### 标准论文结构

一篇高质量的数模论文通常包含以下部分：

1. **摘要**（约 400 字）
   - 问题概述
   - 使用的方法/模型
   - 关键结果和结论
   - 摘要质量直接影响评审第一印象

2. **问题重述与分析**
   - 用自己的语言重新描述问题
   - 分析问题的关键点和难点

3. **模型假设**
   - 合理的简化假设
   - 每条假设需要给出理由

4. **符号说明**
   - 表格形式列出所有符号及含义

5. **模型建立与求解**
   - 这是论文的核心部分
   - 建立数学模型，推导求解过程
   - 需要有清晰的数学公式和推导

6. **结果分析与检验**
   - 灵敏度分析
   - 误差分析
   - 模型验证

7. **模型评价与改进**
   - 优点与局限性
   - 可能的改进方向

8. **参考文献**

### 评审要点

- **创新性**：模型是否有新意，不是简单套用现成方法
- **合理性**：假设是否合理，方法是否适用
- **正确性**：计算过程和结果是否正确
- **清晰性**：论文表达是否清楚，图表是否规范
- **完整性**：是否回答了所有问题`,
        concepts: ['论文结构', '摘要写作', '模型假设', '灵敏度分析', '评审标准'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 13. 竞赛私域信息：MCM/ICM 美赛
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://competition/mcm-icm-rules',
    title: 'MCM/ICM 美国大学生数学建模竞赛',
    format: 'markdown',
    chunks: [
      {
        section: 'mcm-icm-overview',
        content: `# MCM/ICM 美国大学生数学建模竞赛

MCM（Mathematical Contest in Modeling）和 ICM（Interdisciplinary Contest in Modeling）统称"美赛"，由 COMAP（Consortium for Mathematics and Its Applications）主办，每年 2 月举行。

## 基本信息

- **参赛形式**：每队 3 人 + 1 名指导教师（教师不参与解题）
- **比赛时长**：连续 4 天（99 小时），通常周四至次周一
- **注册费**：每队 100 美元
- **提交物**：英文论文（PDF 格式，不超过 25 页含摘要页）
- **参赛资格**：全球在校大学生（本科或研究生均可）

## 题目设置

| 类别 | 题号 | 方向 |
|------|------|------|
| MCM | Problem A | 连续型（Continuous） |
| MCM | Problem B | 离散型（Discrete） |
| MCM | Problem C | 数据洞察（Data Insights） |
| ICM | Problem D | 运筹与网络科学 |
| ICM | Problem E | 环境科学 |
| ICM | Problem F | 政策（Policy） |

## 奖项设置

| 奖项 | 英文名 | 比例 |
|------|--------|------|
| 特等奖 | Outstanding Winner | 约 0.2% |
| 特等奖提名 | Finalist | 约 0.3% |
| 一等奖 | Meritorious Winner | 约 7% |
| 二等奖 | Honorable Mention | 约 15% |
| 三等奖 | Successful Participant | 约 60% |

每年约 2.8 万支队伍参赛（含约 2 万支中国队伍），C 题和 E 题选做人数最多。`,
        concepts: ['MCM', 'ICM', '美赛', 'COMAP', 'Outstanding Winner'],
        hasTable: true,
      },
      {
        section: 'mcm-icm-vs-cumcm',
        content: `## 美赛 vs 国赛对比

| 维度 | CUMCM（国赛） | MCM/ICM（美赛） |
|------|---------------|-----------------|
| 时长 | 72 小时 | 99 小时 |
| 语言 | 中文 | 英文 |
| 题目数 | 2 题选 1 | 6 题选 1 |
| 费用 | 免费 | 100 美元/队 |
| 论文页数 | ≤ 20 页 | ≤ 25 页 |
| 评审周期 | 约 3 个月 | 约 2 个月 |
| 特殊要求 | 查重 | 需含 1 页摘要（Summary Sheet） |
| 参赛时间 | 9 月 | 2 月 |

### 策略差异

**国赛侧重**：
- 数学推导的严谨性
- 模型的创新性和深度
- 对中国工程/社会问题的理解

**美赛侧重**：
- 英文学术写作能力
- 数据可视化和图表质量
- 摘要页（Summary Sheet）的质量权重极高
- 灵敏度分析和模型验证的完整性

### 时间分配建议（美赛 99 小时）

| 阶段 | 时间 | 任务 |
|------|------|------|
| Day 1 | 8h | 选题、文献调研、初步建模 |
| Day 2 | 14h | 核心模型建立与求解 |
| Day 3 | 14h | 补充模型、灵敏度分析、可视化 |
| Day 4 | 10h | 论文润色、摘要撰写、格式检查 |`,
        concepts: ['美赛对比', '国赛对比', '时间分配', '摘要写作', '策略差异'],
        hasTable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 14. 竞赛私域信息：OJ 平台与训练资源
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://competition/training-resources',
    title: 'ACM 训练平台与资源指南',
    format: 'markdown',
    chunks: [
      {
        section: 'online-judges',
        content: `# 主流 Online Judge 平台

## Codeforces

- **地址**：codeforces.com
- **特点**：全球最活跃的竞赛平台，定期举办 Div.1-4 比赛
- **Rating 系统**：类似 ELO，从 Newbie（灰色）到 Legendary Grandmaster（红色3000+）
- **题目难度标签**：800-3500，每 100 为一档
- **推荐用法**：参加每周 2-3 场比赛，赛后补题

| Rating | 段位 | 颜色 |
|--------|------|------|
| < 1200 | Newbie | 灰 |
| 1200-1399 | Pupil | 绿 |
| 1400-1599 | Specialist | 青 |
| 1600-1899 | Expert | 蓝 |
| 1900-2099 | Candidate Master | 紫 |
| 2100-2299 | Master | 橙 |
| 2300-2399 | International Master | 橙 |
| 2400-2599 | Grandmaster | 红 |
| 2600-2999 | International Grandmaster | 红 |
| ≥ 3000 | Legendary Grandmaster | 红 |

## AtCoder

- **地址**：atcoder.jp
- **特点**：日本平台，题目质量极高，重视思维能力
- **比赛类型**：ABC（入门）、ARC（进阶）、AGC（高级）
- **Rating 系统**：类似 CF，从灰到红

## 洛谷（Luogu）

- **地址**：luogu.com.cn
- **特点**：中文平台，题目翻译全面，社区活跃
- **推荐用法**：入门选手的首选刷题平台
- **特色功能**：题解、讨论、月赛、CSP/NOIP 真题集`,
        concepts: ['Codeforces', 'AtCoder', '洛谷', 'Online Judge', 'Rating系统'],
        hasTable: true,
      },
      {
        section: 'training-plan',
        content: `## ACM 新手训练计划

### 阶段一：基础入门（1-2 个月）

**目标**：Codeforces Rating 1200+

| 周 | 主题 | 推荐题目 |
|----|------|----------|
| 1-2 | 模拟、排序、贪心 | CF 800-1000 |
| 3-4 | 基础 DP（线性 DP、背包） | CF 1000-1200 |
| 5-6 | 基础图论（BFS/DFS） | CF 1000-1200 |
| 7-8 | 基础数据结构（栈、队列、set/map） | CF 1000-1200 |

### 阶段二：进阶提升（3-4 个月）

**目标**：Codeforces Rating 1600+

- 线段树、树状数组
- 区间 DP、树形 DP、状压 DP
- 最短路（Dijkstra、Bellman-Ford）
- 并查集、MST
- 字符串（KMP、哈希）
- 数论（GCD、快速幂、组合数）

### 阶段三：区域赛水平（6 个月+）

**目标**：Codeforces Rating 1900+，能在区域赛中拿牌

- 网络流
- 高级 DP（CDQ 分治、斜率优化）
- 高级数据结构（可持久化线段树、Splay/Treap）
- 计算几何
- 博弈论

### 每日训练节奏

- **工作日**：2 道题（1 道练习 + 1 道赛后补题），约 2 小时
- **周末**：参加一场 CF 比赛 + 赛后补题，约 4 小时
- **总计**：每周约 14 小时`,
        concepts: ['训练计划', 'Rating提升', '刷题策略', '阶段训练', '每日训练'],
        hasTable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 15. 竞赛私域信息：常见错误与调试
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://competition/common-mistakes',
    title: 'ACM 竞赛常见错误与调试技巧',
    format: 'markdown',
    chunks: [
      {
        section: 'common-mistakes',
        content: `# ACM 竞赛常见错误

## 运行时错误（RE）

| 错误类型 | 常见原因 | 解决方法 |
|----------|----------|----------|
| 段错误（SIGSEGV） | 数组越界、空指针 | 检查数组大小，通常开 2 倍 |
| 栈溢出（Stack Overflow） | 递归过深 | 手动设栈或改迭代 |
| 除零错误 | 模运算前未检查 | 加特判 |
| 非法内存访问 | vector 空时 back() | 先判空 |

## 错误答案（WA）

### 最常见原因排行

1. **int 溢出**：两个 int 相乘超过 2^31，用 long long
2. **边界条件**：n=0, n=1 的特殊情况
3. **模运算遗漏**：中间计算溢出后再取模已经错了
4. **多测没清空**：memset 或数组清零遗漏
5. **图论自环/重边**：未考虑自环和平行边

### int 溢出速查

\`\`\`cpp
// 危险操作
int a = 1e5, b = 1e5;
int c = a * b;  // 溢出！10^10 > 2^31

// 正确做法
long long c = (long long)a * b;  // 或 1LL * a * b
\`\`\`

## 超时（TLE）

### 时间复杂度参考（1 秒时限）

| 数据规模 n | 可接受复杂度 |
|-----------|-------------|
| ≤ 20 | O(2^n), O(n!) |
| ≤ 100 | O(n^3) |
| ≤ 3000 | O(n^2) |
| ≤ 10^5 | O(n√n), O(n log^2 n) |
| ≤ 10^6 | O(n log n) |
| ≤ 10^8 | O(n) |

### 常见优化手段

- **快速 I/O**：\`ios::sync_with_stdio(false); cin.tie(nullptr);\`
- **避免 endl**：用 '\\n' 替代 endl（endl 会 flush）
- **减少 STL 开销**：用数组替代 map/set（常数小 5-10 倍）
- **手动内联**：对频繁调用的小函数用 inline`,
        concepts: ['常见错误', '运行时错误', 'WA调试', '超时优化', 'int溢出'],
        hasCode: true,
        hasTable: true,
      },
      {
        section: 'debugging-techniques',
        content: `## 竞赛调试技巧

### 对拍（Brute Force Checker）

对拍是 ACM 竞赛中最重要的调试技巧。步骤：

1. 写一个暴力解法（brute.cpp），保证正确但可能很慢
2. 写一个随机数据生成器（gen.cpp）
3. 循环运行，比较两者输出

\`\`\`bash
#!/bin/bash
# checker.sh
g++ -O2 -o sol sol.cpp
g++ -O2 -o brute brute.cpp
g++ -O2 -o gen gen.cpp

for ((i = 1; ; i++)); do
    ./gen $i > input.txt
    ./sol < input.txt > out1.txt
    ./brute < input.txt > out2.txt
    if ! diff -q out1.txt out2.txt > /dev/null; then
        echo "WA on test $i"
        cat input.txt
        break
    fi
    echo "Test $i: OK"
done
\`\`\`

### 调试输出技巧

\`\`\`cpp
#ifdef LOCAL
#define debug(x) cerr << #x << " = " << (x) << endl
#define debugv(v) { cerr << #v << " = ["; for(auto& x:v) cerr << x << " "; cerr << "]" << endl; }
#else
#define debug(x)
#define debugv(v)
#endif
\`\`\`

编译时加 \`-DLOCAL\` 即可启用调试输出，提交时自动关闭。

### 常用调试策略

1. **打表找规律**：输出小数据的所有答案，观察规律
2. **二分错误位置**：注释一半代码，缩小 bug 范围
3. **极端数据测试**：n=1, 全相同, 全递增, 全递减
4. **手动模拟**：对小数据手算一遍，对比程序输出`,
        concepts: ['对拍', '调试技巧', '随机数据生成', '调试宏', '极端测试'],
        hasCode: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 16. 私域深链：华科 ACM 集训队内部资料（虚构）
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://private/hust-acm-team',
    title: '华科 ACM 集训队 2024 年度总结',
    format: 'markdown',
    chunks: [
      {
        section: 'hust-acm-overview',
        content: `# 华科 ACM 集训队 2024 年度总结

## 队伍概况

华中科技大学 ACM-ICPC 集训队 2024 赛季共有 42 名正式队员，组成 14 支参赛队伍。

### 赛季成绩

| 赛站 | 队伍 | 成绩 |
|------|------|------|
| ICPC 南京站 | HUSTxiaolong | 金牌（第 18 名） |
| ICPC 合肥站 | HUSTdragon | 银牌（第 35 名） |
| ICPC 杭州站 | HUSTxiaolong | 金牌（第 12 名） |
| CCPC 桂林站 | HUSTphoenix | 铜牌 |
| EC Final | HUSTxiaolong | 银牌（第 28 名） |

### 晋级世界总决赛

HUSTxiaolong 队（成员：张启明、李文博、王思远）凭借南京站和杭州站双金成绩，获得 2025 ICPC World Finals（哈萨克斯坦阿斯塔纳）参赛资格。

### 队伍特色训练体系

华科集训队采用"分层递进"训练模式：
- **新手营**（大一）：基础算法 + 每周 2 场 Virtual Contest
- **进阶组**（大二）：专题训练 + 每周 1 场区域赛模拟
- **主力队**（大三）：自由组队 + 赛前集中封闭训练

封闭训练期间每天安排：上午 5 小时模拟赛，下午补题 + 专题讲座，晚上自由训练。`,
        concepts: ['华科ACM', 'ICPC区域赛', 'World Finals', '集训队', '分层递进训练'],
        hasTable: true,
      },
      {
        section: 'hust-training-secrets',
        content: `## 华科集训队内部训练秘籍

### "三三制"分工策略

华科 HUSTxiaolong 队在 ICPC 比赛中采用独创的"三三制"分工：

1. **前 30 分钟：全员速读**
   - 3 人各读 1/3 题目，用颜色标记难度（绿/黄/红）
   - 交叉确认签到题，15 分钟内锁定前 2 道

2. **中期：角色轮换**
   - 键盘手（主写代码）每 45 分钟轮换一次
   - 非键盘手负责纸上推导和对拍准备
   - 发现 WA 时立即启动"双人审查"：一人逐行读代码，另一人构造极端数据

3. **封榜后：信任机制**
   - 只提交有完整对拍验证的题解
   - 对于 Hard 题，必须 2 人独立验证思路一致才提交
   - 最后 30 分钟冻结提交，检查已过题的代码正确性

### 专题训练重点

2024 赛季，教练组根据近年区域赛出题趋势，制定了以下专题重点：

| 专题 | 优先级 | 对应训练题量 |
|------|--------|-------------|
| 线段树合并 + 可持久化 | ★★★ | 30 题 |
| 虚树 + 树链剖分 | ★★★ | 25 题 |
| 生成函数 + 多项式 | ★★☆ | 20 题 |
| 网络流建模 | ★★★ | 35 题 |
| 字符串（SAM/SA） | ★★☆ | 15 题 |
| 计算几何 | ★☆☆ | 10 题 |`,
        concepts: ['三三制', '比赛策略', '团队协作', '专题训练', '封闭训练'],
        hasTable: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 17. 私域深链：虚构竞赛题目解析（用于深链测试）
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://private/problem-analysis',
    title: '经典竞赛题目深度解析',
    format: 'markdown',
    chunks: [
      {
        section: 'problem-scc-dp',
        content: `# 题目解析：DAG 上的最长路（ICPC 2024 南京站 G 题）

## 题意

给定 n 个点 m 条边的有向图，可能含环。求从任意起点出发能经过的最多**不同**节点数。

## 解题思路：Tarjan 缩点 + 拓扑排序 + DP

这道题是一个经典的多步骤综合题，需要将多个知识点串联使用：

### 第一步：Tarjan 求强连通分量（SCC）

有向图可能含环，无法直接 DP。先用 Tarjan 算法求出所有 SCC，每个 SCC 内的节点互相可达，缩为一个"超级节点"。

### 第二步：SCC 缩点建 DAG

将每个 SCC 缩为一个点，SCC 之间的边构成 DAG。超级节点的权值 = SCC 内节点数。

### 第三步：拓扑排序 + DP

在 DAG 上进行拓扑排序，然后用 DP 求最长路径（以节点权值为距离）。

$$dp[v] = \\max_{(u,v) \\in E_{DAG}} (dp[u] + w[v])$$

### 知识链

解这道题需要的完整知识链：
递归 → DFS → Tarjan（强连通分量）→ 缩点（建 DAG）→ 拓扑排序 → 动态规划

这是一个典型的 **6 跳知识链**，如果只会其中部分知识点无法完成解题。`,
        concepts: ['Tarjan', '强连通分量', '缩点', '拓扑排序', '动态规划', 'DAG最长路'],
        hasCode: false,
        hasFormula: true,
      },
      {
        section: 'problem-persistent-segtree',
        content: `# 题目解析：区间第 k 小（ICPC 2024 杭州站 E 题）

## 题意

给定长度为 n 的数组，q 次查询，每次给出 [l, r, k]，求区间 [l,r] 内第 k 小的元素。

## 解题思路：主席树（可持久化线段树）

### 前置知识链

解题需要逐步掌握以下知识：

1. **递归基础** → 理解线段树的递归结构
2. **线段树** → 理解区间查询的分治思想
3. **前缀和思想** → 理解"第 r 棵树减第 l-1 棵树"的差分技巧
4. **可持久化** → 每次修改只新建 O(log n) 个节点，保留历史版本
5. **离散化** → 将值域压缩到 [1, n] 以建线段树

### 核心代码

\`\`\`cpp
int build(int l, int r) {
    int p = ++tot;
    if (l == r) return p;
    int mid = (l + r) / 2;
    ls[p] = build(l, mid);
    rs[p] = build(mid + 1, r);
    return p;
}

int update(int pre, int l, int r, int x) {
    int p = ++tot;
    ls[p] = ls[pre]; rs[p] = rs[pre]; cnt[p] = cnt[pre] + 1;
    if (l == r) return p;
    int mid = (l + r) / 2;
    if (x <= mid) ls[p] = update(ls[pre], l, mid, x);
    else rs[p] = update(rs[pre], mid + 1, r, x);
    return p;
}

int query(int u, int v, int l, int r, int k) {
    if (l == r) return l;
    int mid = (l + r) / 2;
    int leftCnt = cnt[ls[v]] - cnt[ls[u]];
    if (k <= leftCnt) return query(ls[u], ls[v], l, mid, k);
    else return query(rs[u], rs[v], mid + 1, r, k - leftCnt);
}
\`\`\`

知识链：递归 → 线段树 → 前缀和 → 可持久化线段树（主席树）→ 离散化应用`,
        concepts: ['主席树', '线段树', '可持久化', '离散化', '区间第k小', '前缀和'],
        hasCode: true,
        hasFormula: false,
      },
      {
        section: 'problem-flow-matching',
        content: `# 题目解析：最优任务分配（CUMCM 2024 B 题简化版）

## 题意

有 n 个工人和 m 个任务，每个工人有技能集合，每个任务需要特定技能。每个工人同时只能做一个任务，每个任务只需一个工人。目标：最大化完成的任务数。

## 解题思路：二分图最大匹配 → 网络流

### 知识链

这道题的完整推导链路：

1. **图的表示**（邻接表）→ 建模工人-任务的匹配关系
2. **BFS** → 理解增广路的搜索过程
3. **网络流**（Ford-Fulkerson）→ 建源点汇点，工人→任务连容量 1 的边
4. **最大流 = 最大匹配**（König 定理）→ 二分图最大匹配等价于最大流
5. **对偶理论**（最大流-最小割）→ 分析瓶颈，找出哪些技能最稀缺
6. **线性规划松弛** → 若允许部分分配，LP 松弛给出上界

### 建模延伸

如果加入"每个工人有成本"的约束，问题变为**最小费用最大流**。
如果加入"时间窗"约束，问题变为 **VRP 变体**。

这道题展示了从基础图论到运筹优化的完整知识链：
图表示 → BFS → 网络流 → 最大流最小割 → 对偶理论 → 线性规划`,
        concepts: ['二分图匹配', '网络流', '最大流最小割', '对偶理论', '线性规划', 'König定理'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 18. 私域深链：学习路线图（用于长链推理测试）
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://private/learning-roadmap',
    title: '竞赛知识学习路线图',
    format: 'markdown',
    chunks: [
      {
        section: 'roadmap-dp-advanced',
        content: `# DP 进阶学习路线图

## 从零到区域赛金牌的 DP 学习路径

这是华科集训队教练组推荐的 DP 专题学习路线，每一步都建立在前一步的基础上：

### 第一阶段：基础 DP（2 周）
- **递归** → 理解子问题分解和终止条件
- **记忆化搜索** → 从递归到 DP 的过渡
- **线性 DP** → 最长递增子序列(LIS)、最长公共子序列(LCS)
- **背包 DP** → 0-1 背包、完全背包、分组背包

### 第二阶段：结构化 DP（3 周）
- **区间 DP** → 石子合并、矩阵链乘法
  - 前置：线性 DP + 分治思想
- **树形 DP** → 最大独立集、换根 DP
  - 前置：DFS + 树遍历 + 线性 DP
- **状态压缩 DP** → TSP、棋盘覆盖
  - 前置：位运算 + 基础 DP

### 第三阶段：优化 DP（4 周）
- **单调队列优化** → 滑动窗口最大值
  - 前置：线性 DP + 单调队列数据结构
- **斜率优化（李超线段树）** → 决策单调性
  - 前置：凸包 + 线段树 + 线性 DP
- **CDQ 分治优化** → 多维偏序 DP
  - 前置：分治法 + 归并排序 + 树状数组

### 第四阶段：综合应用（持续）
- **DP + Tarjan 缩点** → DAG 上 DP
- **DP + 网络流** → 最小割与 DP 对偶
- **DP + 数论** → 计数 DP 配合组合数学`,
        concepts: ['DP学习路线', '区间DP', '状态压缩DP', '斜率优化', 'CDQ分治', '换根DP'],
      },
      {
        section: 'roadmap-graph-advanced',
        content: `# 图论进阶学习路线图

## 从 BFS/DFS 到网络流的完整路径

### Level 1：基础搜索（1 周）
- **BFS** → 无权最短路、层次遍历
- **DFS** → 连通性、回溯、树遍历

### Level 2：基础图算法（2 周）
- **拓扑排序** → 前置：BFS（Kahn 算法）或 DFS（逆后序）
- **Dijkstra** → 前置：BFS + 贪心 + 优先队列
- **Bellman-Ford / SPFA** → 前置：图的松弛操作
- **并查集** → 前置：路径压缩 + 按秩合并

### Level 3：树上算法（2 周）
- **最小生成树**（Kruskal/Prim） → 前置：并查集 + 贪心 + 优先队列
- **LCA（最近公共祖先）** → 前置：DFS + 倍增法
- **树链剖分** → 前置：DFS + LCA + 线段树
- **虚树** → 前置：LCA + DFS 序 + 单调栈

### Level 4：高级图论（3 周）
- **Tarjan**（SCC/割点/桥） → 前置：DFS + 时间戳
- **2-SAT** → 前置：Tarjan + 缩点 + 拓扑排序
- **网络流** → 前置：BFS + 图建模
- **最小费用最大流** → 前置：网络流 + Bellman-Ford/SPFA
- **二分图匹配**（Hungarian/Hopcroft-Karp） → 前置：BFS + 增广路

### Level 5：图论与其他领域交叉
- **最大流最小割** ↔ 线性规划对偶
- **二分图匹配** ↔ König 定理 ↔ 最小顶点覆盖
- **图上 DP** → Tarjan 缩点 + 拓扑排序 + DP`,
        concepts: ['图论路线', 'LCA', '树链剖分', '虚树', '2-SAT', '最小费用最大流'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 19. 数论
  // ──────────────────────────────────────────────────────────────────────────
  {
    url: 'seed://acm/number-theory',
    title: '数论基础',
    format: 'markdown',
    chunks: [
      {
        section: 'gcd-modular',
        content: `# 数论基础

## GCD 与扩展欧几里得

\`\`\`cpp
int gcd(int a, int b) { return b ? gcd(b, a % b) : a; }

// 扩展欧几里得：ax + by = gcd(a, b)
int exgcd(int a, int b, int& x, int& y) {
    if (!b) { x = 1; y = 0; return a; }
    int d = exgcd(b, a % b, y, x);
    y -= (a / b) * x;
    return d;
}
\`\`\`

## 模运算

- $(a + b) \\mod m = ((a \\mod m) + (b \\mod m)) \\mod m$
- $(a \\cdot b) \\mod m = ((a \\mod m) \\cdot (b \\mod m)) \\mod m$
- 除法需要**乘法逆元**：$a/b \\mod m = a \\cdot b^{-1} \\mod m$

## 快速幂

\`\`\`cpp
long long qpow(long long base, long long exp, long long mod) {
    long long result = 1;
    base %= mod;
    while (exp > 0) {
        if (exp & 1) result = result * base % mod;
        base = base * base % mod;
        exp >>= 1;
    }
    return result;
}
\`\`\`

费马小定理：若 p 为质数，$a^{p-1} \\equiv 1 \\pmod{p}$，故 $a^{-1} \\equiv a^{p-2} \\pmod{p}$。`,
        concepts: ['GCD', '扩展欧几里得', '模运算', '快速幂', '费马小定理', '乘法逆元'],
        hasCode: true,
        hasFormula: true,
      },
      {
        section: 'combinatorics',
        content: `## 组合数学

### 组合数计算

$$C(n, k) = \\frac{n!}{k!(n-k)!}$$

竞赛中常用 Lucas 定理处理大 n 小 p 的情况：

$$C(n, k) \\mod p = C(n \\mod p, k \\mod p) \\cdot C(n/p, k/p) \\mod p$$

### 预处理阶乘

\`\`\`cpp
long long fac[N], inv[N];

void precompute(int n, long long mod) {
    fac[0] = 1;
    for (int i = 1; i <= n; i++) fac[i] = fac[i-1] * i % mod;
    inv[n] = qpow(fac[n], mod - 2, mod);
    for (int i = n - 1; i >= 0; i--) inv[i] = inv[i+1] * (i+1) % mod;
}

long long C(int n, int k, long long mod) {
    if (k < 0 || k > n) return 0;
    return fac[n] % mod * inv[k] % mod * inv[n-k] % mod;
}
\`\`\`

### 常用恒等式

- $\\sum_{k=0}^{n} C(n,k) = 2^n$
- $C(n,k) = C(n-1,k-1) + C(n-1,k)$（杨辉三角）
- Catalan 数：$C_n = \\frac{1}{n+1}C(2n, n)$，用于括号匹配、二叉树计数等`,
        concepts: ['组合数', 'Lucas定理', 'Catalan数', '快速幂', '预处理'],
        hasCode: true,
        hasFormula: true,
      },
    ],
  },
];

// ============================================================================
// Knowledge Triples (Graph Relationships)
// ============================================================================

export const SEED_TRIPLES: SeedTriple[] = [
  // Prerequisite chains (multi-hop)
  { subject: '动态规划', predicate: 'PREREQUISITE', object: '递归', confidence: 0.95 },
  { subject: '分治法', predicate: 'PREREQUISITE', object: '递归', confidence: 0.95 },
  { subject: '树形DP', predicate: 'PREREQUISITE', object: '动态规划', confidence: 0.95 },
  { subject: '树形DP', predicate: 'PREREQUISITE', object: 'DFS', confidence: 0.9 },
  { subject: '状态压缩DP', predicate: 'PREREQUISITE', object: '动态规划', confidence: 0.9 },
  { subject: 'Tarjan', predicate: 'PREREQUISITE', object: 'DFS', confidence: 0.95 },
  { subject: '拓扑排序', predicate: 'PREREQUISITE', object: 'BFS', confidence: 0.8 },
  { subject: '拓扑排序', predicate: 'PREREQUISITE', object: 'DFS', confidence: 0.8 },
  { subject: '线段树', predicate: 'PREREQUISITE', object: '递归', confidence: 0.85 },
  { subject: 'Dijkstra', predicate: 'PREREQUISITE', object: 'BFS', confidence: 0.8 },
  { subject: 'Dijkstra', predicate: 'PREREQUISITE', object: '优先队列', confidence: 0.9 },
  { subject: 'Kruskal', predicate: 'PREREQUISITE', object: '并查集', confidence: 0.95 },
  { subject: 'Kruskal', predicate: 'PREREQUISITE', object: '贪心算法', confidence: 0.85 },
  { subject: 'Prim', predicate: 'PREREQUISITE', object: '优先队列', confidence: 0.9 },
  { subject: '网络流', predicate: 'PREREQUISITE', object: 'BFS', confidence: 0.85 },
  { subject: 'KMP', predicate: 'PREREQUISITE', object: '字符串匹配', confidence: 0.9 },
  { subject: 'Lucas定理', predicate: 'PREREQUISITE', object: '费马小定理', confidence: 0.85 },
  { subject: 'Lucas定理', predicate: 'PREREQUISITE', object: '组合数', confidence: 0.9 },

  // Comparisons
  { subject: 'BFS', predicate: 'COMPARED_TO', object: 'DFS', confidence: 0.95 },
  { subject: 'Dijkstra', predicate: 'COMPARED_TO', object: 'Bellman-Ford', confidence: 0.95 },
  { subject: 'Kruskal', predicate: 'COMPARED_TO', object: 'Prim', confidence: 0.95 },
  { subject: '线段树', predicate: 'COMPARED_TO', object: '树状数组', confidence: 0.9 },
  { subject: '贪心算法', predicate: 'COMPARED_TO', object: '动态规划', confidence: 0.9 },
  { subject: '分治法', predicate: 'COMPARED_TO', object: '动态规划', confidence: 0.85 },
  { subject: 'KMP', predicate: 'COMPARED_TO', object: '字符串哈希', confidence: 0.8 },

  // Cross-domain relationships
  { subject: '动态规划', predicate: 'RELATED_TO', object: '背包问题', confidence: 0.95 },
  { subject: '背包问题', predicate: 'RELATED_TO', object: '整数规划', confidence: 0.85 },
  { subject: '最大流最小割', predicate: 'RELATED_TO', object: '对偶理论', confidence: 0.9 },
  { subject: '最大流最小割', predicate: 'RELATED_TO', object: '线性规划', confidence: 0.85 },
  { subject: 'TSP', predicate: 'RELATED_TO', object: '最短路径', confidence: 0.8 },
  { subject: 'TSP', predicate: 'RELATED_TO', object: '动态规划', confidence: 0.85 },

  // Uses relationships
  { subject: 'Dijkstra', predicate: 'USES', object: '贪心算法', confidence: 0.9 },
  { subject: 'Dijkstra', predicate: 'USES', object: '优先队列', confidence: 0.95 },
  { subject: 'Kruskal', predicate: 'USES', object: '并查集', confidence: 0.95 },
  { subject: 'Kruskal', predicate: 'USES', object: '贪心算法', confidence: 0.9 },
  { subject: 'Prim', predicate: 'USES', object: '优先队列', confidence: 0.9 },
  { subject: '归并排序', predicate: 'USES', object: '分治法', confidence: 0.95 },
  { subject: '最长递增子序列', predicate: 'USES', object: '二分查找', confidence: 0.85 },
  { subject: '最长递增子序列', predicate: 'USES', object: '贪心算法', confidence: 0.8 },

  // Implements
  { subject: '单纯形法', predicate: 'IMPLEMENTS', object: '线性规划', confidence: 0.95 },
  { subject: '内点法', predicate: 'IMPLEMENTS', object: '线性规划', confidence: 0.9 },
  { subject: '分支定界', predicate: 'IMPLEMENTS', object: '整数规划', confidence: 0.9 },

  // Part-of / taxonomy
  { subject: '线性规划', predicate: 'PART_OF', object: '优化', confidence: 0.9 },
  { subject: '整数规划', predicate: 'PART_OF', object: '优化', confidence: 0.9 },
  { subject: '0-1规划', predicate: 'PART_OF', object: '整数规划', confidence: 0.95 },
  { subject: 'SIR模型', predicate: 'PART_OF', object: '微分方程', confidence: 0.85 },
  { subject: 'Logistic模型', predicate: 'PART_OF', object: '微分方程', confidence: 0.85 },

  // Example-of
  { subject: '背包问题', predicate: 'EXAMPLE_OF', object: '动态规划', confidence: 0.9 },
  { subject: '区间调度', predicate: 'EXAMPLE_OF', object: '贪心算法', confidence: 0.9 },
  { subject: 'TSP', predicate: 'EXAMPLE_OF', object: 'NP-hard', confidence: 0.95 },

  // Competition-specific relationships
  { subject: 'ACM-ICPC', predicate: 'RELATED_TO', object: '竞赛规则', confidence: 0.95 },
  { subject: 'ACM-ICPC', predicate: 'RELATED_TO', object: '比赛策略', confidence: 0.9 },
  { subject: 'CUMCM', predicate: 'RELATED_TO', object: '数学建模竞赛', confidence: 0.95 },
  { subject: 'CUMCM', predicate: 'RELATED_TO', object: '论文结构', confidence: 0.9 },
  { subject: 'MCM', predicate: 'COMPARED_TO', object: 'CUMCM', confidence: 0.95 },
  { subject: 'MCM', predicate: 'RELATED_TO', object: '摘要写作', confidence: 0.85 },
  { subject: 'CUMCM', predicate: 'USES', object: '微分方程', confidence: 0.85 },
  { subject: 'CUMCM', predicate: 'USES', object: '线性规划', confidence: 0.85 },
  { subject: 'CUMCM', predicate: 'USES', object: '统计分析', confidence: 0.8 },
  { subject: 'Codeforces', predicate: 'RELATED_TO', object: 'Rating系统', confidence: 0.9 },
  { subject: 'Codeforces', predicate: 'RELATED_TO', object: '训练计划', confidence: 0.85 },
  { subject: 'AtCoder', predicate: 'COMPARED_TO', object: 'Codeforces', confidence: 0.85 },
  { subject: '训练计划', predicate: 'USES', object: '动态规划', confidence: 0.9 },
  { subject: '训练计划', predicate: 'USES', object: '图论', confidence: 0.9 },
  { subject: '训练计划', predicate: 'USES', object: '数据结构', confidence: 0.9 },
  { subject: '对拍', predicate: 'RELATED_TO', object: 'WA调试', confidence: 0.95 },
  { subject: '常见错误', predicate: 'RELATED_TO', object: 'int溢出', confidence: 0.9 },
  { subject: '常见错误', predicate: 'RELATED_TO', object: '超时优化', confidence: 0.85 },
  { subject: '比赛策略', predicate: 'USES', object: '对拍', confidence: 0.85 },
  { subject: 'ICPC区域赛', predicate: 'PART_OF', object: 'ACM-ICPC', confidence: 0.95 },
  { subject: 'World Finals', predicate: 'PART_OF', object: 'ACM-ICPC', confidence: 0.95 },
  { subject: '连续型建模', predicate: 'PART_OF', object: 'CUMCM题型', confidence: 0.9 },
  { subject: '离散型建模', predicate: 'PART_OF', object: 'CUMCM题型', confidence: 0.9 },

  // ====================================================================
  // Deep multi-hop chains (4-5 hops) for testing graph traversal depth
  // ====================================================================

  // Chain 1 (5 hops): 缩点 → Tarjan → DFS → 递归 → 基本情况
  //   and then: DAG最长路 → 缩点 → Tarjan → DFS → 递归
  { subject: '缩点', predicate: 'PREREQUISITE', object: 'Tarjan', confidence: 0.95 },
  { subject: 'DAG最长路', predicate: 'PREREQUISITE', object: '缩点', confidence: 0.95 },
  { subject: 'DAG最长路', predicate: 'PREREQUISITE', object: '拓扑排序', confidence: 0.9 },
  { subject: 'DAG最长路', predicate: 'USES', object: '动态规划', confidence: 0.95 },

  // Chain 2 (5 hops): 主席树 → 可持久化 → 线段树 → 递归 → 基本情况
  { subject: '主席树', predicate: 'PREREQUISITE', object: '可持久化', confidence: 0.95 },
  { subject: '可持久化', predicate: 'PREREQUISITE', object: '线段树', confidence: 0.95 },
  { subject: '主席树', predicate: 'USES', object: '离散化', confidence: 0.85 },
  { subject: '主席树', predicate: 'USES', object: '前缀和', confidence: 0.9 },

  // Chain 3 (4 hops): 斜率优化 → 凸包 → 计算几何基础 → 向量运算
  { subject: '斜率优化', predicate: 'PREREQUISITE', object: '动态规划', confidence: 0.95 },
  { subject: '斜率优化', predicate: 'USES', object: '线段树', confidence: 0.8 },
  { subject: 'CDQ分治', predicate: 'PREREQUISITE', object: '分治法', confidence: 0.95 },
  { subject: 'CDQ分治', predicate: 'USES', object: '树状数组', confidence: 0.85 },
  { subject: 'CDQ分治', predicate: 'USES', object: '归并排序', confidence: 0.9 },

  // Chain 4 (4 hops): 2-SAT → Tarjan → DFS → 递归
  { subject: '2-SAT', predicate: 'PREREQUISITE', object: 'Tarjan', confidence: 0.95 },
  { subject: '2-SAT', predicate: 'PREREQUISITE', object: '缩点', confidence: 0.9 },
  { subject: '2-SAT', predicate: 'PREREQUISITE', object: '拓扑排序', confidence: 0.85 },

  // Chain 5 (4 hops): 最小费用最大流 → 网络流 → BFS → 图
  { subject: '最小费用最大流', predicate: 'PREREQUISITE', object: '网络流', confidence: 0.95 },
  { subject: '最小费用最大流', predicate: 'USES', object: 'Bellman-Ford', confidence: 0.9 },

  // Chain 6 (5 hops): 虚树 → LCA → DFS → 递归 → 基本情况
  { subject: '虚树', predicate: 'PREREQUISITE', object: 'LCA', confidence: 0.95 },
  { subject: 'LCA', predicate: 'PREREQUISITE', object: 'DFS', confidence: 0.9 },
  { subject: '树链剖分', predicate: 'PREREQUISITE', object: 'LCA', confidence: 0.9 },
  { subject: '树链剖分', predicate: 'USES', object: '线段树', confidence: 0.95 },
  { subject: '虚树', predicate: 'USES', object: 'LCA', confidence: 0.95 },

  // Chain 7 (4 hops): 换根DP → 树形DP → 动态规划 → 递归
  { subject: '换根DP', predicate: 'PREREQUISITE', object: '树形DP', confidence: 0.95 },

  // Cross-chain connections (link deep chains to private domain)
  { subject: '华科ACM', predicate: 'RELATED_TO', object: 'ICPC区域赛', confidence: 0.9 },
  { subject: '华科ACM', predicate: 'RELATED_TO', object: '分层递进训练', confidence: 0.85 },
  { subject: '三三制', predicate: 'PART_OF', object: '比赛策略', confidence: 0.9 },
  { subject: '专题训练', predicate: 'RELATED_TO', object: '训练计划', confidence: 0.85 },
  { subject: '分层递进训练', predicate: 'USES', object: '训练计划', confidence: 0.85 },
  { subject: 'DP学习路线', predicate: 'USES', object: '动态规划', confidence: 0.95 },
  { subject: 'DP学习路线', predicate: 'RELATED_TO', object: '训练计划', confidence: 0.85 },
  { subject: '图论路线', predicate: 'RELATED_TO', object: '训练计划', confidence: 0.85 },
  { subject: '区间DP', predicate: 'PREREQUISITE', object: '动态规划', confidence: 0.9 },
  { subject: 'König定理', predicate: 'RELATED_TO', object: '二分图匹配', confidence: 0.95 },
  { subject: '二分图匹配', predicate: 'PREREQUISITE', object: '网络流', confidence: 0.8 },
];
