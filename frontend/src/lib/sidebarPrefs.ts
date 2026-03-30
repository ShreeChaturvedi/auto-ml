import { createLocalBoolPref } from './localPref';

const pref = createLocalBoolPref('automl-sidebar-accordion', false);

/** Whether sidebar uses accordion mode (only one phase expanded at a time). Default: false. */
export const getSidebarAccordionPref = pref.get;
export const setSidebarAccordionPref = pref.set;
export const subscribeSidebarAccordionPref = pref.subscribe;
