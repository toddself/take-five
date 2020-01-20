# take-five

[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Ftoddself%2Ftake-five%2Fbadge&style=flat-square)](https://actions-badge.atrox.dev/toddself/take-five/goto) 

A minimal REST server that deals with JSON payloads by default, automatically
handles CORS requests, and limits the size of a POST bodies written for Deno

## Usage

```js
import {TakeFive} from 'https://static-pkg.dev/take-five/latest/mod.ts'
// or
import {TakeFive} from 'https://static-pkg.dev/take-five/{VERSION}/mod.ts'
const five = new TakeFive()
five.get('/', async (req, res, ctx) => ctx.send('Hello, world'))
five.post('/', async (req, res, ctx) => ctx.send(req.body))
five.listen(3000)
```

```
curl -X GET localhost:3000
Hello, world
curl -X POST localhost:3000 -H 'content-type: application/json' -d '{"hello": "world"}'
{"hello": "world"}
```

## Routing and route-handlers

In lieu of pre-set middleware, routes handlers can be arrays of functions that will
be iterated over asynchronously. To simplify handling of these handlers,
your handler must return a `Promise`. If you are done 

**If you do not return _and_ resolve a `promise` it won't work!**

e.g.:

```js
function badSetContentHeader (req, res, ctx) {
  res.setHeader('x-no-way', 'this is gonna do nothing')
}

function goodSetContentHeader (req, res, ctx) {
  return new Promise((resolve) => {
    res.setHeader('x-yes-way', 'this is gonna do everything!')
    resolve()
  })
}

function sendReply async (req, res, ctx) {
  return ctx.send('beep!')
}

five.get('/nope', [badSetContentHeader, sendReply])
five.get('/yup', [goodSetContentHeader, sendReply)
```

By default, `get`, `post`, `put`, `delete`, `options` and `patch` will be available
for routing, but this can be changed by providing an array of methods on the options
hash when instatiating a new TakeFive prototype.

### Examples

#### Using async/await

```js
five.handleError = async (err, req, res, ctx) => {
  ctx.finished = true
  return ctx.err(err.statusCode, err.message)
}

five.get('/:secretdata', [
  async (req, res, ctx) => {
    try {
      const session = await isAuthorized(req.headers.Authorization)
      ctx.session = session
    } catch (err) {
      err.statusCode = 401
      throw err
    }
  },
  async (res, res, ctx) => {
    try {
      const data = await getResource(ctx.params.secretdata, ctx.session)
      ctx.send(data)
    } catch (err) {
      err.statusCode = 500
      throw err
    }
  }
])
```

## Parsers
Take-Five supports the ability to automatically parse the payload from a string
into a data structure, and then stringify that data structure to go back out. By
default it handles `application/json` using the built in `JSON.parse` and `JSON.stringify`
methods.

You can supply (or override) what happens for a specific content type, by calling
`addParser` method, and supplying a `Parser` object.

## API

### `TakeFive(opts?:TakeFiveOpts):TakeFive`
Create and return a new HTTP server object.

* `opts.maxPost?:number`: the max size for a payload. Default: 512kb
* `opts.allowHeaders?:string|string[]`: an array of headers to accept besides the default. Default: `Content-Type`, `Accept`, `X-Requested-With`
* `opts.allowOrigin?:string`: What origin(s) are accepted. Deafult: `*`
* `opts.allowCredentials?:boolean`: Allow or deny credentials. Default: `true`
* `opts.allowContentTypes?:string|string[]`: What content types are allowed to be used when sending data to the server. Default: `['application/json']`. Note: This is additive, so `application/json` will ALWAYS be allowed.
* `opts.allowMethods?string|string[]: an array of methods to accept besides the default. Default: `PUT`, `POST`, `DELETE`, `GET`, `OPTIONS`, `PATCH`
* `opts.methods?string|string[]`: An array of methods to create route handlers for. Default: `PUT`, `POST`, `DELETE`, `GET`, `OPTIONS`, `PATCH`
* `opts.http?HTTPOptions`: options for `http(s).createServer`. If you supply `keyFile` and
    `certFile` as options, it will assume you are trying to create an https server`

#### `HTTPOptions`
This almost [`Partial<HTTPSOptions>`](https://deno.land/typedoc/interfaces/deno.listentlsoptions.html) from deno. See the deno docs for more info.

* `http.port:number`: port to listen to. This can be supplied to the `listen` method as well.
* `http.addr?:string`: address on which to listen
* `http.certFile?:string`: path to the HTTP certificate
* `http.KeyFile?:string`: path to the HTTP key file


`Access-Control-Allow-Headers` and `Access-Control-Allow-Methods` can also be changed during runtime
by setting `allowHeaders` and `allowMethods` respectively.

#### `Five#get(route:string, handler:RouteHandler|RouteHandler[], ctxOpts?:{[key: string]: any}) => void`
#### `Five#post(route:string, handler:RouteHandler|RouteHandler[], ctxOpts?:{[key: string]: any}) => void`
#### `Five#put(route:string, handler:RouteHandler|RouteHandler[], ctxOpts?:{[key: string]: any}) => void`
#### `Five#patch(route:string, handler:RouteHandler|RouteHandler[], ctxOpts?:{[key: string]: any}) => void`
#### `Five#delete(route:string, handler:RouteHandler|RouteHandler[], ctxOpts?:{[key: string]: any}) => void`
#### `Five#options(route:string, handler:RouteHandler|RouteHandler[], ctxOpts?:{[key: string]: any}) => void`
Add a new route to the server. Routes may be added after the server has been
started. You can supply either a single function or an array of functions to call.
The array will be traversed in the order it is supplied

* `route:string` A [wayfarer](https://github.com/yoshuawuyts/wayfarer) route definition.
* `handler:RouteHandler|RouteHandler[]`: The handler for this route.
* `routeOpts?:{[key: string]: any}` - overrides for this specific chain of handlers or add a specific context for this handler
    * `maxPost:number` - set the maximum size of a payload for this set of handlers
    * `allowedContentTypes:string|string[]` - add new allowable content-types for this set of handler

#### RouteHandler
`type RouteHandler = (req: ServerRequest, res: Response, ctx: TakeFiveContext) => Promise<void>`

#### `ctx:TakeFiveContext`
  * `send: (code: any, content?: any) => Promise<void>`
  * `err: (code: any, content?: any) => Promise<void>`
  * `body?: any`: the body will be parsed by this point, if there is a parser for it
  * `finished: boolean`: if this is true, no further handlers will be processed
  * `maxPost?: number`: the maximum body size for this route
  * `allowContentTypes?: string[]`: allowed content types for this route
  * `query: {[key: string]: string}`: the query string, parsed into an object
  * `params: {[key: string]: string}`: the route params, parsed into an object
  * `[key: string]: any`: any additional user-defined parameters
}

The `ctx` object can also be extended to contain user defined objects, through
setting `this.ctx` to an object. The object will be copied over using `Object.assign`.

The keys from above will overwrite any keys you provide named the same.

#### `Five#handleError(err: Error, req: ServerRequest, res: Response, ctx: TakeFiveContext) => void`
This function is invoked when either an error object is passed to the `ctx.next`
method, or the `then`-able function's `reject` handler is invoked.

This is a no-op by default, allowing you to customize it's behavior.

If you are returning data in this handler, you'll need to set `ctx.finished = true`

#### `Five#listen(port:number) => void`
Start listening for requests and call the optional callback when you've started
listening

#### `Five.addParser(type:string, parser:Parser) => void`
Add a new content parser to the parsers list. By default there is only a single
parser installed. The parser method is called with the content to be parsed
and the URL of the request. This allows you to have specific encodings per-route
if you are using something like Protocol Buffers

```
interface Parser {
  toStructure: Encoder
  toString: Decoder
}

export type Encoder = (content: string, route: string) => any
export type Decoder = (content: any, route: string) => string
```

#### `Five#close() => void`
Shutdown the underlying server

### Getters/Setters

#### `Five.server:Server`
The underlying http(s) [server](https://github.com/denoland/deno/blob/master/std/http/server.ts#L381) from deno can be accessed directly. This is non-writeable

#### `Five.maxPost:number`
Globally control the maximum payload size after creation

#### `Five.allowContentTypes:string|string[]`
Add new allowable content types for clients to send data with. You can use either
an array of strings or a string

#### `Five.allowHeaders:string|string[]`
Set a new allowable header or headers for CORS requests. You can use either an
array of strings or a string.

#### `Five.allowMethods:string|string[]`
Set a new allowable method for CORS requests.

#### `Five.ctx:{[key: string]: any}`
Add new keys to the ctx objects

## License

Copyright © 2018 Scripto LLC,
Copyright © 2018-2202 Todd Kennedy. Reuse permitted under the Apache-2.0 license

Includes [wayfarer](https://github.com/yoshuawuyts/wayfarer), which is © Yoshua Wuyts