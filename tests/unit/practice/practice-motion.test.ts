import { describe, expect, it, vi } from 'vitest';
import { createPracticeMotionController } from '../../../src/lib/browser/practice-motion';
import { DEFAULT_MEDITATION_SETUP } from '../../../src/lib/browser/practice-meditation';

class FakeMotionTarget {
  DeviceMotionEvent: { requestPermission?: () => Promise<'denied' | 'granted'> } | undefined = {};
  listener: ((event: DeviceMotionEvent) => void) | null = null;

  addEventListener(_type: 'devicemotion', listener: (event: DeviceMotionEvent) => void): void {
    this.listener = listener;
  }

  removeEventListener(_type: 'devicemotion', listener: (event: DeviceMotionEvent) => void): void {
    if (this.listener === listener) this.listener = null;
  }

  emit(x: number | null, y: number | null, z: number | null): void {
    this.listener?.({ acceleration: { x, y, z } } as DeviceMotionEvent);
  }
}

describe('practice motion controller', () => {
  it('starts disabled and reports unsupported browsers without fabricated samples', async () => {
    const target = new FakeMotionTarget();
    target.DeviceMotionEvent = undefined;
    const controller = createPracticeMotionController({ target } as never);

    expect(DEFAULT_MEDITATION_SETUP.motionEnabled).toBe(false);
    expect(controller.getEvidence()).toEqual({ motionStatus: 'disabled' });
    await expect(controller.requestAndStart()).resolves.toMatchObject({ status: 'unsupported' });
    expect(controller.getEvidence()).toEqual({ motionStatus: 'unsupported' });
    expect(target.listener).toBeNull();
  });

  it('requests guarded permission only when explicitly started and distinguishes denial from errors', async () => {
    const deniedTarget = new FakeMotionTarget();
    const requestPermission = vi.fn(async () => 'denied' as const);
    deniedTarget.DeviceMotionEvent = { requestPermission };
    const deniedController = createPracticeMotionController({ target: deniedTarget } as never);

    expect(requestPermission).not.toHaveBeenCalled();
    await deniedController.requestAndStart();
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(deniedController.getSnapshot().status).toBe('denied');
    expect(deniedTarget.listener).toBeNull();

    const errorTarget = new FakeMotionTarget();
    errorTarget.DeviceMotionEvent = { requestPermission: vi.fn(async () => { throw new Error('sensor failure'); }) };
    const errorController = createPracticeMotionController({ target: errorTarget } as never);
    await errorController.requestAndStart();
    expect(errorController.getEvidence()).toEqual({ motionStatus: 'error' });
  });

  it('rate-limits and caps aggregate samples without retaining raw motion events', async () => {
    const target = new FakeMotionTarget();
    let observedAtMs = 0;
    const controller = createPracticeMotionController({
      maximumSamples: 2,
      minimumSampleIntervalMs: 100,
      now: () => observedAtMs,
      stillnessThreshold: 0.35,
      target,
    } as never);

    await controller.requestAndStart();
    target.emit(0.1, 0.1, 0.1);
    observedAtMs = 50;
    target.emit(5, 0, 0);
    observedAtMs = 100;
    target.emit(5, 0, 0);

    expect(controller.getSnapshot()).toEqual({
      sampleCount: 2,
      sampleLimitReached: true,
      status: 'sampling',
      stillnessPercent: 50,
      stillSampleCount: 1,
    });
    expect(controller.getEvidence()).toEqual({
      motionSampleCount: 2,
      motionSampleLimitReached: true,
      motionStatus: 'sampling',
      motionStillnessPercent: 50,
    });
    expect(target.listener).toBeNull();
  });

  it('removes its listener on stop and never attaches after a pending permission request is stopped', async () => {
    const target = new FakeMotionTarget();
    const controller = createPracticeMotionController({ target } as never);
    await controller.requestAndStart();
    expect(target.listener).not.toBeNull();
    controller.stop();
    expect(target.listener).toBeNull();

    let resolvePermission: ((permission: 'granted') => void) | undefined;
    const pendingTarget = new FakeMotionTarget();
    pendingTarget.DeviceMotionEvent = {
      requestPermission: () => new Promise((resolve) => { resolvePermission = resolve; }),
    };
    const pendingController = createPracticeMotionController({ target: pendingTarget } as never);
    const permission = pendingController.requestAndStart();
    expect(pendingController.getSnapshot().status).toBe('requesting');
    pendingController.stop();
    resolvePermission?.('granted');
    await permission;
    expect(pendingTarget.listener).toBeNull();
    expect(pendingController.getSnapshot().status).toBe('disabled');
  });
});
