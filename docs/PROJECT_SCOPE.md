# PROJECT_SCOPE.md
# Local Classroom Management & Gamification Application

> **Document purpose**
>
> This document is the primary product and implementation specification for the application.
> It defines the product scope, functional requirements, business rules, data model,
> validation rules, UI requirements, persistence rules, and acceptance criteria.
>
> When implementation details are ambiguous, follow this priority:
>
> 1. Explicit business rules in this document
> 2. Functional requirements and acceptance criteria
> 3. Product principles
> 4. Keep the solution simple and pragmatic
>
> Do not introduce backend, authentication, APIs, cloud infrastructure, or unnecessary
> enterprise architecture unless explicitly requested in the future.
>
> **Exception (v0.1.7+):** Teacher **Google sign-in**, **signed entitlements**, and **optional
> cloud backup** are implemented via `workers/cloud-backup` (Cloudflare Worker + D1 + R2).
> Classroom JSON remains local-first. See [ACCOUNTS.md](./ACCOUNTS.md). This does not change
> the rule that `ClassroomDatabase` is the in-app source of truth for classroom data.
>
> **v0.1.8+:** Separate **Web** and **Desktop** Google OAuth clients; Tauri PKCE loopback;
> Worker secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID_DESKTOP`, `GOOGLE_CLIENT_SECRET`.
> Admin license changes (including **lifetime**) via Worker admin API or D1 + `license_version` bump.
>
> **Desktop distribution:** production builds target **Windows (x86_64)** and **macOS** (Apple Silicon + Intel). See [build-and-release.md](./build-and-release.md).
>
> **Cloud R2 (v0.1.12+):** structured incremental backup (`PUT /sync`), not a single `database.json` as the live upload path. See [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md).
>
> **Classroom images (v0.1.13+):** teacher/student/banner/gift photos stored as local WebP files under `assets/**`; JSON stores keys only; cloud sync uploads dirty asset files. See [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md#classroom-image-assets).

---

# 1. Product Overview

## 1.1 Product Goal

Build a local-first classroom management and gamification application for an elementary
school teacher to use during class.

The application should help the teacher:

- Manage student information
- Organize students into teams
- Add and deduct individual points
- Manage team competition
- Define and redeem rewards
- Randomly select students
- Run simple classroom games
- Recognize and praise students
- Display rankings and activities on a TV or projector

The product should feel like a fun digital classroom companion rather than a traditional
school administration system.

## 1.2 Primary User

Version 1 supports one primary user:

- Teacher

Students do not have individual accounts and do not log in.

Students primarily see the application when it is displayed by the teacher on:

- A classroom TV
- A projector
- A large monitor
- A laptop screen

## 1.3 Classroom Scope

The teacher can keep **multiple classrooms** on one device and switch them from the sidebar. Each classroom has one teacher profile and its own students, teams, rewards, and history.

Classroom JSON and photos stay on this device (IndexedDB in the browser; files under the Tauri app data folder on desktop). Students do not have accounts.

## 1.4 Local-First Requirement

Runtime reads and writes always use local persistence. Google sign-in is required to use the app. A Cloudflare Worker (`workers/cloud-backup`) handles identity, signed entitlements, licensing, and **optional** cloud backup (R2). It is not the classroom database.

Do not add extra REST/GraphQL classroom APIs, a cloud DB as source of truth, Redis, or queues unless explicitly requested.

See [ACCOUNTS.md](./ACCOUNTS.md) and [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md).

---

# 2. Product Principles

The implementation must follow these principles.

## 2.1 Simple Before Complex

This is a practical classroom application.

Prefer:

- Clear components
- Simple state
- Simple storage
- Direct business logic
- Reusable utilities

Avoid unnecessary:

- Repository layers
- Domain services
- CQRS
- Event sourcing
- Redux
- Microservices
- Backend simulation
- Enterprise architecture patterns

## 2.2 Fast Teacher Interaction

The teacher may use the application while actively teaching.

Therefore:

- Common actions must require few clicks
- Buttons must have large click targets
- Frequently used actions should be visually prominent
- Forms should be simple
- Important feedback should be immediate

## 2.3 Public vs Private Information

The application has two display contexts:

### Teacher Context

May display:

- Edit controls
- Delete controls
- Full student information
- Teacher notes
- Potential notes
- Penalty reasons
- Detailed history

### Presentation Context

Must not display:

- Teacher-only notes
- Student potential notes
- Areas for improvement
- Private administrative details
- Detailed penalty reasons
- Edit/delete controls

Presentation mode should prioritize:

- Student name
- Avatar
- Positive recognition
- Game result
- Ranking
- Team information
- Celebration

## 2.4 Classroom-Friendly

The UI should be suitable for elementary school students.

Prioritize:

- Large text
- Strong visual hierarchy
- Friendly colors
- Student avatars
- Playful animations
- Clear positive feedback

---

# 3. Technology Stack

Use:

- React
- Next.js 16 (App Router, static export for Tauri)
- TypeScript
- Tailwind CSS
- shadcn/ui-inspired local components
- Lucide React
- Framer Motion
- canvas-confetti
- Tauri 2 (desktop builds: Windows and macOS)

Use:

- Tauri JSON filesystem for structured application data (desktop)
- IndexedDB / localStorage fallback in web dev mode
- `localStorage` for lightweight UI-only state (e.g. study timer, language preference)

Do not use:

- Material UI
- Ant Design
- Bootstrap
- CSS Modules
- Redux
- Unnecessary state-management libraries

shadcn/ui is only a component foundation.

Do not leave default shadcn styling unchanged.

The final application must not look like:

- A generic admin dashboard
- A CRUD application
- A corporate enterprise application

---

# 4. User Roles and Display Modes

## 4.1 Teacher Mode

Teacher mode is the normal application mode.

Capabilities include:

- Create/edit/delete data
- Configure classroom
- Manage students
- Manage teams
- Add/deduct points
- Redeem rewards
- Configure actions
- Start games
- Create recognition
- View private notes and history

## 4.2 Presentation Mode

Presentation mode is optimized for TV/projector display.

Typical screens:

- Lucky Wheel
- Duck Race
- Points Wheel
- Tools page (presentation layout)
- Random Student (Chọn ngẫu nhiên)
- Quick Answer
- Who Is Next
- Recognition
- Student leaderboard
- Team leaderboard

Presentation mode should:

- Hide sidebar when appropriate
- Hide edit controls
- Use larger text
- Use larger avatars
- Increase spacing
- Avoid private information
- Support browser fullscreen where practical

---

# 5. Global Business Rules

These rules apply across the application.

## BR-001: Unique IDs

Every persisted entity must have a stable unique `id`.

## BR-002: Timestamps

Records representing history or user-created activity should include `createdAt`.

Mutable primary entities should also include `updatedAt` where useful.

Use ISO timestamp strings.

## BR-003: Immediate Persistence

After a successful create/update/delete action:

1. Update application state
2. Persist the new state locally
3. Update relevant UI

The user should not need to manually save global application state after every ordinary action.

## BR-004: No Hardcoded Classroom Identity

The following values must never be hardcoded throughout UI components:

- Class name
- Teacher name
- School year

They must come from classroom settings.

## BR-005: Every Point Change Requires History

Any operation that changes `student.points` must create a corresponding point history record.

This includes:

- Positive actions
- Negative actions
- Game rewards
- Reward redemption
- Manual adjustment

Directly changing a student's point balance without history is not allowed.

## BR-006: Student and Team Scores Are Separate

Individual student points and team scores are separate systems in Version 1.

Example:

- Student receives +5 points
- Team score does not automatically change

The teacher explicitly changes team scores.

## BR-007: One Student, Maximum One Team

A student may:

- Belong to one team
- Belong to no team

A student cannot belong to multiple teams simultaneously.

## BR-008: Deleting a Team Does Not Delete Students

When a team is deleted:

- The team is removed
- Students remain
- Affected students receive `teamId = undefined`

## BR-009: Private Notes Never Appear Publicly

Teacher-only notes must never appear in:

- Presentation mode
- Lucky Wheel
- Games
- Public leaderboard
- Recognition presentation
- Team presentation

## BR-010: Local-First Data (per device)

Classroom JSON on each browser/PC is local-first unless exported, imported, or **manually** restored from cloud backup.

The application must not imply automatic synchronization between devices. Optional cloud backup (premium/lifetime) is **upload after local save** plus **manual restore** — not real-time sync. See [ACCOUNTS.md](./ACCOUNTS.md) § Multi-device usage.

---

# 6. Data Model

The following model is the recommended baseline.

The implementation may add small supporting fields when necessary, but should not introduce unnecessary complexity.

## 6.1 Classroom Settings

```ts
interface ClassroomSettings {
  id: string;

  className: string;
  classAvatar?: string;

  teacherName: string;
  teacherAvatar?: string;

  schoolYear: string;

  createdAt: string;
  updatedAt: string;
}
```

## 6.2 Student

```ts
type Gender = "male" | "female";

interface Student {
  id: string;

  name: string;
  avatar?: string;

  dateOfBirth?: string;
  gender?: Gender;

  previousClass?: string;
  previousAchievements?: string;

  classroomRole?: string;
  /** Preferred: references to `ClassroomRole.id` */
  classroomRoleIds: string[];
  /** References to `Badge.id` */
  badgeIds: string[];

  potentialNote?: string;

  teamId?: string;

  points: number;

  totalRewards: number;

  createdAt: string;
  updatedAt: string;
}
```

## 6.3 Point Action

```ts
type PointActionType = "reward" | "penalty";

interface PointAction {
  id: string;
  name: string;
  points: number;
  type: PointActionType;
  icon?: string;
  isActive: boolean;
}
```

`reward` actions must have positive point values.

`penalty` actions must have negative point values.

## 6.4 Point History

```ts
type PointHistorySource =
  | "action"
  | "game"
  | "reward-redemption"
  | "manual";

interface PointHistory {
  id: string;

  studentId: string;

  actionId?: string;
  actionName: string;

  points: number;

  source: PointHistorySource;

  note?: string;

  createdAt: string;
}
```

## 6.5 Reward

```ts
interface Reward {
  id: string;

  name: string;
  image?: string;
  description?: string;

  requiredPoints: number;

  isActive: boolean;

  createdAt: string;
  updatedAt: string;
}
```

## 6.6 Reward History

```ts
interface RewardHistory {
  id: string;

  studentId: string;

  rewardId?: string;
  rewardName: string;

  pointsSpent: number;

  createdAt: string;
}
```

Store `rewardName` so historical records remain understandable even if a reward is later renamed or deleted.

## 6.7 Team

```ts
interface Team {
  id: string;

  name: string;
  avatar?: string;

  score: number;

  leaderStudentId?: string;
  viceLeaderStudentId?: string;

  createdAt: string;
  updatedAt: string;
}
```

Team membership is stored on `Student.teamId`.

## 6.7a Classroom Role

```ts
interface ClassroomRole {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt: string;
}
```

Default seeds include class president and vice-president roles.
Students reference roles via `classroomRoleIds`.

## 6.7b Badge

```ts
interface Badge {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  createdAt: string;
}
```

Badges are awarded to students via `Student.badgeIds`.
The badge catalog is configurable; default seeds are provided on first run.

## 6.8 Team Score History

Recommended:

```ts
interface TeamScoreHistory {
  id: string;

  teamId: string;

  points: number;
  actionName: string;

  createdAt: string;
}
```

This supports history and makes reset operations understandable.

## 6.9 Recognition

```ts
interface RecognitionTitle {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  createdAt: string;
}

interface Recognition {
  id: string;
  studentId: string;
  type: string;
  title: string;
  titleId?: string;
  titleIcon?: string;
  studentName?: string;
  teamId?: string;
  message?: string;
  awardedPoints?: number;
  pointHistoryId?: string;
  createdAt: string;
}
```

Recognition titles are configurable per classroom database. Recognition records snapshot title name/icon, student name, and team at creation time so historical records remain readable after edits.

Optional points use the existing `PointHistory` pipeline with `source: "recognition"`.

## 6.10 Lucky Wheel Selection History

```ts
interface LuckyWheelSelection {
  id: string;

  studentId: string;

  createdAt: string;
}
```

## 6.10a Duck Race History

```ts
interface DuckRaceResult {
  id: string;
  winnerStudentId: string;
  participantStudentIds: string[];
  createdAt: string;
}
```

## 6.10b Points Wheel Configuration

```ts
interface PointsWheelSegment {
  id: string;
  value: number; // integer, -100..100
  enabled: boolean;
  weight?: number; // reserved for future weighted spins
}
```

Persisted per classroom as `pointsWheelConfig` (default: five enabled segments: 1, 2, 3, 5, 10).

## 6.10c Prevent-Repeat Bags

Separate string-id arrays on the classroom database — do not share bags across tools:

| Field | Tool |
|---|---|
| `wheelStudentBag` | Lucky Wheel |
| `duckRaceStudentBag` | Đua vịt |
| `pointsWheelStudentBag` | Reserved for Vòng quay điểm (UI currently uses explicit single-student pick; bag kept for schema compatibility) |

Synced in cloud `catalog.json` with badges and point actions.

## 6.10d Attendance Record

One record per calendar day the teacher takes attendance (local date `YYYY-MM-DD`). Only non-present students are stored in `entries`; present students are inferred from `rosterStudentIds`.

```ts
type AttendanceAbsenceStatus = "excused" | "unexcused" | "late";

interface AttendanceEntry {
  studentId: string;
  status: AttendanceAbsenceStatus;
  note?: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  entries: AttendanceEntry[];
  rosterStudentIds: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}
```

Persisted per classroom as `attendanceRecords`. Cloud backup domain: `attendance.json`. Attendance does not auto-change student points.

## 6.11 Application Settings

Optional UI preferences may be grouped separately.

```ts
interface AppSettings {
  soundEnabled: boolean;
  animationsEnabled: boolean;
}
```

Do not mix classroom identity with temporary UI preferences.

---

# 7. Functional Requirements

# FR-001 — First-Time Classroom Setup

## Goal

Allow the teacher to configure the classroom before using the application.

## First Launch Rule

On application startup:

1. Load classroom settings
2. If valid classroom settings do not exist:
   - Show onboarding/setup screen
3. Otherwise:
   - Navigate to the Dashboard

## Required Fields

| Field | Required | Validation |
|---|---|---|
| Class name | Yes | 1-50 characters |
| Teacher name | Yes | 1-50 characters |
| School year | Yes | 1-30 characters |
| Class avatar | No | Image only |
| Teacher avatar | No | Image only |

## Setup Flow

```text
Open Application
      ↓
No Classroom Settings
      ↓
Welcome / Setup Screen
      ↓
Enter Classroom Information
      ↓
Validate
      ↓
Save Locally
      ↓
Navigate to Dashboard
```

## Acceptance Criteria

- First launch shows setup instead of an empty dashboard.
- Saving valid information creates classroom settings.
- Refreshing the page does not repeat onboarding.
- The configured class and teacher names appear throughout the application.

---

# FR-002 — Classroom Settings

## Goal

Allow the teacher to update classroom identity after initial setup.

## Editable Fields

- Class name (display label on sidebar class switcher and dashboard)
- Class avatar
- Teacher name
- Teacher avatar
- School year (database identity — change in **Dữ liệu** tab, not **Hồ sơ**)
- Home banner image (dashboard hero)

## Settings & classroom manage UI

**`/settings`** — account and license only (`account-section.tsx`). Max content width ~1100px.

**`/classrooms`** — classroom list, create, import JSON, cloud restore.

**`/classrooms/manage`** — per-class pill tabs:

| Tab | Label | Contents |
|---|---|---|
| Profile | Hồ sơ | Combined teacher + display class name; avatar auto-saves on file pick; home banner with preview; one **Lưu thay đổi** when text fields are dirty |
| Roles | Vai trò | Classroom role catalog (FR-010c) |
| Data | Dữ liệu | Switch class, create/import another, rename database + school year, duplicate, export JSON, open data folder (Tauri) |

**Dữ liệu** is implemented but not shown by default (`SETTINGS_TABS.showDataTab` in `settings-flags.ts` is `false`).

**Nguy hiểm** (delete classroom) is implemented but not shown by default (`SETTINGS_TABS.showDangerTab` in `settings-flags.ts` is `false`).

**Display name vs database rename:** Changing **Tên lớp (hiển thị)** on **Hồ sơ** updates UI labels only. **Đổi tên database** on **Dữ liệu** updates the stored class name and school year metadata; the stable `metadata.id` (and on-disk folder/file name) does not change.

Use shared primitives: `PageHeader`, `ClassroomCard`, `ClassroomButton`, `ClassroomSelect`, manage tabs. Max content width ~1100px.

## Behavior

When settings are saved:

- Persist changes immediately
- Update all visible screens
- Do not require application restart

## Dynamic Usage

Examples:

```text
Lớp 2/7 - Cô Thu
Năm học: 2026 - 2027
```

Activity messages should use the configured teacher name.

Example:

```text
{teacherName} đã cộng 5 điểm cho {studentName}
```

## Validation

- Required text fields cannot be empty
- Trim leading/trailing whitespace
- Reject invalid image files
- Preserve the old avatar if upload fails

---

# FR-003 — Student Management

## Goal

Allow teachers to maintain a complete local student list.

## Student List

The student page must provide:

- Student card/grid view
- Search (name, hometown, phone, parent)
- Sort (role → STT, name, points, team, newest)
- Quick filters (gender, team, role, badge, points) behind a **Lọc** toggle on the same toolbar row as search
- Add student
- Edit student
- Delete student
- Navigate to student profile

Do not use a dense spreadsheet-style table as the primary student UI.

Cards in the **same grid row** stretch to that row’s tallest card so points and **Xem** line up. Different rows may have different heights. Do not reserve empty badge slots on every card.

Toolbar dropdowns (sort and filters) use `ClassroomSelect` / `ClassroomMenuSelect` — never native `<select>` (Windows native popup overlaps the trigger).

## Add Student

Minimum required field:

- Student name

Optional fields:

- Avatar
- Date of birth
- Gender
- Previous class
- Previous achievements
- Classroom role
- Potential note
- Team

Default values:

```text
points = 0
totalRewards = 0
```

## Validation

Student name:

- Required
- 1-100 characters after trimming

Other fields are optional.

The application does not need to reject duplicate student names because different students may have the same name.

Student IDs must remain unique.

## Edit Student

Teachers may update all editable profile information.

Editing student information must not reset:

- Points
- Point history
- Reward history
- Recognition history

## Delete Student

Before deletion:

- Show a confirmation dialog
- Clearly show the student name

Version 1 deletion behavior:

1. Delete the student
2. Remove the student's point history
3. Remove the student's reward history
4. Remove the student's recognition records
5. Remove lucky-wheel history referencing that student
6. Remove team membership automatically because the student no longer exists

The implementation does not need soft-delete support in Version 1.

## Empty State

If there are no students:

- Show a friendly empty state
- Explain that the teacher can add or import students
- Provide a clear primary action

---

# FR-003a — Attendance & Weekly/Monthly Summary

## Goal

Let the teacher take daily attendance and review how many days each student was absent by week or month.

## Route

- `/attendance` — two tabs: **Điểm danh** and **Tổng kết** (week or month)
- Sidebar: section **Lớp học** → **Điểm danh**
- Home dashboard: **Điểm danh tuần này** widget (school days, absences, late, class rate, top absentees)

## Daily attendance

- One attendance record per local calendar day (`YYYY-MM-DD`) per classroom
- Statuses: **Có mặt**, **Vắng có phép**, **Vắng không phép**, **Đi muộn**
- Default all students to **Có mặt**; store only non-present rows in `entries`
- Snapshot `rosterStudentIds` at save time so students added later are not counted on past days
- Optional day note and per-student absence note
- Re-saving the same date updates the existing record (no duplicates)
- Does not change student points automatically

## Weekly and monthly summary

- Week is Monday–Sunday (`getMondayWeekStart`)
- Week/month pickers include periods with data plus the current period
- **School days** = count of attendance records in that period
- Per student: present, excused, unexcused, late, **absent days** (excused + unexcused), attendance rate
- Highlight students with **≥ 2 absent days** in the week table and **≥ 3 absent days** in the month table
- Export the selected period summary to Excel (`.xlsx`)

## Delete student

Remove the student from all `attendanceRecords` `entries` and `rosterStudentIds`; keep day records.

---

# FR-004 — Student Profile

## Goal

Provide a detailed teacher view of each student.

## Required Sections

### A. Profile Header

Display:

- Large avatar
- Student name
- Current points
- Team
- Classroom role

### B. Basic Information

Display:

- Date of birth
- Gender
- Previous class

### C. Achievements

Display:

- Previous achievements
- Recognition history
- Rewards received

### D. Classroom Information

Display:

- Current team
- Classroom role
- Current point balance

### E. Teacher Notes

Display:

- Potential note
- Strengths
- Areas for improvement
- Other free-text observations

Version 1 may store these inside one `potentialNote` field if separate structured fields are unnecessary.

This section is private.

### F. Activity History

Show relevant history in reverse chronological order:

- Point changes
- Rewards redeemed
- Recognition

## Privacy Rule

Teacher notes must never appear in presentation mode.

---

# FR-005 — Point Action Management

## Goal

Allow the teacher to configure reusable positive and negative point actions.

## Default Positive Actions

Seed the application with:

- Trả lời đúng: +1
- Tích cực phát biểu: +1
- Giúp đỡ bạn: +2
- Hoàn thành xuất sắc: +5

## Default Negative Actions

Seed the application with:

- Chửi thề: -5
- Đánh nhau: -10
- Học không tập trung: -3

The teacher may:

- Add an action
- Edit an action
- Disable an action
- Delete an action

## Delete Rule

Deleting a point action must not delete existing point history.

Historical records must retain:

- Action name
- Point value

This is why `PointHistory` stores `actionName`.

## Validation

Positive actions:

```text
points > 0
type = reward
```

Negative actions:

```text
points < 0
type = penalty
```

Action name is required.

---

# FR-006 — Add and Deduct Student Points

## Goal

Allow the teacher to quickly change student points.

## Standard Flow

```text
Select Student
      ↓
Select Point Action
      ↓
Optional Note
      ↓
Confirm
      ↓
Update Student Balance
      ↓
Create Point History
      ↓
Persist
      ↓
Show Visual Feedback
```

## Quick Actions

The UI may provide shortcuts such as:

- +1
- +5
- -1

However, even quick actions must create `PointHistory`.

## Point Calculation

```ts
student.points = student.points + pointChange;
```

Negative balances are allowed in Version 1.

Do not silently clamp points to zero.

## Success Feedback

Positive change:

```text
⭐ +5
```

Negative change:

```text
-3
```

Use animation, but do not make penalty feedback humiliating or aggressive.

## Acceptance Criteria

After a point action:

- Student balance changes correctly
- A history record exists
- The dashboard updates where relevant
- Student ranking recalculates
- Data persists after refresh

---

# FR-007 — Point History

## Goal

Maintain an audit trail of all individual point changes.

## Rules

Every point change must create exactly one history record.

History records are immutable in Version 1.

The teacher does not edit historical point values.

If an incorrect action was made, the teacher should create a compensating point action instead of editing the old record.

Example:

```text
Accidental +5
        ↓
Create manual correction -5
```

## Display

Show:

- Action name
- Point change
- Date/time
- Optional note
- Source if useful

Sort newest first.

---

# FR-008 — Rewards and Gifts

## Goal

Allow teachers to define rewards students can redeem using points.

## Reward Management

Teacher can:

- Create reward
- Edit reward
- Delete reward
- Upload/change reward image
- Set required points
- Enable/disable reward

## Required Fields

- Reward name
- Required points

Optional:

- Image
- Description

## Validation

- Name required
- Required points must be greater than zero
- Points must be an integer

## Redemption Flow

```text
Select Student
      ↓
Select Reward
      ↓
Check Current Points
      ↓
If enough points
      ↓
Confirm Redemption
      ↓
Deduct Points
      ↓
Create Reward History
      ↓
Create Point History
      ↓
Increase totalRewards
      ↓
Persist
```

## Insufficient Points

If:

```text
student.points < reward.requiredPoints
```

Then:

- Disable redemption OR
- Show a clear "Không đủ điểm" message

Do not allow negative point balance through reward redemption.

## Reward Deletion

Deleting a reward:

- Removes it from future redemption
- Does not remove reward history

Historical records remain readable because they store `rewardName`.

---

# FR-009 — Team Management

## Goal

Allow teachers to organize students into teams for classroom competition.

## Team Management

Teacher can:

- Create team
- Rename team
- Change avatar/mascot
- Delete team
- Assign students
- Remove students from team

## Team Rules

- A student can belong to maximum one team
- A student may have no team
- Deleting a team does not delete students
- A deleted team's students become unassigned

## Team Score

Team score starts at:

```text
0
```

Quick actions:

- +1
- +5
- -1
- Custom amount
- Reset score

## Reset Score

Before reset:

- Show confirmation
- Explain that only team score is reset

Recommended reset behavior:

- Set score to 0
- Create a `TeamScoreHistory` record such as `Reset score`

## Leaderboard

Sort teams by:

1. Score descending
2. Team name ascending when scores are equal

Display:

- Rank
- Team avatar
- Team name
- Score
- Member count

`/ranking` presentation mode follows the current student vs teams toggle: student podium/list, or `TeamRankingList` (empty-team copy if none). Do not open student-detail modals in presentation.

---

# FR-010 — Lucky Wheel

## Goal

Randomly select students in an exciting classroom-friendly way.

## Version 1 Mode

Required mode:

```ts
type LuckyWheelMode = "student";
```

The architecture may leave room for future:

- Team
- Reward
- Activity

Do not implement future modes unless requested.

## Requirements

- Large colorful wheel with student names (last two name words on segments)
- Student checklist with search, select all/none
- Clear pointer at 3 o'clock
- Spin animation with randomized duration (6.5–12 s), turn count, and easing curve
- Student list hides before spin; wheel expands; list reappears after result
- Clear selected student with celebration/confetti
- Fair selection cycle (bag-based, no repeat until cycle completes)
- Reset selection history

## Selection modes (in-memory picker session)

The Lucky Wheel dialog supports three temporary selection modes. Session state lives in dialog React state only — it is **not** stored on `Student` and is **not** persisted to the classroom JSON database.

| Mode | Behavior |
|---|---|
| Single | One spin selects one student (default) |
| Multiple | Teacher sets quantity (min 2); students are drawn without duplicates and revealed one-by-one via repeated spins |
| Sequential | Each click calls the next student; progress bar shows called vs total |

Shared options:

- **Scope:** entire classroom or a single team
- **Prevent repeat:** exclude already-called students from future picks (default on)
- **New round:** reset session and restore eligibility

Eligible students = scoped checklist participants minus session picks when prevent-repeat is enabled.

## Fair Selection Cycle

Avoid repeatedly selecting the same student before others have a chance.

Algorithm:

1. Determine eligible students
2. Exclude students selected during the current cycle
3. Randomly select from remaining students
4. Store selection history
5. When every eligible student has been selected:
   - Start a new cycle

## Edge Cases

### No Students

Disable spinning and show a friendly empty state.

### One Student

Allow selection without unnecessary wheel complexity.

### Student Deleted

Remove their lucky-wheel history.

## Presentation

After selection show:

- Large avatar
- Large name
- Team if appropriate
- Celebration/confetti

Do not show private student information.

---

# FR-010a — Classroom Tools Page

## Goal

Provide a single page (`/tools`, sidebar **Công cụ** / title **Thử thách & Công cụ**) with classroom utilities the teacher can use during lessons. The page supports **presentation mode** (sidebar hidden, enlarged layout via `PresentationChrome`).

## Layout

```text
PageHeader (+ Trình chiếu)
├── Trò chơi (3-column grid) — modal games
│   ├── Lucky Wheel
│   ├── Đua vịt
│   └── Vòng quay điểm
├── Công cụ nhanh (2-column grid) — inline tools
│   ├── Study Timer
│   └── Chọn ngẫu nhiên
└── Points Challenge strip
```

Shared tool cards use `ToolCardShell` (`tool-card-shell.tsx`).

## Trò chơi (modal dialogs)

Open from card CTA; deep links via query `?tool=` (`lucky-wheel`, `duck-race`, `points-wheel`). Closing a deep-linked dialog clears the query param.

| Tool | Modal | Notes |
|---|---|---|
| Lucky Wheel | `lucky-wheel-dialog.tsx` | See FR-010 |
| Đua vịt | `duck-race-dialog.tsx` | See FR-010a-1 |
| Vòng quay điểm | `points-wheel-dialog.tsx` | See FR-010a-2; `/points-wheel` redirects here |

## Công cụ nhanh (inline)

### Study Timer

- Preset durations: 1, 2, 5, 10 minutes
- Custom duration input: 1–180 minutes
- Start, pause, reset
- Visual finish state when timer reaches zero
- Persist timer state in `localStorage` so refresh does not reset duration, running state, or remaining time

### Chọn ngẫu nhiên

- In-card fair random student picker (bag-based; no repeat until cycle completes)
- Spin animation cycles avatars before revealing the winner
- Requires at least one student
- Replaces the earlier “Lucky Star” star-grid concept

### Sơ đồ lớp

- Dedicated route `/seating-chart` (sidebar **Sơ đồ lớp**, tools card under **Công cụ nhanh**)
- Visual classroom layout: board, desk groups with aisles, empty seats shown explicitly
- Configure groups (dãy), rows, columns per group, aisle gap, desk type (individual / pair / group), board position
- Assign students via click (select student → click seat) or HTML5 drag-and-drop
- Auto-arrange in roster order; random arrange with confirm dialog
- Zoom, pan, fit-to-screen for large classes; presentation mode hides config/roster
- Persisted per classroom as `seatingChartConfig` (catalog cloud sync); no activity history events

### Points Challenge Strip

- Shows top students by points
- Shortcut link to `/points`

## Presentation

Tools render inside the normal application shell (sidebar visible) unless presentation mode is active.
Lucky Wheel, Đua vịt, and Vòng quay điểm open in large modal overlays from this page.

---

# FR-010a-1 — Duck Race (Đua vịt)

## Goal

Animated classroom race where selected students’ ducks compete; one winner is revealed with celebration.

## Flow

```text
Setup (scope, checklist, duration)
  ↓
Ready
  ↓
Race animation
  ↓
Result (winner + history)
```

## Requirements

- Multi-student checklist with search, select all/none
- **Scope:** entire classroom or a single team
- **Prevent repeat:** optional; uses `duckRaceStudentBag` (separate from Lucky Wheel)
- Configurable race duration; simulated progress per racer
- Record result in `duckRaceHistory`
- Deep link: `/tools?tool=duck-race`

---

# FR-010a-2 — Points Wheel (Vòng quay điểm)

## Goal

Spin a value wheel to award (or deduct) points for **one student per round**. Points are **never auto-applied** — the teacher confirms after the spin.

## Flow

```text
Setup (configure segments + pick one student)
  ↓
Ready
  ↓
Spin (predetermined winning segment)
  ↓
Result → teacher taps Apply
  ↓
Optional: spin again (same student) or pick another student
```

## Requirements

- **One student per round:** radio list over the whole class (no scope / team filter)
- Configurable segments: integer values −100…100, max 12 segments, enable/disable per segment
- Persist segment config as `pointsWheelConfig` on the classroom database
- Shared `ValueWheel` UI; spin uses randomized duration/easing like Lucky Wheel
- Apply points via `applyPoints` with `source: "game"` and action name **Vòng quay điểm**
- Deep link: `/tools?tool=points-wheel`; legacy route `/points-wheel` redirects

## Non-goals

- Do not reuse Lucky Wheel’s `wheelStudentBag` or student-name segments
- Do not auto-apply points on spin land

---

# FR-010a-3 — Classroom Seating Chart (Sơ đồ lớp)

## Goal

Visual seating planner for the active classroom: configure desk layout, assign students to seats, and present the arrangement on a projector.

## Route & entry

- Page: `/seating-chart`
- Sidebar: **Sơ đồ lớp** (Hoạt động)
- Tools card under **Công cụ nhanh** on `/tools`

## Layout

- Groups (dãy) with visible aisle gaps between desk blocks
- Rows and columns per group; empty seats always rendered
- Desk types: individual (1), pair (2), group (4 students per desk)
- Board strip with position: front (default), back, left, right

## Assignment

- Click: select unassigned student → click seat (or seat with free capacity)
- Drag-and-drop: student ↔ seat ↔ unassigned list
- Seat popover: change or remove assigned student(s)
- Auto-arrange fills seats in roster order; random arrange requires confirm

## Persistence

- `seatingChartConfig` on classroom database (catalog cloud domain)
- Layout changes preserve valid assignments; overflow students become unassigned
- Student delete removes seat assignments; no activity history for seat moves

## Presentation

- `/seating-chart` in presentation allowlist; hides config panel and roster

---

# FR-010b — Badges

## Goal

Allow the teacher to award achievement badges to students. Badges are persistent marks on `Student.badgeIds` and appear on student cards and profile views.

## Catalog

Badge definitions are managed through **Tuyên dương → Danh mục**: each recognition title automatically creates and syncs a linked badge (`RecognitionTitle.badgeId`). There is no separate badge catalog page.

Orphan badges (no linked title) may still appear on the roster for manual toggle.

## Awarding Badges

On **Tuyên dương → Huy hiệu** (`/recognition?tab=badges`; legacy `/badges` redirects):

- Select a student
- Toggle badges on/off for that student
- View currently awarded badges

Badges are also awarded automatically when recognizing a student with a title that has a linked badge.

## Data Rules

- `Student.badgeIds` stores awarded badge references
- Deleting a recognition title does not remove badges already on students
- Badge roster toggles do not change point balance (unless awarded via recognition with points)

---

# FR-010c — Classroom Roles

## Goal

Allow the teacher to define classroom leadership/role titles and assign them to students.

## Role Catalog

Configurable in Settings (`/settings`):

- Default seeds: class president, academic vice president, labor vice president
- Add, edit, delete roles with name, icon, and optional description

## Assignment

- Students reference roles via `classroomRoleIds` (multi-select)
- Role badges display on student cards and team views
- Legacy `classroomRole` string field is deprecated

## Team Leadership

Teams may additionally assign:

- `leaderStudentId`
- `viceLeaderStudentId`

Leadership badges display on team cards and team detail views.
Leadership is cleared automatically when a student leaves the team.

---

# FR-011 — Random Student Game

## Goal

Randomly select one student with a simple animation.

## Flow

```text
Start
  ↓
Selection Animation
  ↓
Student Selected
  ↓
Show Avatar + Name + Team
```

The selected student should follow the same fair-selection logic as Lucky Wheel where practical.

---

# FR-012 — Quick Answer Game

## Goal

Select a student and let the teacher quickly record the answer result.

## Game Setup

Teacher configures:

- Points for correct answer

Default:

```text
+1
```

## Flow

```text
Start Round
      ↓
Randomly Select Student
      ↓
Teacher chooses:
[ Correct ]
[ Incorrect ]
[ Skip ]
```

## Correct

When selected:

- Add configured points
- Create PointHistory with source `game`
- Show positive feedback

## Incorrect

- Do not change points by default

## Skip

- Do not change points
- Continue/end according to UI flow

The application should not automatically penalize incorrect answers.

---

# FR-013 — Who Is Next Game

## Goal

Create a more visually exciting random selection experience.

## Flow

```text
Start
  ↓
Rapidly Cycle Student Avatars/Names
  ↓
Slow Down
  ↓
Final Student
```

The final selection should use the reusable random selection utility.

---

# FR-014 — Student Recognition

## Goal

Allow the teacher to praise one or more students for positive achievements or behavior, optionally award points, and present a celebration screen suitable for classroom projection.

## Page Structure (`/recognition`)

Four in-page tabs:

- **Tuyên dương mới** — recognition form and celebration overlay
- **Huy hiệu** — student badge roster (toggle on/off; no separate catalog)
- **Danh mục** — recognition title catalog CRUD; each title auto-creates/syncs a linked badge
- **Góc tuyên dương** — Wall of Fame with filters

Legacy route `/badges` redirects to `/recognition?tab=badges`.

## Recognition Titles

Configurable catalog (`RecognitionTitle`) seeded with defaults (e.g. Ngôi sao chăm chỉ, Học tập tiến bộ, Bạn tốt). Teachers can create, edit, enable/disable titles. Each title must have a linked `badgeId` (created automatically on save). Titles used in history are archived (disabled) instead of deleted.

## Recognition Flow

```text
Select Student(s) — single or multiple
      ↓
Select Recognition Title
      ↓
Enter Optional Message
      ↓
Optional Points Award
      ↓
Preview
      ↓
[ Tuyên dương ] → Celebration overlay
```

## Points Integration

When points are awarded, use the existing point transaction system (`PointHistory`, `source: "recognition"`). Deleting a recognition with awarded points reverses the transaction once.

## Presentation Screen

Full-screen overlay after recognition:

- Large student name and avatar
- Title with icon
- Message
- Optional points badge
- Gentle confetti (respects `animationsEnabled` and reduced-motion)
- Multi-student: reveal one-by-one, then group finale

## Wall of Fame

Card grid (not audit log) with filters: today / week / month / all, student, title, team. Teachers can view details, edit message, or delete records.

Do not show teacher notes or negative history on the celebration screen.

---

# FR-015 — Dashboard

## Goal

Provide a visually attractive classroom overview.

## Required Content

Display:

- Classroom avatar
- Class name
- Teacher name
- School year
- Total students
- Top students by points
- Team ranking
- Recent recognitions
- Recent activity
- Quick actions

## Sorting Rules

### Top Students

Sort:

1. Points descending
2. Student name ascending for equal points

### Team Ranking

Sort:

1. Score descending
2. Team name ascending for equal scores

### Recent Activity

Sort newest first.

## Quick Actions

Include clear shortcuts to:

- Add/deduct points
- Tools (`/tools`)
- Recognition
- Rewards
- Teams

## Update Behavior

Dashboard data must update after relevant actions without requiring page refresh.

---

# FR-016 — Presentation Mode

## Goal

Provide reusable fullscreen-friendly views.

## Rules

Presentation mode must:

- Hide editing controls
- Hide navigation where appropriate
- Hide private information
- Use large text
- Use large avatars
- Work well at 1366x768 and larger
- Support browser fullscreen where practical

## Supported Screens

Prioritize:

- Lucky Wheel
- Duck Race
- Points Wheel
- Tools page (presentation layout)
- Chọn ngẫu nhiên
- Quick Answer result
- Who Is Next result
- Recognition
- Student leaderboard (`/ranking` student mode)
- Team leaderboard (`/ranking` teams mode — `TeamRankingList`, not the student podium)

---

# FR-017 — Navigation

Keep navigation simple.

Implemented sidebar (`components/sidebar.tsx`) — flat sections, no nested routes in the menu:

```text
Trang chủ (`/`)

Lớp học
├── Học sinh (`/students`)
├── Điểm danh (`/attendance`)
└── Tổ / Nhóm (`/teams`)

Điểm & quà
├── Tích điểm (`/points`)
├── Bảng xếp hạng (`/ranking`)
└── Quà tặng (`/rewards`)

Hoạt động
├── Công cụ (`/tools`) — Lucky Wheel, Đua vịt, Vòng quay điểm, Study Timer, Chọn ngẫu nhiên, Points Challenge
├── Tuyên dương (`/recognition`)
└── Lịch sử (`/history`)

Footer (always visible when expanded)
├── Local / cloud save status (`SidebarPersistenceStatus`)
├── Quản lý lớp (`/classrooms`)
└── Cài đặt (`/settings`) — account & license only
```

**Classroom switcher** (`SidebarClassContext` at top of sidebar): teacher avatar, name, class label, and full school year (`Năm học …` on its own line). Opens a menu to switch active class, add class, or open **Quản lý lớp**.

**Collapsible sidebar (desktop):** edge-mounted toggle on the sidebar border; collapsed state shows icon-only rail (`NavSidebarContext` + `AppShell`). Mobile uses the drawer overlay; collapse toggle is desktop-only.

Avoid deep nested navigation.

---

# FR-018 — Search and Filtering

## Student Search

Search by student name, hometown, phone, and parent name.

Behavior:

- Case-insensitive
- Trim whitespace
- Update results as the teacher types

## Student Filters and Sort

Implemented on `/students`:

| Control | Behavior |
|---|---|
| Search | Same toolbar row as **Lọc**, sort, and **Xóa lọc** |
| **Lọc** | Toggles the quick-filter panel; badge shows how many filters are active |
| Sort | Vai trò → STT (default), name, points, team, newest |
| Quick filters | Gender, team, role, badge, points — panel starts closed |
| **Xóa lọc** | Visible only when search, sort, or a filter is not at default |

All of these dropdowns use `ClassroomSelect` (custom menu), not native `<select>`.

History, ranking, points sort, Wall of Fame, seating board direction, tool team pickers, student gender, and team leader/deputy use the same control.

---

# FR-019 — Backup, Restore, and Reset

Because the application is local-first, data protection is important.

## Cloud backup (optional, v0.1.7+)

When signed in with a valid entitlement, **premium** or **lifetime** plan (`permissions.cloudBackup`), and per-class opt-in (`appSettings.cloudBackupEnabled`):

- After each local save, the app may upload classroom data to R2 via the Cloudflare Worker (`PUT /sync` structured domain files; `PUT /backup` kept for compatibility).
- R2 layout: `users/{userId}/classrooms.json` plus `classrooms/{classroomKey}/*.json` (see [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md)). Legacy `database.json` is kept after migration, not deleted.
- Teacher can list and restore cloud backups from **Quản lý lớp** (`/classrooms`) (and **Dữ liệu** on `/classrooms/manage` when that tab is enabled). Restore returns monolith JSON for `importDatabaseFromJson`. Not automatic on login.
- Cloud backup does not replace local JSON; local save always happens first.
- **Not multi-device sync:** each PC has its own local files; cloud is last-upload-wins per classroom id (per uploaded file). See [ACCOUNTS.md](./ACCOUNTS.md) § Multi-device usage.

## Export Backup

Allow teacher to export all structured data into a JSON backup.

Suggested filename:

```text
classroom-backup-YYYY-MM-DD.json
```

Include:

- Classroom settings
- Classroom roles
- Badges
- Students
- Teams
- Team score history
- Point actions
- Point history
- Rewards
- Reward history
- Recognition
- Lucky-wheel history
- App settings

Image backup support may be added later if image persistence makes export significantly more complex.

Do not block Version 1 on perfect binary-image backup.

## Import Backup

Teacher can select a backup JSON file.

Before replacing current data:

1. Parse file
2. Validate expected structure
3. Show confirmation
4. Import only when valid

Invalid JSON must not corrupt existing application data.

## Reset Demo Data

Optional development utility.

## Reset All Data

Must:

- Show strong confirmation
- Explain that all local classroom data will be removed

After reset:

- Remove application data
- Return to first-time classroom setup

---

# 8. Validation Rules

## 8.1 General Text Input

For required text:

- Trim whitespace
- Reject empty result

## 8.2 Number Input

Point values and scores must be numeric.

Where an integer is expected:

- Reject decimal values

## 8.3 Dates

Date of birth is optional.

If provided:

- Must be a valid date

Do not add unnecessary age restrictions.

## 8.4 Image Upload

Accept standard image formats supported by the browser.

Recommended:

- PNG
- JPEG
- WebP

Show a user-friendly validation error for unsupported files.

---

# 9. Edge Cases

## EC-001 — No Students

Features depending on students must show a useful empty state.

Affected features:

- Student list
- Lucky Wheel
- Duck Race
- Points Wheel
- Tools / games
- Student leaderboard
- Recognition selection
- Reward redemption

## EC-002 — Deleted Student With History

Version 1 performs hard cleanup of related student history.

Do not leave orphaned records.

## EC-003 — Deleted Reward

Historical redemption records remain.

## EC-004 — Deleted Point Action

Historical point records remain.

## EC-005 — Deleted Team

Students remain and become unassigned.

## EC-006 — No Teams

Team leaderboard shows an empty state.

## EC-007 — Insufficient Reward Points

Redemption is blocked.

## EC-008 — Lucky Wheel Cycle Completed

Reset the selection cycle automatically and continue selecting fairly.

## EC-009 — Browser Storage Unavailable

Show a friendly warning if local persistence fails.

The application should not silently pretend that data was saved.

---

# 10. Data Persistence

## 10.0 Current implementation (desktop)

Classroom JSON is the source of truth. On Tauri:

- Each classroom is `classrooms/{id}.json`
- `index.json` lists classrooms and `activeClassroomId`
- A **valid** index is still reconciled against `classrooms/*.json`: orphan files are added, the index is persisted if the set changed, and `activeClassroomId` is kept. Recovery is not limited to a missing/corrupt index.
- IndexedDB → JSON migration writes `indexeddb-migration.complete` only after every IDB classroom is verified (including the empty case). If the marker is missing, copy IDB classrooms whose ids are **not** already loadable from JSON. Never overwrite existing JSON.
- Gift save/delete flush via `commitData` then `persistNow` so an in-flight write cannot replace a later edit with a stale snapshot.

Web dev still uses IndexedDB for classroom JSON.

Entitlements: Tauri OS keychain; web dev `localStorage`. Google OAuth: web GIS `idToken`; desktop PKCE loopback with Desktop app client (see [ACCOUNTS.md](./ACCOUNTS.md)).

## 10.1 Storage Strategy

**Current implementation:** Tauri JSON files + IndexedDB (web dev) — not `localStorage` for classroom data.

The sections below describe an earlier localStorage-oriented design. Prefer §10.0 and `ClassroomDatabase` for implementation truth.

Use localStorage for structured data.

Create a small centralized storage layer.

Avoid duplicating raw:

```ts
localStorage.getItem(...)
localStorage.setItem(...)
```

throughout components.

## 10.2 Suggested Keys

Use a consistent prefix.

```text
classroom.settings
classroom.classroom-roles
classroom.badges
classroom.students
classroom.teams
classroom.team-score-history
classroom.point-actions
classroom.point-history
classroom.rewards
classroom.reward-history
classroom.recognitions
classroom.lucky-wheel-history
classroom.app-settings
education-management:study-timer
```

The study timer key stores UI-only timer state (duration, remaining time, running/finished) and is not part of the classroom database export.

## 10.3 Persistence Requirement

Data must remain after:

- Page refresh
- Browser tab close
- Browser reopen

As long as the browser's local storage has not been cleared.

## 10.4 Images

Support uploads for:

- Classroom avatar
- Teacher avatar
- Student avatar
- Team avatar
- Reward image

Start simple.

If image data becomes too large for localStorage:

- Store images in IndexedDB
- Store image references/IDs in structured records

Do not introduce a backend.

---

# 11. Application State Guidelines

Use simple React state.

Possible approach:

- Local state for page-specific UI
- Context or a small shared application store built with React primitives for globally needed classroom data

Do not introduce Redux.

Avoid creating one giant context containing every implementation detail if feature-specific state is easier to manage locally.

---

# 12. UI / UX Requirements

# 12.1 Overall Design Direction

The visual direction is:

- Cute
- Chibi
- Friendly
- Playful
- Colorful
- Rounded
- Soft
- Cheerful
- Modern
- Interactive
- Gamified

The application should feel like:

> A premium, cute, gamified digital classroom.

It must not feel like:

> An admin dashboard with colorful buttons.

# 12.2 Layout

Primary layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar │ Main Content                                       │
│         │ ┌──────────── Classroom Hero ────────────────────┐ │
│         │ └────────────────────────────────────────────────┘ │
│         │ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│         │ │ Students │ │ Ranking  │ │ Team Competition     │ │
│         │ └──────────┘ └──────────┘ └──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

# 12.3 Sidebar

Implementation: `components/sidebar.tsx`, `components/sidebar-class-context.tsx`, `components/sidebar-persistence-status.tsx`; collapse state in `src/store/NavSidebarContext.tsx` (provided by `AppShell`).

Use:

- Pastel sky / soft white identity (see §12.8 — brand sky `#4ba3e8`, not corporate purple admin)
- Large navigation items with Lucide icons
- Friendly icons
- Large click targets (`min-h-10` links, 44px icon buttons)
- Rounded active item with left accent bar and white background
- Clear selected state

**Profile / class switcher (top):**

- 72×72px teacher avatar (`TeacherAvatar`, explicit `size-[72px]`)
- Teacher name (truncate with `title` when long)
- Class label on its own line (e.g. `Lớp 2/7`)
- Full school year on its own line (e.g. `Năm học 2026-2027` — do not truncate)
- Chevron opens classroom switcher menu (active classes, **Thêm lớp mới**, **Quản lý lớp**)

**Collapse control (desktop `md+`):**

- Circular toggle mounted on the sidebar's right edge, vertically centered on the profile card
- Expanded: full labels; collapsed: icon-only rail (~64px width)
- Does not compete with profile text width (not placed beside the switcher card)

**Footer block:**

- Plan badge and local/cloud save lines (link to **Cài đặt → Tài khoản**)
- **Quản lý lớp** and **Cài đặt** nav links

Presentation mode hides the sidebar entirely (see tools / recognition fullscreen flows).

# 12.4 Cards

Cards should have:

- Large rounded corners
- Soft shadows
- Spacious padding
- Subtle hover effects where appropriate

Cards should feel like game cards or stickers.

# 12.5 Buttons

Buttons should:

- Be large enough for fast classroom interaction
- Have clear labels
- Use icons when helpful
- Include hover/press feedback

Common actions such as:

- +1
- +5
- -1
- Start
- Pick Student
- Spin

must be visually prominent.

# 12.6 Student Cards

Student cards should emphasize:

- Avatar
- Name
- Current points
- Team

Do not make the student list primarily look like a database table.

# 12.7 Avatars

When no custom avatar exists:

- Display a friendly placeholder
- Use initials or a consistent visual placeholder

Do not implement AI avatar generation.

The implementation should make future custom chibi avatars easy to add.

# 12.8 Color System

Primary brand color: pastel sky blue (`--color-brand` / `--color-brand-purple`, `#4ba3e8`). Map `--primary` CSS variable to readable sky blue.

Supporting accent: dusty pink (`--color-accent-pink`, `#efa3bc`) for rewards, celebration, and playful moments.

Page background: `--color-page` (`#f7fafd`) — warm blue-cream with a faint pink wash.

Semantic tokens:

- `brand` / `brand-dark` / `brand-light` / `brand-soft` — primary blue family
- `surface` / `surface-soft` — card and shell backgrounds
- `success`, `warning`, `danger`, `info` — soft semantic feedback
- `pastel-sky`, `pastel-pink`, `pastel-peach`, `pastel-lavender`, `pastel-yellow`, `pastel-mint`

Pastel accent tokens (use sparingly, not rainbow per card):

- `pastel-sky`, `pastel-pink`, `pastel-peach`, `pastel-lavender`, `pastel-yellow`

Team accent colors (`tot-1`…`tot-4`) cycle pink, sky, lavender, peach — soft pastel, not neon.

Preferred direction:

- Sky blue (primary)
- Dusty pink (accent)
- Warm yellow
- Peach
- Lavender
- Light mint (supporting only)

Semantic colors:

- Positive points: mint-green
- Rewards: yellow/gold with pink accent
- Recognition: pink/gold
- Team competition: curated pastel cycle
- Penalties: dusty rose (not aggressive red)
- Team competition: distinct friendly accents
- Penalties: soft red/orange

Avoid:

- Harsh black shadows
- Large dark-gray areas
- Corporate-only blue UI
- Too many competing colors
- Rainbow gradients on every quick-action button

# 12.8a Shared UI Primitives

Reuse components from `src/components/classroom/`:

- `ClassroomButton` — large click targets, `rounded-2xl`, primary/outline/ghost variants
- `ClassroomCard` — `rounded-3xl`, `border-slate-200/80`, white background
- `PageHeader` — icon box + `font-display` title + subtitle
- `EmptyState` — illustration or emoji, Vietnamese message, optional CTA
- `ClassroomSelect` — custom dropdown wrapping `<option>` children (field / filter / inline variants). Do **not** use native `<select>`.
- `ClassroomMenuSelect` — portal menu used by `ClassroomSelect`; `z-index` 130 so it sits above dialogs
- `AnimatedEntrance` — list/card enter (`fade` / `fadeUp` / `fadeScale` / `random`)
- `PageTransition` — route enter via `AppDataShell` (`bouncyPop`, `colorfulSlide`, `bubbleReveal`, `sparkleReveal`)
- `IconTouchButton` — 44px icon-only actions with `aria-label`

Do not create per-page one-off button, card, or dropdown styles when these primitives apply.

# 12.8b Teacher vs Student-Facing Balance

Teacher management pages (~70% clean / 30% playful):

- Dashboard, Students, Teams, Points, Badges, Settings, Import

Student-facing / presentation pages (~40% structure / 60% playful):

- Lucky Wheel, Duck Race, Points Wheel
- Study Timer, Chọn ngẫu nhiên
- Rewards, Recognition
- Tools page (presentation layout)

Teacher pages: page transitions, card entrance (first 8 items), hover lift, and custom dropdown menus — not hover-only. Keep motion meaningful; do not add looping decoration on management screens.
Student-facing pages: larger typography, celebration moments allowed (confetti on wheel result), respect `prefers-reduced-motion`.

Chibi illustrations (`banner-boy.png`, `banner-girl.png`, `class-photo.png`): 1–2 per page maximum — dashboard greeting, empty states, coming-soon placeholders.

# 12.9 Chibi Illustrations

Use decorative chibi/cartoon illustrations selectively for:

- Hero banner
- Empty states
- Recognition
- Lucky Wheel result
- Reward screens

Maintain a consistent illustration style.

Do not scatter random mismatched illustrations across every page.

# 12.10 Typography

Must:

- Support Vietnamese correctly
- Use large readable headings
- Remain readable on projectors

Playful typography may be used for headings.

Body text must prioritize readability.

---

# 13. Animation Requirements

Use Framer Motion for meaningful motion. Tokens live in `src/utils/motion.ts` (`MOTION_DURATION_MS`) and `src/app/globals.css` (`--motion-*`). CSS hover/press uses the same values.

Current durations (keep CSS and TS in sync):

| Token | Duration | Typical use |
|---|---|---|
| `fast` | 200ms | Press, chevron, small UI |
| `normal` | 300ms | Default transitions, empty state |
| `smooth` | 420ms | Sidebar width, hover lift |
| `entrance` | 520ms | List/card enter |
| `emphasis` | 580ms | Point burst, stronger enter |
| `page` | 520ms | Route transition (`PageTransition`) |

Page-transition decor (`PAGE_DECOR_DURATION_S`, ~0.58s) must finish in the same window as page content. Do **not** fade page content from opacity 0 for ~1s+ after the flash — that leaves a blank `bg-page` gap (`bouncyPop` stays opacity 1 and only scales).

Shared presets (`src/utils/motion.ts`):

| Kind | Names |
|---|---|
| UI | `fadeUpVariants`, `dialogVariants`, `popoverVariants`, `backdropVariants` |
| Card entrance | `fade`, `fadeUp`, `fadeScale` (`AnimatedEntrance`; stagger first 8 items) |
| Page | `bouncyPop` (scale 0.9 → 1.06 → 1), `colorfulSlide`, `bubbleReveal`, `sparkleReveal` |

CSS utilities: `.ui-press`, `.ui-card-lift` (hover lift ~4px), `.motion-safe-hover`.

Gating: `useMotionEnabled()` = `appSettings.animationsEnabled` and not `prefers-reduced-motion`. Presentation mode skips `PageTransition` and `AnimatedEntrance`.

Appropriate animations:

- Card hover lift and press
- Page and list entrance
- Point increase/decrease (`PointBurstProvider`)
- Lucky Wheel / Points Wheel / Duck Race
- Student selection
- Ranking transitions
- Recognition reveal (`celebration-overlay`)
- Custom dropdown open (`popoverVariants`)

Use `canvas-confetti` for:

- Recognition
- Reward success
- Lucky Wheel result
- Important celebrations

Do not animate everything continuously.

Respect `prefers-reduced-motion` where practical.

---

# 14. Responsive Requirements

Primary targets:

1. Laptop
2. TV/projector
3. Tablet

Primary desktop resolutions:

- 1366x768
- 1440x900
- 1920x1080

Desktop experience has higher priority than mobile.

The application should still remain usable on smaller widths.

---

# 15. Accessibility and Usability

Basic accessibility requirements:

- Buttons must have understandable labels
- Icon-only buttons should have accessible labels/tooltips
- Text must maintain reasonable contrast
- Important actions should not rely only on color
- Destructive actions require confirmation
- Forms should display validation errors clearly
- CRUD/scoring dialogs trap focus (`useModalFocusTrap`) with `role="dialog"`, `aria-modal`, and a labelled heading. Stacked overlays use `modalTrapStack` so only the top dialog handles Escape/Tab. Lucky Wheel is excluded from this keyboard trap unless explicitly requested.
- Custom dropdowns (`ClassroomMenuSelect`): keyboard open (ArrowDown), list navigation, Escape / outside click to close; menu portals to `document.body` above dialogs (`z-index` 130).
- Full-screen celebration overlays (recognition ceremony) portal to `document.body` so they cover the sidebar and escape `main` overflow clipping.

Do not over-engineer a full accessibility system for Version 1, but do not ignore basic usability.

---

# 16. Suggested Project Structure

Use feature-oriented organization where useful.

```text
src/
├── components/
│   ├── ui/
│   ├── layout/
│   └── common/
│
├── features/
│   ├── classroom/
│   ├── students/
│   ├── teams/
│   ├── points/
│   ├── rewards/
│   ├── lucky-wheel/
│   ├── games/
│   └── recognition/
│
├── pages/
├── hooks/
├── services/
│   └── storage/
├── types/
├── utils/
├── App.tsx
└── main.tsx
```

This is guidance, not a strict architecture requirement.

Do not create unnecessary abstraction layers.

---

# 17. Reusable Components

Recommended reusable components:

```text
components/
├── ui/
│   ├── AppCard
│   ├── GradientButton
│   ├── SectionHeader
│   ├── AvatarFrame
│   ├── PointsBadge
│   └── TeamBadge
```

Possible layout components:

```text
components/layout/
├── AppSidebar
├── AppHeader
└── PresentationLayout
```

Create reusable components when a visual pattern appears multiple times.

Do not abstract every small element prematurely.

---

# 18. Non-Functional Requirements

## NFR-001 — Maintainability

- Use TypeScript properly
- Avoid `any`
- Use meaningful names
- Keep components focused
- Keep large page components from becoming business-logic containers
- Reuse components where appropriate

## NFR-002 — Performance

The application should feel responsive with a typical elementary classroom size.

Expected scale:

- Approximately 20-50 students
- A small number of teams
- Hundreds to a few thousand local history records

No complex optimization is required before measuring a real problem.

## NFR-003 — Reliability

Local data operations should:

- Handle invalid stored JSON safely
- Avoid corrupting all application data from one malformed record
- Fail visibly rather than silently

## NFR-004 — No Network Dependency

Core features must work without an internet connection after the application assets are available locally in the browser.

---

# 19. Acceptance Criteria Summary

The Version 1 product is considered functionally complete when the teacher can:

## Classroom

- [ ] Complete first-time classroom setup
- [ ] Change class name
- [ ] Change teacher name
- [ ] Change school year
- [ ] Change classroom/teacher avatar

## Students

- [ ] Add student
- [ ] Edit student
- [ ] Delete student with confirmation
- [ ] Search students (name, hometown, phone, parent)
- [ ] Filter and sort the student grid
- [ ] View detailed student profile
- [ ] Store private teacher notes
- [ ] Assign classroom roles
- [ ] Award badges

## Points

- [ ] Configure positive actions
- [ ] Configure negative actions
- [ ] Add points
- [ ] Deduct points
- [ ] View point history
- [ ] Ensure every point change creates history

## Rewards

- [ ] Create reward
- [ ] Edit reward
- [ ] Delete reward
- [ ] Redeem reward
- [ ] Prevent redemption when points are insufficient
- [ ] Record reward and point history

## Teams

- [ ] Create team
- [ ] Edit team
- [ ] Delete team
- [ ] Assign students
- [ ] Assign team leader and vice-leader
- [ ] Change team score
- [ ] View team ranking

## Activities

- [ ] Use Lucky Wheel (fair cycle, modal UI, scope/modes)
- [ ] Use Duck Race (scope, prevent-repeat, history)
- [ ] Use Points Wheel (one student per round, explicit apply, segment config)
- [ ] Use Study Timer with custom duration and refresh persistence
- [ ] Use Chọn ngẫu nhiên (fair bag, inline card)
- [ ] Randomly select students fairly
- [ ] Play Random Student
- [ ] Play Quick Answer
- [ ] Play Who Is Next

## Badges

- [ ] Configure badge catalog
- [ ] Award/remove badges per student
- [ ] Display badges on student views

## Recognition

- [ ] Create recognition
- [ ] View recognition history
- [ ] Present recognition fullscreen

## Presentation

- [ ] Hide private teacher data
- [ ] Display Lucky Wheel, Duck Race, and Points Wheel fullscreen-friendly
- [ ] Display tools page in presentation mode
- [ ] Display recognition fullscreen-friendly
- [ ] Display student leaderboard clearly
- [ ] Display team leaderboard clearly in presentation when ranking mode is teams

## Data

- [ ] Persist structured data locally
- [ ] Export backup
- [ ] Import valid backup
- [ ] Reset all data with confirmation

---

# 20. Implementation Phases

Implementation should proceed incrementally.

## Phase 1 — Foundation

1. Initialize project
2. Configure Tailwind
3. Configure shadcn/ui
4. Create design tokens
5. Create application layout
6. Create sidebar/navigation
7. Implement local storage layer
8. Implement classroom setup/settings
9. Implement student management
10. Implement student profile

## Phase 2 — Classroom Gamification

1. Point actions
2. Add/deduct points
3. Point history
4. Team management
5. Team score
6. Student leaderboard
7. Team leaderboard

## Phase 3 — Rewards and Recognition

1. Reward management
2. Reward redemption
3. Reward history
4. Recognition management
5. Recognition presentation screen

## Phase 4 — Interactive Activities

1. Reusable random selection utility
2. Lucky Wheel (modal, fair bag, randomized spin)
3. Tools page — sectioned layout (`Trò chơi` + `Công cụ nhanh` + Points Challenge)
4. Duck Race (modal)
5. Points Wheel (modal, configurable values, explicit apply)
6. Chọn ngẫu nhiên (inline fair picker; replaces Lucky Star)
7. Random Student / Quick Answer / Who Is Next (as scoped)
8. Presentation mode improvements

## Phase 4a — Badges & Classroom Roles

1. Classroom role catalog and assignment
2. Team leader / vice-leader
3. Badge catalog
4. Badge awarding UI

## Phase 5 — Data Safety and Polish

1. Backup export
2. Backup import
3. Reset all data
4. Empty states
5. Validation
6. Edge cases
7. Animation polish
8. Responsive/projector polish

---

# 21. Implementation Rules for Coding Agents

Before implementing a feature:

1. Read this entire `PROJECT_SCOPE.md`
2. Inspect the existing codebase
3. Preserve working functionality
4. Reuse existing patterns when reasonable
5. Do not add technology outside the defined stack without a clear need

For each feature:

1. Identify affected data models
2. Identify business rules
3. Identify privacy requirements
4. Implement persistence
5. Implement validation
6. Implement UI
7. Verify edge cases

Do not:

- Add backend functionality *(except `workers/cloud-backup` for auth/licensing/backup — see ACCOUNTS.md)*
- Add authentication *(except required teacher Google sign-in — see ACCOUNTS.md)*
- Add APIs *(except Worker endpoints for auth/backup/admin — see ACCOUNTS.md)*
- Add cloud services *(except optional R2 classroom backup — see ACCOUNTS.md)*
- Introduce Redux
- Over-engineer abstractions
- Hardcode classroom identity
- Expose private teacher notes in presentation screens
- Change student points without creating history

---

# 22. Final Product Definition

At completion, the application should allow a teacher to run a fun, visually engaging,
local classroom system from one browser.

The teacher should be able to:

1. Set up the classroom identity
2. Manage students and detailed profiles
3. Record student strengths and private notes
4. Add and deduct individual points
5. Maintain configurable classroom behavior actions
6. Track point history
7. Organize team competition
8. Manage rewards and redemption
9. Recognize students
10. Randomly select students
11. Run simple classroom games
12. Present activities on a TV/projector
13. Backup and restore local classroom data

The final experience should feel like:

> **A cute, modern, gamified digital classroom dashboard with chibi-inspired visuals.**

It should not feel like:

> **A traditional enterprise school management system or generic admin dashboard.**


# ARCHITECTURAL INVARIANTS

The following components are protected infrastructure:

- AppLayout
- Sidebar
- Navigation
- Routing
- Active Classroom Context
- Database Provider

Feature agents may extend these components when necessary.

Feature agents must NOT remove, bypass, or replace them unless explicitly requested.

Every feature page must follow:

Route
  ↓
AppLayout
  ↓
Sidebar + Shared UI
  ↓
Feature Page

==================================================
VISUAL DESIGN SYSTEM
==================================================

This application is a classroom management application designed for:

- Elementary school teachers
- Elementary school students

The visual design must feel:

- Friendly
- Warm
- Encouraging
- Playful
- Modern
- Safe
- Easy to understand

The application should feel like a modern digital classroom,
not a corporate admin dashboard.

However, the UI must NOT become childish, cluttered, or visually overwhelming.

==================================================
DESIGN BALANCE
==================================================

Target design balance:

Teacher management pages:

70% clean professional UI
30% playful classroom personality

Student-facing / classroom presentation pages:

40% structured UI
60% playful and engaging

Teacher management pages include:

- Dashboard
- Students
- Teams
- Settings
- Import
- Data management

Student-facing pages include:

- Lucky Wheel
- Student Picker
- Rewards
- Recognition
- Team Competition
- Classroom Games
- Presentation Mode

==================================================
VISUAL STYLE
==================================================

Use a:

"Cute Modern Classroom"

visual style.

Combine:

- Modern dashboard structure
- Soft pastel colors
- Rounded corners
- Friendly illustrations
- Chibi characters
- Playful micro-interactions
- Clean typography
- Spacious layouts

The design should feel polished and intentional.

Do NOT create a generic corporate dashboard.

==================================================
COLORS
==================================================

Use a controlled pastel color system.

Preferred color families:

- Soft blue
- Warm yellow
- Soft pink
- Mint green
- Lavender
- Peach

Use one primary color consistently.

Use accent colors sparingly.

Do NOT use every pastel color in every component.

Avoid:

- Neon colors
- Excessively saturated colors
- Random colors for every card
- Rainbow UI everywhere

The background should remain calm and light.

==================================================
CARDS AND COMPONENTS
==================================================

Use:

- Rounded corners
- Soft shadows
- Gentle borders
- Comfortable spacing
- Clear visual hierarchy

Recommended feeling:

Soft
Friendly
Tactile
Modern

Do not overuse:

- Heavy shadows
- Thick borders
- Excessive gradients
- Glassmorphism everywhere
- Pill shapes for every component

Use pill shapes mainly for:

- Badges
- Tags
- Small status indicators

==================================================
CHIBI ILLUSTRATIONS
==================================================

Chibi illustrations are an important visual identity element.

Use them strategically.

Recommended usage:

- Dashboard greeting area
- Empty states
- Recognition screens
- Rewards
- Games
- Lucky Wheel
- Onboarding

Do NOT place large chibi illustrations on every card.

Prefer:

1 or 2 meaningful illustrations per page.

All illustrations should maintain a consistent art style.

Preferred illustration themes:

- Friendly teacher
- Elementary school students
- Books
- Backpacks
- Pencils
- Stars
- Rewards
- Classroom objects
- Friendly animals when appropriate

==================================================
TYPOGRAPHY
==================================================

Typography must remain easy to read.

Use:

- Friendly sans-serif headings
- Clean sans-serif body text

Avoid:

- Decorative fonts for long text
- Handwriting fonts for normal UI
- Small unreadable text

Vietnamese text must render clearly.

Headings can be playful.

Body content must remain practical and readable.

==================================================
ICONS
==================================================

Use a consistent icon system.

Icons should feel:

- Rounded
- Friendly
- Simple

Emoji can be used selectively for:

- Rewards
- Games
- Recognition
- Empty states
- Decorative classroom elements

Do NOT replace every UI icon with emoji.

==================================================
ANIMATION
==================================================

Use meaningful, readable animations (tokens in `src/utils/motion.ts`).

Examples:

- Page enter (`PageTransition` + short-lived decor)
- Card/list enter (`AnimatedEntrance`)
- Card hover lift (~4px) and button press
- Point burst, reward celebration
- Lucky Wheel / Duck Race / Points Wheel
- Recognition celebration overlay

Teacher management pages still get page + card entrance; they must not loop decorative motion.

Student-facing pages can be more playful (confetti, wheel spin).

Avoid:

- Constant bouncing elements
- Auto-playing distracting animations
- Excessive confetti
- Native `<select>` popups (use `ClassroomSelect`)
- Page fade-from-transparent that outlasts the flash decor (blank gap)

Animations should enhance feedback,
not distract from classroom activities.

==================================================
EMPTY STATES
==================================================

Do not use plain empty pages.

Use friendly empty states with:

- Small illustration
- Friendly Vietnamese message
- Clear primary action

Example:

"Chưa có học sinh nào 🌱"

"Thêm học sinh đầu tiên để bắt đầu xây dựng lớp học nhé!"

[ + Thêm học sinh ]

==================================================
STUDENT-FACING EXPERIENCE
==================================================

Student-facing screens should feel exciting and rewarding.

Use:

- Larger typography
- Clear visuals
- Friendly colors
- Celebration moments
- Chibi illustrations
- Stars
- Rewards
- Simple interactions

Important information must remain easy to read from a distance.

Avoid dense tables or complex forms in presentation mode.

==================================================
TEACHER-FACING EXPERIENCE
==================================================

Teacher-facing screens should prioritize:

- Efficiency
- Clear information
- Easy CRUD operations
- Comfortable spacing
- Fast scanning

Keep the playful visual identity,
but do not sacrifice usability for decoration.

==================================================
CONSISTENCY
==================================================

Before implementing a new page or component:

1. Inspect existing UI components.
2. Reuse existing design tokens.
3. Reuse existing card patterns.
4. Reuse existing buttons.
5. Reuse existing modal patterns.
6. Reuse existing illustration style.

Do NOT create a completely different visual style for each page.

==================================================
FINAL DESIGN CHECK
==================================================

Before completing UI work, verify:

[ ] The page feels friendly and suitable for elementary school.
[ ] The UI is still comfortable for teachers.
[ ] Colors are controlled and not overwhelming.
[ ] Typography is easy to read.
[ ] Chibi illustrations are used strategically.
[ ] The design is playful but not childish.
[ ] The page is not visually cluttered.
[ ] Animations are meaningful and subtle.
[ ] Existing navigation remains consistent.
[ ] Existing design patterns are reused.

The final result should feel like:

"A polished modern classroom experience with a warm,
playful personality."

Not:

"A corporate admin dashboard."

And not:

"A chaotic children's game interface."