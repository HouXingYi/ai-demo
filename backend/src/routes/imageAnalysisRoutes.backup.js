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
import progressManager from '../websocket/progressManager.js';

const router = express.Router();

// 添加请求队列管理，防止并发冲突
let isProcessing = false;
const requestQueue = [];

// 验证图片buffer的文件头
const validateImageBuffer = (buffer, fileName) => {
  try {
    if (!buffer || buffer.length < 12) {
      return false;
    }

    const uint8Array = new Uint8Array(buffer);

    // WebP文件头: RIFF....WEBP
    if (fileName.toLowerCase().endsWith('.webp')) {
      const riffHeader = uint8Array.slice(0, 4);
      const webpHeader = uint8Array.slice(8, 12);
      const isRIFF = String.fromCharCode(...riffHeader) === 'RIFF';
      const isWEBP = String.fromCharCode(...webpHeader) === 'WEBP';
      return isRIFF && isWEBP;
    }

    // JPEG文件头: FF D8 FF
    if (fileName.toLowerCase().endsWith('.jpeg') || fileName.toLowerCase().endsWith('.jpg')) {
      return uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF;
    }

    // PNG文件头: 89 50 4E 47
    if (fileName.toLowerCase().endsWith('.png')) {
      return uint8Array[0] === 0x89 && uint8Array[1] === 0x50 &&
        uint8Array[2] === 0x4E && uint8Array[3] === 0x47;
    }

    return true; // 对于其他格式，返回true
  } catch (error) {
    console.warn(`图片验证异常: ${fileName}`, error);
    return false;
  }
};

// 根据文件扩展名获取MIME类型
const getMimeTypeFromExtension = (fileName) => {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'webp':
      return 'image/webp';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg'; // 默认为jpeg
  }
};

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

  // 检查是否有其他请求正在处理
  if (isProcessing) {
    console.log('⚠️ 检测到并发请求，当前有请求正在处理中');
    return res.status(429).json({
      success: false,
      error: '服务器正在处理其他请求，请稍后重试',
      framework: 'LangChain.js',
      retryAfter: 5
    });
  }

  // 标记为正在处理
  isProcessing = true;
  console.log('🔒 设置处理状态锁定');

  try {
    if (!req.files || req.files.length === 0) {
      console.log('❌ 错误: 没有接收到文件');
      isProcessing = false; // 释放锁定
      return res.status(400).json({
        success: false,
        error: '请上传至少一张图片文件',
        framework: 'LangChain.js'
      });
    }

    const { customPrompt = '', imageRecordMapping = '[]', sessionId = '' } = req.body;
    console.log('自定义提示词长度:', customPrompt.length);
    console.log('提示词预览:', customPrompt.substring(0, 100) + '...');
    console.log('WebSocket会话ID:', sessionId || '未提供');

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
      isProcessing = false; // 释放锁定
      return res.status(400).json({
        success: false,
        error: '请提供自定义提示词来指定分析要求',
        framework: 'LangChain.js'
      });
    }

    // 处理多张图片（超大批量优化版 - 支持100+文件）
    console.log('📷 开始处理图片文件...');
    const imageUrls = [];
    const imageNames = [];
    const processedMappingData = []; // 新增：只包含成功处理图片的映射数据
    const batchSize = 15; // 优化批处理大小，平衡性能和稳定性
    let totalProcessed = 0;

    // 支持大批量处理，不限制文件数量
    const filesToProcess = req.files;

    console.log(`🚀 超大批量处理模式: ${filesToProcess.length} 个文件，每批处理 ${batchSize} 个`);
    console.log(`💪 支持大规模图片分析，预计处理时间: ${Math.ceil(filesToProcess.length / batchSize) * 2}秒`);

    // 分批处理文件以优化内存使用
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);
      console.log(`📦 处理第 ${Math.floor(i / batchSize) + 1} 批文件 (${batch.length} 个文件)`);

      for (const file of batch) {
        try {
          console.log(`处理文件: ${file.originalname}, 大小: ${file.size} bytes, 类型: ${file.mimetype}`);

          // 检查文件是否存在且大小合理
          if (!file.path || file.size === 0) {
            console.error(`❌ 文件无效: ${file.originalname}, 路径: ${file.path}, 大小: ${file.size}`);
            continue;
          }

          // 检查文件大小限制（大批量处理时适当放宽限制）
          const maxFileSize = 20 * 1024 * 1024; // 20MB（为大批量处理优化）
          if (file.size > maxFileSize) {
            console.error(`❌ 文件过大: ${file.originalname}, 大小: ${file.size} bytes`);
            continue;
          }

          // 大批量处理时跳过过小的文件（可能损坏）
          if (file.size < 1024) { // 小于1KB
            console.warn(`⚠️ 文件过小，可能损坏: ${file.originalname}, 大小: ${file.size} bytes`);
            continue;
          }

          const imageBuffer = await fs.readFile(file.path);

          // 验证读取的buffer
          if (!imageBuffer || imageBuffer.length === 0) {
            console.error(`❌ 读取的图片buffer为空: ${file.originalname}`);
            continue;
          }

          // 验证图片文件头（后端验证）
          const isValidImage = validateImageBuffer(imageBuffer, file.originalname);
          if (!isValidImage) {
            console.warn(`⚠️ 图片文件头验证失败，跳过: ${file.originalname}`);
            continue;
          }

          const base64Image = imageBuffer.toString('base64');

          // 验证Base64编码
          if (!base64Image || base64Image.length < 100) {
            console.error(`❌ Base64编码异常: ${file.originalname}, 长度: ${base64Image.length}`);
            continue;
          }

          // 确定正确的MIME类型
          let mimeType = file.mimetype;
          if (!mimeType || mimeType === 'application/octet-stream') {
            mimeType = getMimeTypeFromExtension(file.originalname);
          }

          const imageUrl = `data:${mimeType};base64,${base64Image}`;

          imageUrls.push(imageUrl);
          imageNames.push(file.originalname);

          // 查找对应的映射数据（通过文件名匹配）
          const correspondingMapping = mappingData.find(mapping => mapping.fileName === file.originalname);
          if (correspondingMapping) {
            processedMappingData.push(correspondingMapping);
            console.log(`✅ 图片映射匹配: ${file.originalname} → 序列号${correspondingMapping.serialNumber}`);
          } else {
            console.warn(`⚠️ 未找到图片 ${file.originalname} 的映射数据`);
            // 创建一个默认映射
            processedMappingData.push({
              fileName: file.originalname,
              serialNumber: 'unknown',
              webpageName: 'unknown',
              triggerTime: 'unknown',
              actionEvent: 'unknown'
            });
          }

          totalProcessed++;

          console.log(`✅ 成功处理: ${file.originalname}, Base64长度: ${base64Image.length}, MIME: ${mimeType}`);
          console.log(`📈 进度: ${totalProcessed}/${filesToProcess.length} (${Math.round(totalProcessed / filesToProcess.length * 100)}%)`);

          // 释放buffer内存
          imageBuffer.fill(0);

          // 检查内存使用情况
          const memUsage = process.memoryUsage();
          console.log(`💾 当前内存: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
        } catch (fileError) {
          console.error(`❌ 处理文件失败: ${file.originalname}`, fileError);
          // 继续处理其他文件，不中断整个流程
        }
      }

      // 每批处理完后暂停，强制垃圾回收和内存清理（大批量优化）
      if (i + batchSize < filesToProcess.length) {
        const memBefore = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        console.log(`⏸️ 批处理间隔休息，当前内存使用: ${memBefore}MB`);

        // 强制垃圾回收（大批量处理时更频繁）
        if (global.gc) {
          global.gc();
          const memAfter = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
          console.log(`🧹 强制垃圾回收完成，内存: ${memBefore}MB → ${memAfter}MB (释放${memBefore - memAfter}MB)`);
        }

        // 大批量处理时的智能休息策略
        const restTime = filesToProcess.length > 50 ? 500 : 200; // 文件多时休息更久
        console.log(`😴 休息 ${restTime}ms 以优化大批量处理...`);
        await new Promise(resolve => setTimeout(resolve, restTime));

        // 每处理50个文件后进行更深度的内存清理
        if ((i + batchSize) % 50 === 0) {
          console.log(`🔄 处理了${i + batchSize}个文件，进行深度内存清理...`);
          if (global.gc) {
            global.gc();
            global.gc(); // 双重垃圾回收
          }
          await new Promise(resolve => setTimeout(resolve, 1000)); // 更长的休息
        }
      }
    }

    console.log(`📊 总共成功处理了 ${imageUrls.length} 张图片，跳过了 ${req.files.length - imageUrls.length} 张`);
    console.log(`🔍 映射数据验证: 图片${imageUrls.length}张，映射${processedMappingData.length}条`);

    // 验证映射数据的一致性
    if (imageUrls.length !== processedMappingData.length) {
      console.error(`❌ 映射数据不一致: 图片${imageUrls.length}张 vs 映射${processedMappingData.length}条`);
    } else {
      console.log('✅ 图片与映射数据数量一致');
      // 显示前5个映射关系作为验证
      processedMappingData.slice(0, 5).forEach((mapping, index) => {
        console.log(`  ${index + 1}. ${imageNames[index]} → 序列号${mapping.serialNumber}`);
      });
      if (processedMappingData.length > 5) {
        console.log(`  ... 还有 ${processedMappingData.length - 5} 个映射`);
      }
    }

    // 检查是否有有效的图片数据
    if (imageUrls.length === 0) {
      console.error('❌ 没有成功处理任何图片文件');
      isProcessing = false;
      return res.status(400).json({
        success: false,
        error: '没有有效的图片文件可以分析',
        framework: 'LangChain.js'
      });
    }

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

    // 使用配置模块创建多模态模型（大批量优化 - kimi-latest）
    console.log('⚙️ 创建AI模型（大批量处理优化）...');
    const model = createChatModel({
      modelName: "kimi-latest", // 明确指定使用kimi-latest
      temperature: 0.7,
      maxTokens: imageUrls.length > 50 ? 4000 : 2000, // kimi-latest的合理token限制
      timeout: imageUrls.length > 100 ? 300000 : 120000 // 超大批量时增加超时时间（5分钟）
    });
    console.log(`✅ AI模型创建成功 (kimi-latest)，配置: maxTokens=${imageUrls.length > 50 ? 4000 : 2000}, timeout=${imageUrls.length > 100 ? 300 : 120}秒`);

    // 使用配置模块创建多模态消息
    console.log('📝 创建多模态消息...');
    const message = createMultimodalMessage(enhancedPrompt, imageUrls);
    console.log('✅ 多模态消息创建成功');

    // 打印详细的AI请求数据
    console.log('\n=== 后端：发送给AI接口的数据 ===');
    console.log('🤖 AI模型配置 (kimi-latest):');
    console.log('  - model: kimi-latest');
    console.log('  - temperature: 0.7');
    console.log('  - maxTokens:', imageUrls.length > 50 ? 4000 : 2000);
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

    // 分批AI处理策略 - 解决RIFF错误的根本方案
    console.log('🔄 开始分批AI分析（RIFF错误解决方案）...');
    console.log(`📊 准备分析 ${imageUrls.length} 张图片，Base64总大小: ${Math.round(imageUrls.reduce((sum, url) => sum + url.length, 0) / 1024 / 1024)}MB`);

    // 固定每批10张图片处理（优化后的稳定策略）
    const aiChunkSize = 10; // 固定每批10张，确保稳定性和映射准确性
    const totalChunks = Math.ceil(imageUrls.length / aiChunkSize);

    console.log(`🎯 固定分批AI处理策略: ${totalChunks} 批，每批最多 ${aiChunkSize} 张图片`);
    console.log(`⚡ 优化策略: 固定10张/批，确保数据映射准确性和处理稳定性`);

    // 发送初始进度（如果提供了sessionId）
    if (sessionId) {
      progressManager.sendProgress(sessionId, {
        current: 0,
        total: totalChunks,
        percent: 0,
        message: '开始分批处理图片...',
        totalImages: imageUrls.length
      });
    }

    let combinedAnalysis = '';
    let allFilteredResults = [];

    const startTime = Date.now();

    // 分批处理图片
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const startIdx = chunkIndex * aiChunkSize;
      const endIdx = Math.min(startIdx + aiChunkSize, imageUrls.length);
      const chunkImageUrls = imageUrls.slice(startIdx, endIdx);
      const chunkImageNames = imageNames.slice(startIdx, endIdx);
      const chunkMappingData = processedMappingData.slice(startIdx, endIdx);

      console.log(`\n📦 处理第 ${chunkIndex + 1}/${totalChunks} 批图片 (${chunkImageUrls.length} 张)`);
      console.log(`📋 当前批次图片: ${chunkImageNames.join(', ')}`);

      // 严格验证：图片数量必须与映射数据一致
      if (chunkImageUrls.length !== chunkMappingData.length) {
        console.error(`❌ 严重错误：第 ${chunkIndex + 1} 批图片数量(${chunkImageUrls.length})与映射数据(${chunkMappingData.length})不一致！`);
        console.error(`图片: ${chunkImageNames.join(', ')}`);
        console.error(`映射: ${chunkMappingData.map(m => m.fileName).join(', ')}`);
      }

      // 如果这批次没有图片，跳过
      if (chunkImageUrls.length === 0) {
        console.warn(`⚠️ 第 ${chunkIndex + 1} 批没有图片，跳过处理`);
        continue;
      }

      // 验证当前批次的映射数据
      console.log(`🔍 当前批次映射验证:`);
      chunkMappingData.forEach((mapping, idx) => {
        console.log(`  批次内${idx + 1}: ${chunkImageNames[idx]} → 序列号${mapping.serialNumber}`);
      });

      try {
        // 为当前批次构建提示词（保留用户搜索需求）
        let chunkPrompt = `${customPrompt.trim()}\n\n`;

        if (chunkMappingData.length > 0) {
          const chunkMappingInfo = chunkMappingData.map((mapping, index) => {
            return `
【图片 ${index + 1}】
- 文件名: ${mapping.fileName}
- 对应记录序列号: ${mapping.serialNumber}
- 页面名称: ${mapping.webpageName}
- 操作时间: ${mapping.triggerTime}
- 操作类型: ${mapping.actionEvent}`;
          }).join('\n');

          chunkPrompt += `🔥 当前批次图片信息：\n${chunkMappingInfo}\n\n`;
        }

        chunkPrompt += `📋 分析要求：
1. ✅ 我已经将 ${chunkImageUrls.length} 张截图图片随本消息一起发送给你了
2. 📊 图片详情：${chunkMappingData.map((m, i) => `第${i + 1}张(序列号${m.serialNumber})`).join(', ')}
3. 这是第${chunkIndex + 1}批图片（共${totalChunks}批）
4. 请根据用户需求："${customPrompt.trim()}"来分析我发送的这${chunkImageUrls.length}张图片的实际内容
5. 请严格按照图片顺序分析，第1张图片对应【图片 1】的信息
6. 请务必查看图片的实际内容（页面截图、文字、UI元素等）来判断是否符合条件

📝 输出格式要求：
- 请用自然、友好的语言描述每张图片的内容
- 说明每张图片是否符合用户需求，以及原因
- 在分析的最后，用口语化的方式总结，例如：
  "经过分析，序列号9和序列号131的截图符合您的搜索条件。"
  或者 "很遗憾，本批次的截图都不符合您的搜索要求。"
- 在总结的最后一行，添加一个标记供程序识别：##RESULTS##[序列号1, 序列号2, ...]
- 如果没有符合的结果，标记为：##RESULTS##[]

⚠️ 重要提醒：
- 本消息包含 ${chunkImageUrls.length} 张实际图片，请务必查看
- 不要使用JSON、FILTERED_RESULTS等技术术语
- 使用自然、口语化的表达方式
- 让用户能轻松理解分析结果

请开始分析：`;

        console.log(`📝 第${chunkIndex + 1}批提示词长度: ${chunkPrompt.length} 字符`);
        console.log(`🖼️ 第${chunkIndex + 1}批发送图片数量: ${chunkImageUrls.length} 张`);
        console.log(`📊 第${chunkIndex + 1}批图片URL前缀验证: ${chunkImageUrls.map(url => url.substring(0, 30) + '...').join(', ')}`);

        // 最终验证：确保图片、文件名、映射数据三者数量一致
        console.log(`🔍 最终验证 - 图片:${chunkImageUrls.length} 文件名:${chunkImageNames.length} 映射:${chunkMappingData.length}`);
        if (chunkImageUrls.length !== chunkImageNames.length || chunkImageUrls.length !== chunkMappingData.length) {
          console.error(`❌ 数据不一致，跳过本批次处理`);
          continue;
        }

        // 创建当前批次的消息
        const chunkMessage = createMultimodalMessage(chunkPrompt, chunkImageUrls);
        console.log(`✅ 多模态消息已创建，包含文本和${chunkImageUrls.length}张图片`);

        // 验证消息内容
        if (chunkMessage.content) {
          const imageCount = chunkMessage.content.filter(item => item.type === 'image_url').length;
          console.log(`✅ 消息中实际包含的图片数: ${imageCount}`);
          if (imageCount !== chunkImageUrls.length) {
            console.error(`❌ 警告：期望${chunkImageUrls.length}张图片，但消息中只有${imageCount}张！`);
          }
        }

        // 带重试的批次分析
        const chunkAnalyzeWithRetry = withRetry(async () => {
          console.log(`🚀 正在分析第 ${chunkIndex + 1} 批图片...`);
          const response = await model.invoke([chunkMessage]);

          if (!response || !response.content) {
            throw new Error('AI响应为空或无效');
          }

          return response;
        }, 2, 2000);

        const chunkResponse = await chunkAnalyzeWithRetry();

        console.log(`✅ 第 ${chunkIndex + 1} 批分析完成，响应长度: ${chunkResponse.content.length} 字符`);

        // 合并分析结果
        combinedAnalysis += `\n\n=== 第${chunkIndex + 1}批图片分析结果 ===\n`;
        combinedAnalysis += chunkResponse.content;

        // 提取当前批次的筛选结果（新格式：##RESULTS##）
        const chunkFilteredMatch = chunkResponse.content.match(/##RESULTS##\s*\[([\d,\s]*)\]/);
        let chunkNumbers = [];
        if (chunkFilteredMatch) {
          chunkNumbers = chunkFilteredMatch[1]
            .split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n));
          allFilteredResults.push(...chunkNumbers);
          console.log(`📊 第 ${chunkIndex + 1} 批筛选结果: [${chunkNumbers.join(', ')}]`);
        }

        // 发送批次完成的WebSocket消息（发送完整分析结果）
        if (sessionId) {
          const currentProgress = chunkIndex + 1;
          progressManager.sendBatchComplete(sessionId, {
            current: currentProgress,
            total: totalChunks,
            percent: Math.round((currentProgress / totalChunks) * 100),
            batchIndex: chunkIndex + 1,
            batchAnalysis: chunkResponse.content, // 发送完整分析结果，不再截断
            batchFilteredResults: chunkNumbers,
            message: `第 ${currentProgress}/${totalChunks} 批处理完成`
          });
          console.log(`📡 WebSocket已推送第${currentProgress}批完整结果，长度: ${chunkResponse.content.length} 字符`);
        }

        // 批次间休息（固定10张/批的优化策略）
        if (chunkIndex < totalChunks - 1) {
          const restTime = 300; // 固定300ms休息时间，平衡速度和稳定性
          console.log(`😴 批次间休息 ${restTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, restTime));
        }

      } catch (chunkError) {
        console.error(`❌ 第 ${chunkIndex + 1} 批处理失败:`, chunkError.message);

        // 智能RIFF错误处理：尝试降级处理
        if (chunkError.message && chunkError.message.includes('riff')) {
          console.error(`🔍 第 ${chunkIndex + 1} 批出现RIFF错误，尝试降级处理...`);

          // 如果批次大小大于1，尝试拆分成更小的批次
          if (chunkImageUrls.length > 1) {
            console.log(`🔄 降级策略：将${chunkImageUrls.length}张图片拆分成单张处理`);

            // 逐张处理当前批次的图片
            for (let singleIdx = 0; singleIdx < chunkImageUrls.length; singleIdx++) {
              try {
                const singleImageUrl = [chunkImageUrls[singleIdx]];
                const singleImageName = chunkImageNames[singleIdx];
                const singleMapping = chunkMappingData[singleIdx];

                console.log(`🔍 单张处理: ${singleImageName}`);

                // 构建单张图片的提示词
                const singlePrompt = `${customPrompt.trim()}\n\n🔥 图片信息：\n【图片 1】\n- 文件名: ${singleMapping.fileName}\n- 对应记录序列号: ${singleMapping.serialNumber}\n- 页面名称: ${singleMapping.webpageName}\n- 操作时间: ${singleMapping.triggerTime}\n- 操作类型: ${singleMapping.actionEvent}\n\n✅ 我已经将这张截图发送给你了，请仔细查看图片内容。\n请用友好的语言说明图片是否符合条件，并在最后添加标记：##RESULTS##[序列号]（如不符合则为空数组[]）\n\n⚠️ 注意：图片已发送，请使用自然语言表达，不要使用技术术语。`;

                const singleMessage = createMultimodalMessage(singlePrompt, singleImageUrl);
                const singleResponse = await model.invoke([singleMessage]);

                if (singleResponse && singleResponse.content) {
                  combinedAnalysis += `\n\n=== 单张图片分析 (${singleImageName}) ===\n`;
                  combinedAnalysis += singleResponse.content;

                  // 提取筛选结果（新格式：##RESULTS##）
                  const singleFilteredMatch = singleResponse.content.match(/##RESULTS##\s*\[([\d,\s]*)\]/);
                  if (singleFilteredMatch) {
                    const singleNumbers = singleFilteredMatch[1]
                      .split(',')
                      .map(n => parseInt(n.trim()))
                      .filter(n => !isNaN(n));
                    allFilteredResults.push(...singleNumbers);
                    console.log(`✅ 单张图片 ${singleImageName} 筛选结果: [${singleNumbers.join(', ')}]`);
                  }
                }

                // 单张处理间短暂休息
                await new Promise(resolve => setTimeout(resolve, 200));

              } catch (singleError) {
                console.error(`❌ 单张图片 ${chunkImageNames[singleIdx]} 处理失败:`, singleError.message);
                combinedAnalysis += `\n\n=== 单张图片分析失败 (${chunkImageNames[singleIdx]}) ===\n`;
                combinedAnalysis += `错误: ${singleError.message}\n`;
              }
            }
          } else {
            // 单张图片也失败，记录错误
            console.error(`❌ 单张图片也无法处理: ${chunkImageNames[0]}`);
            combinedAnalysis += `\n\n=== 图片分析失败 (${chunkImageNames[0]}) ===\n`;
            combinedAnalysis += `错误: ${chunkError.message}\n`;
          }

          continue; // 继续处理下一批
        } else {
          // 其他错误则终止处理
          throw chunkError;
        }
      }
    }

    const endTime = Date.now();

    // 去重：将重复的序列号合并为唯一列表
    const uniqueFilteredResults = [...new Set(allFilteredResults)].sort((a, b) => a - b);
    console.log(`🔍 去重前: ${allFilteredResults.length} 个结果, 去重后: ${uniqueFilteredResults.length} 个唯一结果`);
    console.log(`📋 最终唯一筛选结果: [${uniqueFilteredResults.join(', ')}]`);

    // 构建最终的AI响应对象（用户友好的格式）
    let finalSummary = '';
    if (uniqueFilteredResults.length > 0) {
      finalSummary = `\n\n=== 📊 搜索结果汇总 ===\n经过对 ${imageUrls.length} 张截图的仔细分析，共有 ${uniqueFilteredResults.length} 条记录符合您的搜索条件：\n序列号：${uniqueFilteredResults.join('、')}\n\n您可以在下方的列表中查看这些记录的详细信息。`;
    } else {
      finalSummary = `\n\n=== 📊 搜索结果汇总 ===\n很抱歉，在分析的 ${imageUrls.length} 张截图中，没有找到完全符合您搜索条件的记录。\n建议您尝试调整搜索条件后再次搜索。`;
    }
    const finalAnalysis = `${combinedAnalysis}${finalSummary}\n\n##RESULTS##[${uniqueFilteredResults.join(', ')}]`;

    const aiResponse = {
      content: finalAnalysis,
      usage: {
        promptTokens: 'N/A (分批处理)',
        completionTokens: 'N/A (分批处理)',
        totalTokens: 'N/A (分批处理)'
      }
    };

    console.log(`✅ 分批AI分析全部完成！总耗时: ${endTime - startTime}ms`);
    console.log(`📊 去重前筛选结果: [${allFilteredResults.join(', ')}] (共${allFilteredResults.length}个)`);
    console.log(`📊 去重后筛选结果: [${uniqueFilteredResults.join(', ')}] (共${uniqueFilteredResults.length}个)`);

    // 发送最终结果的WebSocket消息（使用去重后的结果）
    if (sessionId) {
      progressManager.sendFinalResult(sessionId, {
        success: true,
        analysis: finalAnalysis,
        filteredResults: uniqueFilteredResults,
        totalTime: endTime - startTime,
        totalBatches: totalChunks,
        totalImages: imageUrls.length,
        message: '所有图片分析完成！'
      });
    }

    // 如果所有批次都失败了，返回错误
    if (combinedAnalysis.trim() === '') {
      console.error('❌ 所有批次都处理失败');
      isProcessing = false;
      return res.status(500).json({
        success: false,
        error: '所有图片批次分析都失败',
        message: 'RIFF错误导致无法处理任何图片',
        framework: 'LangChain.js',
        timestamp: new Date().toISOString()
      });
    }

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

    // 释放锁定状态
    isProcessing = false;
    console.log('🔓 释放处理状态锁定');

    // 强制垃圾回收以释放内存
    if (global.gc) {
      global.gc();
      console.log('🧹 请求完成后强制垃圾回收');
    }

    res.json(responseData);

  } catch (error) {
    console.error('\n❌ 多图片分析错误:', error);
    console.error('错误堆栈:', error.stack);

    // 发送错误的WebSocket消息
    const sessionId = req.body.sessionId;
    if (sessionId) {
      progressManager.sendError(sessionId, error);
    }

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

    // 释放锁定状态
    isProcessing = false;
    console.log('🔓 错误处理：释放处理状态锁定');

    // 强制垃圾回收以释放内存
    if (global.gc) {
      global.gc();
      console.log('🧹 错误处理：强制垃圾回收');
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
