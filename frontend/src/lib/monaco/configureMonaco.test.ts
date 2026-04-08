import { afterEach, describe, expect, it, vi } from 'vitest'

import { configureMonacoForVite } from './configureMonaco'

class MockEditorWorker {}
class MockJsonWorker {}
class MockCssWorker {}
class MockHtmlWorker {}
class MockTsWorker {}

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
      workerFactories: {
        editor: () => new MockEditorWorker(),
        json: () => new MockJsonWorker(),
        css: () => new MockCssWorker(),
        html: () => new MockHtmlWorker(),
        typescript: () => new MockTsWorker()
      }
    })

    expect(config).toHaveBeenCalledWith({ monaco })

    const environment = (
      globalThis as typeof globalThis & {
        MonacoEnvironment?: { getWorker: (_: string | undefined, label: string) => unknown }
      }
    ).MonacoEnvironment

    expect(environment).toBeDefined()
    expect(environment?.getWorker('', 'json')).toBeInstanceOf(MockJsonWorker)
    expect(environment?.getWorker('', 'scss')).toBeInstanceOf(MockCssWorker)
    expect(environment?.getWorker('', 'handlebars')).toBeInstanceOf(MockHtmlWorker)
    expect(environment?.getWorker('', 'typescript')).toBeInstanceOf(MockTsWorker)
    expect(environment?.getWorker('', 'unknown')).toBeInstanceOf(MockEditorWorker)
  })
})
