// LangChain配置和工具模块
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { HumanMessage } from '@langchain/core/messages';
import { RunnableSequence } from '@langchain/core/runnables';

// 模型配置
const MODEL_CONFIGS = {
  kimi: {
    modelName: "kimi-latest",
    baseURL: "https://api.moonshot.cn/v1",
    apiKey: process.env.MOONSHOT_API_KEY || "sk-1hxK03JHKAqXZ0nDirDTD8wZOdwcmepAoI1D8M3FW5VJCP7S",
  },
  doubao: {
    // modelName: "doubao-seed-1-6-250615", // 均衡
    // modelName: "doubao-seed-1-6-vision-250815", // 视觉
    modelName: "doubao-seed-1-6-flash-250828", // 快速
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: process.env.DOUBAO_API_KEY || "28f6eee0-4d9e-4c77-975d-2f9b27b90a4c",
  },
  qianfan: {
    modelName: "ernie-4.5-turbo-vl-latest",
    baseURL: "https://qianfan.baidubce.com/v2",
    apiKey: process.env.QIANFAN_API_KEY || "bce-v3/ALTAK-DuGKPBTOhaT2FKO0MulC0/69d6e617125578c6f2f7e7620dfcdde1fd0b932b",
  }
};

// 默认配置
const DEFAULT_CONFIG = {
  provider: "kimi", // 默认使用 kimi，可选 "doubao"
  temperature: 0.6,
  maxTokens: 2000,
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * 创建LangChain聊天模型实例
 * @param {Object} options - 配置选项
 * @param {string} options.provider - 模型提供商 ("kimi" 或 "doubao")
 * @param {string} options.modelName - 模型名称（可选，覆盖默认）
 * @param {number} options.temperature - 温度参数
 * @param {number} options.maxTokens - 最大token数
 * @param {number} options.timeout - 超时时间（毫秒）
 * @returns {ChatOpenAI} - 配置好的模型实例
 */
export function createChatModel(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const provider = config.provider || "kimi";
  const modelConfig = MODEL_CONFIGS[provider];

  if (!modelConfig) {
    throw new Error(`不支持的模型提供商: ${provider}。支持的选项: ${Object.keys(MODEL_CONFIGS).join(', ')}`);
  }

  console.log(`🤖 创建AI模型: ${provider} (${options.modelName || modelConfig.modelName})`);

  // LangChain.js的ChatOpenAI需要这样配置自定义API
  return new ChatOpenAI({
    model: options.modelName || modelConfig.modelName,
    apiKey: modelConfig.apiKey,
    configuration: {
      baseURL: modelConfig.baseURL,
    },
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    maxRetries: config.maxRetries,
    timeout: config.timeout || 180000 // 默认3分钟
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
 * @param {Array} images - 图片数组（按顺序）
 * @returns {HumanMessage} - 多模态消息
 */
export function createMultimodalMessage(text, images = []) {
  // 使用数组构建，确保严格按照顺序
  const content = [
    {
      type: "text",
      text: text
    }
  ];

  // 使用forEach严格按照images数组的顺序添加图片
  images.forEach(image => {
    content.push({
      type: "image_url",
      image_url: {
        url: image
      }
    });
  });

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

// 导出配置
export { DEFAULT_CONFIG, MODEL_CONFIGS };
