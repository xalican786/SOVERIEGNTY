// src/log.js -- SOVEREIGNTY diagnostics
// 5 logs per minute | starts 15s after boot
// Shows: memory, contracts, chains, algorithm, live flash, reconciliation, revenue
// Zero emojis

import { existsSync, readFileSync } from 'fs'
import { ethers }  from 'ethers'
import {
  H, SYSTEM, VERSION, MODEL, EXECUTOR,
  CONTRACT, CHAINS, CHAIN_HOT,
  LIVE_FLASH, PROPELLER, ACTIVE_PROPELLER, DAILY_TARGET,
} from './config.js'

const ADDR_PATH = '/data/sovereignty_contracts.json'
const SEP       = '-'.repeat(60)
let   diagCount = 0
let   diagTimer = null

function fB(n) {
  if (!n||isNaN(n)||n===0) return '$0'
  const x=Number(n)
  if(x>=1e18) return '$'+(x/1e18).toFixed(2)+' QUINT'
  if(x>=1e15) return '$'+(x/1e15).toFixed(2)+'Q'
  if(x>=1e12) return '$'+(x/1e12).toFixed(2)+'T'
  if(x>=1e9)  return '$'+(x/1e9).toFixed(2)+'B'
  if(x>=1e6)  return '$'+(x/1e6).toFixed(2)+'M'
  if(x>=1e3)  return '$'+(x/1e3).toFixed(1)+'K'
  return '$'+x.toFixed(2)
}

function fmtTime(s) {
  s=s|0
  if(s<60)   return s+'s'
  if(s<3600) return (s/60|0)+'m '+(s%60)+'s'
  return (s/3600|0)+'h '+(s%3600/60|0)+'m'
}

function memDiag() {
  const m=process.memoryUsage()
  const heap=Math.round(m.heapUsed/1024/1024), tot=Math.round(m.heapTotal/1024/1024)
  const rss =Math.round(m.rss/1024/1024), pct=Math.round(heap/tot*100)
  const status=pct>85?'WARNING':pct>70?'MODERATE':'OK'
  return { heap, tot, rss, pct, status, warn:pct>85 }
}

function contractDiag() {
  const names=Object.entries(CONTRACT)
  let deployed=0; const missing=[]
  for (const [key,val] of names) {
    if (val&&ethers.isAddress(val)) deployed++
    else missing.push(key.replace('SOVEREIGNTY_',''))
  }
  let savedAt=null
  try {
    if(existsSync(ADDR_PATH)) {
      const d=JSON.parse(readFileSync(ADDR_PATH,'utf8'))
      if(d.deployedAt) savedAt=new Date(d.deployedAt).toLocaleTimeString()
    }
  } catch {}
  return { deployed, total:names.length, missing:missing.slice(0,3), savedAt }
}

function chainDiag(HOT) {
  const on=[],off=[]
  for (const c of CHAINS) {
    const slot=CHAIN_HOT[c.name]
    if(slot!==undefined&&HOT[slot]===1) on.push(c.name)
    else off.push(c.name)
  }
  return { on, off, total:CHAINS.length }
}

function runDiag(HOT) {
  diagCount++
  const time  =new Date().toISOString().slice(11,19)
  const uptime=HOT[H.UPTIME]|0
  const mem   =memDiag()
  const ctrs  =contractDiag()
  const chains=chainDiag(HOT)

  const liveFlash    = HOT[H.LIVE_FLASH]    || 0
  const liveExtract  = HOT[H.LIVE_EXTRACT]  || 0
  const algoPass     = HOT[H.ALGO_PASS]     === 1
  const algoFlash    = HOT[H.ALGO_FLASH]    || 0
  const algoGas      = HOT[H.ALGO_GAS]      || 0
  const reconGap     = HOT[H.RECON_GAP]     || 0
  const reconHealthy = HOT[H.RECON_HEALTHY] === 1
  const reconCnt     = HOT[H.RECON_COUNT]   | 0
  const treasuryLive = HOT[H.TREASURY_ONCHAIN]||0
  const gasPrice     = HOT[H.GAS_PRICE]     || 0
  const gasOK        = HOT[H.GAS_OK]        === 1
  const prop         = 'P' + (HOT[H.PROPELLER]|0)
  const natToday     = HOT[H.NATURAL_TODAY]  |0

  console.log(`\n[DIAG #${diagCount}] ${SYSTEM} v${VERSION} Model:${MODEL} | ${time} | up: ${fmtTime(uptime)}`)
  console.log(SEP)

  // 1. MEMORY
  const memFlag=mem.warn?' | WARNING: near Railway limit':''
  console.log(`[MEM]  ${mem.heap}MB/${mem.tot}MB heap (${mem.pct}%) ${mem.status} | rss: ${mem.rss}MB${memFlag}`)

  // 2. CONTRACTS
  if (ctrs.deployed===ctrs.total) {
    console.log(`[CTRS] ALL ${ctrs.total}/10 deployed${ctrs.savedAt?' ('+ctrs.savedAt+')':''}`)
  } else {
    console.log(`[CTRS] ${ctrs.deployed}/10 deployed | Awaiting 0.1 POL at ${EXECUTOR.slice(0,14)}...`)
    if(ctrs.missing.length) console.log(`[CTRS] Missing: ${ctrs.missing.join(', ')}`)
  }

  // 3. CHAINS
  if (chains.off.length===0) {
    console.log(`[CHN]  ALL ${chains.total}/20 connected`)
  } else {
    console.log(`[CHN]  ${chains.on.length}/20 connected${chains.off.length<5?' | offline: '+chains.off.join(','):''}`)
  }

  // 4. LIVE FLASH -- the critical number
  console.log(
    `[FLASH] Live: $${(liveFlash/1e6).toFixed(2)}M | ` +
    `Extract target: $${(liveExtract/1e6).toFixed(2)}M (10%) | ` +
    `Algorithm last: $${(algoFlash/1e6).toFixed(2)}M`
  )

  // 5. ALGORITHM -- 7-point check status
  const algoStatus=algoPass?'ALL PASS':'SOME FAIL'
  console.log(
    `[ALGO] ${algoStatus} | Gas: ${algoGas.toFixed(1)} gwei | ` +
    `Cap: 1000 gwei | Pass: ${algoPass}`
  )

  // 6. REVENUE + RECONCILIATION
  console.log(
    `[REV]  Today: ${fB(HOT[H.REV_TODAY]||0)} | Net: ${fB(HOT[H.NET_TODAY]||0)} | ` +
    `All-time: ${fB(HOT[H.REV_TOTAL]||0)}`
  )
  console.log(
    `[RECON] ${reconCnt} checks | Healthy: ${reconHealthy} | ` +
    `Treasury on-chain: $${(treasuryLive/1e6).toFixed(2)}M | ` +
    `Gap: $${(reconGap/1e6).toFixed(2)}M`
  )

  // 7. PROPELLER
  console.log(
    `[PROP] ${prop} (P5 default) | Target: ${fB(HOT[H.DAILY_TARGET]||0)}/day | ` +
    `Cycles: ${HOT[H.CYCLES_TODAY]|0} | Detected: ${natToday}`
  )

  // WARNINGS
  if (mem.warn)
    console.log('[WARNING] Memory above 85% -- Railway may restart')
  if (!gasOK)
    console.log(`[WARNING] Gas ${gasPrice.toFixed(1)} gwei exceeds 1000 cap -- executor paused`)
  if (!algoPass && (HOT[H.CYCLES_TODAY]||0)===0 && ctrs.deployed===ctrs.total)
    console.log('[WARNING] Algorithm check failing -- review live flash and gas conditions')
  if (!reconHealthy && reconCnt>0)
    console.log('[WARNING] Reconciliation gap detected -- computed revenue exceeds confirmed on-chain')
  if (HOT[H.ALGO_LAST_TS]&&(Date.now()-HOT[H.ALGO_LAST_TS])>120_000)
    console.log('[WARNING] Algorithm check not running -- executor may be idle')

  console.log(SEP)
}

export function startLogger(HOT) {
  console.log('[LOG] Diagnostics starting in 15s')
  setTimeout(()=>{
    console.log(`\n[LOG] Diagnostic system active | 5/min | ${SYSTEM} v${VERSION}`)
    runDiag(HOT)
    diagTimer=setInterval(()=>runDiag(HOT),12_000)
  }, 15_000)
}

export function stopLogger() {
  if (diagTimer) { clearInterval(diagTimer); diagTimer=null }
}
