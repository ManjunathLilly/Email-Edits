# Postmark — Email Editor Studio

A fully client-side email development application built with **plain HTML + vanilla
JavaScript** and the **GrapesJS** editor. It supports two authoring methods — **MJML**
and **plain HTML** — and lets you create, edit, preview, import, and export self-contained
email packages.

There are **no CDN links anywhere**. Every third-party library is bundled locally in the
`vendor/` folder, so the app runs without an internet connection.

---

## Requirements

- A modern browser (Chrome, Edge, Firefox, Safari).
- A way to serve the folder over **HTTP** — see the note below. Opening the files directly
  with `file://` will break module/asset loading and the sandboxed preview iframes.

> **Why HTTP and not file://?**
> Browsers apply stricter security rules to `file://` pages (cross-origin and iframe
> restrictions). Serving over `http://localhost` makes the editor, image assets, and the
> preview page behave consistently.

## Running it

From inside this folder, start any static server. The simplest option:

```bash
python3 -m http.server 8000
```

Then open:

```
http://localhost:8000/index.html
```

Any equivalent static server works too (e.g. `npx serve`, `php -S localhost:8000`).

---

## How to use

### Dashboard (`index.html`)
- **Create new email** — choose **MJML** or **HTML** and give it a name.
- **Upload a package** — drag-and-drop or click to import a previously exported `.zip`.
- Each project appears as a card with a **live thumbnail** of its `index.html`, a **mode
  badge**, and the list of files inside its `distribution/` folder.
  - `index.html` → opens in a read-only file viewer.
  - `metadata.html` → view, or edit in the editor.
  - the `.mjml` file (MJML projects only) → opens in the editor.
  - each image under `images/` → opens in an image viewer.
- Card actions: **Edit**, **Export**, **Delete**.
- **Clear data** (in the Projects header) removes **all** saved projects from this browser at once.

### Editor (`editor.html`)
Opens in a **new tab** when you click Edit on the dashboard. Layout:
- **Top bar** — device options (desktop / tablet / mobile), undo / redo, zoom in / out / reset,
  reset canvas, plus Code, Preview, Save, and Export.
- **Left panel** — two tabs: **Blocks** (email blocks + predefined section templates) and **Layers**.
- **Canvas** — center, where you work with sections and columns.
- **Right panel** — shows the **selected element's properties only** (settings + style); it stays
  empty until you select something on the canvas.
- **Preview** opens `preview.html` in a **new tab**.
- For **MJML** projects the editor loads a ready-made starter template (no import modal) and the
  block set is restricted to email-relevant components only.

### Preview (`preview.html`)
- Renders the compiled email in a sandboxed iframe with a **desktop / mobile** toggle.

---

## Exported package structure

Exports produce a `.zip` whose **root is the `distribution/` folder** (the zip file itself
is the project folder — there is no doubled nesting):

```
<project-name>.zip
└── distribution/
    ├── images/          all referenced images
    ├── index.html       the email (compiled HTML)
    ├── metadata.html    project metadata
    └── <name>.mjml       MJML source (MJML projects only)
```

- **MJML projects** export the compiled `index.html` **and** keep the editable `.mjml` source.
- **HTML projects** export `index.html` + `metadata.html` (no `.mjml`).
- Both keep the `images/` folder, and image `src` paths are rewritten to `images/<file>`.

Importing a package back into the dashboard reverses this: the mode is auto-detected
(MJML if a `.mjml` file is present, otherwise HTML).

---

## Project files

```
index.html              dashboard page (app entry point)
editor.html             GrapesJS editor page
preview.html            preview page
css/
  dashboard.css
  editor.css
  preview.css
js/
  package-handler.js    shared module (window.Postmark): storage, ZIP I/O, image handling, MJML compile
  dashboard.js          dashboard logic
  editor.js             editor + GrapesJS integration
  preview.js            preview logic
vendor/                 local (no-CDN) libraries
  grapesjs/grapes.min.js, grapes.min.css
  grapesjs-preset-newsletter/grapesjs-preset-newsletter.min.js
  grapesjs-mjml/grapesjs-mjml.min.js
  mjml-browser/mjml-browser.js
  jszip/jszip.min.js
```

## Data & storage

Projects are stored in your browser's `localStorage` (key `postmark.projects.v1`).
Clearing site data removes saved projects — **export** anything you want to keep.

## Notes

- The MJML → HTML compilation runs entirely in the browser via the bundled MJML compiler.
- No data ever leaves your machine; everything runs locally.
