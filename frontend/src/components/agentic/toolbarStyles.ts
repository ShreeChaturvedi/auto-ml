export const COMPACT_TOOLBAR_GROUP_CLASS = 'flex items-center gap-2';

export const COMPACT_TOOLBAR_ICON_BUTTON_CLASS = 'h-7 w-7';

export function compactToolbarSelectClass(widthClass: string): string {
  // Convert fixed-width (e.g. w-[180px]) to responsive max-width (max-w-[180px])
  const responsiveWidth = widthClass.replace(/^w-/, 'max-w-');
  return `h-7 min-w-0 ${responsiveWidth} flex-1 text-xs`;
}
