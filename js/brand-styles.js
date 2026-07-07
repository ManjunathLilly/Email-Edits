/* ==========================================================================
   brand-styles.js — Country / Brand catalogue + predefined internal CSS.

   Exposes window.BrandStyles with:
     COUNTRIES        -> [{ value, label }]
     BRANDS           -> [{ value, label }]
     getBrandCss(brand)          -> string of CSS rules for that brand
     wrapStyle(css)              -> "<style> ... </style>" (or '' if no css)
     injectIntoHtml(html, css)   -> returns html with the brand CSS placed in
                                    <head><style data-brand-style> ... </style>
     injectIntoMjml(mjml, css)   -> returns mjml with the brand CSS placed in
                                    <mj-head><mj-style> ... </mj-style> so MJML
                                    compiles it into an internal <style> tag.

   The brand CSS is a starting palette: CSS custom properties (brand colours)
   plus a few helper classes. Edit BRAND_CSS below to refine each brand's look.
   ========================================================================== */
(function () {
  'use strict';

  // Marker attribute so we can find/replace the brand style block later without
  // touching any other <style> the user may add.
  var MARK = 'data-brand-style';

  var COUNTRIES = [
    { value: 'germany',   label: 'Germany' },
    { value: 'uk',        label: 'United Kingdom' },
    { value: 'australia', label: 'Australia' },
    { value: 'usa',       label: 'United States' },
    { value: 'france',    label: 'France' },
    { value: 'spain',     label: 'Spain' },
    { value: 'italy',     label: 'Italy' },
    { value: 'japan',     label: 'Japan' }
  ];

  var BRANDS = [
    { value: 'mounjaro', label: 'Mounjaro' },
    { value: 'omvoh',    label: 'Omvoh' },
    { value: 'verzenio', label: 'Verzenio' },
    { value: 'taltz',    label: 'Taltz' },
    { value: 'trulicity', label: 'Trulicity' }
  ];

  // ===========================================================================
  // PREDEFINED BRAND CLASSES
  //
  // Each brand owns an explicit map of CSS class name -> style properties.
  // These are the brand's predefined classes that authors can use DIRECTLY in
  // the email markup (e.g. <td class="mj-header"> or <a class="mj-button">).
  //
  // On brand selection, the WHOLE map for that brand is serialized into real
  // CSS rules and injected into the email's internal <style> before it loads.
  //
  // To add / edit a brand's classes: add or change entries below. The key is
  // the selector text (you may include a leading '.', '#', tag, or combinator;
  // a bare word is treated as a class, so "mj-button" -> ".mj-button"). The
  // value is an object of CSS property -> value pairs.
  // ===========================================================================
  var BRAND_CLASSES = {
    mounjaro: {
      '.brand-body':        { 'background-color': '#FFFFFF', 'color': '#231F20', 'font-family': "'Helvetica Neue', Helvetica, Arial, sans-serif", 'margin': '0', 'padding': '0' },
      '.mj-header':         { 'background-color': '#5A2D81', 'color': '#FFFFFF', 'padding': '20px 24px', 'text-align': 'center' },
      '.mj-h1':             { 'color': '#5A2D81', 'font-size': '26px', 'font-weight': '700', 'line-height': '1.3', 'margin': '0 0 12px' },
      '.mj-h2':             { 'color': '#231F20', 'font-size': '20px', 'font-weight': '700', 'margin': '0 0 10px' },
      '.mj-body-text':      { 'color': '#231F20', 'font-size': '15px', 'line-height': '1.6' },
      '.mj-button':         { 'display': 'inline-block', 'background-color': '#FFC72C', 'color': '#231F20', 'text-decoration': 'none', 'padding': '14px 26px', 'border-radius': '24px', 'font-weight': '700', 'font-size': '15px' },
      '.mj-link':           { 'color': '#5A2D81', 'text-decoration': 'underline' },
      '.mj-accent':         { 'color': '#FFC72C' },
      '.mj-bg-primary':     { 'background-color': '#FFC72C' },
      '.mj-bg-secondary':   { 'background-color': '#5A2D81' },
      '.mj-divider':        { 'border-top': '2px solid #FFC72C', 'height': '0', 'line-height': '0', 'font-size': '0' },
      '.mj-footer':         { 'background-color': '#F4F1F7', 'color': '#6E6A72', 'font-size': '12px', 'padding': '18px 24px', 'text-align': 'center' }
    },
    omvoh: {
      '.brand-body':        { 'background-color': '#FFFFFF', 'color': '#2B2B2B', 'font-family': "'Helvetica Neue', Helvetica, Arial, sans-serif", 'margin': '0', 'padding': '0' },
      '.mj-header':         { 'background-color': '#1B1B1B', 'color': '#FFFFFF', 'padding': '20px 24px', 'text-align': 'left' },
      '.mj-h1':             { 'color': '#E8540A', 'font-size': '28px', 'font-weight': '700', 'line-height': '1.25', 'margin': '0 0 14px' },
      '.mj-h2':             { 'color': '#1B1B1B', 'font-size': '20px', 'font-weight': '700', 'margin': '0 0 10px' },
      '.mj-body-text':      { 'color': '#2B2B2B', 'font-size': '15px', 'line-height': '1.65' },
      '.mj-button':         { 'display': 'inline-block', 'background-color': '#E8540A', 'color': '#FFFFFF', 'text-decoration': 'none', 'padding': '14px 28px', 'border-radius': '4px', 'font-weight': '700', 'font-size': '15px' },
      '.mj-link':           { 'color': '#E8540A', 'text-decoration': 'underline' },
      '.mj-accent':         { 'color': '#E8540A' },
      '.mj-bg-primary':     { 'background-color': '#E8540A' },
      '.mj-bg-secondary':   { 'background-color': '#1B1B1B' },
      '.mj-divider':        { 'border-top': '2px solid #E8540A', 'height': '0', 'line-height': '0', 'font-size': '0' },
      '.mj-footer':         { 'background-color': '#F5F5F5', 'color': '#6B6B6B', 'font-size': '12px', 'padding': '18px 24px', 'text-align': 'center' }
    },
    verzenio: {
      '.brand-body':        { 'background-color': '#FFFFFF', 'color': '#222222', 'font-family': 'Arial, Helvetica, sans-serif', 'margin': '0', 'padding': '0' },
      '.mj-header':         { 'background-color': '#003B5C', 'color': '#FFFFFF', 'padding': '20px 24px', 'text-align': 'center' },
      '.mj-h1':             { 'color': '#003B5C', 'font-size': '26px', 'font-weight': '700', 'line-height': '1.3', 'margin': '0 0 12px' },
      '.mj-h2':             { 'color': '#0093B2', 'font-size': '20px', 'font-weight': '700', 'margin': '0 0 10px' },
      '.mj-body-text':      { 'color': '#222222', 'font-size': '15px', 'line-height': '1.6' },
      '.mj-button':         { 'display': 'inline-block', 'background-color': '#0093B2', 'color': '#FFFFFF', 'text-decoration': 'none', 'padding': '13px 26px', 'border-radius': '6px', 'font-weight': '700', 'font-size': '15px' },
      '.mj-link':           { 'color': '#0093B2', 'text-decoration': 'underline' },
      '.mj-accent':         { 'color': '#0093B2' },
      '.mj-bg-primary':     { 'background-color': '#0093B2' },
      '.mj-bg-secondary':   { 'background-color': '#003B5C' },
      '.mj-divider':        { 'border-top': '2px solid #0093B2', 'height': '0', 'line-height': '0', 'font-size': '0' },
      '.mj-footer':         { 'background-color': '#EEF4F6', 'color': '#5A6B72', 'font-size': '12px', 'padding': '18px 24px', 'text-align': 'center' }
    },
    taltz: {
      '.brand-body':        { 'background-color': '#FFFFFF', 'color': '#2D2A26', 'font-family': 'Arial, Helvetica, sans-serif', 'margin': '0', 'padding': '0' },
      '.mj-header':         { 'background-color': '#2D2A26', 'color': '#FFFFFF', 'padding': '20px 24px', 'text-align': 'center' },
      '.mj-h1':             { 'color': '#2D2A26', 'font-size': '26px', 'font-weight': '700', 'line-height': '1.3', 'margin': '0 0 12px' },
      '.mj-h2':             { 'color': '#00A3A1', 'font-size': '20px', 'font-weight': '700', 'margin': '0 0 10px' },
      '.mj-body-text':      { 'color': '#2D2A26', 'font-size': '15px', 'line-height': '1.6' },
      '.mj-button':         { 'display': 'inline-block', 'background-color': '#00A3A1', 'color': '#FFFFFF', 'text-decoration': 'none', 'padding': '14px 26px', 'border-radius': '24px', 'font-weight': '700', 'font-size': '15px' },
      '.mj-link':           { 'color': '#00A3A1', 'text-decoration': 'underline' },
      '.mj-accent':         { 'color': '#00A3A1' },
      '.mj-bg-primary':     { 'background-color': '#00A3A1' },
      '.mj-bg-secondary':   { 'background-color': '#2D2A26' },
      '.mj-divider':        { 'border-top': '2px solid #00A3A1', 'height': '0', 'line-height': '0', 'font-size': '0' },
      '.mj-footer':         { 'background-color': '#F2F1EF', 'color': '#6B675F', 'font-size': '12px', 'padding': '18px 24px', 'text-align': 'center' }
    },
    trulicity: {
      '.brand-body':        { 'background-color': '#FFFFFF', 'color': '#231F20', 'font-family': "'Helvetica Neue', Helvetica, Arial, sans-serif", 'margin': '0', 'padding': '0' },
      '.mj-header':         { 'background-color': '#3B2A5A', 'color': '#FFFFFF', 'padding': '20px 24px', 'text-align': 'center' },
      '.mj-h1':             { 'color': '#3B2A5A', 'font-size': '26px', 'font-weight': '700', 'line-height': '1.3', 'margin': '0 0 12px' },
      '.mj-h2':             { 'color': '#E11383', 'font-size': '20px', 'font-weight': '700', 'margin': '0 0 10px' },
      '.mj-body-text':      { 'color': '#231F20', 'font-size': '15px', 'line-height': '1.6' },
      '.mj-button':         { 'display': 'inline-block', 'background-color': '#E11383', 'color': '#FFFFFF', 'text-decoration': 'none', 'padding': '14px 26px', 'border-radius': '24px', 'font-weight': '700', 'font-size': '15px' },
      '.mj-link':           { 'color': '#E11383', 'text-decoration': 'underline' },
      '.mj-accent':         { 'color': '#E11383' },
      '.mj-bg-primary':     { 'background-color': '#E11383' },
      '.mj-bg-secondary':   { 'background-color': '#3B2A5A' },
      '.mj-divider':        { 'border-top': '2px solid #E11383', 'height': '0', 'line-height': '0', 'font-size': '0' },
      '.mj-footer':         { 'background-color': '#F4F1F7', 'color': '#6E6A72', 'font-size': '12px', 'padding': '18px 24px', 'text-align': 'center' }
    }
  };

  // Normalize a selector key: a bare word (no leading . # or special chars and
  // not a known tag selector) is treated as a class name.
  function normalizeSelector(key) {
    var k = String(key).trim();
    if (!k) return k;
    // already a selector (class/id/tag/combinator/pseudo/attribute) -> leave it
    if (/^[.#\[:*]/.test(k) || /[\s>+~,]/.test(k)) return k;
    // contains a dot/hash somewhere (e.g. "a.mj-button") -> leave it
    if (/[.#]/.test(k)) return k;
    // otherwise it's a bare word -> treat as class
    return '.' + k;
  }

  // Serialize a {selector: {prop: val}} map into a CSS rule string.
  // MJML emits INLINE styles on elements, and inline styles beat class rules in
  // a <style> block. So brand class properties are marked !important to ensure
  // a predefined class actually overrides the element's inline MJML styling.
  function classesToCss(map, important) {
    var imp = important === false ? '' : ' !important';
    var out = [];
    Object.keys(map).forEach(function (sel) {
      var props = map[sel] || {};
      var body = Object.keys(props).map(function (p) {
        return '  ' + p + ': ' + props[p] + imp + ';';
      }).join('\n');
      out.push(normalizeSelector(sel) + ' {\n' + body + '\n}');
    });
    return out.join('\n');
  }

  // Build the full predefined-class CSS text for a brand.
  function getBrandCss(brand) {
    var map = BRAND_CLASSES[brand];
    if (!map) return '';
    var label = (findBrand(brand) || {}).label || brand;
    return '/* ===== ' + label + ' — predefined brand classes ===== */\n' + classesToCss(map);
  }

  // Expose the raw class map and the list of available class names for a brand
  // (handy for showing a palette / autocomplete of usable classes in the UI).
  function getBrandClasses(brand) {
    return BRAND_CLASSES[brand] || null;
  }
  function getBrandClassNames(brand) {
    var map = BRAND_CLASSES[brand];
    if (!map) return [];
    return Object.keys(map).map(normalizeSelector)
      .filter(function (s) { return s.charAt(0) === '.'; })
      .map(function (s) { return s.slice(1); });
  }

  function findBrand(value) {
    for (var i = 0; i < BRANDS.length; i++) if (BRANDS[i].value === value) return BRANDS[i];
    return null;
  }
  function findCountry(value) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].value === value) return COUNTRIES[i];
    return null;
  }

  function wrapStyle(css) {
    if (!css) return '';
    return '<style ' + MARK + ' type="text/css">\n' + css + '\n</style>';
  }

  // ---- HTML mode: place the brand <style> inside <head> ---------------------
  function injectIntoHtml(html, css) {
    html = html || '';
    if (!css) return html;
    var styleBlock = wrapStyle(css);

    // remove any previous brand-style block first (so re-applying replaces it)
    html = html.replace(new RegExp('<style[^>]*' + MARK + '[^>]*>[\\s\\S]*?<\\/style>', 'i'), '');

    if (/<head[^>]*>/i.test(html)) {
      // insert right after <head ...>
      return html.replace(/<head[^>]*>/i, function (m) { return m + '\n' + styleBlock; });
    }
    if (/<html[^>]*>/i.test(html)) {
      // no <head>: create one right after <html ...>
      return html.replace(/<html[^>]*>/i, function (m) { return m + '\n<head>\n' + styleBlock + '\n</head>'; });
    }
    // no <html>/<head> at all: prepend a head
    return '<head>\n' + styleBlock + '\n</head>\n' + html;
  }

  // ---- MJML mode: place the brand CSS inside <mj-head><mj-style> ------------
  // MJML's <mj-style> compiles into an internal <style> tag in the output HTML,
  // which is exactly the "internal CSS" requested.
  function injectIntoMjml(mjml, css) {
    mjml = mjml || '';
    if (!css) return mjml;
    var styleBlock = '<mj-style ' + MARK + '>\n' + css + '\n</mj-style>';

    // remove any previous brand mj-style block first
    mjml = mjml.replace(new RegExp('<mj-style[^>]*' + MARK + '[^>]*>[\\s\\S]*?<\\/mj-style>', 'i'), '');

    if (/<mj-head[^>]*>/i.test(mjml)) {
      return mjml.replace(/<mj-head[^>]*>/i, function (m) { return m + '\n    ' + styleBlock; });
    }
    if (/<mjml[^>]*>/i.test(mjml)) {
      // no <mj-head>: create one right after <mjml ...>
      return mjml.replace(/<mjml[^>]*>/i, function (m) {
        return m + '\n  <mj-head>\n    ' + styleBlock + '\n  </mj-head>';
      });
    }
    return mjml;
  }

  window.BrandStyles = {
    MARK: MARK,
    COUNTRIES: COUNTRIES,
    BRANDS: BRANDS,
    getBrandCss: getBrandCss,
    getBrandClasses: getBrandClasses,
    getBrandClassNames: getBrandClassNames,
    findBrand: findBrand,
    findCountry: findCountry,
    wrapStyle: wrapStyle,
    injectIntoHtml: injectIntoHtml,
    injectIntoMjml: injectIntoMjml
  };
})();
