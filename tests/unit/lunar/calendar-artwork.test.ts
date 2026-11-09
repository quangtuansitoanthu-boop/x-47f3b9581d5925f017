import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAILY_CALENDAR_ARTWORKS, FEAST_CALENDAR_ARTWORKS, getCalendarArtwork } from '$lib/components/lunar/calendar-artwork';
import { getLunarEvent, localizeLunarEvent } from '$lib/components/lunar/lunar-events';

describe('Buddhist calendar artwork rules',()=>{
  it('ships ten compressed, nonfigurative ordinary-day artworks under 1 MiB total',()=>{
    expect(DAILY_CALENDAR_ARTWORKS).toHaveLength(10);
    expect(DAILY_CALENDAR_ARTWORKS.reduce((sum,path)=>sum+statSync(`static${path}`).size,0)).toBeLessThan(1024*1024);
    expect(new Set(DAILY_CALENDAR_ARTWORKS).size).toBe(10);
  });
  it('covers every named feast with a real local asset and keeps ordinary days scenic in both languages',()=>{
    const seen = new Set<string>();
    for(let year=2024;year<=2030;year++)for(let offset=0;offset<366;offset++){
      const date=new Date(year,0,1+offset);
      const vi=getLunarEvent(date,'vi');const en=getLunarEvent(date,'en');
      expect(en.viaKey).toBe(vi.viaKey);
      const art=getCalendarArtwork(date,vi,4);
      expect(getCalendarArtwork(date,en,4)).toEqual(art);
      if(vi.viaKey && vi.viaKey!=='7-15'){
        seen.add(vi.viaKey);
        expect(art.feast,vi.viaName||'').toBe(true);
        expect(art.src).toBe(FEAST_CALENDAR_ARTWORKS[vi.viaKey]);
        expect(existsSync(`static${art.src}`)).toBe(true);
        // Manual selection can never replace the correct figure on a feast.
        expect(getCalendarArtwork(date,vi,0)).toEqual(art);
      }else{
        expect(art.feast).toBe(false);
        expect(DAILY_CALENDAR_ARTWORKS).toContain(art.src);
      }
      if(vi.lunarLeap){
        expect(vi.viaName).toBeNull();
        expect(localizeLunarEvent(vi,'en')?.viaName).toBeNull();
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(FEAST_CALENDAR_ARTWORKS).sort());
  });
  it('changes ordinary scenery each civil day without depending on clock time',()=>{
    const date=new Date(2026,1,18);const event=getLunarEvent(date);
    const first=getCalendarArtwork(date,event);
    expect(first.feast).toBe(false);
    expect(getCalendarArtwork(new Date(2026,1,18,23,59),event)).toEqual(first);
    expect(getCalendarArtwork(new Date(2026,1,19),getLunarEvent(new Date(2026,1,19))).src).not.toBe(first.src);
  });
});
