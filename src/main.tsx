import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { clearTenantSession } from './api.ts'
import App from './App.tsx'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary onClearSession={clearTenantSession}>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
