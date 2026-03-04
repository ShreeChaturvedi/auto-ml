export function sanitizeAssistantText(text: string): string {
  if (!text) return '';

  let cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '');
  const markerIndex = cleaned.indexOf('<<<JSON>>>');
  if (markerIndex !== -1) {
    cleaned = cleaned.slice(0, markerIndex);
  }
  const endIndex = cleaned.indexOf('<<<END>>>');
  if (endIndex !== -1) {
    cleaned = cleaned.slice(0, endIndex);
  }
  const jsonIndex = cleaned.search(/{\s*"version"\s*:\s*"1"/);
  if (jsonIndex !== -1) {
    cleaned = cleaned.slice(0, jsonIndex);
  }

  return cleaned.trim();
}
