import { createLocalBoolPref } from './localPref';

const pref = createLocalBoolPref('automl-sidebar-accordion', false);

/** Whether sidebar uses accordion mode (only one phase expanded at a time). Default: false. */
export const getSidebarAccordionPref = pref.get;
export const setSidebarAccordionPref = pref.set;
export const subscribeSidebarAccordionPref = pref.subscribe;

const collapsedPref = createLocalBoolPref('automl-sidebar-collapsed', false);

/** Whether sidebar starts collapsed. Default: false. */
export const getSidebarCollapsedPref = collapsedPref.get;
export const setSidebarCollapsedPref = collapsedPref.set;
export const subscribeSidebarCollapsedPref = collapsedPref.subscribe;
