import {
  assert,
  assertEquals,
} from 'https://deno.land/std/testing/asserts.ts'

import {TakeFive} from './take-five.ts'

function formToJSON (data: string): {[key: string]: string} {
  const [key, val] = data.split('=')
  return {[key]: val}
}

function JSONtoForm (data: {[key: string]: string}): string {
  return Object.entries(data)[0].join('=')
}

function request (
  opts: {url: string} & __domTypes.RequestInit,
  cb: (err: Error, res?: {statusCode: number, [key: string]: any}, body?: any) => void
) {
  const url = opts.url
  delete opts.url
  fetch(url, opts)
    .then(res => {
      const response = {
        statusCode: res.status,
        headers: Object.fromEntries(res.headers)
      }
      if (res.headers.get('Content-Type') === 'application/json') {
        res.json()
          .then(body => {
            cb(null, response, body)
          }).catch(async err => {
            console.log('error was', err)
            const body = await res.text()
            console.log('body was', body)
          })
      } else {
        res.text()
          .then(body => {
            cb(null, response, body)
          })
      }
    })
}

function setup (): TakeFive {
  const takeFive = new TakeFive()
  takeFive.listen(3000)
  takeFive.addParser('application/x-www-form-urlencoded', {
    toStructure: formToJSON,
    toString: JSONtoForm
  })
  takeFive.allowContentTypes = 'foo/bar'

  takeFive.get('/', (req, res, ctx) => ctx.send({hello: ['world']}))
  takeFive.post('/', (req, res, ctx) => ctx.send(201, ctx.body))
  takeFive.post('/foobar', (req, res, ctx) => ctx.send(201, ctx.body))
  takeFive.put('/:Deno.test', (req, res, ctx) => ctx.send(ctx.params))
  takeFive.delete('/:Deno.test', (req, res, ctx) => ctx.send(ctx.query))
  takeFive.get('/err', (req, res, ctx) => ctx.err('broken'))
  takeFive.get('/err2', (req, res, ctx) => ctx.err(400, 'bad'))
  takeFive.get('/err3', (req, res, ctx) => ctx.err(418))
  takeFive.get('/err4', (req, res, ctx) => new Promise((resolve, reject) => reject(new Error('foo'))))
  takeFive.post('/urlencoded', async (req, res, ctx) => ctx.send(201, ctx.body), {allowContentTypes: ['application/x-www-form-urlencoded']})
  takeFive.post('/zero', (req, res, ctx) => Promise.resolve(), {maxPost: 0})

  takeFive.get('/next', [
    async (req, res, ctx) => {
      res.status = 202
      res.headers.set('Content-Type', 'application/json')
    },
    (req, res, ctx) => {
      res.body = new TextEncoder().encode('{"message": "complete"}')
      return req.respond(res)
    }
  ])

  takeFive.get('/end', [
    async (req, res, ctx) => {
      res.status = 418
      res.body = new TextEncoder().encode('Yo')
      return req.respond(res)
    },
    async (req, res, ctx) => assert(false, 'should never get called')
  ])

  return takeFive
}

const tf = setup()

Deno.test({
  name: 'ends response if no more paths',
  fn: async (): Promise<void> => {
    const res = await fetch('http://localhost:3000/next')
    const data = await res.json()
    assertEquals(res.status, 202, 'got back a 202')
    assertEquals(data.message, 'complete', 'got json with complete')
  }
})

Deno.test({
	name: 'does not call end twice',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/end'
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 418, 'teapot')
        resolve()
      })
    })
  }
})

Deno.test({
	name: 'not found',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/bar/doo'
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 404, 'not found')
        assertEquals(body.message, 'Not found', 'not found')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'get json',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/'
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 200, 'got a 200')
        assertEquals(body, {hello: ['world']}, 'hello, world')
        resolve()
      })
    })
	}
})

Deno.test({
	name: '500 error',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/err'
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 500, 'default is 500')
        assertEquals(body.message, 'broken', 'it is!')
        resolve()
      })
    })
	}
})

Deno.test({
	name: '400 error',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/err2'
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 400, 'bad content')
        assertEquals(body.message, 'bad', 'bad dudes')
        resolve()
      })
    })
	}
})

Deno.test({
	name: '418 error',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/err3'
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 418, 'teapot')
        assert(/teapot/i.Deno.test(body.message), 'short and stout')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'custom error handler not installed',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/err4'
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 500, 'internal')
        assertEquals(body.message, 'Internal server error')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'post json',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/',
        method: 'POST',
        body: JSON.stringify({foo: 'bar'}),
        headers: {
          'Content-Type': 'application/json'
        }
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 201, 'got a 201')
        assertEquals(body, {foo: 'bar'}, 'matches')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'post not-json',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/',
        method: 'POST',
        body: 'foo=bar'
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 415, 'content not allowed')
        assertEquals(body.message, 'Expected data to be of application/json, foo/bar not text/plain;charset=UTF-8', 'no match')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'post global custom content type',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/urlencoded',
        method: 'POST',
        body: '"foo=bar"',
        headers: {
          'Content-Type': 'foo/bar'
        }
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 201, 'got a 201')
        assertEquals(body, '"foo=bar"', 'matches')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'post non-json with custom parser',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/urlencoded',
        method: 'post',
        body: 'foo=bar',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        }
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 201, 'got a 201')
        assertEquals(body, {foo: 'bar'}, 'matches')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'post too large with header',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        method: 'POST',
        url: 'http://localhost:3000/',
        body: 'a'.repeat(512*2048),
        headers: {
          'Content-Length': `${512 * 2048}`,
          'Content-Type': 'application/json'
        }
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 413, 'too large')
        assertEquals(body.message, `Payload size exceeds maximum size for requests`, 'too large')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'post too large with header and custom size per route',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        method: 'POST',
        url: 'http://localhost:3000/zero',
        body: '',
        headers: {
          'Content-Length': '1',
          'Content-Type': 'application/json'
        }
      }
      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 413, 'too large')
        assertEquals(body.message, `Payload size exceeds maximum size for requests`, 'too large')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'put no content',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        url: 'http://localhost:3000/',
        method: 'PUT',
        headers: {
          'Content-Length': '0',
          'Content-Type': 'application/json'
        }
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 200, '200')
        assertEquals(body, {Deno.test: ""}, 'get back cheeky params')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'put with url params',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        method: 'PUT',
        url: 'http://localhost:3000/foobar',
        headers: {
          'Content-Type': 'application/json'
        }
      }
      request(opts, (err, res, body) => {
        assertEquals(body, {Deno.test: 'foobar'}, 'params passed')
        resolve()
      })
    })
  }
})

Deno.test({
	name: 'delete with query params',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const opts = {
        method: 'DELETE',
        url: 'http://localhost:3000/foobar?beep=boop'
      }

      request(opts, (err, res, body) => {
        assertEquals(body, {beep: 'boop'}, 'url parsed')
        resolve()
      })
    })
	}
})

Deno.test({
	name: 'options',
	fn: (): void => {
    const opts = {
      allowMethods: 'PROPFIND',
      allowHeaders: 'X-Bar'
    }
    const five = new TakeFive(opts)
    assertEquals(five.allowMethods, ['options', 'get', 'put', 'post', 'delete', 'patch', 'PROPFIND'], 'methods')
    assertEquals(five.allowHeaders, ['Content-Type', 'Accept', 'X-Requested-With', 'X-Bar'], 'headers')
  }
})

Deno.test({
  name: 'teardown',
  fn: (): Promise<void> => {
    tf.close()
    return Promise.resolve()
  }
})

Deno.test({
	name: 'full run',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      let _latch = 0
      const opts = {
        allowMethods: ['PROPFIND'],
        allowHeaders: ['X-Foo'],
        allowOrigin: 'localhost',
        allowCredentials: false
      }
      const server = new TakeFive(opts)

      server.get('/', async (req, res, ctx) => {
        ctx.send({message: true})
      })

      server.listen(3000)

      const opts1 = {
        url: 'http://localhost:3000/',
        method: 'OPTIONS'
      }
      request(opts1, (err, res, body) => {
        ++_latch
        assertEquals(res.statusCode, 204, 'no content')
        assertEquals(res.headers['access-control-allow-origin'], 'localhost', 'acao')
        assertEquals(res.headers['access-control-allow-credentials'], 'false', 'acac')
        assertEquals(res.headers['access-control-allow-headers'], 'Content-Type,Accept,X-Requested-With,X-Foo', 'acah')
        assertEquals(res.headers['access-control-allow-methods'], 'OPTIONS,GET,PUT,POST,DELETE,PATCH,PROPFIND', 'acam')
        if (_latch === 2) {
          server.close()
          resolve()
        }
      })

      const opts2 = {
        url: 'http://localhost:3000'
      }
      request(opts2, (err, res, body) => {
        ++_latch
        assertEquals(res.statusCode, 200, 'no content')
        assertEquals(res.headers['access-control-allow-origin'], 'localhost', 'acao')
        assertEquals(res.headers['access-control-allow-credentials'], 'false', 'acac')
        assertEquals(res.headers['access-control-allow-headers'], 'Content-Type,Accept,X-Requested-With,X-Foo', 'acah')
        assertEquals(res.headers['access-control-allow-methods'], 'OPTIONS,GET,PUT,POST,DELETE,PATCH,PROPFIND', 'acam')
        if (_latch === 2) {
          server.close()
          resolve()
        }
      })
    })
  }
})

Deno.test({
  name: 'body parser',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const serverOpts = {
        maxPost: 100
      }
      const server = new TakeFive(serverOpts)
      server.listen(3000)
      server.post('/', (req, res, ctx) => ctx.send(req.body))

      const opts = {
        method: 'POST',
        url: 'http://localhost:3000/',
        body: 'wahoo []',
        headers: {
          'Content-Type': 'application/json'
        }
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 400, 'invalid json')
        assertEquals(body.message, 'Payload is not valid application/json', 'not valid')
        server.close()
        resolve()
      })
    })
	}
})

Deno.test({
  name: 'changing ctx',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const five = new TakeFive()

      const ctx = {
        foo: 'bar',
        err: false
      }
      five.ctx = ctx

      five.get('/', async (req, res, ctx) => {
        assertEquals(ctx.foo, 'bar', 'has bar')
        assert(typeof ctx.err === 'function', 'err still function')
        assertEquals(Object.keys(ctx), ['foo', 'err', 'send', 'query', 'params'], 'got keys')
        ctx.send({ok: true})
      })

      five.listen(3000)

      const opts = {
        url: 'http://localhost:3000/'
      }

      request(opts, (err, res, body) => {
        five.close()
        resolve()
      })
    })
  }
})

Deno.test({
  name: 'custom error handler',
	fn: (): Promise<void> => {
    return new Promise((resolve) => {
      const five = new TakeFive()
      five.listen(3000)
      five.handleError = (err, req, res, ctx) => {
        ctx.err(501, 'Not Implemented')
        ctx.finished = true
      }


      five.get('/', (req, res, ctx) => {
        return new Promise((resolve, reject) => {
          reject(new Error('501!'))
        })
      })

      const opts = {
        url: 'http://localhost:3000/'
      }

      request(opts, (err, res, body) => {
        assertEquals(res.statusCode, 501, 'not implemented')
        assertEquals(body.message, 'Not Implemented')
        five.close()
      })
    })
  }
})

Deno.runtests()
