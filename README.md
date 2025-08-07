# React + Ant Design 示例应用

这是一个使用最新技术栈构建的React应用，集成了Ant Design UI组件库。

## 🚀 技术栈

- **React 18** - 最新版本的React框架
- **TypeScript** - 类型安全的JavaScript超集
- **Vite** - 快速的前端构建工具
- **Ant Design 5.x** - 企业级UI设计语言和组件库
- **@ant-design/icons** - Ant Design图标库

## 📦 功能特性

### 已实现的组件展示
- **布局组件**: Layout, Header, Sider, Content, Footer
- **导航组件**: Menu, Steps, Tabs
- **数据录入**: Form, Input, Select, DatePicker, Switch, Slider, Rate
- **数据展示**: Table, Card, Avatar, Badge, Statistic, Progress, Tag
- **反馈组件**: Alert, Modal, Drawer, notification, Message
- **通用组件**: Button, Space, Divider, Typography

### 页面功能
1. **组件展示页** - 展示各种Ant Design组件的使用
2. **数据表格页** - 完整的表格功能，包含排序、筛选等
3. **表单页面** - 表单验证和提交功能

## 🛠️ 开发环境设置

### 项目结构
```
├── src/                 # 前端React应用
├── backend/            # Node.js后端服务
│   ├── src/
│   │   └── server.js   # Express服务器
│   ├── config.js       # 配置文件
│   └── package.json    # 后端依赖
└── package.json        # 前端依赖
```

### 安装依赖
```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend && npm install && cd ..
```

### 启动服务

#### 方式1: 分别启动（推荐用于开发）
```bash
# 终端1: 启动后端服务
cd backend && npm run dev

# 终端2: 启动前端服务
npm run dev
```

#### 方式2: 使用启动脚本
```bash
# 启动后端（在一个终端）
node start-backend.js

# 启动前端（在另一个终端）
npm run dev
```

### 访问地址
- **前端应用**: [http://localhost:5173](http://localhost:5173)
- **后端API**: [http://localhost:3001](http://localhost:3001)
- **健康检查**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

### API接口
- `POST /api/ai/chat` - AI聊天接口
  ```json
  {
    "message": "你好",
    "systemPrompt": "你是一个有用的AI助手"
  }
  ```

### 构建生产版本
```bash
npm run build
```

### 预览生产构建
```bash
npm run preview
```

## 📁 项目结构

```
src/
  ├── App.tsx          # 主应用组件
  ├── App.css          # 应用样式
  ├── main.tsx         # 应用入口
  ├── index.css        # 全局样式
  └── assets/          # 静态资源
```

## 🎨 界面预览

应用包含以下主要界面：
- 响应式侧边栏导航
- 头部用户信息展示
- 多标签页内容区域
- 丰富的组件交互示例

## 🔧 自定义配置

### 主题定制
Ant Design 5.x 支持动态主题配置，可以通过ConfigProvider进行全局主题定制。

### 国际化
项目已配置中文语言环境，可根据需要添加多语言支持。

## 📝 开发说明

- 使用TypeScript进行类型检查
- 遵循React Hooks最佳实践
- 组件采用函数式编程风格
- 支持响应式设计

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

由 AI Assistant 创建 ✨