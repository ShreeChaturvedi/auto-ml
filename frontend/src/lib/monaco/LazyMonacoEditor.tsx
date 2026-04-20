import { lazy } from 'react'
import { ensureMonacoBootstrap } from '@/lib/monaco/bootstrap'

export const LazyMonacoEditor = lazy(() =>
  ensureMonacoBootstrap().then(() => import('@monaco-editor/react')).then((module) => ({
    default: module.default
  }))
)
