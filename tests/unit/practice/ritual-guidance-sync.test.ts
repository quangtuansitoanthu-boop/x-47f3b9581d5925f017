import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import revisions from '../../../src/lib/data/ritual-guidance-revision.json';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
describe('Vietnamese ritual guidance sync',()=>{
 it.each(revisions)('matches the web revision and preserves recitations for $id',revision=>{
  const rows=JSON.parse(readFileSync(`static/offline-data/chapters/${revision.id}.json`,'utf8'));
  const guide=rows.find((r:any)=>r.so_thu_tu===revision.chapterIndex);
  expect(hash(guide.noi_dung)).toBe(revision.sha256);
  for(const unchanged of revision.unchanged){
   expect(hash(rows.find((r:any)=>r.so_thu_tu===unchanged.index).noi_dung)).toBe(unchanged.sha256);
  }
 });
});
