import { Context, Logger, Schema } from 'koishi'
import { SklandHelper } from './Helpers/SklandHelper'

export const name = 'skland-sign'
// 需要 database 服务来存储用户 Token
export const inject = {
  required: ['database'],
  optional: []
}

export interface Config {
  maxRetries: number
  signTime: string
}

export const Config: Schema<Config> = Schema.object({
  maxRetries: Schema.number()
    .default(3)
    .description('网络请求最大重试次数'),
  signTime: Schema.string()
    .default('18:00')
    .pattern(/^\d{2}:\d{2}$/)
    .description('自动签到时间 (HH:mm)'),
})

// 扩展 Koishi 的 User 接口
declare module 'koishi' {
  interface User {
    sklandToken: string
    sklandAutoSign: boolean
  }
}

export async function apply(ctx: Context, config: Config) {
  const logger = new Logger(name)

  // 扩展数据库 user 表
  ctx.model.extend('user', {
    sklandToken: 'text',
    sklandAutoSign: { type: 'boolean', initial: false },
  })

  // 自动签到核心逻辑
  const runAutoSign = async () => {
    logger.info('开始执行自动签到任务...')
    // 查找所有有了Token且开启了自动签到的用户
    // 注意：这里 user 的类型由 ctx.model.extend 定义，但查询时我们主要需要 id 和 sklandToken
    const users = await ctx.database.get('user', {
      sklandAutoSign: true,
    })

    logger.info(`找到 ${users.length} 个待签到用户`)

    for (const user of users) {
      if (!user.sklandToken) continue

      try {
        // 执行签到
        const userConfig = { ...config, tokens: [user.sklandToken] }
        const sklandHelper = new SklandHelper(ctx, userConfig, logger)
        const results = await sklandHelper.doSignForAllTokens()
        const message = `[自动签到] 森空岛签到报告：\n${results.join('\n')}`

        // 尝试发送私聊通知
        // 需要查找该用户的绑定信息来确定发送给哪个平台
        const bindings = await ctx.database.get('binding', { aid: user.id })

        let sent = false
        for (const binding of bindings) {
          const bot = ctx.bots.find(b => b.platform === binding.platform)
          if (bot) {
            try {
              await bot.sendPrivateMessage(binding.pid, message)
              sent = true
              logger.debug(`已向用户 ${user.id} (${binding.platform}) 发送通知`)
              break // 发送成功一个即可
            } catch (e) {
              logger.warn(`向用户 ${user.id} 发送通知失败:`, e)
            }
          }
        }
        if (!sent) {
          logger.warn(`用户 ${user.id} 签到成功但未能发送通知 (未找到可用 Bot 或发送失败)`)
        }

      } catch (error) {
        logger.error(`用户 ${user.id} 自动签到时发生错误:`, error)
      }
    }
    logger.info('自动签到任务执行完毕')
  }

  // 定时器逻辑
  let lastRunDate = ''
  ctx.setInterval(() => {
    const now = new Date()
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const today = now.toDateString()

    // 如果时间匹配且今天还没运行过
    if (nowTime === config.signTime && lastRunDate !== today) {
      lastRunDate = today
      // 异步执行，不阻塞定时器
      runAutoSign()
    }
  }, 30 * 1000) // 每半分钟检查一次

  // 手动签到命令
  ctx.command('skland.sign', '森空岛签到')
    .alias('森空岛签到')
    .userFields(['sklandToken'])
    .action(async ({ session }) => {
      const token = session.user.sklandToken
      if (!token) {
        return '你还没有绑定森空岛Token，请使用 skland.add <token> 进行绑定。'
      }

      try {
        await session.send('正在为您执行签到...')
        const userConfig = { ...config, tokens: [token] }
        const sklandHelper = new SklandHelper(ctx, userConfig, logger)

        const results = await sklandHelper.doSignForAllTokens()
        return results.join('\n')
      } catch (error) {
        logger.error('签到失败:', error)
        return '签到失败，请检查 Token 是否过期'
      }
    })

  // 添加Token命令
  ctx.command('skland.add <token:string>', '绑定森空岛Token')
    .userFields(['sklandToken'])
    .action(async ({ session }, token) => {
      if (!token) return '请提供Token'
      session.user.sklandToken = token
      await session.user.$update()
      return 'Token已成功绑定！您可以发送“森空岛签到”来签到。'
    })

  // 自动签到开关命令
  ctx.command('skland.auto [switch:text]', '开启/关闭自动签到 (on/off)')
    .userFields(['sklandAutoSign', 'sklandToken'])
    .action(async ({ session }, switchStr) => {
      if (!session.user.sklandToken) {
        return '请先绑定 Token 再开启自动签到。'
      }

      if (switchStr === 'on' || switchStr === '开启') {
        session.user.sklandAutoSign = true
        await session.user.$update()
        return `自动签到已开启！将在每天 ${config.signTime} 执行。`
      } else if (switchStr === 'off' || switchStr === '关闭') {
        session.user.sklandAutoSign = false
        await session.user.$update()
        return '自动签到已关闭。'
      } else {
        // 如果没有参数，显示当前状态
        const state = session.user.sklandAutoSign ? '开启' : '关闭'
        return `当前自动签到状态：${state}。\n发送 "skland.auto on" 开启，"skland.auto off" 关闭。`
      }
    })

  // 查看签到状态
  ctx.command('skland.status', '查看签到状态')
    .alias('签到状态')
    .userFields(['sklandToken', 'sklandAutoSign'])
    .action(async ({ session }) => {
      const { sklandToken, sklandAutoSign } = session.user
      let msg = ''
      if (sklandToken) {
        msg += '您已绑定森空岛 Token。\n'
        msg += `自动签到：${sklandAutoSign ? '已开启' : '已关闭'} (每日 ${config.signTime})`
      } else {
        msg += '您尚未绑定 Token。'
      }
      return msg
    })

  logger.info('森空岛签到插件已加载')
}