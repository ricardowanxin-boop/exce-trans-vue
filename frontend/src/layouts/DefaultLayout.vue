<template>
  <div class="layout-shell">
    <aside class="sidebar">
      <div class="brand-card">
        <div class="brand-badge">Excel</div>
        <div>
          <h1>智能翻译台</h1>
          <p>卡密管理与翻译工作台</p>
        </div>
      </div>

      <nav class="nav-menu">
        <RouterLink class="nav-item" to="/">
          <el-icon><Document /></el-icon>
          <span>翻译工作台</span>
        </RouterLink>
        <RouterLink v-if="isAdmin" class="nav-item" to="/admin">
          <el-icon><DataLine /></el-icon>
          <span>卡密管理</span>
        </RouterLink>
      </nav>

      <div class="user-card">
        <div class="user-label">{{ isAdmin ? '管理员会话' : '用户会话' }}</div>
        <div class="user-id">{{ authStore.userId || '未登录' }}</div>
        <div v-if="!isAdmin" class="quota-line">
          卡密类型
          <strong>{{ userCardLabel }}</strong>
        </div>
        <div v-if="!isAdmin" class="quota-line">
          {{ quotaLabel }}
          <strong>{{ quotaValue }}</strong>
        </div>
        <div v-else class="quota-line">
          当前权限
          <strong>后台管理</strong>
        </div>
        <el-button class="logout-btn" plain @click="handleLogout">
          退出登录
        </el-button>
      </div>
    </aside>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { DataLine, Document } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.userRole === 'admin')
const userCardLabel = computed(() => {
  if (authStore.cardType === 'file_count') return '全文件计次卡'
  if (authStore.cardType === 'time') return '时间卡'
  return '单Sheet计次卡'
})
const quotaLabel = computed(() => (authStore.cardType === 'time' ? '有效期至' : '剩余额度'))
const quotaValue = computed(() => {
  if (authStore.cardType === 'time' && authStore.expiresAt) {
    return new Date(authStore.expiresAt).toLocaleDateString('zh-CN')
  }
  return String(authStore.remainingCount)
})

const handleLogout = () => {
  authStore.logout()
  router.replace({ name: 'login' })
}
</script>

<style scoped>
.layout-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 28px 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(245, 248, 255, 0.96)),
    var(--panel-bg);
  border-right: 1px solid rgba(148, 163, 184, 0.16);
  backdrop-filter: blur(10px);
}

.brand-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: linear-gradient(135deg, #edf3ff, #ffffff);
  border: 1px solid rgba(49, 94, 251, 0.14);
  border-radius: var(--radius-md);
}

.brand-badge {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: rgba(49, 94, 251, 0.12);
  color: var(--primary);
  font-weight: 700;
}

.brand-card h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

.brand-card p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.nav-menu {
  display: grid;
  gap: 10px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  color: var(--text-muted);
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.nav-item:hover {
  transform: translateX(2px);
  background: rgba(49, 94, 251, 0.08);
  color: var(--primary);
}

.nav-item.router-link-active {
  background: linear-gradient(135deg, rgba(49, 94, 251, 0.12), rgba(49, 94, 251, 0.06));
  color: var(--primary);
  font-weight: 600;
}

.user-card {
  margin-top: auto;
  padding: 18px;
  border-radius: var(--radius-md);
  background: #fff;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.user-label {
  font-size: 13px;
  color: var(--text-muted);
}

.user-id {
  margin: 8px 0 16px;
  font-size: 18px;
  font-weight: 700;
  word-break: break-all;
}

.quota-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  color: var(--text-muted);
}

.quota-line strong {
  color: var(--text-main);
  font-size: 18px;
}

.logout-btn {
  width: 100%;
}

.main-content {
  min-width: 0;
  padding: 28px;
}

@media (max-width: 960px) {
  .layout-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .main-content {
    padding: 18px;
  }
}
</style>
