'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGraph } from '@/lib/admin-api';
import type { GraphNode, GraphEdge } from '@/lib/admin-api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, GitBranch, FileText, Share2, MousePointerClick } from 'lucide-react';

// ---------------------------------------------------------------------------
// Relationship color scheme
// ---------------------------------------------------------------------------

const RELATIONSHIP_COLORS: Record<string, string> = {
  PREREQUISITE: '#f97316',
  RELATED_TO: '#3b82f6',
  COMPARED_TO: '#a855f7',
  PART_OF: '#22c55e',
  USES: '#14b8a6',
  IMPLEMENTS: '#6366f1',
  EXAMPLE_OF: '#f59e0b',
};

const NODE_COLORS: Record<string, string> = {
  concept: '#3b82f6',
  document: '#22c55e',
};

function getRelationshipColor(rel: string): string {
  return RELATIONSHIP_COLORS[rel] || '#6b7280';
}

// ---------------------------------------------------------------------------
// Force simulation types
// ---------------------------------------------------------------------------

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isDragging?: boolean;
}

// ---------------------------------------------------------------------------
// Tooltip component (rendered as HTML overlay on top of SVG)
// ---------------------------------------------------------------------------

function NodeTooltip({
  node,
  clientX,
  clientY,
  containerRect,
  edges,
  nodes,
}: {
  node: SimNode;
  clientX: number;
  clientY: number;
  containerRect: DOMRect;
  edges: GraphEdge[];
  nodes: SimNode[];
}) {
  const connectedEdges = useMemo(
    () => edges.filter((e) => e.source === node.id || e.target === node.id),
    [edges, node.id]
  );

  const relationshipTypes = useMemo(
    () => [...new Set(connectedEdges.map((e) => e.relationship))],
    [connectedEdges]
  );

  const connectedConceptCount = useMemo(() => {
    if (node.type !== 'document') return 0;
    const connectedIds = new Set(
      connectedEdges.map((e) => (e.source === node.id ? e.target : e.source))
    );
    return nodes.filter((n) => connectedIds.has(n.id) && n.type === 'concept')
      .length;
  }, [node, connectedEdges, nodes]);

  // Position relative to container, offset from cursor
  const offsetX = 16;
  const offsetY = 16;
  let left = clientX - containerRect.left + offsetX;
  let top = clientY - containerRect.top + offsetY;

  // Flip tooltip to the left if it would overflow the right edge
  if (left + 256 > containerRect.width) {
    left = clientX - containerRect.left - 256 - offsetX;
  }
  // Flip tooltip up if it would overflow the bottom
  if (top + 160 > containerRect.height) {
    top = clientY - containerRect.top - 160 - offsetY;
  }

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left, top }}
    >
      <Card className="max-w-64 shadow-lg border bg-popover">
        <CardContent className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div
              className="size-2.5 rounded-full shrink-0"
              style={{
                backgroundColor:
                  node.type === 'concept'
                    ? NODE_COLORS.concept
                    : NODE_COLORS.document,
              }}
            />
            <span className="text-sm font-medium truncate">{node.label}</span>
          </div>

          {/* Details */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>分块</span>
              <span className="font-medium text-foreground">
                {node.chunkCount}
              </span>
            </div>

            {node.type === 'concept' && relationshipTypes.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  关系
                </span>
                <div className="flex flex-wrap gap-1">
                  {relationshipTypes.map((rel) => (
                    <Badge
                      key={rel}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {rel.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {node.type === 'document' && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>关联概念</span>
                <span className="font-medium text-foreground">
                  {connectedConceptCount}
                </span>
              </div>
            )}
          </div>

          {/* Click hint */}
          <div className="flex items-center gap-1 pt-1 border-t text-[10px] text-muted-foreground">
            <MousePointerClick className="size-3" />
            <span>点击查看分块</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ForceGraph component
// ---------------------------------------------------------------------------

function ForceGraph({
  nodes: rawNodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const animRef = useRef<number>(0);
  const alphaRef = useRef(1.0);
  const dragRef = useRef<{
    node: SimNode | null;
    offsetX: number;
    offsetY: number;
    startClientX: number;
    startClientY: number;
    didDrag: boolean;
  }>({ node: null, offsetX: 0, offsetY: 0, startClientX: 0, startClientY: 0, didDrag: false });

  const [viewBox, setViewBox] = useState({ x: -400, y: -300, w: 800, h: 600 });
  const [, forceRender] = useState(0);

  // Hover state for tooltip and visual feedback
  const [hoveredNode, setHoveredNode] = useState<{
    node: SimNode;
    clientX: number;
    clientY: number;
  } | null>(null);

  // Build a set of connected node IDs for the hovered node
  const hoveredConnections = useMemo(() => {
    if (!hoveredNode) return null;
    const nodeId = hoveredNode.node.id;
    const connectedNodeIds = new Set<string>();
    const connectedEdgeIndices = new Set<number>();
    edges.forEach((edge, i) => {
      if (edge.source === nodeId || edge.target === nodeId) {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
        connectedEdgeIndices.add(i);
      }
    });
    connectedNodeIds.add(nodeId);
    return { nodeIds: connectedNodeIds, edgeIndices: connectedEdgeIndices };
  }, [hoveredNode, edges]);

  // Initialize nodes
  useEffect(() => {
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = rawNodes.map((n) => {
      const prev = existing.get(n.id);
      const radius = Math.max(8, Math.min(30, 8 + n.chunkCount * 2));
      if (prev) return { ...n, x: prev.x, y: prev.y, vx: 0, vy: 0, radius };
      return {
        ...n,
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 400,
        vx: 0,
        vy: 0,
        radius,
      };
    });
  }, [rawNodes]);

  // Stable edge ref to avoid restarting simulation on refetch
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  // Stable tick function ref for reheat restart
  const tickFnRef = useRef<(() => void) | null>(null);

  // Force simulation loop with alpha cooling
  useEffect(() => {
    alphaRef.current = 1.0;
    const alphaDecay = 0.015;
    const alphaMin = 0.005;
    const velocityDecay = 0.55;
    let stopped = false;

    function tick() {
      if (stopped) return;
      const nodes = nodesRef.current;
      const alpha = alphaRef.current;
      if (nodes.length === 0 || alpha < alphaMin) return; // stop — no rAF

      const repulsion = 2500;
      const attraction = 0.01;
      const centerGravity = 0.03;

      // Repulsion between all nodes (scaled by alpha)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = Math.max(dx * dx + dy * dy, 200);
          const dist = Math.sqrt(distSq);
          const force = (repulsion * alpha) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!a.isDragging) { a.vx += fx; a.vy += fy; }
          if (!b.isDragging) { b.vx -= fx; b.vy -= fy; }
        }
      }

      // Attraction along edges (scaled by alpha)
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edgesRef.current) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const fx = dx * attraction * alpha;
        const fy = dy * attraction * alpha;
        if (!source.isDragging) { source.vx += fx; source.vy += fy; }
        if (!target.isDragging) { target.vx -= fx; target.vy -= fy; }
      }

      // Center gravity + velocity update
      for (const node of nodes) {
        if (node.isDragging) continue;
        node.vx -= node.x * centerGravity * alpha;
        node.vy -= node.y * centerGravity * alpha;
        node.vx *= velocityDecay;
        node.vy *= velocityDecay;
        node.x += node.vx;
        node.y += node.vy;
      }

      alphaRef.current = alpha - alphaDecay;
      forceRender((c) => c + 1);
      animRef.current = requestAnimationFrame(tick);
    }

    tickFnRef.current = tick;
    animRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      tickFnRef.current = null;
      cancelAnimationFrame(animRef.current);
    };
    // Only restart simulation when the node IDs actually change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNodes.map((n) => n.id).join(',')]);

  // Zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const scaleFactor = e.deltaY > 0 ? 1.1 : 0.9;
      setViewBox((vb) => {
        const cx = vb.x + vb.w / 2;
        const cy = vb.y + vb.h / 2;
        const nw = vb.w * scaleFactor;
        const nh = vb.h * scaleFactor;
        return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
      });
    },
    []
  );

  // Convert screen coords to SVG coords
  const screenToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      return {
        x: viewBox.x + (clientX - rect.left) * scaleX,
        y: viewBox.y + (clientY - rect.top) * scaleY,
      };
    },
    [viewBox]
  );

  // Navigate to chunks page on click
  const navigateToChunks = useCallback(
    (node: SimNode) => {
      if (node.type === 'concept') {
        router.push(`/admin/chunks?concept=${encodeURIComponent(node.label)}`);
      } else {
        // Document node IDs are like "doc:abc123"
        const docId = node.id.startsWith('doc:') ? node.id.slice(4) : node.id;
        router.push(`/admin/chunks?documentId=${encodeURIComponent(docId)}`);
      }
    },
    [router]
  );

  // Drag handlers — track start position to distinguish click vs drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, node: SimNode) => {
      e.stopPropagation();
      const svgCoord = screenToSvg(e.clientX, e.clientY);
      dragRef.current = {
        node,
        offsetX: node.x - svgCoord.x,
        offsetY: node.y - svgCoord.y,
        startClientX: e.clientX,
        startClientY: e.clientY,
        didDrag: false,
      };
      node.isDragging = true;
    },
    [screenToSvg]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = dragRef.current;
      if (!drag.node) return;

      // Check if we've moved enough to count as a drag
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        drag.didDrag = true;
        // Clear hover while dragging
        setHoveredNode(null);
      }

      const svgCoord = screenToSvg(e.clientX, e.clientY);
      drag.node.x = svgCoord.x + drag.offsetX;
      drag.node.y = svgCoord.y + drag.offsetY;
      forceRender((c) => c + 1);
    },
    [screenToSvg]
  );

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag.node) {
      const clickedNode = drag.node;
      const wasClick = !drag.didDrag;

      drag.node.isDragging = false;
      drag.node.vx = 0;
      drag.node.vy = 0;
      drag.node = null;

      // Navigate on click (not drag)
      if (wasClick) {
        navigateToChunks(clickedNode);
        return;
      }

      // Reheat simulation slightly so neighbors settle
      if (alphaRef.current < 0.1 && tickFnRef.current) {
        alphaRef.current = 0.15;
        animRef.current = requestAnimationFrame(tickFnRef.current);
      }
    }
  }, [navigateToChunks]);

  // Node hover handlers
  const handleNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: SimNode) => {
      // Don't show tooltip while dragging
      if (dragRef.current.node) return;
      setHoveredNode({ node, clientX: e.clientX, clientY: e.clientY });
    },
    []
  );

  const handleNodeMouseMove = useCallback(
    (e: React.MouseEvent, node: SimNode) => {
      if (dragRef.current.node) return;
      setHoveredNode({ node, clientX: e.clientX, clientY: e.clientY });
    },
    []
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const nodes = nodesRef.current;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const containerRect = containerRef.current?.getBoundingClientRect();

  return (
    <div ref={containerRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className="w-full h-[500px] lg:h-[600px] border rounded-lg bg-background"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setHoveredNode(null);
        }}
      >
        {/* Glow filter for hovered nodes */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;

          const isHighlighted = hoveredConnections?.edgeIndices.has(i);
          const isDimmed = hoveredConnections && !isHighlighted;

          return (
            <g key={`edge-${i}`}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={getRelationshipColor(edge.relationship)}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                strokeOpacity={isDimmed ? 0.12 : isHighlighted ? 0.85 : 0.5}
                style={{ transition: 'stroke-opacity 0.15s ease, stroke-width 0.15s ease' }}
              />
              {/* Edge label — only shown for hovered node's connections */}
              {isHighlighted && (
                <text
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 6}
                  textAnchor="middle"
                  className="fill-foreground select-none pointer-events-none"
                  style={{ fontSize: '8px', fontWeight: 500 }}
                  fillOpacity={0.8}
                >
                  {edge.relationship.replace(/_/g, ' ')}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isHovered = hoveredNode?.node.id === node.id;
          const isConnected = hoveredConnections?.nodeIds.has(node.id);
          const isDimmed = hoveredConnections && !isConnected;
          const scale = isHovered ? 1.25 : 1;
          const fillOpacity = isDimmed ? 0.3 : isHovered ? 1.0 : 0.8;
          const strokeWidth = isHovered ? 3 : 2;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y}) scale(${scale})`}
              onMouseDown={(e) => handleMouseDown(e, node)}
              onMouseEnter={(e) => handleNodeMouseEnter(e, node)}
              onMouseMove={(e) => handleNodeMouseMove(e, node)}
              onMouseLeave={handleNodeMouseLeave}
              className="cursor-pointer"
              style={{ transition: 'opacity 0.15s ease' }}
            >
              {node.type === 'concept' ? (
                <circle
                  r={node.radius}
                  fill={NODE_COLORS.concept}
                  fillOpacity={fillOpacity}
                  stroke={NODE_COLORS.concept}
                  strokeWidth={strokeWidth}
                  filter={isHovered ? 'url(#glow)' : undefined}
                  style={{ transition: 'fill-opacity 0.15s ease, stroke-width 0.15s ease' }}
                />
              ) : (
                <rect
                  x={-node.radius}
                  y={-node.radius * 0.7}
                  width={node.radius * 2}
                  height={node.radius * 1.4}
                  rx={3}
                  fill={NODE_COLORS.document}
                  fillOpacity={fillOpacity}
                  stroke={NODE_COLORS.document}
                  strokeWidth={strokeWidth}
                  filter={isHovered ? 'url(#glow)' : undefined}
                  style={{ transition: 'fill-opacity 0.15s ease, stroke-width 0.15s ease' }}
                />
              )}
              <text
                y={node.radius + 14}
                textAnchor="middle"
                className="fill-foreground text-[10px] pointer-events-none select-none"
                style={{
                  fontSize: '10px',
                  opacity: isDimmed ? 0.3 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              >
                {node.label.length > 20
                  ? node.label.slice(0, 18) + '...'
                  : node.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip overlay (HTML, positioned above SVG) */}
      {hoveredNode && containerRect && (
        <NodeTooltip
          node={hoveredNode.node}
          clientX={hoveredNode.clientX}
          clientY={hoveredNode.clientY}
          containerRect={containerRect}
          edges={edges}
          nodes={nodesRef.current}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GraphPage
// ---------------------------------------------------------------------------

export default function GraphPage() {
  const [limit, setLimit] = useState(50);
  const [minConnections, setMinConnections] = useState(1);

  const { data, isLoading } = useGraph({ limit, minConnections });

  // Collect unique relationship types from edges for legend
  const relationshipTypes = data?.edges
    ? [...new Set(data.edges.map((e) => e.relationship))]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">知识图谱</h1>
        <p className="text-muted-foreground">
          概念关系和文档连接的可视化探索。
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">概念</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">
                {data?.stats.totalConcepts ?? '--'}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                关系
              </span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">
                {data?.stats.totalRelationships ?? '--'}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">文档</span>
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">
                {data?.stats.totalDocuments ?? '--'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-3 flex-1">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            节点上限
          </label>
          <input
            type="range"
            min={10}
            max={200}
            step={10}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm font-medium w-10 text-right">{limit}</span>
        </div>
        <div className="flex items-center gap-3 flex-1">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            最少连接数
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={minConnections}
            onChange={(e) => setMinConnections(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm font-medium w-10 text-right">
            {minConnections}
          </span>
        </div>
      </div>

      {/* Graph */}
      {isLoading ? (
        <Skeleton className="h-[500px] lg:h-[600px] w-full rounded-lg" />
      ) : data?.nodes && data.nodes.length > 0 ? (
        <ForceGraph nodes={data.nodes} edges={data.edges} />
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Share2 className="size-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              暂无图谱数据。处理文档以构建知识图谱。
            </p>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      {relationshipTypes.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              图例
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {/* Node types */}
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-blue-500" />
                <span className="text-xs">概念</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-sm bg-green-500" />
                <span className="text-xs">文档</span>
              </div>

              {/* Divider */}
              <div className="w-px h-4 bg-border" />

              {/* Relationship types */}
              {relationshipTypes.map((rel) => (
                <div key={rel} className="flex items-center gap-2">
                  <div
                    className="w-4 h-0.5 rounded"
                    style={{ backgroundColor: getRelationshipColor(rel) }}
                  />
                  <span className="text-xs">{rel.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
