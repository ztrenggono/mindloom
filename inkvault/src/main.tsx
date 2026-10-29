import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Dev-only feedback toolbar; the import is dropped from production builds.
const Agentation = import.meta.env.DEV ? lazy(() => import('agentation').then((m) => ({ default: m.Agentation }))) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {Agentation && (
      <Suspense fallback={null}>
        <Agentation endpoint="http://localhost:4747" />
      </Suspense>
    )}
  </StrictMode>,
)
