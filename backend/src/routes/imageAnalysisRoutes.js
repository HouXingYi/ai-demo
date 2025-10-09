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

    // 🎯 按记录分批处理（每批3条记录）
    console.log('🤖 开始按记录分批AI分析...');
    // ⚠️ 重要：批次大小设置为3的原因
    // 1. 图片过多会导致AI分析混淆，图片映射容易出错
    // 2. 实测证明3张图片是AI的最佳工作负载，准确率最高
    // 3. 批次虽然多，但单批处理快，总体时间可接受
    // 4. 建议不要调整为5张以上，否则图片分析会出现错误
    const recordBatchSize = 3; // 每批3条记录（⚠️ 不建议增加，图片过多会导致分析错误）
    const totalRecordBatches = Math.ceil(recordsData.length / recordBatchSize);

    console.log(`📊 分批策略: ${recordsData.length} 条记录，分为 ${totalRecordBatches} 批，每批 ${recordBatchSize} 条`);

    // 创建AI模型（优化参数，控制token消耗）
    // 可以通过环境变量 AI_PROVIDER 来切换模型：doubao（默认）或 kimi
    const aiProvider = process.env.AI_PROVIDER || "kimi";
    const model = createChatModel({
      provider: aiProvider,
      temperature: 0.1, // 降低温度，提高准确性和一致性（0.1更严格，减少幻觉）
      maxTokens: 4000, // 输出token限制（3张图片=3072 tokens + 提示词约0.5K = 3.5K输入，4K输出足够简洁回复）
      timeout: 120000 // 2分钟（3张图片处理更快）
    });
    console.log(`✅ AI模型创建成功 (${aiProvider}, temperature=0.1, maxTokens=4000, 每批3条记录)`);

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
      const serialToImageMap = {}; // 序列号 -> {图片索引, 文件名}的映射

      const recordsInfo = batchRecords.map((record, idx) => {
        if (record.hasImage && record.screenshotFileName && imageFileMap.has(record.screenshotFileName)) {
          batchImages.push(imageFileMap.get(record.screenshotFileName));
          const imgIndex = batchImages.length;

          // 建立序列号 -> 图片的映射关系
          serialToImageMap[record.serialNumber] = {
            imgIndex,
            fileName: record.screenshotFileName
          };

          console.log(`    [映射] 序列号${record.serialNumber} → 图片位置${imgIndex} → 文件: ${record.screenshotFileName}`);

          return `序列号${record.serialNumber} | ${record.webpageName} | ${record.actionEvent} | 对应下方第${imgIndex}张图片`;
        } else {
          return `序列号${record.serialNumber} | ${record.webpageName} | ${record.actionEvent} | 无截图`;
        }
      }).join('\n');

      // 构建清晰的图片位置说明（按图片在数组中的实际顺序）
      const imageMappingText = Object.keys(serialToImageMap).length > 0
        ? `\n\n图片映射：\n${Object.entries(serialToImageMap)
          .sort((a, b) => a[1].imgIndex - b[1].imgIndex) // 按图片索引排序
          .map(([serial, info]) => {
            const { imgIndex } = info;
            return `图${imgIndex}→序列号${serial}`;
          }).join(' | ')}`
        : '';

      const serialNumbers = batchRecords.map(r => r.serialNumber);
      const batchPrompt = `
        搜索提示词："${customPrompt.trim()}"

        记录列表（共${batchRecords.length}条）：
        序列号 | 页面名称 | 操作 | 截图
        ${recordsInfo}
        
        ${imageMappingText}

        任务：从上述记录中找出符合搜索目标的序列号

        规则：按图片映射关系分析（图1对应的序列号、图2对应的序列号...）

        输出格式：
        序列号X：符合/不符合 [原因一句话]
        序列号Y：符合/不符合 [原因一句话]

        【重要】必须在最后一行返回：
        ##RESULTS##[符合的序列号数组]
        示例：##RESULTS##[19,24,28] 或 ##RESULTS##[]

        注意：如果没有符合的记录，必须返回 ##RESULTS##[]
`;

      console.log('batchPrompt22222', batchPrompt);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`📦 第 ${batchIndex + 1}/${totalRecordBatches} 批次数据详情`);
      console.log(`${'='.repeat(80)}`);

      console.log(`\n📋 记录信息:`);
      console.log(`  - 记录数量: ${batchRecords.length} 条`);
      console.log(`  - 序列号: ${serialNumbers.join('、')}`);
      batchRecords.forEach((r, i) => {
        console.log(`  ${i + 1}. 序列号${r.serialNumber} - ${r.webpageName} - 截图:${r.hasImage ? '✅' : '❌'}`);
      });

      console.log(`\n📸 图片信息:`);
      console.log(`  - 图片数量: ${batchImages.length} 张`);
      batchImages.forEach((img, i) => {
        const prefix = img.substring(0, 30);
        const base64Start = img.indexOf('base64,') + 7;
        const base64Length = img.length - base64Start;
        console.log(`  图片${i + 1}: ${prefix}... (Base64长度: ${base64Length} 字符)`);
      });

      console.log(`\n🔗 序列号 ↔ 截图文件 ↔ 图片位置 映射关系（按图片数组顺序）:`);
      console.log(`总计 ${Object.keys(serialToImageMap).length} 条记录有图片映射`);

      // 按图片索引排序显示，这样能看到实际的图片顺序
      const sortedMapping = Object.entries(serialToImageMap).sort((a, b) => a[1].imgIndex - b[1].imgIndex);
      sortedMapping.forEach(([serial, info]) => {
        const { imgIndex, fileName } = info;
        console.log(`  第${imgIndex}张图片 = 序列号${serial}的截图 (文件: ${fileName})`);
      });

      // 验证图片数量是否匹配
      if (batchImages.length !== Object.keys(serialToImageMap).length) {
        console.error(`⚠️ 警告：图片数量(${batchImages.length})与映射数量(${Object.keys(serialToImageMap).length})不一致！`);
      }

      console.log(`\n✅ AI 将看到的图片顺序:`);
      console.log(`文本部分(提示词) → 第1张图片 → 第2张图片 → ... → 第${batchImages.length}张图片`);

      console.log(`\n📝 提示词内容:`);
      console.log(`${'─'.repeat(80)}`);
      console.log(batchPrompt);
      console.log(`${'─'.repeat(80)}`);
      console.log(`提示词长度: ${batchPrompt.length} 字符\n`);

      try {
        // 创建多模态消息
        const message = createMultimodalMessage(batchPrompt, batchImages);

        console.log(`🔧 多模态消息结构（发送给AI的实际数据）:`);
        console.log(`  - content 数组长度: ${message.content?.length}`);
        console.log(`  - content 类型:`, message.content?.map((c, i) => `${i + 1}.${c.type}`).join(', '));

        if (Array.isArray(message.content)) {
          console.log(`\n  📋 详细结构：`);
          message.content.forEach((item, i) => {
            if (item.type === 'text') {
              console.log(`  [位置${i + 1}] 文本部分: ${item.text.length} 字符`);
            } else if (item.type === 'image_url') {
              const urlLength = item.image_url?.url?.length || 0;
              // 图片的实际位置 = 索引 - 1（因为第一个是文本）
              const imagePosition = message.content.slice(0, i).filter(c => c.type === 'image_url').length + 1;
              console.log(`  [位置${i + 1}] 第${imagePosition}张图片: ${urlLength} 字符`);

              // 根据映射找到对应的序列号
              const mappingEntry = sortedMapping.find(([_, info]) => info.imgIndex === imagePosition);
              if (mappingEntry) {
                const [serial, info] = mappingEntry;
                console.log(`       ↳ 这是序列号${serial}的截图 (${info.fileName})`);
              }
            }
          });
        }

        const imageCount = Array.isArray(message.content)
          ? message.content.filter(c => c.type === 'image_url').length
          : 0;
        console.log(`\n  ✅ 图片数量验证: ${imageCount} 张`);
        console.log(`  ✅ AI 看到的顺序: [文本] → [图1] → [图2] → ... → [图${imageCount}]\n`);

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

        // 提取筛选结果 - 增强容错性
        let resultsMatch = batchAnalysis.match(/##RESULTS##\s*\[([\d,\s]*)\]/);

        if (!resultsMatch) {
          // 尝试其他可能的格式
          console.warn(`⚠️ 未找到标准格式的 ##RESULTS##，尝试其他格式...`);
          resultsMatch = batchAnalysis.match(/RESULTS[:#\s]*\[([\d,\s]*)\]/i) ||
            batchAnalysis.match(/结果[:#\s]*\[([\d,\s]*)\]/) ||
            batchAnalysis.match(/\[([\d,\s]+)\]\s*$/);
        }

        if (resultsMatch) {
          const batchResults = resultsMatch[1]
            .split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n));

          allFilteredResults.push(...batchResults);
          console.log(`🎯 本批次符合条件的序列号: ${batchResults.join(', ') || '无'}`);
        } else {
          console.error(`❌ 警告：未能从AI响应中提取 ##RESULTS##`);
          console.log(`AI响应内容：${batchAnalysis.substring(batchAnalysis.length - 200)}`);
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
