/* ==========================================================================
   editor.js — Custom GrapesJS email editor.
   Layout:
     - TOP bar: device switch, undo/redo, zoom, reset, preview, code, save, export
     - LEFT panel: tabs [ Blocks+Templates | Layers ]
     - CANVAS: center
     - RIGHT panel: selected component properties (settings + style) only
   Modes:
     - 'mjml'  -> grapesjs-mjml plugin, loads a dummy MJML template (no import modal)
     - 'html'  -> grapesjs-preset-newsletter, table-based HTML
   Depends on: window.grapesjs, plugin globals, window.Postmark, window.JSZip.
   ========================================================================== */
(function () {
  'use strict';
  var PM = window.Postmark;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var editor = null;
  var project = null;
  var mode = 'html';
  var zoom = 100;

  /* ------------------------------- Toast --------------------------------- */
  function toast(msg, kind) {
    var host = $('#toast-host');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .3s'; el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) host.removeChild(el); }, 320); }, 2600);
  }
  function overlay(show, msg, sub) {
    var o = $('#overlay');
    if (!o) return;
    if (!show) { o.classList.add('hide'); return; }
    o.classList.remove('hide');
    if (msg) $('#ovl-msg').textContent = msg;
    $('#ovl-sub').textContent = sub || '';
    o.querySelector('.spinner').style.display = sub ? 'none' : '';
  }

  /* ------------------------- Load project from URL ----------------------- */
  function getId() {
    var m = location.search.match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : (PM ? PM.getCurrent() : '');
  }

  /* ----------------------- Email block whitelist ------------------------- */
  // Inline SVG placeholders (data-URIs) so nothing loads from the network.
  var IMG_PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="180"><rect width="100%" height="100%" fill="#eef0f2"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#8a8073" font-family="Helvetica,Arial,sans-serif" font-size="16">Image</text></svg>'
  );
  var LOGO_PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="130" height="36"><rect width="100%" height="100%" fill="#14110e"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#e8a24c" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700">LOGO</text></svg>'
  );

  // Only blocks relevant to email development (mirrors GrapesJS Studio email).
  var MJML_BLOCKS = [
    'mj-1-column', 'mj-2-columns', 'mj-3-columns',
    'mj-text', 'mj-button', 'mj-image', 'mj-divider', 'mj-spacer',
    'mj-social', 'mj-navbar', 'mj-hero', 'mj-wrapper'
  ];

  // Predefined custom section templates (drag-in ready) for MJML mode.
  var MJML_TEMPLATES = [
    {
      id: 'tpl-hero', label: 'Hero + CTA', category: 'Templates',
      content:
        '<mj-section background-color="#ffffff" padding="32px 24px">' +
        '<mj-column>' +
        '<mj-text font-size="26px" font-weight="700" color="#1a1a1a" font-family="Helvetica,Arial,sans-serif" align="center">Big bold headline</mj-text>' +
        '<mj-text font-size="15px" color="#666666" line-height="1.6" align="center" padding="8px 0 18px">A short supporting sentence that explains the value in one line.</mj-text>' +
        '<mj-button background-color="#e8a24c" color="#2a1c08" font-weight="700" border-radius="6px" href="#" align="center">Get started</mj-button>' +
        '</mj-column></mj-section>'
    },
    {
      id: 'tpl-2col', label: 'Two-column feature', category: 'Templates',
      content:
        '<mj-section background-color="#ffffff" padding="24px">' +
        '<mj-column width="50%"><mj-image src="' + IMG_PLACEHOLDER + '" border-radius="6px" /></mj-column>' +
        '<mj-column width="50%" vertical-align="middle">' +
        '<mj-text font-size="18px" font-weight="700" color="#1a1a1a">Feature title</mj-text>' +
        '<mj-text font-size="14px" color="#666666" line-height="1.6">Describe the feature here in a sentence or two so it reads cleanly on mobile.</mj-text>' +
        '</mj-column></mj-section>'
    },
    {
      id: 'tpl-header', label: 'Logo header', category: 'Templates',
      content:
        '<mj-section background-color="#14110e" padding="18px 24px">' +
        '<mj-column><mj-image width="130px" src="' + LOGO_PLACEHOLDER + '" align="center" /></mj-column>' +
        '</mj-section>'
    },
    {
      id: 'tpl-footer', label: 'Footer', category: 'Templates',
      content:
        '<mj-section background-color="#f4f4f4" padding="24px">' +
        '<mj-column>' +
        '<mj-text align="center" font-size="12px" color="#999999" line-height="1.6">You received this email because you signed up.<br/>123 Street Name, City · <a href="#" style="color:#999;">Unsubscribe</a></mj-text>' +
        '<mj-social font-size="12px" icon-size="22px" mode="horizontal" align="center">' +
        '<mj-social-element name="facebook" href="#"></mj-social-element>' +
        '<mj-social-element name="twitter" href="#"></mj-social-element>' +
        '<mj-social-element name="instagram" href="#"></mj-social-element>' +
        '</mj-social></mj-column></mj-section>'
    }
  ];

  /* ----------------------------- Init flow ------------------------------- */
  function init() {
    if (!PM || !window.grapesjs) {
      overlay(true, 'Failed to load editor', 'GrapesJS or app scripts did not load from /vendor. Make sure you are serving the folder over http:// (not file://).');
      return;
    }
    var id = getId();
    project = id ? PM.getProject(id) : null;
    if (!project) {
      overlay(true, 'Project not found', 'Return to the dashboard and open a project from there.');
      return;
    }
    mode = project.mode === 'mjml' ? 'mjml' : 'html';

    $('#doc-name').textContent = project.name;
    $('.mode-text', $('#doc-mode')).textContent = mode === 'mjml' ? 'MJML' : 'HTML';
    $('#doc-mode .dot').className = 'dot ' + mode;

    try {
      mode === 'mjml' ? bootMjml() : bootHtml();
    } catch (e) {
      overlay(true, 'Editor failed to start', e.message);
    }
  }

  /* --------------------- Common GrapesJS base config --------------------- */
  function baseConfig() {
    return {
      container: '#gjs',
      height: '100%',
      width: 'auto',
      fromElement: false,
      storageManager: false,
      // Mount managers into our own panel containers (custom layout)
      blockManager: { appendTo: '#blocks' },
      layerManager: { appendTo: '#layers' },
      // Mount the selector (Classes) manager into its OWN dedicated container.
      // Because it has an explicit mount, the style manager won't also render a
      // second copy, so the "Classes" box appears exactly once (in #selectors).
      // NOTE: do NOT set componentFirst:true here — with it on, the Style panel
      // edits the element itself instead of its active class, so predefined
      // brand classes look like they "don't apply". Leaving it off makes the
      // Style panel target the selected/active class (standard GrapesJS).
      selectorManager: { appendTo: '#selectors' },
      styleManager: { appendTo: '#styles' },
      traitManager: { appendTo: '#traits' },
      panels: { defaults: [] }, // we build our own top bar; suppress default panels
      // Keep rich-text content INSIDE the text component instead of parsing it
      // into child Text/Link components on the layer tree (matches GrapesJS
      // Studio email behaviour). Without this, editing a Text and adding a link
      // or line creates nested "Text -> Link / Text -> Text" elements.
      components: { disableTextInnerChilds: true },
      // Paste as PLAIN TEXT only — strip any copied formatting / inline styles.
      // The default RTE keeps source HTML when the clipboard has text/html; this
      // override always inserts the plain-text version instead.
      richTextEditor: {
        onPaste: function (data) {
          var ev = data.ev;
          var rte = data.rte;
          var cb = ev.clipboardData || window.clipboardData;
          var text = cb ? (cb.getData('text/plain') || cb.getData('text') || '') : '';
          if (!text) return; // nothing to paste; let default run
          ev.preventDefault();

          // The text is edited INSIDE the canvas iframe, so we must operate on
          // the iframe's own document — not the parent page document.
          var doc = (rte && rte.doc) || document;

          // Try the iframe document's execCommand first.
          var ok = false;
          try {
            doc.defaultView && doc.defaultView.focus && doc.defaultView.focus();
            ok = doc.execCommand('insertText', false, text);
          } catch (e) { ok = false; }

          // Fallback: insert plain text at the current caret/selection manually.
          if (!ok) {
            try {
              var sel = doc.getSelection ? doc.getSelection() : null;
              if (sel && sel.rangeCount) {
                var range = sel.getRangeAt(0);
                range.deleteContents();
                // split on newlines so line breaks are preserved as <br>
                var parts = text.split(/\r\n|\r|\n/);
                var frag = doc.createDocumentFragment();
                for (var i = 0; i < parts.length; i++) {
                  if (i > 0) frag.appendChild(doc.createElement('br'));
                  frag.appendChild(doc.createTextNode(parts[i]));
                }
                range.insertNode(frag);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            } catch (e2) {}
          }
        }
      },
      assetManager: {
        assets: (project.images || []).map(function (im) { return im.dataUrl; }),
        upload: false,
        uploadText: 'Paste an image URL into a selected image block'
      },
      deviceManager: {
        devices: [
          { id: 'desktop', name: 'Desktop', width: '' },
          { id: 'tablet', name: 'Tablet', width: '600px', widthMedia: '768px' },
          { id: 'mobile', name: 'Mobile', width: '375px', widthMedia: '480px' }
        ]
      }
    };
  }

  function resolvePlugin(glob) { return (glob && (glob.default || glob)) || null; }
  function registerPlugin(id, glob) {
    var fn = resolvePlugin(glob);
    if (!fn) return null;
    try { window.grapesjs.plugins.add(id, fn); } catch (e) {}
    return id;
  }

  /* ------------------------------ MJML boot ------------------------------ */
  function bootMjml() {
    var id = registerPlugin('gjs-mjml', window['grapesjs-mjml']);
    if (!id) throw new Error('grapesjs-mjml plugin not loaded.');
    var cfg = baseConfig();
    cfg.plugins = [id];
    cfg.pluginsOpts = {};
    cfg.pluginsOpts[id] = {
      resetBlocks: true,
      resetDevices: true,
      resetStyleManager: true,
      blocks: MJML_BLOCKS,          // restrict to email-only blocks
      columnsPadding: '10px 0',
      imagePlaceholderSrc: IMG_PLACEHOLDER  // local placeholder (no network)
    };
    editor = window.grapesjs.init(cfg);

    editor.on('load', function () {
      // Load the dummy MJML template directly into the canvas (NO import modal).
      // The plugin registers MJML parsers, so setComponents parses mj-* tags.
      var src = (project.mjml && /<mjml/i.test(project.mjml)) ? project.mjml : PM.defaultMjml();
      loadMjml(src);
      addTemplateBlocks();
      afterLoad();
    });
  }

  // Load MJML markup into the canvas without opening any modal.
  function loadMjml(src) {
    try {
      editor.setComponents(src);
    } catch (e) {
      try { editor.runCommand('mjml-import', { result: src, noInput: true }); } catch (e2) {}
    }
  }

  /* ------------------------------ HTML boot ------------------------------ */
  function bootHtml() {
    var id = registerPlugin('gjs-newsletter', window['grapesjs-preset-newsletter']);
    if (!id) throw new Error('grapesjs-preset-newsletter plugin not loaded.');
    var cfg = baseConfig();
    cfg.plugins = [id];
    cfg.pluginsOpts = {};
    cfg.pluginsOpts[id] = {
      modalLabelImport: 'Paste your HTML here',
      modalLabelExport: 'Copy the HTML',
      importPlaceholder: '',
      cellStyle: { 'font-size': '14px', 'font-family': 'Helvetica, Arial, sans-serif' }
    };
    editor = window.grapesjs.init(cfg);

    editor.on('load', function () {
      var html = PM.resolveImages(project.indexHtml || '', project.images);
      try { editor.setComponents(html); } catch (e) {}
      addTemplateBlocks();
      afterLoad();
    });
  }

  /* ------------------- Predefined template blocks (MJML) ----------------- */
  function addTemplateBlocks() {
    var bm = editor.BlockManager;
    var tplMedia = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></svg>';

    // Built-in MJML section templates (MJML mode only).
    if (mode === 'mjml') {
      MJML_TEMPLATES.forEach(function (t) {
        bm.add(t.id, {
          label: t.label,
          category: t.category,
          content: t.content,
          media: tplMedia
        });
      });
    }

    // User-defined custom blocks (from the Custom Blocks page), filtered to the
    // current editor mode. These appear under a "Custom" category.
    addCustomBlocks();
  }

  // Load saved custom blocks for the current mode into the Blocks panel.
  function addCustomBlocks() {
    if (!PM || !PM.blocksForMode) return;
    var bm = editor.BlockManager;
    var customMedia = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>';
    var blocks = PM.blocksForMode(mode) || [];
    blocks.forEach(function (b) {
      if (!b || !b.content) return;
      // remove any stale copy first so edits on the page reflect on reload
      try { if (bm.get(b.id)) bm.remove(b.id); } catch (e) {}
      bm.add(b.id, {
        label: b.name || 'Custom block',
        category: b.category || 'Custom',
        content: b.content,
        media: customMedia
      });
    });
  }

  /* --------------------------- After-load wiring ------------------------- */
  function afterLoad() {
    overlay(false);
    stripDefaultPanels();
    loadBrandCss();
    setupMjmlClassBridge();
    setupCloneIds();
    setupImageVisibilityTrait();
    setupLayerCode();
    wireToolbar();
    wireLeftTabs();
    wireSelection();
    setDevice('desktop');
    applyZoom();
    toast('Editor ready — ' + (mode === 'mjml' ? 'MJML' : 'HTML') + ' mode', 'ok');
  }

  // Load the selected brand's predefined classes into GrapesJS's CSS Composer
  // as REAL, editable rules. Without this, the brand CSS only exists as raw
  // text in the internal <style> and GrapesJS may not paint it on the canvas
  // or link it to the Classes UI — so applying a predefined class looked like
  // it had no effect. addRules() parses the CSS into live rules.
  function loadBrandCss() {
    try {
      var BS = window.BrandStyles;
      if (!BS || !project || !project.brand) return;
      var css = BS.getBrandCss(project.brand);
      if (!css) return;
      if (editor.Css && editor.Css.addRules) {
        editor.Css.addRules(css);
      } else if (editor.addStyle) {
        editor.addStyle(css);
      }
    } catch (e) {}
  }

  // In MJML mode, the class that actually ends up in the rendered HTML comes
  // from each mj-* component's "css-class" ATTRIBUTE, not from GrapesJS's normal
  // class list. So when a user adds/removes a class in the Classes box, MJML
  // ignores it — the class never appears in the output and brand CSS like
  // ".mj-button" never applies. This bridge mirrors a component's GrapesJS
  // classes into its css-class attribute whenever they change (and on select),
  // so the class shows up in the code AND the predefined CSS takes effect.
  function setupMjmlClassBridge() {
    if (mode !== 'mjml') return;

    function syncClasses(comp) {
      if (!comp || !comp.getClasses) return;
      try {
        var classes = comp.getClasses() || [];
        var attrs = comp.getAttributes() || {};
        var cur = (attrs['css-class'] || '').trim();
        var next = classes.join(' ').trim();
        if (cur !== next) {
          if (next) comp.addAttributes({ 'css-class': next });
          else comp.removeAttributes ? comp.removeAttributes('css-class') : comp.addAttributes({ 'css-class': '' });
        }
      } catch (e) {}
    }

    editor.on('component:update:classes', syncClasses);
    editor.on('component:selected', syncClasses);
    // also catch programmatic add/remove via the selector manager
    editor.on('selector:add', function () {
      var sel = editor.getSelected();
      if (sel) syncClasses(sel);
    });
  }

  // When a component is copy/pasted or duplicated, GrapesJS keeps ids unique by
  // appending "-2" to the existing id; doing it again yields "-2-2", "-2-2-2"…
  // This rewrites cloned ids to a clean, single unique id (e.g. "hero" -> the
  // base name + a short unique suffix) for the cloned component and all of its
  // descendants.
  function setupCloneIds() {
    var seen = {};

    function baseOf(id) {
      // strip any trailing "-<number>" repeats GrapesJS may have added
      return String(id || '').replace(/(?:-\d+)+$/, '');
    }
    function uniqueFrom(base) {
      var root = base || 'el';
      var candidate = root;
      var n = 2;
      // ensure uniqueness against ids already used in this session and in DOM
      while (seen[candidate] || idExists(candidate)) {
        candidate = root + '-' + n;
        n++;
      }
      seen[candidate] = true;
      return candidate;
    }
    function idExists(id) {
      try {
        var body = editor.getWrapper();
        if (!body) return false;
        // search the component tree for an existing id
        var found = false;
        (function walk(c) {
          if (found || !c) return;
          var cid = c.getId && c.getId();
          if (cid === id) { found = true; return; }
          var kids = c.components && c.components();
          if (kids) kids.each(function (k) { walk(k); });
        })(body);
        return found;
      } catch (e) { return false; }
    }
    function rewrite(comp) {
      if (!comp) return;
      try {
        var cur = comp.getId && comp.getId();
        if (cur && /(?:-\d+)+$/.test(cur)) {
          comp.setId(uniqueFrom(baseOf(cur)));
        }
      } catch (e) {}
      var kids = comp.components && comp.components();
      if (kids) kids.each(function (k) { rewrite(k); });
    }

    editor.on('component:clone', function (comp) {
      // run after GrapesJS finishes assigning its own suffixed ids
      setTimeout(function () { rewrite(comp); }, 0);
    });
  }

  // The newsletter / mjml plugins re-create GrapesJS's default panels (the
  // "options", "views", "commands", "devices" toolbars) AFTER init, so the
  // panels:{defaults:[]} option isn't enough on its own. Remove them here so
  // only our custom top bar remains.
  function stripDefaultPanels() {
    try {
      var panels = editor.Panels;
      var ids = ['options', 'views', 'views-container', 'commands', 'devices-c', 'devices'];
      ids.forEach(function (id) {
        var p = panels.getPanel(id);
        if (p) panels.removePanel(id);
      });
      // remove any leftover panel buttons that re-added themselves
      ['open-blocks','open-layers','open-sm','open-tm','sw-visibility','preview',
       'fullscreen','export-template','open-import','gjs-toggle-images','undo','redo',
       'import','set-device-desktop','set-device-tablet','set-device-mobile'
      ].forEach(function (btnId) {
        ['options','views','commands','devices-c'].forEach(function (pid) {
          var pnl = panels.getPanel(pid);
          if (pnl) { var b = pnl.get('buttons'); if (b && b.get(btnId)) b.remove(btnId); }
        });
      });
    } catch (e) {}
    // Hide the GrapesJS panel chrome wholesale via CSS as a guaranteed fallback.
    try {
      var doc = document;
      if (!doc.getElementById('pm-hide-default-panels')) {
        var st = doc.createElement('style');
        st.id = 'pm-hide-default-panels';
        st.textContent =
          '.gjs-pn-panel.gjs-pn-views-container,' +
          '.gjs-pn-panel.gjs-pn-views,' +
          '.gjs-pn-panel.gjs-pn-options,' +
          '.gjs-pn-panel.gjs-pn-commands,' +
          '.gjs-pn-panel.gjs-pn-devices-c { display: none !important; }' +
          // The selector/classes manager (the "Classes" box with the State
          // dropdown) can render twice inside the Style panel. Keep the first
          // one only and hide any subsequent duplicates.
          '#right-panel .gjs-clm-tags ~ .gjs-clm-tags { display: none !important; }';
        doc.head.appendChild(st);
      }
    } catch (e) {}
  }

  /* ---------------- Image visibility (desktop / mobile) trait ------------ */
  // Adds a "Visibility" dropdown to the right panel for image components that
  // toggles the classes "hide-for-large" / "show-for-large" directly on the
  // image tag, controlling whether the image shows on large (desktop) screens.
  function setupImageVisibilityTrait() {
    var VIS_CLASSES = ['hide-for-large', 'show-for-large'];

    // Custom trait that reads/writes component CSS classes (not an attribute).
    editor.TraitManager.addType('image-visibility', {
      // a simple <select>
      createInput: function () {
        var el = document.createElement('select');
        el.innerHTML =
          '<option value="">Always visible</option>' +
          '<option value="show-for-large">Desktop only (show-for-large)</option>' +
          '<option value="hide-for-large">Mobile only (hide-for-large)</option>';
        el.style.cssText = 'width:100%;background:#14110e;color:#f4ece1;border:1px solid #322b24;border-radius:6px;padding:7px 9px;font-size:12px;';
        return el;
      },
      // initial value from the component's current classes / css-class attr
      onUpdate: function (o) {
        var comp = o.component, el = o.elInput;
        var current = '';
        if (mode === 'mjml') {
          var cc = (comp.getAttributes()['css-class'] || '').split(/\s+/);
          VIS_CLASSES.forEach(function (c) { if (cc.indexOf(c) >= 0) current = c; });
        } else {
          VIS_CLASSES.forEach(function (c) { if (comp.getClasses().indexOf(c) >= 0) current = c; });
        }
        el.value = current;
      },
      // when the user picks an option, swap the classes on the component
      onEvent: function (o) {
        var comp = o.component, el = o.elInput;
        var chosen = el.value;
        if (mode === 'mjml') {
          // MJML compiles its "css-class" attribute into the output class=""
          var cc = (comp.getAttributes()['css-class'] || '').split(/\s+/).filter(Boolean);
          cc = cc.filter(function (c) { return VIS_CLASSES.indexOf(c) < 0; });
          if (chosen) cc.push(chosen);
          comp.addAttributes({ 'css-class': cc.join(' ').trim() });
        } else {
          VIS_CLASSES.forEach(function (c) { comp.removeClass(c); });
          if (chosen) comp.addClass(chosen);
        }
        save(true);
      }
    });

    // Attach the trait to every image component (existing + future).
    function addTraitTo(comp) {
      if (!comp || !comp.is) return;
      var type = comp.get('type');
      var tag = (comp.get('tagName') || '').toLowerCase();
      var isImage = type === 'image' || type === 'mj-image' || tag === 'img' || tag === 'mj-image';
      if (!isImage) return;
      var traits = comp.getTraits();
      var has = traits.some(function (t) { return t.get('name') === 'image-visibility'; });
      if (!has) {
        comp.addTrait({
          type: 'image-visibility',
          name: 'image-visibility',
          label: 'Visibility'
        });
      }
    }

    // existing components
    var wrapper = editor.getWrapper();
    if (wrapper) {
      var all = wrapper.find('img, mj-image');
      (all || []).forEach(addTraitTo);
      // also scan by component tree in case find misses mj-image
      wrapper.forEachChild ? wrapper.forEachChild(scan) : scanTree(wrapper);
    }
    function scanTree(c) {
      addTraitTo(c);
      var kids = c.components && c.components();
      if (kids) kids.forEach(scanTree);
    }
    function scan(c) { scanTree(c); }

    // future components (dragging in a new image)
    editor.on('component:add', function (comp) { addTraitTo(comp); });
    editor.on('component:create', function (comp) { addTraitTo(comp); });
  }

  /* ----------------------- Get current HTML + MJML ----------------------- */
  function wrapDoc(bodyHtml, css) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      (css ? '<style>' + css + '</style>' : '') +
      '</head><body style="margin:0;padding:0;">' + (bodyHtml || '') + '</body></html>';
  }

  // CSS that powers the show-for-large / hide-for-large image classes.
  // "large" = desktop (>600px). On mobile (<=600px) the rules flip.
  var VISIBILITY_CSS =
    '/* responsive image visibility */\n' +
    '.show-for-large{display:none !important;max-height:0;overflow:hidden;mso-hide:all;}\n' +
    '@media only screen and (min-width:601px){' +
      '.show-for-large{display:block !important;max-height:none !important;overflow:visible !important;}' +
      '.hide-for-large{display:none !important;max-height:0 !important;overflow:hidden !important;mso-hide:all;}' +
    '}\n';

  // Inject VISIBILITY_CSS into the <head> of a full HTML document (only if the
  // doc actually uses one of the classes, to avoid bloating every email).
  function injectVisibilityCss(html) {
    if (!html || (html.indexOf('hide-for-large') === -1 && html.indexOf('show-for-large') === -1)) return html;
    var styleTag = '<style type="text/css">' + VISIBILITY_CSS + '</style>';
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, styleTag + '</head>');
    if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, '$1' + styleTag);
    return styleTag + html;
  }

  function currentHtml() {
    if (mode === 'mjml') {
      var compiled = compileMjml();
      if (compiled) return compiled;
    }
    var inner = editor.getHtml();
    var css = '';
    try { css = editor.getCss(); } catch (e) {}
    return wrapDoc(inner, css);
  }

  function currentMjml() {
    if (mode !== 'mjml') return null;
    // IMPORTANT: use 'mjml-code' (returns the MJML string silently).
    // Do NOT use 'mjml-export' / 'export-template' — those OPEN the export modal
    // as a side effect, which would pop up on every autosave/selection.
    try {
      var src = editor.runCommand('mjml-code');
      if (typeof src === 'string' && src.indexOf('<mj') !== -1) {
        return src.indexOf('<mjml') === -1 ? ('<mjml><mj-body>' + src + '</mj-body></mjml>') : src;
      }
    } catch (e) {}
    // fallback: build from getHtml (also silent)
    try {
      var h = editor.getHtml();
      if (typeof h === 'string' && h.indexOf('<mj') !== -1) {
        return h.indexOf('<mjml') === -1 ? ('<mjml><mj-body>' + h + '</mj-body></mjml>') : h;
      }
    } catch (e) {}
    return project.mjml;
  }

  function compileMjml() {
    try {
      var r = editor.runCommand('mjml-code-to-html');
      if (r && typeof r.html === 'string' && r.html) return r.html;
    } catch (e) {}
    var src = currentMjml();
    if (src && PM.hasMjmlCompiler()) {
      var out = PM.mjmlToHtml(src);
      if (out.html) return out.html;
    }
    var css = ''; try { css = editor.getCss(); } catch (e) {}
    return wrapDoc(editor.getHtml(), css);
  }

  /* ------------------------------- Save ---------------------------------- */
  function save(silent) {
    if (!editor) return;
    if (mode === 'mjml') {
      var mj = currentMjml();
      if (mj) project.mjml = mj;
      var compiled = compileMjml();
      if (compiled) project.indexHtml = injectVisibilityCss(PM.absorbInlineImages(compiled, project));
    } else {
      project.indexHtml = injectVisibilityCss(PM.absorbInlineImages(currentHtml(), project));
    }
    try {
      PM.upsertProject(project);
      if (!silent) toast('Saved', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ------------------------------ Export --------------------------------- */
  function doExport() {
    save(true);
    toast('Building package…');
    PM.exportProject(project).then(function (fn) {
      toast(fn + ' exported', 'ok');
    }).catch(function (e) { toast('Export failed: ' + e.message, 'err'); });
  }

  /* ------------------------------ Preview -------------------------------- */
  function preview() {
    save(true);
    var html = mode === 'mjml' ? compileMjml() : currentHtml();
    html = PM.resolveImages(html, project.images);
    try {
      sessionStorage.setItem('postmark.preview', JSON.stringify({
        id: project.id, name: project.name, mode: mode, html: html, ts: Date.now()
      }));
    } catch (e) { toast('Preview too large to pass — try exporting instead.', 'err'); return; }
    window.open('preview.html', '_blank'); // open in NEW TAB
  }

  /* ------------------------------ Code view ------------------------------ */
  var cmInstance = null;   // CodeMirror editor instance (lazy-created)

  function ensureCodeMirror() {
    if (cmInstance || !window.CodeMirror) return cmInstance;
    var area = $('#code-area');
    cmInstance = window.CodeMirror.fromTextArea(area, {
      lineNumbers: true,
      theme: 'material-darker',
      mode: mode === 'mjml' ? 'xml' : 'htmlmixed',
      lineWrapping: true,
      autoCloseTags: true,
      matchBrackets: true,
      tabSize: 2,
      indentUnit: 2,
      indentWithTabs: false
    });
    cmInstance.setSize('100%', '100%');
    return cmInstance;
  }

  function openCode() {
    var src;
    if (mode === 'mjml') {
      $('#code-title').textContent = 'MJML source';
      src = currentMjml() || project.mjml || '';
      $('#code-import').textContent = 'Apply MJML to canvas';
    } else {
      $('#code-title').textContent = 'HTML source';
      src = currentHtml();
      $('#code-import').textContent = 'Apply HTML to canvas';
    }
    $('#code-area').value = src;
    $('#code-modal').classList.add('show');

    var cm = ensureCodeMirror();
    if (cm) {
      cm.setOption('mode', mode === 'mjml' ? 'xml' : 'htmlmixed');
      cm.setValue(src);
      setTimeout(function () { cm.refresh(); cm.focus(); }, 30);
    }
  }

  function getCodeValue() {
    if (cmInstance) { cmInstance.save(); }   // sync CM -> textarea
    return $('#code-area').value;
  }

  function importCode() {
    var val = getCodeValue();
    try {
      if (mode === 'mjml') { loadMjml(val); project.mjml = val; }
      else { editor.setComponents(PM.resolveImages(val, project.images)); }
      $('#code-modal').classList.remove('show');
      save(true);
      toast('Applied to canvas', 'ok');
    } catch (e) { toast('Apply failed: ' + e.message, 'err'); }
  }

  /* --------------------------- Device + zoom ----------------------------- */
  function setDevice(dev) {
    if (!editor) return;
    var map = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
    editor.setDevice(map[dev] || 'Desktop');
    $$('#devswitch button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-dev') === dev); });
  }
  function applyZoom() {
    try {
      var canvas = editor.Canvas;
      if (canvas && canvas.setZoom) canvas.setZoom(zoom);
    } catch (e) {}
    var lbl = $('#zoom-label'); if (lbl) lbl.textContent = zoom + '%';
  }
  function setZoom(z) { zoom = Math.max(25, Math.min(200, z)); applyZoom(); }

  /* ------------------------- Left panel tabs ----------------------------- */
  function wireLeftTabs() {
    $$('#left-tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        var tab = b.getAttribute('data-tab');
        $$('#left-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('#tab-blocks').style.display = tab === 'blocks' ? 'flex' : 'none';
        $('#tab-layers').style.display = tab === 'layers' ? 'block' : 'none';
      });
    });
  }

  /* --------- Right panel: per-layer HTML / CSS code editor --------------- */
  var rpHtmlCM = null, rpCssCM = null, rpCodeReady = false;

  function makeRpEditor(host, modeName) {
    var ta = document.createElement('textarea');
    host.appendChild(ta);
    var cm = window.CodeMirror.fromTextArea(ta, {
      lineNumbers: true,
      theme: 'material-darker',
      mode: modeName,
      lineWrapping: true,
      autoCloseTags: true,
      matchBrackets: true,
      tabSize: 2,
      indentUnit: 2
    });
    cm.setSize('100%', '130px');
    return cm;
  }

  function setupLayerCode() {
    var toggle = $('#rp-code-toggle');
    var body = $('#rp-code-body');
    var section = toggle ? toggle.closest('.rp-code-section') : null;
    if (!toggle || !body) return;

    toggle.addEventListener('click', function () {
      var open = body.style.display === 'none';
      body.style.display = open ? 'block' : 'none';
      if (section) section.classList.toggle('open', open);
      if (open) {
        ensureRpEditors();
        refreshLayerCode();
        setTimeout(function () {
          if (rpHtmlCM) rpHtmlCM.refresh();
          if (rpCssCM) rpCssCM.refresh();
        }, 30);
      }
    });

    $('#rp-html-apply').addEventListener('click', applyLayerHtml);
    $('#rp-css-apply').addEventListener('click', applyLayerCss);
  }

  function ensureRpEditors() {
    if (rpCodeReady || !window.CodeMirror) return;
    rpHtmlCM = makeRpEditor($('#rp-html-editor'), mode === 'mjml' ? 'xml' : 'htmlmixed');
    rpCssCM = makeRpEditor($('#rp-css-editor'), 'css');
    rpCodeReady = true;
  }

  // Returns the class we treat as the "style target" for the selected
  // component: the first class on it, else null (then we edit the element's
  // own id rule).
  function selectedStyleSelector(sel) {
    if (!sel) return null;
    var classes = sel.getClasses ? sel.getClasses() : [];
    if (classes && classes.length) return '.' + classes[0];
    return null;
  }

  function refreshLayerCode() {
    if (!rpCodeReady) return;
    var sel = editor.getSelected();
    if (!sel) {
      rpHtmlCM.setValue('');
      rpCssCM.setValue('');
      $('#rp-css-target').textContent = '';
      $('#rp-css-hint').textContent = '';
      return;
    }
    // HTML of the selected component
    var html = '';
    try { html = sel.toHTML ? sel.toHTML() : ''; } catch (e) {}
    rpHtmlCM.setValue(html || '');

    // CSS for the component's first class (if any) or its own id rule
    var selector = selectedStyleSelector(sel);
    var cssText = '', label = '', hint = '';
    try {
      if (selector) {
        label = selector;
        var rule = editor.Css.getRule(selector);
        cssText = rule ? formatRuleBody(rule) : '';
        hint = 'Editing the shared class ' + selector + ' — changes affect every element using it.';
      } else {
        var cid = sel.getId ? sel.getId() : '';
        label = cid ? '#' + cid : '(element)';
        var idRule = cid ? editor.Css.getRule('#' + cid) : null;
        cssText = idRule ? formatRuleBody(idRule) : '';
        hint = 'No class on this element — editing its own styles. Add a class in the Classes box to share styles.';
      }
    } catch (e) {}
    rpCssCM.setValue(cssText);
    $('#rp-css-target').textContent = label;
    $('#rp-css-hint').textContent = hint;
  }

  function formatRuleBody(rule) {
    try {
      var style = rule.getStyle();
      return Object.keys(style).map(function (k) {
        return k + ': ' + style[k] + ';';
      }).join('\n');
    } catch (e) { return ''; }
  }

  function applyLayerHtml() {
    var sel = editor.getSelected();
    if (!sel || !rpHtmlCM) return;
    var html = rpHtmlCM.getValue().trim();
    if (!html) { toast('Nothing to apply', 'warn'); return; }
    try {
      var parent = sel.parent();
      var idx = sel.index();
      var added = parent.append(html, { at: idx });
      sel.remove();
      var newComp = Array.isArray(added) ? added[0] : added;
      if (newComp) editor.select(newComp);
      toast('HTML applied', 'ok');
    } catch (e) {
      toast('Could not apply HTML', 'warn');
    }
  }

  function applyLayerCss() {
    var sel = editor.getSelected();
    if (!sel || !rpCssCM) return;
    var body = rpCssCM.getValue();
    var sel2 = selectedStyleSelector(sel);
    var target = sel2;
    if (!target) {
      // ensure the element has an id rule to attach to
      var cid = sel.getId();
      target = '#' + cid;
    }
    try {
      var styleObj = parseCssBody(body);
      var rule = editor.Css.getRule(target) || editor.Css.setRule(target, {});
      rule.setStyle(styleObj);
      // re-apply to canvas
      editor.trigger('change:canvasOffset');
      toast('CSS applied to ' + target, 'ok');
      refreshLayerCode();
    } catch (e) {
      toast('Could not apply CSS', 'warn');
    }
  }

  function parseCssBody(text) {
    var obj = {};
    (text || '').split(';').forEach(function (line) {
      var i = line.indexOf(':');
      if (i === -1) return;
      var prop = line.slice(0, i).trim();
      var val = line.slice(i + 1).trim();
      if (prop) obj[prop] = val;
    });
    return obj;
  }

  /* ---------- Right panel: show only when a component is selected -------- */
  function wireSelection() {
    var rp = $('#right-panel');
    var emptyMsg = $('#right-empty');

    // Remove any duplicate "Classes" boxes that GrapesJS may render. The
    // Classes UI is mounted in #selectors; if a second one ever appears
    // (e.g. inside #styles), keep the first and drop the rest.
    function dedupeClassesBox() {
      try {
        var host = document.getElementById('right-panel') || document;
        var boxes = host.querySelectorAll('.gjs-clm-tags');
        for (var i = 1; i < boxes.length; i++) {
          if (boxes[i] && boxes[i].parentNode) boxes[i].parentNode.removeChild(boxes[i]);
        }
      } catch (e) {}
    }

    function update() {
      var sel = editor.getSelected();
      if (sel) {
        rp.classList.add('has-sel');
        if (emptyMsg) emptyMsg.style.display = 'none';
        var name = sel.get('custom-name') || sel.get('type') || (sel.getName && sel.getName()) || 'Element';
        var nm = $('#sel-name'); if (nm) nm.textContent = String(name).replace(/^mj-?/, '').replace(/-/g, ' ');
      } else {
        rp.classList.remove('has-sel');
        if (emptyMsg) emptyMsg.style.display = 'flex';
        var nm2 = $('#sel-name'); if (nm2) nm2.textContent = '';
      }
      // run after GrapesJS has (re)rendered the style panel for this selection
      setTimeout(dedupeClassesBox, 0);
      requestAnimationFrame(dedupeClassesBox);
      refreshLayerCode();
    }
    editor.on('component:selected', update);
    editor.on('component:deselected', update);
    editor.on('style:target', function () { setTimeout(dedupeClassesBox, 0); });
    editor.on('component:update', function () { refreshLayerCode(); });
    update();
  }

  /* ------------------------------ Toolbar -------------------------------- */
  function wireToolbar() {
    $('#btn-save').addEventListener('click', function () { save(false); });
    $('#btn-export').addEventListener('click', doExport);
    $('#btn-preview').addEventListener('click', preview);
    $('#btn-code').addEventListener('click', openCode);
    $('#code-close').addEventListener('click', function () { $('#code-modal').classList.remove('show'); });
    $('#code-import').addEventListener('click', importCode);
    $('#code-copy').addEventListener('click', function () {
      var val = getCodeValue();
      var done = function () { toast('Copied', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(done).catch(function () {
          var a = $('#code-area'); a.style.display = 'block'; a.value = val; a.select();
          try { document.execCommand('copy'); done(); } catch (e) {}
          a.style.display = '';
        });
      } else {
        var a = $('#code-area'); a.style.display = 'block'; a.value = val; a.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        a.style.display = '';
      }
    });
    $('#code-modal').addEventListener('click', function (e) { if (e.target === $('#code-modal')) $('#code-modal').classList.remove('show'); });

    // device switch
    $$('#devswitch button').forEach(function (b) {
      b.addEventListener('click', function () { setDevice(b.getAttribute('data-dev')); });
    });

    // undo / redo
    $('#btn-undo').addEventListener('click', function () { editor.runCommand('core:undo'); });
    $('#btn-redo').addEventListener('click', function () { editor.runCommand('core:redo'); });

    // zoom
    $('#btn-zoom-in').addEventListener('click', function () { setZoom(zoom + 10); });
    $('#btn-zoom-out').addEventListener('click', function () { setZoom(zoom - 10); });
    $('#btn-zoom-reset').addEventListener('click', function () { setZoom(100); });

    // reset (clear canvas back to blank template)
    $('#btn-reset').addEventListener('click', function () {
      if (!confirm('Reset the canvas? This clears all content in the editor (your saved version stays until you save again).')) return;
      if (mode === 'mjml') {
        loadMjml(PM.defaultMjml());
      } else {
        editor.setComponents(PM.resolveImages(PM.newProject(project.name, 'html').indexHtml, []));
      }
      toast('Canvas reset');
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
      if (e.key === 'Escape') $('#code-modal').classList.remove('show');
    });

    // autosave
    var t = null;
    editor.on('change:changesCount', function () {
      clearTimeout(t);
      t = setTimeout(function () { save(true); }, 1500);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
