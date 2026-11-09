import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ android:true, save:vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin:() => ({ saveImage:native.save }) }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp:() => native.android, nativePlatform:() => native.android ? 'android' : 'web' }));
import { savePngImage } from '$lib/browser/image-export';
const png = () => new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1])], {type:'image/png'});
afterEach(() => { native.android=true; native.save.mockReset(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('waits for native completion and never starts a WebView download', async () => {
  let complete!: (value:{saved:boolean}) => void;
  native.save.mockImplementation(() => new Promise(resolve => { complete=resolve; }));
  const anchor = vi.fn(); vi.stubGlobal('document', { createElement:anchor });
  let settled = false;
  const pending = savePngImage(png(), 'test.png').then(value => { settled=true; return value; });
  await vi.waitFor(() => expect(native.save).toHaveBeenCalledOnce());
  expect(settled).toBe(false); expect(anchor).not.toHaveBeenCalled();
  expect(native.save.mock.calls[0][0]).toEqual({fileName:'test.png',base64:'iVBORw0KGgoB'});
  complete({saved:true}); await expect(pending).resolves.toBe(true);
});
it('propagates a failed native write without a false success', async () => {
  native.save.mockRejectedValue(new Error('SAVE_FAILED'));
  await expect(savePngImage(png(), 'test.png')).rejects.toThrow('SAVE_FAILED');
});
it('treats canceling the destination picker as unsaved', async () => {
  native.save.mockResolvedValue({saved:false});
  await expect(savePngImage(png(), 'test.png')).resolves.toBe(false);
});
it.each([new Blob(['bad'], {type:'image/png'}), new Blob(['bad'], {type:'image/jpeg'}), new Blob([new Uint8Array(8*1024*1024+1)], {type:'image/png'})])('rejects invalid or oversized image bytes before crossing the bridge', async blob => {
  await expect(savePngImage(blob, 'test.png')).rejects.toThrow('invalid_png');
  expect(native.save).not.toHaveBeenCalled();
});
it('keeps web downloads local and revokes the temporary URL', async () => {
  native.android=false; vi.useFakeTimers();
  const click=vi.fn(), remove=vi.fn(), revoke=vi.fn(), append=vi.fn();
  const link={href:'',download:'',style:{display:''},click,remove};
  vi.stubGlobal('document',{createElement:() => link,body:{append}});
  vi.stubGlobal('URL',{createObjectURL:() => 'blob:local',revokeObjectURL:revoke});
  await expect(savePngImage(png(),'test.png')).resolves.toBe(true);
  expect(click).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce(); expect(native.save).not.toHaveBeenCalled();
  await vi.runAllTimersAsync(); expect(revoke).toHaveBeenCalledWith('blob:local');
});
