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

    const { customPrompt = '', sessionId = '' } = req.body;
    console.log('自定义提示词长度:', customPrompt.length);
    console.log('提示词预览:', customPrompt.substring(0, 100) + '...');
    console.log('WebSocket会话ID:', sessionId || '未提供');

    // 解析所有记录数据（包括有图片和没图片的）
    const { allRecords } = req.body;
    let recordsData = [];
    try {
      recordsData = JSON.parse(allRecords);
      console.log('📊 接收到的记录总数:', recordsData.length);
      console.log('📷 接收到的图片文件数:', req.files?.length || 0);

      // 统计有图片和没图片的记录数量
      const recordsWithImages = recordsData.filter(r => r.hasImage);
      const recordsWithoutImages = recordsData.filter(r => !r.hasImage);
      console.log(`  - 有截图的记录: ${recordsWithImages.length} 条`);
      console.log(`  - 无截图的记录: ${recordsWithoutImages.length} 条`);

      // 验证记录数据的完整性
      console.log('🔍 前5条记录数据验证:');
      recordsData.slice(0, 5).forEach((record, index) => {
        console.log(`  记录${index + 1}: 序列号${record.serialNumber} - ${record.webpageName} - 截图:${record.hasImage ? '✅' : '❌'}`);
      });
    } catch (error) {
      console.error('❌ 解析记录数据失败:', error);
      isProcessing = false;
      return res.status(400).json({
        success: false,
        error: '解析记录数据失败',
        framework: 'LangChain.js'
      });
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

    // 处理图片文件，构建文件名到Base64的映射
    console.log('📷 开始处理图片文件，构建图片映射...');
    const imageFileMap = new Map(); // 文件名 -> Base64图片数据
    const batchSize = 15; // 优化批处理大小，平衡性能和稳定性
    let totalProcessed = 0;

    // 支持大批量处理，不限制文件数量
    const filesToProcess = req.files || [];

    console.log(`🚀 图片文件处理: ${filesToProcess.length} 个文件`);

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

          // 将图片存储到Map中，key是文件名
          imageFileMap.set(file.originalname, imageUrl);

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

    console.log(`📊 图片处理完成: 总共 ${imageFileMap.size} 张图片成功加载到内存`);
    console.log(`📋 记录数据: 总共 ${recordsData.length} 条记录待分析`);

    // 显示前5个图片映射
    const imageMapKeys = Array.from(imageFileMap.keys());
    console.log('🔍 前5个图片文件映射:');
    imageMapKeys.slice(0, 5).forEach((fileName, index) => {
      console.log(`  ${index + 1}. ${fileName}`);
    });
    if (imageMapKeys.length > 5) {
      console.log(`  ... 还有 ${imageMapKeys.length - 5} 个图片`);
    }

    // 检查是否有记录数据
    if (recordsData.length === 0) {
      console.error('❌ 没有接收到任何记录数据');
      isProcessing = false;
      return res.status(400).json({
        success: false,
        error: '没有记录数据可以分析',
        framework: 'LangChain.js'
      });
    }

    // 🎯 按记录分批处理（每批10条记录）
    console.log('🤖 开始按记录分批AI分析...');
    const recordBatchSize = 10; // 每批10条记录（每张图片固定1024 tokens）
    const totalRecordBatches = Math.ceil(recordsData.length / recordBatchSize);

    console.log(`📊 分批策略: ${recordsData.length} 条记录，分为 ${totalRecordBatches} 批，每批 ${recordBatchSize} 条`);

    // 创建AI模型（优化参数，控制token消耗）
    const model = createChatModel({
      modelName: "kimi-latest",
      temperature: 0.1, // 降低温度，提高准确性和一致性（0.1更严格，减少幻觉）
      maxTokens: 16000, // 输出token限制（10张图片=10240 tokens + 提示词约2K = 12K输入，16K输出足够）
      timeout: 240000 // 4分钟
    });
    console.log('✅ AI模型创建成功 (kimi-latest, temperature=0.1, maxTokens=16000, 每批10条记录)');

    // 发送初始进度
    if (sessionId) {
      progressManager.sendProgress(sessionId, {
        current: 0,
        total: totalRecordBatches,
        percent: 0,
        message: '开始分批处理记录...',
        totalRecords: recordsData.length
      });
    }

    let allFilteredResults = [];
    const startTime = Date.now();

    // 按记录分批处理
    for (let batchIndex = 0; batchIndex < totalRecordBatches; batchIndex++) {
      const startIdx = batchIndex * recordBatchSize;
      const endIdx = Math.min(startIdx + recordBatchSize, recordsData.length);
      const batchRecords = recordsData.slice(startIdx, endIdx);

      console.log(`\n📦 处理第 ${batchIndex + 1}/${totalRecordBatches} 批记录 (序列号 ${batchRecords[0].serialNumber}-${batchRecords[batchRecords.length - 1].serialNumber})`);

      // 发送批次开始进度
      if (sessionId) {
        progressManager.sendProgress(sessionId, {
          current: batchIndex,
          total: totalRecordBatches,
          percent: Math.round((batchIndex / totalRecordBatches) * 100),
          message: `正在分析第 ${batchIndex + 1}/${totalRecordBatches} 批记录（序列号 ${batchRecords[0].serialNumber}-${batchRecords[batchRecords.length - 1].serialNumber}）`,
          totalRecords: recordsData.length
        });
      }

      // 为当前批次构建提示词和图片
      const batchImages = [];
      const recordsInfo = batchRecords.map((record, idx) => {
        let imageInfo = '';
        if (record.hasImage && record.screenshotFileName && imageFileMap.has(record.screenshotFileName)) {
          // 有图片，添加到批次图片列表
          batchImages.push(imageFileMap.get(record.screenshotFileName));
          imageInfo = `✅ 有截图（已附带图片${batchImages.length}）`;
        } else {
          imageInfo = '❌ 无截图';
        }

        return `【记录 ${idx + 1}】序列号：${record.serialNumber}
- 页面名称：${record.webpageName}
- 页面URL：${record.webpageUrl || '无'}
- 操作类型：${record.actionEvent}
- 触发时间：${record.triggerTime}
- 截图状态：${imageInfo}`;
      }).join('\n\n');

      // 提取所有序列号用于提示词
      const serialNumbers = batchRecords.map(r => r.serialNumber);
      const batchPrompt = `你是一个专业的操作记录分析助手。用户的搜索需求是："${customPrompt.trim()}"

我将为你提供 ${batchRecords.length} 条操作记录（序列号：${serialNumbers.join('、')}），其中一些记录有对应的网页截图。

📋 操作记录详情：
${recordsInfo}

🎯 严格分析要求：
1. **精确匹配原则**：只有当记录内容**明确、清晰地符合**用户搜索需求时，才能标记为符合
   - 例如：用户搜索"库存页输入34.89"，只有截图中**真实显示库存页面且明确可见34.89这个数字**的记录才符合
   - 不要基于推测、猜测或部分相似就标记为符合
   - 宁可漏掉也不要误判

2. **有截图的记录**：
   - 仔细查看截图中的**实际内容**：页面标题、输入框的值、按钮文字、表格数据等
   - 必须能在截图中**直接看到**用户搜索的关键信息
   - 如果截图模糊、看不清楚，或者只是相似但不完全匹配，应标记为不符合

3. **无截图的记录**：
   - 仅基于页面名称、URL、操作类型等文本信息判断
   - 如果信息不足以确认，应明确说明"无截图，无法确认"
   - **不要**仅凭页面名称相似就判定为符合

4. **序列号规则**：
   - 每条记录都有唯一的序列号（${serialNumbers[0]}、${serialNumbers[1] || serialNumbers[0]}等）
   - 必须使用**实际序列号**，不要使用顺序编号（1、2、3）

5. **输出格式**：
   每条记录格式："序列号X：[是否符合及详细原因]"
   - ✅ 符合：明确说明在截图中看到了什么具体内容
   - ❌ 不符合：说明为什么不符合
   - ⚠️ 无法确认：说明信息不足

6. **最终标记**：##RESULTS##[符合条件的序列号数组]
   - 只包含**确实符合**的序列号
   - 有任何疑问的都不要加入

📝 输出示例：
序列号${serialNumbers[0]}：有截图，但页面显示的是登录界面，未看到"库存"或"34.89"相关内容，不符合
序列号${serialNumbers[1] || serialNumbers[0]}：有截图，页面标题显示"Manage Your Inventory"（库存管理），且在输入框中明确看到"34.89"数值，完全符合搜索条件 ✓
序列号${serialNumbers[2] || serialNumbers[0]}：无截图，无法确认是否包含用户搜索的内容

##RESULTS##[${serialNumbers[1] || serialNumbers[0]}]

⚠️ 重要：请严格遵守"精确匹配原则"，宁可少报也不要误报！

现在请开始分析：`;

      console.log(`📋 当前批次: ${batchRecords.length} 条记录，${batchImages.length} 张图片`);
      console.log(`🔢 本批次实际序列号: ${serialNumbers.join('、')}`);
      batchRecords.forEach((r, i) => {
        console.log(`  ${i + 1}. 序列号${r.serialNumber} - ${r.webpageName} - 截图:${r.hasImage ? '✅' : '❌'}`);
      });

      try {
        // 创建多模态消息
        const message = createMultimodalMessage(batchPrompt, batchImages);

        // 验证消息中的图片数量
        const imageCount = Array.isArray(message.content)
          ? message.content.filter(c => c.type === 'image_url').length
          : 0;
        console.log(`📸 实际发送给AI的图片数量: ${imageCount}`);

        // 详细日志：打印消息结构
        console.log(`📋 消息结构:`, JSON.stringify({
          contentLength: message.content?.length,
          contentTypes: message.content?.map(c => c.type),
          promptLength: batchPrompt.length,
          imageUrlPrefixes: batchImages.map(url => url.substring(0, 50) + '...')
        }, null, 2));

        // 调用AI分析
        console.log(`🚀 发送第 ${batchIndex + 1} 批数据给AI...`);
        const retryFn = withRetry(async () => await model.invoke([message]));
        const response = await retryFn();

        if (!response || !response.content) {
          console.error(`❌ 第 ${batchIndex + 1} 批AI响应为空`);
          console.error(`🔍 响应详情:`, {
            hasResponse: !!response,
            responseKeys: response ? Object.keys(response) : [],
            responseType: typeof response,
            content: response?.content
          });
          continue;
        }

        const batchAnalysis = response.content;
        console.log(`✅ 第 ${batchIndex + 1} 批分析完成`);
        console.log(`📄 分析结果长度: ${batchAnalysis.length} 字符`);
        console.log(`📄 分析结果预览: ${batchAnalysis.substring(0, 200)}...`);

        // 提取筛选结果
        const resultsMatch = batchAnalysis.match(/##RESULTS##\s*\[([\d,\s]*)\]/);
        if (resultsMatch) {
          const batchResults = resultsMatch[1]
            .split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n));

          allFilteredResults.push(...batchResults);
          console.log(`🎯 本批次符合条件的序列号: ${batchResults.join(', ') || '无'}`);
        }

        // 发送批次完成消息
        if (sessionId) {
          progressManager.sendBatchComplete(sessionId, {
            current: batchIndex + 1,
            total: totalRecordBatches,
            batchIndex: batchIndex + 1,
            batchAnalysis: batchAnalysis,
            recordRange: `${batchRecords[0].serialNumber}-${batchRecords[batchRecords.length - 1].serialNumber}`
          });
        }

        // 批次间休息，给AI API缓冲时间
        if (batchIndex < totalRecordBatches - 1) {
          console.log('⏳ 批次间等待1秒，给AI API缓冲时间...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`❌ 第 ${batchIndex + 1} 批处理失败:`, error.message);

        // 构建错误信息作为批次结果
        const errorAnalysis = `❌ 本批次分析失败\n错误信息：${error.message}\n\n本批次包含的记录：\n${batchRecords.map(r => `序列号${r.serialNumber}：分析失败`).join('\n')}`;

        // 发送batch_complete消息，将错误也作为批次结果
        if (sessionId) {
          progressManager.sendBatchComplete(sessionId, {
            current: batchIndex + 1,
            total: totalRecordBatches,
            batchIndex: batchIndex + 1,
            batchAnalysis: errorAnalysis,
            recordRange: `${batchRecords[0].serialNumber}-${batchRecords[batchRecords.length - 1].serialNumber}`
          });
        }

        // 继续处理下一批，不中断
        continue;
      }
    }

    // 去重并排序
    const uniqueFilteredResults = [...new Set(allFilteredResults)].sort((a, b) => a - b);
    console.log(`\n🎉 所有批次处理完成！`);
    console.log(`📊 结果统计: 去重前${allFilteredResults.length}个，去重后${uniqueFilteredResults.length}个`);
    console.log(`🎯 符合条件的序列号: ${uniqueFilteredResults.join(', ') || '无'}`);

    // 构建最终结果
    const finalAnalysis = uniqueFilteredResults.length > 0
      ? `经过分析，在 ${recordsData.length} 条记录中，找到 ${uniqueFilteredResults.length} 条符合您搜索条件的记录。\n\n符合条件的序列号：${uniqueFilteredResults.join(', ')}\n\n##RESULTS##[${uniqueFilteredResults.join(', ')}]`
      : `经过分析，在 ${recordsData.length} 条记录中，没有找到符合您搜索条件的记录。\n\n##RESULTS##[]`;

    // 发送最终结果
    if (sessionId) {
      progressManager.sendFinalResult(sessionId, {
        analysis: finalAnalysis,
        filteredResults: uniqueFilteredResults,
        totalRecords: recordsData.length,
        matchedCount: uniqueFilteredResults.length,
        processingTime: `${((Date.now() - startTime) / 1000).toFixed(1)}秒`
      });
    }

    console.log(`⏱️ 总处理时间: ${((Date.now() - startTime) / 1000).toFixed(1)}秒`);

    // 清理uploads文件夹中的临时文件
    console.log('🧹 开始清理uploads文件夹...');
    try {
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          if (file.path && await fs.pathExists(file.path)) {
            await fs.remove(file.path);
            console.log(`🗑️ 已删除: ${file.path}`);
          }
        }
        console.log(`✅ 已清理 ${req.files.length} 个临时文件`);
      }
    } catch (cleanupError) {
      console.error('⚠️ 清理文件时出错:', cleanupError.message);
    }

    // 释放资源
    isProcessing = false;
    if (global.gc) {
      global.gc();
      console.log('🧹 垃圾回收完成');
    }

    // 返回成功响应
    res.json({
      success: true,
      analysis: finalAnalysis,
      filteredResults: uniqueFilteredResults,
      framework: 'LangChain.js',
      model: 'kimi-latest',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 图片分析过程中发生错误:', error);

    // 发送错误消息
    if (sessionId) {
      progressManager.sendError(sessionId, error);
    }

    // 清理uploads文件夹中的临时文件（错误处理）
    console.log('🧹 错误处理：清理uploads文件夹...');
    try {
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          if (file.path && await fs.pathExists(file.path)) {
            await fs.remove(file.path);
            console.log(`🗑️ 已删除: ${file.path}`);
          }
        }
        console.log(`✅ 错误处理：已清理 ${req.files.length} 个临时文件`);
      }
    } catch (cleanupError) {
      console.error('⚠️ 错误处理清理文件时出错:', cleanupError.message);
    }

    // 释放资源
    isProcessing = false;
    console.log('🔓 错误处理：释放处理状态锁定');

    // 强制垃圾回收以释放内存
    if (global.gc) {
      global.gc();
      console.log('🧹 错误处理：强制垃圾回收');
    }

    res.status(500).json({
      success: false,
      error: '记录分析失败',
      message: error.message,
      framework: 'LangChain.js',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
