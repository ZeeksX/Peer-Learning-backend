import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { sendError } from './responseHandler.js';

const uploadDir = path.resolve('uploads', 'materials');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = path.basename(file.originalname || 'material', ext).replace(/[^a-zA-Z0-9-_]/g, '-');
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const fileFilter = (_req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error('Unsupported file type. Allowed: images, PDF, Word, PPT, Excel, text files.'));
  }
  cb(null, true);
};

export const uploadMaterial = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter
});

export const handleUploadError = (error, _req, res, next) => {
  if (!error) return next();

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 'File too large. Max size is 25MB.', 'FILE_TOO_LARGE', 400);
    }
    return sendError(res, error.message, 'UPLOAD_FAILED', 400);
  }

  return sendError(res, error.message || 'Invalid upload', 'UPLOAD_FAILED', 400);
};

export const uploadSingleMaterial = (req, res, next) => {
  uploadMaterial.single('file')(req, res, (error) => handleUploadError(error, req, res, next));
};
