/**
 * Grid perimeter trace — one closed loop per connected cluster cell group.
 * Corner coordinates are grid intersections: cell (col, row) occupies [col, col+1] × [row, row+1].
 */

/** @param {number} x @param {number} y */
function cornerKey(x, y) {
  return `${x},${y}`;
}

export const CLUSTER_OUTLINE_DRAW_ON_MS = 420;
export const CLUSTER_OUTLINE_GREEN = 0x4ade80;

/**
 * @param {Set<string>} winCells — "col,row" keys
 * @returns {[number, number][][]} closed loops of [gridX, gridY] corner points
 */
export function traceClusterPerimeterLoops(winCells) {
  if (!winCells?.size) return [];

  /** @param {number} col @param {number} row */
  const has = (col, row) => winCells.has(`${col},${row}`);

  /** @type {Map<string, [number, number]>} */
  const edges = new Map();

  for (const cellKey of winCells) {
    const [colRaw, rowRaw] = cellKey.split(',');
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

    if (!has(col, row - 1)) edges.set(cornerKey(col, row), [col + 1, row]);
    if (!has(col + 1, row)) edges.set(cornerKey(col + 1, row), [col + 1, row + 1]);
    if (!has(col, row + 1)) edges.set(cornerKey(col + 1, row + 1), [col, row + 1]);
    if (!has(col - 1, row)) edges.set(cornerKey(col, row + 1), [col, row]);
  }

  /** @type {[number, number][][]} */
  const loops = [];

  while (edges.size > 0) {
    const startKey = edges.keys().next().value;
    const [startX, startY] = startKey.split(',').map(Number);
    /** @type {[number, number][]} */
    const loop = [[startX, startY]];
    let x = startX;
    let y = startY;
    let guard = edges.size + 4;

    while (guard > 0) {
      guard -= 1;
      const next = edges.get(cornerKey(x, y));
      if (!next) break;
      edges.delete(cornerKey(x, y));
      [x, y] = next;
      if (x === startX && y === startY) break;
      loop.push([x, y]);
    }

    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}

/**
 * @param {number} animStartMs
 * @param {number} animNow
 * @param {number} baseStrokeWidth
 * @param {number} [speed]
 */
export function clusterOutlineAnimStyle(animStartMs, animNow, baseStrokeWidth, speed = 1) {
  const drawOnMs = Math.max(120, CLUSTER_OUTLINE_DRAW_ON_MS / speed);
  const elapsed = Math.max(0, animNow - animStartMs);
  const linear = Math.min(1, elapsed / drawOnMs);
  const drawOn = 1 - (1 - linear) ** 2;

  return {
    drawOn,
    strokeWidth: baseStrokeWidth,
    strokeAlpha: 0.9,
    fillAlpha: 0.1 * Math.min(1, drawOn * 1.15),
    color: CLUSTER_OUTLINE_GREEN,
  };
}

/** @param {{ x: number, y: number }[]} points */
export function loopPerimeterLength(points) {
  let length = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

/**
 * @param {import('pixi.js').Graphics} graphics
 * @param {{ x: number, y: number }[]} points
 * @param {number} progress — 0..1 along closed perimeter
 */
export function drawLoopProgress(graphics, points, progress) {
  if (points.length < 2) return;

  const total = loopPerimeterLength(points);
  if (total <= 0) return;

  let remaining = Math.max(0, Math.min(1, progress)) * total;
  graphics.moveTo(points[0].x, points[0].y);
  if (remaining <= 0) return;

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (segment <= 0) continue;

    if (remaining >= segment) {
      graphics.lineTo(b.x, b.y);
      remaining -= segment;
    } else {
      const t = remaining / segment;
      graphics.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      return;
    }
  }
}

/**
 * @param {import('pixi.js').Graphics} graphics
 * @param {{ x: number, y: number }[]} points
 */
export function drawLoopClosed(graphics, points) {
  if (points.length < 3) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index].x, points[index].y);
  }
  graphics.closePath();
}
