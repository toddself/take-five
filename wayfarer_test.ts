import {
  assert,
  assertEquals,
  assertThrows
} from 'https://deno.land/std/testing/asserts.ts'

import { wayfarer } from './wayfarer.ts'

Deno.test({
  name: 'should match a path',
  fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/', function () {
        assert(true, 'called')
        resolve()
      })
      r('/')
    })
  }
})

Deno.test({
  name: 'should match a nested path',
  fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/foo/bar', function () {
        assert(true, 'called')
        resolve()
      })
      r('/foo/bar')
    })
  }
})

Deno.test({
  name: 'should match a default path',
  fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer('/404')
      r.on('/404', function () {
        assert(true, 'default')
        resolve()
      })
      r('/nope')
    })
  }
})

Deno.test({
  name: 'should allow passing of extra values',
  fn (): Promise<void> {
    return new Promise((resolve) => {
      var foo = {}
      var bar = {}
      var r = wayfarer()
      r.on('/foo', function (params, arg1, arg2) {
        assertEquals(arg1, foo, 'arg1 was passed')
        assertEquals(arg2, bar, 'arg2 was passed')
        resolve()
      })
      r('/foo', foo, bar)
    })
  }
})

Deno.test({
  name: '.emit() should match paths',
  fn(): Promise<void> {
    let _catch = 0
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/foo/bar', function (param) {
        ++_catch
        assert(true, 'bar called')
        if (_catch === 2) resolve()
      })
      r.on('/foo/baz', function (param) {
        ++_catch
        assert(true, 'baz called')
        if (_catch === 2) resolve()
      })
      r('/foo/bar')
      r('/foo/baz')
    })
  }
})

Deno.test({
  name: '.match() should match paths',
  fn(): Promise<void> {
    return new Promise((resolve, reject) => {
      var r = wayfarer()
      r.on('/foo/bar', function () {
        assert(false, 'should not call callback')
        reject()
      })

      r.on('/foo/baz', () => {})

      var bar = r.match('/foo/bar')
      assertEquals(bar.route, '/foo/bar', '/foo/bar route exists')

      var baz = r.match('/foo/baz')
      assertEquals(baz.route, '/foo/baz', '/foo/baz route exists')
      setTimeout(resolve, 1)
    })
  }
})

Deno.test({
  name: '.emit() should match partials',
  fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/:user', function (param) {
        assertEquals(param.user, 'tobi', 'param matched')
        resolve()
      })
      r('/tobi')
    })
  }
})

Deno.test({
  name: '.match() should match partials',
  fn(): void {
    var r = wayfarer()
    r.on('/:user', () => {})
    var toby = r.match('/tobi')
    assertEquals(toby.params.user, 'tobi')
  }
})

Deno.test({
  name: '.emit() should match paths before partials',
  fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/foo', function () {
        assert(true, 'called')
        resolve()
      })
      r.on('/:user', () => {})
      r('/foo')
    })
  }
})

Deno.test({
  name: '.emit() should allow path overriding',
  fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/:user', function () {
        assert(false, 'wrong callback called')
        resolve()
      })
      r.on('/:user', function () {
        assert(true, 'called')
        resolve()
      })
      r('/foo')
    })
  }
})

Deno.test({
  name: '.emit() should match nested partials',
  fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/:user/:name', function (param) {
        assertEquals(param.user, 'tobi', 'param matched')
        assertEquals(param.name, 'baz', 'param matched')
        resolve()
      })
      r('/tobi/baz')
    })
  }
})

Deno.test({
	name: '.emit() should parse encoded params',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/:channel', function (param) {
        assertEquals(param.channel, '#choo', 'param matched')
        resolve()
      })
      r('/%23choo')
    })
	}
})

Deno.test({
	name: '.emit() should throw if no matches are found',
	fn(): void {
    var r1 = wayfarer()
    assertThrows(r1.bind(r1, '/woops'))
	}
})

Deno.test({
	name: '.emit() should return values',
	fn(): void {
    var r1 = wayfarer()
    r1.on('/foo', function () {
      return 'hello'
    })
    assertEquals(r1('foo'), 'hello', 'returns value')
	}
})

Deno.test({
	name: '.emit() mount subrouters',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      let _catch = 0
      var r4 = wayfarer()
      var r3 = wayfarer()
      r4.on('/kidlette', function () {
        ++_catch
        assert(true, 'nested 2 levels')
        if (_catch === 4) resolve()
      })
      r3.on('/mom', r4)
      r3('/mom/kidlette')

      var r1 = wayfarer()
      var r2 = wayfarer()
      r2.on('/', function () {
        ++_catch
        assert(true, 'nested 1 level')
        if (_catch === 4) resolve()
      })
      r1.on('/home', r2)
      r1('/home')

      var r5 = wayfarer()
      var r6 = wayfarer()
      r6.on('/child', function (param) {
        ++_catch
        assertEquals(typeof param, 'object', 'param is passed')
        assertEquals(param.parent, 'hello', 'nested 2 levels with params')
        if (_catch === 4) resolve()
      })
      r5.on('/:parent', r6)
      r5('/hello/child')

      var r7 = wayfarer()
      var r8 = wayfarer()
      var r9 = wayfarer()
      r9.on('/bar', function (param) {
        ++_catch
        assert(true, 'nested 3 levels')
        if (_catch === 4) resolve()
      })
      r8.on('/bin', r9)
      r7.on('/foo', r8)
      r7('/foo/bin/bar')
    })
	}
})

Deno.test({
	name: '.emit() should match nested partials of subrouters',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      var r1 = wayfarer()
      var r2 = wayfarer()
      var r3 = wayfarer()
      r3.on('/:grandchild', function (param) {
        assertEquals(param.parent, 'bin', 'nested 3 levels with params')
        assertEquals(param.child, 'bar', 'nested 3 levels with params')
        assertEquals(param.grandchild, 'baz', 'nested 3 levels with parmas')
        resolve()
      })
      r2.on('/:child', r3)
      r1.on('/foo/:parent', r2)
      r1('/foo/bin/bar/baz')
    })
	}
})

Deno.test({
	name: '.match() should return nested partials of subrouters',
	fn(): void {
    var r1 = wayfarer()
    var r2 = wayfarer()
    var r3 = wayfarer()
    r3.on('/:grandchild', () => {})
    r2.on('/:child', r3)
    r1.on('/foo/:parent', r2)
    var matched = r1.match('/foo/bin/bar/baz')
    assertEquals(matched.params.parent, 'bin')
    assertEquals(matched.params.child, 'bar')
    assertEquals(matched.params.grandchild, 'baz')
	}
})

Deno.test({
	name: '.match() returns a handler of a route',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/:user', function () {
        assert(true, 'called')
        resolve()
      })
      var toby = r.match('/tobi')
      toby.cb()
    })
	}
})

Deno.test({
	name: 'nested routes should call parent default route',
	fn(): Promise<void> {
    return new Promise((resolve) => {
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
        assert(true, 'called')
        resolve()
      }
    })
	}
})

Deno.test({
	name: 'aliases',
	fn(): void {
    var r = wayfarer()
    assertEquals(r, r.emit)
  }
})

Deno.test({
	name: 'wildcards',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      let _catch = 0
      var r = wayfarer()

      r.on('/bar/*', function (params) {
        ++_catch
        assertEquals(params.wildcard, 'foo/beep/boop')
        if (_catch === 2) resolve()
      })

      r.on('/foo/:match/*', function (params) {
        ++_catch
        assertEquals(params.match, 'bar')
        assertEquals(params.wildcard, 'beep/boop')
        if (_catch === 2) resolve()
      })

      r('/bar/foo/beep/boop')
      r('/foo/bar/beep/boop')
    })
	}
})

Deno.test({
	name: 'wildcards dont conflict with params',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      let _catch = 0
      let router = wayfarer()
      router.on('/*', function (params) {
        ++_catch
        assert(false, 'wildcard called')
        if (_catch === 6) resolve()
      })
      router.on('/:match', function (params) {
        ++_catch
        assert(true, 'param called')
        if (_catch === 6) resolve()
      })
      router('/foo')

      router = wayfarer()
      router.on('/*', function (params) {
        ++_catch
        assert(false, 'wildcard called')
        if (_catch === 6) resolve()
      })
      router.on('/:match/foo', function (params) {
        ++_catch
        assert(true, 'param called')
        if (_catch === 6) resolve()
      })
      router('/foo/foo')

      router = wayfarer()
      router.on('/*', function (params) {
        ++_catch
        assert(true, 'wildcard called')
        if (_catch === 6) resolve()
      })
      router.on('/:match/foo', function (params) {
        ++_catch
        assert(false, 'param called')
        if (_catch === 6) resolve()
      })
      router('/foo/bar')
    })
	}
})

Deno.test({
	name: 'safe decodeURIComponent',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      let _catch = 0
      var r = wayfarer('/404')
      r.on('/Deno.test/:id', function (params) {
        ++_catch
        assert(false, 'we should not be here')
        if (_catch === 2) resolve()
      })
      r.on('/404', function () {
        ++_catch
        assert(true, 'called')
        if (_catch === 2) resolve()
      })
      r('/Deno.test/hel%"Flo')
    })
	}
})

Deno.test({
	name: 'safe decodeURIComponent - nested route',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      let _catch = 0
      var r = wayfarer('/404')
      r.on('/Deno.test/hello/world/:id/blah', function (params) {
        ++_catch
        assert(false, 'we should not be here')
        if (_catch === 2) resolve()
      })
      r.on('/404', function () {
        ++_catch
        assert(true, 'called')
        if (_catch === 2) resolve()
      })
      r('/Deno.test/hello/world/hel%"Flo/blah')
    })
  }
})

Deno.test({
	name: 'safe decodeURIComponent - wildcard',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      let _catch = 0
      var r = wayfarer('/404')
      r.on('/Deno.test/*', function (params) {
        ++_catch
        assert(false, 'we should not be here')
        if (_catch === 2) resolve()
      })
      r.on('/404', function () {
        ++_catch
        assert(true, 'called')
        if (_catch === 2) resolve()
      })
      r('/Deno.test/hel%"Flo')
    })
	}
})

Deno.test({
	name: 'should expose .route property',
	fn(): void {
    var r = wayfarer()
    r.on('/foo', function () {})
    assertEquals(r.match('/foo').route, '/foo', 'exposes route property')
	}
})

Deno.test({
	name: 'should be called with self',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      var r = wayfarer()
      r.on('/foo', function callback () {
        assertEquals(this, callback, 'calling context is self')
        resolve()
      })
      r('/foo')
    })
	}
})

Deno.test({
	name: 'can register callback on many routes',
	fn(): Promise<void> {
    return new Promise((resolve) => {
      let _catch = 0
      var r = wayfarer()
      var routes = ['/foo', '/bar']
      r.on('/foo', callback)
      r.on('/bar', callback)
      for (var i = 0, len = routes.length, matched; i < len; i++) {
        matched = r.match(routes[i])
        assertEquals(matched.cb, callback, 'matched callback is same')
        assertEquals(matched.route, routes[i], 'matched route is same')
        r(routes[i])
      }
      function callback () {
        ++_catch
        assertEquals(this, callback, 'calling context is same')
        if (_catch === 2) resolve()
      }
    })
	}
})

await Deno.runTests()
