import { WebSocketServer } from 'ws';

// WebSocket连接管理
class ProgressManager {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // sessionId -> WebSocket
  }

  // 初始化WebSocket服务器
  initialize(server) {
    this.wss = new WebSocketServer({ server, path: '/ws/progress' });

    this.wss.on('connection', (ws, req) => {
      console.log('📡 新的WebSocket连接建立');

      // 从查询参数获取sessionId
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('sessionId');

      if (sessionId) {
        this.clients.set(sessionId, ws);
        console.log(`✅ WebSocket客户端注册: ${sessionId}`);

        // 发送连接成功消息
        this.sendToClient(sessionId, {
          type: 'connected',
          message: 'WebSocket连接已建立',
          timestamp: new Date().toISOString()
        });
      }

      ws.on('close', () => {
        if (sessionId) {
          this.clients.delete(sessionId);
          console.log(`🔌 WebSocket客户端断开: ${sessionId}`);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
      });
    });

    console.log('🚀 WebSocket服务器已启动，路径: /ws/progress');
  }

  // 发送进度更新
  sendProgress(sessionId, data) {
    this.sendToClient(sessionId, {
      type: 'progress',
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // 发送批次完成消息
  sendBatchComplete(sessionId, data) {
    this.sendToClient(sessionId, {
      type: 'batch_complete',
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // 发送最终结果
  sendFinalResult(sessionId, data) {
    this.sendToClient(sessionId, {
      type: 'final_result',
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // 发送错误消息
  sendError(sessionId, error) {
    this.sendToClient(sessionId, {
      type: 'error',
      error: error.message || '处理失败',
      timestamp: new Date().toISOString()
    });
  }

  // 通用发送方法
  sendToClient(sessionId, data) {
    const client = this.clients.get(sessionId);
    if (client && client.readyState === 1) { // 1 = OPEN
      try {
        client.send(JSON.stringify(data));
        console.log(`📤 发送消息给 ${sessionId}:`, data.type);
      } catch (error) {
        console.error(`发送消息失败 (${sessionId}):`, error);
      }
    } else {
      console.warn(`⚠️ 客户端未连接或已断开: ${sessionId}`);
    }
  }

  // 关闭特定客户端连接
  closeClient(sessionId) {
    const client = this.clients.get(sessionId);
    if (client) {
      client.close();
      this.clients.delete(sessionId);
      console.log(`🔌 主动关闭客户端连接: ${sessionId}`);
    }
  }

  // 获取当前连接数
  getClientCount() {
    return this.clients.size;
  }
}

// 单例模式
const progressManager = new ProgressManager();
export default progressManager;
