import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import { getCurrentOwnerSession, logoutOwner, getCompanyBySlug } from '../lib/detailing-engine'
import type { Company } from '../types/database'
import { AdminLogin } from '../components/admin/AdminLogin'
import { AdminDashboard } from '../components/admin/AdminDashboard'
import { SpinnerGap, WarningCircle } from '@phosphor-icons/react'

export const AdminPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const targetSlug = slug || 'detail-lab'

  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [session, setSession] = useState(() => getCurrentOwnerSession())

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    getCompanyBySlug(targetSlug)
      .then((data) => {
        if (isMounted) {
          setCompany(data ? data.company : null)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setCompany(null)
          setLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [targetSlug])

  const handleLoginSuccess = () => {
    setSession(getCurrentOwnerSession())
  }

  const handleLogout = () => {
    logoutOwner()
    setSession(null)
  }

  if (loading) {
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
