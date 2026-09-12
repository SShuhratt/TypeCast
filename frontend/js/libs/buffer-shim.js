import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Buffer = Buffer;
}

export { Buffer };
