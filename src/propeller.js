// src/propeller.js -- SOVEREIGNTY propeller SP1-P10
// Propeller governs output -- not market conditions
// SP1-SP5: validation tiers | P1-P10: full throughput

import {
  H, PROPELLER, DAILY_TARGET, setPropeller,
  ACTIVE_PROPELLER, LIVE_FLASH,
} from './config.js'

function fB(n) {
  if (!n||isNaN(n)||n===0) return '$0'
  const x=Number(n)
  if(x>=1e21) return '$'+(x/1e21).toFixed(2)+' SEXT'
  if(x>=1e18) return '$'+(x/1e18).toFixed(2)+' QUINT'
  if(x>=1e15) return '$'+(x/1e15).toFixed(2)+'Q'
  if(x>=1e12) return '$'+(x/1e12).toFixed(2)+'T'
  if(x>=1e9)  return '$'+(x/1e9).toFixed(2)+'B'
  if(x>=1e6)  return '$'+(x/1e6).toFixed(2)+'M'
  if(x>=1e3)  return '$'+(x/1e3).toFixed(1)+'K'
  return '$'+x.toFixed(2)
}

const SP_LEVELS = ['SP1','SP2','SP3','SP4','SP5']
const P_LEVELS  = ['P1','P2','P3','P4','P5','P6','P7','P8','P9','P10']

export function getVelocity(HOT) {
  const uptime=HOT[H.UPTIME]||1, rev=HOT[H.REV_TODAY]||0
  return {
    perSecond: rev/uptime, perMinute:rev/uptime*60,
    perHour:   rev/uptime*3600, perDay:rev/uptime*86400,
  }
}

export function getProgress(HOT) {
  const target=DAILY_TARGET, actual=HOT[H.REV_TODAY]||0
  const pct=target>0?Math.min(100,actual/target*100):0
  return { target, actual, pct, remaining:Math.max(0,target-actual) }
}

// Cycles needed = daily target / expected per-cycle profit
// Per-cycle = 10% of live flash
export function cyclesNeeded(HOT) {
  const perCycle = (HOT[H.LIVE_FLASH]||LIVE_FLASH.total) * 0.10
  if (perCycle <= 0) return 0
  const remaining = Math.max(0, DAILY_TARGET - (HOT[H.REV_TODAY]||0))
  return Math.ceil(remaining / perCycle)
}

export function activatePropeller(level, HOT) {
  const ok = setPropeller(level)
  if (!ok) return false
  HOT[H.PROPELLER]     = parseFloat(level.replace('SP','0.').replace('P',''))
  HOT[H.DAILY_TARGET]  = PROPELLER[level]
  HOT[H.CYCLES_NEEDED] = cyclesNeeded(HOT)
  console.log(`[PROPELLER] ${level} | ${fB(PROPELLER[level])}/day`)
  return true
}

export function getPropellerStats() {
  return [...SP_LEVELS, ...P_LEVELS].map(level => ({
    level,
    target:        PROPELLER[level],
    targetDisplay: fB(PROPELLER[level]) + '/day',
    active:        level === ACTIVE_PROPELLER,
    isSP:          SP_LEVELS.includes(level),
    isDefault:     level === 'P5',
    isP10:         level === 'P10',
  }))
}

export function startPropeller(HOT) {
  HOT[H.PROPELLER]    = 5   // P5 index
  HOT[H.DAILY_TARGET] = PROPELLER.P5
  HOT[H.CYCLES_NEEDED]= cyclesNeeded(HOT)
  console.log(`[PROPELLER] P5 default | ${fB(PROPELLER.P5)}/day`)
}
