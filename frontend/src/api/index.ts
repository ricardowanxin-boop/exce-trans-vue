import axios from 'axios'

const gatewayToken =
  import.meta.env.VITE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_GATEWAY_TOKEN ||
  import.meta.env.VITE_API_TOKEN ||
  ''

const shouldAttachGatewayToken =
  import.meta.env.VITE_USE_GATEWAY_TOKEN !== 'false' && !!gatewayToken

const getGatewayErrorHint = (payload: any) => {
  const code = payload?.code

  if (code === 'MISSING_CREDENTIALS') {
    return 'CloudBase HTTP 身份认证已开启，但当前请求没有携带凭证。请在前端配置 VITE_PUBLISHABLE_KEY，或在云开发控制台关闭该路径的身份认证。'
  }

  if (code === 'INVALID_CREDENTIALS') {
    return 'CloudBase 网关凭证无效。请检查 Authorization 里的 token 是否完整、是否对应当前环境，或重新生成有效的 access_token / apikey / publishable_key。'
  }

  return ''
}

const extractErrorMessage = (error: any) => {
  const payload = error?.response?.data
  const data = payload?.data

  const gatewayHint = getGatewayErrorHint(payload)
  if (gatewayHint) return gatewayHint

  if (typeof data?.error === 'string' && data.error) return data.error
  if (typeof payload?.error === 'string' && payload.error) return payload.error

  if (typeof payload?.message === 'string' && payload.message) {
    return payload?.code ? `${payload.message} (${payload.code})` : payload.message
  }

  return error?.message || '请求失败'
}

// 创建 axios 实例
const request = axios.create({
  // 根据实际的 CloudBase 云函数 HTTP 触发器域名进行配置
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 60000, // 翻译可能需要较长时间，设置较长的超时时间
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    if (shouldAttachGatewayToken) {
      // CloudBase HTTP 身份认证使用网关级凭证；业务管理员 token 仍走 body，避免二者冲突。
      config.headers['Authorization'] = `Bearer ${gatewayToken}`
    }

    // const adminToken = localStorage.getItem('ADMIN_TOKEN')
    // const requestUrl = config.url || ''
    // const isAdminLogin = requestUrl.startsWith(ADMIN_LOGIN_ENDPOINT)


    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    // 统一错误处理
    const message = extractErrorMessage(error)
    console.error('API Error:', message, error?.response?.data || error)
    return Promise.reject(new Error(message))
  }
)

export default request
