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
  _id?: string       // 云数据库自动生成的ID (作为唯一标识)
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
  // If no baby is selected, try to find the first one
  const babies = listBabies()
  if (babies.length > 0) {
    const firstId = babies[0].id
    wx.setStorageSync(CURRENT_BABY_KEY, firstId)
    return firstId
  }
  return ''
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
  _id?: string        // Cloud DB ID
  _openid?: string    // Creator OpenID
  id: string          // 唯一标识 (通常为共享码)
  name: string        // 昵称
  avatarUrl?: string  // 头像地址
  gender?: 'boy' | 'girl' // 性别
  birthday?: string   // 出生日期 YYYY-MM-DD
  role?: 'owner' | 'member' // 用户角色 (本地计算字段)
  creatorInfo?: {             // 创建者信息 (用于展示)
    nickName: string
    avatarUrl: string
  }
  isDeleted?: boolean // 软删除标记
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
        birthday: b.birthday,
        role: b.role || 'owner', // 默认为owner (兼容旧数据：旧数据都是创建者生成的)
        _openid: b._openid,
        creatorInfo: b.creatorInfo
      })
    })
  }
  // Remove default baby creation logic to allow empty state
  // if (list.length) return list
  // const defaults: BabyProfile[] = [{ id: 'default', name: '默认宝宝', role: 'owner' }]
  // wx.setStorageSync(BABIES_KEY, defaults)
  // return defaults
  return list
}

/**
 * 保存宝宝列表到本地缓存
 */
export function saveBabies(babies: BabyProfile[]) {
  wx.setStorageSync(BABIES_KEY, babies)
}

/**
 * 仅更新本地宝宝信息 (不同步云端)
 */
export function updateLocalBaby(baby: BabyProfile) {
  const list = listBabies()
  const idx = list.findIndex((b) => b.id === baby.id)
  
  if (idx >= 0) {
    // 保留原有的 role
    const existingRole = list[idx].role || 'owner' // 如果原有role不存在，说明是老数据(owner)
    list[idx] = { 
      ...list[idx], 
      ...baby,
      role: existingRole // 优先使用本地已有的role，防止被覆盖
    }
    // 如果 baby.role 显式存在且不同 (例如重新 joinFamily 更新权限)，则可以考虑覆盖，但一般 joinFamily 会走 push 逻辑或者 distinct 逻辑
    // 简单起见，本地 role 优先级最高，除非显式重置
    if (baby.role) {
       list[idx].role = baby.role
    }
  } else {
    // 新增宝宝，如果是通过邀请加入的，通常是 member
    // 如果是新建的，upsertBaby 会处理
    list.push({ ...baby, role: baby.role || 'member' })
  }
  saveBabies(list)
}

/**
 * 新增或更新宝宝信息
 * 优先同步云端，同时更新本地缓存
 * @returns boolean 云端同步是否成功
 */
export async function upsertBaby(baby: BabyProfile): Promise<boolean> {
  // 1. 本地更新
  // 如果是新建(本地不存在)，则默认为 owner
  const list = listBabies()
  const exists = list.find(b => b.id === baby.id)
  if (!exists) {
    baby.role = 'owner'
  }
  updateLocalBaby(baby)

  // 2. 云端同步
  const db = initCloud()
  if (db) {
    try {
      // 使用 set 覆写，确保云端与本地一致
      // 注意：需要确保数据库权限允许写入
      // 不将 role 字段存入云端 data 字段，因为它是由 _openid 决定的
      // 但是为了简化，我们只存基本信息
      const { role, ...cloudData } = baby
      await db.collection('babies').doc(baby.id).set({
        data: {
          ...cloudData,
          isDeleted: false, // 确保恢复/新建时未删除
          updatedAt: Date.now()
        }
      })
      return true
    } catch (e) {
      console.error('[Cloud] Sync baby failed:', e)
      return false
    }
  }
  return false
}

/**
 * 软删除宝宝 (标记为已删除)
 * 仅限创建者调用
 */
export async function softDeleteBaby(babyId: string): Promise<boolean> {
  const db = initCloud()
  if (!db) return false
  try {
    await db.collection('babies').doc(babyId).update({
      data: {
        isDeleted: true,
        updatedAt: Date.now()
      }
    })
    // 本地也删除
    deleteBabyById(babyId)
    return true
  } catch (e) {
    console.error('[Cloud] Soft delete failed:', e)
    return false
  }
}

/**
 * 同步所有宝宝的最新信息
 * 从云端拉取最新数据更新本地缓存
 */
export async function syncBabies() {
  const db = initCloud()
  if (!db) return

  const babies = listBabies()
  
  // 1. 同步用户创建的宝宝 (Owner)
  // 获取云端该用户创建的所有宝宝
  try {
    const res = await db.collection('babies').where({
       _openid: '{openid}' // 自动匹配当前用户
    }).get()
    
    if (res.data) {
       const cloudMyBabies = res.data as BabyProfile[]
       
       // 更新或添加本地 (过滤掉已删除的)
       cloudMyBabies.forEach(b => {
          if (b.isDeleted) return
          // 确保 role 正确
          updateLocalBaby({ ...b, role: 'owner' })
       })
       
       // 检查本地是 owner 但云端不存在或已标记删除的 -> 本地移除
       const localOwners = babies.filter(b => b.role === 'owner')
       localOwners.forEach(local => {
          const cloudBaby = cloudMyBabies.find(cloud => cloud.id === local.id)
          if (!cloudBaby || cloudBaby.isDeleted) {
             deleteBabyById(local.id)
          }
       })
    }
  } catch (e) {
    console.warn('[Cloud] Sync owned babies failed:', e)
  }

  // 2. 同步作为成员加入的宝宝 (Member)
  // 对于 Member 角色，逐个检查存在性
  const members = listBabies().filter(b => b.role === 'member')
  const memberTasks = members.map(async (b) => {
      try {
        const res = await db.collection('babies').doc(b.id).get()
        const data = res.data as BabyProfile
        if (data) {
          if (data.isDeleted) {
             console.log(`[Cloud] Baby ${b.id} is deleted, removing locally`)
             deleteBabyById(b.id)
          } else {
             updateLocalBaby(data)
          }
        }
      } catch (e: any) {
        // 如果明确是记录不存在，则本地删除
        const errStr = e.message || e.errMsg || JSON.stringify(e)
        if (errStr.includes('document not found') || errStr.includes('does not exist') || e.errCode === -1) {
           console.log(`[Cloud] Baby ${b.id} not found, removing locally`)
           deleteBabyById(b.id)
        } else {
           console.warn(`[Cloud] Sync member baby ${b.id} failed:`, e)
        }
      }
  })
  
  await Promise.all(memberTasks)
}

/**
 * 通过共享码（即BabyID）加入家庭
 * 从云端拉取宝宝档案并保存到本地
 */
export async function joinFamily(shareCode: string): Promise<boolean> {
  const db = initCloud()
  if (!db) {
    throw new Error('云服务未连接')
  }

  try {
    // 1. 尝试从云端获取
    const res = await db.collection('babies').doc(shareCode).get()
    const baby = res.data as BabyProfile

    // 2. 保存到本地
    // 显式标记为 member
    const babyWithRole = { ...baby, role: 'member' } as BabyProfile
    updateLocalBaby(babyWithRole)
    
    // 3. 切换为当前宝宝
    setCurrentBabyId(baby.id)
    return true
  } catch (e) {
    console.error('[Cloud] Join family failed:', e)
    return false
  }
}

/**
 * 生成随机6位数字共享码
 */
export function generateShareCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * 邀请码信息接口
 */
export interface InvitationCode {
  _id?: string
  code: string        // 6位随机码
  babyId: string      // 关联的真实BabyID
  expiresAt: number   // 过期时间戳
  status: 'active' | 'used' | 'expired'
  createdBy?: string  // 创建人openid
}

/**
 * 加入请求接口
 */
export interface JoinRequest {
  _id?: string
  babyId: string
  userId: string      // 申请人openid
  userInfo: {
    nickName: string
    avatarUrl: string
  }
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

/**
 * 创建临时邀请码 (有效期30分钟)
 */
export async function createInvitation(babyId: string): Promise<string> {
  const db = initCloud()
  if (!db) throw new Error('需联网生成邀请码')

  const code = generateShareCode()
  const expiresAt = Date.now() + 30 * 60 * 1000 // 30 minutes

  try {
    await db.collection('invitations').add({
      data: {
        code,
        babyId,
        expiresAt,
        status: 'active',
        createdAt: Date.now()
      }
    })
    return code
  } catch (e: any) {
    console.error('Create invitation failed:', e)
    const errStr = e.message || e.errMsg || JSON.stringify(e)
    throw new Error(`生成邀请码失败: ${errStr}`)
  }
}

/**
 * 验证邀请码并直接加入家庭 (简化流程：无需审核)
 * 验证通过后，直接在 join_requests 表中插入 approved 记录，并返回宝宝信息供本地保存
 */
export async function confirmJoinFamily(code: string, userInfo: { nickName: string, avatarUrl: string }): Promise<{ success: boolean, message: string, baby?: BabyProfile }> {
  const db = initCloud()
  if (!db) throw new Error('需联网加入')

  try {
    // 1. 验证邀请码
    const res = await db.collection('invitations')
      .where({
        code,
        status: 'active',
        expiresAt: db.command.gt(Date.now())
      })
      .get()

    if (!res.data || res.data.length === 0) {
      return { success: false, message: '邀请码无效或已过期' }
    }
    
    const invite = res.data[0] as InvitationCode
    const babyId = invite.babyId

    // 2. 获取宝宝详细信息
    const babyRes = await db.collection('babies').doc(babyId).get()
    if (!babyRes.data) {
      return { success: false, message: '宝宝信息不存在' }
    }
    const baby = babyRes.data as BabyProfile

    // 3. 检查是否已经加入过
    // 简化处理：查询 join_requests 是否已有记录 (不区分 pending/approved，只要有记录就算加入过)
    const existing = await db.collection('join_requests')
      .where({
        babyId,
        // _openid: '{openid}' // 隐式条件
      })
      .get()

    if (existing.data.length > 0) {
       // 已经加入过了，直接返回成功，并在本地更新宝宝信息
       return { success: true, message: '您已加入该家庭', baby }
    }

    // 4. 插入加入记录 (状态直接为 approved)
    await db.collection('join_requests').add({
      data: {
        babyId,
        userInfo,
        status: 'approved', // 直接通过
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    })

    return { success: true, message: '加入家庭成功', baby }
  } catch (e: any) {
    console.error('Confirm join failed:', e)
    const errStr = e.message || e.errMsg || JSON.stringify(e)
    let msg = `加入失败: ${errStr}`
    
    // 权限提示
    if (errStr.includes('permission') || errStr.includes('do not exist')) {
       msg = '加入失败: 请联系管理员将云数据库 join_requests 集合权限设置为“所有用户可读写”'
    }
    return { success: false, message: msg }
  }
}

/**
 * 获取待审核的加入请求 (管理员视角)
 */
export async function listPendingRequests(babyId: string): Promise<JoinRequest[]> {
  const db = initCloud()
  if (!db) return []

  try {
    const res = await db.collection('join_requests')
      .where({
        babyId,
        status: 'pending'
      })
      .orderBy('createdAt', 'desc')
      .get()
    return res.data as JoinRequest[]
  } catch (e: any) {
    console.error('List pending requests failed:', e)
    // 抛出错误以便 UI 层捕获并提示权限问题
    throw e
  }
}

/**
 * 获取家庭成员列表 (已加入的)
 */
export async function listFamilyMembers(babyId: string): Promise<JoinRequest[]> {
  const db = initCloud()
  if (!db) return []

  try {
    const res = await db.collection('join_requests')
      .where({
        babyId,
        status: 'approved'
      })
      .orderBy('updatedAt', 'desc')
      .get()
    return res.data as JoinRequest[]
  } catch (e) {
    console.error('List family members failed:', e)
    throw e
  }
}

/**
 * 处理加入请求 (通过/拒绝)
 */
export async function handleJoinRequest(requestId: string, action: 'approve' | 'reject'): Promise<void> {
  const db = initCloud()
  if (!db) return

  try {
    await db.collection('join_requests').doc(requestId).update({
      data: {
        status: action === 'approve' ? 'approved' : 'rejected',
        updatedAt: Date.now()
      }
    })
  } catch (e: any) {
    console.error('Handle request failed:', e)
    const errStr = e.message || e.errMsg || JSON.stringify(e)
    if (errStr.includes('permission')) {
        throw new Error('操作失败: 权限不足，请确保 join_requests 集合允许所有用户读写')
    }
    throw new Error(`操作失败: ${errStr}`)
  }
}

/**
 * 检查我的申请状态 (被邀请人视角)
 * 如果有已通过的申请，自动加入家庭
 */
export async function checkMyJoinStatus(): Promise<boolean> {
  const db = initCloud()
  if (!db) return false

  try {
    const res = await db.collection('join_requests')
      .where({
        status: 'approved'
        // _openid implicit
      })
      .get()

    if (res.data.length > 0) {
      let newJoin = false
      for (const req of res.data) {
        const r = req as JoinRequest
        // 获取宝宝信息并保存
        const babyRes = await db.collection('babies').doc(r.babyId).get()
        if (babyRes.data) {
           updateLocalBaby(babyRes.data as BabyProfile)
           // 标记请求已处理 (防止重复拉取? 或者我们只看本地是否已有)
           // 实际上 updateLocalBaby 是幂等的
           newJoin = true
        }
        
        // 可选：将请求标记为 'processed' 或直接删除，以免每次都查
        // 这里简单起见，暂不修改，因为查询量不大
      }
      return newJoin
    }
  } catch (e) {}
  return false
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
 * 必须联网
 */
export async function addGrowthRecord(rec: GrowthRecord): Promise<GrowthRecord> {
  const database = initCloud()
  if (!database) throw new Error('需联网使用')

  const toSave = { ...rec }
  
  try {
    const res = await database.collection('growth').add({
      data: {
        ...toSave,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    })
    toSave.id = String(res._id)

    // Update Cache
    const key = localGrowthKey(rec.babyId)
    const list: GrowthRecord[] = wx.getStorageSync(key) || []
    list.unshift(toSave)
    list.sort((a, b) => b.date.localeCompare(a.date))
    wx.setStorageSync(key, list)

    return toSave
  } catch (e) {
    throw new Error('保存失败，请检查网络')
  }
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
 * 必须联网
 */
export async function addMilestone(rec: MilestoneRecord): Promise<MilestoneRecord> {
  const database = initCloud()
  if (!database) throw new Error('需联网使用')

  const toSave = { ...rec }
  
  try {
    const res = await database.collection('milestones').add({
      data: {
        ...toSave,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    })
    toSave.id = String(res._id)

    // Update Cache
    const key = localMilestonesKey(rec.babyId)
    const list: MilestoneRecord[] = wx.getStorageSync(key) || []
    list.unshift(toSave)
    list.sort((a, b) => b.date.localeCompare(a.date))
    wx.setStorageSync(key, list)
    
    return toSave
  } catch (e) {
    throw new Error('保存失败，请检查网络')
  }
}


/**
 * 退出家庭 (被邀请人)
 * 删除 join_requests 中的记录，并从本地移除
 */
export async function exitFamily(babyId: string): Promise<boolean> {
  const db = initCloud()
  
  try {
    // 1. 尝试从云端删除申请记录
    if (db) {
      // 小程序端 remove 必须使用 docId，不能直接 where().remove()
      const res = await db.collection('join_requests').where({
        babyId: babyId
        // _openid: 隐式包含当前用户
      }).get()

      if (res.data && res.data.length > 0) {
        const removeTasks = res.data.map(item => 
           db.collection('join_requests').doc(String(item._id)).remove()
        )
        await Promise.all(removeTasks)
      }
    }
    
    // 2. 本地移除
    deleteBabyById(babyId)
    return true
  } catch (e) {
    console.error('Exit family failed:', e)
    return false
  }
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
 * 必须联网存储，写入成功后更新本地缓存
 */
export async function addEvent(rec: EventRecord): Promise<EventRecord> {
  const database = initCloud()
  if (!database) {
    throw new Error('需要联网才能添加记录')
  }

  const toSave: EventRecord = { ...rec }
  
  // 尝试云端存储
  try {
    const res = await database.collection('events').add({
      data: {
        ...toSave,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    })
    toSave._id = String(res._id)
    
    // 写入成功后，更新本地缓存 (Cache Aside)
    // 注意：这里我们不再作为"数据源"，而是作为"读缓存"
    const key = localEventsKey(rec.babyId)
    const list: EventRecord[] = wx.getStorageSync(key) || []
    list.unshift(toSave)
    wx.setStorageSync(key, list)
    
    // 触发数据更新通知
    notifyListeners(rec.babyId)
    return toSave
  } catch (e) {
    console.error('[Cloud] Add event failed:', e)
    throw new Error('添加失败，请检查网络')
  }
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
  if (!rec._id) return rec // 必须有云端ID才能更新
  
  // 尝试更新云端数据
  if (database) {
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
    } catch (e) {
      console.error('[Cloud] Update event failed:', e)
      throw new Error('更新失败，请检查网络')
    }
  }
  
  // 更新本地存储 (Cache Update)
  const key = localEventsKey(rec.babyId)
  const list: EventRecord[] = wx.getStorageSync(key) || []
  const idx = list.findIndex((e) => e._id === rec._id)
  
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
 * @param _id 云端ID
 */
export async function deleteEvent(babyId: string, _id: string): Promise<void> {
  const database = initCloud()
  if (!database) throw new Error('需联网删除')
  
  // 尝试从云端删除
  try {
    await database.collection('events').doc(_id).remove()
  } catch (e) {
    throw new Error('删除失败，请检查网络')
  }
  
  // 从本地存储删除
  const key = localEventsKey(babyId)
  const list: EventRecord[] = wx.getStorageSync(key) || []
  const filtered = list.filter((e) => e._id !== _id)
  if (filtered.length !== list.length) {
    wx.setStorageSync(key, filtered)
  }
  
  notifyListeners(babyId)
}

