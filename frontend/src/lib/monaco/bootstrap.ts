import { configureMonacoForVite } from './configureMonaco'

let bootstrapPromise: Promise<void> | null = null

function isTestEnvironment(): boolean {
  return import.meta.env.MODE === 'test'
    || (typeof process !== 'undefined' && process.env.VITEST === 'true')
}

export function ensureMonacoBootstrap(): Promise<void> {
  if (isTestEnvironment()) {
    return Promise.resolve()
  }

  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = (async () => {
    const [
      { loader },
      monaco,
      { default: EditorWorker }
    ] = await Promise.all([
      import('@monaco-editor/react'),
      import('monaco-editor/esm/vs/editor/editor.main.js'),
      import('monaco-editor/esm/vs/editor/editor.worker?worker')
    ])

    configureMonacoForVite({
      loader,
      monaco,
      workerFactories: { editor: () => new EditorWorker() }
    })
  })()

  return bootstrapPromise
}
