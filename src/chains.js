// src/chains.js -- SOVEREIGNTY chain monitor (Worker)
// 20 chains -- every qualifying event detected
// 80MB hard cap (resourceLimits in index.js)

import { workerData, parentPort } from 'worker_threads'
import { createRequire }          from 'module'
import { WS_CHAINS, CHAIN_HOT, H } from './config.js'

const _req = createRequire(import.meta.url)
const ws   = _req('ws')

const SAB = workerData.SAB
const HOT = new Float64Array(SAB)
let   swapCount = 0

const SWAP_V3 = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
const SWAP_V2 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'

function connectChain(chain, delayMs) {
  const slot = CHAIN_HOT[chain.name]
  let socket, reconnecting = false

  const connect = () => {
    if (reconnecting) return
    try { socket?.terminate() } catch {}
    try {
      socket = new ws(chain.ws, {
        handshakeTimeout:  10_000,
        maxPayload:        32 * 1024,
        perMessageDeflate: false,
      })
    } catch { return }

    socket.on('open', () => {
      reconnecting = false
      if (slot !== undefined) HOT[slot] = 1
      HOT[H.CHAIN_COUNT] = Object.values(CHAIN_HOT).filter(s => HOT[s]===1).length
      socket.send(JSON.stringify({
        jsonrpc:'2.0', id:chain.id, method:'eth_subscribe',
        params:['logs', { topics:[SWAP_V3] }],
      }))
    })

    socket.on('message', raw => {
      try {
        const str = raw.toString('utf8',0,200)
        if (!str.includes('"params"')) return
        const msg = JSON.parse(raw)
        if (!msg?.params?.result?.transactionHash) return
        swapCount++
        HOT[H.NATURAL_TODAY] = swapCount
        parentPort.postMessage({ type:'swap', chain:chain.name, hash:msg.params.result.transactionHash.slice(0,20) })
      } catch {}
    })

    socket.on('close', () => {
      if (slot !== undefined) HOT[slot] = 0
      HOT[H.CHAIN_COUNT] = Math.max(0,(HOT[H.CHAIN_COUNT]||1)-1)
      reconnecting=true
      setTimeout(()=>{ reconnecting=false; connect() }, 5_000)
    })

    socket.on('error', () => {
      reconnecting=true
      setTimeout(()=>{ reconnecting=false; connect() }, 8_000)
    })
  }

  setTimeout(connect, delayMs)
}

WS_CHAINS.forEach((chain,idx) => connectChain(chain, idx*500))
console.log(`[CHAINS] ${WS_CHAINS.length} chains connecting | 500ms stagger`)
