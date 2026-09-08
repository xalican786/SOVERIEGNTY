// src/security.js -- SOVEREIGNTY access control

import { EXECUTOR, TREASURY, H } from './config.js'

const RATE_WINDOW  = 60_000
const MAX_PER_MIN  = 1000
let callCount=0, windowStart=Date.now()

export function rateCheck() {
  const now=Date.now()
  if (now-windowStart>RATE_WINDOW) { callCount=0; windowStart=now }
  callCount++
  return callCount<=MAX_PER_MIN
}

export function getSecurityStatus() {
  return {
    executor:       EXECUTOR.slice(0,14)+'...',
    treasury:       'CLASSIFIED',
    rateOK:         callCount<=MAX_PER_MIN,
    callsThisMinute:callCount,
  }
}

export function startSecurity(HOT) {
  console.log('[SECURITY] Access control active | Rate limit: 1000/min | Treasury CLASSIFIED')
}v
