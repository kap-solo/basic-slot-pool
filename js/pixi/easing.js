/** @param {number} t 0..1 */
export const linear = (t) => t;

/** @param {number} t 0..1 */
export const easeInQuad = (t) => t * t;

/** @param {number} t 0..1 */
export const easeInCubic = (t) => t * t * t;

/** @param {number} t 0..1 */
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/** @param {number} t 0..1 */
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** @param {number} u 0..1 */
function smoothstep(u) {
  return u * u * (3 - 2 * u);
}

/**
 * Drive curve for the spring target — not applied directly to visuals.
 * @param {number} t 0..1
 */
export function easeSwimlane(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.18) return easeInQuad(t / 0.18) * 0.07;
  if (t < 0.56) return 0.07 + smoothstep((t - 0.18) / 0.38) * 0.66;
  const u = (t - 0.56) / 0.44;
  return 0.73 + (1 - (1 - u) ** 2.6) * 0.27;
}

/** @deprecated alias */
export const easeSpinInertia = easeSwimlane;
export const easeSpinOrganic = easeSwimlane;

class Spring1D {
  /**
   * @param {number} stiffness
   * @param {number} damping
   * @param {number} [mass=1]
   */
  constructor(stiffness, damping, mass = 1) {
    this.k = stiffness;
    this.d = damping;
    this.m = mass;
    this.x = 0;
    this.v = 0;
  }

  /** @param {number} x @param {number} [v=0] */
  set(x, v = 0) {
    this.x = x;
    this.v = v;
  }

  /** @param {number} target @param {number} dt seconds @param {number} [dampingScale=1] */
  step(target, dt, dampingScale = 1) {
    const damp = this.d * dampingScale;
    const accel = ((target - this.x) * this.k - damp * this.v) / this.m;
    this.v += accel * dt;
    this.x += this.v * dt;
    return this.x;
  }

  /** @param {number} [posTarget=0] @param {number} [threshold=0.45] */
  isSettled(posTarget = 0, threshold = 0.45) {
    return Math.abs(this.v) < threshold && Math.abs(this.x - posTarget) < threshold;
  }
}

/**
 * Jiggle spin — drive resolves early; land jelly continues on the strip in the same loop (BS-060 physics).
 * @param {object} opts
 * @param {import('pixi.js').Container} opts.strip
 * @param {ReturnType<typeof import('./symbolView.js').createSymbolNode>[]} opts.nodes
 * @param {number} opts.stripStartY
 * @param {number} opts.totalScroll
 * @param {number} opts.duration
 * @param {number} opts.cellH
 * @param {number} opts.visibleRows
 * @param {number} [opts.maxSettleMs]
 * @param {number} [opts.stripStiffness]
 * @param {number} [opts.stripDamping]
 * @param {number} [opts.rowStiffness]
 * @param {number} [opts.rowStiffnessStep]
 * @param {number} [opts.rowDamping]
 * @param {number} [opts.rowDampingStep]
 * @param {number} [opts.velCoupling]
 * @param {number} [opts.rowChainCoupling]
 * @param {number} [opts.stripMass]
 * @param {number} [opts.maxRowLagPx]
 * @param {number} [opts.landWindowStartIdx] Strip index of top visible row at land — locks during settle.
 * @param {number[] | null} [opts.initialRowOffsets] Per visible row (0=top) offset subtracted from grid y at spin handoff.
 * @param {(t: number) => number} [opts.drive]
 * @param {number} [opts.jellyStiffness=48]
 * @param {number} [opts.jellyDamping=2.95]
 * @param {number} [opts.jellyMinMs=540]
 * @param {number} [opts.jellyLandVelFactor=0.49]
 * @param {number} [opts.jellySquashRatio=0.036]
 * @param {number} [opts.jellyMaxBelowRatio=0.086]
 * @param {number} [opts.jellyMaxAboveRatio=0.092]
 * @param {number} [opts.jellyTailMs=220]
 * @param {number} [opts.jellyChainCoupling=0.42]
 * @param {number} [opts.jellyLandDelayMs=0]
 * @returns {Promise<{ stripY: number, windowTopIdx: number, holdOffsetsByRow: number[], impactVel: number }> & { cancel?: () => void, settled?: Promise<void> }}
 */
export function animateReelSpin({
  strip,
  nodes,
  stripStartY,
  totalScroll,
  duration,
  cellH,
  visibleRows,
  maxSettleMs = 720,
  stripStiffness = 118,
  stripDamping = 12.2,
  rowStiffness = 75,
  rowStiffnessStep = 8,
  rowDamping = 9,
  rowDampingStep = 0.95,
  velCoupling = 0.088,
  rowChainCoupling = 0.52,
  stripMass = 1.06,
  maxRowLagPx,
  landWindowStartIdx = null,
  initialRowOffsets = null,
  drive = easeSwimlane,
  jellyStiffness = 48,
  jellyDamping = 2.95,
  jellyMinMs = 540,
  jellyLandVelFactor = 0.49,
  jellySquashRatio = 0.036,
  jellyMaxBelowRatio = 0.086,
  jellyMaxAboveRatio = 0.092,
  jellyTailMs = 220,
  jellyChainCoupling = 0.42,
  jellyLandDelayMs = 0,
  jellyLandImpactScale = 1,
}) {
  const count = nodes.length;
  const lagCap = maxRowLagPx ?? cellH * 0.08;
  const finalStripY = stripStartY + totalScroll;
  const snapRowY = (index) => Math.round((index + 0.5) * cellH * 100) / 100;
  const landLocked =
    landWindowStartIdx != null &&
    landWindowStartIdx >= 0 &&
    landWindowStartIdx + visibleRows <= count;
  const jellyMinDuration = jellyMinMs;
  const tailDuration = jellyTailMs;
  const squashPx = cellH * jellySquashRatio;
  const maxBelowPx = cellH * jellyMaxBelowRatio;
  const maxAbovePx = cellH * jellyMaxAboveRatio;
  const settleThreshold = Math.max(0.04, cellH * 0.004);

  if (duration <= 0 || !nodes.length) {
    strip.y = finalStripY;
    const done = Promise.resolve({
      stripY: finalStripY,
      windowTopIdx: 0,
      holdOffsetsByRow: Array.from({ length: visibleRows }, () => 0),
      impactVel: 0,
    });
    done.cancel = () => {};
    done.settled = Promise.resolve();
    done.impactApplied = Promise.resolve();
    return done;
  }

  const stripSpring = new Spring1D(stripStiffness, stripDamping, stripMass);
  stripSpring.set(stripStartY);

  /** @type {Spring1D[]} slot 0 = bottom visible row — in-flight lane wobble */
  const rowSprings = Array.from({ length: visibleRows }, (_, slot) => {
    const k = rowStiffness + slot * rowStiffnessStep;
    const d = rowDamping + slot * rowDampingStep;
    const spring = new Spring1D(k, d);
    spring.set(0);
    return spring;
  });

  /** @type {Spring1D[]} post-land jelly (same physics as cascade) */
  const rowJellySprings = Array.from(
    { length: visibleRows },
    () => new Spring1D(jellyStiffness, jellyDamping, 0.92),
  );

  /** @type {(number | null)[]} */
  const tailStartedAt = Array.from({ length: visibleRows }, () => null);

  if (initialRowOffsets?.length === visibleRows) {
    for (let row = 0; row < visibleRows; row += 1) {
      const slot = visibleRows - 1 - row;
      rowSprings[slot].set(initialRowOffsets[row]);
    }
    const handoffTopIdx = Math.max(0, Math.floor(-stripStartY / cellH));
    const handoffBottomIdx = Math.min(count - 1, handoffTopIdx + visibleRows - 1);
    for (let slot = 0; slot < visibleRows; slot += 1) {
      const index = handoffBottomIdx - slot;
      if (index < 0 || index >= count) continue;
      const node = nodes[index];
      if (!node) continue;
      node.root.y = (index + 0.5) * cellH - rowSprings[slot].x;
    }
    stripSpring.set(stripStartY);
    strip.y = stripStartY;
  }

  let cancelled = false;
  let driveEndedAt = null;
  let pendingImpactVel = 0;
  let impactApplied = false;
  let landedAt = null;
  let lastStripY = stripStartY;
  let landTopIdx = 0;
  let landBottomIdx = 0;
  /** @type {number[]} frozen visual offset from grid during stagger hold — slot 0 = bottom */
  let holdOffset = [];
  /** @type {number[]} row spring velocity captured at drive end — slot 0 = bottom */
  let holdRowVel = [];

  /** @type {Promise<void>} */
  let settledPromise;
  /** @type {() => void} */
  let settleDone;
  /** @type {Promise<void>} */
  let impactAppliedPromise;
  /** @type {() => void} */
  let impactAppliedDone;

  /** @type {Promise<{ stripY: number, windowTopIdx: number, holdOffsetsByRow: number[], impactVel: number }> & { cancel?: () => void, settled?: Promise<void>, impactApplied?: Promise<void> }} */
  const promise = new Promise((resolve) => {
    settledPromise = new Promise((settledResolve) => {
      settleDone = settledResolve;
    });
    impactAppliedPromise = new Promise((impactResolve) => {
      impactAppliedDone = impactResolve;
    });

    const start = performance.now();
    let lastNow = start;
    let finished = false;
    let driveResolved = false;

    const finishAll = () => {
      if (finished) return;
      finished = true;
      settleDone();
    };

    const step = (now) => {
      if (finished) return;
      if (cancelled) {
        finishAll();
        return;
      }
      const elapsed = now - start;
      const dt = Math.min(0.032, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const t = Math.min(1, elapsed / duration);
      const driveCurveDone = t >= 1;
      const driveScroll = drive(t) * totalScroll;
      const targetStripY = stripStartY + driveScroll;

      const scrollTopIdx = Math.max(0, Math.floor(-stripSpring.x / cellH));
      const indicesAligned =
        !landLocked || scrollTopIdx === landWindowStartIdx;
      const stripNearFinal =
        Math.abs(stripSpring.x - finalStripY) < cellH * 0.12 &&
        Math.abs(strip.y - finalStripY) < cellH * 0.12;
      const lockLandWindow = landLocked && stripNearFinal && indicesAligned;
      const windowTopIdx = lockLandWindow
        ? landWindowStartIdx
        : Math.max(0, Math.floor(-strip.y / cellH));
      const windowBottomIdx = Math.min(count - 1, windowTopIdx + visibleRows - 1);

      const inLandPhase = driveCurveDone && stripNearFinal && indicesAligned;

      if (!inLandPhase) {
        const effectiveTarget = driveCurveDone ? finalStripY : targetStripY;
        const landApproachDamp = !driveCurveDone && t > 0.84
          ? 1 + ((t - 0.84) / 0.16) * 1.1
          : driveCurveDone
            ? 1.12
            : 1;
        stripSpring.step(effectiveTarget, dt, landApproachDamp);
        strip.y = stripSpring.x;
        lastStripY = stripSpring.x;

        const stripVel = stripSpring.v;
        for (let slot = 0; slot < visibleRows; slot += 1) {
          const rowsFromBottom = slot;
          const velLag = Math.max(
            -lagCap,
            Math.min(lagCap, -stripVel * velCoupling * (rowsFromBottom + 0.65)),
          );
          const chainLag = slot === 0 ? 0 : rowSprings[slot - 1].x * rowChainCoupling;
          const rowTarget = Math.max(-lagCap, Math.min(lagCap, velLag + chainLag));
          rowSprings[slot].step(rowTarget, dt, 1);

          const index = windowBottomIdx - slot;
          if (index < 0 || index >= count) continue;
          const node = nodes[index];
          if (!node) continue;
          node.root.y = snapRowY(index) - rowSprings[slot].x;
        }

        for (let index = 0; index < count; index += 1) {
          if (index < windowTopIdx || index > windowBottomIdx) {
            nodes[index].root.y = snapRowY(index);
          }
        }

        requestAnimationFrame(step);
        return;
      }

      if (driveEndedAt === null) {
        driveEndedAt = now;

        landTopIdx = landLocked
          ? landWindowStartIdx
          : Math.max(0, Math.floor(-stripSpring.x / cellH));
        landBottomIdx = Math.min(count - 1, landTopIdx + visibleRows - 1);

        const capturedStripVel = Math.max(
          Math.abs(stripSpring.v),
          Math.abs((stripSpring.x - lastStripY) / Math.max(dt, 0.001)),
        );

        const stripDelta = finalStripY - strip.y;
        if (Math.abs(stripDelta) > 0.1) {
          for (let slot = 0; slot < visibleRows; slot += 1) {
            rowSprings[slot].set(
              rowSprings[slot].x + stripDelta,
              rowSprings[slot].v,
            );
          }
        }
        if (Math.abs(strip.y - finalStripY) > 0.02 || Math.abs(stripSpring.x - finalStripY) > 0.02) {
          strip.y = finalStripY;
          stripSpring.set(finalStripY, 0);
        }

        pendingImpactVel = landJellyImpactVel(
          Math.abs(totalScroll),
          duration,
          capturedStripVel,
          jellyLandVelFactor,
        );
        pendingImpactVel *= Math.max(0.38, jellyLandImpactScale);
        pendingImpactVel = Math.min(pendingImpactVel, cellH * 2.8);

        holdOffset = [];
        holdRowVel = [];

        for (let slot = 0; slot < visibleRows; slot += 1) {
          const index = landBottomIdx - slot;
          if (index < 0 || index >= count) continue;
          const node = nodes[index];
          if (!node) continue;
          const gridY = snapRowY(index);
          holdOffset[slot] = node.root.y - gridY;
          holdRowVel[slot] = rowSprings[slot].v;
          rowJellySprings[slot].set(0, 0);
        }

        if (!driveResolved) {
          driveResolved = true;
          /** @type {number[]} row 0 = top */
          const holdOffsetsByRow = Array.from({ length: visibleRows }, () => 0);
          for (let slot = 0; slot < visibleRows; slot += 1) {
            const row = visibleRows - 1 - slot;
            holdOffsetsByRow[row] = holdOffset[slot] ?? 0;
          }
          resolve({
            stripY: strip.y,
            windowTopIdx: landLocked ? landWindowStartIdx : landTopIdx,
            holdOffsetsByRow,
            impactVel: pendingImpactVel,
          });
        }
      }

      const holdElapsed = now - driveEndedAt;

      const minLandSettleMs = 18;
      const impactDelayMs = Math.max(jellyLandDelayMs, minLandSettleMs);

      if (!impactApplied && holdElapsed >= impactDelayMs) {
        impactApplied = true;
        landedAt = now;
        impactAppliedDone();

        for (let slot = 0; slot < visibleRows; slot += 1) {
          const index = landBottomIdx - slot;
          if (index < 0 || index >= count) continue;
          const node = nodes[index];
          if (!node) continue;
          const gridY = snapRowY(index);
          const off = node.root.y - gridY;
          const rowV = rowSprings[slot].v;
          const startV = -rowV * 0.92 + (Math.abs(off) < 0.35 ? pendingImpactVel * 0.14 : 0);
          rowJellySprings[slot].set(off, startV);
          rowSprings[slot].set(0, 0);
        }
      }

      const jellyElapsed = impactApplied && landedAt !== null ? now - landedAt : 0;

      for (let slot = 0; slot < visibleRows; slot += 1) {
        const index = landBottomIdx - slot;
        if (index < 0 || index >= count) continue;
        const node = nodes[index];
        if (!node) continue;
        const gridY = snapRowY(index);

        if (!impactApplied) {
          rowSprings[slot].step(0, dt, 1.08);
          node.root.y = gridY - rowSprings[slot].x;
          holdOffset[slot] = -rowSprings[slot].x;
          continue;
        }

        let chainPull = 0;
        if (slot > 0 && jellyElapsed < jellyMinDuration * 0.6) {
          chainPull = rowJellySprings[slot - 1].x * jellyChainCoupling * 0.28;
        }

        let dampScaleOverride = null;
        if (jellyElapsed < 72) {
          dampScaleOverride = 0.72 + (jellyElapsed / 72) * 0.55;
        }

        tailStartedAt[slot] = tickLandJellyFrame({
          spring: rowJellySprings[slot],
          gridY,
          node,
          jellyElapsed,
          jellyMinDuration,
          cellH,
          maxBelowPx,
          maxAbovePx,
          tailDuration,
          tailStartedAt: tailStartedAt[slot],
          now,
          dt,
          chainPull,
          dampScaleOverride,
        });
      }

      for (let index = 0; index < count; index += 1) {
        if (index >= landTopIdx && index <= landBottomIdx) continue;
        nodes[index].root.y = snapRowY(index);
      }

      const settleElapsed = impactApplied && landedAt !== null ? now - landedAt : 0;
      const allJellyDone =
        impactApplied &&
        rowJellySprings.every((spring, slot) => {
          if (settleElapsed < jellyMinDuration * 0.75) return false;
          if (tailStartedAt[slot] === null) return false;
          const tailDone =
            tailDuration <= 0 ||
            tailStartedAt[slot] === null ||
            now - tailStartedAt[slot] >= tailDuration * 0.92;
          const index = landBottomIdx - slot;
          if (index < 0 || index >= count) return tailDone;
          const node = nodes[index];
          if (!node) return tailDone;
          return tailDone && Math.abs(node.root.y - snapRowY(index)) < settleThreshold;
        });

      const stripSettled = Math.abs(strip.y - finalStripY) < 0.2;
      const settleCap = maxSettleMs * 1.65;
      const settleTimedOut = impactApplied && settleElapsed > settleCap;
      const canFinish =
        stripSettled && (allJellyDone || settleTimedOut || cancelled);

      if (!canFinish) {
        requestAnimationFrame(step);
        return;
      }

      for (let slot = 0; slot < visibleRows; slot += 1) {
        const index = landBottomIdx - slot;
        if (index < 0 || index >= count) continue;
        const node = nodes[index];
        if (!node) continue;
        const gridY = snapRowY(index);
        if (Math.abs(node.root.y - gridY) < 0.35) {
          node.root.y = gridY;
        }
      }

      finishAll();
    };

    requestAnimationFrame(step);
  });

  promise.cancel = () => {
    cancelled = true;
    impactAppliedDone();
  };
  promise.settled = settledPromise;
  promise.impactApplied = impactAppliedPromise;

  return promise;
}

/** @param {number} t 0..1 @param {number} [overshoot=2.05] */
export function easeOutBackElastic(t, overshoot = 2.05) {
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/** @param {number} t 0..1 */
export const easeOutBack = (t) => easeOutBackElastic(t, 1.70158);

/**
 * @param {{ from: number, to: number, duration: number, easing?: (t: number) => number, onUpdate: (v: number) => void }} opts
 */
export function tween({ from, to, duration, easing = linear, onUpdate }) {
  if (duration <= 0) {
    onUpdate(to);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      onUpdate(from + (to - from) * easing(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {number} ms @param {number} speed */
export function scaledDelay(ms, speed) {
  return sleep(Math.max(0, Math.round(ms / speed)));
}

export { sleep };

/**
 * Soft spring each symbol y toward grid — only used when residual offset remains.
 * @param {{ node: { root: { y: number } }, y: number }[]} entries
 * @param {number} [maxMs=180]
 */
export function animateSymbolYSettle(entries, maxMs = 180) {
  if (!entries.length) return Promise.resolve();

  const springs = entries.map(({ node }) => {
    const spring = new Spring1D(132, 17.5);
    spring.set(node.root.y);
    return spring;
  });

  return new Promise((resolve) => {
    const start = performance.now();
    let lastNow = start;

    const step = (now) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      const elapsed = now - start;
      const dampingBoost = elapsed > maxMs * 0.55 ? 1 + ((elapsed - maxMs * 0.55) / (maxMs * 0.45)) * 2 : 1;

      let settled = true;
      entries.forEach(({ node, y }, index) => {
        springs[index].step(y, dt, dampingBoost);
        node.root.y = springs[index].x;
        if (!springs[index].isSettled(y, 0.08)) settled = false;
      });

      if (!settled && elapsed < maxMs * 1.35) {
        requestAnimationFrame(step);
        return;
      }

      entries.forEach(({ node, y }) => {
        node.root.y = y;
      });
      resolve();
    };

    requestAnimationFrame(step);
  });
}

/**
 * Fall drive curve — accel into the drop, soft decel into land squash.
 * @param {number} t 0..1
 */
function easeCascadeFall(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.18) return easeInQuad(t / 0.18) * 0.12;
  return 0.12 + (1 - (1 - (t - 0.18) / 0.82) ** 2.6) * 0.88;
}

/** Last segment of fall — ease into slight below-grid compression (no snap). */
function cascadeFallSquashBlend(t, cellH, fallDist) {
  if (t < 0.84) return 0;
  const u = (t - 0.84) / 0.16;
  const rows = Math.min(3, fallDist / Math.max(cellH, 1));
  return cellH * 0.026 * (0.65 + rows * 0.2) * easeInQuad(Math.min(1, u));
}

/**
 * Shared post-land jelly envelope + damping (spin + cascade).
 * @param {number} jellyElapsed ms
 * @param {number} jellyMinDuration ms
 * @param {number} tailBlend 0..1
 */
function landJellyDampScale(jellyElapsed, jellyMinDuration, tailBlend) {
  const jellyT = jellyMinDuration > 0 ? jellyElapsed / jellyMinDuration : 1;
  let dampScale = jellyT < 0.72 ? 0.48 : 0.48 + ((jellyT - 0.72) / 0.28) ** 1.15 * 1.45;
  return dampScale + tailBlend * 2.4;
}

/** @param {number} jellyElapsed @param {number} jellyMinDuration */
function landJellyEnvelope(jellyElapsed, jellyMinDuration) {
  const mainBounceEnd = jellyMinDuration * 0.82;
  if (jellyElapsed <= mainBounceEnd) return 1;
  const taper = (jellyElapsed - mainBounceEnd) / (jellyMinDuration * 0.38);
  return Math.max(0.55, 1 - taper * 0.45);
}

/**
 * @param {Spring1D} spring
 * @param {object} ctx
 */
function stepLandJellySpring(
  spring,
  { dt, dampScale, chainPull, belowCapPx, aboveCapPx, velRetention = 0.58 },
) {
  spring.step(chainPull, dt, dampScale);
  if (spring.x > belowCapPx) {
    spring.x = belowCapPx;
    spring.v = Math.min(spring.v, 0) * velRetention;
  } else if (spring.x < -aboveCapPx) {
    spring.x = -aboveCapPx;
    spring.v = Math.max(spring.v, 0) * velRetention;
  }
}

function tickLandJellyFrame({
  spring,
  gridY,
  node,
  jellyElapsed,
  jellyMinDuration,
  cellH,
  maxBelowPx,
  maxAbovePx,
  tailDuration,
  tailStartedAt,
  now,
  dt,
  chainPull,
  dampScaleOverride = null,
}) {
  const envelope = landJellyEnvelope(jellyElapsed, jellyMinDuration);
  const belowCap = maxBelowPx * envelope;
  const aboveCap = maxAbovePx * envelope;

  const amp = Math.abs(spring.x) + Math.abs(spring.v) * 0.04;
  let tailAt = tailStartedAt;
  const tailReady =
    jellyElapsed >= jellyMinDuration * 0.88 && amp < cellH * 0.016;
  if (tailReady && tailAt === null) {
    tailAt = now;
  }

  let tailBlend = 0;
  if (tailAt !== null && tailDuration > 0) {
    tailBlend = Math.min(1, (now - tailAt) / tailDuration);
    tailBlend = 1 - (1 - tailBlend) ** 2.6;
  }

  const dampScale =
    dampScaleOverride ?? landJellyDampScale(jellyElapsed, jellyMinDuration, tailBlend);
  stepLandJellySpring(spring, {
    dt,
    dampScale,
    chainPull,
    belowCapPx: belowCap,
    aboveCapPx: aboveCap,
  });

  node.root.y = gridY + spring.x * (1 - tailBlend);
  return tailAt;
}

/**
 * @param {number} fallDist px
 * @param {number} fallMs
 * @param {number} driveVel px/s
 * @param {number} landVelFactor
 */
function landJellyImpactVel(fallDist, fallMs, driveVel, landVelFactor) {
  const avgVel = fallDist / Math.max(0.001, fallMs / 1000);
  const peakVel = avgVel * 1.45;
  return Math.max(driveVel, peakVel) * landVelFactor;
}

/**
 * Cascade animation — eased fall, spin hold lane, then spin land jelly (continues after chain release).
 * @param {Array<{ node: { root: { y: number } }, startY?: number, targetY: number, delayMs?: number, fallMs?: number }>} entries
 * @param {object} opts
 * @param {number} opts.cellH
 * @param {number} [opts.fallMs=300]
 * @param {number} [opts.maxSettleMs=720]
 * @param {number} [opts.jellyStiffness=56]
 * @param {number} [opts.jellyDamping=3.35]
 * @param {number} [opts.jellyMinMs=440]
 * @param {number} [opts.jellyLandVelFactor=0.44]
 * @param {number} [opts.jellyMaxBelowRatio=0.065]
 * @param {number} [opts.jellyMaxAboveRatio=0.072]
 * @param {number} [opts.jellyTailMs=110]
 * @param {number} [opts.jellyChainCoupling=0.38]
 * @param {number} [opts.jellyLandImpactScale=1]
 * @param {number} [opts.chainReleaseMs] Game chain may proceed; jelly keeps running until settled.
 * @returns {Promise<void> & { settled?: Promise<void>, cancel?: () => void }}
 */
export function animateCascadeJiggle(
  entries,
  {
    cellH,
    fallMs = 300,
    maxSettleMs = 720,
    jellyStiffness = 56,
    jellyDamping = 3.35,
    jellyMinMs = 440,
    jellyLandVelFactor = 0.44,
    jellyMaxBelowRatio = 0.065,
    jellyMaxAboveRatio = 0.072,
    jellyTailMs = 110,
    jellyChainCoupling = 0.38,
    jellyLandImpactScale = 1,
    chainReleaseMs = null,
    speed = 1,
  },
) {
  if (!entries.length) return Promise.resolve();

  const maxBelowPx = cellH * jellyMaxBelowRatio;
  const maxAbovePx = cellH * jellyMaxAboveRatio;
  const settleThreshold = Math.max(0.04, cellH * 0.004);
  const jellyMinDuration = jellyMinMs / speed;
  const tailDuration = jellyTailMs / speed;
  const maxDuration = maxSettleMs / speed;
  const chainReleaseDuration =
    chainReleaseMs != null ? Math.max(80, chainReleaseMs / speed) : null;

  const items = entries.map((entry) => {
    const startY = entry.startY ?? entry.node.root.y;
    const jellySpring = new Spring1D(jellyStiffness, jellyDamping, 0.92);
    jellySpring.set(0);
    return {
      node: entry.node,
      startY,
      targetY: entry.targetY,
      fallDist: Math.abs((entry.targetY ?? startY) - startY),
      delayMs: (entry.delayMs ?? 0) / speed,
      fallMs: Math.max(120, (entry.fallMs ?? fallMs) / speed),
      jellySpring,
      pendingImpactVel: 0,
      lastFallY: startY,
      phase: /** @type {'fall' | 'jelly'} */ ('fall'),
      impactAt: null,
      tailStartedAt: null,
    };
  });

  let cancelled = false;
  /** @type {(() => void) | null} */
  let settleDone = null;
  /** @type {Promise<void>} */
  let settledPromise;

  /** @type {Promise<void> & { settled?: Promise<void>, cancel?: () => void }} */
  const promise = new Promise((resolve) => {
    settledPromise = new Promise((settledResolve) => {
      settleDone = settledResolve;
    });

    const start = performance.now();
    let lastNow = start;
    let finished = false;
    let chainReleased = false;

    const snapTargetY = (y) => Math.round(y * 100) / 100;

    const finishAll = () => {
      if (finished) return;
      finished = true;
      for (const item of items) {
        item.node.root.y = snapTargetY(item.targetY);
        item.jellySpring.set(0, 0);
      }
      settleDone?.();
    };

    const releaseChain = () => {
      if (chainReleased) return;
      chainReleased = true;
      resolve();
    };

    const beginJelly = (item, now, approachVel) => {
      let impactVel = landJellyImpactVel(
        item.fallDist,
        item.fallMs,
        approachVel,
        jellyLandVelFactor,
      );
      impactVel *= Math.max(0.38, jellyLandImpactScale);
      item.pendingImpactVel = Math.min(impactVel, cellH * 2.8);

      const off = item.node.root.y - item.targetY;
      const rowV = Math.min(approachVel, item.pendingImpactVel) * 0.78;
      const startV =
        -rowV * 0.92 +
        (Math.abs(off) < 0.35 ? item.pendingImpactVel * 0.14 : 0);
      item.jellySpring.set(off, startV);
      item.phase = 'jelly';
      item.impactAt = now;
      item.tailStartedAt = null;
    };

    const step = (now) => {
      if (finished) return;
      if (cancelled) {
        finishAll();
        return;
      }

      const dt = Math.min(0.032, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;
      const elapsed = now - start;

      const active = items.filter((item) => elapsed >= item.delayMs);
      if (!active.length) {
        requestAnimationFrame(step);
        return;
      }

      const ordered = [...active].sort((a, b) => b.targetY - a.targetY);

      for (let slot = 0; slot < ordered.length; slot += 1) {
        const item = ordered[slot];
        const itemElapsed = elapsed - item.delayMs;

        if (item.phase === 'fall') {
          const fallT = Math.min(1, itemElapsed / item.fallMs);
          const baseY =
            item.startY + (item.targetY - item.startY) * easeCascadeFall(fallT);
          const squash = cascadeFallSquashBlend(fallT, cellH, item.fallDist);
          const driveY = baseY + squash;
          const approachVel = Math.abs((driveY - item.lastFallY) / Math.max(dt, 0.001));
          item.lastFallY = driveY;
          item.node.root.y = driveY;

          if (fallT < 1) continue;

          beginJelly(item, now, approachVel);
        }

        if (item.phase === 'jelly' && item.impactAt !== null) {
          const jellyElapsed = now - item.impactAt;

          let chainPull = 0;
          if (slot > 0 && jellyElapsed < jellyMinDuration * 0.6) {
            chainPull = ordered[slot - 1].jellySpring.x * jellyChainCoupling * 0.28;
          }

          let dampScaleOverride = null;
          if (jellyElapsed < 48) {
            dampScaleOverride = 0.5 + (jellyElapsed / 48) * 0.32;
          } else if (jellyElapsed < 72) {
            dampScaleOverride = 0.82 + ((jellyElapsed - 48) / 24) * 0.28;
          }

          item.tailStartedAt = tickLandJellyFrame({
            spring: item.jellySpring,
            gridY: item.targetY,
            node: item.node,
            jellyElapsed,
            jellyMinDuration,
            cellH,
            maxBelowPx,
            maxAbovePx,
            tailDuration,
            tailStartedAt: item.tailStartedAt,
            now,
            dt,
            chainPull,
            dampScaleOverride,
          });
        }
      }

      const allJellyDone = active.every((item) => {
        if (item.phase !== 'jelly' || item.impactAt === null) return false;
        const jellyElapsed = now - item.impactAt;
        if (jellyElapsed < jellyMinDuration * 0.75) return false;
        if (item.tailStartedAt === null) return false;
        const tailDone =
          tailDuration <= 0 || now - item.tailStartedAt >= tailDuration * 0.92;
        return (
          tailDone &&
          Math.abs(item.node.root.y - item.targetY) < settleThreshold &&
          Math.abs(item.jellySpring.v) < settleThreshold * 2
        );
      });

      const chainReady =
        chainReleaseDuration !== null &&
        !chainReleased &&
        active.length > 0 &&
        active.every((item) => item.phase === 'jelly') &&
        Math.max(
          ...active.map((item) => (item.impactAt === null ? 0 : now - item.impactAt)),
        ) >= chainReleaseDuration;

      const maxActiveElapsed = Math.max(...active.map((item) => elapsed - item.delayMs));
      const pastMaxDuration =
        maxActiveElapsed > Math.max(...active.map((i) => i.fallMs)) + maxDuration * 1.8;

      if (chainReady) {
        releaseChain();
      }

      if (allJellyDone || pastMaxDuration) {
        finishAll();
        return;
      }

      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });

  promise.cancel = () => {
    cancelled = true;
  };
  promise.settled = settledPromise;

  return promise;
}
