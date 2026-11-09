export type ContentRow = { id: string; [key: string]: unknown };
export const CONTENT_PACKAGE_CACHE = 'tutam-content-packages-v1';
export const CONTENT_IMAGE_CACHE = 'tutam-public-covers-v1';
export type ContentGroup = 'book' | 'scripture' | 'ritual' | 'pdf' | 'talk';
export interface ContentUpdateItem {
  kind: 'article' | 'talk';
  group: ContentGroup;
  mode: 'full' | 'shell';
  version: string;
  row: ContentRow;
}
export interface ContentCatalogPage {
  items: ContentUpdateItem[];
  articlesNext: string | null;
  talksNext: string | null;
}
export interface ContentSize {
  id: string;
  bytes: number;
  chapters: number;
  illustrated: boolean;
}
export interface ContentArticlePage {
  article: ContentRow;
  chapters: ContentRow[];
  next: number | null;
}
