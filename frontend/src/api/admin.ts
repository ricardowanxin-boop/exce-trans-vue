import request from './index'

export interface AdminLoginParams {
  username: string
  password: string
}

export interface AdminLoginResponse {
  data: {
    valid: boolean
    user_id?: string
    role?: 'admin'
    token?: string
    error?: string
  }
}

export const adminLogin = (data: AdminLoginParams) => {
  return request.post<any, AdminLoginResponse>('/admin-login-function', data)
}

export type AdminCardType = 'sheet_count' | 'file_count' | 'time' | 'admin'
export type AdminCardStatus = 'active' | 'disabled' | 'expired'
export type AdminCardPeriod = 'month' | 'year' | null

export interface AdminCardItem {
  _id: string
  key: string
  card_type: AdminCardType
  total_count: number | null
  used_count: number | null
  expires_at: number | null
  last_reset_at: number | null
  period: AdminCardPeriod
  status: AdminCardStatus | string
  created_at: number | null
  user_id: string | null
}

export interface AdminCardStatsResponse {
  data: {
    total: number
    sheet_count: number
    file_count: number
    time: number
    admin?: number
  }
}

export interface AdminCardListParams {
  page?: number
  page_size?: number
  search_key?: string
}

export interface AdminCardListResponse {
  data: {
    list: AdminCardItem[]
    total: number
    page: number
    page_size: number
  }
}

export interface AdminCardCreateParams {
  card_type: AdminCardType
  quantity: number
  total_count?: number
  expires_at?: number | null
  period?: AdminCardPeriod
}

export interface AdminCardCreateResponse {
  data: {
    keys: string[]
  }
}

export interface AdminCardUpdateParams {
  id: string
  status?: string
  total_count?: number | null
  used_count?: number | null
  expires_at?: number | null
  period?: AdminCardPeriod
}

export interface AdminCardMutationResponse {
  data: {
    ok: boolean
  }
}

const adminCardRequest = <T>(data: Record<string, any>) => {
  return request.post<any, T>(
    '/admin-card-function',
    {
      ...data,
    },
  )
}

export const fetchAdminCardStats = () => {
  return adminCardRequest<AdminCardStatsResponse>({ action: 'stats' })
}

export const fetchAdminCards = (params: AdminCardListParams = {}) => {
  return adminCardRequest<AdminCardListResponse>({
    action: 'list',
    page: params.page ?? 1,
    page_size: params.page_size ?? 100,
    search_key: params.search_key ?? ''
  })
}

export const createAdminCards = (params: AdminCardCreateParams) => {
  return adminCardRequest<AdminCardCreateResponse>({
    action: 'create',
    ...params
  })
}

export const updateAdminCard = (params: AdminCardUpdateParams) => {
  return adminCardRequest<AdminCardMutationResponse>({
    action: 'update',
    ...params
  })
}

export const deleteAdminCard = (id: string) => {
  return adminCardRequest<AdminCardMutationResponse>({
    action: 'delete',
    id
  })
}
