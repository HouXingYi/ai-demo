import express from 'express';
import fs from 'fs-extra';
import multer from 'multer';
import {
  createChatModel,
  createMultimodalMessage,
  withRetry,
  getBestPracticeConfig
} from '../langchain-config.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Multer错误处理中间件
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          error: '文件大小超过限制（最大15MB）',
          framework: 'LangChain.js'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          error: '文件数量超过限制（最多200个文件）',
          framework: 'LangChain.js'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          error: '意外的文件字段',
          framework: 'LangChain.js'
        });
      default:
        return res.status(400).json({
          success: false,
          error: `文件上传错误: ${err.message}`,
          framework: 'LangChain.js'
        });
    }
  } else if (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
      framework: 'LangChain.js'
    });
  }
  next();
};

// 多图片分析API路由 - 使用LangChain.js重构（超大批量优化版）
router.post('/analyze-multi-images', upload.array('images', 200), handleMulterError, async (req, res) => {
  console.log('\n=== 开始多图片分析请求 ===');
  console.log('请求时间:', new Date().toISOString());
  console.log('接收到的文件数量:', req.files ? req.files.length : 0);

  try {
    if (!req.files || req.files.length === 0) {
      console.log('❌ 错误: 没有接收到文件');
      return res.status(400).json({
        success: false,
        error: '请上传至少一张图片文件',
        framework: 'LangChain.js'
      });
    }

    const { customPrompt = '' } = req.body;
    console.log('自定义提示词长度:', customPrompt.length);
    console.log('提示词预览:', customPrompt.substring(0, 100) + '...');

    // 检查是否提供了自定义提示词
    if (!customPrompt || !customPrompt.trim()) {
      console.log('❌ 错误: 没有提供自定义提示词');
      return res.status(400).json({
        success: false,
        error: '请提供自定义提示词来指定分析要求',
        framework: 'LangChain.js'
      });
    }

    // 处理多张图片（超大批量优化版 - 支持200个文件）
    console.log('📷 开始处理图片文件...');
    const imageUrls = [];
    const imageNames = [];
    const batchSize = 20; // 每批处理20个文件，针对200个文件优化
    let totalProcessed = 0;

    console.log(`🎯 超大批量处理模式: ${req.files.length} 个文件，每批处理 ${batchSize} 个`);

    // 分批处理文件以优化内存使用
    for (let i = 0; i < req.files.length; i += batchSize) {
      const batch = req.files.slice(i, i + batchSize);
      console.log(`📦 处理第 ${Math.floor(i / batchSize) + 1} 批文件 (${batch.length} 个文件)`);

      for (const file of batch) {
        try {
          console.log(`处理文件: ${file.originalname}, 大小: ${file.size} bytes, 类型: ${file.mimetype}`);

          const imageBuffer = await fs.readFile(file.path);
          const base64Image = imageBuffer.toString('base64');
          const mimeType = file.mimetype;
          const imageUrl = `data:${mimeType};base64,${base64Image}`;

          imageUrls.push(imageUrl);
          imageNames.push(file.originalname);
          totalProcessed++;

          console.log(`✅ 成功处理: ${file.originalname}, Base64长度: ${base64Image.length}`);
          console.log(`📈 进度: ${totalProcessed}/${req.files.length} (${Math.round(totalProcessed / req.files.length * 100)}%)`);

          // 释放buffer内存
          imageBuffer.fill(0);
        } catch (fileError) {
          console.error(`❌ 处理文件失败: ${file.originalname}`, fileError);
          // 继续处理其他文件，不中断整个流程
        }
      }

      // 每批处理完后暂停，强制垃圾回收和内存清理
      if (i + batchSize < req.files.length) {
        console.log(`⏸️ 批处理间隔休息，当前内存使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

        // 强制垃圾回收（如果可用）
        if (global.gc) {
          global.gc();
          console.log(`🧹 强制垃圾回收完成，内存使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        }

        // 适当延长休息时间以处理大批量文件
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`📊 总共成功处理了 ${imageUrls.length} 张图片，跳过了 ${req.files.length - imageUrls.length} 张`);

    // 使用用户自定义的提示词
    const promptText = customPrompt.trim();
    console.log('🤖 开始AI分析...');
    console.log('使用自定义提示词进行多图片分析');

    // 使用配置模块创建多模态模型
    console.log('⚙️ 创建AI模型...');
    const model = createChatModel({
      temperature: 0.7,
      maxTokens: 2000
    });
    console.log('✅ AI模型创建成功');

    // 使用配置模块创建多模态消息
    console.log('📝 创建多模态消息...');
    const message = createMultimodalMessage(promptText, imageUrls);
    console.log('✅ 多模态消息创建成功');

    // 带重试机制的分析函数
    console.log('🔄 开始调用AI分析（带重试机制）...');
    const analyzeWithRetry = withRetry(async () => {
      console.log('🚀 正在调用AI模型...');
      return await model.invoke([message]);
    }, 3, 1000);

    const startTime = Date.now();
    const aiResponse = await analyzeWithRetry();
    const endTime = Date.now();

    console.log('✅ AI分析完成！');
    console.log(`⏱️ 分析耗时: ${endTime - startTime}ms`);
    console.log(`📄 响应内容长度: ${aiResponse.content ? aiResponse.content.length : 0} 字符`);
    console.log(`📋 响应内容预览: ${aiResponse.content ? aiResponse.content.substring(0, 200) + '...' : '无内容'}`);

    // 删除所有临时文件
    console.log('🧹 清理临时文件...');
    for (const file of req.files) {
      await fs.remove(file.path);
      console.log(`🗑️ 已删除临时文件: ${file.path}`);
    }

    console.log('📤 准备返回响应...');
    const responseData = {
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
    };

    console.log('✅ 分析请求处理完成！');
    console.log('=== 多图片分析请求结束 ===\n');

    res.json(responseData);

  } catch (error) {
    console.error('\n❌ 多图片分析错误:', error);
    console.error('错误堆栈:', error.stack);

    // 清理所有临时文件
    console.log('🧹 错误处理：清理临时文件...');
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          await fs.remove(file.path);
          console.log(`🗑️ 已清理临时文件: ${file.path}`);
        } catch (cleanupError) {
          console.error('❌ 清理临时文件失败:', cleanupError);
        }
      }
    }

    console.log('📤 返回错误响应...');
    console.log('=== 多图片分析请求异常结束 ===\n');

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
