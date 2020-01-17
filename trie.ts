export type EmitterCallback = (...args: any[]) => void

export interface Params {
  [key: string]: string
}

export interface TrieNode {
  wildcard?: boolean
  name?: string
  nodes?: TrieNode,
  cb?: EmitterCallback,
  route?: string,
  params?: {
    [key: string]: string
  }
}

export const paramSym = Symbol()

export interface TrieInterface {
  create: (route: string) => TrieNode
  match: (route: string) => TrieNode
  mount: (route: string, node: TrieNode) => void 
  trie: TrieNode
}

export class Trie implements TrieInterface {
  trie: TrieNode
  private paramRE = /^:|^\*/

  constructor () {
    this.trie = {nodes: {}}
  }

  create (route: string): TrieNode {
    const routes = this.splitRoutes(route)
    return this.createNode(routes, 0, this.trie)
  }

  match (route: string): TrieNode {
    const routes = this.splitRoutes(route)
    const params = {}
    const node = this.search(routes, 0, this.trie, params)
    if (!node) return
    return Object.assign({params}, node)
  }

  mount (route: string, trie: TrieNode): void {
    const routes = this.splitRoutes(route)
    const key = routes[0]
    const head = routes.length === 1 ? key : routes.join('/')
    const node = this.create(head)

    Object.assign(node.nodes, trie.nodes)
    if (trie.name) node.name = trie.name

    // delegate properties from '/' to the new node
    // '/' cannot be reached once mounted
    if (node.nodes['']) {
      Object.keys(node.nodes['']).forEach((key: string) => {
        if (key === 'nodes') return
        node[key] = node.nodes[''][key]
      })
      Object.assign(node.nodes, node.nodes[''].nodes)
      delete node.nodes[''].nodes
    }
  }
   
  private splitRoutes (route: string): string[] {
    const leadingSlashRE = /^\//
    return route.replace(leadingSlashRE, '').split('/')
  }
  
  private search (routes: string[], index: number, trie: TrieNode, params: Params): TrieNode {
    if (typeof trie === 'undefined') return
    if (routes.length === 0) return trie
    const route = routes.shift()

    if (trie.nodes.hasOwnProperty(route)) {
      return this.search(routes, ++index, trie.nodes[route], params)
    } else if (trie.name) {
      try {
        params[trie.name] = decodeURIComponent(route)
      } catch (e) {
        return this.search(routes, index, undefined, params)
      }
      return this.search(routes, ++index, trie.nodes[paramSym], params)
    } else if (trie.wildcard) {
      try {
        params['wildcard'] = decodeURIComponent([route].concat(routes).join('/'))
      } catch (e) {
        return this.search(routes, ++index, undefined, params)
      }

      return trie.nodes[paramSym]
    } else {
      return this.search(routes, ++index, undefined, params)
    }
  }

  private createNode (routes: string[], index: number, trie: TrieNode): TrieNode {
    if (routes.length === 0) return trie  
    const route = routes.shift()

    let node = {nodes: {}}
    if (this.paramRE.test(route)) {
      // We have found a parameter, so we need to mark this node with a name
      // and store the parameter data in a specific key gather later.  If this is
      // a wildcard route, enable the flag
      if (!trie.nodes.hasOwnProperty(paramSym)) {
        trie.nodes[paramSym] = node
      } else {
        node = trie.nodes[paramSym]
      }

      if (route.startsWith('*')) {
        trie.wildcard = true
      }

      trie.name = route.replace(this.paramRE, '')
    } else if (!trie.nodes.hasOwnProperty(route)) {
      trie.nodes[route] = node
    } else {
      node = trie.nodes[route]
    }

    return this.createNode(routes, ++index, node)
  }
}