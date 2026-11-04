import { afterEach, describe, expect, it } from 'vitest'
import { CONFIG, DEFAULT_CONFIG } from '../src/game/config'
import { tuning } from '../src/game/tuning'

const defaults = Object.fromEntries(tuning.controls.map(control => [control.id, control.default]))

afterEach(() => {
  tuning.apply(defaults)
  tuning.activate('pull')
})

describe('capsule gacha tuning', () => {
  it('exposes only live capsule-stage cosmetics with Korean labels', () => {
    expect(tuning.controls.map(control => control.id)).toEqual([
      'gacha.orbitSpeed', 'gacha.capsuleBob', 'gacha.spinDuration',
    ])
    expect(tuning.controls.every(control => control.integrity === 'COSMETIC')).toBe(true)
    expect(tuning.controls.every(control => control.label.length > 0)).toBe(true)
    expect(tuning.unranked).toBe(false)
  })

  it('validates an entire patch before committing any value', () => {
    const before = tuning.read()
    const sourceOrbit = DEFAULT_CONFIG.gacha.orbitSpeed
    for (const patch of [
      { 'gacha.orbitSpeed': 0.22, 'gacha.capsuleBob': 0.31 },
      { 'gacha.orbitSpeed': 0.21 },
      { 'gacha.spinDuration': 3.1 },
      { 'gacha.capsuleBob': '0.2' },
      { 'gacha.orbitSpeed': Infinity },
      { unknown: 1 },
    ]) {
      expect(() => tuning.apply(patch)).toThrow()
      expect(tuning.read()).toEqual(before)
    }
    expect(DEFAULT_CONFIG.gacha.orbitSpeed).toBe(sourceOrbit)
  })

  it('applies the stage orbit and capsule bob live while snapshotting source defaults', () => {
    tuning.apply({ 'gacha.orbitSpeed': 0.22, 'gacha.capsuleBob': 0.18 })
    expect(CONFIG.gacha.orbitSpeed).toBe(0.22)
    expect(CONFIG.gacha.capsuleBob).toBe(0.18)
    expect(tuning.read().active['gacha.orbitSpeed']).toBe(0.22)
    expect(DEFAULT_CONFIG.gacha.orbitSpeed).toBe(0.12)
    expect(tuning.unranked).toBe(false)
  })

  it('holds spin duration until the next pull, then activates the draft', () => {
    tuning.apply({ 'gacha.spinDuration': 2 })
    expect(CONFIG.gacha.spinDuration).toBe(1.4)
    expect(tuning.read().requested['gacha.spinDuration']).toBe(2)
    tuning.activate('pull')
    expect(CONFIG.gacha.spinDuration).toBe(2)
    expect(tuning.read().active['gacha.spinDuration']).toBe(2)
  })

  it('resets live and next-pull values to their approved defaults', () => {
    tuning.apply({ 'gacha.orbitSpeed': 0.22, 'gacha.capsuleBob': 0.18, 'gacha.spinDuration': 2 })
    tuning.activate('pull')
    tuning.apply(defaults)
    tuning.activate('pull')
    expect(tuning.read().active).toEqual(defaults)
    expect(tuning.read().requested).toEqual(defaults)
  })
})
