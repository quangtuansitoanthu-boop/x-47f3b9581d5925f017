import { describe, expect, it } from 'vitest';

import {
  clampPracticeFabPosition,
  snapPracticeFabPosition
} from '../../../src/lib/browser/practice-fab-controller';
import { resolveRosaryGesture } from '../../../src/lib/browser/rosary-bead-controller';

describe('practice interaction parity', () => {
  it('clamps a restored FAB inside the current viewport and snaps it to the nearest edge', () => {
    expect(clampPracticeFabPosition(
      { x: 900, y: -20 },
      { width: 800, height: 600 },
      { width: 80, height: 180 }
    )).toEqual({ x: 712, y: 8 });

    expect(snapPracticeFabPosition({ x: 500, y: 120 }, 800, 80)).toEqual({ x: 712, y: 120 });
    expect(snapPracticeFabPosition({ x: 120, y: 120 }, 800, 80)).toEqual({ x: 8, y: 120 });
  });

  it('uses velocity projection for rosary inertia while preserving configured direction', () => {
    expect(resolveRosaryGesture('up', -20, -20, 112, false)).toEqual({ delta: 1, targetOffset: -112 });
    expect(resolveRosaryGesture('down', -20, -20, 112, false)).toEqual({ delta: -1, targetOffset: -112 });
    expect(resolveRosaryGesture('down', 5, 0, 112, false)).toEqual({ delta: 0, targetOffset: 0 });
  });

  it('keeps taps as a direction-independent increment with matching bead travel', () => {
    expect(resolveRosaryGesture('up', 0, 0, 112, true)).toEqual({ delta: 1, targetOffset: -112 });
    expect(resolveRosaryGesture('down', 0, 0, 112, true)).toEqual({ delta: 1, targetOffset: 112 });
  });
});
