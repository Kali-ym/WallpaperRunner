import { describe, expect, it } from 'vitest'
import { INDEX_HTML, MAIN_JS, buildProjectJson } from '@main/wallpaper/templateFiles'

describe('WE credit overlay shell', () => {
  it('adds Info overlay combo defaulting to always', () => {
    const project = JSON.parse(buildProjectJson([])) as {
      general: {
        properties: Record<
          string,
          { type: string; value: string; options?: { value: string }[]; order?: number }
        >
      }
    }
    const prop = project.general.properties.infooverlay
    expect(prop).toBeTruthy()
    expect(prop.type).toBe('combo')
    expect(prop.value).toBe('always')
    expect(prop.options?.map((o) => o.value)).toEqual(['always', 'fade', 'hidden'])
  })

  it('renders credit markup and magazine styles', () => {
    expect(INDEX_HTML).toContain('id="credit"')
    expect(INDEX_HTML).toContain('credit-avatar')
    expect(INDEX_HTML).toContain('credit-author')
    expect(INDEX_HTML).toContain('credit-title')
    expect(INDEX_HTML).toContain('credit-rule')
    expect(INDEX_HTML).toContain('#f4f1ea')
    expect(INDEX_HTML).toContain('.credit.is-visible')
    const creditCssStart = INDEX_HTML.indexOf('#credit')
    expect(creditCssStart).toBeGreaterThan(-1)
    const creditCss = INDEX_HTML.slice(creditCssStart, creditCssStart + 2500)
    expect(creditCss).not.toContain('backdrop-filter')
  })
})

describe('WE credit overlay runtime wiring', () => {
  it('defines updateCredit and infoOverlay state', () => {
    expect(MAIN_JS).toContain('infoOverlay')
    expect(MAIN_JS).toContain('updateCredit')
    expect(MAIN_JS).toContain('properties.infooverlay')
    expect(MAIN_JS).toContain('creditFadeTimer')
    expect(MAIN_JS).toContain('未知作者')
  })

  it('calls updateCredit when a gallery starts', () => {
    expect(MAIN_JS).toContain('updateCredit(g, true)')
  })
})
