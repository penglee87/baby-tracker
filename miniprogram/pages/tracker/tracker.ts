import { formatTime } from '../../utils/util'
import {
  addEvent,
  aggregateDaily,
  EventRecord,
  EventType,
  formatDateKey,
  getCurrentBabyId,
  setCurrentBabyId,
  watchEvents,
} from '../../utils/storage'

// 定义带展示字段的记录类型，解决类型不匹配的波浪线警告
interface EventRecordDisplay extends EventRecord {
  timeDisplay?: string
}

Component({
  data: {
    babyId: '',
    todayKey: '',
    events: [] as EventRecordDisplay[],
    statsText: '',
    inputTime: '',
    showTimeModal: false,
    showBabyModal: false,
    inputBabyId: '',
    // input states
    inputNotes: '',
    inputQuantity: 0,
    inputDuration: 0,
    pendingType: '' as EventType | '',
    showQuantityModal: false,
    showDurationModal: false,
  },
  lifetimes: {
    attached() {
      const babyId = getCurrentBabyId()
      const todayKey = formatDateKey(Date.now())
      const d = new Date()
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
      const inputTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      this.setData({ babyId, todayKey, inputTime })
      this.startWatch()
    },
    detached() {
      this.stopWatch()
    },
  },
  methods: {
    openBabyModal() {
      this.setData({ showBabyModal: true, inputBabyId: this.data.babyId })
    },
    babyIdInput(e: any) {
      this.setData({ inputBabyId: e.detail.value })
    },
    confirmBabyId() {
      const id = (this.data.inputBabyId || '').trim() || 'default'
      this.stopWatch()
      this.setData({ babyId: id, showBabyModal: false })
      setCurrentBabyId(id)
      this.startWatch()
      wx.showToast({ title: '已切换', icon: 'success' })
    },
    startWatch() {
      const babyId = this.data.babyId
      this._unwatch && this._unwatch()
      this._unwatch = watchEvents(babyId, (events) => {
        const todayKey = this.data.todayKey || formatDateKey(Date.now())
        // Ensure todayKey is set if not already
        if (!this.data.todayKey) {
          this.setData({ todayKey })
        }

        const todays = events.filter((e) => formatDateKey(e.timestamp) === todayKey)
        const stats = aggregateDaily(todays, todayKey)
        const statsText = `吃奶:${stats.feedCount}次(${stats.feedMl}ml) 喝水:${stats.drinkCount}次(${stats.drinkMl}ml) 小便:${stats.peeCount}次 大便:${stats.poopCount}次 睡眠:${stats.sleepSessions}段(${stats.sleepMinutes}分钟)`
        
        // Show last 20 events regardless of date
        const recentEvents = events.slice(0, 20).map(e => {
          const d = new Date(e.timestamp)
          const pad = (n: number) => n < 10 ? `0${n}` : `${n}`
          const timeDisplay = `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
          return {
            ...e,
            timeDisplay
          }
        })
        
        this.setData({ events: recentEvents, statsText })
      })
    },
    stopWatch() {
      if (this._unwatch) {
        this._unwatch()
        this._unwatch = null
      }
    },
    tapQuickAdd(e: any) {
      const type: EventType = e.currentTarget.dataset.type
      if (type === 'feed' || type === 'drink') {
        this.setData({ pendingType: type, showQuantityModal: true, inputQuantity: 0, inputTime: this.getNowTimeStr() })
        return
      }
      if (type === 'sleep') {
        this.setData({ pendingType: type, showDurationModal: true, inputDuration: 0, inputTime: this.getNowTimeStr() })
        return
      }
      this.setData({ pendingType: type, showTimeModal: true, inputTime: this.getNowTimeStr() })
    },
    commitEvent(type?: EventType) {
      const nowTs = this.buildTimestampFromHHMM(this.data.inputTime)
      const babyId = this.data.babyId
      const finalType = type || (this.data.pendingType as EventType)
      const record: EventRecord = {
        babyId,
        type: finalType,
        timestamp: nowTs,
        notes: this.data.inputNotes || '',
      }
      if (finalType === 'feed' || finalType === 'drink') {
        record.quantity = Number(this.data.inputQuantity) || 0
      }
      if (finalType === 'sleep') {
        record.durationMinutes = Number(this.data.inputDuration) || 0
      }
      addEvent(record).then(() => {
        this.setData({
          inputNotes: '',
          inputQuantity: 0,
          inputDuration: 0,
          inputTime: this.getNowTimeStr(),
          pendingType: '',
          showQuantityModal: false,
          showDurationModal: false,
          showTimeModal: false,
        })
        wx.showToast({ title: '已记录', icon: 'success' })
      })
    },
    cancelModal() {
      this.setData({
        pendingType: '',
        showQuantityModal: false,
        showDurationModal: false,
        showTimeModal: false,
      })
    },
    notesInput(e: any) {
      this.setData({ inputNotes: e.detail.value })
    },
    quantityInput(e: any) {
      this.setData({ inputQuantity: e.detail.value })
    },
    durationInput(e: any) {
      this.setData({ inputDuration: e.detail.value })
    },
    onTimeChange(e: any) {
      this.setData({ inputTime: e.detail.value })
    },
    formatDisplay(ts: number) {
      return formatTime(new Date(ts))
    },
    getNowTimeStr() {
      const d = new Date()
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    buildTimestampFromHHMM(time: string) {
      const now = new Date()
      const parts = (time || '').split(':')
      const hh = Number(parts[0] || 0)
      const mm = Number(parts[1] || 0)
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0)
      return d.getTime()
    },
  },
  pageLifetimes: {
    show() {
      const babyId = getCurrentBabyId()
      if (babyId !== this.data.babyId) {
        this.stopWatch()
        this.setData({ babyId })
        this.startWatch()
      }
    }
  }
})
