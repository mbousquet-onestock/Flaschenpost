// AES-256-GCM encryption of the stored OneStock API password.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { HttpError } from './http.js';

function key(): Buffer {
  const secret = process.env.CREDENTIALS_KEY;
  if (!secret || secret.length < 16) throw new HttpError(500, 'CREDENTIALS_KEY is not set (16+ characters)');
  return createHash('sha256').update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(stored: string): string {
  const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
