import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 允许外部访问
    open: true, // 自动打开浏览器
    port: 5173, // 指定端口
    fs: {
      allow: ['..'] // 允许访问上级目录
    }
  },
  assetsInclude: ['**/*.webp', '**/*.jpeg', '**/*.png'], // 包含截图文件作为资源
  publicDir: 'public' // 静态资源目录
})
