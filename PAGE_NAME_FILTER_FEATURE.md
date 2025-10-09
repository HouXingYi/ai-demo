# 页面名称筛选功能

## 📋 功能说明

添加了页面名称筛选功能，可以在AI搜索前先按页面名称过滤数据，减少处理的记录数量，提高效率。

## ✨ 功能特点

### 1. 两级筛选机制
- **第一级：页面名称筛选**（基础筛选）
  - 用户手动选择页面名称
  - 筛选结果保存在 `baseFilteredData`
  - 这个筛选会持久保持，直到用户清除

- **第二级：AI智能筛选**
  - 基于第一级筛选结果进行AI分析
  - 筛选结果保存在 `filteredData`
  - 可以单独重置，不影响页面名称筛选

### 2. 数据流转

```
原始数据 (data)
    ↓
页面名称筛选
    ↓
基础筛选数据 (baseFilteredData) ← 传给后端AI分析
    ↓
AI智能筛选
    ↓
最终显示数据 (filteredData) ← 表格显示
```

## 🎯 使用场景

### 场景1：分析特定页面的操作
```
1. 选择页面名称：Manage Your Inventory
2. 筛选结果：从150条记录缩减到22条
3. 输入AI搜索词：查找价格为34.89的记录
4. AI只分析这22条记录，速度更快
```

### 场景2：多次搜索同一页面
```
1. 选择页面名称：Manage Your Inventory（22条记录）
2. 第一次搜索：查找价格为34.89的记录
3. 重置AI筛选（保留页面名称筛选）
4. 第二次搜索：查找点击操作的记录
5. 仍然只在这22条记录中搜索
```

## 🔧 技术实现

### 状态管理
```typescript
// 原始数据（不变）
const [data, setData] = useState<ListItem[]>(listData);

// 页面名称筛选
const [pageNameFilter, setPageNameFilter] = useState<string>('');

// 基础筛选后的数据（页面名称筛选结果）
const [baseFilteredData, setBaseFilteredData] = useState<ListItem[]>(listData);

// 最终显示的数据（AI筛选结果）
const [filteredData, setFilteredData] = useState<ListItem[]>(listData);
```

### 核心函数

#### 1. 获取唯一页面名称
```typescript
const getUniquePageNames = () => {
  const pageNames = new Set(data.map(item => item.webpageName));
  return Array.from(pageNames).sort();
};
```

#### 2. 页面名称筛选处理
```typescript
const handlePageNameFilter = (value: string) => {
  setPageNameFilter(value);
  if (value) {
    const filtered = data.filter(item => item.webpageName === value);
    setBaseFilteredData(filtered);
    setFilteredData(filtered);
  } else {
    setBaseFilteredData([...data]);
    setFilteredData([...data]);
  }
  setCurrentPage(1);
};
```

#### 3. 重置AI筛选（保留页面名称筛选）
```typescript
const resetFilter = () => {
  setFilteredData([...baseFilteredData]);
  setCurrentPage(1);
  notification.info({
    message: '已重置AI筛选',
    description: pageNameFilter ? `保留页面名称筛选: ${pageNameFilter}` : '显示所有操作记录',
  });
};
```

#### 4. 清除所有筛选
```typescript
const clearAllFilters = () => {
  setPageNameFilter('');
  setBaseFilteredData([...data]);
  setFilteredData([...data]);
  setCurrentPage(1);
  notification.info({
    message: '已清除所有筛选',
    description: '显示所有操作记录',
  });
};
```

### AI分析时使用基础筛选数据
```typescript
// 使用 baseFilteredData 而不是 data
const allRecordsData = baseFilteredData.map(record => ({
  serialNumber: record.serialNumber,
  webpageName: record.webpageName,
  // ...
}));
```

### AI返回结果时也使用基础筛选数据
```typescript
// 在 baseFilteredData 中查找AI返回的序列号
const filteredRecords = baseFilteredData.filter(record =>
  message.filteredResults.includes(record.serialNumber)
);
```

## 🎨 UI组件

### 页面名称筛选下拉框
```tsx
<Select
  style={{ width: 300 }}
  placeholder="选择页面名称进行筛选"
  value={pageNameFilter || undefined}
  onChange={handlePageNameFilter}
  allowClear
  showSearch
  filterOption={(input, option) =>
    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
  }
  options={getUniquePageNames().map(name => ({
    label: name,
    value: name
  }))}
/>
```

### 筛选状态标签
```tsx
{pageNameFilter && (
  <Tag color="blue">
    已筛选: {baseFilteredData.length} 条记录
  </Tag>
)}
```

### 按钮组
```tsx
<Button onClick={resetFilter}>重置AI筛选</Button>
{pageNameFilter && (
  <Button onClick={clearAllFilters}>清除所有筛选</Button>
)}
```

## 📊 性能优势

### 示例：150条记录 → 22条记录

| 指标 | 无页面筛选 | 有页面筛选 | 提升 |
|------|-----------|-----------|------|
| 记录数 | 150条 | 22条 | -85% |
| 批次数（10条/批） | 15批 | 3批 | -80% |
| 预计耗时 | ~30秒 | ~6秒 | -80% |
| Token消耗 | 高 | 低 | -85% |

## 🔍 使用示例

### 示例1：筛选特定页面
```
1. 打开页面
2. 点击"页面名称筛选"下拉框
3. 搜索或选择"Manage Your Inventory"
4. 看到标签显示"已筛选: 22 条记录"
5. 输入搜索提示词："查找价格为34.89的记录"
6. 点击"开始搜索"
7. AI只分析这22条记录
```

### 示例2：多次搜索
```
1. 选择页面名称筛选（22条记录）
2. 第一次搜索：查找价格相关
3. 查看结果（5条）
4. 点击"重置AI筛选"（回到22条）
5. 第二次搜索：查找点击操作
6. 查看结果（8条）
7. 页面名称筛选始终保持
```

### 示例3：清除筛选
```
1. 当前状态：页面筛选（22条）+ AI筛选（5条）
2. 点击"重置AI筛选" → 回到22条（保留页面筛选）
3. 点击"清除所有筛选" → 回到150条（清除所有）
```

## ⚠️ 注意事项

1. **页面名称筛选会影响AI分析**
   - AI只会分析 `baseFilteredData` 中的记录
   - 不在筛选范围内的记录不会被AI看到

2. **按钮状态**
   - "重置AI筛选"：只在AI筛选后才启用
   - "清除所有筛选"：只在有页面名称筛选时才显示

3. **数据一致性**
   - 所有操作都基于 `baseFilteredData`
   - 确保AI分析和结果显示使用相同的数据源

## 🎯 未来优化方向

1. **多条件筛选**
   - 添加操作类型筛选
   - 添加时间范围筛选
   - 添加是否有截图筛选

2. **筛选历史**
   - 保存常用筛选条件
   - 快速切换筛选方案

3. **筛选统计**
   - 显示每个页面的记录数量
   - 显示筛选前后的对比

---

**更新日期**：2025-10-09  
**版本**：v1.0 - 页面名称筛选功能

