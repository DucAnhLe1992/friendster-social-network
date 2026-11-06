import crypto from 'crypto';

const processPart = crypto.randomBytes(5).toString('hex');
let counter = crypto.randomBytes(3).readUIntBE(0, 3);

// 24-hex ids ordered by creation second (same layout as the ids the web app already handles), so ties on
// `created_at` can be broken by comparing ids.
export const newId = (): string => {
  counter = (counter + 1) % 0xffffff;
  const seconds = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  return seconds + processPart + counter.toString(16).padStart(6, '0');
};
