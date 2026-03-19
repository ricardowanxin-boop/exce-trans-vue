import request from './index'

export interface VerifyKeyParams {
  key: string
}

export interface VerifyKeyResponse {
  data: {
    valid: boolean
    user_id?: string
    remaining_count?: number
    card_type?: 'sheet_count' | 'file_count' | 'time'
    expires_at?: number | null
    error?: string
  }
}

/**
 * 验证卡密
 * @param data 包含卡密的参数对象
 */
export const verifyKey = (data: VerifyKeyParams) => {
  // 云函数 API 网关通常需要完整路径或配置了路由的路径
  // 这里的 '/auth-function' 假设您在 API 网关配置的路径，请根据实际情况修改
  return request.post<any, VerifyKeyResponse>('/auth-function', data)
}
