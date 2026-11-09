import { describe, expect, it } from 'vitest';
import { createGuideSearchTargets, selectGuideSections } from '../../src/lib/content/guide-content';
import { doctrinalGuideSections } from '../../src/lib/content/guide-doctrinal-content';
import { enDoctrinalGuideSections, enGuideJumpLinks, enSoftwareGuideSections } from '../../src/lib/content/guide-content.en';

const destination = 'bo-thi-may-nghe-phap';

describe('English Dharma giving destination', () => {
  it('renders the destination advertised by the practice card and guide jump link', () => {
    expect(enGuideJumpLinks.some(link => link.id === destination)).toBe(true);
    const study = selectGuideSections([...enSoftwareGuideSections, ...enDoctrinalGuideSections], enSoftwareGuideSections.map(section => section.id), 'tu-hoc');
    const targets = createGuideSearchTargets(study);
    expect(targets.find(target => target.id === destination)).toMatchObject({ id: destination, sectionId: destination, kind: 'section' });
  });

  it('preserves all existing topic deep links and download destinations in translation', () => {
    const original = doctrinalGuideSections.find(section => section.id === destination)!;
    const translated = enDoctrinalGuideSections.find(section => section.id === destination);
    expect(translated).toBeDefined();
    expect(translated?.topics.map(topic => topic.id)).toEqual(original.topics.map(topic => topic.id));
    expect(translated?.faqs?.map(faq => faq.id)).toEqual(original.faqs?.map(faq => faq.id));
    const links = (section: typeof original) => section.topics.flatMap(topic => topic.blocks.flatMap(block => block.type === 'link' ? [{ href: block.href, externalActions: block.externalActions }] : []));
    expect(links(translated!)).toEqual(links(original));
    const catalog = translated!.topics.find(topic => topic.id === 'tai-ve-cac-bai-phap-tuyen-chon-cho-the-nho')!;
    const catalogItems = catalog.blocks.flatMap(block => block.type === 'bullets' ? block.items : []);
    expect(catalogItems).toHaveLength(29);
    const translatedText = JSON.stringify(translated);
    expect(translatedText).toContain('FAT32');
    expect(translatedText).toContain('4GB');
    expect(translatedText).toContain('21');
    expect(translatedText).toContain('3–5');
  });
});
