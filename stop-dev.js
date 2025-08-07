// 停止开发服务的脚本
import { spawn } from 'child_process';

console.log('🛑 正在停止开发服务...');

// 停止占用3001端口的进程
const stopBackend = spawn('cmd', ['/c', 'for /f "tokens=5" %a in (\'netstat -aon ^| findstr :3001\') do taskkill /f /pid %a'], {
  stdio: 'inherit',
  shell: true
});

// 停止占用5173端口的进程  
const stopFrontend = spawn('cmd', ['/c', 'for /f "tokens=5" %a in (\'netstat -aon ^| findstr :5173\') do taskkill /f /pid %a'], {
  stdio: 'inherit',
  shell: true
});

stopBackend.on('exit', () => {
  console.log('✅ 后端服务已停止');
});

stopFrontend.on('exit', () => {
  console.log('✅ 前端服务已停止');
});