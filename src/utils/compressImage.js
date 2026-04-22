// 前端图片压缩。目标 ≤ maxKB（默认 500KB），最长边 ≤ maxDim（默认 1600）。
// 返回一个 JPEG Blob。
export async function compressImage(file, maxKB = 500, maxDim = 1600) {
  const img = await loadImage(file)
  let { width, height } = img
  const longSide = Math.max(width, height)
  if (longSide > maxDim) {
    const s = maxDim / longSide
    width = Math.round(width * s)
    height = Math.round(height * s)
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0, width, height)

  let quality = 0.9
  let blob = await canvasBlob(canvas, quality)
  while (blob.size > maxKB * 1024 && quality > 0.3) {
    quality = Math.max(0.3, quality - 0.1)
    blob = await canvasBlob(canvas, quality)
  }
  // 若还不够，进一步降分辨率
  let step = 0
  while (blob.size > maxKB * 1024 && step < 3) {
    canvas.width = Math.round(canvas.width * 0.8)
    canvas.height = Math.round(canvas.height * 0.8)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    blob = await canvasBlob(canvas, 0.7)
    step++
  }
  return blob
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(img.src); resolve(img) }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
}
