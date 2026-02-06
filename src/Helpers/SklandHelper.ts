import { Context, Logger } from 'koishi'
import { Config } from '../index'
import { CryptoHelper } from './CryptoHelper'
import { NetworkHelper } from './NetworkHelper'

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; SM-A5560 Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Safari/537.36; SKLand/1.52.1'

export class SklandHelper {
    private ctx: Context
    private config: Config
    private logger: Logger
    private network: NetworkHelper
    private crypto: CryptoHelper

    constructor(ctx: Context, config: Config, logger: Logger) {
        this.ctx = ctx
        this.config = config
        this.logger = logger
        this.network = new NetworkHelper(config.maxRetries)
        this.crypto = new CryptoHelper()
    }

    async doSignForAllTokens(): Promise<string[]> {
        const results: string[] = []
        const did = await this.crypto.getDid()
        this.logger.info(`获取到设备ID`)

        const tokens: string[] = ((this.config as any)?.tokens ?? []) as string[]
        for (const token of tokens) {
            try {
                const authorization = await this.getAuthorization(token, did)
                const credential = await this.getCredential(authorization, did)
                const signResults = await this.doSign(credential, did)
                results.push(...signResults)
            } catch (error) {
                this.logger.error(`Token签到失败: ${(error as Error).message}`)
                results.push(`Token签到失败: ${(error as Error).message}`)
            }
        }
        return results
    }

    private async getAuthorization(token: string, did: string): Promise<string> {
        const headers = this.generateHeaders(did)
        const response = await this.network.post(
            'https://as.hypergryph.com/user/oauth2/v2/grant',
            { appCode: '4ca99fa6b56cc2ba', token, type: 0 },
            headers
        )

        if (response.status !== 0) {
            throw new Error(`获取授权失败: ${response.msg || response.message}`)
        }
        return response.data.code
    }

    private async getCredential(authorization: string, did: string): Promise<any> {
        const headers = this.generateHeaders(did)
        const response = await this.network.post(
            'https://zonai.skland.com/web/v1/user/auth/generate_cred_by_code',
            { code: authorization, kind: 1 },
            headers
        )

        if (response.code !== 0) {
            throw new Error(`获取凭证失败: ${response.message}`)
        }
        return response.data
    }

    private async doSign(credResp: any, did: string): Promise<string[]> {
        const httpToken = credResp.token
        const cred = credResp.cred
        const results: string[] = []

        const characters = await this.getBindingList(httpToken, cred, did)
        this.logger.info(`获取到 ${characters.length} 个角色`)

        for (const character of characters) {
            const appCode = character.appCode || 'arknights'
            const gameName = character.gameName || 'Unknown'
            const nickName = character.nickName || 'Unknown'
            const channelName = character.channelName || 'Unknown'

            if (appCode === 'arknights') {
                const result = await this.signForArknights(character, httpToken, cred, did, gameName, nickName, channelName)
                results.push(result)
            } else if (appCode === 'endfield') {
                const endResults = await this.signForEndfield(character, httpToken, cred, did, gameName, nickName, channelName)
                results.push(...endResults)
            }
        }
        return results
    }

    private async signForArknights(character: any, httpToken: string, cred: string, did: string, gameName: string, nickName: string, channelName: string): Promise<string> {
        const url = 'https://zonai.skland.com/api/v1/game/attendance'
        const body = { gameId: character.gameId || 1, uid: character.uid }
        const bodyStr = JSON.stringify(body)
        const headers = this.getSignHeader(url, 'post', bodyStr, httpToken, cred, did)

        const response = await this.network.post(url, body, headers)

        // 处理重复签到
        if (response.code === 10001) {
            return `[${gameName}]${nickName}(${channelName}) 今日已签到`
        }

        if (response.code !== 0) {
            return `[${gameName}]${nickName}(${channelName}) 签到失败: ${response.message}`
        }

        const awards = response.data.awards.map((award: any) =>
            `${award.resource.name}×${award.count || 1}`
        ).join(', ')

        return `[${gameName}]${nickName}(${channelName}) 签到成功，获得: ${awards}`
    }

    private async signForEndfield(character: any, httpToken: string, cred: string, did: string, gameName: string, nickName: string, channelName: string): Promise<string[]> {
        const results: string[] = []
        const roles = character.roles || []

        for (const role of roles) {
            const roleNickname = role.nickname || nickName
            const roleId = role.roleId || ''
            const serverId = role.serverId || ''
            const url = 'https://zonai.skland.com/web/v1/game/endfield/attendance'

            const headers = this.getSignHeader(url, 'post', '', httpToken, cred, did)
            headers['Content-Type'] = 'application/json'
            headers['sk-game-role'] = `3_${roleId}_${serverId}`
            headers['referer'] = 'https://game.skland.com/'
            headers['origin'] = 'https://game.skland.com/'

            const response = await this.network.post(url, null, headers)

            // 处理重复签到
            if (response.code === 10001) {
                results.push(`[${gameName}]${roleNickname}(${channelName}) 今日已签到`)
                continue
            }

            if (response.code !== 0) {
                results.push(`[${gameName}]${roleNickname}(${channelName}) 签到失败: ${response.message}`)
                continue
            }

            // 解析终末地奖励
            const awardsResult: string[] = []
            const resultData = response.data
            const resultInfoMap = resultData?.resourceInfoMap || {}
            for (const a of (resultData?.awardIds || [])) {
                const awardId = a.id
                const awards = resultInfoMap[awardId]
                if (awards) {
                    awardsResult.push(`${awards.name}×${awards.count}`)
                }
            }

            results.push(`[${gameName}]${roleNickname}(${channelName}) 签到成功，获得: ${awardsResult.join(', ') || '签到奖励'}`)
        }
        return results
    }

    private async getBindingList(httpToken: string, cred: string, did: string): Promise<any[]> {
        const url = 'https://zonai.skland.com/api/v1/game/player/binding'
        const headers = this.getSignHeader(url, 'get', '', httpToken, cred, did)

        const response = await this.network.get(url, headers)

        if (response.code !== 0) {
            throw new Error(`获取绑定列表失败: ${response.message}`)
        }

        const characters: any[] = []
        for (const item of response.data.list) {
            const appCode = item.appCode
            const gameName = item.appName || appCode
            if (appCode !== 'arknights' && appCode !== 'endfield') continue

            for (const binding of item.bindingList) {
                characters.push({
                    ...binding,
                    appCode,
                    gameName,
                    gameId: binding.gameId || (appCode === 'arknights' ? 1 : 3)
                })
            }
        }
        return characters
    }

    private generateHeaders(did: string): Record<string, string> {
        return {
            'User-Agent': USER_AGENT,
            'Accept-Encoding': 'gzip',
            'Connection': 'close',
            'dId': did,
            'X-Requested-With': 'com.hypergryph.skland'
        }
    }

    private getSignHeader(url: string, method: string, body: string, token: string, cred: string, did: string): Record<string, string> {
        const parsedUrl = new URL(url)
        const path = parsedUrl.pathname
        const query = method.toLowerCase() === 'get' ? parsedUrl.search.slice(1) : body

        const { sign, headerCa } = this.crypto.generateSignature(token, path, query, did)

        const headers: Record<string, string> = {
            'User-Agent': USER_AGENT,
            'Accept-Encoding': 'gzip',
            'Connection': 'close',
            'X-Requested-With': 'com.hypergryph.skland',
            'cred': cred,
            'sign': sign
        }

        for (const key of Object.keys(headerCa)) {
            headers[key] = headerCa[key]
        }

        return headers
    }
}