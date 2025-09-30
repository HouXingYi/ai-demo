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

    const { customPrompt = '', imageRecordMapping = '[]' } = req.body;
    console.log('自定义提示词长度:', customPrompt.length);
    console.log('提示词预览:', customPrompt.substring(0, 100) + '...');

    // 解析图片与记录的对应关系
    let mappingData = [];
    try {
      mappingData = JSON.parse(imageRecordMapping);
      console.log('图片记录映射数量:', mappingData.length);

      // 验证映射数据的完整性
      console.log('🔍 映射数据验证:');
      mappingData.forEach((mapping, index) => {
        console.log(`  映射${index + 1}: 序列号${mapping.serialNumber} - ${mapping.fileName} - ${mapping.webpageName}`);

        // 检查必要字段
        if (!mapping.serialNumber || !mapping.fileName) {
          console.error(`❌ 映射${index + 1}缺少必要字段:`, mapping);
        }
      });

      // 验证映射数量与图片数量是否一致
      if (mappingData.length !== req.files.length) {
        console.warn(`⚠️ 映射数量(${mappingData.length})与图片数量(${req.files.length})不一致`);
      } else {
        console.log('✅ 映射数量与图片数量一致');
      }
    } catch (error) {
      console.warn('解析图片记录映射失败:', error);
    }

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

          // 验证图片顺序与映射的一致性
          if (mappingData.length > totalProcessed) {
            const expectedFileName = mappingData[totalProcessed].fileName;
            if (file.originalname === expectedFileName) {
              console.log(`✅ 图片顺序验证通过: ${file.originalname} 对应序列号 ${mappingData[totalProcessed].serialNumber}`);
            } else {
              console.warn(`⚠️ 图片顺序可能有误: 期望 ${expectedFileName}, 实际 ${file.originalname}`);
            }
          }

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

    // 构建严格的一一对应分析提示词
    let enhancedPrompt = customPrompt.trim();

    if (mappingData.length > 0) {
      // 为每张图片构建详细的对应关系说明
      const detailedMappingInfo = mappingData.map((mapping, index) => {
        return `
【图片 ${index + 1}】
- 文件名: ${mapping.fileName}
- 对应记录序列号: ${mapping.serialNumber}
- 页面名称: ${mapping.webpageName}
- 操作时间: ${mapping.triggerTime}
- 操作类型: ${mapping.actionEvent}
- 页面URL: 请从原始数据中查找序列号${mapping.serialNumber}对应的URL信息`;
      }).join('\n');

      enhancedPrompt += `

🔥 重要说明：图片与数据记录的严格对应关系
${detailedMappingInfo}

📋 严格的分析要求：
1. 🎯 图片顺序对应关系：
   - 我发送给你的图片顺序严格按照上述映射列表排列
   - 第1张图片 = 映射列表中的【图片 1】
   - 第2张图片 = 映射列表中的【图片 2】
   - 以此类推，绝对不能错位！

2. 📝 分析输出格式：
   请为每张图片按以下格式输出：
   
   ===== 序列号${mappingData.length > 0 ? mappingData[0].serialNumber : 'X'}的图片分析 =====
   对应文件: ${mappingData.length > 0 ? mappingData[0].fileName : 'filename.webp'}
   图片内容: [详细描述你在这张图片中看到的所有内容]
   页面类型: [判断这是什么类型的页面，如登录页、商品页、设置页等]
   主要元素: [列出页面中的主要UI元素和文字]
   操作匹配度: [分析图片内容是否与记录的操作类型"${mappingData.length > 0 ? mappingData[0].actionEvent : 'operation'}"匹配]
   
   ===== 序列号${mappingData.length > 1 ? mappingData[1].serialNumber : 'Y'}的图片分析 =====
   对应文件: ${mappingData.length > 1 ? mappingData[1].fileName : 'filename.webp'}
   [继续按相同格式分析...]

3. 🔍 筛选判断：
   根据用户的搜索需求和每张图片的实际内容，判断哪些记录符合条件

4. 📊 最终输出：
   在所有图片分析完成后，输出符合条件的序列号列表：
   FILTERED_RESULTS: [序列号1, 序列号2, ...]

⚠️ 关键提醒：图片与序列号的对应关系是固定的，请严格按照映射关系进行分析，确保分析结果的准确性！`;
    }

    console.log('🤖 开始AI分析...');
    console.log('使用严格对应的增强提示词进行多图片分析');
    console.log('图片映射信息条数:', mappingData.length);

    // 使用配置模块创建多模态模型
    console.log('⚙️ 创建AI模型...');
    const model = createChatModel({
      temperature: 0.7,
      maxTokens: 2000
    });
    console.log('✅ AI模型创建成功');

    // 使用配置模块创建多模态消息
    console.log('📝 创建多模态消息...');
    const message = createMultimodalMessage(enhancedPrompt, imageUrls);
    console.log('✅ 多模态消息创建成功');

    // 打印详细的AI请求数据
    console.log('\n=== 后端：发送给AI接口的数据 ===');
    console.log('🤖 AI模型配置:');
    console.log('  - temperature: 0.7');
    console.log('  - maxTokens: 2000');
    console.log('📝 提示词信息:');
    console.log(`  - 原始提示词长度: ${customPrompt.length} 字符`);
    console.log(`  - 增强提示词长度: ${enhancedPrompt.length} 字符`);
    console.log(`  - 提示词内容: "${enhancedPrompt.substring(0, 300)}..."`);
    console.log('🖼️ 图片信息:');
    console.log(`  - 图片数量: ${imageUrls.length} 张`);
    console.log(`  - 图片格式统计:`);
    const formatStats = {};
    imageUrls.forEach((url, index) => {
      const format = url.split(';')[0].split('/')[1];
      formatStats[format] = (formatStats[format] || 0) + 1;
      if (index < 10) {
        console.log(`    ${index + 1}. ${imageNames[index]} (${format})`);
      }
    });
    if (imageUrls.length > 10) {
      console.log(`    ... 还有 ${imageUrls.length - 10} 张图片`);
    }
    Object.keys(formatStats).forEach(format => {
      console.log(`  - ${format}: ${formatStats[format]} 张`);
    });
    console.log(`📊 Base64数据统计:`);
    const totalSize = imageUrls.reduce((sum, url) => sum + url.length, 0);
    console.log(`  - 总Base64长度: ${totalSize} 字符`);
    console.log(`  - 平均每张: ${Math.round(totalSize / imageUrls.length)} 字符`);
    console.log('=== 后端AI请求数据结束 ===\n');

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

    // 打印详细的AI响应数据
    console.log('\n=== 后端：AI接口响应数据 ===');
    console.log('📊 响应统计:');
    console.log(`  - 响应时间: ${endTime - startTime}ms`);
    console.log(`  - 响应类型: ${typeof aiResponse}`);
    console.log(`  - 响应对象keys: ${Object.keys(aiResponse)}`);
    console.log('📄 响应内容:');
    console.log(`  - 内容长度: ${aiResponse.content ? aiResponse.content.length : 0} 字符`);
    console.log(`  - 内容预览: "${aiResponse.content ? aiResponse.content.substring(0, 300) + '...' : '无内容'}"`);
    if (aiResponse.usage) {
      console.log('📊 Token使用统计:');
      console.log(`  - 输入tokens: ${aiResponse.usage.promptTokens || 'N/A'}`);
      console.log(`  - 输出tokens: ${aiResponse.usage.completionTokens || 'N/A'}`);
      console.log(`  - 总tokens: ${aiResponse.usage.totalTokens || 'N/A'}`);
    }
    console.log('=== 后端AI响应数据结束 ===\n');

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

    // 打印详细的返回响应数据
    console.log('\n=== 后端：返回给前端的响应数据 ===');
    console.log('📊 响应统计:');
    console.log(`  - 成功状态: ${responseData.success}`);
    console.log(`  - HTTP状态码: 200 OK`);
    console.log('📄 响应数据:');
    console.log(`  - 分析结果长度: ${responseData.data.analysis.length} 字符`);
    console.log(`  - 处理图片数量: ${responseData.data.imageCount}`);
    console.log(`  - 图片文件名数量: ${responseData.data.imageNames.length}`);
    console.log(`  - 使用框架: ${responseData.data.framework}`);
    console.log(`  - 时间戳: ${responseData.data.timestamp}`);
    console.log(`  - 自定义提示词: ${responseData.data.customPromptUsed}`);
    console.log(`  - 响应JSON大小: ${JSON.stringify(responseData).length} 字符`);
    console.log('=== 后端响应数据结束 ===\n');

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
