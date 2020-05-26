// Copyright 2016-2020 the take-five authors. All rights reserved
// Apache 2.0 license

export type EmitterCallback = (...args: any[]) => void
export const paramSym = Symbol()
export const wildcardSym = Symbol()
export type Params = {[key: string]: string}
export type TrieNodes = Map<string | typeof paramSym, TrieNode>

export interface TrieNodeInterface {
  wildcard: boolean
  name: string
  nodes: TrieNodes
  cb: EmitterCallback | undefined,
  route: string,
}

export class TrieNode implements TrieNodeInterface {
  wildcard: boolean = false
  name: string = ''
  nodes: TrieNodes = new Map()
  cb: EmitterCallback | undefined
  route: string = ''
}


export interface TrieInterface {
  create: (route: string) => TrieNode
  match: (route: string) => [TrieNode | undefined, Params]
  mount: (route: string, node: TrieNode) => void
  trie: TrieNode
}

export class Trie implements TrieInterface {
  trie: TrieNode
  private paramRE = /^:|^\*/

  constructor () {
    this.trie = new TrieNode
  }

  create (route: string): TrieNode {
    const routes = this.splitRoutes(route)
    return this.createNode(routes, 0, this.trie)
  }

  match (route: string): [TrieNode | undefined, Params] {
    const routes = this.splitRoutes(route)
    const params = {}
    const node = this.search(routes, 0, this.trie, params)
    if (!node) return [, {}]
    return [node, params]
  }

  mount (route: string, trie: TrieNode): void {
    const routes = this.splitRoutes(route)
    const key = routes[0]
    const head = routes.length === 1 ? key : routes.join('/')
    const node = this.create(head)

    for (let [key, val] of trie.nodes) {
      node.nodes.set(key, val)
    }
    if (trie.name) node.name = trie.name

    // delegate properties from '/' to the new node
    // '/' cannot be reached once mounted
    if (node.nodes.has('')) {
      const rootNode = node.nodes.get('') as TrieNode
      node.wildcard = rootNode.wildcard
      node.name = rootNode.name
      node.cb = rootNode.cb
      node.route = rootNode.route
      for (let [key, val] of rootNode.nodes) {
        node.nodes.set(key, val)
      }
      delete rootNode.nodes
    }
  }

  private splitRoutes (route: string): string[] {
    const leadingSlashRE = /^\//
    return route.replace(leadingSlashRE, '').split('/')
  }

  private search (routes: string[], index: number, trie: TrieNode | undefined, params: Params): TrieNode | undefined {
    if (typeof trie === 'undefined') return
    if (routes.length === 0) return trie
    const route = routes.shift() as string

    if (trie.nodes.has(route)) {
      const node = trie.nodes.get(route)
      return this.search(routes, ++index, node, params)
    } else if (trie.name !== '') {
      try {
        params[trie.name] = decodeURIComponent(route)
      } catch (e) {
        return this.search(routes, index, undefined, params)
      }
      return this.search(routes, ++index, trie.nodes.get(paramSym), params)
    } else if (trie.wildcard) {
      try {
        params['wildcard'] = decodeURIComponent([route].concat(routes).join('/'))
      } catch (e) {
        return this.search(routes, ++index, undefined, params)
      }
      return trie.nodes.get(paramSym)
    } else {
      return this.search(routes, ++index, undefined, params)
    }
  }

  private createNode (routes: string[], index: number, trie: TrieNode): TrieNode {
    if (routes.length === 0) return trie
    const route = routes.shift() as string

    let node = new TrieNode()
    if (this.paramRE.test(route)) {
      // We have found a parameter, so we need to mark this node with a name
      // and store the parameter data in a specific key gather later.  If this is
      // a wildcard route, enable the flag
      if (!trie.nodes.has(paramSym)) {
        trie.nodes.set(paramSym, node)
      } else {
        node = trie.nodes.get(paramSym) as TrieNode
      }

      if (route.startsWith('*')) {
        trie.wildcard = true
      }

      trie.name = route.replace(this.paramRE, '')
    } else if (!trie.nodes.has(route)) {
      trie.nodes.set(route, node)
    } else {
      node = trie.nodes.get(route) as TrieNode
    }

    return this.createNode(routes, ++index, node)
  }
}
