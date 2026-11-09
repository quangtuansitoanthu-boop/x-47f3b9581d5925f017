export type TrafficMetricFormat = 'decimal' | 'duration' | 'number' | 'percent';

export type TrafficMetricKey =
  | 'averageDurationSeconds'
  | 'bounceRate'
  | 'pageviews'
  | 'viewsPerVisit'
  | 'visitors'
  | 'visits';

export interface TrafficChartMetric {
  format: TrafficMetricFormat;
  key: TrafficMetricKey;
  label: string;
  value: string;
}

export interface TrafficChartPoint {
  averageDurationSeconds?: number;
  bounceRate?: number;
  date: string;
  pageviews?: number;
  viewsPerVisit?: number;
  visitors: number;
  visits?: number;
}
