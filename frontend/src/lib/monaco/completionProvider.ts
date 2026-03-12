/**
 * Completion Provider — Re-export wrapper
 *
 * Delegates to pythonProviders.ts for backward compatibility.
 */

export {
  registerPythonProviders as registerPythonCompletionProvider,
  disposePythonProviders as disposeCompletionProvider,
  setCurrentProjectId,
  type CompletionProviderOptions
} from './pythonProviders';
