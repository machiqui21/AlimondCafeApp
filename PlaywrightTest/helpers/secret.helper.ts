import 'dotenv/config';
import crypto from 'crypto';

export function getDecryptedTestPassword(): string {
  const keyHex = process.env.TEST_PASSWORD_KEY || '';
  const ivHex = process.env.TEST_PASSWORD_IV || '';
  const encHex = process.env.TEST_PASSWORD_ENC || '';
  if (!keyHex || !ivHex || !encHex) {
    throw new Error('Missing TEST_PASSWORD_KEY/IV/ENC in environment');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  return decrypted;
}

// Optional: helper to generate new encrypted values for env setup
export function encryptForEnv(plain: string): { key: string; iv: string; enc: string } {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  return {
    key: key.toString('hex'),
    iv: iv.toString('hex'),
    enc: enc.toString('hex'),
  };
}