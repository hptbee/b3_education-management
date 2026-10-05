'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Search,
  UserX,
} from 'lucide-react'
import { useAppData } from '@/src/store/AppDataContext'
import { useActiveClassroom } from '@/src/hooks/useActiveClassroom'
import {
  attendanceMonthOptions,
  attendanceWeekOptions,
  buildMonthlyAttendanceSummary,
  buildWeeklyAttendanceSummary,
  currentWeekStartKey,
  draftFromAttendanceRecord,
  entriesFromDraft,
  formatLocalDateLabel,
  formatWeekLabel,
  findAttendanceByDate,
  formatAttendanceRate,
  isAttendanceDraftDirty,
  shiftLocalDateKey,
  todayLocalDateKey,
  type AttendanceDayStatus,
} from '@/src/utils/attendance'
import { downloadAttendanceMonthlyReport } from '@/src/utils/attendanceExcel'
import {
  clearAttendanceDraft,
  loadAttendanceDraft,
  saveAttendanceDraft,
} from '@/src/utils/attendanceDraft'
import { toastError } from '@/src/utils/toast'
import { getStudentRosterOrder } from '@/src/utils/student'
import { StudentAvatar } from '@/src/components/StudentAvatar'
import {
  ClassroomButton,
  classroomButtonVariants,
  ClassroomCard,
  ClassroomSelect,
  EmptyState,
  IconTouchButton,
  PageHeader,
  useClassroomDialog,
} from '@/src/components/classroom'
import { cn } from '@/lib/utils'

type AttendanceTab = 'daily' | 'report'
type ReportPeriod = 'week' | 'month'
type AttendanceRosterSort = 'stt' | 'name'
type AttendanceSortColumn =
  | 'studentName'
  | 'present'
  | 'excused'
  | 'unexcused'
  | 'late'
  | 'absentDays'
  | 'attendanceRate'
type SortDirection = 'asc' | 'desc'

const STATUS_OPTIONS: { id: AttendanceDayStatus; short: string; className: string }[] = [
  { id: 'present', short: 'Có mặt', className: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  { id: 'excused', short: 'Có phép', className: 'bg-sky-100 text-sky-800 ring-sky-200' },
  { id: 'unexcused', short: 'Không phép', className: 'bg-rose-100 text-rose-800 ring-rose-200' },
  { id: 'late', short: 'Muộn', className: 'bg-amber-100 text-amber-800 ring-amber-200' },
]

function formatSavedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  return `Tháng ${month}/${year}`
}

export default function AttendancePage() {
  const { data, saveAttendance, deleteAttendance } = useAppData()
  const { isLoaded } = useActiveClassroom()
  const { showConfirm } = useClassroomDialog()
  const [tab, setTab] = useState<AttendanceTab>('daily')
  const [selectedDate, setSelectedDate] = useState(todayLocalDateKey)
  const [dayNote, setDayNote] = useState('')
  const [draft, setDraft] = useState(() => new Map<string, { status: AttendanceDayStatus; note?: string }>())
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('week')
  const [weekKey, setWeekKey] = useState(currentWeekStartKey)
  const [monthKey, setMonthKey] = useState(() => todayLocalDateKey().slice(0, 7))
  const [exporting, setExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [rosterSort, setRosterSort] = useState<AttendanceRosterSort>('stt')
  const [sortColumn, setSortColumn] = useState<AttendanceSortColumn>('absentDays')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [saving, setSaving] = useState(false)
  const lastLoadedDateRef = useRef<string | null>(null)

  const students = data?.students ?? []
  const records = data?.attendanceRecords ?? []
  const classroomId = data?.metadata.id

  const existingRecord = useMemo(
    () => findAttendanceByDate(records, selectedDate),
    [records, selectedDate],
  )
  const draftScopeKey = `${classroomId ?? ''}:${selectedDate}`

  useEffect(() => {
    if (lastLoadedDateRef.current === draftScopeKey) return
    const nextDraft = draftFromAttendanceRecord(students, existingRecord)
    const savedDraft = loadAttendanceDraft(classroomId, selectedDate)
    if (savedDraft) {
      for (const entry of savedDraft.entries) {
        if (!nextDraft.has(entry.studentId)) continue
        nextDraft.set(entry.studentId, { status: entry.status, note: entry.note })
      }
    }
    setDraft(nextDraft)
    setDayNote(savedDraft?.note ?? existingRecord?.note ?? '')
    lastLoadedDateRef.current = draftScopeKey
  }, [classroomId, draftScopeKey, students, existingRecord, selectedDate])

  const summaryCounts = useMemo(() => {
    let present = 0
    let absent = 0
    let late = 0
    for (const student of students) {
      const status = draft.get(student.id)?.status ?? 'present'
      if (status === 'present') present += 1
      else if (status === 'late') late += 1
      else absent += 1
    }
    return { present, absent, late }
  }, [students, draft])

  const monthOptions = useMemo(() => attendanceMonthOptions(records), [records])
  const weekOptions = useMemo(() => attendanceWeekOptions(records), [records])
  const resolvedWeekKey = weekOptions.includes(weekKey) ? weekKey : (weekOptions[0] ?? currentWeekStartKey())
  const resolvedMonthKey = monthOptions.includes(monthKey) ? monthKey : (monthOptions[0] ?? todayLocalDateKey().slice(0, 7))

  const monthlySummary = useMemo(() => {
    if (!data) return null
    return buildMonthlyAttendanceSummary(data, resolvedMonthKey)
  }, [data, resolvedMonthKey])

  const weeklySummary = useMemo(() => {
    if (!data) return null
    return buildWeeklyAttendanceSummary(data, resolvedWeekKey)
  }, [data, resolvedWeekKey])

  const periodSummary = reportPeriod === 'week' ? weeklySummary : monthlySummary
  const absentHighlightDays = reportPeriod === 'week' ? 2 : 3

  const topAbsentStudent = useMemo(() => {
    if (!periodSummary?.rows.length) return null
    return [...periodSummary.rows].sort((a, b) => b.absentDays - a.absentDays)[0]
  }, [periodSummary])

  const sortedSummaryRows = useMemo(() => {
    if (!periodSummary) return []
    return [...periodSummary.rows].sort((a, b) => {
      const aValue = a[sortColumn]
      const bValue = b[sortColumn]
      const comparison =
        typeof aValue === 'string' && typeof bValue === 'string'
          ? aValue.localeCompare(bValue, 'vi')
          : Number(aValue) - Number(bValue)
      if (comparison !== 0) return sortDirection === 'asc' ? comparison : -comparison
      return a.studentName.localeCompare(b.studentName, 'vi')
    })
  }, [periodSummary, sortColumn, sortDirection])

  const sortedStudents = useMemo(() => {
    const list = [...students]
    if (rosterSort === 'name') {
      return list.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    }
    return list.sort(
      (a, b) =>
        getStudentRosterOrder(a, students) - getStudentRosterOrder(b, students),
    )
  }, [rosterSort, students])

  const visibleStudents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('vi-VN')
    return sortedStudents.filter((student) => {
      const state = draft.get(student.id)?.status ?? 'present'
      const stt = getStudentRosterOrder(student, students) + 1
      const matchesSearch =
        !query ||
        student.name.toLocaleLowerCase('vi-VN').includes(query) ||
        String(stt).startsWith(query)
      const needsAttention = state !== 'present'
      return matchesSearch && (!attentionOnly || needsAttention)
    })
  }, [attentionOnly, draft, searchQuery, sortedStudents, students])

  const hasUnsavedChanges = useMemo(
    () => isAttendanceDraftDirty(draft, dayNote, existingRecord),
    [dayNote, draft, existingRecord],
  )
  const canSave = !existingRecord || hasUnsavedChanges

  useEffect(() => {
    if (!classroomId || !hasUnsavedChanges) {
      if (!hasUnsavedChanges) clearAttendanceDraft(classroomId, selectedDate)
      return
    }
    const timer = window.setTimeout(() => {
      saveAttendanceDraft(classroomId, selectedDate, {
        entries: entriesFromDraft(draft),
        note: dayNote,
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [classroomId, dayNote, draft, hasUnsavedChanges, selectedDate])

  const setStudentStatus = useCallback((studentId: string, status: AttendanceDayStatus) => {
    setDraft((prev) => {
      const next = new Map(prev)
      const current = next.get(studentId)
      next.set(studentId, { status, note: current?.note })
      return next
    })
  }, [])

  const setStudentNote = useCallback((studentId: string, note: string) => {
    setDraft((prev) => {
      const next = new Map(prev)
      const current = next.get(studentId) ?? { status: 'present' as const }
      next.set(studentId, { ...current, note })
      return next
    })
  }, [])

  const markAllPresent = useCallback(() => {
    setDraft((prev) => {
      const next = new Map(prev)
      for (const student of students) {
        next.set(student.id, { status: 'present' })
      }
      return next
    })
  }, [students])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await saveAttendance({
        date: selectedDate,
        entries: entriesFromDraft(draft),
        note: dayNote,
      })
      clearAttendanceDraft(classroomId, selectedDate)
      lastLoadedDateRef.current = null
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Không thể lưu điểm danh. Hãy thử lại.')
    } finally {
      setSaving(false)
    }
  }

  const changeTab = async (nextTab: AttendanceTab) => {
    if (nextTab === tab) return
    if (tab === 'daily' && hasUnsavedChanges) {
      const confirmed = await showConfirm(
        'Điểm danh chưa được lưu. Bản nháp vẫn được giữ trên thiết bị nếu bạn chuyển tab.',
        { title: 'Chưa lưu điểm danh', confirmLabel: 'Chuyển tab', variant: 'warning' },
      )
      if (!confirmed) return
    }
    setTab(nextTab)
  }

  const handleExport = async () => {
    if (!periodSummary || !data) return
    setExporting(true)
    try {
      await downloadAttendanceMonthlyReport(periodSummary, data.classroomSettings.className)
    } catch {
      toastError('Không thể xuất file Excel. Hãy thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const changeDate = async (nextDate: string) => {
    if (!nextDate || nextDate === selectedDate) return
    if (hasUnsavedChanges) {
      const confirmed = await showConfirm(
        'Các thay đổi điểm danh chưa được lưu. Bạn có muốn bỏ các thay đổi này để chuyển ngày không?',
        { title: 'Bỏ thay đổi chưa lưu', confirmLabel: 'Bỏ thay đổi', variant: 'warning' },
      )
      if (!confirmed) return
      clearAttendanceDraft(classroomId, selectedDate)
    }
    lastLoadedDateRef.current = null
    setSelectedDate(nextDate)
  }

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      `Xóa toàn bộ bản điểm danh ngày ${formatLocalDateLabel(selectedDate)}? Hành động này không thể hoàn tác.`,
      { title: 'Xóa bản điểm danh', confirmLabel: 'Xóa bản ghi', variant: 'error' },
    )
    if (!confirmed) return
    try {
      await deleteAttendance(selectedDate)
      clearAttendanceDraft(classroomId, selectedDate)
      lastLoadedDateRef.current = null
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Không thể xóa điểm danh. Hãy thử lại.')
    }
  }

  const toggleSort = (column: AttendanceSortColumn) => {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection(column === 'studentName' ? 'asc' : 'desc')
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xl font-bold text-slate-500">Đang tải dữ liệu...</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto scrollbar-thin',
        tab === 'daily' && students.length > 0 && 'scroll-pb-28',
      )}
    >
      <div
        className={cn(
          'classroom-page--management',
          tab === 'daily' && students.length > 0 && 'pb-28',
        )}
      >
        <PageHeader
          icon={CalendarCheck}
          title="Điểm danh"
          subtitle="Điểm danh hằng ngày và tổng kết số ngày nghỉ theo tuần, tháng"
        />

        <div
          role="tablist"
          aria-label="Chế độ điểm danh"
          className="inline-flex flex-wrap rounded-2xl border border-sky-100 bg-white p-1 shadow-sm"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
            event.preventDefault()
            void changeTab(tab === 'daily' ? 'report' : 'daily')
          }}
        >
          <button
            type="button"
            role="tab"
            id="attendance-tab-daily"
            aria-selected={tab === 'daily'}
            aria-controls="attendance-panel-daily"
            tabIndex={tab === 'daily' ? 0 : -1}
            onClick={() => void changeTab('daily')}
            className={cn(
              'flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              tab === 'daily' ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-brand-soft',
            )}
          >
            Điểm danh
          </button>
          <button
            type="button"
            role="tab"
            id="attendance-tab-report"
            aria-selected={tab === 'report'}
            aria-controls="attendance-panel-report"
            tabIndex={tab === 'report' ? 0 : -1}
            onClick={() => void changeTab('report')}
            className={cn(
              'flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              tab === 'report' ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-brand-soft',
            )}
          >
            Tổng kết
          </button>
        </div>

        {tab === 'daily' ? (
          <div
            role="tabpanel"
            id="attendance-panel-daily"
            aria-labelledby="attendance-tab-daily"
            className="space-y-5"
          >
          {students.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="Chưa có học sinh"
              description="Thêm học sinh trong mục Học sinh trước khi điểm danh."
              action={
                <Link href="/students" className={classroomButtonVariants()}>
                  Thêm học sinh
                </Link>
              }
            />
          ) : (
            <>
              <ClassroomCard lift={false} className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <IconTouchButton
                      onClick={() => void changeDate(shiftLocalDateKey(selectedDate, -1))}
                      aria-label="Điểm danh ngày trước"
                      className="shrink-0 border border-sky-100 bg-surface-soft text-slate-600 hover:bg-pastel-sky hover:text-brand-dark"
                    >
                      <ChevronLeft className="size-5" aria-hidden />
                    </IconTouchButton>
                    <label
                      htmlFor="attendance-date"
                      className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold text-slate-500 sm:max-w-xs"
                    >
                      Ngày điểm danh
                      <span className="truncate text-sm font-extrabold capitalize text-slate-800">
                        {formatLocalDateLabel(selectedDate)}
                      </span>
                    </label>
                    <IconTouchButton
                      onClick={() => void changeDate(shiftLocalDateKey(selectedDate, 1))}
                      disabled={selectedDate >= todayLocalDateKey()}
                      aria-label="Điểm danh ngày sau"
                      className="shrink-0 border border-sky-100 bg-surface-soft text-slate-600 hover:bg-pastel-sky hover:text-brand-dark"
                    >
                      <ChevronRight className="size-5" aria-hidden />
                    </IconTouchButton>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="attendance-date"
                      type="date"
                      value={selectedDate}
                      max={todayLocalDateKey()}
                      onChange={(e) => void changeDate(e.target.value)}
                      className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                    {selectedDate !== todayLocalDateKey() ? (
                      <ClassroomButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void changeDate(todayLocalDateKey())}
                      >
                        Hôm nay
                      </ClassroomButton>
                    ) : null}
                  </div>
                  {existingRecord ? (
                    <p className="w-full rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 sm:w-auto">
                      Đã điểm danh lúc {formatSavedAt(existingRecord.updatedAt)}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-600">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">
                    <Check className="size-4" aria-hidden />
                    Có mặt {summaryCounts.present}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-rose-800">
                    <UserX className="size-4" aria-hidden />
                    Vắng {summaryCounts.absent}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">
                    <Clock className="size-4" aria-hidden />
                    Muộn {summaryCounts.late}
                  </span>
                  <ClassroomButton type="button" variant="secondary" onClick={markAllPresent} className="sm:ml-auto">
                    Tất cả có mặt
                  </ClassroomButton>
                </div>

                <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                  Ghi chú chung (tuỳ chọn)
                  <input
                    type="text"
                    value={dayNote}
                    onChange={(e) => setDayNote(e.target.value)}
                    placeholder="Ví dụ: Lớp đi tham quan buổi chiều"
                    className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </label>
              </ClassroomCard>

              <ClassroomCard lift={false} className="space-y-4 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-display text-lg font-extrabold text-slate-800">Danh sách lớp</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {visibleStudents.length}/{students.length} học sinh
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="flex min-w-[8.5rem] flex-col gap-1 text-xs font-bold text-slate-500">
                      Sắp xếp
                      <ClassroomSelect
                        variant="field"
                        value={rosterSort}
                        onChange={(event) => setRosterSort(event.target.value as AttendanceRosterSort)}
                        aria-label="Sắp xếp danh sách học sinh"
                        className="min-h-11"
                      >
                        <option value="stt">STT lớp</option>
                        <option value="name">Tên A–Z</option>
                      </ClassroomSelect>
                    </label>
                    <label className="relative flex min-w-0 flex-col gap-1 text-xs font-bold text-slate-500 sm:w-60">
                      Tìm học sinh
                      <span className="relative block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Tên hoặc STT..."
                          className="min-h-11 w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                        />
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setAttentionOnly((current) => !current)}
                      aria-pressed={attentionOnly}
                      className={cn(
                        'min-h-11 rounded-xl border px-3 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                        attentionOnly
                          ? 'border-amber-200 bg-amber-100 text-amber-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      Cần chú ý ({summaryCounts.absent + summaryCounts.late})
                    </button>
                  </div>
                </div>

                {visibleStudents.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Search}
                    title="Không tìm thấy học sinh"
                    description="Thử bỏ bộ lọc hoặc tìm bằng tên / STT khác."
                    action={
                      <ClassroomButton
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSearchQuery('')
                          setAttentionOnly(false)
                        }}
                      >
                        Xóa bộ lọc
                      </ClassroomButton>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-sky-100 overflow-hidden rounded-2xl border border-sky-100">
                    {visibleStudents.map((student) => {
                  const state = draft.get(student.id) ?? { status: 'present' as const }
                  const showNote = state.status !== 'present'
                  return (
                    <li key={student.id} className="bg-white px-3 py-3 sm:px-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-black text-brand-dark">
                            {getStudentRosterOrder(student, students) + 1}
                          </span>
                          <StudentAvatar
                            student={student}
                            classroomId={data?.metadata.id}
                            alt=""
                            className="size-10 shrink-0 rounded-full border-2 border-white ring-2 ring-sky-100"
                          />
                          <p className="truncate text-sm font-extrabold text-slate-800">{student.name}</p>
                        </div>
                        <div
                          role="radiogroup"
                          aria-label={`Điểm danh ${student.name}`}
                          className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[390px]"
                          onKeyDown={(event) => {
                            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                            event.preventDefault()
                            const index = STATUS_OPTIONS.findIndex((option) => option.id === state.status)
                            const delta = event.key === 'ArrowRight' ? 1 : -1
                            const next = STATUS_OPTIONS[(index + delta + STATUS_OPTIONS.length) % STATUS_OPTIONS.length]
                            if (next) setStudentStatus(student.id, next.id)
                          }}
                        >
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={state.status === option.id}
                            onClick={() => setStudentStatus(student.id, option.id)}
                            className={cn(
                              'min-h-11 rounded-xl px-2 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                              state.status === option.id
                                ? `ring-1 ${option.className}`
                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
                            )}
                          >
                            {option.short}
                          </button>
                        ))}
                        </div>
                      </div>
                      {showNote ? (
                        <label className="mt-3 block pl-0 lg:pl-[4.25rem]">
                          <span className="sr-only">Ghi chú cho {student.name}</span>
                          <input
                            type="text"
                            value={state.note ?? ''}
                            onChange={(e) => setStudentNote(student.id, e.target.value)}
                            placeholder={state.status === 'late' ? 'Ghi chú đi muộn...' : 'Lý do nghỉ...'}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                          />
                        </label>
                      ) : null}
                    </li>
                  )
                    })}
                  </ul>
                )}
              </ClassroomCard>

              <div className="sticky bottom-3 z-10 rounded-3xl border border-sky-100 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4">
                <div className="mb-3 sm:mb-0">
                  <p className="text-sm font-bold text-slate-600" aria-live="polite">
                    {saving
                      ? 'Đang lưu điểm danh...'
                      : hasUnsavedChanges
                        ? 'Có thay đổi chưa lưu'
                        : existingRecord
                          ? 'Điểm danh đã được lưu'
                          : 'Sẵn sàng điểm danh'}
                  </p>
                  {hasUnsavedChanges && !saving ? (
                    <p className="mt-0.5 text-xs font-semibold text-slate-600">
                      Bản nháp tự lưu trên thiết bị và sẽ khôi phục sau khi tải lại trang.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {existingRecord ? (
                    <ClassroomButton type="button" variant="danger" onClick={() => void handleDelete()} disabled={saving}>
                      Xóa bản ghi
                    </ClassroomButton>
                  ) : null}
                  <ClassroomButton type="button" onClick={() => void handleSave()} disabled={!canSave || saving}>
                    <Check className="size-4" aria-hidden />
                    {saving ? 'Đang lưu...' : existingRecord ? 'Cập nhật điểm danh' : 'Lưu điểm danh'}
                  </ClassroomButton>
                </div>
              </div>
            </>
          )}
          </div>
        ) : (
          <div
            role="tabpanel"
            id="attendance-panel-report"
            aria-labelledby="attendance-tab-report"
            className="space-y-5"
          >
            <ClassroomCard lift={false} className="space-y-4">
              <div
                role="group"
                aria-label="Khoảng thời gian tổng kết"
                className="inline-flex rounded-2xl border border-sky-100 bg-slate-50/80 p-1"
              >
                <button
                  type="button"
                  aria-pressed={reportPeriod === 'week'}
                  onClick={() => setReportPeriod('week')}
                  className={cn(
                    'flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                    reportPeriod === 'week'
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white',
                  )}
                >
                  Tuần
                </button>
                <button
                  type="button"
                  aria-pressed={reportPeriod === 'month'}
                  onClick={() => setReportPeriod('month')}
                  className={cn(
                    'flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                    reportPeriod === 'month'
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white',
                  )}
                >
                  Tháng
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_1fr] md:items-end">
                {reportPeriod === 'week' ? (
                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                    Tuần
                    <ClassroomSelect
                      variant="field"
                      value={resolvedWeekKey}
                      onChange={(e) => setWeekKey(e.target.value)}
                      aria-label="Chọn tuần tổng kết"
                    >
                      {weekOptions.map((key) => (
                        <option key={key} value={key}>
                          {formatWeekLabel(key)}
                        </option>
                      ))}
                    </ClassroomSelect>
                  </label>
                ) : (
                  <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">
                    Tháng
                    <ClassroomSelect
                      variant="field"
                      value={resolvedMonthKey}
                      onChange={(e) => setMonthKey(e.target.value)}
                      aria-label="Chọn tháng tổng kết"
                    >
                      {monthOptions.map((key) => (
                        <option key={key} value={key}>
                          {formatMonthLabel(key)}
                        </option>
                      ))}
                    </ClassroomSelect>
                  </label>
                )}
                <ClassroomButton
                  type="button"
                  variant="secondary"
                  onClick={() => void handleExport()}
                  disabled={exporting || !periodSummary || periodSummary.schoolDays === 0}
                  className="md:justify-self-start"
                >
                  <Download className="size-4" aria-hidden />
                  {exporting ? 'Đang xuất...' : 'Xuất Excel'}
                </ClassroomButton>
              </div>

              {periodSummary ? (
                <div className="flex flex-wrap gap-2 text-sm font-bold text-slate-600">
                  <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sky-800">
                    {periodSummary.schoolDays} ngày đã điểm danh
                  </span>
                  <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-800">
                    {periodSummary.rows.reduce((sum, row) => sum + row.absentDays, 0)} lượt nghỉ
                  </span>
                  {topAbsentStudent && topAbsentStudent.absentDays > 0 ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-900">
                      Nghỉ nhiều nhất: {topAbsentStudent.studentName} ({topAbsentStudent.absentDays} ngày)
                    </span>
                  ) : null}
                </div>
              ) : null}
            </ClassroomCard>

            {!periodSummary || periodSummary.schoolDays === 0 ? (
              <EmptyState
                icon={FileSpreadsheet}
                title={reportPeriod === 'week' ? 'Chưa có dữ liệu tuần này' : 'Chưa có dữ liệu tháng này'}
                description={
                  reportPeriod === 'week'
                    ? 'Điểm danh ít nhất một ngày trong tuần để xem tổng kết.'
                    : 'Điểm danh ít nhất một ngày trong tháng để xem tổng kết.'
                }
                action={
                  <ClassroomButton type="button" onClick={() => void changeTab('daily')}>
                    {reportPeriod === 'week' ? 'Điểm danh tuần này' : 'Điểm danh tháng này'}
                  </ClassroomButton>
                }
              />
            ) : (
              <ClassroomCard lift={false} className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-sky-100 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                      {([
                        ['studentName', 'Học sinh'],
                        ['present', 'Có mặt'],
                        ['excused', 'Vắng CP'],
                        ['unexcused', 'Vắng KP'],
                        ['late', 'Muộn'],
                        ['absentDays', 'Nghỉ (ngày)'],
                        ['attendanceRate', 'Tỉ lệ'],
                      ] as const).map(([column, label]) => {
                        const isActive = sortColumn === column
                        return (
                          <th
                            key={column}
                            aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                            className="px-2 py-2 text-left"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(column)}
                              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 py-1 text-left transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                            >
                              {label}
                              <span className={cn('text-sm', isActive ? 'text-brand' : 'text-slate-300')} aria-hidden>
                                {isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSummaryRows.map((row) => (
                      <tr
                        key={row.studentId}
                        className={cn(
                          'border-b border-sky-50',
                          row.absentDays >= absentHighlightDays && 'bg-rose-50/60',
                        )}
                      >
                        <td className="px-2 py-3 font-bold text-slate-800">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {row.studentName}
                            {row.absentDays >= absentHighlightDays ? (
                              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-extrabold text-rose-800">
                                ≥ {absentHighlightDays} ngày nghỉ
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-2 py-3 font-semibold text-slate-600">{row.present}</td>
                        <td className="px-2 py-3 font-semibold text-slate-600">{row.excused}</td>
                        <td className="px-2 py-3 font-semibold text-slate-600">{row.unexcused}</td>
                        <td className="px-2 py-3 font-semibold text-slate-600">{row.late}</td>
                        <td className="px-2 py-3 font-extrabold text-rose-700">{row.absentDays}</td>
                        <td className="px-2 py-3 font-semibold text-slate-600">
                          {formatAttendanceRate(row.attendanceRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ClassroomCard>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
