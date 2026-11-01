import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PublicCompanyPage } from './pages/PublicCompanyPage'
import { initializeDetailingStore } from './lib/detailing-engine'

// Code-split AdminPage to reduce public customer bundle size below 500 kB
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))

// Initialize seed data for local/preview mode
initializeDetailingStore()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
})

// Default company slug for single-tenant / primary studio root access
const defaultCompanySlug = import.meta.env.VITE_DEFAULT_COMPANY_SLUG || 'detail-lab'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Public Detailing Studio Page by slug */}
          <Route path="/c/:slug" element={<PublicCompanyPage />} />

          {/* Studio Owner Administration Dashboard strictly scoped by company slug */}
          <Route
            path="/c/:slug/admin"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
                    <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                  </div>
                }
              >
                <AdminPage />
              </Suspense>
            }
          />

          {/* Direct /admin redirects to primary studio admin */}
          <Route path="/admin" element={<Navigate to={`/c/${defaultCompanySlug}/admin`} replace />} />

          {/* Neutral Root: Redirects directly to primary studio, no competitor listing */}
          <Route path="/" element={<Navigate to={`/c/${defaultCompanySlug}`} replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to={`/c/${defaultCompanySlug}`} replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
