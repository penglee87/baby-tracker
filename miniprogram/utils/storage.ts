export type EventType = 'feed' | 'drink' | 'pee' | 'poop' | 'sleep' | 'wake'

export interface EventRecord {
  _id?: string
  id?: string
  babyId: string
  type: EventType
  timestamp: number
  quantity?: number
  durationMinutes?: number
  notes?: string
  createdBy?: string
}

export interface StatsSummary {
  dateKey: string
  feedCount: number
  feedMl: number
  drinkCount: number
  drinkMl: number
  peeCount: number
  poopCount: number
  sleepSessions: number
  sleepMinutes: number
}

let db: WechatMiniprogram.Cloud.Database | null = null
let cloudInitialized = false

export function initCloud() {
  if (cloudInitialized) return db
  if ((wx as any).cloud) {
    try {
      ;(wx as any).cloud.init({})
      db = (wx as any).cloud.database()
    } catch (e) {
      db = null
    }
  } else {
    db = null
  }
  cloudInitialized = true
  return db
}

const LOCAL_KEY_PREFIX = 'baby_tracker_'
const CURRENT_BABY_KEY = `${LOCAL_KEY_PREFIX}current_baby`

export function getCurrentBabyId(): string {
  const id = wx.getStorageSync(CURRENT_BABY_KEY)
  if (id) return id
  const defaultId = 'default'
  wx.setStorageSync(CURRENT_BABY_KEY, defaultId)
  return defaultId
}

export function setCurrentBabyId(id: string) {
  wx.setStorageSync(CURRENT_BABY_KEY, id)
}

export type BabyProfile = {
  id: string
  name: string
  avatarUrl?: string
}

const BABIES_KEY = `${LOCAL_KEY_PREFIX}babies`

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
      list.push({ id, name: b.name || '未命名宝宝', avatarUrl: b.avatarUrl || '' })
    })
  }
  if (list.length) return list
  const defaults: BabyProfile[] = [{ id: 'default', name: '默认宝宝' }]
  wx.setStorageSync(BABIES_KEY, defaults)
  return defaults
}

export function saveBabies(babies: BabyProfile[]) {
  wx.setStorageSync(BABIES_KEY, babies)
}

export function upsertBaby(baby: BabyProfile) {
  const list = listBabies()
  const idx = list.findIndex((b) => b.id === baby.id)
  if (idx >= 0) {
    list[idx] = { ...list[idx], name: baby.name, avatarUrl: baby.avatarUrl }
  } else {
    list.push({ id: baby.id, name: baby.name, avatarUrl: baby.avatarUrl })
  }
  saveBabies(list)
}

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

function localEventsKey(babyId: string) {
  return `${LOCAL_KEY_PREFIX}events_${babyId}`
}


type Listener = {
  babyId: string
  callback: (events: EventRecord[]) => void
}

let listeners: Listener[] = []

function notifyListeners(babyId: string) {
  listEvents(babyId).then((list) => {
    listeners.forEach((l) => {
      if (l.babyId === babyId) {
        l.callback(list)
      }
    })
  })
}

export async function addEvent(rec: EventRecord): Promise<EventRecord> {
  const database = initCloud()
  const toSave: EventRecord = { ...rec }
  let saved = false
  
  if (database) {
    try {
      const res = await database.collection('events').add({
        data: {
          ...toSave,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })
      toSave._id = res._id
      saved = true
    } catch (e) {
      // fallback to local
    }
  }
  
  if (!saved) {
    const key = localEventsKey(rec.babyId)
    const list: EventRecord[] = wx.getStorageSync(key) || []
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    toSave.id = id
    list.unshift(toSave)
    wx.setStorageSync(key, list)
  }
  
  notifyListeners(rec.babyId)
  return toSave
}

export function listEvents(babyId: string, startTs?: number, endTs?: number): Promise<EventRecord[]> {
  const database = initCloud()
  if (database) {
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
        const key = localEventsKey(babyId)
        const list: EventRecord[] = wx.getStorageSync(key) || []
        return filterByRange(list, startTs, endTs)
      })
  } else {
    const key = localEventsKey(babyId)
    const list: EventRecord[] = wx.getStorageSync(key) || []
    return Promise.resolve(filterByRange(list, startTs, endTs))
  }
}

function filterByRange(list: EventRecord[], startTs?: number, endTs?: number): EventRecord[] {
  return list.filter((e) => {
    if (startTs && e.timestamp < startTs) return false
    if (endTs && e.timestamp > endTs) return false
    return true
  })
}

export function watchEvents(babyId: string, onChange: (events: EventRecord[]) => void): () => void {
  const listener = { babyId, callback: onChange }
  listeners.push(listener)
  
  // Initial fetch
  listEvents(babyId).then((list) => {
    onChange(list)
  })

  // Also try to set up cloud watcher if available
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
            // Notify this specific listener directly from cloud data
            // Or just call notifyListeners to refresh everyone
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

  return () => {
    listeners = listeners.filter((l) => l !== listener)
    if (cloudWatcher) {
      try {
        cloudWatcher.close()
      } catch (e) {}
    }
  }
}

export function formatDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return [y, m, day].map((n) => (n < 10 ? `0${n}` : `${n}`)).join('-')
}

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
        sum.sleepMinutes += e.durationMinutes || 0
        break
      case 'wake':
        break
    }
  })
  return sum
}

export type QuickAction = { type: EventType; label: string }
const QUICK_ACTIONS_PREFIX = `${LOCAL_KEY_PREFIX}quick_actions_`
function quickActionsKey(babyId: string) {
  return `${QUICK_ACTIONS_PREFIX}${babyId}`
}
export function getQuickActions(babyId: string): QuickAction[] {
  const key = quickActionsKey(babyId)
  const list: QuickAction[] = wx.getStorageSync(key)
  if (Array.isArray(list) && list.length) return list
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
export function setQuickActions(babyId: string, actions: QuickAction[]) {
  const key = quickActionsKey(babyId)
  wx.setStorageSync(key, actions)
}

export async function updateEvent(rec: EventRecord): Promise<EventRecord> {
  const database = initCloud()
  const id = rec._id || rec.id
  if (!id) return rec
  let updated = false
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
      updated = true
    } catch (e) {}
  }
  if (!updated) {
    const key = localEventsKey(rec.babyId)
    const list: EventRecord[] = wx.getStorageSync(key) || []
    const idx = list.findIndex((e) => e.id === rec.id || e._id === rec._id)
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
  }
  notifyListeners(rec.babyId)
  return rec
}

export async function deleteEvent(babyId: string, idOrCloudId: string): Promise<void> {
  const database = initCloud()
  let removed = false
  if (database) {
    try {
      await database.collection('events').doc(idOrCloudId).remove()
      removed = true
    } catch (e) {}
  }
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

