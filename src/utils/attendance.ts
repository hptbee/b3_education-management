import type {
  AttendanceAbsenceStatus,
  AttendanceEntry,
  AttendanceRecord,
  Student,
} from '@/src/types/models'
import type { ClassroomDatabase } from '@/src/database/types'
import { createId } from '@/src/utils/id'
import { getMondayWeekStart } from '@/src/utils/datePeriods'

export type AttendanceDayStatus = AttendanceAbsenceStatus | 'present'

export const ABSENCE_LABELS: Record<AttendanceAbsenceStatus, string> = {
  excused: 'Vắng có phép',
  unexcused: 'Vắng không phép',
  late: 'Đi muộn',
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceDayStatus, string> = {
  present: 'Có mặt',
  ...ABSENCE_LABELS,
}

export function todayLocalDateKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDateKey(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function shiftLocalDateKey(date: string, deltaDays: number): string {
  const parsed = parseLocalDateKey(date)
  parsed.setDate(parsed.getDate() + deltaDays)
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatLocalDateLabel(date: string): string {
  return parseLocalDateKey(date).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function monthKeyOf(date: string): string {
  return date.slice(0, 7)
}

export function toLocalDateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function weekStartKeyOf(date: string): string {
  return toLocalDateKeyFromDate(getMondayWeekStart(parseLocalDateKey(date)))
}

export function currentWeekStartKey(): string {
  return weekStartKeyOf(todayLocalDateKey())
}

export function weekEndKeyOf(weekStartKey: string): string {
  return shiftLocalDateKey(weekStartKey, 6)
}

export function formatWeekLabel(weekStartKey: string): string {
  const start = parseLocalDateKey(weekStartKey)
  const end = parseLocalDateKey(weekEndKeyOf(weekStartKey))
  const startText = start.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' })
  const endText = end.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' })
  return `Tuần ${startText} – ${endText}`
}

export function findAttendanceByDate(
  records: AttendanceRecord[],
  date: string,
): AttendanceRecord | undefined {
  return records.find((record) => record.date === date)
}

export interface UpsertAttendanceInput {
  date: string
  entries: AttendanceEntry[]
  rosterStudentIds: string[]
  note?: string
}

export function upsertAttendanceRecord(
  records: AttendanceRecord[],
  input: UpsertAttendanceInput,
): AttendanceRecord[] {
  const now = new Date().toISOString()
  const existing = findAttendanceByDate(records, input.date)
  if (existing) {
    return records.map((record) =>
      record.date === input.date
        ? {
            ...record,
            entries: [...input.entries],
            rosterStudentIds: [...input.rosterStudentIds],
            note: input.note?.trim() || undefined,
            updatedAt: now,
          }
        : record,
    )
  }

  const created: AttendanceRecord = {
    id: createId('attendance'),
    date: input.date,
    entries: [...input.entries],
    rosterStudentIds: [...input.rosterStudentIds],
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }

  return [created, ...records]
}

export function deleteAttendanceByDate(records: AttendanceRecord[], date: string): AttendanceRecord[] {
  return records.filter((record) => record.date !== date)
}

export function attendanceMonthOptions(records: AttendanceRecord[]): string[] {
  const months = new Set<string>()
  for (const record of records) {
    months.add(monthKeyOf(record.date))
  }
  months.add(monthKeyOf(todayLocalDateKey()))
  return [...months].sort((a, b) => b.localeCompare(a))
}

export function attendanceWeekOptions(records: AttendanceRecord[]): string[] {
  const weeks = new Set<string>()
  for (const record of records) {
    weeks.add(weekStartKeyOf(record.date))
  }
  weeks.add(currentWeekStartKey())
  return [...weeks].sort((a, b) => b.localeCompare(a))
}

export interface StudentAttendanceSummary {
  studentId: string
  studentName: string
  present: number
  excused: number
  unexcused: number
  late: number
  absentDays: number
  trackedDays: number
  attendanceRate: number
}

export interface AttendancePeriodSummary {
  periodKey: string
  schoolDays: number
  rows: StudentAttendanceSummary[]
}

export interface MonthlyAttendanceSummary extends AttendancePeriodSummary {
  monthKey: string
}

export interface WeeklyAttendanceSummary extends AttendancePeriodSummary {
  weekStartKey: string
}

function studentNameById(students: Student[], studentId: string): string {
  return students.find((student) => student.id === studentId)?.name ?? 'Học sinh'
}

function buildAttendanceSummary(
  database: Pick<ClassroomDatabase, 'students' | 'attendanceRecords'>,
  records: AttendanceRecord[],
): Pick<AttendancePeriodSummary, 'schoolDays' | 'rows'> {
  const schoolDays = records.length

  const rows: StudentAttendanceSummary[] = database.students.map((student) => {
    let present = 0
    let excused = 0
    let unexcused = 0
    let late = 0
    let trackedDays = 0

    for (const record of records) {
      if (!record.rosterStudentIds.includes(student.id)) continue
      trackedDays += 1
      const entry = record.entries.find((item) => item.studentId === student.id)
      if (!entry) {
        present += 1
        continue
      }
      if (entry.status === 'excused') excused += 1
      else if (entry.status === 'unexcused') unexcused += 1
      else if (entry.status === 'late') late += 1
    }

    const absentDays = excused + unexcused
    const attendanceRate = trackedDays > 0 ? present / trackedDays : 0

    return {
      studentId: student.id,
      studentName: studentNameById(database.students, student.id),
      present,
      excused,
      unexcused,
      late,
      absentDays,
      trackedDays,
      attendanceRate,
    }
  })

  return { schoolDays, rows }
}

export function buildMonthlyAttendanceSummary(
  database: Pick<ClassroomDatabase, 'students' | 'attendanceRecords'>,
  monthKey: string,
): MonthlyAttendanceSummary {
  const records = (database.attendanceRecords ?? []).filter(
    (record) => monthKeyOf(record.date) === monthKey,
  )
  return { monthKey, periodKey: monthKey, ...buildAttendanceSummary(database, records) }
}

export function buildWeeklyAttendanceSummary(
  database: Pick<ClassroomDatabase, 'students' | 'attendanceRecords'>,
  weekStartKey: string,
): WeeklyAttendanceSummary {
  const weekEndKey = weekEndKeyOf(weekStartKey)
  const records = (database.attendanceRecords ?? []).filter(
    (record) => record.date >= weekStartKey && record.date <= weekEndKey,
  )
  return { weekStartKey, periodKey: weekStartKey, ...buildAttendanceSummary(database, records) }
}

export function classAttendanceTotals(rows: StudentAttendanceSummary[]): {
  totalAbsent: number
  totalLate: number
  classRate: number
} {
  let present = 0
  let trackedDays = 0
  let totalAbsent = 0
  let totalLate = 0
  for (const row of rows) {
    present += row.present
    trackedDays += row.trackedDays
    totalAbsent += row.absentDays
    totalLate += row.late
  }
  return {
    totalAbsent,
    totalLate,
    classRate: trackedDays > 0 ? present / trackedDays : 0,
  }
}

export function formatAttendanceRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '0%'
  return `${Math.round(rate * 100)}%`
}

export function entriesFromDraft(
  draft: Map<string, { status: AttendanceDayStatus; note?: string }>,
): AttendanceEntry[] {
  const entries: AttendanceEntry[] = []
  for (const [studentId, value] of draft.entries()) {
    if (value.status === 'present') continue
    entries.push({
      studentId,
      status: value.status,
      note: value.note?.trim() || undefined,
    })
  }
  return entries
}

export function draftFromAttendanceRecord(
  students: Student[],
  record: AttendanceRecord | undefined,
): Map<string, { status: AttendanceDayStatus; note?: string }> {
  const draft = new Map<string, { status: AttendanceDayStatus; note?: string }>()
  for (const student of students) {
    draft.set(student.id, { status: 'present' })
  }
  if (!record) return draft

  for (const entry of record.entries) {
    if (!draft.has(entry.studentId)) continue
    draft.set(entry.studentId, {
      status: entry.status,
      note: entry.note,
    })
  }
  return draft
}

function entryFingerprint(entry: AttendanceEntry): string {
  return `${entry.studentId}:${entry.status}:${entry.note?.trim() ?? ''}`
}

export function isAttendanceDraftDirty(
  draft: Map<string, { status: AttendanceDayStatus; note?: string }>,
  dayNote: string,
  record: AttendanceRecord | undefined,
): boolean {
  const nextNote = dayNote.trim() || undefined
  const nextEntries = entriesFromDraft(draft)
  if (!record) return nextEntries.length > 0 || Boolean(nextNote)

  if ((record.note ?? undefined) !== nextNote) return true
  if (nextEntries.length !== record.entries.length) return true

  const nextKeys = nextEntries.map(entryFingerprint).sort()
  const savedKeys = record.entries.map(entryFingerprint).sort()
  return nextKeys.join('|') !== savedKeys.join('|')
}
