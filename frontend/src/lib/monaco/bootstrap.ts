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
      { default: EditorWorker },
      { default: JsonWorker },
      { default: CssWorker },
      { default: HtmlWorker },
      { default: TsWorker }
    ] = await Promise.all([
      import('@monaco-editor/react'),
      import('monaco-editor/esm/vs/editor/editor.main.js'),
      import('monaco-editor/esm/vs/editor/editor.worker?worker'),
      import('monaco-editor/esm/vs/language/json/json.worker?worker'),
      import('monaco-editor/esm/vs/language/css/css.worker?worker'),
      import('monaco-editor/esm/vs/language/html/html.worker?worker'),
      import('monaco-editor/esm/vs/language/typescript/ts.worker?worker')
    ])

    configureMonacoForVite({
      loader,
      monaco,
      workerFactories: {
        editor: () => new EditorWorker(),
        json: () => new JsonWorker(),
        css: () => new CssWorker(),
        html: () => new HtmlWorker(),
        typescript: () => new TsWorker()
      }
    })
  })()

  return bootstrapPromise
}
