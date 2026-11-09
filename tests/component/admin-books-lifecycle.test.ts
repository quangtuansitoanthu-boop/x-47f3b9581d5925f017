import { describe, expect, it } from 'vitest';
import {
  createChapterImageUploadCoordinator,
  createChapterLoadCoordinator,
  isChapterDraftDirty,
  serializeChapterDraft,
  type Chapter
} from '../../src/lib/components/admin/books/ChapterEditor.svelte';
import { hasUnsavedBookWork } from '../../src/lib/components/admin/books/BookManager.svelte';
import { canChangeActiveBook } from '../../src/lib/components/admin/books/BookManager.svelte';
import { resolveInitialBook } from '../../src/lib/components/admin/books/BookManager.svelte';

const chapter = (title:string):Chapter => ({
  tieu_de:title,
  tom_tat:'',
  noi_dung:`Nội dung ${title}`,
  so_thu_tu:0
});

describe('admin book chapter lifecycle',()=>{
  it('opens the requested book from homepage edit controls',()=>{
    const books=[{id:'first'},{id:'target'}];
    expect(resolveInitialBook(books,'target')).toEqual({id:'target'});
    expect(resolveInitialBook(books,'missing')).toBeNull();
  });

  it('aborts the previous request and rejects a late response from the old book',()=>{
    const coordinator=createChapterLoadCoordinator();
    const first=coordinator.begin('book-a');
    const second=coordinator.begin('book-b');
    const applied:string[]=[];

    if(coordinator.isCurrent(second,'book-b'))applied.push('book-b');
    if(coordinator.isCurrent(first,'book-b'))applied.push('book-a');

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(applied).toEqual(['book-b']);
  });

  it('invalidates the active request when the editor is destroyed',()=>{
    const coordinator=createChapterLoadCoordinator();
    const active=coordinator.begin('book-a');

    coordinator.dispose();

    expect(active.signal.aborted).toBe(true);
    expect(coordinator.isCurrent(active,'book-a')).toBe(false);
  });

  it('tracks chapter edits and resets dirty state after the saved snapshot advances',()=>{
    const loaded=[chapter('Tập 1')];
    const loadedSnapshot=serializeChapterDraft(loaded);
    const edited=[{...loaded[0],tieu_de:'Tập mở đầu'}];

    expect(isChapterDraftDirty(null,[])).toBe(false);
    expect(isChapterDraftDirty(null,loaded)).toBe(true);
    expect(isChapterDraftDirty(loadedSnapshot,loaded)).toBe(false);
    expect(isChapterDraftDirty(loadedSnapshot,edited)).toBe(true);
    expect(isChapterDraftDirty(serializeChapterDraft(edited),edited)).toBe(false);
  });

  it('treats either the main form or chapter editor as unsaved work',()=>{
    expect(hasUnsavedBookWork(false,false)).toBe(false);
    expect(hasUnsavedBookWork(true,false)).toBe(true);
    expect(hasUnsavedBookWork(false,true)).toBe(true);
    expect(hasUnsavedBookWork(true,true)).toBe(true);
  });

  it('rejects a delayed image completion after the active chapter generation changes', async () => {
    const coordinator=createChapterImageUploadCoordinator();
    const ticket=coordinator.begin('book-a','id:chapter-a');
    let releaseUpload=(url:string)=>{};
    const delayedUpload=new Promise<string>((resolve)=>{releaseUpload=resolve});
    const inserted:string[]=[];
    const completion=(async()=>{
      const url=await delayedUpload;
      if(coordinator.isCurrent(ticket,'book-b','id:chapter-b'))inserted.push(url);
    })();

    coordinator.invalidate();
    releaseUpload('/api/media/content/late-image.webp');
    await completion;

    expect(inserted).toEqual([]);
    expect(coordinator.isCurrent(ticket,'book-b','id:chapter-b')).toBe(false);
  });

  it('locks book changes while a chapter image upload is active',()=>{
    expect(canChangeActiveBook(false)).toBe(true);
    expect(canChangeActiveBook(true)).toBe(false);
  });
});
