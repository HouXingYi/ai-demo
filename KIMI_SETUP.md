# Kimi AI 多图片分析功能设置指南

## 概述

本项目已集成了 Moonshot AI 的 Kimi 大模型，支持多张图片上传和图片间关系分析功能。

## 功能特性

### 1. 多图片上传支持
- 支持同时上传最多10张图片
- 单个文件大小限制：10MB
- 支持格式：JPG、PNG、GIF等常见图片格式

### 2. 三种分析模式

#### 关系分析 (relationship)
- 分析图片之间的共同点和不同点
- 识别时间序列关系
- 分析空间位置关系
- 发现主题或概念关联
- 比较视觉风格的相似性或差异

#### 对比分析 (comparison)
- 对比图片内容差异
- 质量和清晰度对比
- 构图和视角比较
- 色彩和光线对比
- 使用场景推荐

#### 时序分析 (sequence)
- 识别时间先后顺序
- 分析事件发展过程
- 跟踪状态变化过程
- 识别空间移动轨迹
- 建议最佳排列顺序

## API 配置

### 1. 获取 Kimi API Key

1. 访问 [Kimi 开放平台](https://platform.moonshot.cn/)
2. 注册并登录账户
3. 在"API Key 管理"中创建新的 API Key
4. 复制并保存 API Key

### 2. 环境变量配置

在项目根目录创建 `.env` 文件：

```env
MOONSHOT_API_KEY=你的_Kimi_API_Key
PORT=3001
```

### 3. 支持的模型

当前配置使用：
- **moonshot-v1-vision-preview**: Kimi 视觉预览模型，支持多模态输入

## 技术实现

### 后端 API

**端点**: `POST /api/ai/analyze-multi-images`

**请求参数**:
- `images`: 图片文件数组（multipart/form-data）
- `analysisType`: 分析类型（relationship/comparison/sequence）

**响应格式**:
```json
{
  "success": true,
  "data": {
    "analysis": "AI分析结果文本",
    "imageCount": 3,
    "imageNames": ["image1.jpg", "image2.jpg", "image3.jpg"],
    "analysisType": "relationship",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### 前端实现

- 支持拖拽多文件上传
- 实时显示已选择文件信息
- 三种分析模式选择
- 分析进度指示
- 结果展示和导出

## 使用建议

### 1. 图片质量
- 确保图片清晰，避免模糊或过暗
- 建议分辨率不低于 512x512 像素
- 避免重复或相似度极高的图片

### 2. 分析效果优化
- **关系分析**: 适合主题相关的图片集合
- **对比分析**: 适合需要比较差异的图片对
- **时序分析**: 适合有时间顺序的图片序列

### 3. 数量建议
- 最少2张图片进行分析
- 建议3-6张图片获得最佳分析效果
- 超过8张图片可能影响分析精度

## 成本优化

### API 调用成本
- 输入token: $0.57/百万token
- 输出token: $2.30/百万token
- 图片处理会消耗较多token，建议合理控制使用频率

### 优化建议
1. 适当降低图片分辨率
2. 避免重复分析相同图片组合
3. 选择合适的分析类型减少token消耗

## 故障排除

### 常见问题

1. **API Key 无效**
   - 检查 API Key 是否正确
   - 确认账户余额充足

2. **图片上传失败**
   - 检查文件大小和格式
   - 确认网络连接正常

3. **分析结果为空**
   - 检查图片内容是否清晰
   - 尝试更换分析类型

4. **服务器错误**
   - 检查后端服务是否启动
   - 查看服务器日志排查问题

## 开发者选项

### 本地开发

```bash
# 启动后端服务
npm run dev:backend

# 启动前端服务
npm run dev

# 同时启动前后端
npm run dev:all
```

### API 测试

可以使用 Postman 或 curl 测试 API：

```bash
curl -X POST http://localhost:3001/api/ai/analyze-multi-images \
  -F "images=@image1.jpg" \
  -F "images=@image2.jpg" \
  -F "analysisType=relationship"
```

## 更新日志

- v1.0.0: 基础多图片上传和分析功能
- v1.1.0: 新增三种分析模式
- v1.2.0: 优化UI和用户体验
- v1.3.0: 集成Kimi VL多模态模型

## 参考资源

- [Kimi API 文档](https://platform.moonshot.cn/docs)
- [Kimi VL 技术报告](https://arxiv.org/abs/2504.07491)
- [MIBench 多图片评测](https://arxiv.org/abs/2407.15272)
- [多图片幻觉缓解研究](https://arxiv.org/abs/2508.00726)