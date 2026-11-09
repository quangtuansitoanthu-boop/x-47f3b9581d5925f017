import {describe,expect,it} from 'vitest';
import {createGuideSearchTargets,searchGuideTargets,softwareGuideSections} from '../../../src/lib/content/guide-content';
import {enSoftwareGuideSections} from '../../../src/lib/content/guide-content.en';
describe('current app help navigation',()=>{
 it('finds manual updates and copying from the guide search in both languages',()=>{
  const vi=createGuideSearchTargets(softwareGuideSections),en=createGuideSearchTargets(enSoftwareGuideSections);
  expect(searchGuideTargets(vi,'cap nhat noi dung')[0]?.id).toBe('cap-nhat-noi-dung');
  expect(searchGuideTargets(vi,'chep kinh')[0]?.id).toBe('chep-kinh-tren-app');
  expect(searchGuideTargets(en,'manual content update')[0]?.id).toBe('cap-nhat-noi-dung');
  expect(searchGuideTargets(en,'sutra copying')[0]?.id).toBe('chep-kinh-tren-app');
 });
 it('keeps the same software topic anchors in Vietnamese and English',()=>{
  expect(enSoftwareGuideSections.flatMap(s=>s.topics.map(t=>t.id)).sort()).toEqual(softwareGuideSections.flatMap(s=>s.topics.map(t=>t.id)).sort());
 });
});
