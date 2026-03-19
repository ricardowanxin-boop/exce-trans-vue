# 管理员登录（方案B）数据库新增说明

## 1. 新增集合：admin_users

在云开发数据库中新建集合 `admin_users`，用于存储管理员账号信息。

### 字段定义
- `username`：string，管理员用户名（建议唯一）
- `password_hash`：string，密码哈希（PBKDF2-SHA256 格式）
- `status`：string，`active` 或 `disabled`
- `role`：string，固定 `admin`
- `created_at`：时间（建议 `db.serverDate()` 写入）
- `last_login_at`：时间（可选）

### 示例文档
```json
{
  "username": "admin",
  "password_hash": "pbkdf2_sha256$120000$<saltBase64>$<hashBase64>",
  "status": "active",
  "role": "admin",
  "created_at": 1710000000000
}
```

## 2. 生成 password_hash

项目已提供本地生成脚本：[admin_password_hash.js](file:///Users/ricardo/文稿/创业/软件服务脚本/excel智能翻译vue/scripts/admin_password_hash.js)。

运行示例：
```bash
node scripts/admin_password_hash.js 'Admin@123456'
```

将输出的整串结果复制到 `admin_users.password_hash` 字段即可。

## 3. 云函数环境变量

管理员登录与后续管理员鉴权依赖环境变量：
- `ADMIN_AUTH_SECRET`：用于签发/校验管理员 Token（建议随机长串）

需要在以下云函数中配置：
- `admin-login-function`
- `translate-function`（用于识别管理员并免扣费）

