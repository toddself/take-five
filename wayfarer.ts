import { EmitterCallback, Trie, Params } from './trie'

export interface RouteNode  {
  cb: EmitterCallback
  route: string
  params: Params
}

export interface RouteCallback {
  (...args: any[]): any
  _wayfarer?: boolean
  _cb?: EmitterCallback
  _trie?: Trie
}

export interface Emitter {
  _trie: Trie
  _wayfarer: boolean
  emit: (route: string) => void
  on: (route: string, cb: RouteCallback) => void
  match: (route: string) => RouteNode
}

class Route implements RouteNode {
  cb: EmitterCallback
  route: string
  params: Params

  constructor (matched: RouteNode) {
    this.cb = matched.cb
    this.route = matched.route
    this.params = matched.params
  }
}

class Emit implements Emitter {
  _trie:  Trie
  _default:  string
  _wayfarer: boolean

  constructor (_trie, _default) {
    this._wayfarer = true
    this._trie = _trie
    this._default = _default
  }

  emit (route: string): Emitter {
    const matched = this.match(route)
    const args = Array.from(arguments)
    args[0] = matched.params
    return matched.cb.apply(matched.cb, args)
  }

  on (route: string = '/', cb: RouteCallback) {
   if (cb._wayfarer && cb._trie) {
     this._trie.mount(route, cb._trie.trie)
   } else {
     const node = this._trie.create(route)
     node.cb = cb
     node.route = route
   }
  }

  match (route: string): Route {
    const matched = this._trie.match(route)
    if (matched && matched.cb) return new Route(matched as RouteNode)
    const dft = this._trie.match(this._default)
    if (dft && dft.cb) return new Route(dft as RouteNode)

    throw new Error(`route ${route} did not match`)
  }
}

export function wayfarer (dft: string = ''): Emitter {
  const _trie = new Trie()
  const _default = dft.replace(/^\//, '')

  return new Emit(_trie, _default)
}
