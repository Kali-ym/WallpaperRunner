# Gallery In-Set Extract + YARL Viewer Plan

> **For agentic workers:** Use executing-plans or implement task-by-task.

**Goal:** Move archive extract into gallery page; sequential image numbering; YARL viewer; archive icon cards + context menus.

**Spec:** `docs/superpowers/specs/2026-08-09-gallery-viewer-extract-design.md`

### Task 1: Numbering helpers + extract uses max index
- Test `nextImageIndex(existingNames)` 
- `extractZipToGallery` starts from max existing `NNN` index
- Filter archive names out of "image" numbering base

### Task 2: Gallery page archive cards + context menu; remove library extract
- Helper `isArchivePath`
- GalleryPage: icon cards, ContextMenu, ExtractZipModal
- LibraryPage: remove extract menu item

### Task 3: YARL replace Lightbox
- `npm i yet-another-react-lightbox`
- New GalleryLightbox wrapper with Zoom/Thumbnails/Counter/Fullscreen
- Only image paths as slides

### Task 4: Gallery page toolbar slim + CSS polish + verify
