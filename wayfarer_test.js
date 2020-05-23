import { test } from 'tap'
import { wayfarer } from './wayfarer'

test('should match a path', (t) => {
  var r = wayfarer()
  r.on('/', function () {
    t.ok(true, 'called')
    t.end()
  })
  r('/')
})

test('should match a default path', (t) => {
  var r = wayfarer()
  r.on(void 0, function () {
    t.ok(true, 'called')
    t.end()
  })
  r('/')
})

test('should match a nested path', (t) => {
  var r = wayfarer()
  r.on('/foo/bar', function () {
    t.ok(true, 'called')
    t.end()
  })
  r('/foo/bar')
})

test('should match a default path', (t) => {
  var r = wayfarer('/404')
  r.on('/404', function () {
    t.ok(true, 'default')
    t.end()
  })
  r('/nope')
})

test('should allow passing of extra values', (t) => {
    var foo = {}
    var bar = {}
    var r = wayfarer()
    r.on('/foo', function (params, arg1, arg2) {
      t.deepEqual(arg1, foo, 'arg1 was passed')
      t.deepEqual(arg2, bar, 'arg2 was passed')
      t.end()
    })
    r('/foo', foo, bar)
})

test('.emit() should match paths', (t) => {
  t.plan(2)
  var r = wayfarer()
  r.on('/foo/bar', function (param) {
    t.ok(true, 'bar called')
  })
  r.on('/foo/baz', function (param) {
    t.ok(true, 'baz called')
  })
  r('/foo/bar')
  r('/foo/baz')
})

test('.match() should match paths', (t) => {
  t.plan(2)
  var r = wayfarer()
  r.on('/foo/bar', function () {
    t.fail('should not call callback')
  })

  r.on('/foo/baz', () => {})

  var bar = r.match('/foo/bar')
  t.deepEqual(bar.route, '/foo/bar', '/foo/bar route exists')

  var baz = r.match('/foo/baz')
  t.deepEqual(baz.route, '/foo/baz', '/foo/baz route exists')
})

test('.emit() should match partials', (t) => {
  var r = wayfarer()
  r.on('/:user', function (param) {
    t.deepEqual(param.user, 'tobi', 'param matched')
    t.end()
  })
  r('/tobi')
})

test('.match() should match partials', (t) => {
  var r = wayfarer()
  r.on('/:user', () => {})
  var toby = r.match('/tobi')
  t.deepEqual(toby.params.user, 'tobi')
  t.end()
})

test('.emit() should match paths before partials', (t) => {
  var r = wayfarer()
  r.on('/foo', function () {
    t.ok(true, 'called')
    t.end()
  })
  r.on('/:user', () => {})
  r('/foo')
})

test('.emit() should allow path overriding', (t) => {
  var r = wayfarer()
  r.on('/:user', function () {
    t.fail('wrong callback called')
  })
  r.on('/:user', function () {
    t.ok(true, 'called')
    t.end()
  })
  r('/foo')
})

test('.emit() should match nested partials', (t) => {
  var r = wayfarer()
  r.on('/:user/:name', function (param) {
    t.deepEqual(param.user, 'tobi', 'param matched')
    t.deepEqual(param.name, 'baz', 'param matched')
    t.end()
  })
  r('/tobi/baz')
})

test('.emit() should parse encoded params', (t) => {
  var r = wayfarer()
  r.on('/:channel', function (param) {
    t.deepEqual(param.channel, '#choo', 'param matched')
    t.end()
  })
  r('/%23choo')
})

test('.emit() should throw if no matches are found', (t) => {
  var r1 = wayfarer()
  t.throws(() =>{
    r1('/woops')
  })
  t.end()
})

test('.emit() should return values', (t) => {
  var r1 = wayfarer()
  r1.on('/foo', function () {
    return 'hello'
  })
  t.deepEqual(r1('foo'), 'hello', 'returns value')
  t.end()
})

test('.emit() mount subrouters', (t) => {
  t.plan(5)
  var r4 = wayfarer()
  var r3 = wayfarer()
  r4.on('/kidlette', function () {
    t.ok(true, 'nested 2 levels')
  })
  r3.on('/mom', r4)
  r3.emit('/mom/kidlette')

  var r1 = wayfarer()
  var r2 = wayfarer()
  r2.on('/', function () {
    t.ok(true, 'nested 1 level')
  })
  r1.on('/home', r2)
  r1('/home')

  var r5 = wayfarer()
  var r6 = wayfarer()
  r6.on('/child', function (param) {
    t.deepEqual(typeof param, 'object', 'param is passed')
    t.deepEqual(param.parent, 'hello', 'nested 2 levels with params')
  })
  r5.on('/:parent', r6)
  r5.emit('/hello/child')

  var r7 = wayfarer()
  var r8 = wayfarer()
  var r9 = wayfarer()
  r9.on('/bar', function (param) {
    t.ok(true, 'nested 3 levels')
  })
  r8.on('/bin', r9)
  r7.on('/foo', r8)
  r7.emit('/foo/bin/bar')
})

test('.emit() should match nested partials of subrouters', (t) => {
  var r1 = wayfarer()
  var r2 = wayfarer()
  var r3 = wayfarer()
  r3.on('/:grandchild', function (param) {
    t.deepEqual(param.parent, 'bin', 'nested 3 levels with params')
    t.deepEqual(param.child, 'bar', 'nested 3 levels with params')
    t.deepEqual(param.grandchild, 'baz', 'nested 3 levels with parmas')
    t.end()
  })
  r2.on('/:child', r3)
  r1.on('/foo/:parent', r2)
  r1('/foo/bin/bar/baz')
})

test('.match() should return nested partials of subrouters', (t) => {
  var r1 = wayfarer()
  var r2 = wayfarer()
  var r3 = wayfarer()
  r3.on('/:grandchild', () => {})
  r2.on('/:child', r3)
  r1.on('/foo/:parent', r2)
  var matched = r1.match('/foo/bin/bar/baz')
  t.deepEqual(matched.params.parent, 'bin')
  t.deepEqual(matched.params.child, 'bar')
  t.deepEqual(matched.params.grandchild, 'baz')
  t.end()
})

test('.match() returns a handler of a route', (t) => {
  var r = wayfarer()
  r.on('/:user', function () {
    t.ok(true, 'called')
    t.end()
  })
  var toby = r.match('/tobi')
  toby.cb()
})

test('nested routes should call parent default route', (t) => {
  t.plan(4)
  var r1 = wayfarer('/404')
  var r2 = wayfarer()
  var r3 = wayfarer()

  r2.on('/bar', r3)
  r1.on('foo', r2)
  r1.on('/404', pass)

  r1('')
  r1('foo')
  r1('foo/bar')
  r1('foo/beep/boop')

  function pass (params) {
    t.ok(true, 'called')
  }
})

test('aliases', (t) => {
  var r = wayfarer()
  t.deepEqual(r, r)
  t.end()
})

test('wildcards', (t) => {
  t.plan(3)
  var r = wayfarer()

  r.on('/bar/*', function (params) {
    t.deepEqual(params.wildcard, 'foo/beep/boop')
  })

  r.on('/foo/:match/*', function (params) {
    t.deepEqual(params.match, 'bar')
    t.deepEqual(params.wildcard, 'beep/boop')
  })

  r('/bar/foo/beep/boop')
  r('/foo/bar/beep/boop')
})

test('wildcards dont conflict with params', (t) => {
  t.plan(3)
  let router = wayfarer()
  router.on('/*', function (params) {
    t.fail('wildcard called')
  })
  router.on('/:match', function (params) {
    t.ok(true, 'param called')
  })
  router('/foo')

  router = wayfarer()
  router.on('/*', function (params) {
    t.fail('wildcard called')
  })
  router.on('/:match/foo', function (params) {
    t.ok(true, 'param called')
  })
  router('/foo/foo')

  router = wayfarer()
  router.on('/*', function (params) {
    t.ok(true, 'wildcard called')
  })
  router.on('/:match/foo', function (params) {
    t.fail('param called')
  })
  router('/foo/bar')
})

test('safe decodeURIComponent', (t) => {
  t.plan(1)
  var r = wayfarer('/404')
  r.on('/test/:id', function (params) {
    t.fail('we should not be here')
  })
  r.on('/404', function () {
    t.ok(true, 'called')
  })
  r('/test/hel%"Flo')
})

test('safe decodeURIComponent - nested route', (t) => {
  t.plan(1)
  var r = wayfarer('/404')
  r.on('/test/hello/world/:id/blah', function (params) {
    t.fail('we should not be here')
  })
  r.on('/404', function () {
    t.ok(true, 'called')
  })
  r('/test/hello/world/hel%"Flo/blah')
})

test('safe decodeURIComponent - wildcard', (t) => {
  t.plan(1)
  var r = wayfarer('/404')
  r.on('/test/*', function (params) {
    t.fail('we should not be here')
  })
  r.on('/404', function () {
    t.ok(true, 'called')
  })
  r('/test/hel%"Flo')
})

test('should expose .route property', (t) => {
  var r = wayfarer()
  r.on('/foo', function () {})
  t.deepEqual(r.match('/foo').route, '/foo', 'exposes route property')
  t.end()
})

test('should be called with self', (t) => {
  var r = wayfarer()
  r.on('/foo', function callback () {
    t.deepEqual(this, callback, 'calling context is self')
    t.end()
  })
  r('/foo')
})

test('can register callback on many routes', (t) => {
  t.plan(6)
  var r = wayfarer()
  var routes = ['/foo', '/bar']
  r.on('/foo', callback)
  r.on('/bar', callback)
  for (var i = 0, len = routes.length, matched; i < len; i++) {
    matched = r.match(routes[i])
    t.deepEqual(matched.cb, callback, 'matched callback is same')
    t.deepEqual(matched.route, routes[i], 'matched route is same')
    r(routes[i])
  }
  function callback () {
    t.deepEqual(this, callback, 'calling context is same')
  }
})
