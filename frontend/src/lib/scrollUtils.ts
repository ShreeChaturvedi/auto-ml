/**
 * Scroll a Radix ScrollArea viewport to an element identified by a DOM ID slug.
 */
export function scrollToRadixElement(
  container: HTMLElement | null,
  slug: string,
  offsetPx = 16
): void {
  const viewport = container?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
  const target = container?.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
  if (viewport && target) {
    const targetRect = target.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    viewport.scrollTo({
      top: viewport.scrollTop + targetRect.top - viewportRect.top - offsetPx,
      behavior: 'smooth'
    });
  }
}
