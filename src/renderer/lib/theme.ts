import type { ThemePreference } from '../../main/settings'

export type { ThemePreference }

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref))
}

export function watchSystemTheme(pref: ThemePreference, onChange: () => void): () => void {
  if (pref !== 'system') return () => undefined
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = () => onChange()
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

export const THEME_CHANGED_EVENT = 'wallpaper-runner:theme-changed'

export function emitThemeChanged(pref: ThemePreference): void {
  window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: pref }))
}
