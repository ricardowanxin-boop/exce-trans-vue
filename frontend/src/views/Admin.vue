<template>
  <div class="admin-console">
    <div class="overview-grid">
      <section class="card generate-card">
        <div class="section-title">
          <span class="emoji">🔑</span>
          <h3>快捷生成卡密</h3>
        </div>

        <el-form label-position="top" @submit.prevent>
          <el-form-item label="卡密类型">
            <el-select v-model="generateForm.card_type" placeholder="请选择卡密类型">
              <el-option
                v-for="option in createCardTypeOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>

          <el-form-item v-if="generateForm.card_type !== 'time'" label="单卡额度">
            <el-input-number
              v-model="generateForm.total_count"
              :min="1"
              :max="999999"
              controls-position="right"
              class="full-width"
            />
          </el-form-item>

          <el-form-item v-else label="有效周期">
            <el-select v-model="generateForm.period" placeholder="请选择周期">
              <el-option label="包月" value="month" />
              <el-option label="包年" value="year" />
            </el-select>
          </el-form-item>

          <el-form-item label="生成数量">
            <el-input-number
              v-model="generateForm.quantity"
              :min="1"
              :max="100"
              controls-position="right"
              class="full-width"
            />
          </el-form-item>

          <el-button
            type="primary"
            class="full-width"
            :loading="creating"
            @click="handleCreateCards"
          >
            立即生成
          </el-button>
        </el-form>

        <div v-if="generatedKeys.length > 0" class="generated-result">
          <h4>生成结果 ({{ generatedKeys.length }}条)</h4>
          <el-input
            type="textarea"
            :rows="8"
            readonly
            :value="generatedKeys.join('\n')"
          />
          <el-button class="full-width copy-btn" @click="copyKeys">
            复制全部
          </el-button>
        </div>
      </section>

      <section class="card stats-card" v-loading="loadingStats">
        <div class="section-title">
          <span class="emoji">📊</span>
          <h3>统计概览</h3>
        </div>

        <div class="stats-list">
          <div class="stat-row">
            <span>总发卡数量</span>
            <strong>{{ stats.total }}</strong>
          </div>
          <div class="stat-row">
            <span>单表次卡</span>
            <strong>{{ stats.sheet_count }}</strong>
          </div>
          <div class="stat-row">
            <span>全文件次卡</span>
            <strong>{{ stats.file_count }}</strong>
          </div>
          <div class="stat-row">
            <span>时间卡</span>
            <strong>{{ stats.time }}</strong>
          </div>
        </div>
      </section>
    </div>

    <section class="card list-card">
      <div class="list-header">
        <div class="section-title">
          <span class="emoji">📋</span>
          <h3>所有卡密列表与使用情况</h3>
        </div>

        <div class="list-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索卡密"
            clearable
            class="search-input"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button :loading="loadingList || loadingStats" @click="refreshAll">
            刷新
          </el-button>
        </div>
      </div>

      <el-table
        :data="cards"
        row-key="_id"
        style="width: 100%"
        v-loading="loadingList"
        empty-text="暂无卡密数据"
      >
        <el-table-column prop="key" label="卡密" min-width="220">
          <template #default="{ row }">
            <code>{{ row.key }}</code>
          </template>
        </el-table-column>

        <el-table-column label="类型" width="160">
          <template #default="{ row }">
            {{ formatCardType(row) }}
          </template>
        </el-table-column>

        <el-table-column label="剩余额度" width="140">
          <template #default="{ row }">
            <span class="quota-text">{{ formatRemaining(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="过期时间" min-width="180">
          <template #default="{ row }">
            {{ formatTime(row.expires_at) }}
          </template>
        </el-table-column>

        <el-table-column label="上次重置" min-width="180">
          <template #default="{ row }">
            {{ formatTime(row.last_reset_at) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button size="small" type="primary" plain @click="openEditDialog(row)">
                编辑
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :disabled="row.card_type === 'admin'"
                @click="handleDeleteCard(row)"
              >
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="editDialogVisible" title="编辑卡密" width="520px">
      <el-form label-position="top">
        <el-form-item label="卡密">
          <el-input :model-value="editForm.key" readonly />
        </el-form-item>

        <el-form-item label="类型">
          <el-input :model-value="formatCardType(editForm)" readonly />
        </el-form-item>

        <el-form-item label="状态">
          <el-select v-model="editForm.status">
            <el-option label="正常" value="active" />
            <el-option label="停用" value="disabled" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="editForm.card_type !== 'time'" label="总额度">
          <el-input-number
            v-model="editForm.total_count"
            :min="1"
            :max="999999"
            controls-position="right"
            class="full-width"
          />
        </el-form-item>

        <el-form-item label="已使用">
          <el-input-number
            v-model="editForm.used_count"
            :min="0"
            :max="999999"
            controls-position="right"
            class="full-width"
          />
        </el-form-item>

        <el-form-item v-if="editForm.card_type === 'time'" label="有效周期">
          <el-select v-model="editForm.period" clearable>
            <el-option label="包月" value="month" />
            <el-option label="包年" value="year" />
          </el-select>
        </el-form-item>

        <el-form-item label="过期时间">
          <el-date-picker
            v-model="editForm.expires_at"
            type="datetime"
            value-format="x"
            placeholder="请选择过期时间"
            class="full-width"
            clearable
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="editDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSaveCard">
            保存
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createAdminCards,
  deleteAdminCard,
  fetchAdminCards,
  fetchAdminCardStats,
  type AdminCardCreateParams,
  type AdminCardItem,
  type AdminCardType,
  updateAdminCard
} from '../api/admin'

type EditableCard = Omit<AdminCardItem, 'expires_at' | 'total_count' | 'used_count'> & {
  expires_at: string | null
  total_count: number
  used_count: number
}

const createCardTypeOptions: Array<{ label: string; value: Exclude<AdminCardType, 'admin'> }> = [
  { label: '单Sheet计次卡', value: 'sheet_count' },
  { label: '全文件计次卡', value: 'file_count' },
  { label: '时间卡（包月/包年）', value: 'time' }
]

const defaultQuotaMap: Record<'sheet_count' | 'file_count', number> = {
  sheet_count: 100,
  file_count: 10
}

const stats = reactive({
  total: 0,
  sheet_count: 0,
  file_count: 0,
  time: 0
})

const loadingStats = ref(false)
const loadingList = ref(false)
const creating = ref(false)
const saving = ref(false)

const searchQuery = ref('')
const cards = ref<AdminCardItem[]>([])
const generatedKeys = ref<string[]>([])
const editDialogVisible = ref(false)

const generateForm = reactive({
  card_type: 'sheet_count' as Exclude<AdminCardType, 'admin'>,
  quantity: 1,
  total_count: 100,
  period: 'month' as 'month' | 'year'
})

const editForm = ref<EditableCard>({
  _id: '',
  key: '',
  card_type: 'sheet_count',
  total_count: 100,
  used_count: 0,
  expires_at: null,
  last_reset_at: null,
  period: null,
  status: 'active',
  created_at: null,
  user_id: null
})

let searchTimer: ReturnType<typeof setTimeout> | null = null

const normalizeTimestamp = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const numberValue = Number(value)
    if (Number.isFinite(numberValue)) return numberValue
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    if (typeof candidate.$date === 'number') return candidate.$date
    if (typeof candidate.seconds === 'number') return candidate.seconds * 1000
    if (typeof candidate._seconds === 'number') return candidate._seconds * 1000
  }
  return null
}

const normalizeCard = (item: AdminCardItem): AdminCardItem => ({
  ...item,
  total_count: item.total_count ?? 0,
  used_count: item.used_count ?? 0,
  expires_at: normalizeTimestamp(item.expires_at),
  last_reset_at: normalizeTimestamp(item.last_reset_at),
  created_at: normalizeTimestamp(item.created_at)
})

const formatCardType = (row: Pick<AdminCardItem, 'card_type' | 'period'>) => {
  if (row.card_type === 'sheet_count') return '单Sheet计次卡'
  if (row.card_type === 'file_count') return '全文件计次卡'
  if (row.card_type === 'time') {
    if (row.period === 'month') return '时间卡（包月）'
    if (row.period === 'year') return '时间卡（包年）'
    return '时间卡'
  }
  return '管理员'
}

const formatTime = (value: number | string | null) => {
  const timestamp = normalizeTimestamp(value)
  if (!timestamp) return '•'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

const formatRemaining = (row: AdminCardItem) => {
  const total = Number(row.total_count ?? 0)
  const used = Number(row.used_count ?? 0)
  if (!Number.isFinite(total)) return '•'
  const remaining = Math.max(total - used, 0)
  return remaining >= 999999 ? '999999' : String(remaining)
}

const loadStats = async () => {
  loadingStats.value = true
  try {
    const res = await fetchAdminCardStats()
    stats.total = res.data.total || 0
    stats.sheet_count = res.data.sheet_count || 0
    stats.file_count = res.data.file_count || 0
    stats.time = res.data.time || 0
  } catch (error) {
    console.error(error)
    ElMessage.error('统计数据加载失败')
  } finally {
    loadingStats.value = false
  }
}

const loadCards = async () => {
  loadingList.value = true
  try {
    const res = await fetchAdminCards({
      page: 1,
      page_size: 100,
      search_key: searchQuery.value.trim()
    })
    cards.value = (res.data.list || []).map(normalizeCard)
  } catch (error) {
    console.error(error)
    ElMessage.error('卡密列表加载失败')
  } finally {
    loadingList.value = false
  }
}

const refreshAll = async () => {
  await Promise.all([loadStats(), loadCards()])
}

const handleCreateCards = async () => {
  if (generateForm.quantity < 1) {
    ElMessage.warning('生成数量至少为 1')
    return
  }

  const payload: AdminCardCreateParams = {
    card_type: generateForm.card_type,
    quantity: generateForm.quantity
  }

  if (generateForm.card_type === 'time') {
    payload.period = generateForm.period
  } else {
    payload.total_count = generateForm.total_count
  }

  creating.value = true
  try {
    const res = await createAdminCards(payload)
    generatedKeys.value = res.data.keys || []
    ElMessage.success(`成功生成 ${generatedKeys.value.length} 个卡密`)
    await refreshAll()
  } finally {
    creating.value = false
  }
}

const copyKeys = async () => {
  try {
    await navigator.clipboard.writeText(generatedKeys.value.join('\n'))
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

const openEditDialog = (row: AdminCardItem) => {
  editForm.value._id = row._id
  editForm.value.key = row.key
  editForm.value.card_type = row.card_type
  editForm.value.total_count = Number(row.total_count ?? 0)
  editForm.value.used_count = Number(row.used_count ?? 0)
  editForm.value.expires_at = row.expires_at ? String(row.expires_at) : null
  editForm.value.last_reset_at = row.last_reset_at
  editForm.value.period = row.period ?? null
  editForm.value.status = row.status || 'active'
  editForm.value.created_at = row.created_at
  editForm.value.user_id = row.user_id ?? null
  editDialogVisible.value = true
}

const handleSaveCard = async () => {
  if (!editForm.value._id) return

  saving.value = true
  try {
    await updateAdminCard({
      id: editForm.value._id,
      status: editForm.value.status,
      total_count: editForm.value.card_type === 'time' ? undefined : editForm.value.total_count,
      used_count: editForm.value.used_count,
      expires_at: editForm.value.expires_at ? Number(editForm.value.expires_at) : null,
      period: editForm.value.card_type === 'time' ? editForm.value.period : undefined
    })
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    await refreshAll()
  } finally {
    saving.value = false
  }
}

const handleDeleteCard = async (row: AdminCardItem) => {
  if (row.card_type === 'admin') {
    ElMessage.warning('管理员卡不可删除')
    return
  }

  try {
    await ElMessageBox.confirm(`确定要删除卡密 ${row.key} 吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await deleteAdminCard(row._id)
    ElMessage.success('删除成功')
    await refreshAll()
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
    }
  }
}

watch(
  () => generateForm.card_type,
  (type) => {
    if (type !== 'time') {
      generateForm.total_count = defaultQuotaMap[type]
    }
  },
  { immediate: true }
)

watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadCards()
  }, 250)
})

onMounted(() => {
  refreshAll()
})
</script>

<style scoped>
.admin-console {
  max-width: 1600px;
  margin: 0 auto;
  min-width: 0;
}

.overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 0.9fr);
  gap: 24px;
  margin-bottom: 24px;
}

.generate-card,
.stats-card,
.list-card {
  min-width: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.section-title h3 {
  margin: 0;
  font-size: 28px;
  color: var(--text-main);
}

.emoji {
  font-size: 26px;
  line-height: 1;
}

.full-width {
  width: 100%;
}

.stats-card {
  min-height: 100%;
}

.stats-list {
  display: grid;
  gap: 20px;
}

.stat-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.stat-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.stat-row span {
  color: var(--text-muted);
  font-size: 14px;
}

.stat-row strong {
  font-size: 44px;
  line-height: 1;
  color: var(--text-main);
  font-weight: 700;
}

.generated-result {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.generated-result h4 {
  margin: 0 0 12px;
  font-size: 16px;
}

.copy-btn {
  margin-top: 12px;
}

.list-card {
  overflow: hidden;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}

.list-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 260px;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quota-text {
  color: #16a34a;
  font-weight: 600;
}

code {
  background: #eef2ff;
  color: #315efb;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: monospace;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

@media (max-width: 1280px) {
  .overview-grid {
    grid-template-columns: minmax(0, 1.3fr) minmax(240px, 0.7fr);
  }
}

@media (max-width: 1100px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .list-header {
    flex-direction: column;
    align-items: stretch;
  }

  .list-actions {
    justify-content: space-between;
  }

  .search-input {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .section-title {
    align-items: flex-start;
  }

  .section-title h3 {
    font-size: 22px;
  }

  .stats-list {
    gap: 14px;
  }

  .stat-row strong {
    font-size: 34px;
  }

  .list-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .list-card {
    overflow-x: auto;
  }

  .list-card :deep(.el-table) {
    min-width: 980px;
  }
}

@media (max-width: 560px) {
  .emoji {
    font-size: 22px;
  }

  .section-title h3 {
    font-size: 20px;
  }

  .table-actions {
    flex-wrap: wrap;
  }

  .table-actions :deep(.el-button) {
    flex: 1 1 100px;
    margin-left: 0;
  }

  .dialog-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
