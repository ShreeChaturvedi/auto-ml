import { createLocalNumberPref, createLocalStringPref } from './localPref';

const nullDisplay = createLocalStringPref(
  'automl-null-display',
  'empty' as const,
  ['empty', 'NULL', 'N/A', '—'] as const,
);
export const getNullDisplayPref = nullDisplay.get;
export const setNullDisplayPref = nullDisplay.set;
export const subscribeNullDisplayPref = nullDisplay.subscribe;

const decimalPrecision = createLocalNumberPref('automl-decimal-precision', 3);
export const getDecimalPrecisionPref = decimalPrecision.get;
export const setDecimalPrecisionPref = decimalPrecision.set;
export const subscribeDecimalPrecisionPref = decimalPrecision.subscribe;

const pageSize = createLocalNumberPref('automl-page-size', 200);
export const getPageSizePref = pageSize.get;
export const setPageSizePref = pageSize.set;
export const subscribePageSizePref = pageSize.subscribe;

const defaultChart = createLocalStringPref(
  'automl-default-chart',
  'histogram' as const,
  ['histogram', 'box', 'violin'] as const,
);
export const getDefaultChartPref = defaultChart.get;
export const setDefaultChartPref = defaultChart.set;
export const subscribeDefaultChartPref = defaultChart.subscribe;

const defaultCorrelation = createLocalStringPref(
  'automl-default-correlation',
  'heatmap' as const,
  ['heatmap', 'pairplot', 'scatter3d'] as const,
);
export const getDefaultCorrelationPref = defaultCorrelation.get;
export const setDefaultCorrelationPref = defaultCorrelation.set;
export const subscribeDefaultCorrelationPref = defaultCorrelation.subscribe;

const exportFormat = createLocalStringPref(
  'automl-export-format',
  'csv' as const,
  ['csv', 'json', 'xlsx'] as const,
);
export const getExportFormatPref = exportFormat.get;
export const setExportFormatPref = exportFormat.set;
export const subscribeExportFormatPref = exportFormat.subscribe;
