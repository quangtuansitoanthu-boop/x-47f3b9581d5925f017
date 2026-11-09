import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReaderProgressSync } from '$lib/browser/reader-progress-sync';
afterEach(()=>vi.useRealTimers());
describe('reader server sync coalescing',()=>{
  it('keeps only the latest server task during thirty seconds of continuous reading',()=>{
    vi.useFakeTimers();const sync=createReaderProgressSync();const write=vi.fn();
    for(let i=0;i<19;i++){sync.schedule(()=>write(i));vi.advanceTimersByTime(1500);}
    expect(write).not.toHaveBeenCalled();vi.advanceTimersByTime(1500);
    expect(write).toHaveBeenCalledExactlyOnceWith(18);
  });
  it('flushes immediately on close without a duplicate timer request',()=>{
    vi.useFakeTimers();const sync=createReaderProgressSync();const write=vi.fn();
    sync.schedule(write);sync.flush();vi.advanceTimersByTime(60000);
    expect(write).toHaveBeenCalledOnce();
  });
  it('cancels a pending task on teardown',()=>{
    vi.useFakeTimers();const sync=createReaderProgressSync();const write=vi.fn();
    sync.schedule(write);sync.cancel();vi.advanceTimersByTime(60000);
    expect(write).not.toHaveBeenCalled();
  });
});
