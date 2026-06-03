import axios, { AxiosInstance } from 'axios'

interface AcumaticaConfig {
  baseUrl: string
  company: string
  branch: string
  username: string
  password: string
}

export class AcumaticaClient {
  private http: AxiosInstance
  private config: AcumaticaConfig
  private sessionCookie: string | null = null

  constructor(config: AcumaticaConfig) {
    this.config = config
    this.http = axios.create({
      baseURL: `${config.baseUrl}/entity/Default/23.200.001`,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      withCredentials: true
    })
  }

  async login(): Promise<void> {
    const response = await axios.post(
      `${this.config.baseUrl}/entity/auth/login`,
      {
        name: this.config.username,
        password: this.config.password,
        company: this.config.company,
        branch: this.config.branch
      }
    )
    const cookie = response.headers['set-cookie']?.[0]
    if (!cookie) throw new Error('Acumatica login failed: no session cookie')
    this.sessionCookie = cookie
    this.http.defaults.headers.common['Cookie'] = this.sessionCookie
  }

  async logout(): Promise<void> {
    await axios.post(`${this.config.baseUrl}/entity/auth/logout`)
    this.sessionCookie = null
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    if (!this.sessionCookie) await this.login()
    const response = await this.http.get<T>(endpoint, { params })
    return response.data
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    if (!this.sessionCookie) await this.login()
    const response = await this.http.post<T>(endpoint, data)
    return response.data
  }
}
