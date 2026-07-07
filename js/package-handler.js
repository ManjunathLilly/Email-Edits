/* ==========================================================================
   package-handler.js
   Shared utilities for the whole app. Depends on JSZip (window.JSZip) and,
   optionally, mjml-browser (window.mjml) for standalone MJML -> HTML.

   Responsibilities:
     - Project model + persistence (localStorage, base64 image storage)
     - Reading an uploaded .zip package into the project model
     - Resolving image references to blob URLs for preview/editor
     - Building & downloading an export .zip in the required folder structure
     - MJML -> HTML conversion helper (uses mjml-browser if present)
   No CDN. Everything loads from /vendor.
   ========================================================================== */
(function (global) {
  'use strict';

  var STORE_KEY = 'postmark.projects.v1';
  var CURRENT_KEY = 'postmark.current.v1';
  var BLOCKS_KEY = 'postmark.customblocks.v1';

  /* ----------------------------- ID + utils ----------------------------- */
  function uid() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }
  function baseName(path) { return String(path).split('/').pop(); }
  function extOf(name) {
    var n = baseName(name).toLowerCase();
    var i = n.lastIndexOf('.');
    return i < 0 ? '' : n.slice(i + 1);
  }
  function isImageExt(e) { return ['png','jpg','jpeg','gif','svg','webp','bmp','ico'].indexOf(e) >= 0; }
  function mimeFor(name) {
    var e = extOf(name);
    var map = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
                svg:'image/svg+xml', webp:'image/webp', bmp:'image/bmp', ico:'image/x-icon',
                html:'text/html', mjml:'text/plain', css:'text/css', js:'text/javascript' };
    return map[e] || 'application/octet-stream';
  }

  /* --------------------------- Project model ----------------------------- */
  /* A project is:
     {
       id, name, mode: 'mjml'|'html', createdAt, updatedAt,
       indexHtml: string,          // distribution/index.html
       metadataHtml: string,       // distribution/metadata.html
       mjml: string|null,          // distribution/<name>.mjml (mjml mode)
       mjmlFileName: string|null,
       images: [{ name, dataUrl }] // distribution/images/*
     }
  */
  function newProject(name, mode, country, brand) {
    var now = Date.now();
    var isMjml = mode === 'mjml';

    // Base templates
    var indexHtml = defaultIndexHtml(mode);
    var mjml = isMjml ? defaultMjml() : null;

    // Inject the selected brand's predefined styles into the INTERNAL CSS
    // (before the email is ever loaded into the canvas).
    var BS = (typeof window !== 'undefined') ? window.BrandStyles : null;
    if (BS && brand) {
      var css = BS.getBrandCss(brand);
      if (css) {
        if (isMjml) {
          mjml = BS.injectIntoMjml(mjml, css);          // -> <mj-head><mj-style>
          // index.html is regenerated from mjml on first compile; also seed it
          indexHtml = BS.injectIntoHtml(indexHtml, css);
        } else {
          indexHtml = BS.injectIntoHtml(indexHtml, css); // -> <head><style>
        }
      }
    }

    return {
      id: uid(),
      name: name || 'Untitled Email',
      mode: isMjml ? 'mjml' : 'html',
      country: country || '',
      brand: brand || '',
      createdAt: now,
      updatedAt: now,
      indexHtml: indexHtml,
      metadataHtml: defaultMetadataHtml(name || 'Untitled Email'),
      mjml: mjml,
      mjmlFileName: isMjml ? 'email.mjml' : null,
      images: [],
      extraFiles: []
    };
  }

  function defaultMjml() {
    // Dummy starter template (inspired by the mjml.io example): a logo header,
    // a hero headline + button, an image/text row, and a footer. Gives the user
    // a sensible blank-but-structured starting point instead of an import modal.
    return [
      '<mjml>',
      '  <mj-head>',
      '    <mj-attributes>',
      '      <mj-all font-family="Helvetica, Arial, sans-serif" />',
      '      <mj-text font-size="15px" color="#555555" line-height="1.6" />',
      '    </mj-attributes>',
      '  </mj-head>',
      '  <mj-body background-color="#f4f4f4">',
      '    <mj-section background-color="#14110e" padding="18px 24px">',
      '      <mj-column>',
      '        <mj-text align="center" color="#e8a24c" font-size="20px" font-weight="700">Your Brand</mj-text>',
      '      </mj-column>',
      '    </mj-section>',
      '    <mj-section background-color="#ffffff" padding="36px 24px">',
      '      <mj-column>',
      '        <mj-text align="center" font-size="26px" font-weight="700" color="#1a1a1a">Welcome aboard</mj-text>',
      '        <mj-text align="center">Start building your email by dragging blocks and templates from the left panel. Click any element to edit its properties on the right.</mj-text>',
      '        <mj-button background-color="#e8a24c" color="#2a1c08" font-weight="700" border-radius="6px" href="#" padding="18px 0 4px">Get started</mj-button>',
      '      </mj-column>',
      '    </mj-section>',
      '    <mj-section background-color="#ffffff" padding="0 24px 28px">',
      '      <mj-column>',
      '        <mj-divider border-color="#eeeeee" border-width="1px" />',
      '      </mj-column>',
      '    </mj-section>',
      '    <mj-section background-color="#f4f4f4" padding="20px 24px">',
      '      <mj-column>',
      '        <mj-text align="center" font-size="12px" color="#999999">You are receiving this email because you signed up.<br/>123 Street Name, City &middot; <a href="#" style="color:#999999;">Unsubscribe</a></mj-text>',
      '      </mj-column>',
      '    </mj-section>',
      '  </mj-body>',
      '</mjml>'
    ].join('\n');
  }
  // A truly minimal blank MJML (one empty section/column) for "blank" starts.
  function blankMjml() {
    return [
      '<mjml>',
      '  <mj-body background-color="#f4f4f4">',
      '    <mj-section background-color="#ffffff" padding="20px">',
      '      <mj-column>',
      '        <mj-text>Edit me</mj-text>',
      '      </mj-column>',
      '    </mj-section>',
      '  </mj-body>',
      '</mjml>'
    ].join('\n');
  }
  function defaultIndexHtml(mode) {
    if (mode === 'mjml') {
      // Will be replaced by compiled MJML on first edit/export; provide a sane placeholder
      return '<!DOCTYPE html><html><body style="margin:0;background:#f4f4f4;font-family:Georgia,serif;">' +
             '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">' +
             '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;">' +
             '<tr><td style="padding:24px;"><h1 style="color:#222;">Welcome</h1>' +
             '<p style="color:#555;line-height:1.6;">Start composing your message.</p></td></tr>' +
             '</table></td></tr></table></body></html>';
    }
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
           '<body style="margin:0;padding:0;background:#f4f4f4;">' +
           '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">' +
           '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">' +
           '<tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;">' +
           '<h1 style="margin:0 0 12px;color:#222;font-size:24px;">Welcome</h1>' +
           '<p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6;">Start composing your message. Drag blocks from the left to build your email.</p>' +
           '<a href="#" style="display:inline-block;background:#e8a24c;color:#2a1c08;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;font-family:Helvetica,Arial,sans-serif;">Call to action</a>' +
           '</td></tr></table></td></tr></table></body></html>';
  }
  function defaultMetadataHtml(name) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Metadata</title></head><body>' +
           '<h1>Email Metadata</h1>' +
           '<ul>' +
           '<li><strong>Subject:</strong> ' + escapeHtml(name) + '</li>' +
           '<li><strong>Preheader:</strong> </li>' +
           '<li><strong>From name:</strong> </li>' +
           '<li><strong>From email:</strong> </li>' +
           '<li><strong>Reply-to:</strong> </li>' +
           '<li><strong>Created:</strong> ' + new Date().toISOString() + '</li>' +
           '</ul></body></html>';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  /* --------------------------- Persistence ------------------------------- */
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveAll(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }
  function getProject(id) {
    return loadAll().filter(function (p) { return p.id === id; })[0] || null;
  }
  function upsertProject(proj) {
    proj.updatedAt = Date.now();
    var list = loadAll();
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === proj.id) { idx = i; break; } }
    if (idx >= 0) list[idx] = proj; else list.unshift(proj);
    try {
      saveAll(list);
    } catch (e) {
      // localStorage quota — surface a clear error to caller
      throw new Error('Storage limit reached. Large images may exceed the browser storage quota. Export your project to keep it.');
    }
    return proj;
  }
  function deleteProject(id) {
    saveAll(loadAll().filter(function (p) { return p.id !== id; }));
  }
  function setCurrent(id) { localStorage.setItem(CURRENT_KEY, id || ''); }
  function getCurrent() { return localStorage.getItem(CURRENT_KEY) || ''; }

  /* ----------------------- Custom blocks (reusable) ---------------------- */
  // A custom block is a saved, reusable chunk users can drag into the canvas.
  // Model: { id, name, mode:'mjml'|'html'|'both', category, content, updatedAt }
  function loadBlocks() {
    try { return JSON.parse(localStorage.getItem(BLOCKS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveBlocks(list) {
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(list || []));
  }
  function getBlock(id) {
    return loadBlocks().filter(function (b) { return b.id === id; })[0] || null;
  }
  function upsertBlock(block) {
    if (!block.id) block.id = 'blk_' + uid();
    block.updatedAt = Date.now();
    var list = loadBlocks();
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === block.id) { idx = i; break; } }
    if (idx >= 0) list[idx] = block; else list.unshift(block);
    try { saveBlocks(list); }
    catch (e) { throw new Error('Storage limit reached while saving the custom block.'); }
    return block;
  }
  function deleteBlock(id) {
    saveBlocks(loadBlocks().filter(function (b) { return b.id !== id; }));
  }
  // Blocks usable in a given editor mode ('mjml' or 'html'). 'both' always applies.
  function blocksForMode(modeName) {
    return loadBlocks().filter(function (b) {
      return !b.mode || b.mode === 'both' || b.mode === modeName;
    });
  }

  /* --------------------- Read uploaded .zip package ---------------------- */
  /* Accepts a File (zip). Returns a Promise<project>. Looks for a
     "distribution/" folder anywhere in the archive. */
  function readPackage(file) {
    if (!global.JSZip) return Promise.reject(new Error('JSZip not loaded.'));
    return global.JSZip.loadAsync(file).then(function (zip) {
      // Find the path prefix that contains "distribution/"
      var distPrefix = null;
      zip.forEach(function (relPath) {
        if (distPrefix !== null) return;
        var m = relPath.replace(/\\/g, '/').match(/(^|.*\/)distribution\//i);
        if (m) distPrefix = m[0]; // e.g. "MainFolder/distribution/"
      });
      if (!distPrefix) {
        throw new Error('No "distribution/" folder found in the package.');
      }

      var proj = {
        id: uid(),
        name: (file.name || 'Imported Email').replace(/\.zip$/i, ''),
        mode: 'html',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        indexHtml: '',
        metadataHtml: '',
        mjml: null,
        mjmlFileName: null,
        images: [],
        extraFiles: []   // other html files inside distribution/ (editable)
      };

      var jobs = [];
      zip.forEach(function (relPath, entry) {
        var p = relPath.replace(/\\/g, '/');
        if (entry.dir) return;
        if (p.toLowerCase().indexOf(distPrefix.toLowerCase()) !== 0) return; // only inside distribution
        var rel = p.slice(distPrefix.length); // e.g. "index.html" | "images/logo.png" | "email.mjml"
        var lower = rel.toLowerCase();

        if (lower === 'index.html') {
          jobs.push(entry.async('string').then(function (t) { proj.indexHtml = t; }));
        } else if (lower === 'metadata.html') {
          jobs.push(entry.async('string').then(function (t) { proj.metadataHtml = t; }));
        } else if (extOf(rel) === 'mjml') {
          proj.mjmlFileName = baseName(rel);
          jobs.push(entry.async('string').then(function (t) { proj.mjml = t; }));
        } else if (lower.indexOf('images/') === 0 && isImageExt(extOf(rel))) {
          (function (name) {
            jobs.push(entry.async('base64').then(function (b64) {
              proj.images.push({ name: baseName(name), dataUrl: 'data:' + mimeFor(name) + ';base64,' + b64 });
            }));
          })(rel);
        } else if (extOf(rel) === 'html' || extOf(rel) === 'htm') {
          // Any OTHER html file inside distribution/ — keep it so it can be
          // viewed and edited. Preserve its relative path (may be nested).
          (function (relPath2) {
            jobs.push(entry.async('string').then(function (t) {
              proj.extraFiles.push({ path: relPath2, html: t });
            }));
          })(rel);
        }
        // non-html, non-image files inside distribution are left untouched
      });

      return Promise.all(jobs).then(function () {
        proj.mode = proj.mjml ? 'mjml' : 'html';
        if (!proj.indexHtml) proj.indexHtml = defaultIndexHtml(proj.mode);
        if (!proj.metadataHtml) proj.metadataHtml = defaultMetadataHtml(proj.name);
        return proj;
      });
    });
  }

  /* ----------------- Resolve image refs -> blob/data URLs ---------------- */
  /* Rewrites src="images/foo.png" (and ./images/, distribution/images/) in an
     HTML string to the stored data URLs, so previews render offline. */
  function resolveImages(html, images) {
    if (!html) return html;
    var map = {};
    (images || []).forEach(function (img) { map[img.name.toLowerCase()] = img.dataUrl; });
    return html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi, function (full, a, url, c) {
      var clean = url.replace(/^\.?\//, '').replace(/^distribution\//i, '');
      var m = clean.match(/^images\/(.+)$/i);
      if (m) {
        var key = baseName(m[1]).toLowerCase();
        if (map[key]) return a + map[key] + c;
      }
      // already a data: or absolute URL — leave as-is
      return full;
    });
  }

  /* Inverse: rewrite data URLs / blob refs back to images/<name> for export.
     We match stored data URLs and replace with the relative path. */
  function derefImages(html, images) {
    if (!html) return html;
    var byData = {};
    (images || []).forEach(function (img) { byData[img.dataUrl] = 'images/' + img.name; });
    return html.replace(/(src\s*=\s*["'])([^"']+)(["'])/gi, function (full, a, url, c) {
      if (byData[url]) return a + byData[url] + c;
      return full;
    });
  }

  /* Collect any NEW data-URL images embedded in html (e.g. added via the
     editor asset manager) into the project's image list, returning html with
     references normalised to images/<generatedName>. */
  function absorbInlineImages(html, project) {
    if (!html) return html;
    var counter = 0;
    var existing = {};
    project.images.forEach(function (im) { existing[im.dataUrl] = im.name; });
    return html.replace(/(src\s*=\s*["'])(data:image\/[^"']+)(["'])/gi, function (full, a, data, c) {
      var name = existing[data];
      if (!name) {
        var m = data.match(/^data:image\/([a-z0-9.+-]+);/i);
        var ext = m ? m[1].replace('jpeg','jpg').replace('svg+xml','svg') : 'png';
        counter++;
        name = 'asset-' + Date.now().toString(36) + '-' + counter + '.' + ext;
        project.images.push({ name: name, dataUrl: data });
        existing[data] = name;
      }
      return a + 'images/' + name + c;
    });
  }

  /* --------------------------- MJML -> HTML ------------------------------ */
  /* Prefer mjml-browser if available; otherwise the caller (editor) should
     pass GrapeJS-compiled HTML. Returns { html, errors }. */
  function mjmlToHtml(mjmlString) {
    var fn = global.mjml || (global.mjml && global.mjml.default);
    if (typeof fn === 'function') {
      try {
        var res = fn(mjmlString, { validationLevel: 'soft', minify: false });
        if (res && typeof res.html === 'string') return { html: res.html, errors: res.errors || [] };
      } catch (e) {
        return { html: null, errors: [{ message: e.message }] };
      }
    }
    return { html: null, errors: [{ message: 'mjml-browser not available in this context' }] };
  }
  function hasMjmlCompiler() {
    return typeof (global.mjml || (global.mjml && global.mjml.default)) === 'function';
  }

  /* ----------------------- Build & download export ----------------------- */
  /* Produces the required folder structure inside a single zip:
       <name>/distribution/index.html
       <name>/distribution/metadata.html
       <name>/distribution/images/*
       <name>/distribution/<file>.mjml   (only when mode === 'mjml')
  */
  function buildExportZip(project) {
    if (!global.JSZip) return Promise.reject(new Error('JSZip not loaded.'));
    var zip = new global.JSZip();
    var folderName = sanitizeFolder(project.name) || 'email';
    // The zip file itself IS the main folder. Put distribution/ at the root so
    // unzipping yields:  <name>/distribution/...  (no doubled nesting).
    var dist = zip.folder('distribution');

    // index.html with image refs pointing to images/<name>
    var indexHtml = derefImages(project.indexHtml || '', project.images);
    dist.file('index.html', indexHtml);
    dist.file('metadata.html', project.metadataHtml || '');

    if (project.mode === 'mjml' && project.mjml) {
      dist.file(project.mjmlFileName || 'email.mjml', project.mjml);
    }

    var imgFolder = dist.folder('images');
    (project.images || []).forEach(function (img) {
      var m = img.dataUrl.match(/^data:[^;]+;base64,(.*)$/);
      if (m) imgFolder.file(img.name, m[1], { base64: true });
    });

    // Any other html files that came with the package (kept editable),
    // written back at their original relative paths inside distribution/.
    (project.extraFiles || []).forEach(function (f) {
      if (f && f.path) dist.file(f.path, derefImages(f.html || '', project.images));
    });

    return zip.generateAsync({ type: 'blob' }).then(function (blob) {
      return { blob: blob, filename: folderName + '.zip' };
    });
  }
  function sanitizeFolder(name) {
    return String(name || '').trim().replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }

  /* ------------------------------ Export API ----------------------------- */
  function exportProject(project) {
    return buildExportZip(project).then(function (r) {
      downloadBlob(r.blob, r.filename);
      return r.filename;
    });
  }

  /* ------------------------------- Expose -------------------------------- */
  global.Postmark = {
    // model
    newProject: newProject,
    defaultMjml: defaultMjml,
    blankMjml: blankMjml,
    // persistence
    loadAll: loadAll,
    getProject: getProject,
    upsertProject: upsertProject,
    deleteProject: deleteProject,
    setCurrent: setCurrent,
    getCurrent: getCurrent,
    // custom blocks
    loadBlocks: loadBlocks,
    getBlock: getBlock,
    upsertBlock: upsertBlock,
    deleteBlock: deleteBlock,
    blocksForMode: blocksForMode,
    // packages
    readPackage: readPackage,
    exportProject: exportProject,
    buildExportZip: buildExportZip,
    downloadBlob: downloadBlob,
    // images
    resolveImages: resolveImages,
    derefImages: derefImages,
    absorbInlineImages: absorbInlineImages,
    // mjml
    mjmlToHtml: mjmlToHtml,
    hasMjmlCompiler: hasMjmlCompiler,
    // utils
    extOf: extOf, baseName: baseName, isImageExt: isImageExt, escapeHtml: escapeHtml
  };
})(window);
