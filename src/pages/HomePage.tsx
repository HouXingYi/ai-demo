import { Button, Card, Space, Typography } from 'antd';
import { MessageOutlined, PictureOutlined, RobotOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Paragraph } = Typography;

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const navigateToChat = () => {
    navigate('/ai-chat');
  };

  const navigateToImageAnalysis = () => {
    navigate('/image-analysis');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '40px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ maxWidth: 800, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title level={1} style={{ color: 'white', fontSize: 48, marginBottom: 16 }}>
            <RobotOutlined /> AI 智能助手
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 18 }}>
            选择您需要的AI服务，体验智能对话和图片分析功能
          </Paragraph>
        </div>

        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card
            hoverable
            style={{
              borderRadius: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
              border: 'none'
            }}
            bodyStyle={{ padding: 32 }}
          >
            <div style={{ textAlign: 'center' }}>
              <MessageOutlined style={{ fontSize: 64, color: '#1890ff', marginBottom: 16 }} />
              <Title level={3} style={{ marginBottom: 16 }}>AI 智能对话</Title>
              <Paragraph style={{ fontSize: 16, color: '#666', marginBottom: 24 }}>
                与AI助手进行智能对话，支持流式响应和自定义系统提示词，
                获得准确、实时的回答和建议。
              </Paragraph>
              <Button
                type="primary"
                size="large"
                onClick={navigateToChat}
                style={{
                  height: 48,
                  fontSize: 16,
                  borderRadius: 8,
                  padding: '0 32px'
                }}
              >
                开始对话 →
              </Button>
            </div>
          </Card>

          <Card
            hoverable
            style={{
              borderRadius: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
              border: 'none'
            }}
            bodyStyle={{ padding: 32 }}
          >
            <div style={{ textAlign: 'center' }}>
              <PictureOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
              <Title level={3} style={{ marginBottom: 16 }}>AI 图片分析</Title>
              <Paragraph style={{ fontSize: 16, color: '#666', marginBottom: 24 }}>
                上传多张图片进行智能分析，支持关系分析、对比分析和时序分析，
                深度理解图片内容和相互关系。
              </Paragraph>
              <Button
                type="primary"
                size="large"
                onClick={navigateToImageAnalysis}
                style={{
                  height: 48,
                  fontSize: 16,
                  borderRadius: 8,
                  padding: '0 32px',
                  backgroundColor: '#52c41a',
                  borderColor: '#52c41a'
                }}
              >
                分析图片 →
              </Button>
            </div>
          </Card>
        </Space>

        <div style={{ textAlign: 'center', marginTop: 48 }}>
          <Paragraph style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>
            基于 LangChain.js 构建 · 支持多模态AI交互
          </Paragraph>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
