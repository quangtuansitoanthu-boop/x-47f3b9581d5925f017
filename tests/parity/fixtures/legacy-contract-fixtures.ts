export const EXPECTED_BASELINE_EVIDENCE = Object.freeze({
  buildSuite: { passed: 19, total: 19 },
  migrationSuite: { expectedFailures: 3, passed: 10, total: 13 },
  workerAssetVersion: 'v37',
  workerSuite: { passed: 57, total: 57 },
} as const);

export const EXPECTED_LOCAL_STORAGE_KEYS = Object.freeze([
  'pt_listened_albums',
  'ttTrackerOpen',
  'tt_bg',
  'tt_fs',
  'tt_light_bg',
  'tt_practice_bg',
  'tt_practice_bold',
  'tt_practice_logs_v1',
  'tt_rosary_count',
  'tt_rosary_dir',
  'tt_rosary_sound',
  'ttr_fab_pos',
  'tutam_articles_v4',
  'tutam_bookmarks_v1',
  'tutam_dark_mode',
  'tutam_form_left_pct',
  'tutam_pdf_bookmarks_v1',
  'tutam_pt_state',
  'tutam_read_align',
  'tutam_read_bg',
  'tutam_read_bold',
  'tutam_read_font',
  'tutam_read_fontsize',
  'tutam_recent_albums',
  'tutam_thaptrai_collapsed_date',
  'tutam_thaptrai_notified_date',
] as const);

export const EXPECTED_SESSION_STORAGE_KEYS = Object.freeze([
  'tutam_role',
  'tutam_user',
] as const);

export const EXPECTED_ROUTE_REDIRECTS = Object.freeze([
  { canonicalPathname: '/', pathname: '/index.html', redirectStatus: 308 },
  { canonicalPathname: '/tu-tap', pathname: '/tu-tap.html', redirectStatus: 308 },
  { canonicalPathname: '/tu-tap', pathname: '/tutap.html', redirectStatus: 308 },
  { canonicalPathname: '/phap-thoai', pathname: '/phap-thoai.html', redirectStatus: 308 },
  { canonicalPathname: '/phap-thoai', pathname: '/phapthoai.html', redirectStatus: 308 },
  { canonicalPathname: '/huong-dan', pathname: '/huong-dan.html', redirectStatus: 308 },
  { canonicalPathname: '/huong-dan', pathname: '/huongdan.html', redirectStatus: 308 },
] as const);

export const EXPECTED_VISUAL_PROJECTS = Object.freeze([
  'mobile-390-light',
  'mobile-390-dark',
  'desktop-1440-light',
  'desktop-1440-dark',
] as const);
