import express from 'express';
import fs from 'fs-extra';
import {
  createChatModel,
  createMultimodalMessage,
  withRetry,
  getBestPracticeConfig
} from '../langchain-config.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// 多图片分析API路由 - 使用LangChain.js重构（优化版）
router.post('/analyze-multi-images', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请上传至少一张图片文件',
        framework: 'LangChain.js'
      });
    }

    const { customPrompt = '' } = req.body;

    // 检查是否提供了自定义提示词
    if (!customPrompt || !customPrompt.trim()) {
      return res.status(400).json({
        success: false,
        error: '请提供自定义提示词来指定分析要求',
        framework: 'LangChain.js'
      });
    }

    // 处理多张图片
    const imageUrls = [];
    const imageNames = [];

    for (const file of req.files) {
      const imageBuffer = await fs.readFile(file.path);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = file.mimetype;
      const imageUrl = `data:${mimeType};base64,${base64Image}`;

      imageUrls.push(imageUrl);
      imageNames.push(file.originalname);
    }

    // 使用用户自定义的提示词
    const promptText = customPrompt.trim();
    console.log('使用自定义提示词进行多图片分析');

    // 使用配置模块创建多模态模型
    const model = createChatModel({
      temperature: 0.7,
      maxTokens: 2000
    });

    // 使用配置模块创建多模态消息
    const message = createMultimodalMessage(promptText, imageUrls);

    // 带重试机制的分析函数
    const analyzeWithRetry = withRetry(async () => {
      return await model.invoke([message]);
    }, 3, 1000);

    const aiResponse = await analyzeWithRetry();

    // 删除所有临时文件
    for (const file of req.files) {
      await fs.remove(file.path);
    }

    res.json({
      success: true,
      data: {
        analysis: aiResponse.content,
        imageCount: req.files.length,
        imageNames: imageNames,
        customPromptUsed: true,
        timestamp: new Date().toISOString(),
        framework: 'LangChain.js',
        config: getBestPracticeConfig().prompting
      }
    });

  } catch (error) {
    console.error('多图片分析错误:', error);

    // 清理所有临时文件
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          await fs.remove(file.path);
        } catch (cleanupError) {
          console.error('清理临时文件失败:', cleanupError);
        }
      }
    }

    res.status(500).json({
      success: false,
      error: '图片分析失败',
      message: error.message,
      framework: 'LangChain.js',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
