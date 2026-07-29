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

const ORTHO_DELTAS = /** @type {const} */ ([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]);

/** Clockwise unit steps — right, down, left, up. */
const DIR_DELTAS = /** @type {const} */ ([
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]);

/** @param {number} dx @param {number} dy */
function dirIndex(dx, dy) {
  if (dx === 1 && dy === 0) return 0;
  if (dx === 0 && dy === 1) return 1;
  if (dx === -1 && dy === 0) return 2;
  if (dx === 0 && dy === -1) return 3;
  return -1;
}

/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
function directedEdgeKey(x1, y1, x2, y2) {
  return `${x1},${y1}->${x2},${y2}`;
}

/**
 * @param {Map<string, [number, number][]>} adj
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 */
function addDirectedEdge(adj, x1, y1, x2, y2) {
  const key = cornerKey(x1, y1);
  const list = adj.get(key) ?? [];
  list.push([x2, y2]);
  adj.set(key, list);
}

/**
 * Split win cells into 4-connected components before tracing — corner-only
 * contact between diagonal neighbours must not merge their perimeters.
 * @param {Set<string>} winCells — "col,row" keys
 * @returns {Set<string>[]}
 */
export function splitClusterComponents(winCells) {
  if (!winCells?.size) return [];

  /** @type {Set<string>[]} */
  const components = [];
  /** @type {Set<string>} */
  const visited = new Set();

  for (const cellKey of winCells) {
    if (visited.has(cellKey)) continue;

    /** @type {Set<string>} */
    const component = new Set();
    /** @type {string[]} */
    const queue = [cellKey];
    visited.add(cellKey);

    while (queue.length > 0) {
      const key = queue.pop();
      component.add(key);
      const [colRaw, rowRaw] = key.split(',');
      const col = Number(colRaw);
      const row = Number(rowRaw);
      if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

      for (const [dCol, dRow] of ORTHO_DELTAS) {
        const nextKey = `${col + dCol},${row + dRow}`;
        if (!winCells.has(nextKey) || visited.has(nextKey)) continue;
        visited.add(nextKey);
        queue.push(nextKey);
      }
    }

    if (component.size > 0) components.push(component);
  }

  return components;
}

/**
 * @param {Set<string>} winCells — one 4-connected component
 * @returns {[number, number][][]} closed loops of [gridX, gridY] corner points
 */
function traceComponentPerimeterLoops(winCells) {
  /** @param {number} col @param {number} row */
  const has = (col, row) => winCells.has(`${col},${row}`);

  /** @type {Map<string, [number, number][]>} */
  const adj = new Map();

  for (const cellKey of winCells) {
    const [colRaw, rowRaw] = cellKey.split(',');
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

    if (!has(col, row - 1)) addDirectedEdge(adj, col, row, col + 1, row);
    if (!has(col + 1, row)) addDirectedEdge(adj, col + 1, row, col + 1, row + 1);
    if (!has(col, row + 1)) addDirectedEdge(adj, col + 1, row + 1, col, row + 1);
    if (!has(col - 1, row)) addDirectedEdge(adj, col, row + 1, col, row);
  }

  /** @type {Set<string>} */
  const used = new Set();
  /** @type {[number, number][][]} */
  const loops = [];

  for (const [startKey, targets] of adj) {
    const [startX, startY] = startKey.split(',').map(Number);

    for (const [targetX, targetY] of targets) {
      const firstEdge = directedEdgeKey(startX, startY, targetX, targetY);
      if (used.has(firstEdge)) continue;

      /** @type {[number, number][]} */
      const loop = [[startX, startY]];
      let prevX = startX;
      let prevY = startY;
      let x = targetX;
      let y = targetY;
      used.add(firstEdge);

      let guard = adj.size * 4 + 8;
      while (guard > 0) {
        guard -= 1;
        loop.push([x, y]);
        if (x === startX && y === startY && loop.length > 1) break;

        const inDir = dirIndex(prevX - x, prevY - y);
        if (inDir < 0) break;

        const reverseDir = (inDir + 2) % 4;
        const nextTargets = adj.get(cornerKey(x, y)) ?? [];
        /** @type {[number, number] | null} */
        let next = null;

        for (let step = 1; step <= 4; step += 1) {
          const [dx, dy] = DIR_DELTAS[(reverseDir + step) % 4];
          const candidate = nextTargets.find(([nx, ny]) => nx === x + dx && ny === y + dy);
          if (candidate) {
            next = candidate;
            break;
          }
        }

        if (!next) break;

        const [nextX, nextY] = next;
        const edge = directedEdgeKey(x, y, nextX, nextY);
        if (used.has(edge)) break;

        used.add(edge);
        prevX = x;
        prevY = y;
        x = nextX;
        y = nextY;
      }

      if (loop.length >= 4 && loop[0][0] === loop[loop.length - 1][0] && loop[0][1] === loop[loop.length - 1][1]) {
        loop.pop();
      }

      if (loop.length >= 3) loops.push(loop);
    }
  }

  return loops;
}

/**
 * @param {Set<string>} winCells — "col,row" keys
 * @returns {[number, number][][]} closed loops of [gridX, gridY] corner points
 */
export function traceClusterPerimeterLoops(winCells) {
  if (!winCells?.size) return [];

  /** @type {[number, number][][]} */
  const loops = [];
  for (const component of splitClusterComponents(winCells)) {
    loops.push(...traceComponentPerimeterLoops(component));
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
