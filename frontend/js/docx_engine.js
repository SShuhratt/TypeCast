/**
 * Client-Side OpenXML DOCX & Plain Text Transliteration Engine.
 *
 * Runs 100% in-browser (Vercel-native):
 * - Unpacks .docx OpenXML container using JSZip.
 * - Parses and mutates text nodes in document.xml, headers, footers, footnotes.
 * - Merges adjacent runs sharing identical formatting to protect split digraphs.
 * - Repacks the file as a downloadable Blob in milliseconds with zero server load.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['jszip', './transliterator'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('jszip'), require('./transliterator'));
  } else {
    root.DocxEngine = factory(root.JSZip, root.UzbekTransliterator);
  }
}(typeof self !== 'undefined' ? self : this, function (JSZip, UzbekTransliterator) {
  'use strict';

  if (!JSZip) {
    console.error('DocxEngine requires JSZip. Make sure jszip.min.js is loaded.');
  }

  /**
   * Serializes formatting properties <w:rPr> of a run into a string signature.
   */
  function getRunPropertiesSignature(runNode) {
    var rPr = runNode.getElementsByTagName('w:rPr')[0] || runNode.getElementsByTagNameNS('*', 'rPr')[0];
    if (!rPr) return '';
    return rPr.outerHTML || '';
  }

  /**
   * Merges consecutive <w:r> runs with identical formatting to prevent split digraphs.
   */
  function mergeAdjacentRunsInParagraph(paragraphNode) {
    var runs = Array.from(paragraphNode.childNodes).filter(function (node) {
      return node.nodeType === 1 && (node.localName === 'r' || node.nodeName === 'w:r');
    });

    if (runs.length <= 1) return;

    var i = 0;
    while (i < runs.length - 1) {
      var currentRun = runs[i];
      var nextRun = runs[i + 1];

      var currentSig = getRunPropertiesSignature(currentRun);
      var nextSig = getRunPropertiesSignature(nextRun);

      if (currentSig === nextSig) {
        var currentT = currentRun.getElementsByTagName('w:t')[0] || currentRun.getElementsByTagNameNS('*', 't')[0];
        var nextT = nextRun.getElementsByTagName('w:t')[0] || nextRun.getElementsByTagNameNS('*', 't')[0];

        if (currentT && nextT) {
          currentT.textContent += nextT.textContent;
          currentT.setAttribute('xml:space', 'preserve');
          paragraphNode.removeChild(nextRun);
          runs.splice(i + 1, 1);
          continue;
        }
      }
      i++;
    }
  }

  /**
   * Transliterates all <w:t> text nodes inside an XML document.
   */
  function transliterateXmlDocument(xmlString, direction) {
    var parser = new (typeof DOMParser !== 'undefined' ? DOMParser : require('@xmldom/xmldom').DOMParser)();
    var xmlDoc = parser.parseFromString(xmlString, 'application/xml');

    // 1. Find all paragraphs and merge identical adjacent runs
    var paragraphs = xmlDoc.getElementsByTagName('w:p');
    if (!paragraphs || paragraphs.length === 0) {
      paragraphs = xmlDoc.getElementsByTagNameNS('*', 'p');
    }

    for (var pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      mergeAdjacentRunsInParagraph(paragraphs[pIdx]);
    }

    // 2. Transliterate all text nodes
    var textNodes = xmlDoc.getElementsByTagName('w:t');
    if (!textNodes || textNodes.length === 0) {
      textNodes = xmlDoc.getElementsByTagNameNS('*', 't');
    }

    for (var tIdx = 0; tIdx < textNodes.length; tIdx++) {
      var node = textNodes[tIdx];
      if (node.textContent) {
        node.textContent = UzbekTransliterator.transliterate(node.textContent, direction);
        // Ensure whitespace preservation
        if (node.textContent.startsWith(' ') || node.textContent.endsWith(' ')) {
          node.setAttribute('xml:space', 'preserve');
        }
      }
    }

    var serializer = new (typeof XMLSerializer !== 'undefined' ? XMLSerializer : require('@xmldom/xmldom').XMLSerializer)();
    return serializer.serializeToString(xmlDoc);
  }

  /**
   * Transliterates a .docx file in-memory using JSZip and browser DOM.
   *
   * @param {File|Blob|ArrayBuffer} fileInput
   * @param {string} direction 'latin-to-cyrillic' | 'cyrillic-to-latin'
   * @param {function} onProgress callback (percent, statusText)
   * @returns {Promise<Blob>} Transliterated .docx Blob
   */
  async function transliterateDocx(fileInput, direction, onProgress) {
    direction = direction || 'latin-to-cyrillic';
    if (onProgress) onProgress(10, 'Unpacking Word document...');

    var zip = await JSZip.loadAsync(fileInput);

    // List of XML file patterns that contain visible text
    var targetPatterns = [
      /^word\/document\.xml$/,
      /^word\/header\d+\.xml$/,
      /^word\/footer\d+\.xml$/,
      /^word\/footnotes\.xml$/,
      /^word\/endnotes\.xml$/,
      /^word\/comments\.xml$/,
    ];

    var matchedFiles = [];
    zip.forEach(function (relativePath, zipEntry) {
      for (var i = 0; i < targetPatterns.length; i++) {
        if (targetPatterns[i].test(relativePath)) {
          matchedFiles.push(zipEntry);
          break;
        }
      }
    });

    var total = matchedFiles.length;
    for (var idx = 0; idx < total; idx++) {
      var entry = matchedFiles[idx];
      var pct = Math.round(20 + (idx / total) * 60);
      if (onProgress) onProgress(pct, 'Transliterating ' + entry.name + '...');

      var content = await entry.async('string');
      var updatedContent = transliterateXmlDocument(content, direction);
      zip.file(entry.name, updatedContent);
    }

    if (onProgress) onProgress(85, 'Repacking document...');

    var outputBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    if (onProgress) onProgress(100, 'Complete!');
    return outputBlob;
  }

  /**
   * Transliterates plain text files (.txt).
   */
  async function transliterateTxt(fileInput, direction) {
    direction = direction || 'latin-to-cyrillic';
    var text;

    if (typeof fileInput === 'string') {
      text = fileInput;
    } else if (fileInput.text) {
      text = await fileInput.text();
    } else {
      var reader = new FileReader();
      text = await new Promise(function (resolve, reject) {
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsText(fileInput, 'UTF-8');
      });
    }

    var converted = UzbekTransliterator.transliterate(text, direction);
    return new Blob([converted], { type: 'text/plain;charset=utf-8' });
  }

  /**
   * Helper to escape XML special characters.
   */
  function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Builds a valid OpenXML DOCX archive from plain text / paragraphs.
   */
  async function createDocxFromText(text, headerText, footerText) {
    var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      '  <Default Extension="xml" ContentType="application/xml"/>\n' +
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n' +
      '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>\n' +
      (headerText ? '  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>\n' : '') +
      (footerText ? '  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>\n' : '') +
      '</Types>';

    var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n' +
      '</Relationships>';

    var docRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\n' +
      (headerText ? '  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>\n' : '') +
      (footerText ? '  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>\n' : '') +
      '</Relationships>';

    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
      '  <w:docDefaults>\n' +
      '    <w:rPrDefault>\n' +
      '      <w:rPr>\n' +
      '        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>\n' +
      '        <w:sz w:val="24"/>\n' +
      '        <w:szCs w:val="24"/>\n' +
      '        <w:lang w:val="uz-UZ"/>\n' +
      '      </w:rPr>\n' +
      '    </w:rPrDefault>\n' +
      '    <w:pPrDefault>\n' +
      '      <w:pPr>\n' +
      '        <w:spacing w:line="276" w:lineRule="auto" w:after="120"/>\n' +
      '      </w:pPr>\n' +
      '    </w:pPrDefault>\n' +
      '  </w:docDefaults>\n' +
      '  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">\n' +
      '    <w:name w:val="Normal"/>\n' +
      '    <w:qFormat/>\n' +
      '  </w:style>\n' +
      '</w:styles>';

    var lines = (text || '').split(/\r?\n|\r/);
    var pXml = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line || line.trim() === '') {
        pXml += '<w:p/>';
      } else {
        pXml += '<w:p><w:r><w:t xml:space="preserve">' + escapeXml(line) + '</w:t></w:r></w:p>';
      }
    }

    var headerRef = headerText ? '<w:headerReference w:type="default" r:id="rId2"/>' : '';
    var footerRef = footerText ? '<w:footerReference w:type="default" r:id="rId3"/>' : '';

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"\n' +
      '            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n' +
      '  <w:body>\n' +
      '    ' + pXml + '\n' +
      '    <w:sectPr>\n' +
      '      ' + headerRef + '\n' +
      '      ' + footerRef + '\n' +
      '      <w:pgSz w:w="11906" w:h="16838"/>\n' +
      '      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701"/>\n' +
      '    </w:sectPr>\n' +
      '  </w:body>\n' +
      '</w:document>';

    var zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', relsXml);
    zip.file('word/_rels/document.xml.rels', docRelsXml);
    zip.file('word/styles.xml', stylesXml);
    zip.file('word/document.xml', documentXml);

    if (headerText) {
      var headerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
        '  <w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr><w:r><w:t xml:space="preserve">' + escapeXml(headerText) + '</w:t></w:r></w:p>\n' +
        '</w:hdr>';
      zip.file('word/header1.xml', headerXml);
    }

    if (footerText) {
      var footerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
        '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
        '  <w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">' + escapeXml(footerText) + '</w:t></w:r></w:p>\n' +
        '</w:ftr>';
      zip.file('word/footer1.xml', footerXml);
    }

    return await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
  }

  /**
   * Transliterates legacy Word 97-2003 (.doc) binary documents in-memory
   * and modernizes them to .docx format (Option 3).
   *
   * @param {File|Blob|ArrayBuffer} fileInput
   * @param {string} direction 'latin-to-cyrillic' | 'cyrillic-to-latin'
   * @param {function} onProgress callback (percent, statusText)
   * @returns {Promise<Blob>} Transliterated and modernized .docx Blob
   */
  async function transliterateDoc(fileInput, direction, onProgress) {
    direction = direction || 'latin-to-cyrillic';
    if (onProgress) onProgress(15, 'Word 97-2003 (.doc) binar hujjati o\'qilmoqda...');

    var arrayBuffer;
    if (fileInput instanceof ArrayBuffer) {
      arrayBuffer = fileInput;
    } else if (fileInput.arrayBuffer) {
      arrayBuffer = await fileInput.arrayBuffer();
    } else {
      var reader = new FileReader();
      arrayBuffer = await new Promise(function (resolve, reject) {
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsArrayBuffer(fileInput);
      });
    }

    if (onProgress) onProgress(35, 'Hujjat matni ajratib olinmoqda...');

    var extractor = (typeof window !== 'undefined' && window.ClientDocExtractor) ||
                    (typeof globalThis !== 'undefined' && globalThis.ClientDocExtractor) ||
                    (typeof require === 'function' ? require('./libs/doc-extractor-entry') : null);

    if (!extractor) {
      throw new Error("ClientDocExtractor topilmadi. Kutubxona yuklanganligini tekshiring.");
    }

    var extracted = await extractor.extract(arrayBuffer);

    if (onProgress) onProgress(60, 'Matn transliteratsiya qilinmoqda...');

    var transliteratedBody = UzbekTransliterator.transliterate(extracted.body || '', direction);
    var transliteratedHeader = extracted.headers ? UzbekTransliterator.transliterate(extracted.headers, direction) : '';
    var transliteratedFooter = extracted.footers ? UzbekTransliterator.transliterate(extracted.footers, direction) : '';

    if (extracted.textboxes && extracted.textboxes.trim()) {
      var transliteratedBoxes = UzbekTransliterator.transliterate(extracted.textboxes.trim(), direction);
      transliteratedBody += '\n\n' + transliteratedBoxes;
    }
    if (extracted.footnotes && extracted.footnotes.trim()) {
      var transliteratedFootnotes = UzbekTransliterator.transliterate(extracted.footnotes.trim(), direction);
      transliteratedBody += '\n\n' + transliteratedFootnotes;
    }

    if (onProgress) onProgress(80, 'Zamonaviy .docx shakllantirilmoqda...');

    var docxBlob = await createDocxFromText(transliteratedBody, transliteratedHeader, transliteratedFooter);

    if (onProgress) onProgress(100, 'Tayyor! Zamonaviy .docx shakliga o\'tkazildi.');

    return docxBlob;
  }

  /**
   * Helper to trigger a browser file download.
   */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  return {
    transliterateDocx: transliterateDocx,
    transliterateDoc: transliterateDoc,
    transliterateTxt: transliterateTxt,
    createDocxFromText: createDocxFromText,
    downloadBlob: downloadBlob,
    transliterateXmlDocument: transliterateXmlDocument
  };
}));
