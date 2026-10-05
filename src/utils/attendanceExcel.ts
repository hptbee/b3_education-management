import ExcelJS from 'exceljs'
import type { AttendancePeriodSummary } from '@/src/utils/attendance'
import { formatAttendanceRate } from '@/src/utils/attendance'

export function attendanceReportFilename(periodKey: string, className: string): string {
  const safeClass = className.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'Lop'
  return `DiemDanh_${safeClass}_${periodKey}.xlsx`
}

export async function downloadAttendanceMonthlyReport(
  summary: AttendancePeriodSummary,
  className: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('TongKet')

  sheet.columns = [
    { header: 'Học sinh', key: 'name', width: 28 },
    { header: 'Có mặt', key: 'present', width: 10 },
    { header: 'Vắng CP', key: 'excused', width: 10 },
    { header: 'Vắng KP', key: 'unexcused', width: 10 },
    { header: 'Muộn', key: 'late', width: 10 },
    { header: 'Nghỉ (ngày)', key: 'absentDays', width: 12 },
    { header: 'Tỉ lệ đi học', key: 'rate', width: 14 },
  ]

  sheet.getRow(1).font = { bold: true }

  for (const row of summary.rows) {
    sheet.addRow({
      name: row.studentName,
      present: row.present,
      excused: row.excused,
      unexcused: row.unexcused,
      late: row.late,
      absentDays: row.absentDays,
      rate: formatAttendanceRate(row.attendanceRate),
    })
  }

  sheet.addRow([])
  sheet.addRow({ name: 'Số ngày đã điểm danh', present: summary.schoolDays })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = attendanceReportFilename(summary.periodKey, className)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
