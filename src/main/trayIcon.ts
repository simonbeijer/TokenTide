/**
 * The menu bar icon, drawn in code so the app needs no image files: a ring with a tide inside.
 * Black with alpha in BGRA order, for a template image that macOS colours to fit the menu bar.
 */
export function tideIconBitmap(size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4)
  const centre = (size - 1) / 2
  const radius = size / 2 - 0.5
  const ring = size / 10
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre)
      const inRing = distance <= radius && distance >= radius - ring
      const waterline = centre + (size / 12) * Math.sin(((x / size) * 2 * Math.PI) * 1.5)
      const inTide = distance < radius - 2 * ring && y >= waterline
      if (inRing || inTide) pixels[(y * size + x) * 4 + 3] = 255
    }
  }
  return pixels
}
