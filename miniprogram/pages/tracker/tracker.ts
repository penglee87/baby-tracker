// pages/tracker/tracker.ts
// 首页/记录页逻辑
// 负责展示快捷操作、最近记录列表以及处理新的记录添加

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

interface TrackerData {
  babyId: string
  todayKey: string
  events: EventRecordDisplay[]
  statsText: string
  inputTime: string
  showTimeModal: boolean
  showBabyModal: boolean
  inputBabyId: string
  inputNotes: string
  inputQuantity: number
  inputDuration: number
  pendingType: EventType | ''
  showQuantityModal: boolean
  showDurationModal: boolean
  showEditModal: boolean
  editId: string
  editType: EventType | ''
  editTime: string
  editQuantity: number
  editDuration: number
  editNotes: string
  typeOptions: string[]
  quickActions: Array<{ type: EventType; label: string }>
  editActionsMode: boolean
  addActionIndex: number
  hasModalOpen: boolean
  editOriginalTimestamp: number
}

interface TrackerMethod {
  initData(): void
  getStyleForType(type: EventType): { icon: string; colorClass: string }
  loadQuickActions(): Promise<void>
  openBabyModal(): void
  babyIdInput(e: any): void
  confirmBabyId(): void
  startWatch(): void
  openItemActions(e: any): void
  onEditTypeChange(e: any): void
  onEditNotesInput(e: any): void
  onEditQuantityInput(e: any): void
  onEditDurationInput(e: any): void
  onEditTimeChange(e: any): void
  cancelEdit(): void
  saveEdit(): void
  stopWatch(): void
  tapQuickAdd(e: any): void
  toggleEditActions(): void
  openAddAction(): void
  moveActionUp(e: any): void
  moveActionDown(e: any): void
  moveActionTop(e: any): void
  updateActionOrder(type: EventType, direction: 'up' | 'down' | 'top'): Promise<void>
  removeAction(e: any): void
  commitEvent(type?: EventType): void
  cancelModal(): void
  notesInput(e: any): void
  quantityInput(e: any): void
  durationInput(e: any): void
  onTimeChange(e: any): void
  formatDisplay(ts: number): string
  getNowTimeStr(): string
  buildTimestampFromHHMM(time: string, baseDate?: number): number
  [key: string]: any
}

Component<TrackerData, {}, TrackerMethod, { _unwatch?: () => void }>({
  /**
   * 组件的初始数据
   */
  data: {
    babyId: '',
    todayKey: '',
    events: [] as EventRecordDisplay[],
    statsText: '', // 顶部统计文本
    inputTime: '', // 记录发生时间
    showTimeModal: false,
    showBabyModal: false, // 切换宝宝弹窗
    inputBabyId: '',
    
    // 输入相关状态
    inputNotes: '',
    inputQuantity: 0,
    inputDuration: 0,
    pendingType: '' as EventType | '', // 当前正在添加的事件类型
    showQuantityModal: false, // 奶量输入弹窗
    showDurationModal: false, // 时长输入弹窗
    
    // 编辑相关状态
    showEditModal: false,
    editId: '',
    editType: '' as EventType | '',
    editTime: '',
    editQuantity: 0,
    editDuration: 0,
    editNotes: '',
    typeOptions: ['吃奶', '喝水', '小便', '大便', '睡觉', '醒来'],
    
    // 快捷操作按钮配置
    quickActions: [] as Array<{ type: EventType; label: string }>,
    editActionsMode: false, // 是否处于编辑快捷按钮模式
    addActionIndex: 0,
    hasModalOpen: false,
    editOriginalTimestamp: 0,
  },

  observers: {
    'showEditModal, showQuantityModal, showDurationModal, showTimeModal, showBabyModal': function (
      v1, v2, v3, v4, v5
    ) {
      this.setData({
        hasModalOpen: v1 || v2 || v3 || v4 || v5
      })
    }
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      this.initData()
    },
    detached() {
      this.stopWatch()
    },
  },

  /**
   * 页面生命周期
   */
  pageLifetimes: {
    show() {
      const current = getCurrentBabyId()
      // 如果当前宝宝ID变化，重新初始化数据
      if (current !== this.data.babyId) {
        this.initData()
      } else {
        // 否则仅刷新快捷按钮配置（防止在其他页面修改后不同步）
        this.loadQuickActions()
      }
    }
  },

  methods: {
    /**
     * 初始化页面数据
     * 加载当前宝宝ID，设置默认时间，启动数据监听
     */
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

    /**
     * 获取事件类型对应的图标和颜色样式
     */
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

    /**
     * 加载快捷操作按钮配置并附加样式
     */
    async loadQuickActions() {
      const babyId = this.data.babyId
      const actions = getQuickActions(babyId)
      const enrichedActions = actions.map(a => ({
        ...a,
        ...this.getStyleForType(a.type)
      }))
      this.setData({ quickActions: enrichedActions })
    },

    // --- 宝宝切换相关 ---
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

    /**
     * 启动数据监听
     * 订阅 storage 模块的事件更新，实时刷新列表和统计
     */
    startWatch() {
      const babyId = this.data.babyId
      this._unwatch && this._unwatch()
      this._unwatch = watchEvents(babyId, (events) => {
        const todayKey = this.data.todayKey || formatDateKey(Date.now())
        if (!this.data.todayKey) {
          this.setData({ todayKey })
        }

        // 计算今日统计
        const todays = events.filter((e) => formatDateKey(e.timestamp) === todayKey)
        const stats = aggregateDaily(todays, todayKey)
        const statsText = `吃奶:${stats.feedCount}次(${stats.feedMl}ml) 喝水:${stats.drinkCount}次(${stats.drinkMl}ml) 小便:${stats.peeCount}次 大便:${stats.poopCount}次 睡眠:${stats.sleepSessions}段(${stats.sleepMinutes}分钟)`
        
        // 展示最近20条记录
        const recentEvents = events.slice(0, 20).map(e => {
          const d = new Date(e.timestamp)
          const pad = (n: number) => n < 10 ? `0${n}` : `${n}`
          const timeDisplay = `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
          const rawType: any = (e as any).type
          let typeStr = 'unknown';

          if (typeof rawType === 'string') {
            typeStr = rawType;
          } else if (rawType && typeof rawType === 'object') {
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

    // --- 列表项操作 (编辑/删除) ---
    openItemActions(e: any) {
      const id = e.currentTarget.dataset.id
      const item = (this.data.events || []).find((r) => r.id === id || r._id === id)
      if (!item) return
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 打开编辑弹窗
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
              editOriginalTimestamp: item.timestamp,
            })
          } else if (res.tapIndex === 1) {
            // 确认删除
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

    // --- 编辑表单处理 ---
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
      this.setData({ showEditModal: false, editId: '', editNotes: '', editQuantity: 0, editDuration: 0, editOriginalTimestamp: 0 })
    },
    saveEdit() {
      const babyId = this.data.babyId
      const id = this.data.editId
      const type = this.data.editType as EventType
      if (!id || !type) {
        wx.showToast({ title: '编辑信息不完整', icon: 'none' })
        return
      }
      const ts = this.buildTimestampFromHHMM(this.data.editTime, this.data.editOriginalTimestamp)
      
      // 查找原始记录以确定使用哪个ID字段
      const original = (this.data.events || []).find(e => e.id === id || e._id === id)
      
      const rec: EventRecord = {
        babyId,
        type,
        timestamp: ts,
        notes: this.data.editNotes || '',
      }
      
      // 准确设置 ID
      if (original) {
        if (original._id === id) rec._id = id
        if (original.id === id) rec.id = id
      } else {
        // 兜底逻辑
        if (id.startsWith('6') || id.length >= 20) {
          rec._id = id
        } else {
          rec.id = id
        }
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
        this._unwatch = undefined
      }
    },

    // --- 快捷操作处理 ---
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

    // --- 提交新记录 ---
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
    buildTimestampFromHHMM(time: string, baseDate?: number) {
      const now = baseDate ? new Date(baseDate) : new Date()
      const parts = (time || '').split(':')
      const hh = Number(parts[0] || 0)
      const mm = Number(parts[1] || 0)
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0)
      return d.getTime()
    },
  },
})
