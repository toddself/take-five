import { EmitterCallback, Trie, TrieNode, Params } from './trie.ts'

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

export interface Emitter extends EmitterCallback {
  (route: string): void
  _trie: Trie
  _wayfarer: boolean
  on: (route: string, cb: RouteCallback) => void
  match: (route: string) => Route
  emit: Emitter
}

class Route implements RouteNode {
  cb: EmitterCallback
  route: string
  params: Params
  private noop: () => void = () => {}

  constructor (matched: TrieNode, params: Params) {
    this.cb = matched.cb || this.noop
    this.route = matched.route
    this.params = params
  }
}

export function wayfarer (dft: string = ''): Emitter {
  const _trie = new Trie()
  const _default = dft.replace(/^\//, '')
  emit.on = on
  emit.emit = emit
  emit.match = match
  emit._wayfarer = true
  emit._trie = _trie

  return emit

  function on (route: string = '/', cb: RouteCallback): Emitter {
   if (cb._wayfarer && cb._trie) {
     _trie.mount(route, cb._trie.trie)
   } else {
     const node = _trie.create(route)
     node.cb = cb
     node.route = route
   }

   return emit
  }

  function emit (route: string): void {
    const matched = match(route)
    const args = Array.from(arguments)
    args[0] = matched.params
    if (!matched.cb) throw new Error('Routing table missing callback')
    return matched.cb.apply(matched.cb, args)
  }

  function match (route: string): Route {
    const [matched, params] = _trie.match(route)
    if (matched && matched.cb) return new Route(matched, params)
    const [dft] = _trie.match(_default)
    if (dft && dft.cb) return new Route(dft, params)

    throw new Error(`route ${route} did not match`)
  }
}
