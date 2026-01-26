// pages/stats/stats.ts
// 统计页逻辑
// 负责展示今日数据概览和最近一周的趋势分析

import {
  aggregateDaily,
  formatDateKey,
  getCurrentBabyId,
  listEvents,
  StatsSummary,
} from '../../utils/storage'

Component({
  /**
   * 组件的初始数据
   */
  data: {
    babyId: '',
    todayKey: '',
    todayStats: {} as StatsSummary,
    weekStats: [] as StatsSummary[], // 最近一周的统计数据
    
    // 图表数据
    visuals: {
      trend: [] as any[],
      todaySleep: [] as any[]
    },

    // 详情弹窗状态
    showDetailModal: false,
    detailDate: '',
    detailEvents: [] as any[],
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      const babyId = getCurrentBabyId()
      const todayKey = formatDateKey(Date.now())
      this.setData({ babyId, todayKey })
      this.refresh()
    },
  },

  methods: {
    /**
     * 刷新统计数据
     * 获取今日统计和过去7天的每日统计
     */
    async refresh() {
      const babyId = getCurrentBabyId() // always get fresh babyId
      const now = Date.now()
      
      // 1. 获取今日数据
      const startOfToday = new Date(new Date(now).toDateString()).getTime()
      const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1
      const todays = await listEvents(babyId, startOfToday, endOfToday)
      const todayKey = formatDateKey(now)
      const todayStats = aggregateDaily(todays, todayKey)

      // 2. 获取过去7天数据（用于图表或列表展示）
      const days: StatsSummary[] = []
      for (let i = 6; i >= 0; i--) {
        const dayStart = startOfToday - i * 24 * 60 * 60 * 1000
        const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1
        const list = await listEvents(babyId, dayStart, dayEnd)
        const key = formatDateKey(dayStart)
        days.push(aggregateDaily(list, key))
      }

      // Calculate Today Sleep Segments
      const todaySleep = todays.filter(e => e.type === 'sleep' && e.durationMinutes && e.durationMinutes > 0).map(e => {
         const dt = new Date(e.timestamp)
         const startMin = dt.getHours() * 60 + dt.getMinutes()
         const left = (startMin / 1440) * 100
         const width = (e.durationMinutes! / 1440) * 100
         const realWidth = (left + width > 100) ? (100 - left) : width
         return { left, width: realWidth }
      })

      // Calculate Trend (before reverse)
      const maxFeed = Math.max(...days.map(d => d.feedMl), 100) // min 100 to avoid div by 0 or huge spikes
      const maxSleep = Math.max(...days.map(d => d.sleepMinutes), 60) // min 60

      const trend = days.map(d => {
        return {
          date: d.dateKey.slice(5), // MM-DD
          feedHeight: (d.feedMl / maxFeed) * 100,
          sleepHeight: (d.sleepMinutes / maxSleep) * 100,
          feedVal: d.feedMl,
          sleepVal: d.sleepMinutes
        }
      })

      this.setData({ 
        babyId, 
        todayStats, 
        weekStats: [...days].reverse(), // Create copy before reverse
        visuals: {
          trend,
          todaySleep
        }
      })
    },

    /**
     * 查看某日的详细记录
     */
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

  /**
   * 页面生命周期
   */
  pageLifetimes: {
    show() {
      // 每次显示页面时自动刷新数据，确保数据同步
      this.refresh()
    }
  }
})
