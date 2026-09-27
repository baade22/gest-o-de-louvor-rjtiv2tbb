import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import pb from '@/lib/pocketbase/client'
import type { User, Church, ChurchMember, AppRole, OperationalRole, UserPermissions } from '@/types'

interface AuthContextType {
  user: User | null
  currentChurch: Church | null
  currentMember: ChurchMember | null
  userChurches: Church[]
  role: AppRole | null
  operationalRoles: OperationalRole[]
  permissions: string[]
  allowedModules: string[]
  isLoading: boolean
  isAuthenticated: boolean
  isMaster: boolean
  isAdmin: boolean
  isLeader: boolean
  isMusician: boolean
  hasOperationalRole: (opRole: OperationalRole) => boolean
  hasPermission: (perm: string) => boolean
  hasModule: (moduleName: string) => boolean
  canManageContent: boolean // Admin or Lider or Master
  canManageChurch: boolean // Admin or Master
  login: (email: string, pass: string) => Promise<void>
  logout: () => void
  switchChurch: (churchId: string) => Promise<void>
  refreshAuthData: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [currentChurch, setCurrentChurch] = useState<Church | null>(null)
  const [currentMember, setCurrentMember] = useState<ChurchMember | null>(null)
  const [userChurches, setUserChurches] = useState<Church[]>([])
  const [role, setRole] = useState<AppRole | null>(null)
  const [operationalRoles, setOperationalRoles] = useState<OperationalRole[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [allowedModules, setAllowedModules] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const loadUserData = useCallback(async () => {
    try {
      const authModel = pb.authStore.record
      if (!authModel || !pb.authStore.isValid) {
        setUser(null)
        setCurrentChurch(null)
        setCurrentMember(null)
        setUserChurches([])
        setRole(null)
        setIsLoading(false)
        return
      }

      const currentUser: User = {
        id: authModel.id,
        email: authModel.email,
        name: authModel.name || authModel.email.split('@')[0],
        avatar: authModel.avatar ? pb.files.getURL(authModel, authModel.avatar) : undefined,
        created: authModel.created,
        updated: authModel.updated,
      }
      setUser(currentUser)

      // Fetch church memberships for this user
      const memberships = await pb.collection('church_members').getFullList<ChurchMember>({
        filter: `user_id = "${currentUser.id}" && is_active = true`,
        expand: 'church_id',
      })

      if (memberships.length > 0) {
        // Collect active churches
        const churches: Church[] = []
        for (const m of memberships) {
          if (m.expand?.church_id && m.expand.church_id.is_active) {
            churches.push(m.expand.church_id)
          }
        }
        setUserChurches(churches)

        // Find saved or default church
        const savedChurchId = localStorage.getItem('louvorflow_church_id')
        let selectedMember = memberships.find((m) => m.church_id === savedChurchId)

        if (!selectedMember) {
          selectedMember = memberships[0]
        }

        if (selectedMember && selectedMember.expand?.church_id) {
          setCurrentChurch(selectedMember.expand.church_id)
          setCurrentMember(selectedMember)
          setRole(selectedMember.role)
          localStorage.setItem('louvorflow_church_id', selectedMember.church_id)

          // Buscar permissões consolidadas do backend
          try {
            const permRes = await pb.send<UserPermissions>(
              `/backend/v1/permissions/me?church_id=${selectedMember.church_id}`,
              { method: 'GET' },
            )
            setOperationalRoles(permRes.operational_roles || [])
            setPermissions(permRes.permissions || [])
            setAllowedModules(permRes.modules || [])
          } catch (_) {
            const ops = (selectedMember.operational_roles as OperationalRole[]) || ['MUSICO']
            setOperationalRoles(ops)
          }
        }
      } else {
        const allChurches = await pb.collection('churches').getList<Church>(1, 1, {
          filter: 'is_active = true',
        })
        if (allChurches.items.length > 0) {
          const defaultChurch = allChurches.items[0]
          setCurrentChurch(defaultChurch)
          setUserChurches([defaultChurch])
          setRole('MASTER')
          setOperationalRoles(['MUSICO', 'SOM', 'PROJECAO', 'MIDIA', 'ILUMINACAO'])
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados de autenticação:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUserData()

    const unsubscribe = pb.authStore.onChange(() => {
      loadUserData()
    })

    return () => {
      unsubscribe()
    }
  }, [loadUserData])

  const login = async (email: string, pass: string) => {
    setIsLoading(true)
    try {
      await pb.collection('users').authWithPassword(email, pass)
      await loadUserData()
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    pb.authStore.clear()
    localStorage.removeItem('louvorflow_church_id')
    setUser(null)
    setCurrentChurch(null)
    setCurrentMember(null)
    setUserChurches([])
    setRole(null)
    setOperationalRoles([])
    setPermissions([])
    setAllowedModules([])
  }

  const switchChurch = async (churchId: string) => {
    setIsLoading(true)
    try {
      if (!user) return
      const membership = await pb
        .collection('church_members')
        .getFirstListItem<ChurchMember>(
          `user_id = "${user.id}" && church_id = "${churchId}" && is_active = true`,
          { expand: 'church_id' },
        )
      if (membership && membership.expand?.church_id) {
        setCurrentChurch(membership.expand.church_id)
        setCurrentMember(membership)
        setRole(membership.role)
        localStorage.setItem('louvorflow_church_id', churchId)

        try {
          const permRes = await pb.send<UserPermissions>(
            `/backend/v1/permissions/me?church_id=${churchId}`,
            { method: 'GET' },
          )
          setOperationalRoles(permRes.operational_roles || [])
          setPermissions(permRes.permissions || [])
          setAllowedModules(permRes.modules || [])
        } catch (_) {
          const ops = (membership.operational_roles as OperationalRole[]) || ['MUSICO']
          setOperationalRoles(ops)
        }
      }
    } catch (err) {
      console.error('Erro ao trocar de igreja:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const refreshAuthData = async () => {
    await loadUserData()
  }

  const isAuthenticated = !!user
  const isMaster = role === 'MASTER'
  const isAdmin = role === 'ADMIN' || isMaster
  const isLeader = role === 'LIDER' || isAdmin
  const isMusician = operationalRoles.includes('MUSICO') || role === 'MUSICO'

  const hasOperationalRole = (op: OperationalRole) => {
    if (isMaster) return true
    return operationalRoles.includes(op)
  }

  const hasPermission = (perm: string) => {
    if (isMaster) return true
    return permissions.includes(perm)
  }

  const hasModule = (moduleName: string) => {
    if (isMaster) return true
    return allowedModules.includes(moduleName)
  }

  const canManageContent = isAdmin || isLeader
  const canManageChurch = isAdmin

  return (
    <AuthContext.Provider
      value={{
        user,
        currentChurch,
        currentMember,
        userChurches,
        role,
        operationalRoles,
        permissions,
        allowedModules,
        isLoading,
        isAuthenticated,
        isMaster,
        isAdmin,
        isLeader,
        isMusician,
        hasOperationalRole,
        hasPermission,
        hasModule,
        canManageContent,
        canManageChurch,
        login,
        logout,
        switchChurch,
        refreshAuthData,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
