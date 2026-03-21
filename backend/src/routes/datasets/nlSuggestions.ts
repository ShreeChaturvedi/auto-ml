import { appLogger } from '../../logging/logger.js';
import { regenerateNaturalLanguageSuggestions } from '../../services/nlSuggestions/index.js';

export async function regenerateProjectNlSuggestionsSilently(
  projectId: string | null | undefined,
  reason: 'upload' | 'delete' | 'column update'
): Promise<void> {
  if (!projectId) {
    return;
  }

  try {
    await regenerateNaturalLanguageSuggestions({ projectId });
  } catch (error) {
    appLogger.error(
      `[datasets] NL placeholder regeneration failed after ${reason} for project ${projectId}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
