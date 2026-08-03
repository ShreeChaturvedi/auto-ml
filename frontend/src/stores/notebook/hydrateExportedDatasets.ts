/**
 * Hydrate the data sidebar after a notebook cell exports datasets via
 * save_to_project(). Kept in a separate module so cellSlice can call it
 * without a static import of dataStore (avoids
 * dataStore → fileSlice → notebookStore → cellSlice → dataStore cycle and
 * the Vite dual static/dynamic import warning).
 *
 * This module is only loaded when runCell needs hydration (dynamic import
 * from cellSlice), so the cycle never participates in module init.
 */
export async function hydrateExportedDatasets(
  projectId: string,
  exported: Array<{ name: string; rows: number; cols: number }>
): Promise<void> {
  if (!exported.length) return;

  const { useDataStore } = await import('@/stores/dataStore');
  try {
    await useDataStore.getState().hydrateFromBackend(projectId, { force: true });
  } catch (hydrateError) {
    console.error('[notebookStore] Failed to hydrate exported datasets:', hydrateError);
  }

  // toast is imported here so cellSlice stays free of the dataStore path
  const { toast } = await import('sonner');
  for (const dataset of exported) {
    toast.success(`Saved '${dataset.name}' to project`, {
      description: `${dataset.rows} rows × ${dataset.cols} columns`,
    });
  }
}
