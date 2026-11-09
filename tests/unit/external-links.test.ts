import {afterEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({native:true,platform:'android',open:vi.fn()}));
vi.mock('@capacitor/core',()=>({registerPlugin:()=>({openBrowser:state.open})}));
vi.mock('$lib/browser/native-platform',()=>({isNativeApp:()=>state.native,nativePlatform:()=>state.platform}));
import {copyExternalLink,openExternalBrowser} from '$lib/browser/external-links';
afterEach(()=>{vi.unstubAllGlobals();state.native=true;state.platform='android';state.open.mockReset();});
describe('external guide links',()=>{
 it('uses the Android browser bridge without navigating the WebView',async()=>{const open=vi.fn();vi.stubGlobal('window',{open});await openExternalBrowser('https://drive.google.com/file/d/example/view');expect(state.open).toHaveBeenCalledWith({url:'https://drive.google.com/file/d/example/view'});expect(open).not.toHaveBeenCalled();});
 it('propagates native failure for actionable UI feedback',async()=>{state.open.mockRejectedValue(new Error('no browser'));await expect(openExternalBrowser('https://example.org/')).rejects.toThrow('external_browser_unavailable');});
 it('uses a separate window on web and iOS',async()=>{const open=vi.fn();vi.stubGlobal('window',{open});state.platform='ios';await openExternalBrowser('https://example.org/');state.native=false;await openExternalBrowser('https://example.org/');expect(open).toHaveBeenCalledTimes(2);expect(open).toHaveBeenCalledWith('https://example.org/','_blank','noopener,noreferrer');});
 it('copies the exact HTTPS address and reports permission failures',async()=>{const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}});await copyExternalLink('https://drive.google.com/file/d/example/view?usp=sharing');expect(writeText).toHaveBeenCalledWith('https://drive.google.com/file/d/example/view?usp=sharing');writeText.mockRejectedValue(new Error('denied'));await expect(copyExternalLink('https://example.org')).rejects.toThrow('denied');});
 it('rejects unsafe URLs before opening or copying',async()=>{for(const value of ['javascript:alert(1)','http://example.org','https://user:password@example.org']){await expect(openExternalBrowser(value)).rejects.toThrow();await expect(copyExternalLink(value)).rejects.toThrow();}expect(state.open).not.toHaveBeenCalled();});
});
