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
          :disabled="isProcessing"
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
          <span>预览条数：{{ displayTotalCells }}</span>
        </div>

        <div v-if="isProcessing" class="status-card">
          <div class="status-head">
            <strong>{{ stageTitle }}</strong>
            <span v-if="showUploadProgress">{{ uploadProgress }}%</span>
          </div>
          <el-progress
            v-if="showUploadProgress"
            :percentage="uploadProgress"
            :stroke-width="10"
            :show-text="false"
          />
          <p>{{ stageDescription }}</p>
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
            :disabled="isProcessing || !previewRows.length || !uploadId"
            @click="handleTranslate"
          >
            开始翻译
          </el-button>
        </el-form>

        <div v-if="hasDownloadResult" class="result-box">
          <div class="result-title">翻译完成</div>
          <p>结果文件已生成，可以直接下载。</p>
          <el-button type="success" plain :loading="downloading" @click="downloadFile">
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
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            {{ row.source === 'shape' ? '形状' : '单元格' }}
          </template>
        </el-table-column>
        <el-table-column label="位置" width="140">
          <template #default="{ row }">
            {{ formatPreviewLocation(row) }}
          </template>
        </el-table-column>
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
import { downloadPythonResult } from '../api/python'
import { parseExcel } from '../api/parse'
import { translateExcel } from '../api/translate'
import { uploadFileToTcb } from '../lib/tcb'
import { useAuthStore } from '../stores/auth'

type SheetPreviewItem = {
  coordinate: string
  text: string
  sheet_name?: string
  source?: 'cell' | 'shape'
}

type PreviewRow = SheetPreviewItem & {
  preview_key: string
}

const authStore = useAuthStore()

const activeStep = ref(0)
const fileName = ref('')
const uploadId = ref('')
const totalCells = ref(0)
const targetLang = ref('中文')
const translating = ref(false)
const downloading = ref(false)
const parsing = ref(false)
const currentStage = ref<'idle' | 'auth' | 'upload' | 'url' | 'parse' | 'translate' | 'download'>('idle')
const uploadProgress = ref(0)
const downloadUrl = ref('')
const downloadResultId = ref('')
const downloadFileName = ref('')
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
const hasDownloadResult = computed(() => !!downloadUrl.value || !!downloadResultId.value)
const isProcessing = computed(() => parsing.value || translating.value || downloading.value)
const showUploadProgress = computed(() => currentStage.value === 'upload' || currentStage.value === 'download')
const stageTitle = computed(() => {
  if (currentStage.value === 'auth') return '正在建立上传会话'
  if (currentStage.value === 'upload') return '正在分片上传文件'
  if (currentStage.value === 'url') return '正在提交上传结果'
  if (currentStage.value === 'parse') return '正在解析 Excel 内容'
  if (currentStage.value === 'translate') return '正在执行翻译'
  if (currentStage.value === 'download') return '正在准备下载结果文件'
  return '正在处理'
})
const stageDescription = computed(() => {
  if (currentStage.value === 'auth') return '系统正在创建当前文件的分片上传会话。'
  if (currentStage.value === 'upload') return '文件会拆成多个小片段上传，避免触发网关请求体大小限制。'
  if (currentStage.value === 'url') return '所有分片已上传，正在确认文件可供后续解析和翻译使用。'
  if (currentStage.value === 'parse') return 'Python 服务正在读取文件并提取工作表预览。'
  if (currentStage.value === 'translate') return 'Python 服务正在调用模型并生成新的 Excel 文件。'
  if (currentStage.value === 'download') return '系统正在分片读取结果文件并在浏览器中拼装下载内容。'
  return ''
})

const resetParsedState = () => {
  totalCells.value = 0
  sheetNames.value = []
  selectedSheetName.value = ''
  previewsBySheet.value = {}
  totalCellsBySheet.value = {}
}

const formatPreviewLocation = (row: SheetPreviewItem) => {
  if (row.source === 'shape') {
    const match = String(row.coordinate || '').match(/^S(\d+)$/i)
    return match ? `形状 ${match[1]}` : '形状文本'
  }

  return row.coordinate || '-'
}

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
    uploadId.value = ''
    downloadUrl.value = ''
    downloadResultId.value = ''
    downloadFileName.value = ''
    uploadProgress.value = 0
    parsing.value = true
    currentStage.value = 'auth'
    resetParsedState()
    activeStep.value = 1

    const uploaded = await uploadFileToTcb(rawFile, ({ stage, progress }) => {
      currentStage.value = stage
      if (typeof progress === 'number') uploadProgress.value = progress
    })
    uploadId.value = uploaded.fileID

    currentStage.value = 'parse'
    const res = await parseExcel({
      user_id: authStore.userId || '',
      upload_id: uploadId.value
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
    uploadId.value = ''
    activeStep.value = 0
    ElMessage.error(error instanceof Error ? error.message : '文件解析失败')
  } finally {
    parsing.value = false
    currentStage.value = 'idle'
  }
}

const handleTranslate = async () => {
  if (!uploadId.value || !sheetNames.value.length) {
    ElMessage.warning('请先上传并解析 Excel 文件')
    return
  }

  let targetSheetName: string | undefined
  let targetSheetNames: string[] | undefined

  if (isWholeFileMode.value) {
    if (!totalCells.value) {
      ElMessage.warning('当前文件没有可翻译内容')
      return
    }

    targetSheetNames = sheetNames.value
  } else {
    const targetSheet = selectedSheetName.value || sheetNames.value[0]
    if (!targetSheet) {
      ElMessage.warning('请选择工作表')
      return
    }

    if (!(totalCellsBySheet.value[targetSheet] ?? 0)) {
      ElMessage.warning('当前工作表没有可翻译内容')
      return
    }

    targetSheetName = targetSheet
  }

  translating.value = true
  currentStage.value = 'translate'
  try {
    const res = await translateExcel({
      user_id: authStore.userId || '',
      target_lang: targetLang.value,
      upload_id: uploadId.value,
      sheet_name: targetSheetName,
      sheet_names: targetSheetNames
    })

    if (!res.data?.file_url && !res.data?.result_id) {
      throw new Error(res.data?.error || '翻译结果为空')
    }

    downloadUrl.value = res.data?.file_url || ''
    downloadResultId.value = res.data?.result_id || ''
    downloadFileName.value = res.data?.file_name || `${(fileName.value || 'translated').replace(/\.(xlsx|xls)$/i, '')}-translated.xlsx`
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
    currentStage.value = 'idle'
  }
}

const downloadFile = async () => {
  if (!hasDownloadResult.value) return

  downloading.value = true
  currentStage.value = 'download'
  uploadProgress.value = 0

  try {
    const cleanName = (fileName.value || 'translated.xlsx').replace(/\.(xlsx|xls)$/i, '')
    const result = await downloadPythonResult({
      resultId: downloadResultId.value,
      fileUrl: downloadUrl.value,
      fileName: downloadFileName.value || `${cleanName}-translated.xlsx`,
      onProgress: (progress) => {
        uploadProgress.value = progress
      }
    })

    const objectUrl = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = result.fileName || `${cleanName}-translated.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(objectUrl)
    ElMessage.success('结果文件已开始下载')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下载结果文件失败')
  } finally {
    downloading.value = false
    currentStage.value = 'idle'
  }
}
</script>

<style scoped>
.workspace-page {
  display: grid;
  gap: 24px;
  max-width: 1600px;
  margin: 0 auto;
  min-width: 0;
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
  overflow-x: auto;
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
  gap: 24px;
}

.upload-card,
.config-card,
.preview-card {
  min-width: 0;
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

.status-card {
  margin-top: 18px;
  padding: 16px 18px;
  border-radius: 16px;
  background: linear-gradient(180deg, #f7faff, #eef4ff);
  border: 1px solid rgba(49, 94, 251, 0.14);
}

.status-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.status-head strong {
  font-size: 15px;
  color: var(--text-main);
}

.status-head span {
  color: var(--primary);
  font-weight: 600;
}

.status-card p {
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: 14px;
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

@media (max-width: 1280px) {
  .workspace-grid {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  }
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

@media (max-width: 768px) {
  .workspace-page {
    gap: 16px;
  }

  .workspace-header h2 {
    font-size: 24px;
  }

  .workspace-header p {
    font-size: 14px;
  }

  .steps-card {
    padding-top: 18px;
  }

  .steps-card :deep(.el-step__title) {
    white-space: nowrap;
  }

  .section-head {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .section-head h3 {
    font-size: 20px;
  }

  .file-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .status-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .preview-card {
    overflow-x: auto;
  }

  .preview-card :deep(.el-table) {
    min-width: 620px;
  }
}

@media (max-width: 560px) {
  .workspace-header {
    gap: 10px;
  }

  .workspace-header h2 {
    font-size: 22px;
  }

  .steps-card :deep(.el-step__main) {
    min-width: 92px;
  }

  .mode-tip,
  .result-box,
  .status-card {
    padding: 14px;
  }

  .upload-icon {
    font-size: 40px;
  }
}
</style>
