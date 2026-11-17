import { describe, expect, it } from 'vitest'
import { withProject } from './projects'

describe('withProject', () => {
  it('adds a new Project to the saved ones', () => {
    expect(withProject(['/a'], '/b')).toEqual(['/a', '/b'])
  })

  it('is the first Project when none is saved yet', () => {
    expect(withProject(undefined, '/a')).toEqual(['/a'])
  })

  it('keeps one of each Project when the same folder is picked again', () => {
    expect(withProject(['/a', '/b'], '/a')).toEqual(['/a', '/b'])
  })
})
