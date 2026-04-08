type MonacoWorkerFactory = () => unknown

type MonacoWorkerFactories = {
  editor: MonacoWorkerFactory
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (_moduleId: string | undefined, _label: string) => workerFactories.editor()
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
