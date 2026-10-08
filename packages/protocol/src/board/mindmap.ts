export interface MindNode {
  id: string;
  parent: string | null;
}

export interface LayoutOptions {
  /** Horizontal distance between a node and its children. */
  hGap: number;
  /** Vertical space each leaf gets. */
  vGap: number;
}

/**
 * Classic balanced mind map: first-level branches alternate right/left of the root,
 * deeper levels grow outward on their branch's side, and each parent is centered on its children.
 * Returns the anchor point (center-left/right agnostic) for every node reachable from the root.
 */
export function layoutMindMap(nodes: readonly MindNode[], rootPos: { x: number; y: number }, opts: LayoutOptions = { hGap: 260, vGap: 90 }) {
  const out = new Map<string, { x: number; y: number }>();
  const root = nodes.find((n) => n.parent === null);
  if (!root) return out;
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parent === null) continue;
    const list = children.get(n.parent) ?? [];
    list.push(n.id);
    children.set(n.parent, list);
  }

  const heights = new Map<string, number>();
  const height = (id: string): number => {
    const kids = children.get(id) ?? [];
    const h = kids.length ? kids.reduce((sum, k) => sum + height(k), 0) : opts.vGap;
    heights.set(id, h);
    return h;
  };

  /** Places `id`'s subtree inside the vertical band starting at `top`; returns the node's y. */
  const place = (id: string, x: number, top: number, dir: 1 | -1): number => {
    const kids = children.get(id) ?? [];
    if (!kids.length) {
      const y = top + opts.vGap / 2;
      out.set(id, { x, y });
      return y;
    }
    let cursor = top;
    const ys = kids.map((k) => {
      const y = place(k, x + dir * opts.hGap, cursor, dir);
      cursor += heights.get(k)!;
      return y;
    });
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    out.set(id, { x, y });
    return y;
  };

  out.set(root.id, { ...rootPos });
  const first = children.get(root.id) ?? [];
  for (const dir of [1, -1] as const) {
    const side = first.filter((_, i) => (dir === 1 ? i % 2 === 0 : i % 2 === 1));
    const total = side.reduce((sum, k) => sum + height(k), 0);
    let cursor = rootPos.y - total / 2;
    for (const k of side) {
      place(k, rootPos.x + dir * opts.hGap, cursor, dir);
      cursor += heights.get(k)!;
    }
  }
  return out;
}
