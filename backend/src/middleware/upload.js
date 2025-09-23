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
    fileSize: 5 * 1024 * 1024, // 单个文件5MB限制（降低内存使用）
    files: 5, // 最多5个文件（减少同时处理的文件数量）
    fieldSize: 1024 * 1024, // 字段大小限制1MB
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
