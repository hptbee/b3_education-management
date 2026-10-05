import type { AttendanceEntry } from '@/src/types/models'

const DRAFT_VERSION = 1
const DRAFT_PREFIX = 'education-management:attendance-draft'

export interface AttendanceDraftSnapshot {
  entries: AttendanceEntry[]
  note: string
  updatedAt: string
}

function draftKey(classroomId: string, date: string): string {
  return `${DRAFT_PREFIX}:v${DRAFT_VERSION}:${classroomId}:${date}`
}

function isAttendanceEntry(value: unknown): value is AttendanceEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.studentId === 'string' &&
    ['excused', 'unexcused', 'late'].includes(String(entry.status)) &&
    (entry.note === undefined || typeof entry.note === 'string')
  )
}

export function loadAttendanceDraft(
  classroomId: string | undefined,
  date: string,
): AttendanceDraftSnapshot | null {
  if (!classroomId || !date || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(draftKey(classroomId, date))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AttendanceDraftSnapshot>
    if (!Array.isArray(parsed.entries) || !parsed.entries.every(isAttendanceEntry)) return null
    if (typeof parsed.note !== 'string' || typeof parsed.updatedAt !== 'string') return null
    return {
      entries: parsed.entries,
      note: parsed.note,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

export function saveAttendanceDraft(
  classroomId: string | undefined,
  date: string,
  draft: Omit<AttendanceDraftSnapshot, 'updatedAt'>,
): void {
  if (!classroomId || !date || typeof window === 'undefined') return
  try {
    localStorage.setItem(
      draftKey(classroomId, date),
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() } satisfies AttendanceDraftSnapshot),
    )
  } catch {
    // A full or unavailable localStorage should not block attendance work.
  }
}

export function clearAttendanceDraft(classroomId: string | undefined, date: string): void {
  if (!classroomId || !date || typeof window === 'undefined') return
  try {
    localStorage.removeItem(draftKey(classroomId, date))
  } catch {
    // Ignore unavailable localStorage; the main database remains unaffected.
  }
}
