const {listen, listenTLS} = Deno
import {HTTPSOptions, Server, ServerRequest, Response} from 'http://deno.land/std/http/server.ts'
import {STATUS_TEXT} from 'http://deno.land/std/http/http_status.ts'
import {wayfarer, Emitter} from './wayfarer.ts'

const dataMethods = ['put', 'post', 'patch']
const methods = ['get', 'put', 'post', 'delete', 'patch']

const MAX_POST = 512 * 1024
const ORIGIN = '*'
const CREDENTIALS = true
const ALLOWED_TYPES = ['application/json']
const HEADERS = ['Content-Type', 'Accept', 'X-Requested-With']

type ParserFunc = (content: string, ...args: any[]) => any

interface ParserList {
  [key: string]: ParserFunc
}

interface HTTPOptions {
  port: number
  addr?: string
  certFile?: string
  keyFile?: string
}

export interface TakeFiveOpts {
  maxPost?: number
  allowContentTypes?: string[]
  allowOrigin?: string
  allowCredentials?: boolean
  allowHeaders?: string[]
  allowMethods?: string[]
  http?: HTTPOptions
  methods?: string[]
}

export interface TakeFiveContext {
  send: (code: any, content?: any) => Promise<void>
  err: (code: any, content?: any) => Promise<void>
  body?: any
  finished: boolean
  maxPost?: number,
  allowContentTypes?: string[]
  query: {
    [key: string]: any
  },
  params: {
    [key: string]: any
  }
}

export type ErrorHandler = (err: Error, req: ServerRequest, res: Response, ctx: TakeFiveContext) => void
export type RouteHandler = (req: ServerRequest, res: Response, ctx: TakeFiveContext) => Promise<void>

export class TakeFive {
  maxPost: number
  allowedContentTypes: string[]
  allowOrigin: string
  allowCredentials: boolean
  routers: Map<string, Emitter>
  server: Server
  methods: string[]
  handleError: ErrorHandler

  private _allowMethods: string[] = ['options'].concat(methods)
  private _allowHeaders: string[] = HEADERS.slice(0)
  private _allowContentTypes: string[] = ALLOWED_TYPES.slice(0)
  private parsers: ParserList = {
    'application/json': JSON.parse
  }
  private _listener: Deno.Listener
  private _httpOpts: HTTPOptions
  private _ctx: TakeFiveContext

  constructor (opts: TakeFiveOpts = {}) {
    this.maxPost = opts.maxPost || MAX_POST
    this.allowedContentTypes = opts.allowContentTypes
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
    this._httpOpts = opts.http

    if (this._httpOpts.keyFile && this._httpOpts.certFile) {
      this._listener = listenTLS(this._httpOpts as HTTPSOptions)
    } else {
      this._listener = listen(this._httpOpts)
    }

    this.routers = new Map<string, Emitter>()
    this.server = new Server(this._listener)
    this.methods = methods.concat(opts.methods || [])
    this._addRouters()
  }

  async listen () {
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

  addParser (type: string, func: ParserFunc) {
    if (typeof type === 'string' && typeof func === 'function') {
      this.parsers[type] = func
    }
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

  set ctx (ctx: TakeFiveContext) {
    const ctxType = Object.prototype.toString.call(ctx)
    if (ctxType !== '[object Object]') {
      throw new Error(`ctx must be an object, was ${ctxType}`)
    }
    this._ctx = Object.assign({}, ctx)
  }

  get ctx () {
    return this._ctx
  }

  parseBody (data: string, type: string): any {
    const parser = this.parsers[type]
    if (typeof parser === 'function') {
      return parser(data)
    }
    return data
  }

  makeCtx (req: ServerRequest, res: Response) {
    async function send (code: any, content?: any) {
      if (typeof content === 'undefined') {
        content = code
        code = 200
      }

      if (typeof content !== 'string') {
        content = JSON.stringify(content)
      }

      res.status = code
      res.headers.append('Content-Type', 'application/json')
      res.body = new TextEncoder().encode(content) 
      return req.respond(res)
    }

    async function err (code: any, content?: any) {
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
      res.headers.append('Content-Type', 'application/json')
      res.body = new TextEncoder().encode(message)
      return req.respond(res)
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
    res.headers.append('Access-Control-Allow-Origin', this.allowOrigin)
    res.headers.append('Access-Control-Allow-Headers', this._allowHeaders.join(','))
    res.headers.append('Access-Control-Allow-Credentials', String(this.allowCredentials))
    res.headers.append('Access-Control-Allow-Methods', this._allowMethods.join(',').toUpperCase())
  }

  close () {
    this.server.close()
  }

  async _verifyBody (req: ServerRequest, res: Response, ctx: TakeFiveContext): Promise<void> {
    const type = req.headers.get('Content-Type')
    const size = req.contentLength
    const _ctxMax = ctx.maxPost
    const maxPost = Number.isNaN(_ctxMax) ? this.maxPost : _ctxMax

    let allowContentTypes = this._allowContentTypes.slice(0)
    if (ctx.allowContentTypes) {
      allowContentTypes = allowContentTypes.concat(ctx.allowContentTypes)
    }

    if (size > maxPost) {
      return ctx.err(413, 'Payload size exceeds maximum size for requests')
    }

    if (!allowContentTypes.includes(type)) {
      return ctx.err(415, `Expected data to be of ${allowContentTypes.join(', ')} not ${type}`)
    } else {
      const buf = new Uint8Array(req.contentLength);
      let bufSlice = buf;
      let totRead = 0;
      while (true) {
        const nread = await req.body.read(bufSlice)
        if (nread === Deno.EOF) break
        totRead += nread
        if (totRead >= req.contentLength) break
        bufSlice = bufSlice.subarray(nread)
      }
      ctx.body = this.parseBody(new TextDecoder('utf8').decode(bufSlice), type)
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
      router(url, req, res, ctx)
    } catch (err) {
      if (ctx.finished) {
        throw err
      }
      return ctx.err(404, 'Not found')
    }
  }

  _addRouters () {
    type MatcherFunction = (matcher: string, handler: RouteHandler, ctxOpts: {[key: string]: any}) => void
    const generateRouter = (method: string): MatcherFunction => {
      return (matcher: string, handler: RouteHandler, ctxOpts: {[key: string]: any}): void => {
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

          const conlen = parseInt(req.headers.get('Content-Length'), 10) || 0
          if (conlen !== 0 && dataMethods.includes(req.method.toLowerCase())) {
            if (ctxOpts) ctx = Object.assign({}, ctx, ctxOpts)
            routeHandlers.unshift(this._verifyBody.bind(this))
          }

          ctx.query = Object.fromEntries((new URL(req.url)).searchParams)
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
    const iterate = (handler: RouteHandler) => {
      const p = handler(req, res, ctx)
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (!ctx.finished && handlers.length > 0) {
            const next = handlers.shift()
            iterate(next)
          }
        })
          .catch((err) => {
            this._handleError(err, req, res, ctx)
          })
      }
    }

    const next = handlers.shift()
    iterate(next)
  }
}