/**
 * Dirty marking + viewport culling system for React Flow canvas.
 *
 * Problem: React Flow re-renders all nodes on every state change, even if only
 * one node changed. With 100+ nodes, this causes excessive DOM updates.
 *
 * Solution: Track which nodes are "dirty" (changed) and only re-render those.
 * Additionally, only render nodes visible in the current viewport.
 *
 * Expected improvement: 60-80% reduction in DOM updates.
 */

import type { Node, Viewport } from "@xyflow/react";
import type { MinimalFlowNodeData } from "./canvasDataAdapters";

export interface DirtyMarkingState {
  dirtyNodeIds: Set<string>;
  visibleNodeIds: Set<string>;
}

/**
 * Mark a node as dirty (needs re-render).
 */
export function markNodeDirty(state: DirtyMarkingState, nodeId: string): void {
  state.dirtyNodeIds.add(nodeId);
}

/**
 * Mark multiple nodes as dirty.
 */
export function markNodesDirty(state: DirtyMarkingState, nodeIds: string[]): void {
  nodeIds.forEach((id) => state.dirtyNodeIds.add(id));
}

/**
 * Clear dirty marks (call after rendering).
 */
export function clearDirtyMarks(state: DirtyMarkingState): void {
  state.dirtyNodeIds.clear();
}

/**
 * Compute which nodes are visible in the current viewport.
 * Includes padding to pre-render nodes just outside the viewport.
 */
export function computeVisibleNodes(
  nodes: Node<MinimalFlowNodeData>[],
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 200, // px padding around viewport
): Set<string> {
  const visible = new Set<string>();

  // Viewport bounds in canvas coordinates
  const viewportLeft = -viewport.x / viewport.zoom;
  const viewportTop = -viewport.y / viewport.zoom;
  const viewportRight = viewportLeft + canvasWidth / viewport.zoom;
  const viewportBottom = viewportTop + canvasHeight / viewport.zoom;

  // Expand bounds by padding
  const paddedLeft = viewportLeft - padding / viewport.zoom;
  const paddedTop = viewportTop - padding / viewport.zoom;
  const paddedRight = viewportRight + padding / viewport.zoom;
  const paddedBottom = viewportBottom + padding / viewport.zoom;

  nodes.forEach((node) => {
    const nodeWidth = node.measured?.width ?? 280;
    const nodeHeight = node.measured?.height ?? 200;
    const nodeRight = node.position.x + nodeWidth;
    const nodeBottom = node.position.y + nodeHeight;

    // AABB collision: node overlaps padded viewport
    if (
      node.position.x < paddedRight &&
      nodeRight > paddedLeft &&
      node.position.y < paddedBottom &&
      nodeBottom > paddedTop
    ) {
      visible.add(node.id);
    }
  });

  return visible;
}

/**
 * Determine which nodes should be rendered based on dirty marks + visibility.
 * Returns node IDs that need rendering.
 */
export function getNodesToRender(
  state: DirtyMarkingState,
  nodes: Node<MinimalFlowNodeData>[],
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
): string[] {
  // Update visible nodes
  state.visibleNodeIds = computeVisibleNodes(nodes, viewport, canvasWidth, canvasHeight);

  // Render dirty nodes that are visible
  const toRender: string[] = [];
  state.dirtyNodeIds.forEach((id) => {
    if (state.visibleNodeIds.has(id)) {
      toRender.push(id);
    }
  });

  return toRender;
}

/**
 * Detect which nodes changed between two snapshots.
 * Used to automatically mark nodes as dirty when data changes.
 */
export function detectChangedNodes(
  prevNodes: Node<MinimalFlowNodeData>[],
  nextNodes: Node<MinimalFlowNodeData>[],
): string[] {
  const changed: string[] = [];
  const prevMap = new Map(prevNodes.map((n) => [n.id, n]));

  nextNodes.forEach((nextNode) => {
    const prevNode = prevMap.get(nextNode.id);
    if (!prevNode) {
      // New node
      changed.push(nextNode.id);
    } else if (
      prevNode.position.x !== nextNode.position.x ||
      prevNode.position.y !== nextNode.position.y ||
      prevNode.data.status !== nextNode.data.status ||
      prevNode.data.expanded !== nextNode.data.expanded ||
      JSON.stringify(prevNode.data.runtime.data) !== JSON.stringify(nextNode.data.runtime.data)
    ) {
      // Node changed
      changed.push(nextNode.id);
    }
  });

  // Detect deleted nodes (not needed for rendering, but useful for cleanup)
  prevNodes.forEach((prevNode) => {
    if (!nextNodes.find((n) => n.id === prevNode.id)) {
      // Node was deleted
    }
  });

  return changed;
}
