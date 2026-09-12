const { Buffer } = require('buffer');
const WordOleExtractor = require('word-extractor/lib/word-ole-extractor');
const BufferReader = require('word-extractor/lib/buffer-reader');

class ClientDocExtractor {
  static async extract(arrayBufferOrUint8Array) {
    let buf;
    if (Buffer.isBuffer(arrayBufferOrUint8Array)) {
      buf = arrayBufferOrUint8Array;
    } else if (arrayBufferOrUint8Array instanceof ArrayBuffer) {
      buf = Buffer.from(arrayBufferOrUint8Array);
    } else if (arrayBufferOrUint8Array.buffer instanceof ArrayBuffer) {
      buf = Buffer.from(arrayBufferOrUint8Array.buffer, arrayBufferOrUint8Array.byteOffset, arrayBufferOrUint8Array.byteLength);
    } else {
      throw new Error("Invalid buffer type for ClientDocExtractor");
    }

    const reader = new BufferReader(buf);
    const extractor = new WordOleExtractor();
    const doc = await extractor.extract(reader);
    return {
      body: doc.getBody({ filterUnicode: false }),
      headers: doc.getHeaders({ filterUnicode: false }),
      footers: doc.getFooters({ filterUnicode: false }),
      textboxes: doc.getTextboxes({ filterUnicode: false }),
      footnotes: doc.getFootnotes({ filterUnicode: false }),
      endnotes: doc.getEndnotes({ filterUnicode: false })
    };
  }
}

if (typeof window !== 'undefined') {
  window.ClientDocExtractor = ClientDocExtractor;
  window.Buffer = Buffer;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ClientDocExtractor = ClientDocExtractor;
}

module.exports = ClientDocExtractor;
