import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXT_BY_MIME } from '../src/services/storage.service';
import { selectUploadBackend } from '../src/services/cloudinary.service';

/**
 * Where an upload ends up.
 *
 * The rider photo is the one upload the app cannot work without: it is sent
 * before the account is created, so a storage backend that is not configured
 * takes the whole registration down. Cloudinary is therefore optional and
 * Supabase Storage - the bucket this project already uses for rider documents
 * - is the fallback.
 */
describe('upload backend selection', () => {
  it('uses Cloudinary when every credential is present', () => {
    assert.equal(
      selectUploadBackend({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
      'cloudinary',
    );
  });

  it('falls back to Supabase Storage when the cloud name is missing', () => {
    // The shape production actually has: an api key and secret were copied
    // over but the cloud name never was, which made every upload fail with
    // "Must supply cloud_name".
    assert.equal(
      selectUploadBackend({
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
      'supabase',
    );
  });

  it('falls back to Supabase Storage when the api key is missing', () => {
    assert.equal(
      selectUploadBackend({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_SECRET: 'secret',
      }),
      'supabase',
    );
  });

  it('falls back to Supabase Storage when the secret is missing', () => {
    assert.equal(
      selectUploadBackend({
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'key',
      }),
      'supabase',
    );
  });

  it('treats an empty credential as missing', () => {
    assert.equal(
      selectUploadBackend({
        CLOUDINARY_CLOUD_NAME: '',
        CLOUDINARY_API_KEY: 'key',
        CLOUDINARY_API_SECRET: 'secret',
      }),
      'supabase',
    );
  });

  it('falls back when the deployment has no Cloudinary account at all', () => {
    assert.equal(selectUploadBackend({}), 'supabase');
  });
});

describe('accepted upload types', () => {
  it('accepts the photo types the Android app can produce', () => {
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.ok(EXT_BY_MIME[mime], `${mime} must be an accepted type`);
    }
  });

  it('stores the extension that matches the mime type', () => {
    assert.equal(EXT_BY_MIME['image/jpeg'], 'jpg');
    assert.equal(EXT_BY_MIME['image/png'], 'png');
    assert.equal(EXT_BY_MIME['image/webp'], 'webp');
  });
});
