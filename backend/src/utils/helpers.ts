import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

/** Normalize a phone number to international-ish digits (without +92 prefix handling by default). */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

/** Fast pagination wrapper for list endpoints. */
export function paginationMeta(page: number, limit: number, total: number) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const pages = Math.ceil(total / safeLimit) || 1;
  return {
    page: safePage,
    limit: safeLimit,
    pages,
    total,
  };
}
