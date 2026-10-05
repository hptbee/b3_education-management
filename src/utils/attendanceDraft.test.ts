import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAttendanceDraft,
  loadAttendanceDraft,
  saveAttendanceDraft,
} from '@/src/utils/attendanceDraft'

describe('attendance draft storage', () => {
  const store: Record<string, string> = {}

  beforeEach(() => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.keys(store).forEach((key) => delete store[key])
  })

  it('restores a draft only for the same classroom and date', () => {
    saveAttendanceDraft('class-a', '2026-10-04', {
      entries: [{ studentId: 'student-1', status: 'excused', note: 'Ốm' }],
      note: 'Ngày mưa',
    })

    expect(loadAttendanceDraft('class-a', '2026-10-04')).toMatchObject({
      entries: [{ studentId: 'student-1', status: 'excused', note: 'Ốm' }],
      note: 'Ngày mưa',
    })
    expect(loadAttendanceDraft('class-b', '2026-10-04')).toBeNull()
    expect(loadAttendanceDraft('class-a', '2026-10-05')).toBeNull()
  })

  it('clears the draft after an attendance record is saved', () => {
    saveAttendanceDraft('class-a', '2026-10-04', { entries: [], note: '' })
    clearAttendanceDraft('class-a', '2026-10-04')
    expect(loadAttendanceDraft('class-a', '2026-10-04')).toBeNull()
  })
})
