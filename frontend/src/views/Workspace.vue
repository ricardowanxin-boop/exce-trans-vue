<template>
  <div class="workspace-page">
    <div class="workspace-header">
      <div>
        <h2>翻译工作台</h2>
        <p>上传 Excel 文件，预览待翻译内容，并生成新的译文文件。</p>
      </div>
      <el-tag type="primary" effect="plain">
        {{ modeTagText }}
      </el-tag>
    </div>

    <el-steps :active="activeStep" finish-status="success" class="steps-card card">
      <el-step title="上传文件" />
      <el-step title="解析预览" />
      <el-step title="开始翻译" />
      <el-step title="下载结果" />
    </el-steps>

    <div class="workspace-grid">
      <section class="card upload-card">
        <div class="section-head">
          <h3>上传 Excel</h3>
          <span v-if="fileName">{{ fileName }}</span>
        </div>

        <el-upload
          class="upload-box"
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept=".xlsx,.xls"
          :on-change="handleFileChange"
        >
          <el-icon class="upload-icon"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽文件到这里，或点击选择 Excel 文件</div>
        </el-upload>

        <div v-if="sheetNames.length" class="sheet-selector">
          <el-alert
            v-if="isWholeFileMode"
            title="当前为全文件计次卡，系统会自动选择全部工作表并一次完成整文件翻译。"
            type="info"
            show-icon
            :closable="false"
          />

          <template v-else>
            <div class="picker-label">工作表选择</div>
            <el-select v-model="selectedSheetName" class="full-width" placeholder="请选择工作表">
              <el-option
                v-for="sheet in sheetNames"
                :key="sheet"
                :label="sheet"
                :value="sheet"
              />
            </el-select>
          </template>
        </div>

        <div class="file-meta" v-if="sheetNames.length">
          <span>工作表数量：{{ sheetNames.length }}</span>
          <span>{{ selectionSummary }}</span>
          <span>待翻译内容：{{ displayTotalCells }}</span>
        </div>
      </section>

      <section class="card config-card">
        <div class="section-head">
          <h3>翻译配置</h3>
        </div>

        <div class="mode-tip">{{ modeDescription }}</div>

        <el-form label-position="top" @submit.prevent>
          <el-form-item label="目标语言">
            <el-select v-model="targetLang" placeholder="请选择目标语言">
              <el-option label="中文" value="中文" />
              <el-option label="English" value="English" />
              <el-option label="日本語" value="日本語" />
              <el-option label="한국어" value="한국어" />
              <el-option label="Deutsch" value="Deutsch" />
              <el-option label="Français" value="Français" />
            </el-select>
          </el-form-item>

          <el-button
            type="primary"
            class="translate-btn"
            :loading="translating"
            :disabled="!previewRows.length || !fileBase64"
            @click="handleTranslate"
          >
            开始翻译
          </el-button>
        </el-form>

        <div v-if="downloadUrl" class="result-box">
          <div class="result-title">翻译完成</div>
          <p>结果文件已生成，可以直接下载。</p>
          <el-button type="success" plain @click="downloadFile">
            下载结果文件
          </el-button>
        </div>
      </section>
    </div>

    <section class="card preview-card">
      <div class="section-head">
        <h3>预览结果</h3>
        <span>最多展示前 100 条内容</span>
      </div>

      <el-table
        :data="previewRows"
        row-key="preview_key"
        empty-text="上传并解析文件后，会在这里展示待翻译内容"
      >
        <el-table-column v-if="showSheetColumn" prop="sheet_name" label="工作表" width="180" />
        <el-table-column prop="coordinate" label="坐标" width="120" />
        <el-table-column prop="text" label="原文内容" min-width="320" />
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { parseExcel } from '../api/parse'
import { translateExcel, type TranslateSheetData } from '../api/translate'
import { useAuthStore } from '../stores/auth'

type SheetPreviewItem = {
  coordinate: string
  text: string
  sheet_name?: string
}

type PreviewRow = SheetPreviewItem & {
  preview_key: string
}

const authStore = useAuthStore()

const activeStep = ref(0)
const fileName = ref('')
const fileBase64 = ref('')
const totalCells = ref(0)
const targetLang = ref('中文')
const translating = ref(false)
const downloadUrl = ref('')
const sheetNames = ref<string[]>([])
const selectedSheetName = ref('')
const previewsBySheet = ref<Record<string, SheetPreviewItem[]>>({})
const totalCellsBySheet = ref<Record<string, number>>({})

const isWholeFileMode = computed(() => authStore.cardType === 'file_count')
const modeTagText = computed(() => {
  if (authStore.userRole === 'admin') return '管理员模式'
  if (authStore.cardType === 'file_count') return `全文件计次卡 · 剩余 ${authStore.remainingCount}`
  if (authStore.cardType === 'time') {
    if (authStore.expiresAt) {
      return `时间卡 · 有效至 ${new Date(authStore.expiresAt).toLocaleDateString('zh-CN')}`
    }
    return '时间卡'
  }
  return `单Sheet计次卡 · 剩余 ${authStore.remainingCount}`
})
const modeDescription = computed(() => {
  if (isWholeFileMode.value) return '当前卡密会自动翻译整个工作簿中的全部工作表。'
  if (authStore.cardType === 'time') return '当前卡密按有效期使用，可选择单个工作表进行翻译。'
  if (authStore.userRole === 'admin') return '管理员模式下可直接体验翻译流程。'
  return '当前卡密按单个工作表计次，请先选择需要翻译的工作表。'
})
const selectionSummary = computed(() => {
  if (isWholeFileMode.value) {
    return `已自动选择全部 ${sheetNames.value.length} 个工作表`
  }
  return `当前工作表：${selectedSheetName.value || '未选择'}`
})
const displayTotalCells = computed(() => {
  if (isWholeFileMode.value) return totalCells.value
  return totalCellsBySheet.value[selectedSheetName.value] ?? 0
})
const previewRows = computed<PreviewRow[]>(() => {
  if (isWholeFileMode.value) {
    return sheetNames.value
      .flatMap((sheetName) =>
        (previewsBySheet.value[sheetName] || []).map((item, index) => ({
          ...item,
          sheet_name: sheetName,
          preview_key: `${sheetName}-${item.coordinate}-${index}`
        }))
      )
      .slice(0, 100)
  }

  const targetSheet = selectedSheetName.value || sheetNames.value[0] || ''
  return (previewsBySheet.value[targetSheet] || []).slice(0, 100).map((item, index) => ({
    ...item,
    sheet_name: targetSheet,
    preview_key: `${targetSheet}-${item.coordinate}-${index}`
  }))
})
const showSheetColumn = computed(() => isWholeFileMode.value && sheetNames.value.length > 1)

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })

const resetParsedState = () => {
  totalCells.value = 0
  sheetNames.value = []
  selectedSheetName.value = ''
  previewsBySheet.value = {}
  totalCellsBySheet.value = {}
}

const buildSheetPayload = (items: SheetPreviewItem[]) =>
  items.reduce<TranslateSheetData>((acc, item) => {
    acc[item.coordinate] = item.text
    return acc
  }, {})

const handleFileChange = async (uploadFile: UploadFile) => {
  const rawFile = uploadFile.raw
  if (!rawFile) return

  const isExcel = /\.(xlsx|xls)$/i.test(rawFile.name)
  if (!isExcel) {
    ElMessage.error('仅支持上传 .xlsx 或 .xls 文件')
    return
  }

  try {
    fileName.value = rawFile.name
    fileBase64.value = await readFileAsBase64(rawFile)
    downloadUrl.value = ''
    resetParsedState()
    activeStep.value = 1

    const res = await parseExcel({
      user_id: authStore.userId || '',
      file_base64: fileBase64.value
    })

    const parsedSheetNames = res.data?.sheet_names || (res.data?.sheet_name ? [res.data.sheet_name] : [])
    const parsedPreviews = res.data?.previews_by_sheet || {}
    const parsedTotals = res.data?.total_cells_by_sheet || {}

    sheetNames.value = parsedSheetNames
    previewsBySheet.value = parsedPreviews
    totalCellsBySheet.value = parsedTotals
    totalCells.value = res.data?.total_cells || 0
    selectedSheetName.value = res.data?.sheet_name || parsedSheetNames[0] || ''
    activeStep.value = parsedSheetNames.length ? 2 : 1
    ElMessage.success('文件解析成功')
  } catch (error) {
    resetParsedState()
    fileBase64.value = ''
    activeStep.value = 0
    ElMessage.error(error instanceof Error ? error.message : '文件解析失败')
  }
}

const handleTranslate = async () => {
  if (!fileBase64.value || !sheetNames.value.length) {
    ElMessage.warning('请先上传并解析 Excel 文件')
    return
  }

  let payload: TranslateSheetData | Record<string, TranslateSheetData>
  let targetSheetName: string | undefined
  let targetSheetNames: string[] | undefined

  if (isWholeFileMode.value) {
    const workbookPayload = sheetNames.value.reduce<Record<string, TranslateSheetData>>((acc, sheetName) => {
      const sheetPayload = buildSheetPayload(previewsBySheet.value[sheetName] || [])
      if (Object.keys(sheetPayload).length > 0) {
        acc[sheetName] = sheetPayload
      }
      return acc
    }, {})

    if (!Object.keys(workbookPayload).length) {
      ElMessage.warning('当前文件没有可翻译内容')
      return
    }

    payload = workbookPayload
    targetSheetNames = sheetNames.value
  } else {
    const targetSheet = selectedSheetName.value || sheetNames.value[0]
    if (!targetSheet) {
      ElMessage.warning('请选择工作表')
      return
    }

    const sheetPayload = buildSheetPayload(previewsBySheet.value[targetSheet] || [])
    if (!Object.keys(sheetPayload).length) {
      ElMessage.warning('当前工作表没有可翻译内容')
      return
    }

    payload = sheetPayload
    targetSheetName = targetSheet
  }

  translating.value = true
  try {
    const res = await translateExcel({
      user_id: authStore.userId || '',
      target_lang: targetLang.value,
      data: payload,
      file_base64: fileBase64.value,
      sheet_name: targetSheetName,
      sheet_names: targetSheetNames
    })

    if (!res.data?.file_url) {
      throw new Error(res.data?.error || '翻译结果为空')
    }

    downloadUrl.value = res.data.file_url
    activeStep.value = 3

    if (authStore.userRole !== 'admin') {
      const deducted = Number(res.data.used_count || 0)
      authStore.setRemainingCount(authStore.remainingCount - deducted)
    }

    ElMessage.success('翻译完成')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '翻译失败')
  } finally {
    translating.value = false
  }
}

const downloadFile = () => {
  if (!downloadUrl.value) return

  const link = document.createElement('a')
  const cleanName = (fileName.value || 'translated.xlsx').replace(/\.(xlsx|xls)$/i, '')
  link.href = downloadUrl.value
  link.download = `${cleanName}-translated.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<style scoped>
.workspace-page {
  display: grid;
  gap: 24px;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.workspace-header h2 {
  margin: 0 0 8px;
  font-size: 30px;
}

.workspace-header p {
  margin: 0;
  color: var(--text-muted);
}

.steps-card {
  padding-top: 28px;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
  gap: 24px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.section-head h3 {
  margin: 0;
  font-size: 22px;
}

.section-head span {
  color: var(--text-muted);
  font-size: 13px;
}

.upload-box,
.full-width {
  width: 100%;
}

.upload-icon {
  font-size: 48px;
  color: var(--primary);
}

.sheet-selector {
  margin-top: 18px;
}

.picker-label {
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--text-muted);
}

.file-meta {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  color: var(--text-muted);
}

.mode-tip {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #f7f9fc;
  color: var(--text-muted);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.translate-btn {
  width: 100%;
}

.result-box {
  margin-top: 20px;
  padding: 18px;
  border-radius: 16px;
  background: #f6fbf7;
  border: 1px solid rgba(22, 163, 74, 0.14);
}

.result-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
}

@media (max-width: 1024px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .workspace-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
