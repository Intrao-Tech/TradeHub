import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n' // initialise i18next before the app renders
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Top-level boundary: i18next (useSuspense) suspends until the active
        language's namespaces have loaded — covers the app chrome (AppShell
        nav), which renders outside the per-route <Suspense> in App.tsx. */}
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
)
