export class NetworkHelper {
    private maxRetries: number

    constructor(maxRetries: number = 3) {
        this.maxRetries = maxRetries
    }

    async post(url: string, body: any, headers: Record<string, string>): Promise<any> {
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const fetchOptions: RequestInit = {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers
                    }
                }

                if (body !== null && body !== undefined) {
                    fetchOptions.body = JSON.stringify(body)
                }

                const response = await fetch(url, fetchOptions)
                const text = await response.text()

                try {
                    return JSON.parse(text)
                } catch {
                    return { code: -1, message: text }
                }
            } catch (error) {
                lastError = error as Error
                console.error(`POST ${url} attempt ${attempt} failed:`, error)
            }
        }

        throw lastError || new Error('Request failed')
    }

    async get(url: string, headers: Record<string, string>): Promise<any> {
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers
                })
                const text = await response.text()

                try {
                    return JSON.parse(text)
                } catch {
                    return { code: -1, message: text }
                }
            } catch (error) {
                lastError = error as Error
                console.error(`GET ${url} attempt ${attempt} failed:`, error)
            }
        }

        throw lastError || new Error('Request failed')
    }
}