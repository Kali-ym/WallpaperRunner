/** True when a modal/drawer should own Escape instead of the app shell. */
export function overlayOpen(): boolean {
  return Boolean(
    document.querySelector(
      '.modal-root, .modal-backdrop, .drawer-backdrop, [role="alertdialog"], [role="dialog"]',
    ),
  )
}
