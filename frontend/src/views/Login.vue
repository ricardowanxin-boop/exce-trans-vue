<template>
  <div class="login-page">
    <div class="login-card">
      <div class="card-header">
        <div class="header-badge">Excel</div>
        <div>
          <h1>Excel 智能翻译</h1>
          <p>支持卡密登录和管理员后台登录</p>
        </div>
      </div>

      <el-tabs v-model="activeTab" stretch class="login-tabs">
        <el-tab-pane label="卡密登录" name="key">
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="卡密">
              <el-input
                v-model.trim="keyForm.key"
                placeholder="请输入卡密"
                size="large"
                @keyup.enter="handleKeyLogin"
              />
            </el-form-item>
            <el-button
              type="primary"
              class="submit-btn"
              size="large"
              :loading="keyLoading"
              @click="handleKeyLogin"
            >
              进入工作台
            </el-button>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="管理员登录" name="admin">
          <el-form label-position="top" @submit.prevent>
            <el-form-item label="账号">
              <el-input
                v-model.trim="adminForm.username"
                placeholder="请输入管理员账号"
                size="large"
                @keyup.enter="handleAdminLogin"
              />
            </el-form-item>
            <el-form-item label="密码">
              <el-input
                v-model="adminForm.password"
                type="password"
                show-password
                placeholder="请输入管理员密码"
                size="large"
                @keyup.enter="handleAdminLogin"
              />
            </el-form-item>
            <el-button
              type="primary"
              class="submit-btn"
              size="large"
              :loading="adminLoading"
              @click="handleAdminLogin"
            >
              登录后台
            </el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { adminLogin } from '../api/admin'
import { verifyKey } from '../api/auth'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const activeTab = ref<'key' | 'admin'>('key')
const keyLoading = ref(false)
const adminLoading = ref(false)

const keyForm = reactive({
  key: ''
})

const adminForm = reactive({
  username: '',
  password: ''
})

const handleKeyLogin = async () => {
  if (!keyForm.key) {
    ElMessage.warning('请输入卡密')
    return
  }

  keyLoading.value = true
  try {
    const res = await verifyKey({ key: keyForm.key })
    if (!res.data?.valid || !res.data?.user_id) {
      ElMessage.error(res.data?.error || '卡密验证失败')
      return
    }

    authStore.login({
      id: res.data.user_id,
      role: 'user',
      remainingCount: res.data.remaining_count ?? 0,
      cardType: res.data.card_type ?? 'sheet_count',
      expiresAt: res.data.expires_at ?? null
    })
    ElMessage.success('登录成功')
    router.replace({ name: 'workspace' })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败')
  } finally {
    keyLoading.value = false
  }
}

const handleAdminLogin = async () => {
  if (!adminForm.username || !adminForm.password) {
    ElMessage.warning('请输入管理员账号和密码')
    return
  }

  adminLoading.value = true
  try {
    const res = await adminLogin({
      username: adminForm.username,
      password: adminForm.password
    })

    if (!res.data?.valid || !res.data?.user_id) {
      ElMessage.error(res.data?.error || '管理员登录失败')
      return
    }

    authStore.login({
      id: res.data.user_id,
      role: 'admin',
      token: res.data.token
    })
    ElMessage.success('管理员登录成功')
    router.replace({ name: 'admin' })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '管理员登录失败')
  } finally {
    adminLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.login-card {
  width: min(100%, 460px);
  padding: 32px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: var(--radius-xl);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(16px);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.header-badge {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #315efb, #5b7cff);
  color: #fff;
  font-weight: 700;
}

.card-header h1 {
  margin: 0 0 6px;
  font-size: 28px;
}

.card-header p {
  margin: 0;
  color: var(--text-muted);
}

.login-tabs {
  margin-top: 8px;
}

.submit-btn {
  width: 100%;
}
</style>
