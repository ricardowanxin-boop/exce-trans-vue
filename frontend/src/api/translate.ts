import request from './index'

export interface TranslateSheetData {
  [coordinate: string]: string
}

export interface TranslateParams {
  user_id: string
  target_lang: string
  data: TranslateSheetData | Record<string, TranslateSheetData>
  file_base64: string
  sheet_name?: string
  sheet_names?: string[]
}

export interface TranslateResponse {
  data: {
    file_url?: string
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
