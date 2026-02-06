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
    sklandPlatform: string
    sklandUserId: string
    sklandGuildId: string
  }
}

export async function apply(ctx: Context, config: Config) {
  const logger = new Logger(name)

  // 辅助函数：根据是否私聊环境选择发送方式
  const sendMessage = async (session: any, message: string) => {
    if (session.isDirect) {
      await session.bot.sendPrivateMessage(session.userId, message)
    } else {
      await session.send(message)
    }
  }

  // 扩展数据库 user 表
  ctx.model.extend('user', {
    sklandToken: 'text',
    sklandAutoSign: { type: 'boolean', initial: false },
    sklandPlatform: 'string',
    sklandUserId: 'string',
    sklandGuildId: 'string',
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
        // 使用存储在 User 表中的平台信息直接发送
        if (user.sklandPlatform && user.sklandUserId) {
          const bot = ctx.bots.find(b => b.platform === user.sklandPlatform)
          if (bot) {
            try {
              await bot.sendPrivateMessage(user.sklandUserId, message)
              logger.debug(`已向用户 ${user.sklandUserId} (${user.sklandPlatform}) 发送通知`)
            } catch (e) {
              logger.warn(`向用户 ${user.sklandUserId} 发送通知失败:`, e)
            }
          } else {
            logger.warn(`用户 ${user.sklandUserId} 签到成功但未找到平台 ${user.sklandPlatform} 的 Bot`)
          }
        } else {
          logger.warn(`用户 ${user.sklandUserId} 签到成功但缺少平台绑定信息 (Platform/UserId)`)
        }

      } catch (error) {
        logger.error(`用户 ${user.sklandUserId} 自动签到时发生错误:`, error)
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
      if (!session?.user) return '用户数据不存在'
      const token = session.user.sklandToken
      if (!token) {
        return sendMessage(session, '你还没有绑定森空岛Token，请使用 skland.add <token> 进行绑定。')
      }

      try {
        await sendMessage(session, '正在为您执行签到...')
        const userConfig = { ...config, tokens: [token] }
        const sklandHelper = new SklandHelper(ctx, userConfig, logger)

        const results = await sklandHelper.doSignForAllTokens()
        return sendMessage(session, results.join('\n'))
      } catch (error) {
        logger.error('签到失败:', error)
        return sendMessage(session, '签到失败，请检查 Token 是否过期')
      }
    })

  // 添加Token命令
  ctx.command('skland.add <token:string>', '绑定森空岛Token')
    .userFields(['sklandToken', 'sklandPlatform', 'sklandUserId', 'sklandGuildId'])
    .action(async ({ session }, token) => {
      if (!session?.user) return sendMessage(session, '用户数据不存在')
      if (!token) {
        return sendMessage(session, [
          '请提供Token。获取步骤如下：',
          '1. 登陆森空岛：https://www.skland.com/login',
          '2. 获取token：https://web-api.skland.com/account/info/hg',
          '   (复制返回内容 {"content":"XXX"} 中的 XXX 部分)',
          '3. 私聊Bot或在当前会话发送（在群里记得撤回）：skland.add XXX'
        ].join('\n'))
      }

      session.user.sklandToken = token
      // 存储当前绑定的上下文信息
      session.user.sklandPlatform = session.platform
      session.user.sklandUserId = session.userId
      session.user.sklandGuildId = session.guildId

      await session.user.$update()
      return sendMessage(session, 'Token已成功绑定！自动签到通知将发送至当前账号。您可以发送“森空岛签到”来签到。')
    })

  // 自动签到开关命令
  ctx.command('skland.auto [switch:text]', '开启/关闭自动签到 (on/off)')
    .userFields(['sklandAutoSign', 'sklandToken'])
    .action(async ({ session }, switchStr) => {
      if (!session?.user) return '用户数据不存在'
      if (!session.user.sklandToken) {
        return sendMessage(session, '请先绑定 Token 再开启自动签到。')
      }

      if (switchStr === 'on' || switchStr === '开启') {
        session.user.sklandAutoSign = true
        await session.user.$update()
        return sendMessage(session, `自动签到已开启！将在每天 ${config.signTime} 执行。`)
      } else if (switchStr === 'off' || switchStr === '关闭') {
        session.user.sklandAutoSign = false
        await session.user.$update()
        return sendMessage(session, '自动签到已关闭。')
      } else {
        // 如果没有参数，显示当前状态
        const state = session.user.sklandAutoSign ? '开启' : '关闭'
        return sendMessage(session, `当前自动签到状态：${state}。\n发送 "skland.auto on" 开启，"skland.auto off" 关闭。`)
      }
    })

  // 查看签到状态
  ctx.command('skland.status', '查看签到状态')
    .alias('签到状态')
    .userFields(['sklandToken', 'sklandAutoSign'])
    .action(async ({ session }) => {
      if (!session?.user) return '用户数据不存在'
      const { sklandToken, sklandAutoSign } = session.user
      let msg = ''
      if (sklandToken) {
        msg += '您已绑定森空岛 Token。\n'
        msg += `自动签到：${sklandAutoSign ? '已开启' : '已关闭'} (每日 ${config.signTime})`
      } else {
        msg += '您尚未绑定 Token。'
      }
      return sendMessage(session, msg)
    })

  // 帮助指令
  ctx.command('skland.help', '查看森空岛签到帮助')
    .alias('森空岛签到帮助')
    .action(async ({ session }) => {
      const msg = [
        '森空岛签到助手使用说明：',
        '1. 绑定Token：skland.add [token]',
        '   (直接发送 skland.add 可查看详细获取教程)',
        '2. 手动签到：skland.sign',
        '3. 打开自动签到：skland.auto on',
        '4. 关闭自动签到：skland.auto off',
        '5. 查看状态：skland.status',
        '✨自动签到结果会私聊发送给您，请确保Bot能私聊到您。',
      ].join('\n')
      return sendMessage(session, msg)
    })

  logger.info('森空岛签到插件已加载')
}