export type CropArea = {
  x: number
  y: number
  width: number
  height: number
}

const AVATAR_SIZE = 256

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('无法读取图片'))
    img.src = src
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') {
        reject(new Error('无法导出图片'))
        return
      }
      const comma = dataUrl.indexOf(',')
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
    }
    reader.onerror = () => reject(new Error('无法导出图片'))
    reader.readAsDataURL(blob)
  })
}

/** Crop in the renderer (supports WebP etc.) and return a square JPEG as base64. */
export async function cropAvatarToJpegBase64(
  imageSrc: string,
  crop: CropArea,
): Promise<string> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('无法导出图片'))),
      'image/jpeg',
      0.88,
    )
  })
  return blobToBase64(blob)
}
