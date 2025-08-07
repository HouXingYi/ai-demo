import express from 'express';
import {
  validateConfig,
  getBestPracticeConfig
} from '../langchain-config.js';

const router = express.Router();

// 健康检查路由
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI后端服务运行正常',
    timestamp: new Date().toISOString(),
    framework: 'LangChain.js'
  });
});

// LangChain配置信息路由
router.get('/langchain/config', (req, res) => {
  const configValidation = validateConfig();
  const bestPractices = getBestPracticeConfig();

  res.json({
    success: true,
    data: {
      validation: configValidation,
      bestPractices: bestPractices,
      framework: 'LangChain.js',
      version: '0.3.x',
      features: {
        streaming: true,
        multimodal: true,
        retry: true,
        errorHandling: true
      }
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
