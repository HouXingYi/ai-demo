import { useState, useEffect, useRef } from 'react';
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
  Tooltip,
  Modal,
  Image,
  Spin,
  Progress,
  Alert
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
// import BackButton from '../components/common/BackButton';
import listData from '../mock-data/list-data-inventory';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;
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

  // 批处理进度状态
  const [batchProgress, setBatchProgress] = useState({
    current: 0,
    total: 0,
    totalRecords: 0, // 总记录数
    status: '' as 'processing' | 'success' | 'error' | '',
    message: '',
    batchResults: [] as string[], // 存储每批次的分析结果
  });

  // WebSocket相关状态和引用
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>('');

  // 图片预览相关状态
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(false);

  // WebSocket连接管理
  const connectWebSocket = (sessionId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const port = hostname === 'localhost' || hostname === '127.0.0.1' ? '3001' : window.location.port;
    const wsUrl = `${protocol}//${hostname}:${port}/ws/progress?sessionId=${sessionId}`;

    console.log('🔌 连接WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket连接成功');
      // WebSocket已连接
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 收到WebSocket消息:', message);

        switch (message.type) {
          case 'connected':
            console.log('✅ WebSocket已连接');
            break;

          case 'progress':
            setBatchProgress(prev => ({
              ...prev,
              current: message.current || 0,
              total: message.total || 0,
              totalRecords: message.totalRecords || 0,
              status: 'processing',
              message: message.message || '处理中...'
            }));
            break;

          case 'batch_complete':
            console.log(`✅ 第 ${message.batchIndex} 批完成`, message);
            setBatchProgress(prev => ({
              ...prev,
              current: message.current || 0,
              total: message.total || 0,
              status: 'processing',
              message: message.message || '',
              batchResults: [...prev.batchResults, message.batchAnalysis || '']
            }));
            // 实时显示中间结果，添加批次标题
            if (message.batchAnalysis) {
              const batchHeader = `\n\n========== 第 ${message.batchIndex}/${message.total} 批次分析结果 ==========\n`;
              setAnalysisResult(prev => prev + batchHeader + message.batchAnalysis);
            }
            break;

          case 'final_result':
            console.log('🎉 所有批次完成！', message);
            console.log('📥 前端收到的filteredResults:', message.filteredResults);
            console.log('📥 filteredResults类型:', Array.isArray(message.filteredResults) ? 'Array' : typeof message.filteredResults);
            console.log('📥 filteredResults长度:', message.filteredResults?.length);
            console.log('📥 matchedCount:', message.matchedCount);

            setBatchProgress(prev => ({
              ...prev,
              current: message.totalBatches || 0,
              total: message.totalBatches || 0,
              status: 'success',
              message: message.message || '完成！'
            }));
            // 追加最终总结，不清空之前的内容
            const finalSummary = `\n\n========== 🎉 最终汇总结果 ==========\n经过分析，在 ${message.totalRecords || 0} 条记录中，找到 ${message.matchedCount || 0} 条符合条件的记录。\n\n符合条件的序列号：${message.filteredResults?.join('、') || '无'}\n\n处理时间：${message.processingTime || '未知'}`;
            setAnalysisResult(prev => prev + finalSummary);

            // 提取筛选结果并更新列表
            console.log('🔍 开始筛选数据...');
            console.log('  - 当前data长度:', data.length);
            console.log('  - filteredResults:', message.filteredResults);

            if (message.filteredResults && message.filteredResults.length > 0) {
              const filteredRecords = data.filter(record =>
                message.filteredResults.includes(record.serialNumber)
              );
              console.log('  - 筛选后记录数:', filteredRecords.length);
              console.log('  - 筛选后的记录:', filteredRecords.map(r => r.serialNumber));
              setFilteredData(filteredRecords);
              setCurrentPage(1);
            } else {
              console.log('  ⚠️ filteredResults为空或不存在，不更新筛选');
            }

            notification.success({
              message: '分析完成',
              // description: `成功分析了${message.totalImages}张图片，耗时${Math.round(message.totalTime / 1000)}秒`,
            });
            break;

          case 'error':
            console.error('❌ WebSocket错误消息:', message);
            setBatchProgress(prev => ({
              ...prev,
              status: 'error',
              message: message.error || '处理失败'
            }));
            notification.error({
              message: '处理失败',
              description: message.error || '未知错误',
            });
            break;
        }
      } catch (error) {
        console.error('解析WebSocket消息失败:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket错误:', error);
      // WebSocket已断开
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket连接关闭');
      // WebSocket已断开
    };

    wsRef.current = ws;
    return ws;
  };

  // 组件卸载时关闭WebSocket
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // 计算当前页数据
  const getCurrentPageData = () => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredData.slice(startIndex, endIndex);
  };

  // 处理图片预览
  const handleImagePreview = async (fileName: string, recordInfo: ListItem) => {
    if (!fileName) {
      notification.warning({
        message: '无截图',
        description: '该记录没有对应的截图文件',
      });
      return;
    }

    setImageLoading(true);
    setPreviewTitle(`${recordInfo.webpageName} - ${recordInfo.triggerTime}`);

    try {
      // 构建图片路径
      const imagePath = `/screenshotFile/${fileName}`;

      // 预加载图片以检查是否存在
      const img = new window.Image();
      img.onload = () => {
        setPreviewImage(imagePath);
        setPreviewVisible(true);
        setImageLoading(false);
        console.log(`✅ 成功加载图片: ${fileName}`);
      };

      img.onerror = () => {
        setImageLoading(false);
        notification.error({
          message: '图片加载失败',
          description: `无法加载截图文件: ${fileName}`,
        });
        console.error(`❌ 图片加载失败: ${fileName}`);
      };

      img.src = imagePath;
    } catch (error) {
      setImageLoading(false);
      notification.error({
        message: '预览失败',
        description: '图片预览功能出现错误',
      });
      console.error('图片预览错误:', error);
    }
  };

  // 关闭图片预览
  const handlePreviewClose = () => {
    setPreviewVisible(false);
    setPreviewImage('');
    setPreviewTitle('');
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
      render: (fileName: string, record: ListItem) => (
        fileName ? (
          <Button
            type="link"
            icon={<EyeOutlined />}
            size="small"
            loading={imageLoading}
            onClick={() => handleImagePreview(fileName, record)}
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
    setPrompt(''); // 清空搜索词
    setCurrentPage(1);
    notification.success({
      message: '数据已重新加载',
      description: `成功加载 ${listData.length} 条操作记录，搜索词已清空`,
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

  // 获取图片文件（增强版 - 支持图片验证和重试）
  const getImageFile = async (fileName: string, retryCount = 0): Promise<File | null> => {
    const maxRetries = 2;

    try {
      console.log(`🔄 获取图片文件: ${fileName} (尝试 ${retryCount + 1}/${maxRetries + 1})`);

      // 使用public目录中的图片文件
      const imagePath = `/screenshotFile/${fileName}`;
      const response = await fetch(imagePath, {
        cache: 'no-cache', // 避免缓存问题
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        console.error(`❌ 无法获取图片: ${imagePath}, 状态: ${response.status}`);

        // 如果是404错误且还有重试次数，尝试重试
        if (response.status === 404 && retryCount < maxRetries) {
          console.log(`⏳ 图片未找到，${500}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          return getImageFile(fileName, retryCount + 1);
        }

        return null;
      }

      const blob = await response.blob();

      // 验证文件大小
      if (blob.size === 0) {
        console.error(`❌ 图片文件为空: ${fileName}`);

        // 如果文件为空且还有重试次数，尝试重试
        if (retryCount < maxRetries) {
          console.log(`⏳ 文件为空，${500}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, 500));
          return getImageFile(fileName, retryCount + 1);
        }

        return null;
      }

      // 验证MIME类型（宽松处理）
      const validTypes = ['image/webp', 'image/jpeg', 'image/jpg', 'image/png', 'application/octet-stream'];
      if (!validTypes.includes(blob.type)) {
        console.warn(`⚠️ 图片类型可能不正确: ${fileName}, 类型: ${blob.type}, 但继续处理`);
      }

      // 尝试验证图片文件头（宽松处理）
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // 检查常见的图片文件头
        const isValidImage = validateImageHeader(uint8Array, fileName);
        if (!isValidImage) {
          console.warn(`⚠️ 图片文件头验证失败: ${fileName}, 但继续处理`);
          // 不再直接返回null，而是继续处理
        }
      } catch (validationError) {
        console.warn(`⚠️ 图片验证过程出错: ${fileName}`, validationError);
        // 验证出错也继续处理
      }

      console.log(`✅ 图片获取成功: ${fileName}, 大小: ${blob.size} bytes, 类型: ${blob.type}`);

      // 确保返回正确的MIME类型
      let mimeType = blob.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        // 根据文件扩展名推断MIME类型
        if (fileName.toLowerCase().endsWith('.webp')) {
          mimeType = 'image/webp';
        } else if (fileName.toLowerCase().endsWith('.jpeg') || fileName.toLowerCase().endsWith('.jpg')) {
          mimeType = 'image/jpeg';
        } else if (fileName.toLowerCase().endsWith('.png')) {
          mimeType = 'image/png';
        }
      }

      return new File([blob], fileName, { type: mimeType });
    } catch (error) {
      console.error(`❌ 获取图片文件失败: ${fileName}`, error);

      // 如果还有重试次数，尝试重试
      if (retryCount < maxRetries) {
        console.log(`⏳ 发生错误，${1000}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getImageFile(fileName, retryCount + 1);
      }

      return null;
    }
  };

  // 验证图片文件头（改进版 - 更宽松的验证）
  const validateImageHeader = (uint8Array: Uint8Array, fileName: string): boolean => {
    try {
      if (uint8Array.length < 4) {
        console.warn(`⚠️ 图片文件太小: ${fileName}, 大小: ${uint8Array.length} bytes`);
        return false;
      }

      // WebP文件头: RIFF....WEBP
      if (fileName.toLowerCase().endsWith('.webp')) {
        // 检查文件是否足够长
        if (uint8Array.length < 12) {
          console.warn(`⚠️ WebP文件头不完整: ${fileName}, 大小: ${uint8Array.length} bytes`);
          return false;
        }

        try {
          const riffHeader = uint8Array.slice(0, 4);
          const webpHeader = uint8Array.slice(8, 12);
          const isRIFF = String.fromCharCode(...riffHeader) === 'RIFF';
          const isWEBP = String.fromCharCode(...webpHeader) === 'WEBP';

          if (!isRIFF || !isWEBP) {
            console.warn(`⚠️ WebP文件头验证失败: ${fileName}, RIFF: ${isRIFF}, WEBP: ${isWEBP}`);
            // 对于WebP文件，如果验证失败，我们仍然尝试处理，因为可能是文件格式的变体
            return true; // 改为宽松验证
          }

          return true;
        } catch (headerError) {
          console.warn(`⚠️ WebP文件头解析错误: ${fileName}`, headerError);
          return true; // 宽松处理，允许继续
        }
      }

      // JPEG文件头: FF D8 FF
      if (fileName.toLowerCase().endsWith('.jpeg') || fileName.toLowerCase().endsWith('.jpg')) {
        const isJPEG = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8 && uint8Array[2] === 0xFF;
        if (!isJPEG) {
          console.warn(`⚠️ JPEG文件头验证失败: ${fileName}`);
        }
        return isJPEG;
      }

      // PNG文件头: 89 50 4E 47
      if (fileName.toLowerCase().endsWith('.png')) {
        const isPNG = uint8Array[0] === 0x89 && uint8Array[1] === 0x50 &&
          uint8Array[2] === 0x4E && uint8Array[3] === 0x47;
        if (!isPNG) {
          console.warn(`⚠️ PNG文件头验证失败: ${fileName}`);
        }
        return isPNG;
      }

      // 对于其他格式，直接返回true
      console.log(`✅ 跳过文件头验证: ${fileName} (未知格式)`);
      return true;
    } catch (error) {
      console.error(`❌ 图片文件头验证异常: ${fileName}`, error);
      return true; // 发生异常时，宽松处理
    }
  };

  // 执行AI分析
  const handleAnalyze = async () => {
    console.log('\n=== 前端：开始分析流程 ===');
    console.log('🎯 当前提示词：', prompt);
    console.log('📊 总数据量：', data.length, '条记录');
    console.log('📋 分析前筛选状态：', filteredData.length, '条记录');

    if (!prompt.trim()) {
      notification.warning({
        message: '请输入搜索提示词',
        description: '请描述您想要搜索或筛选的内容',
      });
      return;
    }

    setLoading(true);

    // 生成唯一的sessionId
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    sessionIdRef.current = sessionId;

    // 连接WebSocket
    connectWebSocket(sessionId);

    // 重置进度状态
    setBatchProgress({
      current: 0,
      total: 0,
      totalRecords: 0,
      status: 'processing',
      message: '正在连接...',
      batchResults: [],
    });

    // 清空之前的分析结果
    setAnalysisResult('');

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

      // 🎯 新逻辑：准备所有记录数据（包括有图和没图的）
      const allRecordsData = data.map(record => ({
        serialNumber: record.serialNumber,
        webpageName: record.webpageName,
        webpageUrl: record.webpageUrl,
        actionEvent: record.actionEvent,
        triggerTime: record.triggerTime,
        screenshotFileName: record.screenshotFileName || '',
        hasImage: !!record.screenshotFileName, // 标记是否有图片
      }));

      const recordsWithScreenshots = allRecordsData.filter(r => r.hasImage);
      const recordsWithoutScreenshots = allRecordsData.filter(r => !r.hasImage);

      console.log('📊 记录统计：');
      console.log(`  - 总记录数：${allRecordsData.length}`);
      console.log(`  - 有截图：${recordsWithScreenshots.length} 条`);
      console.log(`  - 无截图：${recordsWithoutScreenshots.length} 条`);

      // 构建简洁的用户需求提示
      const analysisPrompt = prompt;

      if (allRecordsData.length > 0) {
        // 如果有截图，使用图片分析API
        const formData = new FormData();
        formData.append('customPrompt', analysisPrompt);

        // 🎯 发送所有记录数据（新逻辑）
        formData.append('allRecords', JSON.stringify(allRecordsData));

        // 收集有截图的记录的图片文件
        const imageFiles = [];

        console.log(`📋 准备发送 ${allRecordsData.length} 条记录数据`);
        console.log(`📷 准备获取 ${recordsWithScreenshots.length} 张截图图片`);

        // 分批获取图片文件，显示进度
        let processedCount = 0;
        let successCount = 0;
        const failedFiles: string[] = [];

        for (const record of recordsWithScreenshots) {
          console.log(`正在获取图片: ${record.screenshotFileName} (${processedCount + 1}/${recordsWithScreenshots.length})`);
          try {
            const imageFile = await getImageFile(record.screenshotFileName);
            if (imageFile) {
              formData.append('images', imageFile);
              imageFiles.push(record.screenshotFileName);
              successCount++;
              console.log(`✅ 成功获取图片: ${record.screenshotFileName}, 序列号: ${record.serialNumber}, 大小: ${imageFile.size} bytes`);
            } else {
              failedFiles.push(record.screenshotFileName);
              console.warn(`⚠️ 无法获取图片: ${record.screenshotFileName}`);
            }
          } catch (error) {
            failedFiles.push(record.screenshotFileName);
            console.error(`❌ 获取图片时出错: ${record.screenshotFileName}`, error);
          }

          processedCount++;
          console.log(`📈 获取进度: ${processedCount}/${recordsWithScreenshots.length} (${Math.round(processedCount / recordsWithScreenshots.length * 100)}%) - 成功: ${successCount}, 失败: ${failedFiles.length}`);

          // 添加短暂延迟，避免过快的文件访问
          if (processedCount % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // 显示详细的处理结果统计
        console.log(`📊 数据准备完成统计:`);
        console.log(`  📋 发送记录总数: ${allRecordsData.length} 条`);
        console.log(`  📷 有截图记录: ${recordsWithScreenshots.length} 条`);
        console.log(`  ✅ 成功获取图片: ${successCount} 张`);
        console.log(`  ❌ 失败或无效: ${failedFiles.length} 张`);
        if (failedFiles.length > 0) {
          console.log(`  📋 失败文件列表:`, failedFiles);
        }

        // 发送sessionId用于WebSocket通信
        formData.append('sessionId', sessionId);

        console.log(`\n=== 前端：发送给后端的请求数据 ===`);
        console.log(`🔗 请求URL: ${getApiBaseUrl()}/api/ai/analyze-multi-images`);
        console.log(`📋 记录总数: ${allRecordsData.length} 条`);
        console.log(`📷 图片文件数量: ${imageFiles.length} 张`);
        console.log(`🔑 Session ID: ${sessionId}`);
        console.log(`📝 用户需求: ${analysisPrompt}`);

        if (allRecordsData.length > 0) {
          console.log('=== 前端请求数据结束 ===\n');

          console.log('formData', formData);

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

            // 特殊处理并发请求错误
            if (response.status === 429) {
              throw new Error('服务器正在处理其他请求，请稍后重试');
            }

            throw new Error(`HTTP错误: ${response.status} - ${errorText}`);
          }

          const result = await response.json();

          // 打印详细的响应数据
          console.log('\n=== 前端：收到后端响应数据 ===');
          console.log('📊 响应统计:');
          console.log(`  - HTTP状态: ${response.status} ${response.statusText}`);
          console.log(`  - 响应类型: ${typeof result}`);
          console.log(`  - 成功状态: ${result.success}`);
          console.log('📄 响应内容:');
          if (result.success && result.data) {
            console.log(`  - 分析结果长度: ${result.data.analysis ? result.data.analysis.length : 0} 字符`);
            console.log(`  - 处理图片数量: ${result.data.imageCount || 'N/A'}`);
            console.log(`  - 使用框架: ${result.data.framework || 'N/A'}`);
            console.log(`  - 时间戳: ${result.data.timestamp || 'N/A'}`);
            console.log(`  - 图片文件名: ${result.data.imageNames ? result.data.imageNames.slice(0, 5).join(', ') + (result.data.imageNames.length > 5 ? '...' : '') : 'N/A'}`);
            console.log(`  - 分析结果预览: "${result.data.analysis ? result.data.analysis.substring(0, 200) + '...' : '无内容'}"`);
          } else {
            console.log(`  - 错误信息: ${result.error || 'N/A'}`);
          }
          console.log('=== 前端响应数据结束 ===\n');

          if (result.success) {
            console.log('✅ HTTP请求成功！WebSocket已接收完整分析结果');
            // 注意：实际的分析结果、进度更新和筛选结果都通过WebSocket实时推送
            // 这里的HTTP响应只是确认后端已开始处理
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
          const analysisText = result.data.message;
          setAnalysisResult(analysisText);

          console.log('📄 文本分析结果:', analysisText);

          // 提取筛选结果（新格式：##RESULTS##）
          const filteredMatch = analysisText.match(/##RESULTS##\s*\[([\d,\s]*)\]/);

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
            console.log('⚠️ 文本分析未找到筛选结果标记，显示所有数据');
            // 如果没有找到筛选结果，保持显示所有数据
            setFilteredData([...data]);
          }

          // 强制刷新表格状态
          setCurrentPage(1);
          console.log('🔄 文本分析表格状态已更新，当前页面重置为第1页');

          notification.success({
            message: '搜索完成',
            description: 'AI已完成操作记录搜索',
          });
        } else {
          throw new Error(result.error || '分析失败');
        }
      }
    } catch (error) {
      console.error('\n❌ 前端：AI分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : '无法连接到AI服务';
      console.error('❌ 错误详情:', errorMessage);

      // 更新进度为错误状态
      setBatchProgress(prev => ({
        ...prev,
        status: 'error',
      }));

      notification.error({
        message: '搜索失败',
        description: errorMessage,
      });
      setAnalysisResult(`搜索失败: ${errorMessage}`);
    } finally {
      setLoading(false);
      console.log('=== 前端：分析流程结束 ===\n');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '20px' }}>
      {/* <BackButton /> */}

      <div style={{ maxWidth: 1400, margin: '0 auto', paddingTop: 80 }}>

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
                开始搜索
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
              <Text strong>搜索提示词:</Text>
              <TextArea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onPressEnter={(e) => {
                  // Ctrl+Enter 或 Shift+Enter 开始搜索
                  if (e.ctrlKey || e.shiftKey) {
                    e.preventDefault();
                    handleAnalyze();
                  }
                }}
                placeholder="例如：筛选出访问亚马逊网站的操作记录，或者分析点击操作的频率... (按Ctrl+回车或Shift+回车开始搜索)"
                rows={3}
                style={{ marginTop: 8 }}
              />
            </div>

            {/* WebSocket实时进度显示 */}
            {loading && batchProgress.total > 0 && (
              <Alert
                message={
                  <div>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Text strong>正在实时分析记录...</Text>
                      </div>
                      <Text type="secondary">
                        批次 {batchProgress.current}/{batchProgress.total}
                      </Text>
                    </div>
                    <Progress
                      percent={batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}
                      status={
                        batchProgress.status === 'error' ? 'exception' :
                          batchProgress.status === 'success' ? 'success' :
                            'active'
                      }
                      strokeColor={{
                        '0%': '#108ee9',
                        '100%': '#87d068',
                      }}
                    />
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      <Space split="|" style={{ width: '100%', justifyContent: 'space-between' }}>
                        <span>📋 总共 {batchProgress.totalRecords} 条记录</span>
                        <span>📦 每批10条 (每图1024 tokens)</span>
                        <span style={{ color: '#1890ff' }}>✨ {batchProgress.message || '处理中...'}</span>
                      </Space>
                    </div>
                  </div>
                }
                type={batchProgress.status === 'success' ? 'success' : 'info'}
                showIcon
              />
            )}

            {/* 分析结果（实时更新，支持长内容） */}
            {analysisResult && (
              <Card
                size="small"
                style={{ background: '#f9f9f9' }}
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong style={{ color: '#1890ff' }}>搜索结果（实时更新）：</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {analysisResult.length} 字符
                    </Text>
                  </div>
                }
              >
                <div style={{
                  maxHeight: '70vh',
                  minHeight: 400,
                  overflowY: 'auto',
                  padding: '12px',
                  border: '1px solid #f0f0f0',
                  borderRadius: '4px',
                  backgroundColor: '#ffffff'
                }}>
                  <Paragraph style={{
                    whiteSpace: 'pre-wrap',
                    margin: '0',
                    fontSize: '14px',
                    lineHeight: '1.8'
                  }}>
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
              <Text strong>记录列表</Text>
              <Tag color="blue">{filteredData.length} 条记录</Tag>
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

      {/* 图片预览Modal */}
      <Modal
        title={previewTitle}
        open={previewVisible}
        onCancel={handlePreviewClose}
        footer={null}
        width="90vw"
        style={{ maxWidth: '1400px' }}
        centered
        destroyOnClose
        maskClosable={true}
        keyboard={true}
      >
        {imageLoading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>正在加载图片...</div>
          </div>
        ) : (
          previewImage && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '60vh',
              maxHeight: '80vh',
              overflow: 'auto'
            }}>
              <Image
                src={previewImage}
                alt="截图预览"
                style={{
                  maxWidth: '100%',
                  maxHeight: '80vh',
                  objectFit: 'contain',
                  cursor: 'zoom-in'
                }}
                preview={{
                  mask: <div style={{ color: 'white' }}>点击放大查看</div>
                }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3Ik1RnG4W+FgYxN"
              />
            </div>
          )
        )}
      </Modal>
    </div>
  );
};

export default SmartListAnalysisPage;