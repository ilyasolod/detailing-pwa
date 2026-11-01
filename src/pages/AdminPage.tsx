import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router'
import {
  validateOwnerSession,
  subscribeToAuthState,
  logoutOwner,
  getCompanyBySlug,
  type AuthSession,
} from '../lib/detailing-engine'
import type { Company } from '../types/database'
import { AdminLogin } from '../components/admin/AdminLogin'
import { AdminDashboard } from '../components/admin/AdminDashboard'
import { SpinnerGap, WarningCircle } from '@phosphor-icons/react'

export const AdminPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const targetSlug = slug || import.meta.env.VITE_DEFAULT_COMPANY_SLUG || 'detail-lab'

  const [company, setCompany] = useState<Company | null>(null)
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [validatingSession, setValidatingSession] = useState<boolean>(true)

  // Auth operation generation tracker to discard stale in-flight responses
  const authOpRef = useRef(0)

  // Critical transition guard: if targetSlug changed, we are transitioning and must NOT show company A's interface
  const isTransitioning = loadedSlug !== targetSlug

  useEffect(() => {
    let isCurrent = true
    const requestSlug = targetSlug
    authOpRef.current += 1
    const currentOp = authOpRef.current

    setLoading(true)
    setValidatingSession(true)

    getCompanyBySlug(requestSlug)
      .then(async (data) => {
        if (!isCurrent || requestSlug !== targetSlug || authOpRef.current !== currentOp) return

        if (data) {
          try {
            // Live validation of session (checks Supabase token expiration, tenant match & server membership)
            const activeSession = await validateOwnerSession(data.company.id)
            if (!isCurrent || requestSlug !== targetSlug || authOpRef.current !== currentOp) return

            setCompany(data.company)
            setSession(activeSession)
            setLoadedSlug(requestSlug)
          } catch {
            if (!isCurrent || requestSlug !== targetSlug || authOpRef.current !== currentOp) return
            setCompany(data.company)
            setSession(null)
            setLoadedSlug(requestSlug)
          } finally {
            if (isCurrent && requestSlug === targetSlug && authOpRef.current === currentOp) {
              setValidatingSession(false)
              setLoading(false)
            }
          }
        } else {
          setCompany(null)
          setSession(null)
          setLoadedSlug(requestSlug)
          setValidatingSession(false)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!isCurrent || requestSlug !== targetSlug || authOpRef.current !== currentOp) return
        setCompany(null)
        setSession(null)
        setLoadedSlug(requestSlug)
        setValidatingSession(false)
        setLoading(false)
      })

    return () => {
      isCurrent = false
      authOpRef.current += 1
    }
  }, [targetSlug])

  // Listen for real-time auth changes strictly for the active, loaded company
  useEffect(() => {
    if (!company || isTransitioning || loadedSlug !== targetSlug) return

    const unsubscribe = subscribeToAuthState(company.id, (updatedSession) => {
      if (isTransitioning || loadedSlug !== targetSlug) return
      setSession(updatedSession)
    })

    return () => {
      unsubscribe()
    }
  }, [company?.id, loadedSlug, targetSlug, isTransitioning])

  const handleLoginSuccess = async () => {
    authOpRef.current += 1
    const currentOp = authOpRef.current

    if (company && !isTransitioning) {
      setValidatingSession(true)
      try {
        const validated = await validateOwnerSession(company.id)
        if (authOpRef.current !== currentOp || isTransitioning) return
        setSession(validated)
      } catch {
        if (authOpRef.current !== currentOp || isTransitioning) return
        setSession(null)
      } finally {
        if (authOpRef.current === currentOp) {
          setValidatingSession(false)
        }
      }
    } else {
      setSession(null)
      setValidatingSession(false)
    }
  }

  const handleLogout = async () => {
    authOpRef.current += 1
    // Immediately clear session to synchronously unmount dashboard in this frame
    setSession(null)
    setValidatingSession(false)
    await logoutOwner()
  }

  // 1. Dashboard is NEVER shown while loading, validating session, or transitioning between slugs
  if (isTransitioning || loading || validatingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08080A] text-white">
        <SpinnerGap size={36} className="animate-spin text-amber-400" />
      </div>
    )
  }

  if (!company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#08080A] px-4 text-center text-zinc-100">
        <WarningCircle size={48} className="text-red-400 mb-3" />
        <h2 className="text-xl font-bold text-white">Студия не найдена</h2>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
          Указанный адрес детейлинг-центра не существует или был перемещён.
        </p>
        <Link
          to={`/c/${targetSlug}`}
          className="mt-4 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 transition-colors"
        >
          Вернуться на страницу студии
        </Link>
      </div>
    )
  }

  // If user is not logged in OR logged into a different company, require login to THIS specific company
  if (!session || session.companyId !== company.id) {
    return <AdminLogin company={company} onLoginSuccess={handleLoginSuccess} />
  }

  return <AdminDashboard companyId={company.id} onLogout={handleLogout} />
}
