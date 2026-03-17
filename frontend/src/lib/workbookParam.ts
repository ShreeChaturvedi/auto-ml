/** Reads ?workbook= (or legacy ?tab=) from URL search params. */
export function getWorkbookParam(searchParams: URLSearchParams): string | undefined {
  return searchParams.get('workbook') ?? searchParams.get('tab') ?? undefined;
}
