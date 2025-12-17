import {
  aggregateDaily,
  EventRecord,
  formatDateKey,
  getCurrentBabyId,
  listEvents,
  StatsSummary,
} from '../../utils/storage'

Component({
  data: {
    babyId: '',
    todayKey: '',
    todayStats: {} as StatsSummary,
    weekStats: [] as StatsSummary[],
  },
  lifetimes: {
    attached() {
      const babyId = getCurrentBabyId()
      const todayKey = formatDateKey(Date.now())
      this.setData({ babyId, todayKey })
      this.refresh()
    },
  },
  methods: {
    async refresh() {
      const babyId = getCurrentBabyId() // always get fresh babyId
      const now = Date.now()
      const startOfToday = new Date(new Date(now).toDateString()).getTime()
      const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1
      const todays = await listEvents(babyId, startOfToday, endOfToday)
      const todayKey = formatDateKey(now)
      const todayStats = aggregateDaily(todays, todayKey)

      const days: StatsSummary[] = []
      for (let i = 6; i >= 0; i--) {
        const dayStart = startOfToday - i * 24 * 60 * 60 * 1000
        const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1
        const list = await listEvents(babyId, dayStart, dayEnd)
        const key = formatDateKey(dayStart)
        days.push(aggregateDaily(list, key))
      }
      this.setData({ babyId, todayStats, weekStats: days.reverse() })
    },
    async viewDayDetail(e: any) {
      const dateKey = e.currentTarget.dataset.date
      const babyId = this.data.babyId
      
      // Parse dateKey (YYYY-MM-DD) to start/end ts
      const parts = dateKey.split('-')
      const y = parseInt(parts[0])
      const m = parseInt(parts[1]) - 1
      const d = parseInt(parts[2])
      const startTs = new Date(y, m, d, 0, 0, 0).getTime()
      const endTs = startTs + 24 * 60 * 60 * 1000 - 1

      const list = await listEvents(babyId, startTs, endTs)
      
      const formattedList = list.map(item => {
        const dt = new Date(item.timestamp)
        const pad = (n: number) => n < 10 ? `0${n}` : `${n}`
        return {
          ...item,
          timeStr: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
        }
      })

      this.setData({
        showDetailModal: true,
        detailDate: dateKey,
        detailEvents: formattedList
      })
    },
    closeDetailModal() {
      this.setData({ showDetailModal: false })
    }
  },
  pageLifetimes: {
    show() {
      this.refresh()
    }
  }
})
