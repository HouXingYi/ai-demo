import express from 'express';
import {
  createChatChain,
  withRetry
} from '../langchain-config.js';

const router = express.Router();

// AI聊天API路由 - 使用LangChain.js重构（优化版）
router.post('/chat', async (req, res) => {
  try {
    const { message, systemPrompt, stream = false } = req.body;

    // 使用配置模块创建聊天链
    const chain = createChatChain(
      systemPrompt || "你是 Kimi，一个有用的AI助手。",
      { temperature: 0.6 }
    );

    // 带重试机制的执行函数
    const executeWithRetry = withRetry(async (input) => {
      if (stream) {
        return await chain.stream({ input });
      } else {
        return await chain.invoke({ input });
      }
    }, 3, 1000);

    const userInput = message || "你好，我叫李雷，1+1等于多少？";

    // 检查是否需要流式响应
    if (stream) {
      // 设置Server-Sent Events响应头（遵循最佳实践）
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Accel-Buffering', 'no'); // 禁用nginx缓冲

      try {
        const streamResponse = await executeWithRetry(userInput);

        for await (const chunk of streamResponse) {
          // 发送SSE格式的流式数据
          const data = JSON.stringify({
            success: true,
            data: {
              chunk: chunk,
              timestamp: new Date().toISOString(),
              framework: 'LangChain.js'
            }
          });

          res.write(`data: ${data}\n\n`);

          // 确保数据立即发送
          if (res.flush) res.flush();
        }

        // 发送结束标记
        res.write(`data: ${JSON.stringify({
          success: true,
          data: {
            finished: true,
            timestamp: new Date().toISOString()
          }
        })}\n\n`);

        res.end();
      } catch (streamError) {
        console.error('流式响应错误:', streamError);
        res.write(`data: ${JSON.stringify({
          success: false,
          error: '流式响应错误',
          message: streamError.message,
          framework: 'LangChain.js'
        })}\n\n`);
        res.end();
      }
    } else {
      // 非流式响应（带重试机制）
      const aiResponse = await executeWithRetry(userInput);

      res.json({
        success: true,
        data: {
          message: aiResponse,
          timestamp: new Date().toISOString(),
          framework: 'LangChain.js'
        }
      });
    }

  } catch (error) {
    console.error('AI API错误:', error);

    // 增强的错误处理
    const errorResponse = {
      success: false,
      error: '服务器内部错误',
      message: error.message,
      framework: 'LangChain.js',
      timestamp: new Date().toISOString()
    };

    // 如果错误发生在流式响应中，需要特殊处理
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
});

export default router;
