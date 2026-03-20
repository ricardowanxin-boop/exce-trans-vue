import request from './python'

export interface TranslateSheetData {
  [coordinate: string]: string
}

export interface TranslateParams {
  user_id: string
  target_lang: string
  data?: TranslateSheetData | Record<string, TranslateSheetData>
  file_base64?: string
  file_id?: string
  file_url?: string
  upload_id?: string
  sheet_name?: string
  sheet_names?: string[]
}

export interface TranslateResponse {
  data: {
    file_url?: string
    result_id?: string
    file_name?: string
    file_size?: number
    total_chunks?: number
    used_count?: number
    error?: string
  }
}

/**
 * 翻译并生成新的 Excel 文件
 * @param data 翻译所需的参数
 */
export const translateExcel = (data: TranslateParams) => {
  return request.post<any, TranslateResponse>('/translate-function', data)
}
