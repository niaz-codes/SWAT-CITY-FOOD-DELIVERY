import fs from 'fs';
import path from 'path';
import { cloudinary, cloudinaryConfigured } from '../config/cloudinary';
import { env } from '../config/env';

export interface UploadedImage {
  url: string;
  publicId: string;
}

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

/**
 * Upload a single file (multer memory buffer) to Cloudinary.
 * Falls back to a local /uploads/ copy when Cloudinary isn't configured so
 * the whole flow still works in offline development.
 */
export async function uploadFile(
  file: Express.Multer.File,
  folder = 'swat-city',
): Promise<UploadedImage> {
  if (!file?.buffer || file.buffer.length === 0) {
    throw new Error('No file to upload');
  }

  if (cloudinaryConfigured) {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  // Local fallback
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = (file.originalname.split('.').pop() || 'bin')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(filePath, file.buffer);
  const url = `${env.PORT ? '' : ''}/uploads/${name}`;
  return { url, publicId: `local/${name}` };
}

export async function deleteFile(publicId: string): Promise<void> {
  if (!publicId) return;
  if (publicId.startsWith('local/')) {
    const name = publicId.replace('local/', '');
    const filePath = path.join(UPLOAD_DIR, name);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // already gone
    }
    return;
  }
  if (cloudinaryConfigured) {
    await cloudinary.uploader.destroy(publicId);
  }
}