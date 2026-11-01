import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PublicCompanyPage } from './pages/PublicCompanyPage'
import { AdminPage } from './pages/AdminPage'
import { initializeDetailingStore } from './lib/detailing-engine'

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Detailing Studio Page by slug */}
          <Route path="/c/:slug" element={<PublicCompanyPage />} />

          {/* Studio Owner Administration Dashboard strictly scoped by company slug */}
          <Route path="/c/:slug/admin" element={<AdminPage />} />

          {/* Direct /admin redirects to primary studio /c/detail-lab/admin */}
          <Route path="/admin" element={<Navigate to="/c/detail-lab/admin" replace />} />

          {/* Neutral Root: Redirects directly to primary studio, no competitor listing */}
          <Route path="/" element={<Navigate to="/c/detail-lab" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/c/detail-lab" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
