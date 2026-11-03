import { env } from '../config/env';

export interface UploadedImage {
  url: string;
  publicId: string;
}

/**
 * Canonical MIME -> extension map. Shared with `middleware/upload.ts` so the
 * accepted file types and the stored extension never drift apart.
 */
export const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/**
 * Absolute URL for a Storage REST call.
 *
 * Storage is called with the same server-only secret as PostgREST instead of
 * through `supabase-js`. Older deployed storage clients send the new
 * `sb_secret_...` API keys as if they were a browser/anon key, which makes the
 * Storage API reject the upload with `new row violates row-level security
 * policy` even though the exact same key can read and write Postgres. Keeping
 * this path on plain `fetch` means uploads work regardless of the installed
 * storage-client version, and the key still never leaves the server.
 */
function storageUrl(path: string): string {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const encoded = path
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${base}/storage/v1/object/${encodeURIComponent(env.SUPABASE_STORAGE_BUCKET)}/${encoded}`;
}

/** Extract Supabase's JSON error into a readable Error. */
async function storageError(res: Response): Promise<Error> {
  let message = `Storage request failed (${res.status} ${res.statusText})`;
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    if (body?.message || body?.error) message = body.message ?? body.error ?? message;
  } catch {
    // Keep the status-based message when the body is not JSON.
  }
  return new Error(message);
}

export async function uploadBuffer(
  buffer: Buffer,
  options: { mimetype: string; ext: string; folder?: string },
  bucketBucketOptions: { bucket?: string; isPublic?: boolean } = {},
): Promise<UploadedImage> {
  if (!buffer || buffer.length === 0) {
    throw new Error('No file to upload');
  }

  const bucket = bucketBucketOptions.bucket ?? env.SUPABASE_STORAGE_BUCKET;
  const isPublic = bucketBucketOptions.isPublic ?? true;
  const ext = EXT_BY_MIME[options.mimetype] ?? options.ext ?? 'bin';
  const publicId = `${options.folder ?? 'swat-city'}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${ext}`;

  const res = await fetch(storageUrlForBucket(publicId, bucket), {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'Content-Type': options.mimetype || 'application/octet-stream',
      'x-upsert': 'false',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: buffer,
  });

  if (!res.ok) {
    throw await storageError(res);
  }

  const url = isPublic
    ? publicObjectUrl(bucket, publicId)
    : ''; // Private buckets have no public URL — access goes through signed URLs.
  return { url, publicId };
}

function objectPathUrl(bucket: string, path: string): string {
  const encoded = path
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${bucket}/${encoded}`;
}

function storageUrlForBucket(path: string, bucket: string): string {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  return `${base}/storage/v1/object/${objectPathUrl(bucket, path)}`;
}

function publicObjectUrl(bucket: string, path: string): string {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${objectPathUrl(bucket, path)}`;
}

/**
 * Creates the payment-receipt bucket (private) if it does not exist yet, so a
 * fresh deployment does not need a manual Storage step. The service key is the
 * only caller, matching how every other storage write is gated.
 */
export async function ensureBucket(name: string, isPublic = false): Promise<void> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  try {
    // Buckets live under /storage/v1/bucket with the same secret-key headers.
    const res = await fetch(`${base}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: name, name, public: isPublic }),
    });
    // "Bucket already exists" is the happy path on every deployment after the
    // first; anything else is logged by the caller.
    void res;
  } catch {
    // Non-fatal: the schema migration creates the bucket too.
  }
}

/**
 * Short-lived signed URL for an object in a PRIVATE bucket (payment receipts).
 * The backend decides who may see the file — the URL is minted per-request and
 * expires, so a screenshot link cannot be shared publicly forever.
 */
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInMinutes = 30,
): Promise<string> {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const target = `${base}/storage/v1/object/sign/${objectPathUrl(bucket, path)}`;
  const res = await fetch(target, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: expiresInMinutes * 60 }),
  });
  if (!res.ok) {
    throw await storageError(res as Response);
  }
  const body = (await res.json()) as { signedURL?: string };
  if (!body?.signedURL) throw new Error('Storage did not return a signed URL');
  return `${base}${body.signedURL}`;
}

export async function uploadFile(
  file: Express.Multer.File,
  folder = 'swat-city',
): Promise<UploadedImage> {
  let ext = 'bin';
  if (file.mimetype && EXT_BY_MIME[file.mimetype]) {
    ext = EXT_BY_MIME[file.mimetype];
  } else if (file.originalname && file.originalname.includes('.')) {
    ext = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
  }

  return uploadBuffer(file.buffer, { mimetype: file.mimetype || 'application/octet-stream', ext, folder });
}

export async function deleteFile(publicId: string): Promise<void> {
  if (!publicId) return;
  // Skip local/ prefix safety no-ops if passed (kept for compatibility)
  if (publicId.startsWith('local/')) return;

  try {
    const res = await fetch(storageUrl(publicId), {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    });
    if (!res.ok) {
      // Swallow benign errors (object absent / bucket not found)
      return;
    }
  } catch {
    // Swallow errors as requested
    return;
  }
}
