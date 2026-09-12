/**
 * TypeCast Application - Frontend Logic & Orchestration
 *
 * Handles:
 * - Real-time client-side live text transliteration (debounced)
 * - Direction swapping (Latin <-> Cyrillic)
 * - Word & character metrics
 * - Document upload drag-and-drop (.docx, .doc, .txt)
 * - Dual-mode document processing (In-browser OpenXML / Backend API)
 * - Format conversion (.docx, .doc, .pdf, .txt)
 * - Theme management & toast notifications
 */

(function () {
  'use strict';

  // API endpoint configuration (auto-detects local backend on port 8000 if served from dev port)
  var API_BASE_URL = window.TYPECAST_API_URL || (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '8000'
      ? window.location.protocol + '//' + window.location.hostname + ':8000'
      : ''
  );

  // State
  var state = {
    direction: 'latin-to-cyrillic', // 'latin-to-cyrillic' | 'cyrillic-to-latin'
    theme: localStorage.getItem('typecast_theme') || 'dark',
    backendAvailable: false,
    libreofficeAvailable: false,
    activeFile: null,
    convertedBlob: null,
    convertedFileName: '',
  };

  // Sample texts for quick demonstration
  var SAMPLES = {
    constitution: {
      'latin-to-cyrillic': "O'zbekiston Respublikasining Konstitutsiyasi. Inson, uning hayoti, erkinligi, sha'ni, qadr-qimmati va boshqa daxlsiz huquqlari oliy qadriyat hisoblanadi. Davlat o'z faoliyatini inson hamda jamiyat farovonligini ta'minlash maqsadida qonuniylik, ijtimoiy adolat va birdamlik prinsiplari asosida amalga oshiradi.",
      'cyrillic-to-latin': "Ўзбекистон Республикасининг Конституцияси. Инсон, унинг ҳаёти, эркинлиги, шаъни, қадр-қиммати ва бошқа дахлсиз ҳуқуқлари олий қадрият ҳисобланади. Давлат ўз фаолиятини инсон ҳамда жамият фаровонлигини таъминлаш мақсадида қонунийлик, ижтимоий адолат ва бирдамлик принциплари асосида амалга оширади."
    },
    navoiy: {
      'latin-to-cyrillic': "Olam ahli, bilingizkim, ish emas dushmanlig', \nYor o'ling bir-biringizgakim, erur yorlig' ish. \nTilga ixtiyorsiz — elga e'tiborsiz. \nBilmaganini so'rab o'rgangan olim, \norlanib so'ramagan o'ziga zolim.",
      'cyrillic-to-latin': "Олам аҳли, билингизким, иш эмас душманлиғ, \nЁр ўлинг бир-бирингизгаким, эрур ёрлиғ иш. \nТилга ихтиёрсиз — элга эътиборсиз. \nБилмаганини сўраб ўрганган олим, \nорланиб сўрамаган ўзига золим."
    },
    digraphs: {
      'latin-to-cyrillic': "Shahar ko'chalari, Toshkent viloyati, Chilonzor tumani, O'zbekiston Respublikasi, Is'hoqxon Ibrat, g'oliblar va yangi yo'nalishlar.",
      'cyrillic-to-latin': "Шаҳар кўчалари, Тошкент вилояти, Чилонзор тумани, Ўзбекистон Республикаси, Исҳоқхон Ибрат, ғолиблар ва янги йўналишлар."
    }
  };

  // DOM Elements
  var docElement = document.documentElement;
  var themeToggleBtn = document.getElementById('themeToggleBtn');
  var engineStatusPill = document.getElementById('engineStatusPill');
  var engineStatusText = document.getElementById('engineStatusText');

  var tabLiveText = document.getElementById('tabLiveText');
  var tabDocUpload = document.getElementById('tabDocUpload');
  var panelLiveText = document.getElementById('panelLiveText');
  var panelDocUpload = document.getElementById('panelDocUpload');

  var swapDirectionBtn = document.getElementById('swapDirectionBtn');
  var sourceLangName = document.getElementById('sourceLangName');
  var targetLangName = document.getElementById('targetLangName');
  var sourcePaneTitle = document.getElementById('sourcePaneTitle');
  var targetPaneTitle = document.getElementById('targetPaneTitle');

  var sourceInput = document.getElementById('sourceInput');
  var targetOutput = document.getElementById('targetOutput');
  var clearTextBtn = document.getElementById('clearTextBtn');
  var copyOutputBtn = document.getElementById('copyOutputBtn');
  var downloadTxtBtn = document.getElementById('downloadTxtBtn');

  var sourceCharCount = document.getElementById('sourceCharCount');
  var sourceWordCount = document.getElementById('sourceWordCount');
  var targetCharCount = document.getElementById('targetCharCount');
  var targetWordCount = document.getElementById('targetWordCount');

  var docDirectionSelect = document.getElementById('docDirectionSelect');
  var docFormatSelect = document.getElementById('docFormatSelect');
  var fileDropzone = document.getElementById('fileDropzone');
  var fileInput = document.getElementById('fileInput');
  var browseFileBtn = document.getElementById('browseFileBtn');

  var progressCard = document.getElementById('progressCard');
  var fileTypeIcon = document.getElementById('fileTypeIcon');
  var fileNameLabel = document.getElementById('fileNameLabel');
  var fileSizeLabel = document.getElementById('fileSizeLabel');
  var cancelFileBtn = document.getElementById('cancelFileBtn');
  var progressBarFill = document.getElementById('progressBarFill');
  var progressStatusText = document.getElementById('progressStatusText');
  var progressPctLabel = document.getElementById('progressPctLabel');
  var docActionsRow = document.getElementById('docActionsRow');
  var downloadResultBtn = document.getElementById('downloadResultBtn');
  var convertAnotherBtn = document.getElementById('convertAnotherBtn');

  var toastContainer = document.getElementById('toastContainer');

  // =========================================================================
  // Theme Management
  // =========================================================================
  function applyTheme(theme) {
    state.theme = theme;
    docElement.setAttribute('data-theme', theme);
    localStorage.setItem('typecast_theme', theme);
  }

  themeToggleBtn.addEventListener('click', function () {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  });

  // Apply initial theme
  applyTheme(state.theme);

  // =========================================================================
  // Toast Notifications
  // =========================================================================
  function showToast(message, type) {
    type = type || 'success';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = (type === 'success' ? '✓ ' : '⚠ ') + message;

    toastContainer.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.95)';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 3200);
  }

  // =========================================================================
  // Health Check & Engine Detection
  // =========================================================================
  async function checkBackendHealth() {
    try {
      var res = await fetch(API_BASE_URL + '/api/health', { method: 'GET' });
      if (res.ok) {
        var data = await res.json();
        state.backendAvailable = true;
        state.libreofficeAvailable = !!data.libreoffice_available;

        engineStatusPill.classList.add('active');
        if (state.libreofficeAvailable) {
          engineStatusText.textContent = 'Docker & LibreOffice Ulangan';
        } else {
          engineStatusText.textContent = 'Backend API Ulangan';
        }
        return;
      }
    } catch (e) {
      // Backend not running (e.g. Static Vercel deployment)
    }

    state.backendAvailable = false;
    engineStatusPill.classList.add('active');
    engineStatusText.textContent = '⚡ Edge Brauzer Rejimi (Vercel)';
  }

  // =========================================================================
  // Tabs Navigation
  // =========================================================================
  function switchTab(tabName) {
    if (tabName === 'liveText') {
      tabLiveText.classList.add('active');
      tabLiveText.setAttribute('aria-selected', 'true');
      tabDocUpload.classList.remove('active');
      tabDocUpload.setAttribute('aria-selected', 'false');

      panelLiveText.classList.add('active');
      panelDocUpload.classList.remove('active');
      sourceInput.focus();
    } else {
      tabDocUpload.classList.add('active');
      tabDocUpload.setAttribute('aria-selected', 'true');
      tabLiveText.classList.remove('active');
      tabLiveText.setAttribute('aria-selected', 'false');

      panelDocUpload.classList.add('active');
      panelLiveText.classList.remove('active');
    }
  }

  tabLiveText.addEventListener('click', function () { switchTab('liveText'); });
  tabDocUpload.addEventListener('click', function () { switchTab('docUpload'); });

  // =========================================================================
  // Live Text Transliteration & Direction
  // =========================================================================
  var debounceTimer = null;

  function countWords(str) {
    if (!str.trim()) return 0;
    return str.trim().split(/\s+/).length;
  }

  function updateMetrics() {
    var src = sourceInput.value;
    var tgt = targetOutput.value;

    sourceCharCount.textContent = src.length;
    sourceWordCount.textContent = countWords(src);

    targetCharCount.textContent = tgt.length;
    targetWordCount.textContent = countWords(tgt);
  }

  function performLiveTransliteration() {
    var src = sourceInput.value;
    if (!src) {
      targetOutput.value = '';
      updateMetrics();
      return;
    }

    try {
      var converted = UzbekTransliterator.transliterate(src, state.direction);
      targetOutput.value = converted;
    } catch (err) {
      console.error('Transliteration error:', err);
    }
    updateMetrics();
  }

  sourceInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performLiveTransliteration, 60);
  });

  // Swap Direction
  swapDirectionBtn.addEventListener('click', function () {
    var currentTargetVal = targetOutput.value;

    if (state.direction === 'latin-to-cyrillic') {
      state.direction = 'cyrillic-to-latin';
      sourceLangName.textContent = 'Kirill alifbosi';
      targetLangName.textContent = 'Lotin alifbosi';
      sourcePaneTitle.textContent = 'Kiritiluvchi matn (Kirill)';
      targetPaneTitle.textContent = 'O\'girilgan matn (Lotin)';
      docDirectionSelect.value = 'cyrillic-to-latin';
    } else {
      state.direction = 'latin-to-cyrillic';
      sourceLangName.textContent = 'Lotin alifbosi';
      targetLangName.textContent = 'Kirill alifbosi';
      sourcePaneTitle.textContent = 'Kiritiluvchi matn (Lotin)';
      targetPaneTitle.textContent = 'O\'girilgan matn (Kirill)';
      docDirectionSelect.value = 'latin-to-cyrillic';
    }

    // Move converted text to source if present
    if (currentTargetVal) {
      sourceInput.value = currentTargetVal;
      performLiveTransliteration();
    } else {
      performLiveTransliteration();
    }

    sourceInput.focus();
  });

  // Sync docDirectionSelect
  docDirectionSelect.addEventListener('change', function () {
    if (docDirectionSelect.value !== state.direction) {
      swapDirectionBtn.click();
    }
  });

  // Clear Text
  clearTextBtn.addEventListener('click', function () {
    sourceInput.value = '';
    targetOutput.value = '';
    updateMetrics();
    sourceInput.focus();
  });

  // Copy to Clipboard
  copyOutputBtn.addEventListener('click', async function () {
    var text = targetOutput.value;
    if (!text) {
      showToast('Nusxalash uchun matn mavjud emas!', 'error');
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        targetOutput.select();
        document.execCommand('copy');
      }
      showToast('Matn nusxalandi!');
    } catch (e) {
      showToast('Nusxa olishda xatolik yuz berdi', 'error');
    }
  });

  // Download Output as .txt
  downloadTxtBtn.addEventListener('click', function () {
    var text = targetOutput.value;
    if (!text) {
      showToast('Yuklab olish uchun matn mavjud emas!', 'error');
      return;
    }

    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var filename = 'matn_' + (state.direction === 'latin-to-cyrillic' ? 'kirill' : 'lotin') + '.txt';
    DocxEngine.downloadBlob(blob, filename);
    showToast(filename + ' yuklab olindi!');
  });

  // Sample Chips
  document.querySelectorAll('.chip-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sampleKey = btn.getAttribute('data-sample');
      if (SAMPLES[sampleKey]) {
        sourceInput.value = SAMPLES[sampleKey][state.direction];
        performLiveTransliteration();
        showToast('Namuna matn yuklandi!');
      }
    });
  });

  // =========================================================================
  // Document Upload & File Handling
  // =========================================================================
  browseFileBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    fileInput.click();
  });

  fileDropzone.addEventListener('click', function () {
    fileInput.click();
  });

  // Drag & Drop visual states
  ['dragenter', 'dragover'].forEach(function (eventName) {
    fileDropzone.addEventListener(eventName, function (e) {
      e.preventDefault();
      e.stopPropagation();
      fileDropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(function (eventName) {
    fileDropzone.addEventListener(eventName, function (e) {
      e.preventDefault();
      e.stopPropagation();
      fileDropzone.classList.remove('dragover');
    }, false);
  });

  fileDropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  });

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function handleFileSelected(file) {
    var name = file.name;
    var ext = name.split('.').pop().toLowerCase();

    if (!['docx', 'doc', 'txt'].includes(ext)) {
      showToast('Faqat .docx, .doc yoki .txt formatidagi fayllar qabul qilinadi!', 'error');
      return;
    }

    state.activeFile = file;
    state.convertedBlob = null;

    // Update UI
    fileTypeIcon.textContent = ext.toUpperCase();
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatFileSize(file.size);

    fileDropzone.style.display = 'none';
    progressCard.style.display = 'flex';
    docActionsRow.style.display = 'none';

    // Start conversion immediately
    processSelectedFile(file);
  }

  function updateProgress(pct, statusMsg) {
    progressBarFill.style.width = pct + '%';
    progressPctLabel.textContent = pct + '%';
    if (statusMsg) progressStatusText.textContent = statusMsg;
  }

  async function processSelectedFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var direction = docDirectionSelect.value;
    var targetFormat = docFormatSelect.value;

    // Determine target output extension
    var outExt = targetFormat === 'same' ? ext : targetFormat;

    updateProgress(5, 'Hujjat tahlil qilinmoqda...');

    // Scenario A: Client-side processing (.docx, .doc, or .txt to docx, doc, or txt)
    var canProcessClientSide = (ext === 'docx' && (outExt === 'docx' || outExt === 'doc')) ||
                               (ext === 'doc' && (outExt === 'docx' || outExt === 'doc')) ||
                               (ext === 'txt' && (outExt === 'txt' || outExt === 'doc' || outExt === 'docx'));

    if (canProcessClientSide) {
      try {
        var resultBlob;
        var baseName = file.name.substring(0, file.name.lastIndexOf('.'));
        state.convertedFileName = baseName + '_' + (direction === 'latin-to-cyrillic' ? 'kirill' : 'lotin') + '.' + outExt;

        if (ext === 'docx' && outExt === 'docx') {
          resultBlob = await DocxEngine.transliterateDocx(file, direction, function (pct, msg) {
            updateProgress(pct, msg);
          });
        } else if (ext === 'docx' && outExt === 'doc') {
          resultBlob = await DocxEngine.transliterateDocxToDoc(file, direction, function (pct, msg) {
            updateProgress(pct, msg);
          });
          showToast('Word (.docx ➔ .doc) hujjati muvaffaqiyatli o\'girildi!', 'success');
        } else if (ext === 'doc') {
          resultBlob = await DocxEngine.transliterateDoc(file, direction, outExt, function (pct, msg) {
            updateProgress(pct, msg);
          });
          if (outExt === 'doc') {
            showToast('Word (.doc ➔ .doc) hujjati muvaffaqiyatli o\'girildi!', 'success');
          } else {
            showToast('Word (.doc ➔ .docx) hujjati muvaffaqiyatli modernizatsiya qilindi!', 'success');
          }
        } else {
          updateProgress(30, 'Matn o\'qilmoqda...');
          if (outExt === 'doc') {
            var txtContent = await file.text();
            var convTxt = UzbekTransliterator.transliterate(txtContent, direction);
            resultBlob = DocxEngine.createDocFileFromText(convTxt);
          } else if (outExt === 'docx') {
            var txtContent2 = await file.text();
            var convTxt2 = UzbekTransliterator.transliterate(txtContent2, direction);
            resultBlob = await DocxEngine.createDocxFromText(convTxt2);
          } else {
            resultBlob = await DocxEngine.transliterateTxt(file, direction);
          }
          updateProgress(100, 'Tayyor!');
        }

        state.convertedBlob = resultBlob;
        onConversionSuccess();
      } catch (err) {
        console.error('Client conversion error:', err);
        showToast('Brauzerda qayta ishlashda xatolik: ' + err.message, 'error');
        resetFileUI();
      }
      return;
    }

    // Scenario B: Backend Processing (Required for exports to .pdf)
    if (!state.backendAvailable) {
      if (targetFormat === 'pdf') {
        updateProgress(0, 'Backend xizmati talab etiladi');
        showToast('.pdf formatiga eksport qilish uchun LibreOffice backend xizmati talab etiladi.', 'error');
        resetFileUI();
        return;
      }
    }

    // Send to Backend API
    try {
      if (ext === 'doc') {
        updateProgress(20, 'Eski Word (.doc) zamonaviy (.docx) ga modernizatsiya qilinmoqda...');
      } else {
        updateProgress(20, 'Fayl serverga yuborilmoqda...');
      }

      var formData = new FormData();
      formData.append('file', file);
      formData.append('direction', direction);
      formData.append('target_format', targetFormat);

      var response = await fetch(API_BASE_URL + '/api/transliterate/file', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        var errJson = await response.json().catch(function () { return {}; });
        throw new Error(errJson.detail || ('Server xatosi: ' + response.status));
      }

      updateProgress(80, 'Natija yuklab olinmoqda...');
      var blob = await response.blob();

      // Extract filename from Content-Disposition header if available
      var disp = response.headers.get('Content-Disposition');
      var filename = '';
      if (disp && disp.indexOf('filename=') !== -1) {
        var match = disp.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      if (!filename) {
        var base = file.name.substring(0, file.name.lastIndexOf('.'));
        var chosenExt = targetFormat === 'same' ? ext : targetFormat;
        filename = base + '_' + (direction === 'latin-to-cyrillic' ? 'kirill' : 'lotin') + '.' + chosenExt;
      }

      state.convertedBlob = blob;
      state.convertedFileName = filename;

      updateProgress(100, 'Tayyor!');
      onConversionSuccess();

    } catch (err) {
      console.error('Backend conversion failed:', err);
      showToast('Faylni qayta ishlashda xatolik: ' + err.message, 'error');
      resetFileUI();
    }
  }

  function onConversionSuccess() {
    progressStatusText.textContent = 'Muvaffaqiyatli o\'girildi!';
    docActionsRow.style.display = 'flex';
    showToast(state.convertedFileName + ' tayyor!');

    // Auto-trigger download for convenient workflow
    DocxEngine.downloadBlob(state.convertedBlob, state.convertedFileName);
  }

  downloadResultBtn.addEventListener('click', function () {
    if (state.convertedBlob && state.convertedFileName) {
      DocxEngine.downloadBlob(state.convertedBlob, state.convertedFileName);
    }
  });

  function resetFileUI() {
    state.activeFile = null;
    state.convertedBlob = null;
    state.convertedFileName = '';
    fileInput.value = '';

    fileDropzone.style.display = 'block';
    progressCard.style.display = 'none';
    docActionsRow.style.display = 'none';
    updateProgress(0, '');
  }

  cancelFileBtn.addEventListener('click', resetFileUI);
  convertAnotherBtn.addEventListener('click', resetFileUI);

  // Initialize
  checkBackendHealth();

})();
