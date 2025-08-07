// 启动后端服务的脚本
import { spawn } from 'child_process';
import path from 'path';

const backendPath = path.join(process.cwd(), 'backend');

console.log('🚀 正在启动AI后端服务...');
console.log(`📁 后端目录: ${backendPath}`);

const backend = spawn('npm', ['run', 'dev'], {
  cwd: backendPath,
  stdio: 'inherit',
  shell: true
});

backend.on('error', (error) => {
  console.error('❌ 启动后端服务失败:', error);
});

backend.on('exit', (code) => {
  console.log(`🔄 后端服务退出，代码: ${code}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭后端服务...');
  backend.kill('SIGINT');
  process.exit(0);
});