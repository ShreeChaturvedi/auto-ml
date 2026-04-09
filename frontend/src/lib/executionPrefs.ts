import { createLocalBoolPref, createLocalNumberPref } from './localPref';

const chartHeight = createLocalNumberPref('automl-chart-height', 360);
export const getChartHeightPref = chartHeight.get;
export const setChartHeightPref = chartHeight.set;
export const subscribeChartHeightPref = chartHeight.subscribe;

const maxOutputHeight = createLocalNumberPref('automl-max-output-height', 0);
export const getMaxOutputHeightPref = maxOutputHeight.get;
export const setMaxOutputHeightPref = maxOutputHeight.set;
export const subscribeMaxOutputHeightPref = maxOutputHeight.subscribe;

const autoScrollOutput = createLocalBoolPref('automl-auto-scroll-output', true);
export const getAutoScrollOutputPref = autoScrollOutput.get;
export const setAutoScrollOutputPref = autoScrollOutput.set;
export const subscribeAutoScrollOutputPref = autoScrollOutput.subscribe;
