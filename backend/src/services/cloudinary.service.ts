import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { env } from '../config/env';
import { uploadFile, deleteFile } from './storage.service';

// ============================================================
// Image storage for every upload the app makes.
//
// Cloudinary is OPTIONAL. When a deployment has no Cloudinary credentials the
// uploads go to Supabase Storage instead - the bucket this project already
// uses for rider documents - and the returned { url, publicId } shape stays
// exactly the same.
//
// This matters because Cloudinary used to be the only path: a deployment
// without a cloud name made EVERY upload fail with "Must supply cloud_name",
// which took rider registration down with it (the mandatory camera photo is
// uploaded before the account is created).
// ============================================================

export interface UploadedImage {
  url: string;
  publicId: string;
}

/** The three values a Cloudinary upload needs. */
export interface CloudinaryCredentials {
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
}

/**
 * Which store an upload goes to.
 *
 * `supabase` means the project's own storage bucket, `cloudinary` means the
 * external image service.
 */
export type UploadBackend = 'cloudinary' | 'supabase';

/**
 * Decide where an upload goes.
 *
 * Cloudinary is optional. When a deployment has no cloud name the upload used
 * to fail with "Must supply cloud_name", which took rider registration down
 * with it - the mandatory camera photo is uploaded before the account is
 * created. Supabase Storage takes over instead, and the returned
 * `{ url, publicId }` shape stays exactly the same.
 */
export function selectUploadBackend(credentials: CloudinaryCredentials): UploadBackend {
  return credentials.CLOUDINARY_CLOUD_NAME &&
    credentials.CLOUDINARY_API_KEY &&
    credentials.CLOUDINARY_API_SECRET
    ? 'cloudinary'
    : 'supabase';
}

/** True when the deployment has a full set of Cloudinary credentials. */
export const cloudinaryConfigured =
  selectUploadBackend({
    CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
  }) === 'cloudinary';

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Store an uploaded image and return its public URL plus the id needed to
 * remove it later.
 */
export async function uploadToCloudinary(
  file: Express.Multer.File,
  folder = 'swat-city',
): Promise<UploadedImage> {
  if (!file?.buffer || file.buffer.length === 0) {
    throw new Error('No file to upload');
  }

  // No Cloudinary account on this deployment: Supabase Storage takes over.
  if (!cloudinaryConfigured) {
    return uploadFile(file, folder);
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result) {
          return reject(new Error('Upload failed'));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      },
    );

    const readableStream = Readable.from(file.buffer);
    readableStream.pipe(uploadStream);
  });
}

/**
 * Remove a previously stored image. The id format differs between the two
 * stores, but each store only ever sees the ids it created.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  if (!publicId) return;
  if (!cloudinaryConfigured) {
    await deleteFile(publicId);
    return;
  }
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    // Swallow errors
    return;
  }
}
