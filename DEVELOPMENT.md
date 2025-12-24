# 宝宝记录 (Baby Tracker) 开发文档

本项目是一个基于微信小程序的宝宝成长记录应用，旨在帮助家长轻松记录宝宝的日常活动（如喂奶、睡眠、排泄等），并提供数据统计和多宝宝管理功能。

## 目录结构

```
miniprogram/
├── pages/                  # 页面模块
│   ├── tracker/            # 首页/记录页
│   ├── stats/              # 统计页
│   └── profile/            # 个人中心/宝宝管理页
├── utils/                  # 工具类
│   ├── storage.ts          # 核心数据逻辑与存储
│   └── util.ts             # 通用辅助函数
├── app.ts                  # 小程序入口
└── app.json                # 全局配置
```

## 核心模块说明

### 1. 记录模块 (Tracker)
**路径**: `pages/tracker/`
**主要用途**:
- **日常记录**: 提供快捷按钮记录宝宝行为（吃奶、睡觉、排泄等）。
- **时间轴展示**: 以倒序列表形式展示最近的记录。
- **快速操作**: 支持自定义快捷操作按钮的排序。
- **数据联动**: 监听全局当前宝宝 ID 变化，自动切换数据显示。

**关键功能**:
- `startWatch()`: 启动数据监听，实时更新列表。
- `commitEvent()`: 提交新的记录数据。
- `getQuickActions`/`setQuickActions`: 管理快捷按钮配置。

### 2. 统计模块 (Stats)
**路径**: `pages/stats/`
**主要用途**:
- **今日概览**: 聚合展示当天的关键数据（如总奶量、睡眠时长）。
- **历史趋势**: 展示最近 7 天的数据统计。
- **每日明细**: 点击单日卡片可查看当天的完整记录列表。

**关键功能**:
- `aggregateDaily()`: 计算每日的统计摘要。
- `viewDayDetail()`: 弹窗展示特定日期的详细记录。

### 3. 宝宝管理模块 (Profile)
**路径**: `pages/profile/`
**主要用途**:
- **多宝宝管理**: 支持创建、编辑、删除宝宝档案。
- **切换当前宝宝**: 在不同宝宝记录之间快速切换，全局生效。
- **数据隔离**: 所有的记录和统计均基于当前选中的宝宝 ID 进行隔离。

**关键功能**:
- `listBabies()`: 获取宝宝列表。
- `upsertBaby()`: 新增或更新宝宝信息。
- `setCurrentBabyId()`: 设置当前活跃的宝宝 ID。

### 4. 数据核心 (Storage Utils)
**路径**: `utils/storage.ts`
**主要用途**:
- **本地存储**: 封装 `wx.setStorage`/`wx.getStorage`，管理所有本地数据。
- **云端同步 (预留)**: 包含云开发初始化逻辑 (`initCloud`)，支持云端/本地降级策略。
- **事件总线**: 实现了简单的发布/订阅模式 (`watchEvents`, `notifyListeners`)，确保数据更新时各页面实时刷新。

**核心函数**:
- `addEvent`/`updateEvent`/`deleteEvent`: 记录的增删改查。
- `listBabies`/`deleteBabyById`: 宝宝档案管理。
- `watchEvents`: 页面订阅数据变化。

## 数据模型

### 事件记录 (EventRecord)
```typescript
interface EventRecord {
  id?: string       // 本地 ID
  _id?: string      // 云端 ID
  babyId: string    // 关联的宝宝 ID
  type: EventType   // 类型：feed, sleep, poop, etc.
  timestamp: number // 发生时间
  quantity?: number // 数量 (如毫升)
  durationMinutes?: number // 持续时长 (如睡眠分钟)
  notes?: string    // 备注
}
```

### 宝宝档案 (BabyProfile)
```typescript
interface BabyProfile {
  id: string        // 唯一标识 (共享码)
  name: string      // 昵称
  avatarUrl?: string // 头像路径
}
```

## 交互设计亮点
- **卡片式布局**: 统一采用圆角卡片设计，提升视觉体验。
- **实时响应**: 修改数据后，通过事件总线自动刷新所有相关页面，无需手动刷新。
- **容错处理**: 网络异常或云端失败时自动降级使用本地存储。
