let hiddenTextareaCounter = 0

export function assignMonacoHiddenTextareaIdentity(
  editorDomNode: HTMLElement | null,
  prefix: string
): void {
  if (!editorDomNode) {
    return
  }

  const hiddenTextarea = editorDomNode.querySelector('textarea.ime-text-area')
  if (!(hiddenTextarea instanceof HTMLTextAreaElement)) {
    return
  }

  const existingIdentity = editorDomNode.dataset.monacoImeIdentity
  const identity = existingIdentity ?? `${prefix}-${++hiddenTextareaCounter}`

  editorDomNode.dataset.monacoImeIdentity = identity

  if (!hiddenTextarea.id) {
    hiddenTextarea.id = identity
  }

  if (!hiddenTextarea.name) {
    hiddenTextarea.name = identity
  }
}
