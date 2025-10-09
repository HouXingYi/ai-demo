// 清理 3001 端口的脚本
import { execSync } from 'child_process';

console.log('🔍 正在查找占用 3001 端口的进程...');

try {
  // 查找占用 3001 端口的进程
  const result = execSync('netstat -ano | findstr :3001', { encoding: 'utf-8' });

  if (result) {
    console.log('找到占用端口的进程：');
    console.log(result);

    // 提取 PID
    const lines = result.trim().split('\n');
    const pids = new Set();

    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid)) {
        pids.add(pid);
      }
    });

    // 关闭所有找到的进程
    pids.forEach(pid => {
      try {
        console.log(`🔪 正在关闭进程 PID: ${pid}`);
        execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8' });
        console.log(`✅ 成功关闭进程 ${pid}`);
      } catch (error) {
        console.log(`⚠️ 无法关闭进程 ${pid}`);
      }
    });

    console.log('✅ 端口 3001 已清理完成！');
  } else {
    console.log('✅ 端口 3001 未被占用');
  }
} catch (error) {
  console.log('✅ 端口 3001 未被占用');
}

