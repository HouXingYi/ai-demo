import { useState } from 'react';
import { Button, Upload, notification, message, Card, Typography, Space, Collapse, Tag, Divider, Input } from 'antd';
import { InboxOutlined, PictureOutlined, ClearOutlined, EyeOutlined, DownloadOutlined, CopyOutlined, EditOutlined } from '@ant-design/icons';
import type { UploadProps, UploadFile } from 'antd';
import BackButton from '../components/common/BackButton';
import styles from './ImageAnalysisPage.module.scss';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;
const { TextArea } = Input;

const ImageAnalysisPage: React.FC = () => {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string>('');

  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<{
    analysis: string;
    imageCount: number;
    imageNames: string[];
    customPromptUsed?: boolean;
    timestamp: string;
  } | null>(null);

  const uploadProps: UploadProps = {
    name: 'images',
    multiple: true,
    accept: 'image/*',
    fileList: uploadFileList,
    beforeUpload: (file, fileList) => {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        message.error('只能上传图片文件!');
        return false;
      }
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error('图片大小必须小于 10MB!');
        return false;
      }

      // 计算当前已有的图片数量加上本次选择的图片数量
      const totalCount = uploadFileList.length + (fileList ? fileList.length : 1);
      if (totalCount > 10) {
        message.error('最多只能上传10张图片!');
        return false;
      }

      return false; // 阻止自动上传
    },
    onChange: (info) => {
      // 处理文件状态变化
      const { fileList } = info;

      // 过滤有效的图片文件（受控 fileList）
      const filteredList = fileList.filter(file => {
        if (file.originFileObj) {
          const isImage = file.originFileObj.type.startsWith('image/');
          const isLt10M = file.originFileObj.size / 1024 / 1024 < 10;
          return isImage && isLt10M;
        }
        return false;
      });

      // 限制最多10张图片（受控 fileList）
      const limitedList = filteredList.slice(0, 10);
      setUploadFileList(limitedList);

      // 同步到原始 File 数组
      const validFiles = limitedList.map(file => file.originFileObj as File);

      // 限制最多10张图片
      if (validFiles.length > 10) {
        message.error('最多只能上传10张图片!');
        setImageFiles(validFiles.slice(0, 10));
        return;
      }

      setImageFiles(validFiles);

      if (validFiles.length > 0) {
        message.success(`已选择 ${validFiles.length} 张图片`);
      }
    },
    onDrop(e) {
      console.log('Dropped files', e.dataTransfer.files);
    },
    showUploadList: true,
  };

  const handleAnalyzeImages = async () => {
    if (imageFiles.length === 0) {
      message.warning('请先选择至少一张图片');
      return;
    }

    if (imageFiles.length === 1) {
      message.warning('多图片分析需要至少2张图片，如需单图片分析请使用单图片模式');
      return;
    }

    if (!customPrompt.trim()) {
      message.warning('请输入自定义提示词来指定分析要求');
      return;
    }

    setAnalyzing(true);
    setResult('');

    try {
      const formData = new FormData();
      imageFiles.forEach((file) => {
        formData.append('images', file);
      });
      formData.append('customPrompt', customPrompt.trim());

      const response = await fetch('http://localhost:3001/api/ai/analyze-multi-images', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setResult(result.data.analysis);
        setAnalysisData(result.data);
        notification.success({
          message: '多图片分析完成',
          description: `已分析${result.data.imageCount}张图片的关系`,
          duration: 3,
        });
      } else {
        throw new Error(result.error || '分析失败');
      }

    } catch (error) {
      console.error('多图片分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : '无法连接到AI服务，请检查后端服务是否启动';
      notification.error({
        message: '分析失败',
        description: errorMessage,
        duration: 4,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClearImages = () => {
    setImageFiles([]);
    setUploadFileList([]);
    setResult('');
    setAnalysisData(null);
    setCustomPrompt('');
    message.info('已清除所有图片和自定义提示词');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    message.success('分析结果已复制到剪贴板');
  };

  const downloadResult = () => {
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kimi-analysis-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('分析结果已下载');
  };



  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '20px' }}>
      <BackButton />

      <div className={styles.mainPage} style={{ paddingTop: 80 }}>
        <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center' }}>
            <PictureOutlined /> AI 多图片自定义分析助手
          </Title>

          <Card title="多图片上传与自定义分析">
            {/* 自定义提示词输入 */}
            <div style={{ marginBottom: 16 }}>
              <Text strong>
                <EditOutlined /> 自定义提示词：
              </Text>
              <Text type="secondary" style={{ marginLeft: 8, fontSize: '12px' }}>
                请输入您希望AI如何分析这些图片的具体要求
              </Text>
              <TextArea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="请输入您希望AI如何分析这些图片的具体要求...&#10;例如：请分析这些图片中的人物情绪变化，并描述每张图片的详细内容&#10;或：对比分析这些图片的构图和色彩运用&#10;或：分析这些图片是否构成时间序列关系"
                rows={4}
                style={{ marginTop: 8 }}
                maxLength={1000}
                showCount
              />
              {customPrompt.trim() && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="green">已设置自定义提示词</Tag>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setCustomPrompt('')}
                    style={{ padding: 0, marginLeft: 8 }}
                  >
                    清除
                  </Button>
                </div>
              )}
            </div>

            <Dragger {...uploadProps}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽多张图片到此区域上传</p>
              <p className="ant-upload-hint">
                支持 JPG、PNG、GIF 等图片格式，单个文件不超过 10MB，最多10张图片
              </p>
            </Dragger>

            {imageFiles.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text type="success">
                  已选择 {imageFiles.length} 张图片，总大小: {(imageFiles.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MB
                </Text>
              </div>
            )}
          </Card>

          <div style={{ textAlign: 'center' }}>
            <Space>
              <Button
                type="primary"
                size="large"
                onClick={handleAnalyzeImages}
                loading={analyzing}
                disabled={imageFiles.length < 2 || !customPrompt.trim()}
              >
                {analyzing
                  ? 'AI正在按您的要求分析图片...'
                  : `按自定义要求分析 ${imageFiles.length} 张图片`}
              </Button>

              {imageFiles.length > 0 && (
                <Button
                  size="large"
                  icon={<ClearOutlined />}
                  onClick={handleClearImages}
                  disabled={analyzing}
                >
                  清除所有图片
                </Button>
              )}
            </Space>

            <div style={{ marginTop: 8 }}>
              {imageFiles.length === 1 && (
                <Text type="warning">请上传至少2张图片进行分析</Text>
              )}
              {imageFiles.length >= 2 && !customPrompt.trim() && (
                <Text type="warning">请输入自定义提示词来指定分析要求</Text>
              )}
            </div>
          </div>

          {result && analysisData && (
            <Card
              title={
                <Space>
                  <EyeOutlined />
                  <span>AI 分析结果</span>
                  <Tag color="green">自定义分析</Tag>
                </Space>
              }
              extra={
                <Space>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={copyToClipboard}
                    title="复制结果"
                  >
                    复制
                  </Button>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={downloadResult}
                    title="下载结果"
                  >
                    下载
                  </Button>
                </Space>
              }
            >
              <Collapse defaultActiveKey={['1']} ghost>
                <Panel
                  header={
                    <Space>
                      <Text strong>分析详情</Text>
                      <Tag color="cyan">{analysisData.imageCount} 张图片</Tag>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {new Date(analysisData.timestamp).toLocaleString()}
                      </Text>
                    </Space>
                  }
                  key="1"
                >
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>图片列表：</Text>
                    <div style={{ marginTop: 8 }}>
                      {analysisData.imageNames.map((name: string, index: number) => (
                        <Tag key={index} style={{ marginBottom: 4 }}>
                          {name}
                        </Tag>
                      ))}
                    </div>
                  </div>

                  <Divider />

                  <div>
                    <Text strong>分析结果：</Text>
                    <Paragraph
                      style={{
                        marginTop: 8,
                        padding: 16,
                        background: '#f9f9f9',
                        borderRadius: 8,
                        border: '1px solid #e8e8e8',
                        lineHeight: 1.8
                      }}
                    >
                      <Text style={{ whiteSpace: 'pre-wrap' }}>
                        {result}
                      </Text>
                    </Paragraph>
                  </div>
                </Panel>
              </Collapse>
            </Card>
          )}
        </Space>
      </div>
    </div>
  );
};

export default ImageAnalysisPage;
