import { afterEach, describe, expect, it, vi } from 'vitest'

import { configureMonacoForVite } from './configureMonaco'

class MockEditorWorker {}

describe('configureMonacoForVite', () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment
  })

  it('configures the Monaco loader to use bundled workers instead of the AMD loader', () => {
    const config = vi.fn()
    const monaco = { editor: {} }

    configureMonacoForVite({
      loader: { config },
      monaco,
      workerFactories: { editor: () => new MockEditorWorker() }
    })

    expect(config).toHaveBeenCalledWith({ monaco })

    const environment = (
      globalThis as typeof globalThis & {
        MonacoEnvironment?: { getWorker: (_: string | undefined, label: string) => unknown }
      }
    ).MonacoEnvironment

    expect(environment).toBeDefined()
    expect(environment?.getWorker('', 'unknown')).toBeInstanceOf(MockEditorWorker)
  })
})
