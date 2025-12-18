import { formatTime } from '../../utils/util'
import {
  addEvent,
  updateEvent,
  deleteEvent,
  aggregateDaily,
  EventRecord,
  EventType,
  formatDateKey,
  getCurrentBabyId,
  setCurrentBabyId,
  watchEvents,
  getQuickActions,
  setQuickActions,
} from '../../utils/storage'

// 定义带展示字段的记录类型，解决类型不匹配的波浪线警告
interface EventRecordDisplay extends EventRecord {
  timeDisplay?: string
  typeLabel?: string
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
    showEditModal: false,
    editId: '',
    editType: '' as EventType | '',
    editTime: '',
    editQuantity: 0,
    editDuration: 0,
    editNotes: '',
    typeOptions: ['吃奶', '喝水', '小便', '大便', '睡觉', '醒来'],
    // quick actions
    quickActions: [] as Array<{ type: EventType; label: string }>,
    editActionsMode: false,
    addActionIndex: 0,
  },
  lifetimes: {
    attached() {
      this.initData()
    },
    detached() {
      this.stopWatch()
    },
  },
  pageLifetimes: {
    show() {
      const current = getCurrentBabyId()
      if (current !== this.data.babyId) {
        this.initData()
      } else {
        // Even if babyId hasn't changed, we might need to refresh if data changed elsewhere
        // But watchEvents handles data changes. 
        // Quick actions might have changed in profile/settings? No, quick actions are per baby.
        // If we just switch tabs, watchEvents is still active?
        // If the page was hidden, watchEvents callback might still fire if it's just a tab switch.
        // However, it's safer to ensure we are watching the correct baby.
        // Also, quick actions might be updated if we add a "Manage Quick Actions" in profile later.
        // For now, checking babyId change is sufficient for the "follow switch" requirement.
        // But let's reload quick actions just in case.
        this.loadQuickActions()
      }
    }
  },
  methods: {
    initData() {
      const babyId = getCurrentBabyId()
      const todayKey = formatDateKey(Date.now())
      const d = new Date()
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
      const inputTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      this.setData({ babyId, todayKey, inputTime })
      this.loadQuickActions()
      this.startWatch()
    },
    getStyleForType(type: EventType) {
      switch (type) {
        case 'feed': return { icon: '🍼', colorClass: 'bg-orange' }
        case 'drink': return { icon: '💧', colorClass: 'bg-blue' }
        case 'pee': return { icon: '💧', colorClass: 'bg-yellow' }
        case 'poop': return { icon: '💩', colorClass: 'bg-brown' }
        case 'sleep': return { icon: '🌙', colorClass: 'bg-purple' }
        case 'wake': return { icon: '☀️', colorClass: 'bg-yellow-light' }
        default: return { icon: '📝', colorClass: 'bg-gray' }
      }
    },
    async loadQuickActions() {
      const babyId = this.data.babyId
      const actions = getQuickActions(babyId)
      const enrichedActions = actions.map(a => ({
        ...a,
        ...this.getStyleForType(a.type)
      }))
      this.setData({ quickActions: enrichedActions })
    },
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
          const rawType: any = (e as any).type
          let typeStr = 'unknown'; // 默认为未知
  
          if (typeof rawType === 'string') {
            typeStr = rawType;
          } else if (rawType && typeof rawType === 'object') {
            // 如果数据库里意外存成了对象，尝试尝试挽救（比如取 rawType.type），否则标记为 error
            console.warn('数据异常: type 字段是对象', rawType);
            typeStr = rawType.type || 'error'; 
          }
          const typeLabelMap: Record<string, string> = {
            feed: '吃奶',
            drink: '喝水',
            pee: '小便',
            poop: '大便',
            sleep: '睡觉',
            wake: '醒来',
            tap: '未知',
          }
          const typeLabel = typeLabelMap[typeStr] || (typeStr || '未知')
          return {
            ...e,
            timeDisplay,
            typeLabel
          }
        })
        
        this.setData({ events: recentEvents, statsText })
      })
    },
    openItemActions(e: any) {
      const id = e.currentTarget.dataset.id
      const item = (this.data.events || []).find((r) => r.id === id || r._id === id)
      if (!item) return
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            const d = new Date(item.timestamp)
            const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
            const editTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
            this.setData({
              showEditModal: true,
              editId: item._id || item.id || '',
              editType: (typeof item.type === 'string' ? (item.type as EventType) : 'feed'),
              editTime,
              editQuantity: item.quantity || 0,
              editDuration: item.durationMinutes || 0,
              editNotes: item.notes || '',
            })
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '确认删除',
              content: '删除后不可恢复，确定删除该记录？',
              success: (m) => {
                if (m.confirm) {
                  deleteEvent(this.data.babyId, id).then(() => {
                    wx.showToast({ title: '已删除', icon: 'success' })
                  })
                }
              },
            })
          }
        },
      })
    },
    onEditTypeChange(e: any) {
      const idx = Number(e.detail.value || 0)
      const map = ['feed', 'drink', 'pee', 'poop', 'sleep', 'wake']
      this.setData({ editType: map[idx] as EventType })
    },
    onEditNotesInput(e: any) {
      this.setData({ editNotes: e.detail.value })
    },
    onEditQuantityInput(e: any) {
      this.setData({ editQuantity: Number(e.detail.value) || 0 })
    },
    onEditDurationInput(e: any) {
      this.setData({ editDuration: Number(e.detail.value) || 0 })
    },
    onEditTimeChange(e: any) {
      this.setData({ editTime: e.detail.value })
    },
    cancelEdit() {
      this.setData({ showEditModal: false, editId: '', editNotes: '', editQuantity: 0, editDuration: 0 })
    },
    saveEdit() {
      const babyId = this.data.babyId
      const id = this.data.editId
      const type = this.data.editType as EventType
      if (!id || !type) {
        wx.showToast({ title: '编辑信息不完整', icon: 'none' })
        return
      }
      const ts = this.buildTimestampFromHHMM(this.data.editTime)
      const rec: EventRecord = {
        babyId,
        type,
        timestamp: ts,
        notes: this.data.editNotes || '',
      }
      if (id.startsWith('6') || id.length >= 20) {
        rec._id = id
      } else {
        rec.id = id
      }
      if (type === 'feed' || type === 'drink') {
        rec.quantity = Number(this.data.editQuantity) || 0
      } else {
        rec.quantity = undefined
      }
      if (type === 'sleep') {
        rec.durationMinutes = Number(this.data.editDuration) || 0
      } else {
        rec.durationMinutes = undefined
      }
      updateEvent(rec).then(() => {
        this.setData({ showEditModal: false })
        wx.showToast({ title: '已更新', icon: 'success' })
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
    toggleEditActions() {
      this.setData({ editActionsMode: !this.data.editActionsMode })
    },
    openAddAction() {
      wx.showActionSheet({
        itemList: this.data.typeOptions,
        success: (res) => {
          const idx = res.tapIndex
          const map = ['feed', 'drink', 'pee', 'poop', 'sleep', 'wake']
          const type = map[idx] as EventType
          const exists = (this.data.quickActions || []).some((a) => a.type === type)
          if (exists) {
            wx.showToast({ title: '已存在该行为', icon: 'none' })
            return
          }
          const label = this.data.typeOptions[idx]
          const next = [...(this.data.quickActions || []), { type, label }]
          this.setData({ quickActions: next })
          setQuickActions(this.data.babyId, next)
          wx.showToast({ title: '已添加', icon: 'success' })
        },
      })
    },
    moveActionUp(e: any) {
      const i = Number(e.currentTarget.dataset.index)
      const type = this.data.quickActions[i].type
      this.updateActionOrder(type, 'up')
    },
    moveActionDown(e: any) {
      const i = Number(e.currentTarget.dataset.index)
      const type = this.data.quickActions[i].type
      this.updateActionOrder(type, 'down')
    },
    moveActionTop(e: any) {
      const i = Number(e.currentTarget.dataset.index)
      const type = this.data.quickActions[i].type
      this.updateActionOrder(type, 'top')
    },
    async updateActionOrder(type: EventType, direction: 'up' | 'down' | 'top') {
      const babyId = this.data.babyId
      let actions = getQuickActions(babyId)
      const index = actions.findIndex(a => a.type === type)
      if (index === -1) return

      const action = actions[index]
      actions.splice(index, 1)

      if (direction === 'up') {
        const newIndex = Math.max(0, index - 1)
        actions.splice(newIndex, 0, action)
      } else if (direction === 'down') {
        const newIndex = Math.min(actions.length, index + 1)
        actions.splice(newIndex, 0, action)
      } else {
        actions.unshift(action)
      }

      setQuickActions(babyId, actions)
      this.loadQuickActions() // Reload to apply styles
    },

    removeAction(e: any) {
      const index = e.currentTarget.dataset.index
      const babyId = this.data.babyId
      let actions = getQuickActions(babyId)
      actions.splice(index, 1)
      setQuickActions(babyId, actions)
      this.loadQuickActions() // Reload to apply styles
    },
    commitEvent(type?: EventType) {
      const nowTs = this.buildTimestampFromHHMM(this.data.inputTime)
      const babyId = this.data.babyId
      const finalType = (typeof type === 'string' ? type : (this.data.pendingType as EventType))
      if (!finalType) {
        wx.showToast({ title: '请选择类型', icon: 'none' })
        return
      }
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
