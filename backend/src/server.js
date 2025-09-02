import express from 'express';
import dotenv from 'dotenv';
import { configureCors, configureJson } from './middleware/cors.js';
import aiChatRoutes from './routes/aiChatRoutes.js';
import imageAnalysisRoutes from './routes/imageAnalysisRoutes.js';
import systemRoutes from './routes/systemRoutes.js';
import { validateConfig } from './langchain-config.js';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 配置中间件
app.use(configureCors());
app.use(configureJson());

// 注册路由模块
app.use('/api/ai', aiChatRoutes);
app.use('/api/ai', imageAnalysisRoutes);
app.use('/api', systemRoutes);



// 启动服务器 - 监听所有网络接口以支持内网访问
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AI后端服务已启动（基于LangChain.js）`);
  console.log(`📍 本地地址: http://localhost:${PORT}`);
  console.log(`🌐 内网地址: http://0.0.0.0:${PORT} (可通过内网IP访问)`);
  console.log(`🔗 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`⚙️  LangChain配置: http://localhost:${PORT}/api/langchain/config`);
  console.log(`🤖 AI聊天: POST http://localhost:${PORT}/api/ai/chat`);
  console.log(`📷 多图片分析: POST http://localhost:${PORT}/api/ai/analyze-multi-images`);
  console.log(`✨ 特性: 流式响应、多模态、重试机制、错误处理`);

  // 验证LangChain配置
  const config = validateConfig();
  if (config.isValid) {
    console.log(`✅ LangChain配置验证通过`);
  } else {
    console.warn(`⚠️  请检查MOONSHOT_API_KEY环境变量`);
  }
});