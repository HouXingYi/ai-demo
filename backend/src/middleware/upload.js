import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';

// 配置文件上传中间件
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `image_${timestamp}${ext}`);
  }
});

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 单个文件15MB限制
    files: 200, // 最多200个文件（超大批量处理）
    fieldSize: 10 * 1024 * 1024, // 字段大小限制10MB
    totalFileSize: 500 * 1024 * 1024, // 总文件大小限制500MB
    fieldNameSize: 2048, // 字段名大小限制2KB
    fields: 2000, // 最大字段数量
    parts: 2000, // 最大部分数量
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  }
});
