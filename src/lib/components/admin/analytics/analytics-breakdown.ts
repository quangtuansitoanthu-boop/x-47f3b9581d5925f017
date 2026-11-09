export type AnalyticsIconDimension =
  | 'browser'
  | 'city'
  | 'country'
  | 'device'
  | 'operating-system'
  | 'page'
  | 'region'
  | 'source';

export interface AnalyticsBreakdownRowView {
  label: string;
  note?: string;
  value: number;
}

export interface AnalyticsBreakdownTabView {
  emptyMessage: string;
  iconDimension: AnalyticsIconDimension;
  id: string;
  label: string;
  rows: AnalyticsBreakdownRowView[];
}
