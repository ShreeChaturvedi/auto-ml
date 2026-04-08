type MonacoWorkerFactory = () => unknown

type MonacoWorkerFactories = {
  editor: MonacoWorkerFactory
  json: MonacoWorkerFactory
  css: MonacoWorkerFactory
  html: MonacoWorkerFactory
  typescript: MonacoWorkerFactory
}

type MonacoEnvironmentLike = {
  getWorker?: (_moduleId: string | undefined, label: string) => unknown
  [key: string]: unknown
}

type MonacoScope = typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironmentLike
}

type ConfigureMonacoForViteOptions<TMonaco> = {
  loader: {
    config: (config: { monaco?: TMonaco }) => void
  }
  monaco: TMonaco
  workerFactories: MonacoWorkerFactories
  scope?: MonacoScope
}

function createMonacoWorkerResolver(workerFactories: MonacoWorkerFactories) {
  return (_moduleId: string | undefined, label: string) => {
    if (label === 'json') {
      return workerFactories.json()
    }

    if (label === 'css' || label === 'scss' || label === 'less') {
      return workerFactories.css()
    }

    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return workerFactories.html()
    }

    if (label === 'typescript' || label === 'javascript') {
      return workerFactories.typescript()
    }

    return workerFactories.editor()
  }
}

export function configureMonacoForVite<TMonaco>({
  loader,
  monaco,
  workerFactories,
  scope = globalThis as MonacoScope
}: ConfigureMonacoForViteOptions<TMonaco>): void {
  scope.MonacoEnvironment = {
    ...scope.MonacoEnvironment,
    getWorker: createMonacoWorkerResolver(workerFactories)
  }

  loader.config({ monaco })
}
