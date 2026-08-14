import { describe, expect, it } from 'vitest'
import { INDEX_HTML, MAIN_JS, buildProjectJson } from '@main/wallpaper/templateFiles'

describe('zoom-through wallpaper cut', () => {
  it('defines incoming scale, exit scale, and CSS duration variable', () => {
    expect(INDEX_HTML).toContain('overflow: hidden')
    expect(INDEX_HTML).toContain('transform: scale(1.08)')
    expect(INDEX_HTML).toContain('transform: scale(1.055)')
    expect(INDEX_HTML).toContain('--cut-ms')
    expect(INDEX_HTML).toContain('cubic-bezier(0.32, 0.72, 0, 1)')
    expect(INDEX_HTML).toContain('will-change: transform, opacity')
  })

  it('exposes cut duration as a WE slider property', () => {
    const project = JSON.parse(buildProjectJson([])) as {
      general: { properties: Record<string, { type: string; value: string }> }
    }
    const cut = project.general.properties.cutduration
    expect(cut).toBeTruthy()
    expect(cut.type).toBe('slider')
    expect(cut.value).toBe('1')
  })

  it('wires zoom-through layer swap and WE property listeners', () => {
    expect(MAIN_JS).toContain('applyCutVars')
    expect(MAIN_JS).toContain("layer.classList.add('visible')")
    expect(MAIN_JS).toContain("prev.classList.add('exit')")
    expect(MAIN_JS).toContain('properties.cutduration')
    expect(MAIN_JS).toContain('applyGeneralProperties')
    expect(MAIN_JS).toContain('Math.max')
    expect(MAIN_JS).toContain('state.cutMs')
  })
})
