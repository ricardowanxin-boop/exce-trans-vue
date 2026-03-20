import axios from 'axios'
import cloudbase from '@cloudbase/js-sdk'

const gatewayToken =
  import.meta.env.VITE_CLOUDBASE_ACCESS_KEY ||
  import.meta.env.VITE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_GATEWAY_TOKEN ||
  import.meta.env.VITE_API_TOKEN ||
  ''

const shouldAttachGatewayToken =
  import.meta.env.VITE_USE_GATEWAY_TOKEN !== 'false' && !!gatewayToken

const useCloudFunctionMode = import.meta.env.VITE_PY_CALL_FUNCTION === 'true'
const cloudbaseEnvId = import.meta.env.VITE_CLOUDBASE_ENV_ID || import.meta.env.VITE_TCB_ENV_ID || ''
const cloudbaseRegion = import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai'
const cloudbaseTimeout = Number(import.meta.env.VITE_CLOUDBASE_TIMEOUT || 180000)
const pythonBaseURL = import.meta.env.VITE_PY_API_BASE_URL || '/python-api'
const resultChunkSize = 256 * 1024
const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type PythonEnvelope<T> = {
  data?: T
  error?: string
  statusCode?: number
}

type DownloadInfoData = {
  result_id: string
  file_name: string
  file_size: number
  total_chunks: number
  chunk_size: number
}

type DownloadChunkData = {
  result_id: string
  chunk_index: number
  total_chunks: number
  chunk_base64: string
}

let appInstance: ReturnType<typeof cloudbase.init> | null = null

const httpClient = axios.create({
  baseURL: pythonBaseURL,
  timeout: 180000,
  headers: {
    'Content-Type': 'application/json'
  }
})

httpClient.interceptors.request.use((config) => {
  if (shouldAttachGatewayToken) {
    config.headers.Authorization = `Bearer ${gatewayToken}`
  }
  return config
})

function getErrorMessage(payload: any, fallback = '请求失败') {
  const detail = payload?.detail
  const dataError = payload?.data?.error
  const payloadError = payload?.error

  return (
    (typeof detail === 'string' && detail) ||
    (typeof dataError === 'string' && dataError) ||
    (typeof payloadError === 'string' && payloadError) ||
    fallback
  )
}

httpClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = getErrorMessage(error?.response?.data, error?.message || '请求失败')
    console.error('Python API Error:', message, error?.response?.data || error)
    return Promise.reject(new Error(message))
  }
)

function getCloudbaseApp() {
  if (!cloudbaseEnvId) {
    throw new Error('缺少 VITE_CLOUDBASE_ENV_ID，无法直调云函数')
  }

  if (!gatewayToken) {
    throw new Error('缺少 CloudBase Access Key / Publishable Key，无法直调云函数')
  }

  if (!appInstance) {
    appInstance = cloudbase.init({
      env: cloudbaseEnvId,
      region: cloudbaseRegion,
      accessKey: gatewayToken,
      timeout: cloudbaseTimeout
    })
  }

  return appInstance
}

async function postViaCallFunction<TResponse>(path: string, data?: Record<string, unknown>) {
  const app = getCloudbaseApp()
  const response = await app.callFunction({
    name: 'python-excel-function',
    data: {
      __route: path,
      ...(data || {})
    },
    parse: true
  })

  const payload =
    typeof response.result === 'string' ? JSON.parse(response.result) : (response.result as PythonEnvelope<TResponse>)

  if (payload?.error || (payload?.statusCode && payload.statusCode >= 400)) {
    throw new Error(getErrorMessage(payload, '云函数调用失败'))
  }

  return payload
}

function decodeBase64Chunk(base64: string) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function resolveDownloadUrl(fileUrl: string) {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  return new URL(fileUrl, pythonBaseURL || window.location.origin).toString()
}

const pythonRequest = {
  async post<T = any, R = any>(path: string, data?: T): Promise<R> {
    if (useCloudFunctionMode) {
      return (await postViaCallFunction(path, (data as Record<string, unknown>) || {})) as R
    }

    return (await httpClient.post(path, data)) as R
  }
}

export async function downloadPythonResult(options: {
  resultId?: string
  fileName?: string
  fileUrl?: string
  onProgress?: (progress: number) => void
}) {
  if (!useCloudFunctionMode) {
    if (!options.fileUrl) {
      throw new Error('缺少 file_url，无法下载结果文件')
    }

    const url = resolveDownloadUrl(options.fileUrl)
    const response = await axios.get(url, {
      responseType: 'blob',
      headers: shouldAttachGatewayToken
        ? {
            Authorization: `Bearer ${gatewayToken}`
          }
        : undefined
    })

    options.onProgress?.(100)
    return {
      blob: response.data as Blob,
      fileName: options.fileName || 'translated.xlsx'
    }
  }

  if (!options.resultId) {
    throw new Error('缺少 result_id，无法下载结果文件')
  }

  const info = (await postViaCallFunction<DownloadInfoData>('/download-result-info', {
    result_id: options.resultId,
    file_name: options.fileName
  })) as PythonEnvelope<DownloadInfoData>

  const infoData = info.data
  if (!infoData?.total_chunks) {
    throw new Error('结果文件信息不完整')
  }

  const chunks: ArrayBuffer[] = []
  for (let chunkIndex = 0; chunkIndex < infoData.total_chunks; chunkIndex += 1) {
    const chunk = (await postViaCallFunction<DownloadChunkData>('/download-result-chunk', {
      result_id: options.resultId,
      chunk_index: chunkIndex
    })) as PythonEnvelope<DownloadChunkData>

    const chunkBase64 = chunk.data?.chunk_base64 || ''
    chunks.push(decodeBase64Chunk(chunkBase64))
    options.onProgress?.(Math.round(((chunkIndex + 1) / infoData.total_chunks) * 100))
  }

  return {
    blob: new Blob(chunks, { type: excelMimeType }),
    fileName: infoData.file_name || options.fileName || 'translated.xlsx',
    fileSize: infoData.file_size,
    chunkSize: infoData.chunk_size || resultChunkSize
  }
}

export { useCloudFunctionMode as isPythonCloudFunctionMode }

export default pythonRequest
