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
    transliterateTxt: transliterateTxt,
    downloadBlob: downloadBlob,
    transliterateXmlDocument: transliterateXmlDocument
  };
}));
