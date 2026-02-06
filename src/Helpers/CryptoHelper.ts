import * as crypto from 'crypto'
import { execSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Logger } from 'koishi'

// 嵌入的 Python 脚本 - 使用正确的 publicKey
const PYTHON_SCRIPT = `
import base64
import gzip
import hashlib
import json
import sys
import time
import uuid

try:
    from cryptography.hazmat.decrepit.ciphers.algorithms import TripleDES
except ImportError:
    from cryptography.hazmat.primitives.ciphers.algorithms import TripleDES

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.algorithms import AES
from cryptography.hazmat.primitives.ciphers.base import Cipher
from cryptography.hazmat.primitives.ciphers.modes import CBC, ECB
import requests

SM_CONFIG = {
    "organization": "UWXspnCCJN4sfYlNfqps",
    "appId": "default",
    "publicKey": "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCmxMNr7n8ZeT0tE1R9j/mPixoinPkeM+k4VGIn/s0k7N5rJAfnZ0eMER+QhwFvshzo0LNmeUkpR8uIlU/GEVr8mN28sKmwd2gpygqj0ePnBmOW4v0ZVwbSYK+izkhVFk2V/doLoMbWy6b+UnA8mkjvg0iYWRByfRsK2gdl7llqCwIDAQAB",
}

PK = serialization.load_der_public_key(base64.b64decode(SM_CONFIG['publicKey']))

DES_RULE = {
    "appId": {"is_encrypt": 1, "key": "uy7mzc4h", "obfuscated_name": "xx"},
    "box": {"is_encrypt": 0, "obfuscated_name": "jf"},
    "canvas": {"is_encrypt": 1, "key": "snrn887t", "obfuscated_name": "yk"},
    "clientSize": {"is_encrypt": 1, "key": "cpmjjgsu", "obfuscated_name": "zx"},
    "organization": {"is_encrypt": 1, "key": "78moqjfc", "obfuscated_name": "dp"},
    "os": {"is_encrypt": 1, "key": "je6vk6t4", "obfuscated_name": "pj"},
    "platform": {"is_encrypt": 1, "key": "pakxhcd2", "obfuscated_name": "gm"},
    "plugins": {"is_encrypt": 1, "key": "v51m3pzl", "obfuscated_name": "kq"},
    "pmf": {"is_encrypt": 1, "key": "2mdeslu3", "obfuscated_name": "vw"},
    "protocol": {"is_encrypt": 0, "obfuscated_name": "protocol"},
    "referer": {"is_encrypt": 1, "key": "y7bmrjlc", "obfuscated_name": "ab"},
    "res": {"is_encrypt": 1, "key": "whxqm2a7", "obfuscated_name": "hf"},
    "rtype": {"is_encrypt": 1, "key": "x8o2h2bl", "obfuscated_name": "lo"},
    "sdkver": {"is_encrypt": 1, "key": "9q3dcxp2", "obfuscated_name": "sc"},
    "status": {"is_encrypt": 1, "key": "2jbrxxw4", "obfuscated_name": "an"},
    "subVersion": {"is_encrypt": 1, "key": "eo3i2puh", "obfuscated_name": "ns"},
    "svm": {"is_encrypt": 1, "key": "fzj3kaeh", "obfuscated_name": "qr"},
    "time": {"is_encrypt": 1, "key": "q2t3odsk", "obfuscated_name": "nb"},
    "timezone": {"is_encrypt": 1, "key": "1uv05lj5", "obfuscated_name": "as"},
    "tn": {"is_encrypt": 1, "key": "x9nzj1bp", "obfuscated_name": "py"},
    "trees": {"is_encrypt": 1, "key": "acfs0xo4", "obfuscated_name": "pi"},
    "ua": {"is_encrypt": 1, "key": "k92crp1t", "obfuscated_name": "bj"},
    "url": {"is_encrypt": 1, "key": "y95hjkoo", "obfuscated_name": "cf"},
    "version": {"is_encrypt": 0, "obfuscated_name": "version"},
    "vpw": {"is_encrypt": 1, "key": "r9924ab5", "obfuscated_name": "ca"}
}

BROWSER_ENV = {
    'plugins': 'MicrosoftEdgePDFPluginPortableDocumentFormatinternal-pdf-viewer1,MicrosoftEdgePDFViewermhjfbmdgcfjbbpaeojofohoefgiehjai1',
    'ua': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
    'canvas': '259ffe69',
    'timezone': -480,
    'platform': 'Win32',
    'url': 'https://www.skland.com/',
    'referer': '',
    'res': '1920_1080_24_1.25',
    'clientSize': '0_0_1080_1920_1920_1080_1920_1080',
    'status': '0011',
}

def _DES(o):
    result = {}
    for i in o.keys():
        if i in DES_RULE.keys():
            rule = DES_RULE[i]
            res = o[i]
            if rule['is_encrypt'] == 1:
                c = Cipher(TripleDES(rule['key'].encode('utf-8')), ECB())
                data = str(res).encode('utf-8')
                data += b'\\x00' * 8
                res = base64.b64encode(c.encryptor().update(data)).decode('utf-8')
            result[rule['obfuscated_name']] = res
        else:
            result[i] = o[i]
    return result

def _AES(v, k):
    iv = '0102030405060708'
    key = AES(k)
    c = Cipher(key, CBC(iv.encode('utf-8')))
    v += b'\\x00'
    while len(v) % 16 != 0:
        v += b'\\x00'
    return c.encryptor().update(v).hex()

def GZIP(o):
    json_str = json.dumps(o, ensure_ascii=False)
    stream = gzip.compress(json_str.encode('utf-8'), 2, mtime=0)
    return base64.b64encode(stream)

def get_tn(o):
    sorted_keys = sorted(o.keys())
    result_list = []
    for i in sorted_keys:
        v = o[i]
        if isinstance(v, (int, float)):
            v = str(v * 10000)
        elif isinstance(v, dict):
            v = get_tn(v)
        result_list.append(v)
    return ''.join(result_list)

def get_smid():
    t = time.localtime()
    _time = '{}{:0>2d}{:0>2d}{:0>2d}{:0>2d}{:0>2d}'.format(t.tm_year, t.tm_mon, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec)
    uid = str(uuid.uuid4())
    v = _time + hashlib.md5(uid.encode('utf-8')).hexdigest() + '00'
    smsk_web = hashlib.md5(('smsk_web_' + v).encode('utf-8')).hexdigest()[0:14]
    return v + smsk_web + '0'

def get_d_id():
    uid = str(uuid.uuid4()).encode('utf-8')
    priId = hashlib.md5(uid).hexdigest()[0:16]
    ep = PK.encrypt(uid, padding.PKCS1v15())
    ep = base64.b64encode(ep).decode('utf-8')

    browser = BROWSER_ENV.copy()
    current_time = int(time.time() * 1000)
    browser.update({
        'vpw': str(uuid.uuid4()),
        'svm': current_time,
        'trees': str(uuid.uuid4()),
        'pmf': current_time
    })

    des_target = {
        **browser,
        'protocol': 102,
        'organization': SM_CONFIG['organization'],
        'appId': SM_CONFIG['appId'],
        'os': 'web',
        'version': '3.0.0',
        'sdkver': '3.0.0',
        'box': '',
        'rtype': 'all',
        'smid': get_smid(),
        'subVersion': '1.0.0',
        'time': 0
    }
    des_target['tn'] = hashlib.md5(get_tn(des_target).encode()).hexdigest()
    des_result = _AES(GZIP(_DES(des_target)), priId.encode('utf-8'))

    response = requests.post('https://fp-it.portal101.cn/deviceprofile/v4', json={
        'appId': 'default',
        'compress': 2,
        'data': des_result,
        'encode': 5,
        'ep': ep,
        'organization': SM_CONFIG['organization'],
        'os': 'web'
    })

    resp = response.json()
    if resp['code'] != 1100:
        raise Exception(f"Failed to get dId: code={resp['code']}")
    return 'B' + resp['detail']['deviceId']

if __name__ == '__main__':
    print(get_d_id())
`
const logger = new Logger('skland-crypto')

export class CryptoHelper {
    private maxRetries: number
    private pythonPath: string | null = null
    private scriptPath: string

    constructor(maxRetries: number = 3) {
        this.maxRetries = maxRetries
        this.scriptPath = path.join(os.tmpdir(), 'skland_did.py')
        this.initPython()
    }

    private initPython(): void {
        const pythonCommands = ['python3', 'python']

        for (const cmd of pythonCommands) {
            try {
                const result = spawnSync(cmd, ['--version'], { encoding: 'utf8' })
                if (result.status === 0) {
                    const checkResult = spawnSync(cmd, ['-c', 'import cryptography, requests'], { encoding: 'utf8' })
                    if (checkResult.status === 0) {
                        this.pythonPath = cmd
                        fs.writeFileSync(this.scriptPath, PYTHON_SCRIPT)
                        logger.debug(`[CryptoHelper] 使用 Python: ${cmd}`)
                        return
                    }
                }
            } catch {
                // 继续尝试下一个
            }
        }

        logger.warn('[CryptoHelper] 未找到可用的 Python 环境，请安装 Python 和 cryptography, requests 包')
        logger.warn('[CryptoHelper] 安装命令: pip install cryptography requests')
    }

    async getDid(): Promise<string> {
        if (!this.pythonPath) {
            throw new Error('Python 环境不可用。请安装 Python 3 并运行: pip install cryptography requests')
        }

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const result = execSync(`${this.pythonPath} "${this.scriptPath}"`, {
                    encoding: 'utf8',
                    timeout: 30000
                }).trim()

                if (result.startsWith('B')) {
                    return result
                }

                logger.error(`getDid attempt ${attempt} failed: invalid result`)
            } catch (error: any) {
                logger.error(`getDid attempt ${attempt} error:`, error.message)
            }
        }

        throw new Error(`Failed to get dId after ${this.maxRetries} attempts`)
    }

    generateSignature(
        token: string,
        signPath: string,
        bodyOrQuery: string,
        did: string
    ): { sign: string; headerCa: Record<string, string> } {
        const timestamp = Math.floor(Date.now() / 1000) - 2

        const headerCa: Record<string, string> = {
            platform: '3',
            timestamp: timestamp.toString(),
            dId: did,
            vName: '1.0.0'
        }

        const headerCaStr = JSON.stringify(headerCa)
        const s = `${signPath}${bodyOrQuery}${timestamp}${headerCaStr}`

        const hmac = crypto.createHmac('sha256', token)
        hmac.update(s)
        const hexS = hmac.digest('hex')

        const md5Hex = crypto.createHash('md5').update(hexS).digest('hex')

        return { sign: md5Hex, headerCa }
    }
}