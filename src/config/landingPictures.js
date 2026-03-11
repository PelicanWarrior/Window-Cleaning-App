const pictureModules = import.meta.glob('../../pictures/*.{png,jpg,jpeg,webp,avif,gif}', {
  eager: true,
  import: 'default'
})

function parsePictureOrder(fileName) {
  const match = fileName.match(/(\d+)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function buildDefaultCaption(fileName) {
  const baseName = fileName.replace(/\.[^.]+$/, '')
  return `${baseName} preview`
}

export const LANDING_PICTURES = Object.entries(pictureModules)
  .map(([path, src]) => {
    const parts = path.split('/')
    const fileName = parts[parts.length - 1]

    return {
      fileName,
      src,
      order: parsePictureOrder(fileName),
      defaultCaption: buildDefaultCaption(fileName)
    }
  })
  .filter((item) => /^Picture\s+\d+/i.test(item.fileName))
  .sort((a, b) => a.order - b.order)
