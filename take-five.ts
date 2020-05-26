// Copyright 2016-2020 the take-five authors. All rights reserved
// Apache 2.0 license
import * as http from 'http'
import * as https from 'https'
import * as querystring from 'querystring'

import {wayfarer, WayfarerEmitter} from './wayfarer'

const dataMethods = ['put', 'post', 'patch']
const methods = ['get', 'put', 'post', 'delete', 'patch']

const MAX_POST = 512 * 1024
const ORIGIN = '*'
const CREDENTIALS = true
const ALLOWED_TYPES = ['application/json']
const HEADERS = ['Content-Type', 'Accept', 'X-Requested-With']

export type Encoder = (content: Buffer, route: string) => any
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

export type ErrorHandler = (err: Error, req: http.ClientRequest, res: http.ServerResponse, ctx: TakeFiveContext) => void
export type RouteHandler = (req: http.ClientRequest, res: http.ServerResponse, ctx: TakeFiveContext) => Promise<void>

type MatcherFunction = (
  route: string,
  cb: RouteHandler | RouteHandler[],
  ctxOpts?: {[key: string]: any}
) => void

function getHeader (r: http.ServerResponse | http.ClientRequest, headerName: string): string {
  const header = r.getHeader(headerName)
  return String(Array.isArray(header) ? header[0] : header)
}

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
  routers: Map<string, WayfarerEmitter>
  server: http.Server = {} as http.Server
  methods: string[]
  handleError: ErrorHandler = () => {}

  private _allowMethods: string[] = ['options'].concat(methods)
  private _allowHeaders: string[] = HEADERS.slice(0)
  private _allowContentTypes: string[] = ALLOWED_TYPES.slice(0)
  private parsers: ParserList = {
    'application/json': {
      toStructure: (content) => JSON.parse(content.toString('utf8')),
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

    this.routers = new Map<string, WayfarerEmitter>()
    this.methods = methods.concat(opts.methods || [])
    this._addRouters()
  }

  async listen (port?: number) {
    if (port) {
      this._httpOpts.port = port
    }
    let addr = this._httpOpts.addr || 'localhost'

    if (this._httpOpts.keyFile && this._httpOpts.certFile) {
      this.server = https.createServer({
        key: this._httpOpts.keyFile,
        cert: this._httpOpts.certFile
      })
    } else {
      this.server = http.createServer()
    }

    this.server.on('request', (req, res) => this._onRequest(req, res))
    this.server.listen(this._httpOpts.port, addr)
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

  parseBody (data: Buffer, type: string, route: string): any {
    const parser = this.parsers[type]
    if (parser && typeof parser.toStructure === 'function') {
      return parser.toStructure(data, route)
    }
    return data
  }

  makeCtx (req: http.ClientRequest, res: http.ServerResponse) {
    const send = (code: any, content?: any) => {
      return new Promise((resolve) => {
        if (typeof content === 'undefined') {
          content = code
          code = 200
        }
        const isUint8 = Object.prototype.toString.call(content) === '[object Uint8Array]'

        if (typeof content !== 'string' && !isUint8) {
          if (res.hasHeader('Content-Type')) {
            const type = getHeader(res, 'Content-Type')
            const parser = this.parsers[type]
            content = parser.toString(content, req.path)
          } else {
            res.setHeader('Content-Type', 'application/json')
            content = this.parsers['application/json'].toString(content, req.path)
          }
        }

        res.statusCode = code
        return req.end(content, 'utf8', resolve)
      })
    }

    function err (code: any, content?: any) {
      return new Promise((resolve) => {
        if (typeof content === 'undefined') {
          if (parseInt(code, 10)) {
            content = http.STATUS_CODES[code]
          } else {
            content = code
            code = 500
          }
        }

        const message = JSON.stringify({message: content})
        res.statusCode = code
        res.setHeader('Content-Type', 'application/json')
        res.end(message, 'utf8', resolve)
      })
    }

    return Object.assign({}, this.ctx, {send, err, finished: false})
  }

  _handleError (err: Error, req: http.ClientRequest, res: http.ServerResponse, ctx: TakeFiveContext) {
    if (typeof this.handleError === 'function') {
      this.handleError(err, req, res, ctx)
    }

    if (!ctx.finished) {
      ctx.err('Internal server error')
    }
  }

  cors (res: http.ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', this.allowOrigin)
    res.setHeader('Access-Control-Allow-Headers', this._allowHeaders.join(','))
    res.setHeader('Access-Control-Allow-Credentials', String(this.allowCredentials))
    res.setHeader('Access-Control-Allow-Methods', this._allowMethods.join(',').toUpperCase())
  }

  close () {
    return this.server.close()
  }

  _verifyBody (req: http.ClientRequest, res: http.ServerResponse, ctx: TakeFiveContext): Promise<void> {
    return new Promise((resolve, reject) => {
      const type = getHeader(res, 'content-type')
      const size = parseInt(getHeader(req, 'content-length') || '0', 10) || 0
      const _ctxMax = parseInt(String(ctx.maxPost), 10)
      const maxPost = Number.isNaN(_ctxMax) ? this.maxPost : _ctxMax

      let allowContentTypes = this._allowContentTypes.slice(0)
      if (ctx.allowContentTypes) {
        allowContentTypes = allowContentTypes.concat(ctx.allowContentTypes)
      }

      // Shut down the sender without consuming the body. I wish there was a
      // better way to handle this though
      if (size > maxPost) {
        return ctx.err(413, 'Payload size exceeds maximum size for requests')
      }

      if (!allowContentTypes.includes(type)) {
        return ctx.err(415, `Expected data to be of ${allowContentTypes.join(', ')} not ${type}`)
      } else {
        const data: Buffer[] = []
        req.on('data', (chunk) => {
          data.push(chunk)
        })

        req.on('abort', () => {
          const err = new Error('Client aborted request')
          reject(err)
        })

        req.on('error', reject)
        req.on('end', () => {
          const reqData = Buffer.from(data.concat())
          ctx.body = this.parseBody(reqData, type, req.path)
          resolve()
        })
      }
    })
  }

  _onRequest (req: http.ClientRequest, res: http.ServerResponse) {
    this.cors(res)

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      return req.end()
    }

    const ctx = this.makeCtx(req, res)

    try {
      const method = req.method.toLowerCase()
      const url = req.path.split('?')[0]
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

        router.on(matcher, (params: {[key: string]: any}, req: http.ClientRequest, res: http.ServerResponse, ctx: TakeFiveContext): void => {
          const routeHandlers = handlers.slice(0)

          const conlen = parseInt(getHeader(req, 'Content-Length'), 10) || 0
          if (conlen !== 0 && dataMethods.includes(req.method.toLowerCase())) {
            if (ctxOpts) ctx = Object.assign({}, ctx, ctxOpts)
            routeHandlers.unshift(this._verifyBody.bind(this))
          }

          ctx.query = Object.fromEntries((new URL(req.path, this._urlBase)).searchParams)
          ctx.params = params
          this._resolveHandlers(req, res, ctx, routeHandlers)
        })
      }
    }

    this.methods.forEach((method: string) => {
      Object.defineProperty(this, method, {value: generateRouter(method)})
    })
  }

  _resolveHandlers (req: http.ClientRequest, res: http.ServerResponse, ctx: TakeFiveContext, handlers: RouteHandler[]) {
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
