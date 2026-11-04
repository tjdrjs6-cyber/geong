/**
 * Hand-drawn style 2D weeding field: white sky, a soft green meadow with ink grass tufts,
 * little flowers and butterflies, and a friend half-hidden in the grass while weeding.
 */
const INK = '#2e2a2b'

function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function tuft(x: number, y: number, scale: number): string {
  const s = scale
  return `<path d="M${x} ${y}l${-2 * s} ${-7 * s}M${x + 4 * s} ${y}l${0} ${-8 * s}M${x + 8 * s} ${y}l${2 * s} ${-7 * s}" />`
}

function flower(x: number, y: number, r: number): string {
  const petals = [0, 72, 144, 216, 288].map(angle => {
    const rad = (angle * Math.PI) / 180
    return `<circle cx="${(x + Math.cos(rad) * r).toFixed(1)}" cy="${(y + Math.sin(rad) * r).toFixed(1)}" r="${(r * 0.72).toFixed(1)}" />`
  }).join('')
  return `<g class="flower" fill="#fffdf4" stroke="${INK}" stroke-width="1.3">${petals}<circle cx="${x}" cy="${y}" r="${(r * 0.55).toFixed(1)}" fill="#f6d36a" /></g>`
}

function butterfly(x: number, y: number, index: number): string {
  return `<g class="butterfly" style="--d:${(index * 1.7).toFixed(1)}s" transform="translate(${x} ${y})">
    <g class="wings" fill="#f6d36a" stroke="${INK}" stroke-width="1.3">
      <path d="M0 0c-9-11-17-5-13 2c-6 3-3 11 4 7c3-2 6-5 9-9z" />
      <path d="M0 0c9-11 17-5 13 2c6 3 3 11-4 7c-3-2-6-5-9-9z" />
    </g>
    <path d="M0-4v10" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" />
  </g>`
}

/** SVG doodles for the meadow (viewBox 400×560, the meadow area below the horizon). */
function meadowDoodles(): string {
  const random = rng(20251103)
  const tufts: string[] = []
  const dots: string[] = []
  const flowers: string[] = []
  for (let i = 0; i < 70; i += 1) tufts.push(tuft(random() * 390, 30 + random() * 520, 0.8 + random() * 0.7))
  for (let i = 0; i < 26; i += 1) dots.push(`<ellipse cx="${(random() * 400).toFixed(0)}" cy="${(40 + random() * 510).toFixed(0)}" rx="5" ry="3.4" fill="#fffef5" />`)
  for (let i = 0; i < 8; i += 1) dots.push(`<circle cx="${(random() * 400).toFixed(0)}" cy="${(60 + random() * 480).toFixed(0)}" r="4.2" fill="none" stroke="${INK}" stroke-width="1.4" />`)
  for (let i = 0; i < 7; i += 1) flowers.push(flower(20 + random() * 360, 120 + random() * 420, 4.4 + random() * 1.6))
  const butterflies = [[300, 210], [80, 380], [250, 470]].map(([x, y], index) => butterfly(x, y, index)).join('')
  return `<svg class="weed-doodles" viewBox="0 0 400 560" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
    <g stroke="${INK}" stroke-width="1.5" stroke-linecap="round" fill="none">${tufts.join('')}</g>
    ${dots.join('')}${flowers.join('')}${butterflies}
  </svg>`
}

/** Front grass edge that hides the lower body of the weeding friend. */
function frontGrass(): string {
  const random = rng(77)
  const blades: string[] = []
  for (let x = 6; x < 400; x += 15 + random() * 10) blades.push(tuft(x, 22 + random() * 10, 1 + random() * 0.5))
  return `<svg class="weed-front" viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 18 C40 8 70 22 110 14 S190 6 230 16 S320 24 400 12 V140 H0Z" fill="#c8eba4" />
    <path d="M0 18 C40 8 70 22 110 14 S190 6 230 16 S320 24 400 12" fill="none" stroke="#fffef5" stroke-width="5" stroke-linecap="round" />
    <g stroke="${INK}" stroke-width="1.5" stroke-linecap="round" fill="none">${blades.join('')}</g>
  </svg>`
}

export function weedFieldMarkup(): string {
  const clippings = Array.from({ length: 9 }, (_, index) =>
    `<i class="clip" style="--x:${(index * 37) % 100}%;--d:${(index * 0.31).toFixed(2)}s;--r:${(index * 47) % 360}deg"></i>`).join('')
  return `
    <div class="weed-sky" aria-hidden="true"></div>
    <div class="weed-meadow" aria-hidden="true">${meadowDoodles()}</div>
    ${[0, 1, 2].map(slot => `<div class="weed-walker is-idle" data-slot="${slot}">
      <div class="weed-friend is-empty"></div>
      <div class="weed-clippings" aria-hidden="true">${clippings}</div>
    </div>`).join('')}
    <div class="weed-beetle-helper" hidden></div>
    ${frontGrass()}`
}
