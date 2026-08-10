import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = join(root, 'build', 'icon.svg')
const pngPath = join(root, 'build', 'icon.png')
const icoPath = join(root, 'build', 'icon.ico')
const assetPath = join(root, 'src', 'renderer', 'assets', 'icon.png')

const svg = readFileSync(svgPath, 'utf8')
const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 512 },
  background: '#181411',
})
const png = resvg.render().asPng()
writeFileSync(pngPath, png)
writeFileSync(assetPath, png)

const ico = await pngToIco(png)
writeFileSync(icoPath, ico)

console.log('Wrote build/icon.png, build/icon.ico, src/renderer/assets/icon.png')
