// src/reconciler.js -- SOVEREIGNTY on-chain treasury reconciliation
// Reads actual USDC balance from treasury every 100 cycles
// Compares computed vs confirmed -- gap detection
// This is the answer made visible

import { ethers }     from 'ethers'
import { H, TREASURY, PRIMARY_CHAIN } from './config.js'

const USDC_ABI = ['function balanceOf(address) view returns (uint256)']
const USDC     = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

let reconLog = []

function makeProvider() {
  const c = PRIMARY_CHAIN
  const n = new ethers.Network(c.name, c.id)
  return new ethers.JsonRpcProvider(c.http, n, { staticNetwork:n })
}

// Read actual on-chain treasury balance
export async function readTreasuryBalance() {
  try {
    const provider = makeProvider()
    const usdc     = new ethers.Contract(USDC, USDC_ABI, provider)
    const bal      = await usdc.balanceOf(TREASURY)
    return Number(bal) / 1e6  // USD value
  } catch { return 0 }
}

// Reconcile -- called every 100 cycles
export async function reconcile(HOT) {
  const computed  = HOT[H.REV_TOTAL] || 0
  const confirmed = await readTreasuryBalance()

  HOT[H.TREASURY_ONCHAIN] = confirmed
  HOT[H.RECON_COMPUTED]   = computed
  HOT[H.RECON_CONFIRMED]  = confirmed

  const gap    = computed > confirmed ? computed - confirmed : 0
  const gapBps = computed > 0 ? Math.round(gap / computed * 10000) : 0
  const healthy= gapBps <= 500  // within 5%

  HOT[H.RECON_GAP]    = gap
  HOT[H.RECON_HEALTHY]= healthy ? 1 : 0
  HOT[H.RECON_COUNT]  = (HOT[H.RECON_COUNT]||0) + 1

  reconLog.push({
    ts:        Date.now(),
    computed,
    confirmed,
    gap,
    gapBps,
    healthy,
    cycleCount: HOT[H.CYCLES_TOTAL]|0,
  })

  if (reconLog.length > 1000) reconLog = reconLog.slice(-1000)

  if (!healthy) {
    console.log(
      `[RECONCILER] WARNING: gap detected | ` +
      `computed: $${(computed/1e6).toFixed(2)}M | ` +
      `confirmed: $${(confirmed/1e6).toFixed(2)}M | ` +
      `gap: ${gapBps}bps`
    )
  } else {
    console.log(
      `[RECONCILER] Healthy | ` +
      `confirmed on-chain: $${(confirmed/1e6).toFixed(2)}M | ` +
      `gap: ${gapBps}bps`
    )
  }

  return { computed, confirmed, gap, gapBps, healthy }
}

export function getReconLog(limit=50) { return reconLog.slice(-limit) }

export function startReconciler(HOT) {
  // Reconcile every 30 seconds on startup, then every 100 cycles
  // Startup reconciliation confirms treasury is readable
  setTimeout(async () => {
    const result = await reconcile(HOT)
    console.log(`[RECONCILER] Initial read: treasury confirmed $${(result.confirmed/1e6).toFixed(2)}M on-chain`)
  }, 30_000)

  // Then check every 5 minutes regardless of cycle count
  setInterval(() => reconcile(HOT).catch(()=>{}), 300_000)

  console.log('[RECONCILER] On-chain treasury reconciliation active | reads every 100 cycles + 5min')
}
