import { describe, expect, it } from 'vitest';

import {
  LEGACY_BASELINE_EVIDENCE,
  LEGACY_MASTER_LAYOUT_CONTRACT,
  LEGACY_ROUTE_MATRIX,
  LEGACY_STORAGE_AND_IDB_CONTRACT,
  LEGACY_VISUAL_BASELINES,
} from '../../src/lib/contracts/legacy-compatibility';
import {
  EXPECTED_BASELINE_EVIDENCE,
  EXPECTED_LOCAL_STORAGE_KEYS,
  EXPECTED_ROUTE_REDIRECTS,
  EXPECTED_SESSION_STORAGE_KEYS,
  EXPECTED_VISUAL_PROJECTS,
} from './fixtures/legacy-contract-fixtures';

describe('legacy compatibility contract', () => {
  it('freezes baseline suite evidence', () => {
    expect(LEGACY_BASELINE_EVIDENCE.buildSuite).toEqual(EXPECTED_BASELINE_EVIDENCE.buildSuite);
    expect(LEGACY_BASELINE_EVIDENCE.workerSuite).toEqual(EXPECTED_BASELINE_EVIDENCE.workerSuite);
    expect(LEGACY_BASELINE_EVIDENCE.migrationSuite.expectedFailures).toBe(
      EXPECTED_BASELINE_EVIDENCE.migrationSuite.expectedFailures,
    );
  });

  it('enumerates exact legacy storage keys and prefixes', () => {
    expect(Object.values(LEGACY_STORAGE_AND_IDB_CONTRACT.localStorageKeys).sort()).toEqual(
      [...EXPECTED_LOCAL_STORAGE_KEYS].sort(),
    );
    expect(Object.values(LEGACY_STORAGE_AND_IDB_CONTRACT.sessionStorageKeys).sort()).toEqual(
      [...EXPECTED_SESSION_STORAGE_KEYS].sort(),
    );
    expect(LEGACY_STORAGE_AND_IDB_CONTRACT.localStoragePrefixes.talkAlbumPosition).toBe('tutam_pt_pos_');
    expect(LEGACY_STORAGE_AND_IDB_CONTRACT.indexedDb.offlineAudio).toEqual({
      databaseName: 'tutam_offline_audio',
      stores: {
        albums: { keyPath: 'id' },
        tracks: { keyPath: 'url' },
      },
      version: 1,
    });
  });

  it('keeps legacy redirects and query-preserving behavior', () => {
    const redirects = LEGACY_ROUTE_MATRIX
      .filter((route) => route.redirectStatus)
      .map(({ canonicalPathname, pathname, redirectStatus }) => ({
        canonicalPathname,
        pathname,
        redirectStatus,
      }));
    expect(redirects).toEqual(EXPECTED_ROUTE_REDIRECTS);
    expect(LEGACY_ROUTE_MATRIX.every((route) => route.preservesQuery)).toBe(true);
  });

  it('documents the master layout contract', () => {
    expect(LEGACY_MASTER_LAYOUT_CONTRACT.layoutId).toBe('quangtu-master-layout');
    expect(LEGACY_MASTER_LAYOUT_CONTRACT.sharedShellState).toContain('dark-mode');
    expect(LEGACY_MASTER_LAYOUT_CONTRACT.nestedLayoutsMayOwn).not.toContain('navigation-shell');
  });

  it('pins visual baseline projects for Browser comparison work', () => {
    expect(LEGACY_VISUAL_BASELINES.projects.map((project) => project.id)).toEqual(
      EXPECTED_VISUAL_PROJECTS,
    );
    expect(LEGACY_VISUAL_BASELINES.routes).toEqual([
      '/',
      '/tu-tap',
      '/phap-thoai',
      '/huong-dan',
    ]);
  });
});
