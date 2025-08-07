# 开发环境启动说明

## 🚀 一键启动前后台

现在你可以使用以下命令同时启动前台和后台服务：

```bash
npm run dev
```

## 📋 功能说明

- **同时启动**: 一个命令同时启动前端和后端服务
- **自动打开浏览器**: 前端服务启动后会自动打开浏览器
- **彩色输出**: 使用不同颜色区分前台和后台的日志输出
- **智能等待**: 前端会等待后端服务就绪后再启动
- **统一关闭**: 按 `Ctrl+C` 可以同时关闭前后台服务

## 🔧 端口配置

- **后端服务**: http://localhost:3001
- **前端服务**: http://localhost:5173 (Vite默认端口)

## 📁 项目结构

```
ai-test/
├── src/                 # 前端源码
├── backend/             # 后端源码
├── package.json         # 前端依赖和脚本
└── backend/package.json # 后端依赖
```

## 🛠 其他命令

```bash
# 仅启动前端
npm run dev:frontend

# 仅启动后端  
npm run dev:backend

# 构建前端
npm run build

# 代码检查
npm run lint
```