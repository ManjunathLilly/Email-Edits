/* ==========================================================================
   dashboard.js — upload, project cards, thumbnails, file viewer, new-email,
   and export. Relies on window.Postmark (package-handler.js).
   ========================================================================== */
(function () {
  'use strict';
  var PM = window.Postmark;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ----------------------------- Toast ---------------------------------- */
  function toast(msg, kind) {
    var host = $('#toast-host');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s';
      setTimeout(function () { host.removeChild(el); }, 320); }, 3200);
  }

  /* --------------------------- Library status ---------------------------- */
  (function libStatus() {
    var parts = [];
    parts.push(window.JSZip ? 'JSZip ✓' : 'JSZip ✗');
    parts.push(PM && PM.hasMjmlCompiler() ? 'MJML ✓' : 'MJML (editor)');
    $('#lib-status').textContent = parts.join('  ·  ');
  })();

  /* --------------------------- Render projects --------------------------- */
  function svgIcon(name) {
    var icons = {
      file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
      img:  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
      meta: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'
    };
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (icons[name] || icons.file) + '</svg>';
  }

  function render() {
    var grid = $('#proj-grid');
    var list = PM.loadAll();
    $('#proj-count').textContent = list.length;
    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML =
        '<div class="empty">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>' +
        '<p>No projects yet.</p>' +
        '<p class="hint">Upload a package or create a new email to get started.</p>' +
        '</div>';
      return;
    }

    list.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'card';

      // thumbnail: render resolved index.html into a sandboxed iframe
      var resolved = PM.resolveImages(p.indexHtml || '', p.images);
      var thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.innerHTML =
        '<span class="badge ' + p.mode + '">' + (p.mode === 'mjml' ? 'MJML' : 'HTML') + '</span>' +
        '<div class="scrim"></div>';
      var ifr = document.createElement('iframe');
      ifr.setAttribute('sandbox', 'allow-same-origin');
      ifr.setAttribute('scrolling', 'no');
      ifr.setAttribute('title', p.name + ' preview');
      thumb.insertBefore(ifr, thumb.firstChild);
      // assign srcdoc after insert
      setTimeout(function () { ifr.srcdoc = resolved; }, 0);

      // file list
      var files = [];
      files.push({ label: 'index.html', icon: 'file', tag: '', action: function () { openFile(p, 'index'); } });
      files.push({ label: 'metadata.html', icon: 'meta', tag: 'edit', action: function () { openFile(p, 'metadata'); } });
      if (p.mode === 'mjml' && p.mjml) {
        files.push({ label: p.mjmlFileName || 'email.mjml', icon: 'code', tag: 'editor', action: function () { openInEditor(p.id); } });
      }
      (p.images || []).forEach(function (img) {
        files.push({ label: 'images/' + img.name, icon: 'img', tag: '', action: function () { openImage(img); } });
      });
      // other html files that came inside distribution/ — viewable + editable
      (p.extraFiles || []).forEach(function (f, ei) {
        files.push({ label: f.path, icon: 'file', tag: 'edit', action: function () { openFile(p, 'extra', ei); } });
      });

      var flHtml = '<div class="filelist"><div class="fl-label">distribution/</div>';
      files.forEach(function (f, i) {
        flHtml += '<button class="file-row" data-i="' + i + '">' +
          '<span class="fi">' + svgIcon(f.icon) + '</span>' +
          '<span class="fname">' + PM.escapeHtml(f.label) + '</span>' +
          (f.tag ? '<span class="ftag">' + f.tag + '</span>' : '') +
          '</button>';
      });
      flHtml += '</div>';

      var body = document.createElement('div');
      body.className = 'body';
      body.innerHTML =
        '<span class="title">' + PM.escapeHtml(p.name) + '</span>' +
        '<span class="sub">' + (p.images.length) + ' image' + (p.images.length === 1 ? '' : 's') +
        ' · updated ' + timeAgo(p.updatedAt) + '</span>' + flHtml;

      // wire file rows
      $$('.file-row', body).forEach(function (btn) {
        btn.addEventListener('click', function () { files[+btn.getAttribute('data-i')].action(); });
      });

      // footer actions
      var foot = document.createElement('div');
      foot.className = 'foot';
      foot.innerHTML =
        '<button class="btn primary sm" data-act="edit" style="flex:1">Edit</button>' +
        '<button class="btn sm" data-act="export">Export</button>' +
        '<button class="btn sm danger" data-act="delete" title="Delete">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        '</button>';
      foot.querySelector('[data-act="edit"]').addEventListener('click', function () { openInEditor(p.id); });
      foot.querySelector('[data-act="export"]').addEventListener('click', function () { doExport(p); });
      foot.querySelector('[data-act="delete"]').addEventListener('click', function () {
        if (confirm('Delete "' + p.name + '"? This cannot be undone.')) { PM.deleteProject(p.id); render(); toast('Project deleted'); }
      });

      // clicking the thumbnail opens index viewer
      thumb.querySelector('.scrim').addEventListener('click', function () { openFile(p, 'index'); });

      card.appendChild(thumb);
      card.appendChild(body);
      card.appendChild(foot);
      grid.appendChild(card);
    });
  }

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  /* --------------------------- Open in editor ---------------------------- */
  function openInEditor(id) {
    PM.setCurrent(id);
    // Open the editor in a NEW TAB (keep the dashboard open).
    window.open('editor.html?id=' + encodeURIComponent(id), '_blank');
  }

  /* --------------------------- File viewers ------------------------------ */
  var fvCM = null;          // CodeMirror instance for the file modal
  var fvProject = null;     // project currently open in the modal
  var fvWhich = null;       // 'metadata' | 'index' | 'extra'
  var fvExtraIdx = -1;      // index into project.extraFiles when fvWhich==='extra'
  var fvView = 'preview';   // 'preview' | 'edit'

  function fvEnsureCM() {
    if (fvCM || !window.CodeMirror) return fvCM;
    fvCM = window.CodeMirror.fromTextArea($('#fv-code'), {
      lineNumbers: true, theme: 'material-darker', mode: 'htmlmixed',
      lineWrapping: true, autoCloseTags: true, matchBrackets: true,
      tabSize: 2, indentUnit: 2
    });
    // height is controlled by CSS (.modal-wide .CodeMirror{height:100%}); only
    // set width so the editor fills the host. Avoid setSize('100%','100%') which
    // fights the flex layout and can collapse the editor.
    fvCM.setSize(null, '100%');
    return fvCM;
  }

  function fvRenderPreview() {
    var body = $('#fv-body');
    body.innerHTML = '';
    body.style.display = 'block'; body.style.padding = ''; body.style.background = '#fff';
    var ifr = document.createElement('iframe');
    ifr.setAttribute('sandbox', 'allow-same-origin');
    ifr.style.cssText = 'width:100%;height:100%;border:0;background:#fff;display:block;';
    body.appendChild(ifr);
    // read straight from the model (edits are already applied on view switch);
    // do NOT call fvCurrentSource() here as it mutates state.
    var src = fvModelSource();
    var html = fvWhich === 'metadata' ? src : PM.resolveImages(src, fvProject.images);
    setTimeout(function () { ifr.srcdoc = html; }, 0);
  }

  // The full stored source for the current file (no editor involved).
  function fvModelSource() {
    if (fvWhich === 'metadata') return fvProject.metadataHtml || '';
    if (fvWhich === 'extra') return (fvProject.extraFiles[fvExtraIdx] || {}).html || '';
    return fvProject.indexHtml || '';
  }

  // ---- Metadata "body only" editing helpers ----
  // When editing metadata, we show only the <body> inner content in the editor
  // (no <head>/<style>/<html> wrapper). On save we splice the edited body back
  // into the original document so styling/head are preserved.
  function bodyInner(html) {
    if (!html) return '';
    var m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return m ? m[1].trim() : html.trim();   // if no <body>, treat whole thing as body
  }
  // Replace the <body> inner content of `original` with `newInner`, WITHOUT
  // adding any extra whitespace/markup — only the user's content goes in.
  function withBodyInner(original, newInner) {
    if (original && /<body[^>]*>[\s\S]*?<\/body>/i.test(original)) {
      return original.replace(/(<body[^>]*>)[\s\S]*?(<\/body>)/i, function (full, open, close) {
        return open + newInner + close;
      });
    }
    return newInner;
  }
  // What the editor currently shows (used to detect real edits).
  var fvOriginalEditorText = '';
  // What the code editor should show for the current file?
  // metadata -> body-only; index & extra html files -> full document.
  function fvEditorText() {
    if (fvWhich === 'metadata') return bodyInner(fvProject.metadataHtml || '');
    return fvModelSource();
  }
  // Apply edited editor text back onto the project model — but ONLY if the user
  // actually changed it. If unchanged, leave the original document byte-for-byte
  // intact (preserves classes, styles, head, exact formatting).
  function fvApplyEditorText(text) {
    if (text === fvOriginalEditorText) return;   // no real change → don't touch original
    if (fvWhich === 'metadata') {
      fvProject.metadataHtml = withBodyInner(fvProject.metadataHtml || '', text);
    } else if (fvWhich === 'extra') {
      if (fvProject.extraFiles[fvExtraIdx]) fvProject.extraFiles[fvExtraIdx].html = text;
    } else {
      fvProject.indexHtml = text;
    }
    fvOriginalEditorText = text;                 // new baseline after applying
  }

  // source currently shown (live edits come from CM when in edit view)
  function fvCurrentSource() {
    if (fvView === 'edit' && fvCM) { fvApplyEditorText(fvCM.getValue()); }
    return fvModelSource();
  }

  function fvSetView(view) {
    fvView = view;
    $$('#fv-toggle button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === view); });
    if (view === 'edit') {
      $('#fv-body').style.display = 'none';
      $('#fv-edit-host').style.display = 'flex';   // matches CSS flex layout
      var cm = fvEnsureCM();
      if (cm) {
        var text = fvEditorText();   // body-only for metadata, full HTML for index
        fvOriginalEditorText = text; // baseline for change detection
        cm.setValue(text);
        // refresh AFTER the host is laid out so CodeMirror measures real height
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { cm.refresh(); cm.focus(); });
        });
      }
    } else {
      // sync any edits back onto the model before showing the preview
      if (fvCM) { fvApplyEditorText(fvCM.getValue()); }
      $('#fv-edit-host').style.display = 'none';
      $('#fv-body').style.display = 'block';
      fvRenderPreview();
    }
  }

  function openFile(p, which, extraIdx) {
    fvProject = p; fvWhich = which; fvView = 'preview'; fvOriginalEditorText = '';
    fvExtraIdx = (which === 'extra') ? (extraIdx == null ? -1 : extraIdx) : -1;

    var title, sub;
    if (which === 'metadata') {
      title = 'metadata.html';
      sub = 'Email metadata (recipient, sender, subject, preview). Switch to Edit code to change it.';
    } else if (which === 'extra') {
      title = (p.extraFiles[fvExtraIdx] || {}).path || 'file.html';
      sub = 'Additional HTML file from the package. Switch to Edit code to change it.';
    } else {
      title = 'index.html';
      sub = 'Rendered preview of the email body.';
    }
    $('#fv-title').textContent = 'distribution/' + title;
    $('#fv-sub').textContent = sub;

    // both files are editable now -> show the Preview / Edit toggle
    $('#fv-toggle').style.display = 'flex';
    $$('#fv-toggle button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-view') === 'preview'); });

    // footer: Close + Save (Save persists edits)
    var foot = $('#fv-foot');
    foot.innerHTML = '<button class="btn ghost" id="fv-close">Close</button>' +
                     '<button class="btn primary" id="fv-save">Save changes</button>';
    $('#fv-close').addEventListener('click', closeFile);
    $('#fv-save').addEventListener('click', fvSave);

    $('#fv-edit-host').style.display = 'none';
    fvRenderPreview();
    showModal('#modal-file');
  }

  function fvSave() {
    // fvCurrentSource() pulls the latest editor text and (for metadata) splices
    // it back into the full document, preserving head/style.
    fvCurrentSource();
    try {
      PM.upsertProject(fvProject);
      render();   // refresh card thumbnails to reflect changes
      toast('Saved', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  function openImage(img) {
    fvProject = null; fvWhich = null; fvExtraIdx = -1;
    $('#fv-title').textContent = 'distribution/images/' + img.name;
    $('#fv-sub').textContent = 'Image asset';
    $('#fv-toggle').style.display = 'none';
    $('#fv-edit-host').style.display = 'none';
    var body = $('#fv-body');
    body.style.display = 'flex'; body.style.alignItems = 'center'; body.style.justifyContent = 'center';
    body.style.padding = '20px'; body.style.background = '#0e0c0a';
    body.innerHTML = '<img src="' + img.dataUrl + '" alt="' + PM.escapeHtml(img.name) + '" style="max-width:100%;max-height:54vh;border-radius:6px;" />';
    $('#fv-foot').innerHTML = '<button class="btn ghost" id="fv-close">Close</button>';
    $('#fv-close').addEventListener('click', closeFile);
    showModal('#modal-file');
  }

  function closeFile() {
    hideModal('#modal-file');
    var body = $('#fv-body');
    body.style.display = ''; body.style.padding = ''; body.style.background = '#fff';
    body.innerHTML = '';
    $('#fv-edit-host').style.display = 'none';
    fvProject = null; fvWhich = null; fvExtraIdx = -1; fvView = "preview";
  }

  /* ------------------------------- Export -------------------------------- */
  function doExport(p) {
    toast('Building package…');
    PM.exportProject(p).then(function (fn) {
      toast('Exported ' + fn, 'ok');
    }).catch(function (e) { toast('Export failed: ' + e.message, 'err'); });
  }

  /* ------------------------------ Upload --------------------------------- */
  function handleZip(file) {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) { toast('Please choose a .zip package', 'err'); return; }
    toast('Reading package…');
    PM.readPackage(file).then(function (proj) {
      // if mjml present and compiler available, refresh index.html from mjml
      if (proj.mode === 'mjml' && proj.mjml && PM.hasMjmlCompiler()) {
        var r = PM.mjmlToHtml(proj.mjml);
        if (r.html) proj.indexHtml = r.html;
      }
      PM.upsertProject(proj);
      render();
      toast('Imported "' + proj.name + '" (' + proj.mode.toUpperCase() + ')', 'ok');
    }).catch(function (e) { toast('Import failed: ' + e.message, 'err'); });
  }

  /* ---------------------------- New email -------------------------------- */
  var chosenMode = 'mjml';

  function populateCountryBrand() {
    var BS = window.BrandStyles;
    if (!BS) return;
    var cSel = $('#new-country'), bSel = $('#new-brand');
    if (cSel && cSel.options.length <= 1) {
      BS.COUNTRIES.forEach(function (c) {
        var o = document.createElement('option');
        o.value = c.value; o.textContent = c.label; cSel.appendChild(o);
      });
    }
    if (bSel && bSel.options.length <= 1) {
      BS.BRANDS.forEach(function (b) {
        var o = document.createElement('option');
        o.value = b.value; o.textContent = b.label; bSel.appendChild(o);
      });
    }
  }

  function showStep(n) {
    $('#new-step1').style.display = (n === 1) ? '' : 'none';
    $('#new-step2').style.display = (n === 2) ? '' : 'none';
  }

  function openNew() {
    chosenMode = 'mjml';
    $$('#choice button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === 'mjml'); });
    $('#new-name').value = 'Untitled Email';
    populateCountryBrand();
    $('#new-country').value = '';
    $('#new-brand').value = '';
    var err = $('#new-cb-err'); if (err) err.style.display = 'none';
    showStep(1);
    showModal('#modal-new');
    setTimeout(function () { $('#new-name').focus(); $('#new-name').select(); }, 60);
  }

  function gotoCountryBrand() {
    showStep(2);
    setTimeout(function () { $('#new-country').focus(); }, 60);
  }

  function createNew() {
    var country = $('#new-country').value;
    var brand = $('#new-brand').value;
    var err = $('#new-cb-err');
    // Both country and brand are mandatory.
    if (!country || !brand) {
      if (err) err.style.display = 'block';
      if (!country) $('#new-country').focus(); else $('#new-brand').focus();
      return;
    }
    if (err) err.style.display = 'none';

    var name = ($('#new-name').value || 'Untitled Email').trim();
    var proj = PM.newProject(name, chosenMode, country, brand);
    // compile initial mjml -> index for accurate first thumbnail
    if (proj.mode === 'mjml' && PM.hasMjmlCompiler()) {
      var r = PM.mjmlToHtml(proj.mjml);
      if (r.html) proj.indexHtml = r.html;
    }
    PM.upsertProject(proj);
    hideModal('#modal-new');
    render();
    openInEditor(proj.id);
  }

  /* ------------------------------ Modals --------------------------------- */
  function showModal(sel) { $(sel).classList.add('show'); }
  function hideModal(sel) { $(sel).classList.remove('show'); }

  /* ------------------------------- Wire up ------------------------------- */
  function init() {
    if (!PM) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#fff">Failed to load app scripts.</p>'; return; }

    // upload card
    $('#card-upload').addEventListener('click', function () { $('#zip-input').click(); });
    $('#card-upload').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#zip-input').click(); } });
    $('#zip-input').addEventListener('change', function (e) { handleZip(e.target.files[0]); e.target.value = ''; });

    // drag & drop anywhere on upload card
    var up = $('#card-upload');
    ['dragover', 'dragenter'].forEach(function (ev) { up.addEventListener(ev, function (e) { e.preventDefault(); up.style.borderColor = 'var(--amber)'; }); });
    ['dragleave', 'drop'].forEach(function (ev) { up.addEventListener(ev, function (e) { e.preventDefault(); up.style.borderColor = ''; }); });
    up.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files[0]) handleZip(e.dataTransfer.files[0]); });

    // new card
    $('#card-new').addEventListener('click', openNew);
    $('#card-new').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNew(); } });

    // choice toggles
    $$('#choice button').forEach(function (b) {
      b.addEventListener('click', function () {
        chosenMode = b.getAttribute('data-mode');
        $$('#choice button').forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    });
    $('#new-cancel').addEventListener('click', function () { hideModal('#modal-new'); });
    $('#new-next').addEventListener('click', gotoCountryBrand);
    $('#new-back').addEventListener('click', function () { showStep(1); });
    $('#new-create').addEventListener('click', createNew);
    $('#new-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') gotoCountryBrand(); });
    var cbErrClear = function () { var err = $('#new-cb-err'); if (err) err.style.display = 'none'; };
    $('#new-country').addEventListener('change', cbErrClear);
    $('#new-brand').addEventListener('change', cbErrClear);

    // close modals on backdrop / escape
    $$('.modal-bg').forEach(function (bg) {
      bg.addEventListener('click', function (e) { if (e.target === bg) { bg.classList.remove('show'); } });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.modal-bg').forEach(function (m) { m.classList.remove('show'); }); });

    // clear all data
    var clearBtn = $('#btn-clear-data');
    if (clearBtn) clearBtn.addEventListener('click', clearAllData);

    // file modal: Preview / Edit code toggle
    $$('#fv-toggle button').forEach(function (b) {
      b.addEventListener('click', function () { fvSetView(b.getAttribute('data-view')); });
    });

    render();
  }

  /* --------------------------- Clear all data ---------------------------- */
  function clearAllData() {
    var list = PM.loadAll();
    if (!list.length) { toast('No saved data to clear'); return; }
    if (!confirm('Clear ALL saved projects and uploaded data? This permanently removes ' +
                 list.length + ' project' + (list.length === 1 ? '' : 's') +
                 ' from this browser and cannot be undone.\n\nExport anything you want to keep first.')) return;
    // remove every project (and clear current selection + any preview payload)
    list.forEach(function (p) { PM.deleteProject(p.id); });
    PM.setCurrent('');
    try { sessionStorage.removeItem('postmark.preview'); } catch (e) {}
    render();
    toast('All data cleared', 'ok');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
