import { createLocalBoolPref, createLocalStringPref } from './localPref';

const reduceMotion = createLocalBoolPref('automl-reduce-motion', false);
export const getReduceMotionPref = reduceMotion.get;
export const setReduceMotionPref = reduceMotion.set;
export const subscribeReduceMotionPref = reduceMotion.subscribe;

const restoreProject = createLocalBoolPref('automl-restore-project', false);
export const getRestoreProjectPref = restoreProject.get;
export const setRestoreProjectPref = restoreProject.set;
export const subscribeRestoreProjectPref = restoreProject.subscribe;

const showTips = createLocalBoolPref('automl-show-tips', true);
export const getShowTipsPref = showTips.get;
export const setShowTipsPref = showTips.set;
export const subscribeShowTipsPref = showTips.subscribe;

const toolVisibility = createLocalStringPref(
  'automl-tool-visibility',
  'expanded' as const,
  ['expanded', 'collapsed', 'hidden'] as const,
);
export const getToolVisibilityPref = toolVisibility.get;
export const setToolVisibilityPref = toolVisibility.set;
export const subscribeToolVisibilityPref = toolVisibility.subscribe;
