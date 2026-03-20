# CloudBase 部署说明

## 部署目标

- `auth-function`、`admin-login-function`、`admin-card-function` 继续走现有 Node 云函数
- 上传、解析、翻译、下载结果 改为新的 Python 普通云函数

## 新增 Python 云函数

云函数目录：

- `cloudfunctions/python-excel-function-normal`

推荐在 CloudBase 控制台按下面方式创建：

1. 新建云函数，名称使用 `python-excel-function`
2. 运行环境选择 Python 3.10
3. 函数类型选择普通函数
4. 入口函数设置为 `index.main_handler`
5. 上传本地文件夹 `cloudfunctions/python-excel-function-normal` 或 zip 包 `cloudfunctions/python-excel-function-normal.zip`
6. 函数超时时间设置到较高值，建议至少 120 秒
7. 前端生产环境开启 `VITE_PY_CALL_FUNCTION=true`，通过 CloudBase JS SDK 直接调用 `python-excel-function`

## Python 云函数环境变量

至少配置下面这些：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `MODEL_NAME`
- `PY_API_PREFIX=/python-api`

函数运行时文件会自动写入 `/tmp/python-excel-function-runtime`，不需要额外配置可写目录。

如果不配 `PY_API_PREFIX`，函数内部仍会默认使用 `/python-api` 兼容旧路由，但生产环境已经不再依赖 HTTP 访问服务。

## 前端生产环境

参考文件：

- `frontend/.env.production.example`

常见做法：

- `VITE_API_BASE_URL` 保持 CloudBase 网关地址，用于管理员登录、卡密校验、卡密管理
- `VITE_PY_CALL_FUNCTION=true`，让上传/解析/翻译通过 CloudBase `callFunction` 直调 Python 云函数
- `VITE_CLOUDBASE_ENV_ID`、`VITE_CLOUDBASE_REGION` 填当前环境信息
- `VITE_CLOUDBASE_TIMEOUT=180000`，避免前端 `callFunction` 在 15 秒默认超时前被取消

## 还需要更新的旧云函数

这几个仍然在使用，需要继续上传最新代码：

- `cloudfunctions/auth-function`
- `cloudfunctions/admin-login-function`
- `cloudfunctions/admin-card-function`

## 不再作为主链路使用的旧云函数

下面这些已经被 Python 版替代：

- `cloudfunctions/parse-function`
- `cloudfunctions/translate-function`
- `cloudfunctions/upload-file-function`
