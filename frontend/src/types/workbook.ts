/**
 * WorkbookEntry — sidebar-facing representation of a workbook (chat+notebook pair).
 *
 * Used by the workbookRegistryStore and sidebar subtab components.
 */

export interface WorkbookEntry {
  id: string;
  name: string;
  notebookId: string | null;
}
