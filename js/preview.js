/* Postmark — preview page logic */
(function () {
  'use strict';

  var KEY = 'postmark.preview';
  var els = {
    name:  document.getElementById('pvName'),
    mode:  document.getElementById('pvMode'),
    seg:   document.getElementById('pvSeg'),
    edit:  document.getElementById('pvEdit'),
    close: document.getElementById('pvClose'),
    wrap:  document.getElementById('pvWrap'),
    frame: document.getElementById('pvFrame'),
    empty: document.getElementById('pvEmpty')
  };

  var payload = null;
  try {
    var raw = sessionStorage.getItem(KEY);
    if (raw) payload = JSON.parse(raw);
  } catch (e) {
    payload = null;
  }

  if (!payload || !payload.html) {
    els.wrap.style.display = 'none';
    els.empty.style.display = 'block';
    els.name.textContent = 'Preview';
    els.mode.textContent = '—';
    wireButtons(null);
    return;
  }

  els.name.textContent = payload.name || 'Preview';
  els.mode.textContent = (payload.mode || 'html').toUpperCase();

  // Render the email HTML into the sandboxed iframe.
  els.frame.srcdoc = payload.html;

  // Device toggle
  els.seg.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-device]');
    if (!btn) return;
    var buttons = els.seg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('on');
    btn.classList.add('on');
    if (btn.getAttribute('data-device') === 'mobile') {
      els.wrap.classList.add('mobile');
    } else {
      els.wrap.classList.remove('mobile');
    }
  });

  wireButtons(payload);

  function wireButtons(p) {
    els.edit.addEventListener('click', function () {
      var id = p && p.id ? p.id : null;
      if (id) {
        window.location.href = 'editor.html?id=' + encodeURIComponent(id);
      } else {
        window.location.href = 'index.html';
      }
    });
    els.close.addEventListener('click', function () {
      // If opened in a new tab, close it; otherwise go back to dashboard.
      window.close();
      setTimeout(function () {
        if (!window.closed) window.location.href = 'index.html';
      }, 120);
    });
  }
})();
