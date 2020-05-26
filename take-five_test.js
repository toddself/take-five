const {test} = require('tap')
const assert = require('assert')
const fetch = require('node-fetch')
const {TakeFive} = require('./dist/take-five')

function formToJSON (buf) {
  const data = buf.toString('utf8')
  const [key, val] = data.split('=')
  return {[key]: val}
}

function JSONtoForm (data) {
  return Object.entries(data)[0].join('=')
}

function request (opts, cb) {
  const {url} = opts
  delete opts.url
  fetch(url, opts)
    .then(res => {
      if (res.headers.get('Content-Type') === 'application/json') {
        res.json()
          .then(body => {
            cb(null, res, body)
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

function setup () {
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
  takeFive.put('/:test', (req, res, ctx) => ctx.send(ctx.params))
  takeFive.delete('/:test', (req, res, ctx) => ctx.send(ctx.query))
  takeFive.get('/err', (req, res, ctx) => ctx.err('broken'))
  takeFive.get('/err2', (req, res, ctx) => ctx.err(400, 'bad'))
  takeFive.get('/err3', (req, res, ctx) => ctx.err(418))
  takeFive.get('/err4', (req, res, ctx) => new Promise((resolve, reject) => reject(new Error('foo'))))
  takeFive.post('/urlencoded', async (req, res, ctx) => ctx.send(201, ctx.body), {allowContentTypes: ['application/x-www-form-urlencoded']})
  takeFive.post('/zero', (req, res, ctx) => Promise.resolve(), {maxPost: 0})

  takeFive.get('/next', [
    async (req, res, ctx) => {
      console.log('here')
      res.statusCode = 202
      res.setHeader('Content-Type', 'application/json')
    },
    async (req, res, ctx) => {
      return res.end('{"message": "complete"}')
    }
  ])

  takeFive.get('/end', [
    async (req, res, ctx) => {
      res.statusCode = 418
      return res.end('Yo')
    },
    async (req, res, ctx) => assert.fail('should never get called')
  ])

  return takeFive
}

const tf = setup()

test('ends response if no more paths', async (t) => {
  const res = await fetch('http://localhost:3000/next')
  const data = await res.json()
  t.equals(res.status, 202, 'got back a 202')
  t.equals(data.message, 'complete', 'got json with complete')
})

test('does not call end twice', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/end'
    }
    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 418, 'teapot')
      resolve()
    })
  })
})

test('not found', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/bar/doo'
    }

    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 404, 'not found')
      t.equals(body.message, 'Not found', 'not found')
      resolve()
    })
  })
})

test('get json', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/'
    }

    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 200, 'got a 200')
      t.equals(body, {hello: ['world']}, 'hello, world')
      resolve()
    })
  })
})

test('500 error', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/err'
    }

    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 500, 'default is 500')
      t.equals(body.message, 'broken', 'it is!')
      resolve()
    })
  })
})

test('400 error', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/err2'
    }
    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 400, 'bad content')
      t.equals(body.message, 'bad', 'bad dudes')
      resolve()
    })
  })
})

test('418 error', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/err3'
    }
    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 418, 'teapot')
      assert(/teapot/i.test(body.message), 'short and stout')
      resolve()
    })
  })
})

test('custom error handler not installed', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/err4'
    }
    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 500, 'internal')
      t.equals(body.message, 'Internal server error')
      resolve()
    })
  })
})

test('post json', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 201, 'got a 201')
      t.equals(body, {foo: 'bar'}, 'matches')
      resolve()
    })
  })
})

test('post not-json', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      url: 'http://localhost:3000/',
      method: 'POST',
      body: 'foo=bar'
    }
    request(opts, (err, res, body) => {
      t.equals(res.statusCode, 415, 'content not allowed')
      t.equals(body.message, 'Expected data to be of application/json, foo/bar not text/plain;charset=UTF-8', 'no match')
      resolve()
    })
  })
})

test('post global custom content type', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 201, 'got a 201')
      t.equals(body, '"foo=bar"', 'matches')
      resolve()
    })
  })
})

test('post non-json with custom parser', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 201, 'got a 201')
      t.equals(body, {foo: 'bar'}, 'matches')
      resolve()
    })
  })
})

test('post too large with header', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 413, 'too large')
      t.equals(body.message, `Payload size exceeds maximum size for requests`, 'too large')
      resolve()
    })
  })
})

test('post too large with header and custom size per route', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 413, 'too large')
      t.equals(body.message, `Payload size exceeds maximum size for requests`, 'too large')
      resolve()
    })
  })
})

test('put no content', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 200, '200')
      t.equals(body, {test: ""}, 'get back cheeky params')
      resolve()
    })
  })
})

test('put with url params', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      method: 'PUT',
      url: 'http://localhost:3000/foobar',
      headers: {
        'Content-Type': 'application/json'
      }
    }
    request(opts, (err, res, body) => {
      t.equals(body, {test: 'foobar'}, 'params passed')
      resolve()
    })
  })
})

test('delete with query params', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const opts = {
      method: 'DELETE',
      url: 'http://localhost:3000/foobar?beep=boop'
    }

    request(opts, (err, res, body) => {
      t.equals(body, {beep: 'boop'}, 'url parsed')
      resolve()
    })
  })
})

test('options', {skip: true}, (t) => {
  const opts = {
    allowMethods: 'PROPFIND',
    allowHeaders: 'X-Bar'
  }
  const five = new TakeFive(opts)
  t.equals(five.allowMethods, ['options', 'get', 'put', 'post', 'delete', 'patch', 'PROPFIND'], 'methods')
  t.equals(five.allowHeaders, ['Content-Type', 'Accept', 'X-Requested-With', 'X-Bar'], 'headers')
})

test('teardown', async (t) => {
  tf.close()
  return Promise.resolve()
})

test('full run', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    let _latch = 0
    const opts = {
      allowMethods: ['PROPFIND'],
      allowHeaders: ['X-Foo'],
      allowOrigin: 'localhost',
      allowCredentials: false
    }
    const server = new TakeFive(opts)

    server.get('/', {skip: true}, async (req, res, ctx) => {
      ctx.send({message: true})
    })

    server.listen(3000)

    const opts1 = {
      url: 'http://localhost:3000/',
      method: 'OPTIONS'
    }
    request(opts1, (err, res, body) => {
      ++_latch
      t.equals(res.statusCode, 204, 'no content')
      t.equals(res.headers['access-control-allow-origin'], 'localhost', 'acao')
      t.equals(res.headers['access-control-allow-credentials'], 'false', 'acac')
      t.equals(res.headers['access-control-allow-headers'], 'Content-Type,Accept,X-Requested-With,X-Foo', 'acah')
      t.equals(res.headers['access-control-allow-methods'], 'OPTIONS,GET,PUT,POST,DELETE,PATCH,PROPFIND', 'acam')
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
      t.equals(res.statusCode, 200, 'no content')
      t.equals(res.headers['access-control-allow-origin'], 'localhost', 'acao')
      t.equals(res.headers['access-control-allow-credentials'], 'false', 'acac')
      t.equals(res.headers['access-control-allow-headers'], 'Content-Type,Accept,X-Requested-With,X-Foo', 'acah')
      t.equals(res.headers['access-control-allow-methods'], 'OPTIONS,GET,PUT,POST,DELETE,PATCH,PROPFIND', 'acam')
      if (_latch === 2) {
        server.close()
        resolve()
      }
    })
  })
})

test('body parser', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 400, 'invalid json')
      t.equals(body.message, 'Payload is not valid application/json', 'not valid')
      server.close()
      resolve()
    })
  })
})

test('changing ctx', {skip: true}, async (t) => {
  return new Promise((resolve) => {
    const five = new TakeFive()

    const ctx = {
      foo: 'bar',
      err: false
    }
    five.ctx = ctx

    five.get('/', {skip: true}, async (req, res, ctx) => {
      t.equals(ctx.foo, 'bar', 'has bar')
      assert(typeof ctx.err === 'function', 'err still function')
      t.equals(Object.keys(ctx), ['foo', 'err', 'send', 'query', 'params'], 'got keys')
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
})

test('custom error handler', {skip: true}, async (t) => {
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
      t.equals(res.statusCode, 501, 'not implemented')
      t.equals(body.message, 'Not Implemented')
      five.close()
    })
  })
})
