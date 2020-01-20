# take-five

[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Ftoddself%2Ftake-five%2Fbadge&style=flat-square)](https://actions-badge.atrox.dev/toddself/take-five/goto) 

A minimal REST server that deals solely with JSON payloads, automatically
handles CORS requests, and limits the size of a POST bodies written for Deno

## Usage

```js
import {TakeFive} from 'https://static-pkg.dev/take-five/mod.ts'
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

function sendReply (req, res, ctx) {
  ctx.send('beep!')
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
      reject(err)
    }
  }
])
```
## API

### `Five(opts?:object):object`
Create and return a new HTTP server object.

* `opts.maxPost?:number`: the max size for a payload. Default: 512kb
* `opts.allowHeaders?:array(string)`: an array of headers to accept besides the default. Default: `Content-Type`, `Accept`, `X-Requested-With`
* `opts.allowOrigin?:string`: What origin(s) are accepted. Deafult: `*`
* `opts.allowCredentials?:boolean`: Allow or deny credentials. Default: `true`
* `opts.allowContentTypes?:string|string[]`: What content types are allowed to be used when sending data to the server. Default: `['application/json']`. Note: This is additive, so `application/json` will ALWAYS be allowed.
* `opts.allowMethods?array(string)`: an array of methods to accept besides the default. Default: `PUT`, `POST`, `DELETE`, `GET`, `OPTIONS`, `PATCH`
* `opts.methods?array(string)`: An array of methods to create route handlers for. Default: `PUT`, `POST`, `DELETE`, `GET`, `OPTIONS`, `PATCH`
* `opts.http?object`: options for `http(s).createServer`. If you supply `key`,
    `cert` and `ca` as options, it will assume you are trying to create an https server`

`Access-Control-Allow-Headers` and `Access-Control-Allow-Methods` can also be changed during runtime
by setting `allowHeaders` and `allowMethods` respectively.

#### `Five#get(route:string, handler:(function|array(function)), routeOpts?:object)`
#### `Five#post(route:string, handler:(function|array(function)), routeOpts?:object)`
#### `Five#put(route:string, handler:(function|array(function)), routeOpts?:object)`
#### `Five#patch(route:string, handler:(function|array(function)), routeOpts?:object)`
#### `Five#delete(route:string, handler:(function|array(function)), routeOpts?:object)`
#### `Five#options(route:string, handler:(function|array(function)), routeOpts?:object)`
Add a new route to the server. Routes may be added after the server has been
started. You can supply either a single function or an array of functions to call.
The array will be traversed in the order it is supplied

* `route:string` A [wayfarer](https://github.com/yoshuawuyts/wayfarer) route definition.
* `handler(request:object, response:object, ctx:object):function`: The handler for this route.
* `routeOpts?:object` - overrides for this specific chain of handlers
    * `maxPost:number` - set the maximum size of a payload for this set of handlers
    * `allowedContentTypes:string|string[]` - add new allowable content-types for this set of handlers

#### `ctx:object`
* `query?:object`: query parameters from the URL (if any)
* `params?:object`: Named parameters from the route definition as provided by wayfarer
* `body?:object`: The parsed JSON body available on POST requests
* `send(statusCode?:number, body?:(string|object)):function`: Send a response.
* `err(statusCode?:number, message?:string):function`: Send an error. If no status code is provided it will default to a 500 error.  If no message is provided, it will use the default message for that status code. The message will be wrapped in a JSON object under the key `message`
* `next():function`: Go to the next handler

The `ctx` object can also be extended to contain user defined objects, through
setting `this.ctx` to an object. The object will be copied over using `Object.assign`.

The keys from above will overwrite any keys you provide named the same.

#### `Five#handleError(err:Error, req:Request, res:Response, ctx:Context)`
This function is invoked when either an error object is passed to the `ctx.next`
method, or the `then`-able function's `reject` handler is invoked.

This is a no-op by default, allowing you to customize it's behavior.

#### `Five#listen(port:number, handle?:function)`
Start listening for requests and call the optional callback when you've started
listening

#### `Five.addParser(type:string, parser:functon):void`
Add a new content parser to the parsers list. By default there is only a single
parser (`application/json`: JSON.parser). This can be overridden with a custom
JSON parser if you'd like.

#### `Five#close()`
Shutdown the underlying server

### Getters/Setters

#### `Five.server`
The underlying http(s) server from node can be accessed directly. This is non-writeable

#### `Five.maxPost`
Globally control the maximum payload size after creation

#### `Five.allowContentTypes`
Add new allowable content types for clients to send data with. You can use either
an array of strings or a string

#### `Five.allowHeaders`
Set a new allowable header or headers for CORS requests. You can use either an
array of strings or a string.

#### `Five.allowMethods`
Set a new allowable method for CORS requests.

#### `Five.ctx`
Add new keys to the ctx objects

## License

Copyright © 2018 Scripto LLC,
Copyright © 2018-2202 Todd Kennedy. Reuse permitted under the Apache-2.0 license
