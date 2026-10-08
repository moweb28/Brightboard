import { layoutMindMap } from '@classroom/protocol';
import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

/**
 * Mind maps are ordinary board elements (rounded boxes with text + connector lines) tagged in
 * customData, so they sync, undo and export like everything else. Layout comes from layoutMindMap.
 */
type El = ReturnType<ExcalidrawImperativeAPI['getSceneElementsIncludingDeleted']>[number];
interface NodeData {
  root: string;
  parent: string | null;
  order: number;
}
interface EdgeData {
  root: string;
  child: string;
}

const NODE = 'bbMindNode';
const EDGE = 'bbMindEdge';
const W = 220;
const H = 70;

export const nodeData = (el: El | undefined) => el?.customData?.[NODE] as NodeData | undefined;
const edgeData = (el: El) => el.customData?.[EDGE] as EdgeData | undefined;
const center = (el: El) => ({ x: el.x + el.width / 2, y: el.y + el.height / 2 });

function makeNode(text: string, cx: number, cy: number, data: Omit<NodeData, 'root'> & { root?: string }, isRoot: boolean): El[] {
  const [box, label] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      x: cx - W / 2,
      y: cy - H / 2,
      width: W,
      height: H,
      roundness: { type: 3 },
      backgroundColor: isRoot ? '#ffe8a3' : '#e7e9ff',
      fillStyle: 'solid',
      strokeColor: isRoot ? '#b45309' : '#4f46e5',
      strokeWidth: 2,
      label: { text, fontSize: isRoot ? 24 : 18 },
    },
  ]) as El[];
  const node = { ...box, customData: { [NODE]: { root: data.root ?? box.id, parent: data.parent, order: data.order } } } as El;
  return [node, label];
}

function makeEdge(root: string, child: string, from: { x: number; y: number }, to: { x: number; y: number }): El {
  const [edge] = convertToExcalidrawElements([
    { type: 'arrow', x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y, endArrowhead: null, startArrowhead: null, strokeColor: '#868e96', strokeWidth: 2 },
  ]) as El[];
  return { ...edge, customData: { [EDGE]: { root, child } } } as El;
}

/** Endpoints on the facing sides of two boxes. */
function edgeEnds(parent: El, child: El) {
  const p = center(parent);
  const c = center(child);
  const dir = c.x >= p.x ? 1 : -1;
  return { from: { x: p.x + (dir * parent.width) / 2, y: p.y }, to: { x: c.x - (dir * child.width) / 2, y: c.y } };
}

/** Re-positions every node of one mind map and redraws its connectors. Returns the full new element list. */
export function relayout(elements: readonly El[], rootId: string): El[] {
  const live = (e: El) => !e.isDeleted;
  const nodes = elements.filter((e) => live(e) && nodeData(e)?.root === rootId).sort((a, b) => nodeData(a)!.order - nodeData(b)!.order);
  const root = nodes.find((n) => n.id === rootId);
  if (!root) return elements.map((e) => (edgeData(e)?.root === rootId && live(e) ? newElementWith(e, { isDeleted: true }) : e));

  const positions = layoutMindMap(
    nodes.map((n) => ({ id: n.id, parent: nodeData(n)!.parent })),
    center(root),
  );
  const moved = new Map<string, El>();
  const out = elements.map((e) => {
    const target = positions.get(e.id);
    if (target && nodeData(e)) {
      const updated = newElementWith(e, { x: target.x - e.width / 2, y: target.y - e.height / 2 });
      moved.set(e.id, updated);
      return updated;
    }
    return e;
  });
  // Bound labels follow their boxes.
  const delta = new Map([...moved].map(([id, el]) => [id, { dx: el.x - elements.find((e) => e.id === id)!.x, dy: el.y - elements.find((e) => e.id === id)!.y }]));
  for (let i = 0; i < out.length; i++) {
    const e = out[i];
    const containerId = (e as { containerId?: string | null }).containerId;
    const d = containerId ? delta.get(containerId) : undefined;
    if (d && (d.dx || d.dy)) out[i] = newElementWith(e, { x: e.x + d.dx, y: e.y + d.dy });
  }

  // Connectors: update existing, add missing, remove orphaned.
  const byId = new Map(out.map((e) => [e.id, e]));
  const wanted = new Set(nodes.filter((n) => nodeData(n)!.parent).map((n) => n.id));
  const haveEdge = new Set<string>();
  for (let i = 0; i < out.length; i++) {
    const data = edgeData(out[i]);
    if (!data || data.root !== rootId || out[i].isDeleted) continue;
    const child = byId.get(data.child);
    const parent = child && byId.get(nodeData(child)?.parent ?? '');
    if (!wanted.has(data.child) || !child || !parent || haveEdge.has(data.child)) {
      out[i] = newElementWith(out[i], { isDeleted: true });
      continue;
    }
    haveEdge.add(data.child);
    const { from, to } = edgeEnds(parent, child);
    out[i] = newElementWith(out[i], {
      x: from.x,
      y: from.y,
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
      points: [
        [0, 0],
        [to.x - from.x, to.y - from.y],
      ],
    } as never);
  }
  for (const childId of wanted) {
    if (haveEdge.has(childId)) continue;
    const child = byId.get(childId)!;
    const parent = byId.get(nodeData(child)!.parent!)!;
    const { from, to } = edgeEnds(parent, child);
    out.push(makeEdge(rootId, childId, from, to));
  }
  return out;
}

/** Adds a central topic in the middle of the visible board and selects it. */
export function insertMindMap(api: ExcalidrawImperativeAPI, text: string) {
  const st = api.getAppState();
  const cx = -st.scrollX + st.width / 2 / st.zoom.value;
  const cy = -st.scrollY + st.height / 2 / st.zoom.value;
  const node = makeNode(text, cx, cy, { parent: null, order: 0 }, true);
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...node], appState: { selectedElementIds: { [node[0].id]: true } } as never });
}

/** The mind-map box the user has selected (clicking its text counts too), if any. */
export function selectedNode(api: ExcalidrawImperativeAPI): El | undefined {
  const st = api.getAppState();
  if (st.editingTextElement || st.newElement) return undefined;
  const ids = Object.keys(st.selectedElementIds).filter((id) => st.selectedElementIds[id]);
  if (ids.length !== 1) return undefined;
  const all = api.getSceneElementsIncludingDeleted();
  let el = all.find((e) => e.id === ids[0]);
  const containerId = (el as { containerId?: string | null } | undefined)?.containerId;
  if (containerId) el = all.find((e) => e.id === containerId);
  return el && nodeData(el) && !el.isDeleted ? el : undefined;
}

/** Tab = child, Enter = sibling (a sibling of the root becomes a child). */
export function addIdea(api: ExcalidrawImperativeAPI, from: El, mode: 'child' | 'sibling', text: string) {
  const data = nodeData(from)!;
  const parent = mode === 'child' || data.parent === null ? from.id : data.parent;
  const all = api.getSceneElementsIncludingDeleted();
  const siblings = all.filter((e) => !e.isDeleted && nodeData(e)?.parent === parent);
  const order = siblings.reduce((max, e) => Math.max(max, nodeData(e)!.order), 0) + 1;
  const c = center(from);
  const node = makeNode(text, c.x, c.y, { root: data.root, parent, order }, false);
  api.updateScene({
    elements: relayout([...all, ...node], data.root),
    appState: { selectedElementIds: { [node[0].id]: true } } as never,
  });
}

/** Deletes a node with everything under it. */
export function removeIdea(api: ExcalidrawImperativeAPI, node: El) {
  const all = api.getSceneElementsIncludingDeleted();
  const data = nodeData(node)!;
  const doomed = new Set([node.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of all) {
      const d = nodeData(e);
      if (d?.parent && doomed.has(d.parent) && !doomed.has(e.id)) {
        doomed.add(e.id);
        grew = true;
      }
    }
  }
  const next = all.map((e) => {
    const containerId = (e as { containerId?: string | null }).containerId;
    return doomed.has(e.id) || (containerId && doomed.has(containerId)) ? newElementWith(e, { isDeleted: true }) : e;
  });
  api.updateScene({ elements: relayout(next, data.root), appState: { selectedElementIds: {} } as never });
}
