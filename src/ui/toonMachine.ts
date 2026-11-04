/** Hand-drawn cartoon capsule machine (inline SVG, thick ink outlines, pastel fills). */
const INK = '#3a2e2f'

export function machineMarkup(): string {
  const capsules = [
    [70, 92, '#f7a8bd'], [104, 78, '#9fd3f2'], [138, 90, '#ffe08a'], [88, 120, '#b9e39a'],
    [122, 118, '#cdb8f2'], [152, 124, '#f7a8bd'], [60, 128, '#ffe08a'], [106, 146, '#9fd3f2'], [140, 150, '#b9e39a'],
  ].map(([x, y, color], index) => `<g class="m-cap" style="--i:${index}" transform="translate(${x} ${y})">
      <circle r="15" fill="#fffdf7" stroke="${INK}" stroke-width="3" />
      <path d="M-15 0a15 15 0 0 1 30 0z" fill="${color}" stroke="${INK}" stroke-width="3" />
    </g>`).join('')
  return `<svg class="toon-machine-svg" viewBox="0 0 210 290" aria-hidden="true">
    <ellipse cx="105" cy="280" rx="78" ry="8" fill="rgba(58,46,47,.12)" />
    <g class="m-body">
      <rect x="62" y="22" width="86" height="16" rx="8" fill="#f39bb2" stroke="${INK}" stroke-width="4" />
      <circle cx="105" cy="112" r="78" fill="#eaf7ff" stroke="${INK}" stroke-width="5" />
      <g class="m-caps">${capsules}</g>
      <path d="M58 70c10-16 26-26 44-30" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" />
      <path d="M36 176h138l-10 96H46z" fill="#f6a5b9" stroke="${INK}" stroke-width="5" stroke-linejoin="round" />
      <rect x="28" y="168" width="154" height="20" rx="10" fill="#ffd6df" stroke="${INK}" stroke-width="5" />
      <g class="m-handle" transform="translate(84 222)">
        <circle r="20" fill="#fff6d8" stroke="${INK}" stroke-width="4" />
        <rect x="-17" y="-5" width="34" height="10" rx="5" fill="#f3b85c" stroke="${INK}" stroke-width="3" />
      </g>
      <rect x="124" y="204" width="34" height="10" rx="5" fill="${INK}" />
      <path d="M118 236h46v26h-46z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round" />
      <path d="M54 196l6 6M150 196l6 6" stroke="#fff" stroke-width="4" stroke-linecap="round" />
    </g>
    <g stroke="${INK}" stroke-width="3" stroke-linecap="round"><path d="M180 30l9-9M188 46l12-3M168 18l3-12" /></g>
  </svg>`
}
