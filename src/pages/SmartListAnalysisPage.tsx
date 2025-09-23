import { useState } from 'react';
import {
  Button,
  Card,
  Typography,
  Space,
  Input,
  Table,
  Tag,
  notification,
  Select,
  Pagination,
  Tooltip
} from 'antd';
import {
  SearchOutlined,
  BulbOutlined,
  ReloadOutlined,
  EyeOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import BackButton from '../components/common/BackButton';
import listData from '../mock-data/list-data';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// 操作记录数据类型定义
interface ListItem {
  serialNumber: number;
  webpageName: string;
  webpageUrl: string;
  actionEvent: string;
  triggerTime: string;
  screenshotFileName: string;
  downloadUploadFileName: string;
}



const SmartListAnalysisPage: React.FC = () => {
  const [data, setData] = useState<ListItem[]>(listData);
  const [filteredData, setFilteredData] = useState<ListItem[]>(listData);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 计算当前页数据
  const getCurrentPageData = () => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredData.slice(startIndex, endIndex);
  };

  // 表格列定义
  const columns: ColumnsType<ListItem> = [
    {
      title: '序列号',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      width: 120,
      sorter: (a, b) => a.serialNumber - b.serialNumber,
      render: (serialNumber: number) => (
        <Tag color="blue">{serialNumber}</Tag>
      ),
    },
    {
      title: '页面名称',
      dataIndex: 'webpageName',
      key: 'webpageName',
      width: 200,
      render: (text: string) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
        </div>
      ),
    },
    {
      title: '页面URL',
      dataIndex: 'webpageUrl',
      key: 'webpageUrl',
      width: 300,
      render: (url: string) => (
        <Tooltip title={url}>
          <Text
            style={{
              color: '#1890ff',
              cursor: 'pointer',
              maxWidth: '280px',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            onClick={() => window.open(url, '_blank')}
          >
            {url}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '记录时间',
      dataIndex: 'triggerTime',
      key: 'startTime',
      width: 160,
      render: (time: string) => (
        <div>
          <div>{time.split(' ')[0]}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {time.split(' ')[1]}
          </Text>
        </div>
      ),
    },
    {
      title: '截图',
      dataIndex: 'screenshotFileName',
      key: 'screenshot',
      width: 120,
      render: (fileName: string) => (
        fileName ? (
          <Button
            type="link"
            icon={<EyeOutlined />}
            size="small"
            onClick={() => {
              // 这里可以添加查看截图的逻辑
              notification.info({
                message: '截图查看',
                description: `截图文件: ${fileName}`
              });
            }}
          >
            查看
          </Button>
        ) : (
          <Text type="secondary">无</Text>
        )
      ),
    },
    {
      title: '操作',
      dataIndex: 'actionEvent',
      key: 'actionEvent',
      width: 120,
      render: (action: string) => {
        const getActionColor = (action: string) => {
          switch (action) {
            case '访问网页': return 'blue';
            case '点击鼠标左键': return 'green';
            case '键盘输入': return 'orange';
            default: return 'default';
          }
        };
        return (
          <Tag color={getActionColor(action)}>{action}</Tag>
        );
      },
    },
  ];

  // 重新加载数据
  const reloadData = () => {
    setData([...listData]);
    setFilteredData([...listData]);
    setAnalysisResult('');
    setCurrentPage(1);
    notification.success({
      message: '数据已重新加载',
      description: `成功加载 ${listData.length} 条操作记录`,
    });
  };

  // 重置筛选结果
  const resetFilter = () => {
    setFilteredData([...data]);
    setCurrentPage(1);
    notification.info({
      message: '已重置筛选',
      description: '显示所有操作记录',
    });
  };

  // 获取图片文件
  const getImageFile = async (fileName: string): Promise<File | null> => {
    try {
      // 使用public目录中的图片文件
      const imagePath = `/screenshotFile/${fileName}`;
      const response = await fetch(imagePath);

      if (!response.ok) {
        console.error(`无法获取图片: ${imagePath}, 状态: ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      return new File([blob], fileName, { type: blob.type });
    } catch (error) {
      console.error(`获取图片文件失败: ${fileName}`, error);
      return null;
    }
  };

  // 执行AI分析
  const handleAnalyze = async () => {
    console.log('\n=== 前端：开始分析流程 ===');
    console.log('🎯 当前提示词：', prompt);
    console.log('📊 总数据量：', data.length, '条记录');

    if (!prompt.trim()) {
      notification.warning({
        message: '请输入分析提示词',
        description: '请描述您想要分析或筛选的内容',
      });
      return;
    }

    setLoading(true);

    try {
      // 动态获取API基础URL
      const getApiBaseUrl = () => {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return `${protocol}//localhost:3001`;
        }
        return `${protocol}//${hostname}:3001`;
      };

      console.log('API基础URL：', getApiBaseUrl());

      // 筛选有截图的数据记录
      const recordsWithScreenshots = data.filter(record => record.screenshotFileName);
      console.log('📷 有截图的记录数量：', recordsWithScreenshots.length);
      console.log('📋 有截图的记录详情：', recordsWithScreenshots.map(r => ({
        序号: r.serialNumber,
        截图文件: r.screenshotFileName,
        页面: r.webpageName
      })));

      // 构建分析请求
      const analysisPrompt = `
作为一个智能操作记录分析助手，请根据以下操作记录列表、对应的截图图片和用户需求进行综合分析：

用户需求：${prompt}

操作记录数据：
${JSON.stringify(data, null, 2)}

请特别关注有截图的操作记录（共${recordsWithScreenshots.length}条），结合图片内容进行分析。
请根据用户需求提供详细的分析结果，并明确指出哪些记录符合条件，返回对应的serialNumber列表。

分析要求：
1. 结合截图内容理解操作的具体场景
2. 根据用户需求筛选符合条件的操作记录
3. 在分析结果的最后，请用JSON格式返回符合条件的记录的serialNumber列表，格式如下：
   FILTERED_RESULTS: [1, 5, 10, 15]
`;

      if (recordsWithScreenshots.length > 0) {
        // 如果有截图，使用图片分析API
        const formData = new FormData();
        formData.append('customPrompt', analysisPrompt);

        // 收集所有截图文件（限制最多5个文件以配合后端限制）
        const imageFiles = [];
        const maxFiles = 5;
        const recordsToProcess = recordsWithScreenshots.slice(0, maxFiles);
        console.log(`开始处理 ${recordsToProcess.length} 条有截图的记录（最多${maxFiles}个文件）`);

        for (const record of recordsToProcess) {
          console.log(`正在获取图片: ${record.screenshotFileName}`);
          try {
            const imageFile = await getImageFile(record.screenshotFileName);
            if (imageFile) {
              formData.append('images', imageFile);
              imageFiles.push(record.screenshotFileName);
              console.log(`成功获取图片: ${record.screenshotFileName}, 大小: ${imageFile.size} bytes`);
            } else {
              console.warn(`无法获取图片: ${record.screenshotFileName}`);
            }
          } catch (error) {
            console.error(`获取图片时出错: ${record.screenshotFileName}`, error);
          }
        }

        console.log(`总共成功获取 ${imageFiles.length} 张图片`);

        if (imageFiles.length > 0) {
          console.log(`🚀 发送请求到: ${getApiBaseUrl()}/api/ai/analyze-multi-images`);
          console.log(`📦 FormData包含: ${imageFiles.length} 个图片文件`);

          const response = await fetch(`${getApiBaseUrl()}/api/ai/analyze-multi-images`, {
            method: 'POST',
            body: formData,
          });

          console.log(`📡 请求响应状态: ${response.status} ${response.statusText}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`API错误响应:`, errorText);
            console.error(`响应状态: ${response.status} ${response.statusText}`);
            console.error(`请求URL: ${getApiBaseUrl()}/api/ai/analyze-multi-images`);
            throw new Error(`HTTP错误: ${response.status} - ${errorText}`);
          }

          const result = await response.json();
          console.log('📄 收到API响应:', result);

          if (result.success) {
            const analysisText = result.data.analysis;
            console.log('✅ 分析成功！');
            console.log('📝 分析结果长度:', analysisText.length);
            console.log('📋 分析结果预览:', analysisText.substring(0, 300) + '...');

            setAnalysisResult(analysisText);

            // 尝试提取筛选结果
            const filteredMatch = analysisText.match(/FILTERED_RESULTS:\s*\[([\d,\s]*)\]/);
            if (filteredMatch) {
              console.log('🎯 找到筛选结果:', filteredMatch[1]);
              const filteredNumbers = filteredMatch[1]
                .split(',')
                .map((n: string) => parseInt(n.trim()))
                .filter((n: number) => !isNaN(n));

              console.log('🔢 筛选的序号:', filteredNumbers);

              // 根据筛选结果更新显示的数据
              const filteredRecords = data.filter(record =>
                filteredNumbers.includes(record.serialNumber)
              );
              console.log('📊 筛选后的记录数量:', filteredRecords.length);
              setFilteredData(filteredRecords);
            } else {
              console.log('⚠️ 未找到筛选结果标记，显示所有数据');
            }

            setCurrentPage(1);
            notification.success({
              message: '分析完成',
              description: `AI已完成操作记录分析，共分析了${imageFiles.length}张截图`,
            });
          } else {
            throw new Error(result.error || '图片分析失败');
          }
        } else {
          throw new Error('无法加载截图文件');
        }
      } else {
        // 如果没有截图，使用文本分析API
        const response = await fetch(`${getApiBaseUrl()}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: analysisPrompt,
            systemPrompt: '你是一个专业的操作记录分析助手，擅长根据用户需求分析和筛选操作记录数据。请提供准确、详细的分析结果。',
            stream: false
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
          setAnalysisResult(result.data.message);
          setCurrentPage(1);

          notification.success({
            message: '分析完成',
            description: 'AI已完成操作记录分析',
          });
        } else {
          throw new Error(result.error || '分析失败');
        }
      }
    } catch (error) {
      console.error('\n❌ 前端：AI分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : '无法连接到AI服务';
      console.error('❌ 错误详情:', errorMessage);

      notification.error({
        message: '分析失败',
        description: errorMessage,
      });
      setAnalysisResult(`分析失败: ${errorMessage}`);
    } finally {
      setLoading(false);
      console.log('=== 前端：分析流程结束 ===\n');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '20px' }}>
      <BackButton />

      <div style={{ maxWidth: 1400, margin: '0 auto', paddingTop: 80 }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 24 }}>
          <BulbOutlined /> 智能操作记录分析
        </Title>

        {/* 分析控制面板 */}
        <Card style={{ marginBottom: 24 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleAnalyze}
                loading={loading}
                size="large"
              >
                开始分析
              </Button>

              <Button
                onClick={resetFilter}
                size="large"
                disabled={filteredData.length === data.length}
              >
                重置筛选
              </Button>

              <Button
                icon={<ReloadOutlined />}
                onClick={reloadData}
                size="large"
              >
                重新加载
              </Button>
            </div>

            <div>
              <Text strong>分析提示词:</Text>
              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：筛选出访问亚马逊网站的操作记录，或者分析点击操作的频率..."
                rows={3}
                style={{ marginTop: 8 }}
              />
            </div>

            {/* 分析结果 */}
            {analysisResult && (
              <Card size="small" style={{ background: '#f9f9f9' }}>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <Text strong style={{ color: '#1890ff' }}>分析结果：</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0 0' }}>
                    {analysisResult}
                  </Paragraph>
                </div>
              </Card>
            )}
          </Space>
        </Card>

        {/* 数据列表 */}
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong>商品列表</Text>
              <Tag color="blue">{filteredData.length} 件商品</Tag>
            </Space>
            <Space>
              <Text>每页显示:</Text>
              <Select
                value={pageSize}
                onChange={(value) => {
                  setPageSize(value);
                  setCurrentPage(1);
                }}
                style={{ width: 80 }}
              >
                <Option value={5}>5</Option>
                <Option value={10}>10</Option>
                <Option value={20}>20</Option>
                <Option value={50}>50</Option>
              </Select>
            </Space>
          </div>

          <Table
            columns={columns}
            dataSource={getCurrentPageData()}
            rowKey="serialNumber"
            pagination={false}
            size="middle"
            scroll={{ x: 1000 }}
          />

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredData.length}
              onChange={(page) => setCurrentPage(page)}
              showSizeChanger={false}
              showQuickJumper
              showTotal={(total, range) =>
                `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
              }
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SmartListAnalysisPage;