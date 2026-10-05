import { describe, expect, it } from 'vitest'
import { createEmptyDatabase } from '@/src/database/database.factory'
import {
  buildMonthlyAttendanceSummary,
  buildWeeklyAttendanceSummary,
  classAttendanceTotals,
  findAttendanceByDate,
  isAttendanceDraftDirty,
  shiftLocalDateKey,
  weekStartKeyOf,
  upsertAttendanceRecord,
} from '@/src/utils/attendance'

function makeDb() {
  return createEmptyDatabase({
    className: '3A',
    schoolYear: '2026-2027',
    teacher: {
      id: 't1',
      name: 'Cô Lan',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  })
}

describe('attendance utils', () => {
  it('upserts by date without duplicates', () => {
    const first = upsertAttendanceRecord([], {
      date: '2026-03-10',
      rosterStudentIds: ['s1'],
      entries: [{ studentId: 's1', status: 'unexcused' }],
    })
    expect(first).toHaveLength(1)
    const second = upsertAttendanceRecord(first, {
      date: '2026-03-10',
      rosterStudentIds: ['s1'],
      entries: [{ studentId: 's1', status: 'excused', note: 'Ốm' }],
    })
    expect(second).toHaveLength(1)
    expect(findAttendanceByDate(second, '2026-03-10')?.entries[0].status).toBe('excused')
  })

  it('counts late separately from absent days', () => {
    const db = makeDb()
    db.students = [
      {
        id: 's1',
        name: 'An',
        classroomRoleIds: [],
        badgeIds: [],
        points: 0,
        totalRewards: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    db.attendanceRecords = [
      {
        id: 'a1',
        date: '2026-03-05',
        rosterStudentIds: ['s1'],
        entries: [{ studentId: 's1', status: 'late' }],
        createdAt: '2026-03-05',
        updatedAt: '2026-03-05',
      },
      {
        id: 'a2',
        date: '2026-03-06',
        rosterStudentIds: ['s1'],
        entries: [{ studentId: 's1', status: 'unexcused' }],
        createdAt: '2026-03-06',
        updatedAt: '2026-03-06',
      },
    ]

    const summary = buildMonthlyAttendanceSummary(db, '2026-03')
    expect(summary.schoolDays).toBe(2)
    expect(summary.rows[0].late).toBe(1)
    expect(summary.rows[0].absentDays).toBe(1)
    expect(summary.rows[0].present).toBe(0)
  })

  it('does not track student for days before they were on roster', () => {
    const db = makeDb()
    db.students = [
      {
        id: 's1',
        name: 'An',
        classroomRoleIds: [],
        badgeIds: [],
        points: 0,
        totalRewards: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    db.attendanceRecords = [
      {
        id: 'a1',
        date: '2026-03-01',
        rosterStudentIds: [],
        entries: [],
        createdAt: '2026-03-01',
        updatedAt: '2026-03-01',
      },
      {
        id: 'a2',
        date: '2026-03-02',
        rosterStudentIds: ['s1'],
        entries: [],
        createdAt: '2026-03-02',
        updatedAt: '2026-03-02',
      },
    ]

    const summary = buildMonthlyAttendanceSummary(db, '2026-03')
    expect(summary.rows[0].trackedDays).toBe(1)
    expect(summary.rows[0].present).toBe(1)
  })

  it('shifts local calendar dates across month boundaries', () => {
    expect(shiftLocalDateKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftLocalDateKey('2026-03-31', 1)).toBe('2026-04-01')
  })

  it('summarizes Monday–Sunday weeks without leaking adjacent days', () => {
    expect(weekStartKeyOf('2026-03-08')).toBe('2026-03-02')
    expect(weekStartKeyOf('2026-03-09')).toBe('2026-03-09')
    expect(weekStartKeyOf('2026-03-15')).toBe('2026-03-09')

    const db = makeDb()
    db.students = [
      {
        id: 's1',
        name: 'An',
        classroomRoleIds: [],
        badgeIds: [],
        points: 0,
        totalRewards: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    db.attendanceRecords = [
      {
        id: 'prev',
        date: '2026-03-08',
        rosterStudentIds: ['s1'],
        entries: [{ studentId: 's1', status: 'unexcused' }],
        createdAt: '2026-03-08',
        updatedAt: '2026-03-08',
      },
      {
        id: 'mon',
        date: '2026-03-09',
        rosterStudentIds: ['s1'],
        entries: [{ studentId: 's1', status: 'late' }],
        createdAt: '2026-03-09',
        updatedAt: '2026-03-09',
      },
      {
        id: 'sun',
        date: '2026-03-15',
        rosterStudentIds: ['s1'],
        entries: [{ studentId: 's1', status: 'unexcused' }],
        createdAt: '2026-03-15',
        updatedAt: '2026-03-15',
      },
      {
        id: 'next',
        date: '2026-03-16',
        rosterStudentIds: ['s1'],
        entries: [{ studentId: 's1', status: 'excused' }],
        createdAt: '2026-03-16',
        updatedAt: '2026-03-16',
      },
    ]

    const summary = buildWeeklyAttendanceSummary(db, '2026-03-09')
    expect(summary.schoolDays).toBe(2)
    expect(summary.weekStartKey).toBe('2026-03-09')
    expect(summary.rows[0].late).toBe(1)
    expect(summary.rows[0].absentDays).toBe(1)
    expect(summary.rows[0].present).toBe(0)
    expect(classAttendanceTotals(summary.rows).totalLate).toBe(1)
    expect(classAttendanceTotals(summary.rows).totalAbsent).toBe(1)
  })

  it('treats a new all-present day as clean until exceptions or a note are added', () => {
    const draft = new Map([['s1', { status: 'present' as const }]])
    expect(isAttendanceDraftDirty(draft, '', undefined)).toBe(false)
    expect(isAttendanceDraftDirty(draft, 'Họp phụ huynh', undefined)).toBe(true)
    expect(isAttendanceDraftDirty(new Map([['s1', { status: 'late' as const }]]), '', undefined)).toBe(true)
  })
})
