import request from './python'

export interface ParseExcelParams {
  user_id: string
  file_base64?: string
  file_id?: string
  file_url?: string
  upload_id?: string
  sheet_name?: string
}

export interface PreviewData {
  coordinate: string
  text: string
  sheet_name?: string
  source?: 'cell' | 'shape'
}

export interface ParseExcelResponse {
  data: {
    preview?: PreviewData[]
    total_cells?: number
    sheet_name?: string
    sheet_names?: string[]
    previews_by_sheet?: Record<string, PreviewData[]>
    total_cells_by_sheet?: Record<string, number>
    error?: string
  }
}

/**
 * 解析 Excel 文件
 * @param data 包含文件 base64 和用户 ID
 */
export const parseExcel = (data: ParseExcelParams) => {
  return request.post<any, ParseExcelResponse>('/parse-function', data)
}
