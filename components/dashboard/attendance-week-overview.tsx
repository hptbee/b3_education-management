'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, CalendarCheck, Clock, UserX } from 'lucide-react'
import { useAppData } from '@/src/store/AppDataContext'
import { ClassroomCard, EmptyState } from '@/src/components/classroom'
import { StudentAvatar } from '@/src/components/StudentAvatar'
import {
  buildWeeklyAttendanceSummary,
  classAttendanceTotals,
  currentWeekStartKey,
  formatAttendanceRate,
  formatWeekLabel,
} from '@/src/utils/attendance'

export function AttendanceWeekOverview() {
  const { data } = useAppData()
  const classroomId = data?.metadata.id
  const weekStartKey = currentWeekStartKey()

  const summary = useMemo(
    () => (data ? buildWeeklyAttendanceSummary(data, weekStartKey) : null),
    [data, weekStartKey],
  )
  const totals = useMemo(
    () => (summary ? classAttendanceTotals(summary.rows) : null),
    [summary],
  )
  const topAbsentees = useMemo(() => {
    if (!summary) return []
    return [...summary.rows]
      .filter((row) => row.absentDays > 0)
      .sort(
        (a, b) =>
          b.absentDays - a.absentDays || a.studentName.localeCompare(b.studentName, 'vi'),
      )
      .slice(0, 3)
  }, [summary])

  const hasData = Boolean(summary && summary.schoolDays > 0)

  return (
    <ClassroomCard className="flex flex-col">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-xl bg-pastel-sky">
          <CalendarCheck className="size-4 text-brand" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-extrabold text-slate-800">Điểm danh tuần này</h3>
          <p className="text-xs font-semibold text-slate-500">{formatWeekLabel(weekStartKey)}</p>
        </div>
      </header>

      {!hasData || !summary || !totals ? (
        <EmptyState
          compact
          icon={CalendarCheck}
          title="Chưa điểm danh tuần này"
          description="Lưu ít nhất một ngày để xem tỉ lệ đi học và số lượt nghỉ."
          action={
            <Link
              href="/attendance"
              className="rounded-2xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark"
            >
              Điểm danh ngay
            </Link>
          }
        />
      ) : (
        <div className="grid flex-1 gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-sky-50 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Ngày điểm danh</p>
              <p className="font-display text-2xl font-extrabold text-slate-800">{summary.schoolDays}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">Lượt nghỉ</p>
              <p className="font-display text-2xl font-extrabold text-rose-700">{totals.totalAbsent}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-3 py-2.5">
              <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                <Clock className="size-3" aria-hidden />
                Đi muộn
              </p>
              <p className="font-display text-2xl font-extrabold text-amber-800">{totals.totalLate}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Tỉ lệ đi học</p>
              <p className="font-display text-2xl font-extrabold text-emerald-800">
                {formatAttendanceRate(totals.classRate)}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Nghỉ nhiều nhất
            </p>
            {topAbsentees.length === 0 ? (
              <p className="rounded-2xl bg-slate-50/80 px-3 py-4 text-center text-xs font-semibold text-slate-400">
                Chưa có lượt nghỉ trong tuần.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {topAbsentees.map((row) => {
                  const student = data?.students.find((item) => item.id === row.studentId)
                  return (
                    <li
                      key={row.studentId}
                      className="flex items-center gap-3 rounded-2xl bg-slate-50/80 px-2.5 py-2"
                    >
                      {student ? (
                        <StudentAvatar
                          student={student}
                          classroomId={classroomId}
                          alt=""
                          className="size-9 shrink-0 rounded-full ring-2 ring-white"
                        />
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                          <UserX className="size-4" aria-hidden />
                        </span>
                      )}
                      <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-800">
                        {row.studentName}
                      </p>
                      <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-extrabold text-rose-700">
                        {row.absentDays} ngày
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <Link
        href="/attendance"
        className="mt-4 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border-t border-sky-100 pt-4 text-sm font-bold text-brand transition hover:text-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        Xem tổng kết điểm danh
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </ClassroomCard>
  )
}
