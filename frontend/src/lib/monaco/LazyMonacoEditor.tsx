import { lazy } from 'react'

export const LazyMonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default
  }))
)
