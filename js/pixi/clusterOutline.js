/**
 * Grid perimeter trace — one closed loop per connected cluster cell group.
 * Corner coordinates are grid intersections: cell (col, row) occupies [col, col+1] × [row, row+1].
 */

/** @param {number} x @param {number} y */
function cornerKey(x, y) {
  return `${x},${y}`;
}

export const CLUSTER_OUTLINE_DRAW_ON_MS = 420;
/** Stroke opacity pulse cycle after draw-on completes. */
export const CLUSTER_OUTLINE_BREATHE_MS = 420;
export const CLUSTER_OUTLINE_GREEN = 0x94cd2c;
export const CLUSTER_OUTLINE_BONUS = 0xde1a72;
/** Per-cell tint behind winning symbols during cluster highlight. */
export const CLUSTER_OUTLINE_FILL_ALPHA = 0.18;
/** Corner radius as a fraction of cell width on the walking stroke. */
export const CLUSTER_OUTLINE_CORNER_RADIUS_FRAC = 0.1;

/** @param {boolean} [inBonus] */
export function clusterOutlineColor(inBonus = false) {
  return inBonus ? CLUSTER_OUTLINE_BONUS : CLUSTER_OUTLINE_GREEN;
}

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
 * @param {boolean} [inBonus]
 */
export function clusterOutlineAnimStyle(animStartMs, animNow, baseStrokeWidth, speed = 1, inBonus = false) {
  const drawOnMs = Math.max(120, CLUSTER_OUTLINE_DRAW_ON_MS / speed);
  const breatheMs = Math.max(120, CLUSTER_OUTLINE_BREATHE_MS / speed);
  const elapsed = Math.max(0, animNow - animStartMs);
  const linear = Math.min(1, elapsed / drawOnMs);
  const drawOn = 1 - (1 - linear) ** 2;

  const breatheWave = 0.5 + 0.5 * Math.sin((elapsed / breatheMs) * Math.PI * 2);
  const pulseAlpha = 0.78 + 0.22 * breatheWave;
  const strokeAlpha = drawOn >= 1 ? pulseAlpha : 0.78 + (0.9 - 0.78) * drawOn;

  return {
    drawOn,
    strokeWidth: baseStrokeWidth,
    strokeAlpha,
    fillAlpha: CLUSTER_OUTLINE_FILL_ALPHA * Math.min(1, drawOn * 1.15),
    color: clusterOutlineColor(inBonus),
  };
}

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b @param {{ x: number, y: number }} c @param {number} radius */
function cornerFillet(a, b, c, radius) {
  const inDx = b.x - a.x;
  const inDy = b.y - a.y;
  const outDx = c.x - b.x;
  const outDy = c.y - b.y;
  const inLen = Math.hypot(inDx, inDy);
  const outLen = Math.hypot(outDx, outDy);
  if (inLen < 1e-6 || outLen < 1e-6) {
    return { in: b, out: b, arc: null };
  }

  const ux = inDx / inLen;
  const uy = inDy / inLen;
  const vx = outDx / outLen;
  const vy = outDy / outLen;
  if (ux * vx + uy * vy > 0.999) {
    return { in: b, out: b, arc: null };
  }

  const r = Math.min(radius, inLen * 0.5, outLen * 0.5);
  if (r <= 0.5) {
    return { in: b, out: b, arc: null };
  }

  const start = { x: b.x - ux * r, y: b.y - uy * r };
  const end = { x: b.x + vx * r, y: b.y + vy * r };
  const cross = ux * vy - uy * vx;
  const px = cross > 0 ? -uy : uy;
  const py = cross > 0 ? ux : -ux;
  const cx = start.x + px * r;
  const cy = start.y + py * r;
  const startAngle = Math.atan2(start.y - cy, start.x - cx);
  const endAngle = Math.atan2(end.y - cy, end.x - cx);
  let delta = endAngle - startAngle;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  // Canvas/Pixi y-down: take the short fillet arc, not the long interior loop.
  const anticlockwise = delta < 0;

  return {
    in: start,
    out: end,
    arc: { cx, cy, r, startAngle, endAngle, anticlockwise, delta },
  };
}

/**
 * @param {{ x: number, y: number }[]} points
 * @param {number} [cornerRadius]
 */
function buildRoundedLoopPath(points, cornerRadius = 0) {
  const n = points.length;
  if (n < 3) return { segments: [], totalLength: 0 };

  if (cornerRadius <= 0) {
    /** @type {{ kind: 'line', ax: number, ay: number, bx: number, by: number, length: number }[]} */
    const segments = [];
    let totalLength = 0;
    for (let index = 0; index < n; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % n];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= 0) continue;
      segments.push({ kind: 'line', ax: a.x, ay: a.y, bx: b.x, by: b.y, length });
      totalLength += length;
    }
    return { segments, totalLength, startX: points[0].x, startY: points[0].y };
  }

  const fillets = Array.from({ length: n }, (_, index) => {
    const a = points[(index - 1 + n) % n];
    const b = points[index];
    const c = points[(index + 1) % n];
    return cornerFillet(a, b, c, cornerRadius);
  });

  /** @type {({ kind: 'line', ax: number, ay: number, bx: number, by: number, length: number } | { kind: 'arc', cx: number, cy: number, r: number, startAngle: number, endAngle: number, anticlockwise: boolean, length: number })[]} */
  const segments = [];
  let totalLength = 0;

  /** @param {number} ax @param {number} ay @param {number} bx @param {number} by */
  const pushLine = (ax, ay, bx, by) => {
    const length = Math.hypot(bx - ax, by - ay);
    if (length <= 0) return;
    segments.push({ kind: 'line', ax, ay, bx, by, length });
    totalLength += length;
  };

  /** @param {{ cx: number, cy: number, r: number, startAngle: number, endAngle: number, anticlockwise: boolean, delta: number }} arc */
  const pushArc = (arc) => {
    const length = Math.abs(arc.r * arc.delta);
    if (length <= 0) return;
    segments.push({ kind: 'arc', ...arc, length });
    totalLength += length;
  };

  const start = fillets[0].out;
  for (let index = 1; index < n; index += 1) {
    pushLine(index === 1 ? start.x : fillets[index - 1].out.x, index === 1 ? start.y : fillets[index - 1].out.y, fillets[index].in.x, fillets[index].in.y);
    if (fillets[index].arc) pushArc(fillets[index].arc);
  }

  pushLine(fillets[n - 1].out.x, fillets[n - 1].out.y, fillets[0].in.x, fillets[0].in.y);
  if (fillets[0].arc) pushArc(fillets[0].arc);

  return { segments, totalLength, startX: start.x, startY: start.y };
}

/**
 * @param {import('pixi.js').Graphics} graphics
 * @param {ReturnType<typeof buildRoundedLoopPath>} path
 * @param {number} progress — 0..1 along closed perimeter
 */
function drawLoopPathProgress(graphics, path, progress) {
  const { segments, totalLength, startX, startY } = path;
  if (segments.length === 0 || totalLength <= 0) return;

  let remaining = Math.max(0, Math.min(1, progress)) * totalLength;
  graphics.moveTo(startX, startY);
  if (remaining <= 0) return;

  for (const segment of segments) {
    if (segment.kind === 'line') {
      if (remaining >= segment.length) {
        graphics.lineTo(segment.bx, segment.by);
        remaining -= segment.length;
      } else {
        const t = remaining / segment.length;
        graphics.lineTo(segment.ax + (segment.bx - segment.ax) * t, segment.ay + (segment.by - segment.ay) * t);
        return;
      }
      continue;
    }

    let delta = segment.delta;
    if (remaining >= segment.length) {
      graphics.arc(segment.cx, segment.cy, segment.r, segment.startAngle, segment.endAngle, segment.anticlockwise);
      remaining -= segment.length;
    } else {
      const t = remaining / segment.length;
      const partialEnd = segment.startAngle + delta * t;
      graphics.arc(segment.cx, segment.cy, segment.r, segment.startAngle, partialEnd, segment.anticlockwise);
      return;
    }
  }
}

/**
 * @param {import('pixi.js').Graphics} graphics
 * @param {ReturnType<typeof buildRoundedLoopPath>} path
 */
function drawLoopPathClosed(graphics, path) {
  const { segments, startX, startY } = path;
  if (segments.length === 0) return;

  graphics.moveTo(startX, startY);
  for (const segment of segments) {
    if (segment.kind === 'line') {
      graphics.lineTo(segment.bx, segment.by);
    } else {
      graphics.arc(segment.cx, segment.cy, segment.r, segment.startAngle, segment.endAngle, segment.anticlockwise);
    }
  }
  graphics.closePath();
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
 * @param {number} [cornerRadius]
 */
export function drawLoopProgress(graphics, points, progress, cornerRadius = 0) {
  if (points.length < 2) return;
  drawLoopPathProgress(graphics, buildRoundedLoopPath(points, cornerRadius), progress);
}

/**
 * @param {import('pixi.js').Graphics} graphics
 * @param {{ x: number, y: number }[]} points
 * @param {number} [cornerRadius]
 */
export function drawLoopClosed(graphics, points, cornerRadius = 0) {
  if (points.length < 3) return;
  drawLoopPathClosed(graphics, buildRoundedLoopPath(points, cornerRadius));
}
