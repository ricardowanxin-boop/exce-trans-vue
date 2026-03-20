# Frontend README

本目录是 Excel 智能翻译平台的前端应用，负责：

- 登录与卡密输入
- 翻译工作台交互
- 文件上传、解析预览、翻译触发、结果下载
- 管理员后台卡密管理
- 调用 CloudBase Node 云函数与 Python 云函数

## 1. 技术栈

- Vue 3
- TypeScript
- Vite
- Pinia
- Vue Router
- Element Plus
- Axios
- `@cloudbase/js-sdk`

## 2. 前端职责边界

前端只负责：

- 用户交互
- 表单与状态管理
- 上传与下载体验
- 调用后端接口
- 展示解析预览与后台管理数据

前端不负责：

- Excel 真正解析
- 文本翻译
- 卡密扣费规则
- 管理员 Token 签发

这些都由云端完成。

## 3. 当前页面结构

### 登录页

文件：

- [src/views/Login.vue](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/views/Login.vue)

作用：

- 普通用户卡密登录
- 管理员账号登录
- 建立前端会话状态

### 翻译工作台

文件：

- [src/views/Workspace.vue](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/views/Workspace.vue)

作用：

- 上传 Excel
- 展示步骤条
- 展示解析预览
- 选择翻译目标语言
- 发起翻译
- 下载结果文件

### 管理后台

文件：

- [src/views/Admin.vue](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/views/Admin.vue)

作用：

- 卡密统计
- 卡密列表
- 新增卡密
- 编辑卡密
- 删除卡密

### 公共布局

文件：

- [src/layouts/DefaultLayout.vue](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/layouts/DefaultLayout.vue)
- [src/assets/main.css](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/assets/main.css)

作用：

- 页面框架
- 响应式布局
- 统一视觉变量

## 4. 前端调用链路

### 4.1 Node 云函数接口

主要用于：

- 卡密登录
- 管理员登录
- 管理员后台 CRUD

入口封装：

- [src/api/index.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/api/index.ts)
- [src/api/admin.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/api/admin.ts)

### 4.2 Python 云函数接口

主要用于：

- 上传分片
- 解析预览
- 发起翻译
- 下载结果文件

入口封装：

- [src/api/python.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/api/python.ts)
- [src/api/parse.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/api/parse.ts)
- [src/api/translate.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/api/translate.ts)
- [src/lib/tcb.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/lib/tcb.ts)

## 5. 当前前端模式

### 开发环境

默认已经切到：

- `VITE_PY_CALL_FUNCTION=true`

也就是开发时直接调 CloudBase 普通云函数。

如果你临时想切回本地 Python 服务，可改：

```env
VITE_PY_CALL_FUNCTION=false
VITE_PY_API_BASE_URL=http://127.0.0.1:8000
```

### 生产环境

当前生产环境也是：

- 通过 `CloudBase JS SDK -> callFunction`
- 直接调用普通 Python 云函数 `python-excel-function`
- 不再依赖 HTTP 访问服务

## 6. 环境变量

### 开发环境

文件：

- [frontend/.env.development](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/.env.development)

关键变量：

- `VITE_API_BASE_URL`
- `VITE_PUBLISHABLE_KEY`
- `VITE_API_TOKEN`
- `VITE_USE_GATEWAY_TOKEN`
- `VITE_PY_CALL_FUNCTION`
- `VITE_CLOUDBASE_ENV_ID`
- `VITE_CLOUDBASE_REGION`
- `VITE_CLOUDBASE_TIMEOUT`

### 生产环境

文件：

- [frontend/.env.production.example](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/.env.production.example)

关键变量：

- `VITE_API_BASE_URL`
- `VITE_PY_CALL_FUNCTION=true`
- `VITE_CLOUDBASE_ENV_ID`
- `VITE_CLOUDBASE_REGION`
- `VITE_CLOUDBASE_TIMEOUT=180000`
- `VITE_PUBLISHABLE_KEY`
- `VITE_USE_GATEWAY_TOKEN=true`

## 7. 前端状态与业务规则

### 会话状态

来源：

- [src/stores/auth.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/stores/auth.ts)

存储内容通常包括：

- 用户角色
- 用户 ID
- 卡密类型
- 剩余次数
- 到期时间
- 管理员 token

### 卡密类型在前端的表现

- `sheet_count`
  可选择单个工作表翻译
- `file_count`
  自动整文件翻译
- `time`
  按有效期使用
- `admin`
  管理员模式，通常不扣费

## 8. 上传与下载实现

### 上传

当前实现：

- 前端把文件切成多个 chunk
- 每个 chunk 转 Base64
- 通过 Python 普通云函数顺序写入

入口：

- [src/lib/tcb.ts](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/lib/tcb.ts)

### 下载

当前实现：

- 前端先取结果文件信息
- 再按 chunk 拉取结果文件
- 最后拼成 Blob 并触发浏览器下载

好处：

- 不依赖 HTTP 文件直链
- 适合普通云函数 `callFunction` 模式

## 9. 响应式设计要求

这个前端已经做过响应式改造，新页面开发必须遵守：

- 桌面端允许双栏布局
- 中等屏幕自动收缩成单栏或更紧凑布局
- 表格和步骤条允许横向滚动保护
- 侧边栏在窄屏不能把主内容挤坏
- 上传区、配置区、预览区都必须在移动端可读

重点文件：

- [src/views/Workspace.vue](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/views/Workspace.vue)
- [src/views/Admin.vue](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/views/Admin.vue)
- [src/layouts/DefaultLayout.vue](/Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/frontend/src/layouts/DefaultLayout.vue)

## 10. 本地运行

```bash
cd frontend
npm install
npm run dev
```

默认地址：

- `http://127.0.0.1:5173/`

## 11. 构建

```bash
cd frontend
npm run build
```

产物目录：

- `frontend/dist`

## 12. 给 AI 的前端改造规则

如果后续要让 AI 专门改前端，建议直接附上这段要求：

```text
请只在 frontend 目录内做前端改动，遵守以下规则：
1. 不要破坏现有登录、卡密、管理员后台真实接口。
2. Python 翻译链路优先走 callFunction，不要重新改回 HTTP 访问服务。
3. 上传、解析、翻译、下载必须给用户可见的 loading 和错误反馈。
4. 新增页面必须做响应式适配。
5. 不要把管理后台改成假数据。
6. 如果改环境变量，要同步更新 .env.production.example 和 README。
7. 如果改下载逻辑，不能破坏大文件分片下载机制。
8. 如果改卡密类型展示，必须和后端 card_type 保持一致。
```

## 13. 推荐新增功能方向

- 翻译任务历史页
- 术语表管理
- 上传历史记录
- 下载记录
- 失败任务重试
- 用户中心
- 更精细的管理员统计

## 14. 前端维护重点

新项目复用时，最容易出问题的是：

- 环境变量没同步
- 误把 Python 调用模式改回 HTTP
- 管理员 token 乱做全局注入
- 下载逻辑改坏
- 小屏布局溢出
- 预览展示和实际翻译内容不一致

这个 README 的作用就是让这些坑尽量一次说清楚。
