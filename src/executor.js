// src/executor.js -- SOVEREIGNTY executor (Worker)
// Algorithm-gated: ALL 7 checks must pass before firing
// Uses LIVE flash amounts from algorithm.js -- never config.js constants
// 1ms ring poll | nonce mutex | 1000 gwei cap

import { workerData, parentPort } from 'worker_threads'
import { ethers }                 from 'ethers'
import {
  EXECUTOR_PK, EXECUTOR, TREASURY,
  CONTRACT, H, PRIMARY_CHAIN,
  FLASH_ASSETS, GAS_CAP_GWEI, GAS_MARKUP, GAS_LIMIT,
  DAILY_TARGET, AAVE_FEE_RATE,
  getBalancerAmounts, updateLiveFlash, LIVE_FLASH,
} from './config.js'
import { runPrecheck, clearCache } from './algorithm.js'

const SAB = workerData.SAB
const HOT = new Float64Array(SAB)

let _provider = null
function getProvider() {
  if (!_provider) {
    const c = PRIMARY_CHAIN
    const n = new ethers.Network(c.name, c.id)
    _provider = new ethers.JsonRpcProvider(c.http, n, { staticNetwork:n })
  }
  return _provider
}

// Nonce mutex
let nonceLocked=false, nonceQueue=[], currentNonce=null

async function withNonce(fn) {
  return new Promise((resolve,reject)=>{
    nonceQueue.push({fn,resolve,reject}); drainNonce()
  })
}

async function drainNonce() {
  if (nonceLocked||!nonceQueue.length) return
  nonceLocked=true
  const {fn,resolve,reject}=nonceQueue.shift()
  try {
    if (currentNonce===null) currentNonce=await getProvider().getTransactionCount(EXECUTOR,'pending')
    resolve(await fn(currentNonce)); currentNonce++
  } catch(e) { currentNonce=null; reject(e) }
  finally { nonceLocked=false; if (nonceQueue.length) drainNonce() }
}

let activeExecs=0, cycleId=0
const MAX_CONC=3  // conservative -- algorithm checks take time

const SOV_ABI = [
  'function updateLiveFlash(uint256 balancerAmount, uint256 aaveAmount) external',
  'function execute(address[],uint256[],address,uint256,bytes32,uint256) external',
]

async function executeCycle() {
  if (!CONTRACT.SOVEREIGNTY) return
  if ((HOT[H.REV_TODAY]||0) >= DAILY_TARGET) return
  if (activeExecs >= MAX_CONC) return

  activeExecs++
  cycleId++
  HOT[H.EXEC_TODAY] = (HOT[H.EXEC_TODAY]||0) + 1

  const t0 = Date.now()

  try {
    // ── ALGORITHM GATE -- 7-point live check ─────────────────────────────────
    const check = await runPrecheck({
      treasury:    TREASURY,
      HOT,
      H,
      dailyTarget: DAILY_TARGET,
    })

    // Write algorithm check results to HOT for dashboard
    HOT[H.ALGO_PASS]     = check.pass     ? 1 : 0
    HOT[H.ALGO_FLASH]    = check.flashAmount || 0
    HOT[H.ALGO_GAS]      = check.gasGwei  || 0
    HOT[H.ALGO_ORACLE]   = check.ethPrice || 0
    HOT[H.ALGO_TREASURY] = check.treasuryBalance || 0
    HOT[H.ALGO_LAST_TS]  = Date.now()
    HOT[H.LIVE_FLASH]    = check.flashAmount || 0
    HOT[H.LIVE_EXTRACT]  = check.extractTarget || 0

    // Update global LIVE_FLASH from algorithm result
    updateLiveFlash({
      balancer:      check.flashBalancer || 0,
      aave:          check.flashAave     || 0,
      total:         check.flashAmount   || 0,
      extractTarget: check.extractTarget || 0,
    })

    // Critical check failed -- skip this cycle
    if (!check.pass) {
      HOT[H.FAIL_TODAY] = (HOT[H.FAIL_TODAY]||0) + 1
      activeExecs--
      return
    }

    // ── USE LIVE FLASH AMOUNT -- never config.js constants ────────────────────
    const liveFlashBalancer = check.flashBalancer || 0
    const liveFlashAave     = check.flashAave     || 0
    const liveTotal         = check.flashAmount   || 0

    if (liveTotal < 1_000) {
      // Less than $1K available -- not worth firing
      activeExecs--; return
    }

    // ── FIRE TRANSACTION ─────────────────────────────────────────────────────
    const provider = getProvider()
    const signer   = new ethers.Wallet(EXECUTOR_PK, provider)
    const sov      = new ethers.Contract(CONTRACT.SOVEREIGNTY, SOV_ABI, signer)

    const cycleHash = ethers.keccak256(
      ethers.solidityPacked(['uint256','uint256'], [BigInt(cycleId), BigInt(t0)])
    )

    // First update the contract with live flash amounts
    await withNonce(async nonce => {
      const feeData  = await provider.getFeeData()
      const rawGas   = feeData.gasPrice || ethers.parseUnits('50','gwei')
      const capGas   = GAS_CAP_GWEI * BigInt(1e9)
      const gasPrice = rawGas>capGas ? (capGas*GAS_MARKUP)/100n : (rawGas*GAS_MARKUP)/100n

      const tx = await sov.updateLiveFlash(
        BigInt(Math.floor(liveFlashBalancer * 1e6)),
        BigInt(Math.floor(liveFlashAave     * 1e6)),
        { gasLimit:200_000, gasPrice, nonce }
      )
      return tx.wait(1)
    })

    // Build Balancer amounts from live flash
    const balancerAmounts = getBalancerAmounts(liveFlashBalancer)
    const aaveAsset       = FLASH_ASSETS[0]
    const aaveAmount      = BigInt(Math.floor(liveFlashAave * 1e6))

    const receipt = await withNonce(async nonce => {
      const feeData  = await provider.getFeeData()
      const rawGas   = feeData.gasPrice || ethers.parseUnits('50','gwei')
      const capGas   = GAS_CAP_GWEI * BigInt(1e9)
      const gasPrice = rawGas>capGas ? (capGas*GAS_MARKUP)/100n : (rawGas*GAS_MARKUP)/100n

      const tx = await sov.execute(
        FLASH_ASSETS, balancerAmounts,
        aaveAsset, aaveAmount,
        cycleHash, BigInt(cycleId),
        { gasLimit:GAS_LIMIT, gasPrice, nonce }
      )
      return tx.wait(1)
    })

    const elapsed = Date.now() - t0
    HOT[H.EXEC_SPEED_MS] = elapsed
    clearCache()  // clear algorithm cache after each execution

    if (receipt?.status) {
      const extracted = check.extractTarget || 0
      const aaveFee   = liveFlashAave * AAVE_FEE_RATE
      const netRev    = extracted - aaveFee

      HOT[H.SUCCESS_TODAY]  = (HOT[H.SUCCESS_TODAY]  ||0)+1
      HOT[H.CYCLES_TODAY]   = (HOT[H.CYCLES_TODAY]   ||0)+1
      HOT[H.CYCLES_TOTAL]   = (HOT[H.CYCLES_TOTAL]   ||0)+1
      HOT[H.REV_TODAY]      = (HOT[H.REV_TODAY]       ||0)+extracted
      HOT[H.REV_TOTAL]      = (HOT[H.REV_TOTAL]       ||0)+extracted
      HOT[H.NET_TODAY]      = (HOT[H.NET_TODAY]        ||0)+netRev
      HOT[H.AAVE_FEE_TODAY] = (HOT[H.AAVE_FEE_TODAY]  ||0)+aaveFee
      HOT[H.PER_CYCLE]      = extracted
      if (extracted>(HOT[H.PEAK_CYCLE]||0)) HOT[H.PEAK_CYCLE]=extracted
      const c=HOT[H.CYCLES_TODAY]||1
      HOT[H.AVG_CYCLE]=HOT[H.REV_TODAY]/c

      parentPort?.postMessage({
        type:'cycle', extracted, netRev,
        txHash:receipt.hash, elapsed_ms:elapsed,
        liveFlash:liveTotal, cycleId,
      })

      if ((HOT[H.CYCLES_TODAY]|0)%100===0) {
        console.log(
          `[EXECUTOR] ${HOT[H.CYCLES_TODAY]|0} cycles | ` +
          `$${((HOT[H.REV_TODAY]||0)/1e6).toFixed(2)}M today | ` +
          `live flash $${(liveTotal/1e6).toFixed(0)}M | ${elapsed}ms`
        )
      }
    } else {
      HOT[H.FAIL_TODAY]=(HOT[H.FAIL_TODAY]||0)+1
    }
  } catch(e) {
    HOT[H.FAIL_TODAY]=(HOT[H.FAIL_TODAY]||0)+1
    if (process.env.DEBUG) console.log(`[EXECUTOR] ${e.message?.slice(0,80)}`)
  } finally {
    activeExecs--
  }
}

// 1ms ring reader
let rHead=0
function startReader() {
  rHead=0
  setInterval(()=>{
    const natural=HOT[H.NATURAL_TODAY]||0
    let processed=0
    while(rHead<natural&&processed<3&&activeExecs<MAX_CONC){
      executeCycle().catch(()=>{})
      rHead++; processed++
    }
  }, 1)

  setInterval(()=>{
    const rev=HOT[H.REV_TODAY]||0, uptime=HOT[H.UPTIME]||1
    HOT[H.VELOCITY]=rev/uptime
  }, 1_000)

  console.log('[EXECUTOR] Algorithm-gated | live flash reads | 1ms ring | 1000 gwei cap')
}
startReader()
