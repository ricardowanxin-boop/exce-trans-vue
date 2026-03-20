import request from '../api/python'

const CHUNK_SIZE = 256 * 1024

type UploadStage = 'auth' | 'upload' | 'url'

type UploadStatusCallback = (payload: {
  stage: UploadStage
  progress?: number
}) => void

type UploadSessionResponse = {
  data?: {
    upload_id?: string
    error?: string
  }
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('文件读取失败'))
        return
      }
      resolve(result.includes(',') ? result.split(',').pop() || '' : result)
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(blob)
  })
}

async function initUploadSession(file: File) {
  const res = await request.post<any, UploadSessionResponse>('/upload-file-function', {
    action: 'init',
    file_name: file.name,
    file_size: file.size,
    content_type: file.type || 'application/octet-stream'
  })

  if (res.data?.error) {
    throw new Error(res.data.error)
  }

  const uploadId = res.data?.upload_id
  if (!uploadId) {
    throw new Error('创建上传会话失败')
  }

  return uploadId
}

async function appendUploadChunk(uploadId: string, chunkIndex: number, chunkBase64: string) {
  const res = await request.post<any, { data?: { error?: string } }>('/upload-file-function', {
    action: 'append',
    upload_id: uploadId,
    chunk_index: chunkIndex,
    chunk_base64: chunkBase64
  })

  if (res.data?.error) {
    throw new Error(res.data.error)
  }
}

async function completeUploadSession(uploadId: string, totalChunks: number) {
  const res = await request.post<any, { data?: { error?: string } }>('/upload-file-function', {
    action: 'complete',
    upload_id: uploadId,
    total_chunks: totalChunks
  })

  if (res.data?.error) {
    throw new Error(res.data.error)
  }
}

export const uploadFileToTcb = async (file: File, onStatus?: UploadStatusCallback) => {
  onStatus?.({ stage: 'auth' })
  const uploadId = await initUploadSession(file)

  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
  onStatus?.({ stage: 'upload', progress: 0 })

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * CHUNK_SIZE
    const end = Math.min(file.size, start + CHUNK_SIZE)
    const chunk = file.slice(start, end)
    const chunkBase64 = await blobToBase64(chunk)
    await appendUploadChunk(uploadId, chunkIndex, chunkBase64)
    onStatus?.({
      stage: 'upload',
      progress: Math.round(((chunkIndex + 1) / totalChunks) * 100)
    })
  }

  onStatus?.({ stage: 'url', progress: 100 })
  await completeUploadSession(uploadId, totalChunks)

  return {
    fileID: uploadId,
    tempFileURL: ''
  }
}
