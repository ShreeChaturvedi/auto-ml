import { lazy } from 'react';
import { initMonaco } from '@/lib/monaco/preloader';

export const LazyMonacoEditor = lazy(() =>
  initMonaco().then(() => import('@monaco-editor/react')).then((module) => ({
    default: module.default
  }))
)
