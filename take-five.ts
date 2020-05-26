import {HTTPSOptions, Server, ServerRequest, Response, serve, serveTLS} from 'https://deno.land/std/http/server.ts'
import {writeResponse} from 'https://deno.land/std/http/_io.ts'
import {STATUS_TEXT} from 'https://deno.land/std/http/http_status.ts'
import {wayfarer, Emitter} from './wayfarer.ts'

export {Response, ServerRequest}

const dataMethods = ['put', 'post', 'patch']
const methods = ['get', 'put', 'post', 'delete', 'patch']

const MAX_POST = 512 * 1024
const ORIGIN = '*'
const CREDENTIALS = true
const ALLOWED_TYPES = ['application/json']
const HEADERS = ['Content-Type', 'Accept', 'X-Requested-With']

export type Encoder = (content: string, route: string) => any
export type Decoder = (content: any, route: string) => string

interface Parser {
  toStructure: Encoder
  toString: Decoder
}

interface ParserList {
  [key: string]: Parser
}

export interface HTTPOptions {
  port: number
  addr?: string
  certFile?: string
  keyFile?: string
}

export interface TakeFiveOpts {
  maxPost?: number
  allowContentTypes?: string | string[]
  allowOrigin?: string
  allowCredentials?: boolean
  allowHeaders?: string | string[]
  allowMethods?: string | string[]
  http?: HTTPOptions
  methods?: string | string[]
}

export interface TakeFiveContext {
  send: (code: any, content?: any) => Promise<void>
  err: (code: any, content?: any) => Promise<void>
  body?: any
  finished: boolean
  maxPost?: number,
  allowContentTypes?: string[]
  query: {
    [key: string]: string
  },
  params: {
    [key: string]: string
  }
  [key: string]: any
}

export type ErrorHandler = (err: Error, req: ServerRequest, res: Response, ctx: TakeFiveContext) => void
export type RouteHandler = (req: ServerRequest, res: Response, ctx: TakeFiveContext) => Promise<void>

type MatcherFunction = (
  route: string,
  cb: RouteHandler | RouteHandler[],
  ctxOpts?: {[key: string]: any}
) => void

export interface TakeFive {
  get: MatcherFunction
  put: MatcherFunction
  post: MatcherFunction
  patch: MatcherFunction
  delete: MatcherFunction
}

export class TakeFive {
  maxPost: number
  allowedContentTypes: string[]
  allowOrigin: string
  allowCredentials: boolean
  routers: Map<string, Emitter>
  server: Server = {} as Server
  methods: string[]
  handleError: ErrorHandler = () => {}

  private _allowMethods: string[] = ['options'].concat(methods)
  private _allowHeaders: string[] = HEADERS.slice(0)
  private _allowContentTypes: string[] = ALLOWED_TYPES.slice(0)
  private parsers: ParserList = {
    'application/json': {
      toStructure: (content) => JSON.parse(content),
      toString: (data) => JSON.stringify(data)
    }
  }
  private _httpOpts: HTTPOptions
  private _ctx: TakeFiveContext
  private _urlBase: string = ''

  constructor (opts: TakeFiveOpts = {}) {
    this.maxPost = opts.maxPost || MAX_POST
    this.allowedContentTypes = Array.isArray(opts.allowContentTypes) ? opts.allowContentTypes : []
    this.allowOrigin = opts.allowOrigin || ORIGIN
    this.allowCredentials = CREDENTIALS
    if (typeof opts.allowCredentials === 'boolean') {
      this.allowCredentials = opts.allowCredentials
    }

    if (opts.allowHeaders) {
      this.allowHeaders = opts.allowHeaders
    }

    if (opts.allowMethods) {
      this.allowMethods = opts.allowMethods
    }

    this._ctx = ({} as TakeFiveContext)
    this._httpOpts = opts.http || {} as HTTPOptions

    this.routers = new Map<string, Emitter>()
    this.methods = methods.concat(opts.methods || [])
    this._addRouters()
  }

  async listen (port?: number) {
    if (port) {
      this._httpOpts.port = port
    }
    let protocol = 'http://'
    let addr = this._httpOpts.addr || 'localhost'

    if (this._httpOpts.keyFile && this._httpOpts.certFile) {
      this.server = serveTLS(this._httpOpts as HTTPSOptions)
      protocol = 'https://'
    } else {
      this.server = serve(this._httpOpts)
    }

    this._urlBase = `${protocol}${addr}:${this._httpOpts.port}`
    for await (const request of this.server) {
      this._onRequest(request)
    }
  }

  set allowContentTypes (types: string | string[]) {
    types = Array.isArray(types) ? types : [types]
    this._allowContentTypes = this._allowContentTypes.concat(types)
  }

  get allowContentTypes () {
    return this._allowContentTypes
  }

  addParser (type: string, parser: Parser) {
    this.parsers[type] = parser
  }

  set allowHeaders (headers: string | string[]) {
    headers = Array.isArray(headers) ? headers : [headers]
    this._allowHeaders = this._allowHeaders.concat(headers)
  }

  get allowHeaders () {
    return this._allowHeaders
  }

  set allowMethods (methods: string | string[]) {
    methods = Array.isArray(methods) ? methods : [methods]
    this._allowMethods = this._allowMethods.concat(methods)
  }

  get allowMethods () {
    return this._allowMethods
  }

  set ctx (ctx: {[key: string]: any}) {
    const ctxType = Object.prototype.toString.call(ctx)
    if (ctxType !== '[object Object]') {
      throw new Error(`ctx must be an object, was ${ctxType}`)
    }
    this._ctx = Object.assign({}, ctx as TakeFiveContext)
  }

  get ctx () {
    return this._ctx
  }

  parseBody (data: string, type: string, route: string): any {
    const parser = this.parsers[type]
    if (parser && typeof parser.toStructure === 'function') {
      return parser.toStructure(data, route)
    }
    return data
  }

  makeCtx (req: ServerRequest, res: Response) {
    const send = async (code: any, content?: any) => {
      if (typeof content === 'undefined') {
        content = code
        code = 200
      }
      const isUint8 = Object.prototype.toString.call(content) === '[object Uint8Array]'

      if (typeof content !== 'string' && !isUint8) {
        if (!res.headers) throw new Error('Headers missing from response')
        if (res.headers.has('Content-Type')) {
          const type = res.headers.get('Content-Type') || ''
          const parser = this.parsers[type]
          content = parser.toString(content, req.url)
        } else {
          res.headers.append('Content-Type', 'application/json')
          content = this.parsers['application/json'].toString(content, req.url)
        }
      }

      res.status = code
      res.body = isUint8 ? content : new TextEncoder().encode(content)
      return req.respond(res)
    }

    async function err (code: any, content?: any) {
      const e = new Error()
      if (typeof content === 'undefined') {
        if (parseInt(code, 10)) {
          content = STATUS_TEXT.get(code)
        } else {
          content = code
          code = 500
        }
      }

      const message = JSON.stringify({message: content})
      res.status = code
      if (!res.headers) throw new Error('Response object missing headers')
      res.headers.append('Content-Type', 'application/json')
      res.body = new TextEncoder().encode(message)
      await req.respond(res)
    }

    return Object.assign({}, this.ctx, {send, err, finished: false})
  }

  _handleError (err: Error, req: ServerRequest, res: Response, ctx: TakeFiveContext) {
    if (typeof this.handleError === 'function') {
      this.handleError(err, req, res, ctx)
    }

    if (!ctx.finished) {
      ctx.err('Internal server error')
    }
  }

  cors (res: Response) {
    if (res.headers) {
      res.headers.append('Access-Control-Allow-Origin', this.allowOrigin)
      res.headers.append('Access-Control-Allow-Headers', this._allowHeaders.join(','))
      res.headers.append('Access-Control-Allow-Credentials', String(this.allowCredentials))
      res.headers.append('Access-Control-Allow-Methods', this._allowMethods.join(',').toUpperCase())
    }
  }

  close () {
    return this.server.close()
  }

  private async drain (body: Deno.Reader, size: number): Promise<Uint8Array> {
    const buf = new Uint8Array(size)
    let bufSlice = buf
    let totRead = 0
    while (true) {
      const c = await body.read(bufSlice)
      if (c == null) break
      totRead += c
      if (totRead >= size) break
      bufSlice = bufSlice.subarray(c)
    }
    return bufSlice
  }

  async _verifyBody (req: ServerRequest, res: Response, ctx: TakeFiveContext): Promise<void> {
    const type = req.headers && req.headers.get('Content-Type') || ''
    const size = req.contentLength || 0
    const _ctxMax = parseInt(String(ctx.maxPost), 10)
    const maxPost = Number.isNaN(_ctxMax) ? this.maxPost : _ctxMax

    let allowContentTypes = this._allowContentTypes.slice(0)
    if (ctx.allowContentTypes) {
      allowContentTypes = allowContentTypes.concat(ctx.allowContentTypes)
    }

    // Shut down the sender without consuming the body. I wish there was a
    // better way to handle this though
    if (size > maxPost) {
      ctx.finished = true
      res.status = 413
      res.body = new TextEncoder().encode(STATUS_TEXT.get(413))
      await writeResponse(req.w, res)
      req.conn.close()
      return
    }

    if (!allowContentTypes.includes(type)) {
      await this.drain(req.body, size)
      return ctx.err(415, `Expected data to be of ${allowContentTypes.join(', ')} not ${type}`)
    } else {
      const body = await this.drain(req.body, size)
      try {
        ctx.body = this.parseBody(new TextDecoder('utf8').decode(body), type, req.url)
      } catch (err) {
        ctx.finished = true
        ctx.err(400, `Payload is not valid ${type}`)
      }
    }
  }

  _onRequest (req: ServerRequest) {
    const res: Response = {
      headers: new Headers()
    }
    this.cors(res)

    if (req.method === 'OPTIONS') {
      res.status = 204
      return req.respond(res)
    }

    const ctx = this.makeCtx(req, res)

    try {
      const method = req.method.toLowerCase()
      const url = req.url.split('?')[0]
      const router = this.routers.get(method)
      if (router) router(url, req, res, ctx)
    } catch (err) {
      if (ctx.finished) {
        throw err
      }
      return ctx.err(404, 'Not found')
    }
  }

  _addRouters () {
    const generateRouter = (method: string): MatcherFunction => {
      return (
        matcher: string,
        handler: RouteHandler | RouteHandler[],
        ctxOpts?: {[key: string]: any}
      ): void => {
        let router = this.routers.get(method)
        if (!router) {
          router = wayfarer('/_')
          this.routers.set(method, router)
        }

        const handlers = Array.isArray(handler) ? handler : [handler]

        if (handlers.some((f) => typeof f !== 'function')) {
          throw new Error('handlers must be functions')
        }

        router.on(matcher, (params: {[key: string]: any}, req: ServerRequest, res: Response, ctx: TakeFiveContext): void => {
          const routeHandlers = handlers.slice(0)

          const conlen = parseInt(req.headers.get('Content-Length') || '', 10) || 0
          if (conlen !== 0 && dataMethods.includes(req.method.toLowerCase())) {
            if (ctxOpts) ctx = Object.assign({}, ctx, ctxOpts)
            routeHandlers.unshift(this._verifyBody.bind(this))
          }

          ctx.query = Object.fromEntries((new URL(req.url, this._urlBase)).searchParams)
          ctx.params = params
          this._resolveHandlers(req, res, ctx, routeHandlers)
        })
      }
    }

    this.methods.forEach((method: string) => {
      Object.defineProperty(this, method, {value: generateRouter(method)})
    })
  }

  _resolveHandlers (req: ServerRequest, res: Response, ctx: TakeFiveContext, handlers: RouteHandler[]) {
    const iterate = async (handler: RouteHandler) => {
      try {
        await handler(req, res, ctx)
        if (!ctx.finished && handlers.length > 0) {
          const next = handlers.shift()
          if (next) iterate(next)
        }
      } catch (err) {
        this._handleError(err, req, res, ctx)
      }
    }

    const next = handlers.shift()
    if (next) iterate(next)
  }
}
