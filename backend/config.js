// 配置文件
export const config = {
  // AI API配置
  MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY || "sk-1hxK03JHKAqXZ0nDirDTD8wZOdwcmepAoI1D8M3FW5VJCP7S",

  // 服务器配置
  PORT: process.env.PORT || 3001,

  // CORS配置
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173"
};