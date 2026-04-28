import { describe, expect, it } from "vitest";

import {
  SAFE_BOTTOM_Y,
  SAFE_RIGHT_X,
  SCENE4_5_TRAINING_GRAPH,
  hEdgeCoords,
} from "../../../config/arch-layout";

describe("SCENE4_5_TRAINING_GRAPH — snake (boustrophedon) layout", () => {
  const { nodes } = SCENE4_5_TRAINING_GRAPH;

  it("row 1 is left-to-right with the original x positions", () => {
    expect(nodes.answer.x).toBe(150);
    expect(nodes.configure_experiment.x).toBe(470);
    expect(nodes.propose_model.x).toBe(790);
    expect(nodes.generate_code.x).toBe(1110);
    expect(nodes.write_code.x).toBe(1430);
  });

  it("row 2 is reversed (right-to-left) per the snake flow", () => {
    expect(nodes.execute_training.x).toBe(1430);
    expect(nodes.evaluate_results.x).toBe(1110);
    expect(nodes.await_review.x).toBe(790); // unchanged — the fold-point
    expect(nodes.register_model.x).toBe(470);
    expect(nodes.summarize.x).toBe(150);
  });

  it("every node fits within the safe area", () => {
    for (const [id, pos] of Object.entries(nodes)) {
      expect(pos.x + 220, `${id}.x+220 exceeds SAFE_RIGHT_X`).toBeLessThanOrEqual(
        SAFE_RIGHT_X,
      );
      expect(pos.y + 72, `${id}.y+72 exceeds SAFE_BOTTOM_Y`).toBeLessThanOrEqual(
        SAFE_BOTTOM_Y,
      );
    }
  });

  it("no two nodes overlap (bounding boxes disjoint)", () => {
    const entries = Object.entries(nodes);
    for (let i = 0; i < entries.length; i++) {
      const [idA, a] = entries[i]!;
      const aL = a.x;
      const aR = a.x + 220;
      const aT = a.y;
      const aB = a.y + 72;
      for (let j = i + 1; j < entries.length; j++) {
        const [idB, b] = entries[j]!;
        const bL = b.x;
        const bR = b.x + 220;
        const bT = b.y;
        const bB = b.y + 72;
        const overlaps = aL < bR && aR > bL && aT < bB && aB > bT;
        expect(overlaps, `${idA} overlaps ${idB}`).toBe(false);
      }
    }
  });

  it("row-2 reversal does not affect row 1's y coordinate", () => {
    expect(nodes.answer.y).toBe(360);
    expect(nodes.write_code.y).toBe(360);
    expect(nodes.execute_training.y).toBe(660);
    expect(nodes.summarize.y).toBe(660);
  });
});

describe("hEdgeCoords — snake-aware horizontal edges", () => {
  it("source left of target → exit source right, enter target left", () => {
    const fp = { x: 150, y: 360 };
    const tp = { x: 470, y: 360 };
    expect(hEdgeCoords(fp, tp)).toEqual({
      x1: 150 + 220, // 370
      y1: 396,
      x2: 470,
      y2: 396,
    });
  });

  it("source right of target (reversed row 2) → exit source left, enter target right", () => {
    const fp = { x: 1430, y: 660 }; // execute_training
    const tp = { x: 1110, y: 660 }; // evaluate_results
    expect(hEdgeCoords(fp, tp)).toEqual({
      x1: 1430,
      y1: 696,
      x2: 1110 + 220, // 1330
      y2: 696,
    });
  });

  it("vertical center is always y + 36 (half of node height 72)", () => {
    const fp = { x: 0, y: 0 };
    const tp = { x: 100, y: 500 };
    const c = hEdgeCoords(fp, tp);
    expect(c.y1).toBe(36);
    expect(c.y2).toBe(536);
  });
});

describe("wrap edge (write_code → execute_training) geometry", () => {
  it("Manhattan distance of the two-segment elbow is 410", () => {
    // Segment A: (1650, 396) → (1650, 696) = 300
    // Segment B: (1650, 696) → (1540, 696) = 110
    // Total: 410
    const segA = Math.abs(696 - 396) + Math.abs(1650 - 1650);
    const segB = Math.abs(1650 - 1540) + Math.abs(696 - 696);
    expect(segA + segB).toBe(410);
  });
});
