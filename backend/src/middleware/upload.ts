import multer from 'multer';
import { AppError } from '../utils/AppError';
import { EXT_BY_MIME } from '../services/storage.service';

// In-memory storage: the buffer is streamed to Supabase Storage at upload time.
// The accepted types come from the shared EXT_BY_MIME map so the middleware and
// the storage service can never drift apart.
const ALLOWED_TYPES = new Set(Object.keys(EXT_BY_MIME));

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      return cb(new AppError('Only JPG, PNG, WEBP, PDF, GIF or HEIC files are allowed', 415));
    }
    cb(null, true);
  },
});
