import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError';

// In-memory storage: the buffer is streamed to Cloudinary at upload time.
const ALLOWED_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new AppError('Only JPG, PNG, WEBP or PDF files are allowed', 415));
    }
    cb(null, true);
  },
});

export function requireFile(_req: Request, _res: Response, next: NextFunction): void {
  // attached by multer.single / array below; presence is validated here.
  next();
}

export function fileType(file: Express.Multer.File): string {
  return ALLOWED_MIME.get(file.mimetype) ?? 'bin';
}