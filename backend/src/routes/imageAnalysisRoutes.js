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

    const { analysisType = 'relationship', customPrompt = '' } = req.body;

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

    // 构建提示词：优先使用自定义提示词，否则使用预设模板
    let promptText;

    if (customPrompt && customPrompt.trim()) {
      // 使用用户自定义的提示词
      promptText = customPrompt.trim();
      console.log('使用自定义提示词进行分析');
    } else {
      // 使用预设的分析类型模板
      const promptTemplates = {
        'relationship': `我上传了${req.files.length}张图片，请仔细分析这些图片之间的关系。包括：
1. 共同点和不同点
2. 是否存在时间序列关系
3. 空间位置关系
4. 主题或概念关联
5. 视觉风格的相似性或差异
请给出详细的分析结果。`,
        'comparison': `请对比分析这${req.files.length}张图片，重点关注：
1. 图片内容的差异
2. 质量和清晰度对比
3. 构图和视角的不同
4. 色彩和光线的对比
5. 哪张图片更适合特定用途`,
        'sequence': `请分析这${req.files.length}张图片是否构成某种序列或故事线：
1. 时间先后顺序
2. 事件发展过程
3. 状态变化过程
4. 空间移动轨迹
5. 建议的最佳排列顺序`,
        'default': `请分析这${req.files.length}张图片，描述它们的内容并分析相互关系。`
      };

      promptText = promptTemplates[analysisType] || promptTemplates['default'];
      console.log(`使用预设 ${analysisType} 模板进行分析`);
    }

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
        analysisType: analysisType,
        customPromptUsed: !!(customPrompt && customPrompt.trim()),
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
