import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('optimizes release code and resources by default while allowing explicit QA opt-out', () => {
  const gradle = readFileSync('android/app/build.gradle', 'utf8');
  expect(gradle).toContain("findProperty('enableReleaseR8')");
  expect(gradle).toContain('minifyEnabled releaseR8Enabled');
  expect(gradle).toContain("findProperty('enableReleaseR8') ?: 'true'");
  expect(gradle).toContain('shrinkResources releaseR8Enabled');
  expect(gradle).toContain("proguard-android-optimize.txt");
});

it('preserves runtime bridge annotations and stack trace locations without keeping the entire app', () => {
  const rules = readFileSync('android/app/proguard-rules.pro', 'utf8');
  expect(rules).toContain('-keepattributes RuntimeVisibleAnnotations,AnnotationDefault');
  expect(rules).toContain('-keepattributes SourceFile,LineNumberTable');
  expect(rules).toContain('-keep @interface com.getcapacitor.annotation.**');
  expect(rules).not.toMatch(/-keep\s+class\s+vn\.quangtu\.tutam\.\*\*/u);
});
