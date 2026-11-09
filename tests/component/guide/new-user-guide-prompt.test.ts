import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/lib/components/guide/NewUserGuidePrompt.svelte', 'utf8');

describe('NewUserGuidePrompt contract', () => {
  it('contains proper messaging for new user cultivation guide prompt', () => {
    expect(source).toContain('Hướng dẫn tu tập cho người mới');
    expect(source).toContain('Xem hướng dẫn');
    expect(source).toContain('Để sau');
    expect(source).toContain('/huong-dan#huong-dan-nguoi-moi');
  });

  it('displays for new visitors and accounts who have not dismissed the guide', () => {
    expect(source).toContain('!dismissedManually');
    expect(source).toContain('!isStoredDismissed()');
    expect(source).toContain('tutam_new_user_guide_seen_guest');
  });

  it('does not display on the guide page itself', () => {
    expect(source).toContain("currentPath.startsWith('/huong-dan')");
    expect(source).toContain('return false');
  });

  it('marks as dismissed in localStorage per user ID', () => {
    expect(source).toContain('tutam_new_user_guide_seen_');
    expect(source).toContain('localStorage.setItem(storageKey, \'1\')');
  });
});
