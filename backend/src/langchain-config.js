// LangChain配置和工具模块
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage } from '@langchain/core/messages';
import { RunnableSequence } from '@langchain/core/runnables';

// 默认配置
const DEFAULT_CONFIG = {
  modelName: "kimi-latest",
  baseURL: "https://api.moonshot.cn/v1",
  temperature: 0.6,
  maxTokens: 2000,
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * 创建LangChain聊天模型实例
 * @param {Object} options - 配置选项
 * @returns {ChatOpenAI} - 配置好的模型实例
 */
export function createChatModel(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  // LangChain.js的ChatOpenAI需要这样配置自定义API
  return new ChatOpenAI({
    model: config.modelName,
    apiKey: process.env.MOONSHOT_API_KEY || "sk-1hxK03JHKAqXZ0nDirDTD8wZOdwcmepAoI1D8M3FW5VJCP7S",
    configuration: {
      baseURL: config.baseURL,
    },
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    maxRetries: config.maxRetries
  });
}

/**
 * 创建标准聊天链
 * @param {string} systemPrompt - 系统提示词
 * @param {Object} modelOptions - 模型配置选项
 * @returns {RunnableSequence} - 配置好的聊天链
 */
export function createChatChain(systemPrompt = "你是一个有用的AI助手。", modelOptions = {}) {
  const model = createChatModel(modelOptions);

  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(systemPrompt),
    HumanMessagePromptTemplate.fromTemplate("{input}")
  ]);

  const outputParser = new StringOutputParser();

  return prompt.pipe(model).pipe(outputParser);
}

/**
 * 创建多模态消息（支持图片）
 * @param {string} text - 文本内容
 * @param {Array} images - 图片数组
 * @returns {HumanMessage} - 多模态消息
 */
export function createMultimodalMessage(text, images = []) {
  const content = [
    {
      type: "text",
      text: text
    },
    ...images.map(image => ({
      type: "image_url",
      image_url: {
        url: image
      }
    }))
  ];

  return new HumanMessage({ content });
}

/**
 * 重试机制装饰器
 * @param {Function} fn - 要执行的异步函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试延迟（毫秒）
 * @returns {Function} - 带重试机制的函数
 */
export function withRetry(fn, maxRetries = 3, delay = 1000) {
  return async function (...args) {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        lastError = error;
        console.warn(`尝试 ${i + 1}/${maxRetries + 1} 失败:`, error.message);

        if (i < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // 指数退避
        }
      }
    }

    throw lastError;
  };
}

/**
 * 验证环境配置
 * @returns {Object} - 配置验证结果
 */
export function validateConfig() {
  const apiKey = process.env.MOONSHOT_API_KEY;

  return {
    isValid: !!apiKey,
    apiKey: apiKey ? '***' + apiKey.slice(-4) : null,
    baseURL: DEFAULT_CONFIG.baseURL,
    timestamp: new Date().toISOString()
  };
}

/**
 * 获取LangChain最佳实践配置
 * 基于搜索结果中的最佳实践建议
 * @returns {Object} - 最佳实践配置
 */
export function getBestPracticeConfig() {
  return {
    // 根据 https://promptopti.com/best-practices-in-langchain-prompting/ 的建议
    prompting: {
      // 清晰简洁的提示词
      useClearPrompts: true,
      // 上下文相关性
      maintainContext: true,
      // 使用模板和模式
      useTemplates: true
    },

    // 根据 https://js.langchain.com/docs/how_to/streaming/ 的建议
    streaming: {
      // 支持流式响应
      enableStreaming: true,
      // 使用Server-Sent Events
      useSSE: true,
      // 背景处理回调
      backgroundCallbacks: true
    },

    // 错误处理和重试
    errorHandling: {
      maxRetries: 3,
      retryDelay: 1000,
      exponentialBackoff: true,
      timeoutMs: 30000
    },

    // 性能优化
    performance: {
      // 缓存模型响应
      enableCaching: false, // 可根据需要启用
      // 批处理请求
      enableBatching: false,
      // 速率限制
      rateLimit: {
        requests: 100,
        windowMs: 60000 // 1分钟
      }
    }
  };
}

// 导出默认配置
export { DEFAULT_CONFIG };
