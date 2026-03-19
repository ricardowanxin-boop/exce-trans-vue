import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/Login.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/',
      component: () => import('../layouts/DefaultLayout.vue'),
      children: [
        {
          path: '',
          name: 'workspace',
          component: () => import('../views/Workspace.vue'),
          meta: { requiresAuth: true, role: 'user' }
        },
        {
          path: 'admin',
          name: 'admin',
          component: () => import('../views/Admin.vue'),
          meta: { requiresAuth: true, role: 'admin' }
        }
      ]
    }
  ]
})

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login' })
  } else if (to.name === 'login' && authStore.isAuthenticated) {
    if (authStore.userRole === 'admin') {
      next({ name: 'admin' })
    } else {
      next({ name: 'workspace' })
    }
  } else if (to.meta.role && to.meta.role !== authStore.userRole && authStore.userRole !== 'admin') {
    next({ name: 'workspace' })
  } else {
    next()
  }
})

export default router
