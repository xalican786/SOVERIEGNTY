// src/index.js -- SOVEREIGNTY final boot
// Algorithm-gated | Live flash reads | On-chain reconciliation
// 150MB main | 80MB chains | 100MB executor | compiler isolated at 250MB

import { createServer }  from 'http'
import { Worker }        from 'worker_threads'
import { fileURLToPath } from 'url'
import path              from 'path'

import {
  SAB_SIZE, H, SYSTEM, VERSION, MODEL,
  EXECUTOR, TREASURY, PORT,
  FLASH_ESTIMATE_TOTAL, DAILY_TARGET,
  WS_CHAINS, PROPELLER,
} from './config.js'

import { startDeployer }   from './deployer.js'
import { startPropeller }  from './propeller.js'
import { startTreasury }   from './treasury.js'
import { startDashboard }  from './dashboard.js'
import { startLogger }     from './log.js'
import { startReconciler } from './reconciler.js'
import { startFlash }      from './flash.js'
import { startOracle }     from './oracle.js'
import { startShadow }     from './shadow.js'
import { startCycles }     from './cycles.js'
import { startMonitor }    from './monitor.js'
import { startSecurity }   from './security.js'

export const SAB = new SharedArrayBuffer(SAB_SIZE)
export const HOT = new Float64Array(SAB)

HOT[H.GAS_OK]    = 1
HOT[H.PROPELLER] = 5  // P5 default
HOT[H.LIVE_FLASH]= FLASH_ESTIMATE_TOTAL

if (EXECUTOR === TREASURY) {
  console.error('[SOVEREIGNTY] FATAL: executor === treasury')
  process.exit(1)
}

console.log('╔═══════════════════════════════════════════════════════════╗')
console.log('║   S O V E R E I G N T Y  --  Final SSS System             ║')
console.log(`║   Version: ${VERSION}  |  Throughput Model  |  Algorithm-gated   ║`)
console.log(`║   Executor: ${EXECUTOR.slice(0,14)}...                              ║`)
console.log('║   Treasury: CLASSIFIED -- on-chain reconciliation active   ║')
console.log('║   Flash:    LIVE reads only -- never assumes capacity       ║')
console.log(`║   Chains:   ${WS_CHAINS.length} monitoring | propeller P5 default          ║`)
console.log('║   SP1-SP5:  $10K to $1B (validation tiers)                 ║')
console.log('║   P1-P10:   $1B to $10 QUI (full throughput)               ║')
console.log('║   Algorithm: 7-point live check before every cycle         ║')
console.log('║   Reconcile: on-chain treasury balance every 100 cycles    ║')
console.log('╚═══════════════════════════════════════════════════════════╝')

// Light services -- start immediately
startPropeller(HOT)
startTreasury(HOT)
startDashboard(SAB)
startReconciler(HOT)
startFlash(HOT)
startOracle(HOT)
startShadow(HOT)
startCycles(HOT)
startMonitor(HOT)
startSecurity(HOT)

// Workers -- delayed until after compiler exits
const __dir = path.dirname(fileURLToPath(import.meta.url))
let chainWorker=null, execWorker=null

function startWorkers() {
  if (chainWorker||execWorker) return

  console.log('[SOVEREIGNTY] Starting workers -- compiler memory freed')

  chainWorker = new Worker(path.join(__dir,'chains.js'), {
    workerData:     { SAB },
    resourceLimits: { maxOldGenerationSizeMb:80, maxYoungGenerationSizeMb:16 },
  })
  chainWorker.on('message', msg => {
    if (msg.type==='swap') HOT[H.NATURAL_TODAY]=(HOT[H.NATURAL_TODAY]||0)+1
  })
  chainWorker.on('error', e=>console.log(`[CHAINS] ${e.message?.slice(0,80)}`))
  chainWorker.on('exit',  c=>{ if(c!==0) console.log(`[CHAINS] exited: ${c}`) })

  execWorker = new Worker(path.join(__dir,'executor.js'), {
    workerData:     { SAB },
    resourceLimits: { maxOldGenerationSizeMb:100, maxYoungGenerationSizeMb:20 },
  })
  execWorker.on('message', msg => {
    if (msg.type==='cycle') {
      const x=msg.extracted||0
      HOT[H.REV_TODAY]    =(HOT[H.REV_TODAY]    ||0)+x
      HOT[H.REV_TOTAL]    =(HOT[H.REV_TOTAL]    ||0)+x
      HOT[H.CYCLES_TODAY] =(HOT[H.CYCLES_TODAY]  ||0)+1
      HOT[H.CYCLES_TOTAL] =(HOT[H.CYCLES_TOTAL]  ||0)+1
      HOT[H.EXEC_SPEED_MS]=msg.elapsed_ms||1
      HOT[H.PER_CYCLE]    =x
      HOT[H.LIVE_FLASH]   =msg.liveFlash||0
      if(x>(HOT[H.PEAK_CYCLE]||0)) HOT[H.PEAK_CYCLE]=x
      const c=HOT[H.CYCLES_TODAY]||1
      HOT[H.AVG_CYCLE]=HOT[H.REV_TODAY]/c
    }
  })
  execWorker.on('error', e=>console.log(`[EXECUTOR] ${e.message?.slice(0,80)}`))
  execWorker.on('exit',  c=>{ if(c!==0) console.log(`[EXECUTOR] exited: ${c}`) })
}

startDeployer(SAB, startWorkers)

setInterval(()=>{ HOT[H.UPTIME]++ }, 1_000)
setInterval(()=>{ HOT[H.MB]=process.memoryUsage().heapUsed/1024/1024|0 }, 10_000)

const scheduleMidnight = () => {
  const nx=new Date(); nx.setUTCHours(0,0,0,0); nx.setUTCDate(nx.getUTCDate()+1)
  setTimeout(()=>{
    ;[
      H.CYCLES_TODAY,  H.REV_TODAY,     H.NET_TODAY,
      H.NATURAL_TODAY, H.EXEC_TODAY,    H.SUCCESS_TODAY,
      H.FAIL_TODAY,    H.AAVE_FEE_TODAY,H.AVG_CYCLE,
    ].forEach(i=>{ if(i!==undefined) HOT[i]=0 })
    scheduleMidnight()
  }, nx-new Date())
}
scheduleMidnight()

startLogger(HOT)

createServer((req,res)=>{
  if(req.url!=='/ping'&&req.url!=='/health'){ res.writeHead(404);res.end();return }
  res.writeHead(200,{'Content-Type':'application/json'})
  res.end(JSON.stringify({
    ok:true, system:SYSTEM, version:VERSION, model:MODEL,
    uptime:      HOT[H.UPTIME]       |0,
    cyclesTotal: HOT[H.CYCLES_TOTAL] |0,
    revToday:    HOT[H.REV_TODAY],
    liveFlash:   HOT[H.LIVE_FLASH],
    algoPass:    HOT[H.ALGO_PASS]    ===1,
    propeller:  'P'+(HOT[H.PROPELLER]|0),
    chains:      HOT[H.CHAIN_COUNT]  |0,
    deployed:    HOT[H.DEPLOYMENT]   ===1,
    gasOK:       HOT[H.GAS_OK]       ===1,
    executor:    EXECUTOR,
    treasury:    'CLASSIFIED',
    reconHealthy:HOT[H.RECON_HEALTHY]===1,
    mb:          HOT[H.MB]           |0,
    workersActive:!!(chainWorker&&execWorker),
  }))
}).listen(3001).on('error',()=>{})

process.on('uncaughtException', e=>{
  console.log(`[SOVEREIGNTY] Exception: ${e.message?.slice(0,100)}`)
  console.log(`[SOVEREIGNTY] Stack: ${e.stack?.slice(0,200)}`)
})
process.on('unhandledRejection', r=>console.log(`[SOVEREIGNTY] Rejection: ${String(r).slice(0,100)}`))
process.on('SIGTERM',()=>{ chainWorker?.terminate(); execWorker?.terminate(); process.exit(0) })

console.log(`[SOVEREIGNTY] :${PORT} | ${EXECUTOR} | ${WS_CHAINS.length} chains | P5 default | algorithm active`)
