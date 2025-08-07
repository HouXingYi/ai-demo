// LangChain.js集成测试脚本
import {
  createChatModel,
  createChatChain,
  createMultimodalMessage,
  withRetry,
  validateConfig,
  getBestPracticeConfig
} from './src/langchain-config.js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function testLangChainIntegration() {
  console.log('🚀 开始测试LangChain.js集成...\n');

  try {
    // 1. 测试配置验证
    console.log('1️⃣ 测试配置验证...');
    const config = validateConfig();
    console.log('配置验证结果:', config);
    console.log('✅ 配置验证通过\n');

    // 2. 测试最佳实践配置
    console.log('2️⃣ 测试最佳实践配置...');
    const bestPractices = getBestPracticeConfig();
    console.log('最佳实践配置:', JSON.stringify(bestPractices, null, 2));
    console.log('✅ 最佳实践配置获取成功\n');

    // 3. 测试基础聊天模型
    console.log('3️⃣ 测试基础聊天模型...');
    const model = createChatModel({ temperature: 0.7 });
    console.log('✅ 聊天模型创建成功\n');

    // 4. 测试聊天链
    console.log('4️⃣ 测试聊天链...');
    const chain = createChatChain("你是一个测试助手，请简洁回答问题。");
    const response = await chain.invoke({ input: "1+1等于多少？" });
    console.log('聊天链响应:', response);
    console.log('✅ 聊天链测试成功\n');

    // 5. 测试流式响应
    console.log('5️⃣ 测试流式响应...');
    const streamResponse = await chain.stream({ input: "请数数1到5" });
    console.log('流式响应chunks:');
    for await (const chunk of streamResponse) {
      console.log('chunk:', chunk);
    }
    console.log('✅ 流式响应测试成功\n');

    // 6. 测试重试机制
    console.log('6️⃣ 测试重试机制...');
    let retryCount = 0;
    const testRetryFunction = withRetry(async () => {
      retryCount++;
      if (retryCount < 2) {
        throw new Error('模拟失败');
      }
      return '重试成功！';
    }, 3, 100);

    const retryResult = await testRetryFunction();
    console.log('重试结果:', retryResult);
    console.log('✅ 重试机制测试成功\n');

    // 7. 测试多模态消息创建
    console.log('7️⃣ 测试多模态消息创建...');
    const multimodalMessage = createMultimodalMessage(
      '这是一个测试消息',
      ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==']
    );
    console.log('多模态消息类型:', multimodalMessage.constructor.name);
    console.log('✅ 多模态消息创建成功\n');

    console.log('🎉 所有测试通过！LangChain.js集成成功！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
}

// 运行测试
testLangChainIntegration();
