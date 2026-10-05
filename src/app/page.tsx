'use client'

import { TopBanner } from '@/components/dashboard/top-banner'
import { StudentList } from '@/components/dashboard/student-list'
import { Leaderboard } from '@/components/dashboard/leaderboard'
import { TeamCompetition } from '@/components/dashboard/team-competition'
import { AttendanceWeekOverview } from '@/components/dashboard/attendance-week-overview'
import { RecentPraise } from '@/components/dashboard/recent-praise'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { FeaturedGifts } from '@/components/dashboard/featured-gifts'
import { AnimatedEntrance } from '@/src/components/classroom'

export default function Home() {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="classroom-page--dashboard">
        <AnimatedEntrance variant="random" staggerIndex={0}>
          <TopBanner />
        </AnimatedEntrance>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.6fr_1.1fr_1fr]">
          <AnimatedEntrance variant="random" staggerIndex={1}>
            <StudentList />
          </AnimatedEntrance>
          <AnimatedEntrance variant="random" staggerIndex={2}>
            <Leaderboard />
          </AnimatedEntrance>
          <AnimatedEntrance variant="random" staggerIndex={3}>
            <TeamCompetition />
          </AnimatedEntrance>
        </div>

        <AnimatedEntrance variant="random" staggerIndex={4}>
          <AttendanceWeekOverview />
        </AnimatedEntrance>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <AnimatedEntrance variant="random" staggerIndex={5}>
            <RecentPraise />
          </AnimatedEntrance>
          <AnimatedEntrance variant="random" staggerIndex={6}>
            <RecentActivity />
          </AnimatedEntrance>
          <AnimatedEntrance variant="random" staggerIndex={7}>
            <FeaturedGifts />
          </AnimatedEntrance>
        </div>
      </div>
    </div>
  )
}
