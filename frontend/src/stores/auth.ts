import { defineStore } from 'pinia'
import { ref } from 'vue'

type UserRole = 'user' | 'admin' | null
type UserCardType = 'sheet_count' | 'file_count' | 'time' | null

const getStoredRole = (): UserRole => {
  const value = localStorage.getItem('USER_ROLE')
  return value === 'user' || value === 'admin' ? value : null
}

const getStoredCardType = (): UserCardType => {
  const value = localStorage.getItem('CARD_TYPE')
  return value === 'sheet_count' || value === 'file_count' || value === 'time' ? value : null
}

const getStoredNumber = (key: string) => {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) ? value : 0
}

export const useAuthStore = defineStore('auth', () => {
  const userRole = ref<UserRole>(getStoredRole())
  const userId = ref<string | null>(localStorage.getItem('USER_ID'))
  const remainingCount = ref<number>(getStoredNumber('REMAINING_COUNT'))
  const adminToken = ref<string | null>(localStorage.getItem('ADMIN_TOKEN'))
  const cardType = ref<UserCardType>(getStoredCardType())
  const expiresAt = ref<number | null>(getStoredNumber('EXPIRES_AT') || null)
  const isAuthenticated = ref(Boolean(userId.value || adminToken.value))

  const login = (payload: {
    id: string
    role: 'user' | 'admin'
    remainingCount?: number
    token?: string
    cardType?: UserCardType
    expiresAt?: number | null
  }) => {
    isAuthenticated.value = true
    userRole.value = payload.role
    userId.value = payload.id
    remainingCount.value = payload.remainingCount ?? 0

    localStorage.setItem('USER_ROLE', payload.role)
    localStorage.setItem('USER_ID', payload.id)
    localStorage.setItem('REMAINING_COUNT', String(remainingCount.value))

    if (payload.role === 'admin') {
      adminToken.value = payload.token || adminToken.value
      cardType.value = null
      expiresAt.value = null
      if (adminToken.value) localStorage.setItem('ADMIN_TOKEN', adminToken.value)
      localStorage.removeItem('CARD_TYPE')
      localStorage.removeItem('EXPIRES_AT')
    } else {
      adminToken.value = null
      cardType.value = payload.cardType ?? null
      expiresAt.value = payload.expiresAt ?? null
      localStorage.removeItem('ADMIN_TOKEN')
      if (cardType.value) {
        localStorage.setItem('CARD_TYPE', cardType.value)
      } else {
        localStorage.removeItem('CARD_TYPE')
      }
      if (expiresAt.value) {
        localStorage.setItem('EXPIRES_AT', String(expiresAt.value))
      } else {
        localStorage.removeItem('EXPIRES_AT')
      }
    }
  }

  const logout = () => {
    isAuthenticated.value = false
    userRole.value = null
    userId.value = null
    remainingCount.value = 0
    adminToken.value = null
    cardType.value = null
    expiresAt.value = null

    localStorage.removeItem('USER_ROLE')
    localStorage.removeItem('USER_ID')
    localStorage.removeItem('REMAINING_COUNT')
    localStorage.removeItem('ADMIN_TOKEN')
    localStorage.removeItem('CARD_TYPE')
    localStorage.removeItem('EXPIRES_AT')
  }

  const setRemainingCount = (count: number) => {
    const nextValue = Number.isFinite(count) ? Math.max(0, count) : 0
    remainingCount.value = nextValue
    localStorage.setItem('REMAINING_COUNT', String(nextValue))
  }

  return {
    isAuthenticated,
    userRole,
    userId,
    remainingCount,
    adminToken,
    cardType,
    expiresAt,
    login,
    logout,
    setRemainingCount
  }
})
