/* ==========================================================================
   blocks-page.js — Custom Blocks manager.
   Create / edit / delete reusable blocks that show up in the editor's Blocks
   panel. Persisted in localStorage via window.Postmark block API.
   ========================================================================== */
(function () {
  'use strict';
  var PM = window.Postmark;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var cm = null;            // CodeMirror instance
  var editingId = null;     // id of block currently open (null = new)

  /* ------------------------------- Toast --------------------------------- */
  function toast(msg, kind) {
    var host = $('#toast-host');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s'; el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) host.removeChild(el); }, 320);
    }, 2400);
  }

  /* ------------------------------ List ----------------------------------- */
  function renderList() {
    var host = $('#bp-items');
    var empty = $('#bp-empty');
    var blocks = PM.loadBlocks();
    host.innerHTML = '';
    if (!blocks.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    blocks.forEach(function (b) {
      var div = document.createElement('div');
      div.className = 'bp-item' + (b.id === editingId ? ' active' : '');
      var modeLabel = b.mode === 'mjml' ? 'MJML' : (b.mode === 'html' ? 'HTML' : 'MJML & HTML');
      div.innerHTML =
        '<div class="bp-item-name"></div>' +
        '<div class="bp-item-meta"></div>';
      div.querySelector('.bp-item-name').textContent = b.name || 'Untitled block';
      div.querySelector('.bp-item-meta').textContent = (b.category || 'Custom') + ' · ' + modeLabel;
      div.addEventListener('click', function () { openBlock(b.id); });
      host.appendChild(div);
    });
  }

  /* ------------------------------ Editor --------------------------------- */
  function ensureCM() {
    if (cm) return cm;
    var host = $('#bp-content-editor');
    var ta = document.createElement('textarea');
    host.appendChild(ta);
    cm = window.CodeMirror.fromTextArea(ta, {
      lineNumbers: true,
      theme: 'material-darker',
      mode: 'xml',
      lineWrapping: true,
      autoCloseTags: true,
      matchBrackets: true,
      tabSize: 2,
      indentUnit: 2
    });
    cm.setSize('100%', '320px');
    return cm;
  }

  function showEditor(show) {
    $('#bp-editor').style.display = show ? 'block' : 'none';
    $('#bp-editor-empty').style.display = show ? 'none' : 'flex';
  }

  function setMode(modeVal) {
    var c = ensureCM();
    // MJML uses xml highlighting; html uses htmlmixed
    c.setOption('mode', modeVal === 'html' ? 'htmlmixed' : 'xml');
  }

  function newBlock() {
    editingId = null;
    $('#bp-name').value = '';
    $('#bp-category').value = 'Custom';
    $('#bp-mode').value = 'both';
    ensureCM().setValue('');
    setMode('both');
    $('#bp-delete').style.display = 'none';
    showEditor(true);
    renderList();
    setTimeout(function () { $('#bp-name').focus(); ensureCM().refresh(); }, 40);
  }

  function openBlock(id) {
    var b = PM.getBlock(id);
    if (!b) return;
    editingId = id;
    $('#bp-name').value = b.name || '';
    $('#bp-category').value = b.category || 'Custom';
    $('#bp-mode').value = b.mode || 'both';
    ensureCM().setValue(b.content || '');
    setMode(b.mode || 'both');
    $('#bp-delete').style.display = '';
    showEditor(true);
    renderList();
    setTimeout(function () { ensureCM().refresh(); }, 40);
  }

  function saveBlock() {
    var name = ($('#bp-name').value || '').trim();
    var content = ensureCM().getValue().trim();
    if (!name) { toast('Give the block a name', 'warn'); $('#bp-name').focus(); return; }
    if (!content) { toast('Block content is empty', 'warn'); return; }
    var block = {
      id: editingId || null,
      name: name,
      category: ($('#bp-category').value || 'Custom').trim() || 'Custom',
      mode: $('#bp-mode').value || 'both',
      content: content
    };
    try {
      var saved = PM.upsertBlock(block);
      editingId = saved.id;
      toast('Block saved', 'ok');
      renderList();
      $('#bp-delete').style.display = '';
    } catch (e) {
      toast(e.message || 'Could not save block', 'warn');
    }
  }

  function deleteBlock() {
    if (!editingId) return;
    if (!window.confirm('Delete this block? This cannot be undone.')) return;
    PM.deleteBlock(editingId);
    editingId = null;
    toast('Block deleted', 'ok');
    showEditor(false);
    renderList();
  }

  /* ------------------------------ Wire ----------------------------------- */
  function init() {
    if (!PM) { toast('Storage unavailable', 'warn'); return; }
    renderList();
    $('#bp-new').addEventListener('click', newBlock);
    $('#bp-save').addEventListener('click', saveBlock);
    $('#bp-cancel').addEventListener('click', function () { showEditor(false); editingId = null; renderList(); });
    $('#bp-delete').addEventListener('click', deleteBlock);
    $('#bp-mode').addEventListener('change', function () { setMode($('#bp-mode').value); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
