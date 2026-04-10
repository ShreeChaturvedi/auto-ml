import { describe, it, expect, beforeEach } from 'vitest';
import { usePreviewStore } from './previewStore';

describe('previewStore', () => {
  beforeEach(() => {
    usePreviewStore.setState(usePreviewStore.getInitialState());
  });

  it('starts with data-viewer as the active tab', () => {
    expect(usePreviewStore.getState().activeTab).toBe('data-viewer');
  });

  it('setActiveTab updates the active tab', () => {
    usePreviewStore.getState().setActiveTab('training');
    expect(usePreviewStore.getState().activeTab).toBe('training');
  });

  it('setDeploymentSubTab updates the deployment sub-tab only', () => {
    usePreviewStore.getState().setDeploymentSubTab('monitoring');
    expect(usePreviewStore.getState().deployment.activeSubTab).toBe('monitoring');
    expect(usePreviewStore.getState().activeTab).toBe('data-viewer');
  });

  it('selectExperimentModel updates the selected model id', () => {
    usePreviewStore.getState().selectExperimentModel('model_xgb_42');
    expect(usePreviewStore.getState().experiments.selectedModelId).toBe('model_xgb_42');
  });

  it('setDataViewerFileTab updates the file tab', () => {
    usePreviewStore.getState().setDataViewerFileTab('pdf_business_context');
    expect(usePreviewStore.getState().dataViewer.activeFileTabId).toBe('pdf_business_context');
  });
});
