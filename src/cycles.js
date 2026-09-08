// src/cycles.js -- SOVEREIGNTY cycle manager

import { H, DAILY_TARGET, MAX_CYCLES_DAY } from './config.js'

// For Sovereignty -- max cycles derived from propeller target and live flash
const SOVEREIGNTY_MAX_CYCLES = 10_000_000  // same as Resonance -- governed by propeller

let cyclesDay=0, cyclesAll=0, dayResetTs=Date.now()+86_400_000

export function recordCycle(HOT) {
  if (Date.now()>dayResetTs) { cyclesDay=0; dayResetTs=Date.now()+86_400_000 }
  cyclesDay++; cyclesAll++
  HOT[H.CYCLES_TODAY]=cyclesDay; HOT[H.CYCLES_TOTAL]=cyclesAll
  return cyclesDay <= SOVEREIGNTY_MAX_CYCLES
}

export function getCycleStats() {
  return { today:cyclesDay, total:cyclesAll, maxPerDay:SOVEREIGNTY_MAX_CYCLES }
}

export function startCycles(HOT) {
  HOT[H.CYCLES_TODAY]=0; HOT[H.CYCLES_TOTAL]=0
  console.log('[CYCLES] Cycle manager active | SP1-P10 propeller governs throughput')
}
