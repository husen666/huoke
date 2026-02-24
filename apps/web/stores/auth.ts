'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from '@/lib/api'
import type { AuthUser } from '@/lib/api'
import { resetSocket } from '@/lib/socket'

interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  _hydrated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string, extra?: { orgName?: string; plan?: string; industry?: string }) => Promise<any>
  setAuth: (data: { user: AuthUser; accessToken: string; refreshToken: string }) => void
  updateUser: (data: Partial<AuthUser>) => void
  logout: () => void
  fetchUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      _hydrated: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const res = await api.login(email, password)
          const { accessToken, refreshToken, user, org } = res.data!
          api.setToken(accessToken)
          api.setRefreshToken(refreshToken)
          if (org) user.org = org
          set({ user, token: accessToken, isAuthenticated: true })
        } finally {
          set({ isLoading: false })
        }
      },

      register: async (email: string, password: string, name: string, extra?: { orgName?: string; plan?: string; industry?: string }) => {
        set({ isLoading: true })
        try {
          const res = await api.register({ email, password, name, ...extra })
          const { accessToken, refreshToken, user, org } = res.data!
          api.setToken(accessToken)
          api.setRefreshToken(refreshToken)
          if (org) user.org = org
          set({ user, token: accessToken, isAuthenticated: true })
          return res.data
        } finally {
          set({ isLoading: false })
        }
      },

      setAuth: ({ user, accessToken, refreshToken }) => {
        api.setToken(accessToken)
        api.setRefreshToken(refreshToken)
        set({ user, token: accessToken, isAuthenticated: true })
      },

      updateUser: (data: Partial<AuthUser>) => {
        const current = get().user
        if (current) set({ user: { ...current, ...data } })
      },

      logout: () => {
        resetSocket()
        api.clearToken()
        set({ user: null, token: null, isAuthenticated: false })
      },

      fetchUser: async () => {
        try {
          const res = await api.getMe()
          if (res.data) set({ user: res.data, isAuthenticated: true })
        } catch {
          get().logout()
        }
      },
    }),
    {
      name: 'huoke-auth',
      partialize: (s) => ({ token: s.token, user: s.user, isAuthenticated: s.isAuthenticated }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[auth] Rehydration failed:', error)
        }
        if (state) {
          if (state.token) {
            api.setToken(state.token)
          }
          state._hydrated = true
        } else {
          useAuthStore.setState({ _hydrated: true })
        }
      },
    }
  )
)
