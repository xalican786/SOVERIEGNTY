// src/log.js -- SOVEREIGNTY diagnostics
// 5 logs per minute | starts 15s after boot
// Algorithm shows PENDING when contracts not deployed
// Memory warning threshold: 85%

import { existsSync, readFileSync } from 'fs'
import { ethers }  from 'ethers'
import {
  H, SYSTEM, VERSION, MODEL, EXECUTOR,
  CONTRACT, CHAINS, CHAIN_HOT,
  PROPELLER, ACTIVE_PROPELLER,
} from './config.js'

const ADDR_PATH = '/data/sovereignty_contracts.json'
const SEP       = '-'.repeat(60)
let   diagCount = 0
let   diagTimer = null

function fB(n) {
  if (!n || isNaN(n) || n === 0) return '$0'
  const x = Number(n)
  if (x >= 1e24) return '$' + (x/1e24).toFixed(2) + ' SEPT'
  if (x >= 1e21) return '$' + (x/1e21).toFixed(2) + ' SEXT'
  if (x >= 1e18) return '$' + (x/1e18).toFixed(2) + ' QUINT'
  if (x >= 1e15) return '$' + (x/1e15).toFixed(2) + 'Q'
  if (x >= 1e12) return '$' + (x/1e12).toFixed(2) + 'T'
  if (x >= 1e9)  return '$' + (x/1e9).toFixed(2)  + 'B'
  if (x >= 1e6)  return '$' + (x/1e6).toFixed(2)  + 'M'
  if (x >= 1e3)  return '$' + (x/1e3).toFixed(1)  + 'K'
  return '$' + x.toFixed(2)
}

function fmtTime(s) {
  s = s | 0
  if (s < 60)   return s + 's'
  if (s < 3600) return (s / 60 | 0) + 'm ' + (s % 60) + 's'
  return (s / 3600 | 0) + 'h ' + (s % 3600 / 60 | 0) + 'm'
}

function memDiag() {
  const m    = process.memoryUsage()
  const heap = Math.round(m.heapUsed  / 1024 / 1024)
  const tot  = Math.round(m.heapTotal / 1024 / 1024)
  const rss  = Math.round(m.rss       / 1024 / 1024)
  const pct  = Math.round(heap / tot  * 100)
  const status = pct > 85 ? 'WARNING' : pct > 70 ? 'MODERATE' : 'OK'
  return { heap, tot, rss, pct, status, warn: pct > 85 }
}

function contractDiag() {
  const entries = Object.entries(CONTRACT)
  let deployed  = 0
  const missing = []

  for (const [key, val] of entries) {
    if (val && ethers.isAddress(val)) deployed++
    else missing.push(key.replace('SOVEREIGNTY_', ''))
  }

  let savedAt = null
  try {
    if (existsSync(ADDR_PATH)) {
      const d = JSON.parse(readFileSync(ADDR_PATH, 'utf8'))
      if (d.deployedAt) savedAt = new Date(d.deployedAt).toLocaleTimeString()
    }
  } catch {}

  return {
    deployed,
    total:   entries.length,
    missing: missing.slice(0, 3),
    savedAt,
  }
}

function chainDiag(HOT) {
  const on = [], off = []
  for (const c of CHAINS) {
    const slot = CHAIN_HOT[c.name]
    if (slot !== undefined && HOT[slot] === 1) on.push(c.name)
    else off.push(c.name)
  }
  return { on, off, total: CHAINS.length }
}

function runDiag(HOT) {
  diagCount++
  const time   = new Date().toISOString().slice(11, 19)
  const uptime = HOT[H.UPTIME] | 0
  const mem    = memDiag()
  const ctrs   = contractDiag()
  const chains = chainDiag(HOT)

  const deployed     = ctrs.deployed > 0
  const liveFlash    = HOT[H.LIVE_FLASH]     || 0
  const liveExtract  = HOT[H.LIVE_EXTRACT]   || 0
  const algoPass     = HOT[H.ALGO_PASS]      === 1
  const algoFlash    = HOT[H.ALGO_FLASH]     || 0
  const algoGas      = HOT[H.ALGO_GAS]       || 0
  const algoTs       = HOT[H.ALGO_LAST_TS]   || 0
  const reconGap     = HOT[H.RECON_GAP]      || 0
  const reconHealthy = HOT[H.RECON_HEALTHY]  === 1
  const reconCnt     = HOT[H.RECON_COUNT]    | 0
  const treasuryLive = HOT[H.TREASURY_ONCHAIN]|| 0
  const gasPrice     = HOT[H.GAS_PRICE]      || 0
  const gasOK        = HOT[H.GAS_OK]         === 1
  const natToday     = HOT[H.NATURAL_TODAY]  | 0
  const cycleToday   = HOT[H.CYCLES_TODAY]   | 0

  // Propeller display
  const propNum = HOT[H.PROPELLER] | 0
  const propStr = propNum >= 1 ? 'P' + propNum : 'P5'

  console.log(`\n[DIAG #${diagCount}] ${SYSTEM} v${VERSION} Model:${MODEL} | ${time} | up: ${fmtTime(uptime)}`)
  console.log(SEP)

  // 1. MEMORY
  const memNote = mem.warn ? ' | WARNING: near Railway limit' : ''
  console.log(
    `[MEM]  ${mem.heap}MB/${mem.tot}MB heap (${mem.pct}%) ${mem.status}` +
    ` | rss: ${mem.rss}MB${memNote}`
  )

  // 2. CONTRACTS
  if (ctrs.deployed === ctrs.total) {
    console.log(
      `[CTRS] ALL ${ctrs.total}/10 deployed` +
      (ctrs.savedAt ? ` (${ctrs.savedAt})` : '')
    )
  } else {
    console.log(
      `[CTRS] ${ctrs.deployed}/${ctrs.total} deployed | Awaiting 0.1 POL at ${EXECUTOR.slice(0, 14)}...`
    )
    if (ctrs.missing.length) {
      console.log(`[CTRS] Missing: ${ctrs.missing.join(', ')}`)
    }
  }

  // 3. CHAINS
  if (chains.off.length === 0) {
    console.log(`[CHN]  ALL ${chains.total}/20 connected`)
  } else {
    const offStr = chains.off.length < 5 ? ' | offline: ' + chains.off.join(',') : ''
    console.log(`[CHN]  ${chains.on.length}/20 connected${offStr}`)
  }

  // 4. LIVE FLASH -- always show, always real
  console.log(
    `[FLASH] Live: $${(liveFlash/1e6).toFixed(2)}M` +
    ` | Extract: $${(liveExtract/1e6).toFixed(2)}M (10%)` +
    ` | Last algo read: $${(algoFlash/1e6).toFixed(2)}M`
  )

  // 5. ALGORITHM -- context-aware status
  // When contracts not deployed: PENDING (not FAIL -- algorithm hasn't run)
  // When contracts deployed and not passing: SOME FAIL
  // When all passing: ALL PASS
  let algoStatusStr
  if (!deployed) {
    // Algorithm hasn't run yet -- contracts not deployed
    algoStatusStr = `PENDING DEPLOYMENT | gas will read after first cycle`
  } else if (algoTs === 0) {
    // Deployed but no check run yet
    algoStatusStr = `INITIALISING | first cycle pending`
  } else if (algoPass) {
    algoStatusStr = `ALL PASS | gas: ${algoGas.toFixed(1)} gwei | flash: $${(algoFlash/1e6).toFixed(2)}M`
  } else {
    algoStatusStr = `SOME FAIL | gas: ${algoGas.toFixed(1)} gwei | check executor logs`
  }
  console.log(`[ALGO] ${algoStatusStr}`)

  // 6. REVENUE
  console.log(
    `[REV]  Today: ${fB(HOT[H.REV_TODAY]||0)}` +
    ` | Net: ${fB(HOT[H.NET_TODAY]||0)}` +
    ` | All-time: ${fB(HOT[H.REV_TOTAL]||0)}`
  )

  // 7. RECONCILIATION -- on-chain treasury
  if (reconCnt === 0) {
    console.log(`[RECON] No checks yet | treasury read pending | runs 30s after boot`)
  } else {
    const healthStr = reconHealthy ? 'Healthy' : 'WARNING: Gap detected'
    console.log(
      `[RECON] ${reconCnt} checks | ${healthStr}` +
      ` | Treasury on-chain: $${(treasuryLive/1e6).toFixed(2)}M` +
      ` | Gap: $${(reconGap/1e6).toFixed(2)}M`
    )
  }

  // 8. PROPELLER
  const gasStr = gasOK
    ? `${gasPrice.toFixed(1)} gwei (OK)`
    : `${gasPrice.toFixed(1)} gwei (PAUSED -- exceeds 1000 cap)`

  console.log(
    `[PROP] ${propStr} (P5 default)` +
    ` | Target: ${fB(HOT[H.DAILY_TARGET]||0)}/day` +
    ` | Cycles: ${cycleToday}` +
    ` | Detected: ${natToday}`
  )
  console.log(`[GAS]  ${gasStr} | Cap: 1000 gwei`)

  // EXEC stats (only show when deployed)
  if (deployed) {
    const execOk   = HOT[H.SUCCESS_TODAY] | 0
    const execFail = HOT[H.FAIL_TODAY]    | 0
    const execRate = (execOk + execFail) > 0
      ? Math.round(execOk / (execOk + execFail) * 100)
      : 0
    console.log(
      `[EXEC] Speed: ${(HOT[H.EXEC_SPEED_MS]||1).toFixed(1)}ms` +
      ` | Success: ${execOk}` +
      ` | Fail: ${execFail}` +
      ` | Rate: ${execRate}%`
    )
  }

  // WARNINGS -- context-aware, no false positives
  if (mem.warn) {
    console.log('[WARNING] Memory above 85% -- Railway may restart')
  }

  if (!gasOK && deployed) {
    console.log(`[WARNING] Gas ${gasPrice.toFixed(1)} gwei exceeds 1000 cap -- executor paused`)
  }

  if (!reconHealthy && reconCnt > 0) {
    console.log('[WARNING] Reconciliation gap -- computed revenue exceeds confirmed on-chain balance')
  }

  // Only warn about algo failing AFTER deployment
  if (deployed && !algoPass && cycleToday === 0 && natToday > 100) {
    console.log('[WARNING] Swaps detected but algorithm not passing -- check live flash and gas')
  }

  if (deployed && algoTs > 0 && (Date.now() - algoTs) > 120_000) {
    console.log('[WARNING] Algorithm check not running for 2+ minutes')
  }

  console.log(SEP)
}

export function startLogger(HOT) {
  console.log('[LOG] Diagnostics starting in 15s')
  setTimeout(() => {
    console.log(`\n[LOG] Diagnostic system active | 5/min | ${SYSTEM} v${VERSION}`)
    runDiag(HOT)
    diagTimer = setInterval(() => runDiag(HOT), 12_000)
  }, 15_000)
}

export function stopLogger() {
  if (diagTimer) { clearInterval(diagTimer); diagTimer = null }
}
