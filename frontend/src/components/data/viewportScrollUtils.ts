export function distanceFromViewportBottom(element: HTMLElement): number {
  return element.scrollHeight - (element.scrollTop + element.clientHeight);
}

export function scrollElementToBottom(element: HTMLElement) {
  element.scrollTop = element.scrollHeight;
}

export function scheduleScrollToBottom(element: HTMLElement) {
  const run = () => {
    scrollElementToBottom(element);
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
    return;
  }

  run();
}

export function scrollViewportToBottom(element: HTMLElement, behavior: ScrollBehavior = 'auto') {
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({
      top: element.scrollHeight,
      behavior
    });
    return;
  }

  scrollElementToBottom(element);
}
