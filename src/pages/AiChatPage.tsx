import { useState } from 'react';
import { Button, Input, Card, Typography, Space, Switch, notification, message as messageApi, Divider, Tag } from 'antd';
import { SendOutlined, MessageOutlined, ClearOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import BackButton from '../components/common/BackButton';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: string;
}

const AiChatPage: React.FC = () => {
  const [message, setMessage] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('你是 Kimi，一个有用的AI助手。');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamMode, setStreamMode] = useState(false);

  const addMessage = (type: 'user' | 'ai', content: string) => {
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date().toISOString()
    };
    setChatHistory(prev => [...prev, newMessage]);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      messageApi.warning('请输入消息内容');
      return;
    }

    const userMessage = message.trim();
    setMessage('');
    addMessage('user', userMessage);
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          systemPrompt,
          stream: streamMode
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      if (streamMode) {
        // 处理流式响应
        const reader = response.body?.getReader();
        if (!reader) throw new Error('无法获取响应流');

        let aiResponse = '';
        const aiMessageId = Date.now().toString();

        // 先添加一个空的AI消息
        const aiMessage: ChatMessage = {
          id: aiMessageId,
          type: 'ai',
          content: '',
          timestamp: new Date().toISOString()
        };
        setChatHistory(prev => [...prev, aiMessage]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.success && data.data.chunk) {
                  aiResponse += data.data.chunk;
                  // 更新AI消息内容
                  setChatHistory(prev =>
                    prev.map(msg =>
                      msg.id === aiMessageId
                        ? { ...msg, content: aiResponse }
                        : msg
                    )
                  );
                } else if (data.data?.finished) {
                  break;
                }
              } catch {
                // 忽略解析错误的行
              }
            }
          }
        }
      } else {
        // 处理普通响应
        const result = await response.json();
        if (result.success) {
          addMessage('ai', result.data.message);
        } else {
          throw new Error(result.error || '聊天失败');
        }
      }

      notification.success({
        message: '消息发送成功',
        description: 'AI已回复您的消息',
        duration: 2,
      });

    } catch (error) {
      console.error('AI聊天失败:', error);
      const errorMessage = error instanceof Error ? error.message : '无法连接到AI服务，请检查后端服务是否启动';
      notification.error({
        message: '聊天失败',
        description: errorMessage,
        duration: 4,
      });
      addMessage('ai', `抱歉，发生了错误: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setChatHistory([]);
    messageApi.info('聊天记录已清除');
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    messageApi.success('消息已复制到剪贴板');
  };

  const downloadChat = () => {
    const chatText = chatHistory.map(msg =>
      `[${msg.type === 'user' ? '用户' : 'AI'}] ${new Date(msg.timestamp).toLocaleString()}\n${msg.content}\n\n`
    ).join('');

    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    messageApi.success('聊天记录已下载');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '20px' }}>
      <BackButton />

      <div style={{ maxWidth: 1000, margin: '0 auto', paddingTop: 80 }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 24 }}>
          <MessageOutlined /> AI 智能对话
        </Title>

        {/* 系统提示词设置 */}
        <Card style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>系统提示词:</Text>
            <TextArea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="设置AI的行为和角色..."
              rows={2}
            />
            <Space>
              <Text>流式响应:</Text>
              <Switch
                checked={streamMode}
                onChange={setStreamMode}
                checkedChildren="开启"
                unCheckedChildren="关闭"
              />
              <Text type="secondary">(实时显示AI回复过程)</Text>
            </Space>
          </Space>
        </Card>

        {/* 聊天历史 */}
        <Card
          title={
            <Space>
              <span>聊天记录</span>
              <Tag color="blue">{chatHistory.length} 条消息</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={downloadChat}
                disabled={chatHistory.length === 0}
              >
                下载
              </Button>
              <Button
                size="small"
                icon={<ClearOutlined />}
                onClick={clearChat}
                disabled={chatHistory.length === 0}
              >
                清除
              </Button>
            </Space>
          }
          style={{ marginBottom: 16, minHeight: 400 }}
          bodyStyle={{ maxHeight: 500, overflowY: 'auto' }}
        >
          {chatHistory.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
              <MessageOutlined style={{ fontSize: 48, marginBottom: 16 }} />
              <p>开始与AI对话吧！</p>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {chatHistory.map((msg) => (
                <div key={msg.id}>
                  <div style={{
                    display: 'flex',
                    justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 8
                  }}>
                    <div style={{
                      maxWidth: '80%',
                      padding: 12,
                      borderRadius: 8,
                      background: msg.type === 'user' ? '#1890ff' : '#f0f0f0',
                      color: msg.type === 'user' ? 'white' : '#000'
                    }}>
                      <div style={{ marginBottom: 4 }}>
                        <Text
                          strong
                          style={{
                            color: msg.type === 'user' ? 'rgba(255,255,255,0.9)' : '#666',
                            fontSize: 12
                          }}
                        >
                          {msg.type === 'user' ? '用户' : 'AI助手'} · {new Date(msg.timestamp).toLocaleTimeString()}
                        </Text>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => copyMessage(msg.content)}
                          style={{
                            marginLeft: 8,
                            color: msg.type === 'user' ? 'rgba(255,255,255,0.7)' : '#999'
                          }}
                        />
                      </div>
                      <Paragraph
                        style={{
                          margin: 0,
                          color: msg.type === 'user' ? 'white' : '#000',
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {msg.content}
                      </Paragraph>
                    </div>
                  </div>
                  {msg.id !== chatHistory[chatHistory.length - 1].id && <Divider />}
                </div>
              ))}
            </Space>
          )}
        </Card>

        {/* 消息输入 */}
        <Card>
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入您的消息... (Shift+Enter换行，Enter发送)"
              rows={3}
              style={{ resize: 'none' }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              loading={loading}
              disabled={!message.trim()}
              style={{ height: 'auto' }}
            >
              发送
            </Button>
          </Space.Compact>
        </Card>
      </div>
    </div>
  );
};

export default AiChatPage;
