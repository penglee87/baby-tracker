// utils/storage.ts
// 核心数据存储模块
// 负责处理所有数据的增删改查，支持云开发(Cloud)与本地缓存(Storage)的双模存储
// 当云开发不可用时，自动降级为本地存储，保证离线可用性

/**
 * 事件类型定义
 * feed: 吃奶, drink: 喝水, pee: 小便, poop: 大便, sleep: 睡觉, wake: 醒来
 */
export type EventType = 'feed' | 'drink' | 'pee' | 'poop' | 'sleep' | 'wake'

/**
 * 事件记录接口
 * 对应一条具体的宝宝行为记录
 */
export interface EventRecord {
  _id?: string       // 云数据库自动生成的ID
  id?: string        // 本地生成的唯一ID (降级模式使用)
  babyId: string     // 关联的宝宝ID
  type: EventType    // 事件类型
  timestamp: number  // 发生时间戳
  quantity?: number  // 数量 (如奶量ml)
  durationMinutes?: number // 持续时长 (如睡眠分钟)
  notes?: string     // 备注信息
  createdBy?: string // 创建人标识
}

/**
 * 每日统计摘要接口
 * 用于统计页面展示
 */
export interface StatsSummary {
  dateKey: string       // 日期标识 YYYY-MM-DD
  feedCount: number     // 喂奶次数
  feedMl: number        // 喂奶总量
  drinkCount: number    // 喝水次数
  drinkMl: number       // 喝水总量
  peeCount: number      // 小便次数
  poopCount: number     // 大便次数
  sleepSessions: number // 睡眠段数
  sleepMinutes: number  // 睡眠总时长
}

// 云开发数据库实例缓存
// 如果类型报错，可以使用 ReturnType<typeof wx.cloud.database> 或 any
// 这里使用 typeof wx.cloud.database 的返回类型来确保兼容性
type CloudDB = ReturnType<typeof wx.cloud.database>
let dbInstance: CloudDB | null = null

let cloudInitialized = false

/**
 * 初始化云开发环境
 * @returns 数据库实例，如果初始化失败则返回 null
 */
export function initCloud() {
  if (cloudInitialized) return dbInstance
  if (wx.cloud) {
    try {
      wx.cloud.init({  
        // 请在此处填入您的云开发环境ID
        // 可以在“微信开发者工具 -> 云开发 -> 设置”中查看
        env: 'cloud1-8gosc07ib9733a28', 
        traceUser: true, 
      })
      dbInstance = wx.cloud.database()
      // 简单的连接测试，确保 ID 正确
      console.log('[Cloud] 初始化尝试完成')
    } catch (e) {
      console.error('[Cloud] 初始化失败，将降级为本地存储:', e)
      dbInstance = null
    }
  } else {
    dbInstance = null
  }
  cloudInitialized = true
  return dbInstance
}

const LOCAL_KEY_PREFIX = 'baby_tracker_'
const CURRENT_BABY_KEY = `${LOCAL_KEY_PREFIX}current_baby`

/**
 * 获取当前选中的宝宝ID
 * 如果没有设置，默认为 'default'
 */
export function getCurrentBabyId(): string {
  const id = wx.getStorageSync(CURRENT_BABY_KEY)
  if (id) return id
  const defaultId = 'default'
  wx.setStorageSync(CURRENT_BABY_KEY, defaultId)
  return defaultId
}

/**
 * 设置当前选中的宝宝ID
 * @param id 宝宝唯一标识
 */
export function setCurrentBabyId(id: string) {
  wx.setStorageSync(CURRENT_BABY_KEY, id)
}

/**
 * 宝宝档案信息
 */
export type BabyProfile = {
  id: string          // 唯一标识 (通常为共享码)
  name: string        // 昵称
  avatarUrl?: string  // 头像地址
  gender?: 'boy' | 'girl' // 性别
  birthday?: string   // 出生日期 YYYY-MM-DD
}

const BABIES_KEY = `${LOCAL_KEY_PREFIX}babies`

/**
 * 获取所有宝宝列表
 * 包含数据清洗逻辑：去除无效ID，去重
 */
export function listBabies(): BabyProfile[] {
  const raw: BabyProfile[] = wx.getStorageSync(BABIES_KEY) || []
  const seen = new Set<string>()
  const list: BabyProfile[] = []
  if (Array.isArray(raw)) {
    raw.forEach((b) => {
      const id = (b?.id || '').trim()
      if (!id) return
      if (seen.has(id)) return
      seen.add(id)
      list.push({ 
        id, 
        name: b.name || '未命名宝宝', 
        avatarUrl: b.avatarUrl || '',
        gender: b.gender,
        birthday: b.birthday
      })
    })
  }
  if (list.length) return list
  // 如果列表为空，初始化默认宝宝
  const defaults: BabyProfile[] = [{ id: 'default', name: '默认宝宝' }]
  wx.setStorageSync(BABIES_KEY, defaults)
  return defaults
}

/**
 * 保存宝宝列表到本地缓存
 */
export function saveBabies(babies: BabyProfile[]) {
  wx.setStorageSync(BABIES_KEY, babies)
}

/**
 * 新增或更新宝宝信息
 * 如果ID已存在则更新，否则新增
 */
export function upsertBaby(baby: BabyProfile) {
  const list = listBabies()
  const idx = list.findIndex((b) => b.id === baby.id)
  if (idx >= 0) {
    list[idx] = { 
      ...list[idx], 
      name: baby.name, 
      avatarUrl: baby.avatarUrl,
      gender: baby.gender,
      birthday: baby.birthday
    }
  } else {
    list.push(baby)
  }
  saveBabies(list)
}

/**
 * 成长记录接口 (身高体重)
 */
export interface GrowthRecord {
  id?: string
  babyId: string
  date: string // YYYY-MM-DD
  height?: number // cm
  weight?: number // kg
  headCircumference?: number // cm
  notes?: string
}

/**
 * 里程碑记录接口 (相册)
 */
export interface MilestoneRecord {
  id?: string
  babyId: string
  date: string // YYYY-MM-DD
  title: string
  description?: string
  photoFileId?: string // Cloud File ID
  photoLocalPath?: string // Local temp path
}


/**
 * 生成本地存储成长记录的Key
 */
function localGrowthKey(babyId: string) {
  return `${LOCAL_KEY_PREFIX}growth_${babyId}`
}

/**
 * 生成本地存储里程碑记录的Key
 */
function localMilestonesKey(babyId: string) {
  return `${LOCAL_KEY_PREFIX}milestones_${babyId}`
}

/**
 * 获取成长记录列表 (身高体重)
 */
export async function listGrowthRecords(babyId: string): Promise<GrowthRecord[]> {
  const database = initCloud()
  if (database) {
    try {
      const res = await database.collection('growth')
        .where({ babyId })
        .orderBy('date', 'desc')
        .get()
      return res.data as GrowthRecord[]
    } catch (e) {
      // fallback
    }
  }
  const key = localGrowthKey(babyId)
  return wx.getStorageSync(key) || []
}

/**
 * 添加成长记录
 */
export async function addGrowthRecord(rec: GrowthRecord): Promise<GrowthRecord> {
  const database = initCloud()
  const toSave = { ...rec }
  let saved = false

  if (database) {
    try {
      const res = await database.collection('growth').add({
        data: {
          ...toSave,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      })
      toSave.id = String(res._id)
      saved = true
    } catch (e) {}
  }

  if (!saved) {
    const key = localGrowthKey(rec.babyId)
    const list: GrowthRecord[] = wx.getStorageSync(key) || []
    toSave.id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    list.unshift(toSave)
    list.sort((a, b) => b.date.localeCompare(a.date)) // Keep sorted
    wx.setStorageSync(key, list)
  }
  return toSave
}

/**
 * 获取里程碑列表
 */
export async function listMilestones(babyId: string): Promise<MilestoneRecord[]> {
  const database = initCloud()
  if (database) {
    try {
      const res = await database.collection('milestones')
        .where({ babyId })
        .orderBy('date', 'desc')
        .get()
      return res.data as MilestoneRecord[]
    } catch (e) {
      // fallback
    }
  }
  const key = localMilestonesKey(babyId)
  return wx.getStorageSync(key) || []
}

/**
 * 添加里程碑
 */
export async function addMilestone(rec: MilestoneRecord): Promise<MilestoneRecord> {
  const database = initCloud()
  const toSave = { ...rec }
  let saved = false

  if (database) {
    try {
      const res = await database.collection('milestones').add({
        data: {
          ...toSave,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      })
      toSave.id = String(res._id)
      saved = true
    } catch (e) {}
  }

  if (!saved) {
    const key = localMilestonesKey(rec.babyId)
    const list: MilestoneRecord[] = wx.getStorageSync(key) || []
    toSave.id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    list.unshift(toSave)
    list.sort((a, b) => b.date.localeCompare(a.date))
    wx.setStorageSync(key, list)
  }
  return toSave
}


/**
 * 删除指定ID的宝宝
 * 如果删除的是当前选中的宝宝，会自动切换到下一个可用宝宝
 */
export function deleteBabyById(id: string) {
  const list = listBabies()
  const filtered = list.filter((b) => b.id !== id)
  saveBabies(filtered)
  const current = getCurrentBabyId()
  if (current === id) {
    const next = filtered[0]?.id || 'default'
    setCurrentBabyId(next)
  }
}

/**
 * 生成本地存储事件记录的Key
 */
function localEventsKey(babyId: string) {
  return `${LOCAL_KEY_PREFIX}events_${babyId}`
}


// 简单的事件监听器，用于页面间数据同步
type Listener = {
  babyId: string
  callback: (events: EventRecord[]) => void
}

let listeners: Listener[] = []

/**
 * 通知所有监听者数据已更新
 * @param babyId 变更的宝宝ID
 */
function notifyListeners(babyId: string) {
  listEvents(babyId).then((list) => {
    listeners.forEach((l) => {
      if (l.babyId === babyId) {
        l.callback(list)
      }
    })
  })
}

/**
 * 添加一条新事件记录
 * 优先尝试云端存储，失败则回退到本地存储
 */
export async function addEvent(rec: EventRecord): Promise<EventRecord> {
  const database = initCloud()
  const toSave: EventRecord = { ...rec }
  let saved = false
  
  // 尝试云端存储
  if (database) {
    try {
      const res = await database.collection('events').add({
        data: {
          ...toSave,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })
      toSave._id = String(res._id)
      saved = true
    } catch (e) {
      // fallback to local
    }
  }
  
  // 如果云端失败或未启用，使用本地存储
  if (!saved) {
    const key = localEventsKey(rec.babyId)
    const list: EventRecord[] = wx.getStorageSync(key) || []
    // 生成本地唯一ID
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    toSave.id = id
    list.unshift(toSave)
    wx.setStorageSync(key, list)
  }
  
  // 触发数据更新通知
  notifyListeners(rec.babyId)
  return toSave
}

/**
 * 自动关联“醒来”与最近一次“睡觉”记录
 * 计算并更新睡眠时长
 * @param wakeRecord 刚刚添加的醒来记录
 */
export async function linkSleepAndWake(wakeRecord: EventRecord): Promise<void> {
  if (wakeRecord.type !== 'wake') return
  
  const babyId = wakeRecord.babyId
  const database = initCloud()
  
  // 查找最近一次的 sleep 记录
  // 限制时间范围：过去24小时内
  const now = wakeRecord.timestamp
  const oneDayAgo = now - 24 * 60 * 60 * 1000
  
  let lastSleep: EventRecord | undefined
  
  if (database) {
    try {
      const res = await database.collection('events')
        .where({
          babyId,
          type: 'sleep',
          timestamp: database.command.gte(oneDayAgo).and(database.command.lt(now))
        })
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get()
      if (res.data && res.data.length > 0) {
        lastSleep = res.data[0] as EventRecord
      }
    } catch (e) { console.error('linkSleepAndWake cloud query failed', e) }
  }
  
  // 如果云端未找到或失败，尝试本地查找
  if (!lastSleep) {
    const key = localEventsKey(babyId)
    const list: EventRecord[] = wx.getStorageSync(key) || []
    lastSleep = list.find(e => 
      e.type === 'sleep' && 
      e.timestamp >= oneDayAgo && 
      e.timestamp < now
    ) // list is usually sorted by desc? If not we should sort, but assume default listEvents order
      // localEventsKey storage order is not strictly guaranteed to be desc if we splice, 
      // but `addEvent` does `unshift`. So index 0 is newest.
      // Wait, filterByRange doesn't sort. listEvents sorts.
      // Let's iterate list to find max timestamp < now.
    if (!lastSleep && list.length > 0) {
      // Find the latest sleep before wake
      const candidates = list.filter(e => e.type === 'sleep' && e.timestamp >= oneDayAgo && e.timestamp < now)
      if (candidates.length > 0) {
        // Sort by timestamp desc
        candidates.sort((a, b) => b.timestamp - a.timestamp)
        lastSleep = candidates[0]
      }
    }
  }

  if (lastSleep) {
    // 只有当 sleep 记录还没有 durationMinutes (或者为0) 时才更新
    // 这样避免重复更新，或者覆盖用户手动修改过的值
    if (!lastSleep.durationMinutes || lastSleep.durationMinutes === 0) {
       const diff = Math.round((now - lastSleep.timestamp) / 1000 / 60)
       if (diff > 0) {
         lastSleep.durationMinutes = diff
         await updateEvent(lastSleep)
         wx.showToast({ title: `睡眠时长已记录: ${Math.floor(diff/60)}小时${diff%60}分`, icon: 'none', duration: 3000 })
       }
    }
  }
}

/**
 * 获取事件记录列表
 * 支持按时间范围筛选
 * @param babyId 宝宝ID
 * @param startTs 开始时间戳 (可选)
 * @param endTs 结束时间戳 (可选)
 */
export function listEvents(babyId: string, startTs?: number, endTs?: number): Promise<EventRecord[]> {
  const database = initCloud()
  if (database) {
    // 构建云数据库查询条件
    const where: any = { babyId }
    if (startTs || endTs) {
      where.timestamp = {}
      if (startTs) where.timestamp['$gte'] = startTs
      if (endTs) where.timestamp['$lte'] = endTs
    }
    return database
      .collection('events')
      .where(where)
      .orderBy('timestamp', 'desc')
      .get()
      .then((res: any) => res.data as EventRecord[])
      .catch(() => {
        // 云端获取失败，降级到本地
        const key = localEventsKey(babyId)
        const list: EventRecord[] = wx.getStorageSync(key) || []
        return filterByRange(list, startTs, endTs)
      })
  } else {
    // 本地获取
    const key = localEventsKey(babyId)
    const list: EventRecord[] = wx.getStorageSync(key) || []
    return Promise.resolve(filterByRange(list, startTs, endTs))
  }
}

/**
 * 辅助函数：按时间范围过滤本地数组
 */
function filterByRange(list: EventRecord[], startTs?: number, endTs?: number): EventRecord[] {
  return list.filter((e) => {
    if (startTs && e.timestamp < startTs) return false
    if (endTs && e.timestamp > endTs) return false
    return true
  })
}

/**
 * 监听事件数据变化
 * 支持本地事件总线和云开发实时监听
 * @returns 取消监听的函数
 */
export function watchEvents(babyId: string, onChange: (events: EventRecord[]) => void): () => void {
  const listener = { babyId, callback: onChange }
  listeners.push(listener)
  
  // 初始加载
  listEvents(babyId).then((list) => {
    onChange(list)
  })

  // 如果可用，尝试建立云开发实时监听
  const database = initCloud()
  let cloudWatcher: any = null
  
  if (database && (database as any).watch) {
    try {
      cloudWatcher = (database as any)
        .collection('events')
        .where({ babyId })
        .orderBy('timestamp', 'desc')
        .watch({
          onChange: (snapshot: any) => {
            const events: EventRecord[] = snapshot.docs || []
             onChange(events)
          },
          onError: (_err: any) => {
            // ignore
          },
        })
    } catch (e) {
      // ignore
    }
  }

  // 返回清理函数
  return () => {
    listeners = listeners.filter((l) => l !== listener)
    if (cloudWatcher) {
      try {
        cloudWatcher.close()
      } catch (e) {}
    }
  }
}

/**
 * 格式化时间戳为日期Key (YYYY-MM-DD)
 * 用于统计聚合
 */
export function formatDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return [y, m, day].map((n) => (n < 10 ? `0${n}` : `${n}`)).join('-')
}

/**
 * 聚合指定日期的事件统计数据
 * 计算各类事件的次数和总量
 */
export function aggregateDaily(events: EventRecord[], dateKey: string): StatsSummary {
  const sum: StatsSummary = {
    dateKey,
    feedCount: 0,
    feedMl: 0,
    drinkCount: 0,
    drinkMl: 0,
    peeCount: 0,
    poopCount: 0,
    sleepSessions: 0,
    sleepMinutes: 0,
  }
  events.forEach((e) => {
    switch (e.type) {
      case 'feed':
        sum.feedCount += 1
        sum.feedMl += e.quantity || 0
        break
      case 'drink':
        sum.drinkCount += 1
        sum.drinkMl += e.quantity || 0
        break
      case 'pee':
        sum.peeCount += 1
        break
      case 'poop':
        sum.poopCount += 1
        break
      case 'sleep':
        sum.sleepSessions += 1
        // 兼容可能存在的 duration 字段，并强制转换为数字
        const minutes = Number(e.durationMinutes || (e as any).duration || 0)
        sum.sleepMinutes += isNaN(minutes) ? 0 : minutes
        break
      case 'wake':
        break
    }
  })
  return sum
}

/**
 * 快捷操作按钮定义
 */
export type QuickAction = { type: EventType; label: string }
const QUICK_ACTIONS_PREFIX = `${LOCAL_KEY_PREFIX}quick_actions_`
function quickActionsKey(babyId: string) {
  return `${QUICK_ACTIONS_PREFIX}${babyId}`
}

/**
 * 获取宝宝的快捷操作配置
 * 如果不存在则返回默认配置
 */
export function getQuickActions(babyId: string): QuickAction[] {
  const key = quickActionsKey(babyId)
  const list: QuickAction[] = wx.getStorageSync(key)
  if (Array.isArray(list) && list.length) return list
  // 默认快捷操作配置
  const defaults: QuickAction[] = [
    { type: 'feed', label: '吃奶' },
    { type: 'drink', label: '喝水' },
    { type: 'pee', label: '小便' },
    { type: 'poop', label: '大便' },
    { type: 'sleep', label: '睡觉' },
    { type: 'wake', label: '醒来' },
  ]
  wx.setStorageSync(key, defaults)
  return defaults
}

/**
 * 保存快捷操作配置
 */
export function setQuickActions(babyId: string, actions: QuickAction[]) {
  const key = quickActionsKey(babyId)
  wx.setStorageSync(key, actions)
}

/**
 * 更新事件记录
 * @param rec 需要更新的记录对象
 */
export async function updateEvent(rec: EventRecord): Promise<EventRecord> {
  const database = initCloud()
  const id = rec._id || rec.id
  if (!id) return rec
  
  // 尝试更新云端数据
  if (database && rec._id) {
    try {
      await database.collection('events').doc(rec._id).update({
        data: {
          type: rec.type,
          timestamp: rec.timestamp,
          quantity: rec.quantity,
          durationMinutes: rec.durationMinutes,
          notes: rec.notes,
          updatedAt: Date.now(),
        },
      })
    } catch (e) {}
  }
  
  // 更新本地存储
  // 即使云端更新成功，本地也需要同步更新，或者作为降级方案
  const key = localEventsKey(rec.babyId)
  const list: EventRecord[] = wx.getStorageSync(key) || []
  const idx = list.findIndex((e) => {
    if (rec.id && e.id === rec.id) return true
    if (rec._id && e._id === rec._id) return true
    return false
  })
  if (idx >= 0) {
    const merged: EventRecord = {
      ...list[idx],
      type: rec.type,
      timestamp: rec.timestamp,
      quantity: rec.quantity,
      durationMinutes: rec.durationMinutes,
      notes: rec.notes,
    }
    list[idx] = merged
    wx.setStorageSync(key, list)
  }
  
  notifyListeners(rec.babyId)
  return rec
}

/**
 * 删除事件记录
 * @param babyId 宝宝ID
 * @param idOrCloudId 记录的本地ID或云端ID
 */
export async function deleteEvent(babyId: string, idOrCloudId: string): Promise<void> {
  const database = initCloud()
  let removed = false
  
  // 尝试从云端删除
  if (database) {
    try {
      await database.collection('events').doc(idOrCloudId).remove()
      removed = true
    } catch (e) {}
  }
  
  // 从本地存储删除
  const key = localEventsKey(babyId)
  const list: EventRecord[] = wx.getStorageSync(key) || []
  const filtered = list.filter((e) => e.id !== idOrCloudId && e._id !== idOrCloudId)
  if (filtered.length !== list.length) {
    wx.setStorageSync(key, filtered)
    removed = true
  }
  
  if (removed) {
    notifyListeners(babyId)
  }
}

