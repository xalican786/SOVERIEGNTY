// src/dashboard.js -- SOVEREIGNTY dashboard server
// 30 tabs | obsidian + electric blue + white
// FTW | Algorithm status | Live flash | Reconciliation

import { createRequire }  from 'module'
import { createServer }   from 'http'
import { existsSync }     from 'fs'
import { fileURLToPath }  from 'url'
import path               from 'path'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const _req  = createRequire(import.meta.url)
const express             = _req(path.join(__dir,'../node_modules/express'))
const { WebSocketServer } = _req(path.join(__dir,'../node_modules/ws'))

import {
  H, PORT, SYSTEM, VERSION, MODEL,
  EXECUTOR, CONTRACT, CHAINS, CHAIN_HOT,
  LIVE_FLASH, PROPELLER, DAILY_TARGET,
  BLOCKS_PER_DAY,
} from './config.js'
import { activatePropeller, getPropellerStats, getProgress, getVelocity } from './propeller.js'
import { getCycleLog, getDailyStats }    from './treasury.js'
import { getReconLog }                   from './reconciler.js'
import { formatCheckResults }            from './algorithm.js'
import { getCycleStats }                 from './cycles.js'
import { getShadowStats }                from './shadow.js'
import { getSecurityStatus }             from './security.js'
import { send as mpSend, calcFee }       from './adapters/modempay.js'

let SAB_REF=null
const WS_CLIENTS=new Set()
const hot=()=>SAB_REF?new Float64Array(SAB_REF):null

function fullState() {
  const H2=hot()
  if (!H2) return { type:'state', ts:Date.now(), booting:true }

  const v    =getVelocity(H2)
  const p    =getProgress(H2)
  const cyc  =getCycleStats()
  const shad =getShadowStats(H2)
  const sec  =getSecurityStatus()

  return {
    type:'state', ts:Date.now(),
    system:SYSTEM, version:VERSION, model:MODEL,
    // Live flash -- THE critical number
    liveFlash:       H2[H.LIVE_FLASH]    || 0,
    liveExtract:     H2[H.LIVE_EXTRACT]  || 0,
    flashBalancer:   LIVE_FLASH.balancer || 0,
    flashAave:       LIVE_FLASH.aave     || 0,
    // Algorithm
    algoPass:        H2[H.ALGO_PASS]     === 1,
    algoFlash:       H2[H.ALGO_FLASH]    || 0,
    algoGas:         H2[H.ALGO_GAS]      || 0,
    algoOracle:      H2[H.ALGO_ORACLE]   || 0,
    algoTs:          H2[H.ALGO_LAST_TS]  || 0,
    // Revenue
    cyclesToday:     H2[H.CYCLES_TODAY]  |0,
    cyclesTotal:     H2[H.CYCLES_TOTAL]  |0,
    revToday:        H2[H.REV_TODAY]     || 0,
    revTotal:        H2[H.REV_TOTAL]     || 0,
    netToday:        H2[H.NET_TODAY]     || 0,
    aaveFeeToday:    H2[H.AAVE_FEE_TODAY]|| 0,
    perCycle:        H2[H.PER_CYCLE]     || 0,
    peakCycle:       H2[H.PEAK_CYCLE]    || 0,
    avgCycle:        H2[H.AVG_CYCLE]     || 0,
    velocity:        v,
    progress:        p,
    // Reconciliation -- confirmed on-chain
    reconComputed:   H2[H.RECON_COMPUTED] || 0,
    reconConfirmed:  H2[H.RECON_CONFIRMED]|| 0,
    reconGap:        H2[H.RECON_GAP]      || 0,
    reconHealthy:    H2[H.RECON_HEALTHY]  === 1,
    reconCount:      H2[H.RECON_COUNT]    |0,
    treasuryOnChain: H2[H.TREASURY_ONCHAIN]||0,
    // Propeller
    propeller:       'P' + (H2[H.PROPELLER]|0),
    propellerNum:    H2[H.PROPELLER]|0,
    dailyTarget:     H2[H.DAILY_TARGET]   || 0,
    propellerStats:  getPropellerStats(),
    // Execution
    execToday:       H2[H.EXEC_TODAY]     |0,
    successToday:    H2[H.SUCCESS_TODAY]  |0,
    failToday:       H2[H.FAIL_TODAY]     |0,
    naturalToday:    H2[H.NATURAL_TODAY]  |0,
    execSpeedMs:     H2[H.EXEC_SPEED_MS]  || 0,
    // Chains
    chainCount:      H2[H.CHAIN_COUNT]    |0,
    chainStates:     Object.fromEntries(
      CHAINS.map(c=>[c.name, H2[H['C_'+c.name.toUpperCase()]]===1])
    ),
    // Gas
    gasPrice:        H2[H.GAS_PRICE]      || 0,
    gasOK:           H2[H.GAS_OK]         === 1,
    // System
    contracts:       H2[H.CONTRACTS]      |0,
    deployment:      H2[H.DEPLOYMENT]     ===1,
    uptime:          H2[H.UPTIME]         |0,
    mb:              H2[H.MB]             |0,
    executor:        EXECUTOR,
    contracts_:      CONTRACT,
    shadow:          shad,
    security:        sec,
    cycleStats:      cyc,
    dailyStats:      getDailyStats(),
    blocksPerDay:    BLOCKS_PER_DAY,
    wsClients:       WS_CLIENTS.size,
  }
}

function broadcast(data) {
  const p=JSON.stringify(data)
  for (const ws of WS_CLIENTS) {
    if (ws.readyState===1) try { ws.send(p) } catch { WS_CLIENTS.delete(ws) }
  }
}
setInterval(()=>{ if(WS_CLIENTS.size>0) broadcast(fullState()) }, 500)

const app=express()
const srv=createServer(app)
const wss=new WebSocketServer({ server:srv, perMessageDeflate:false })

app.use(express.json({limit:'1mb'}))
app.use(express.static(path.join(__dir,'../dashboard')))

app.get('/', (_, res) => {
  const p=path.join(__dir,'../dashboard/sovereignty.html')
  existsSync(p)?res.sendFile(p):res.status(404).send('sovereignty.html missing')
})

app.get('/ping', (_, res) => {
  const H2=hot()
  res.json({ ok:true, system:SYSTEM, version:VERSION, deployed:H2?.[H.DEPLOYMENT]===1 })
})

app.get('/api/state',  (_, res) => res.json(fullState()))
app.get('/api/cycles', (req, res) => {
  const limit=parseInt(req.query.limit)||100
  res.json({ cycles:getCycleLog(limit), daily:getDailyStats(), total:hot()?.[H.CYCLES_TOTAL]|0 })
})
app.get('/api/reconciliation', (_, res) => {
  res.json({ history:getReconLog(50), count:hot()?.[H.RECON_COUNT]|0 })
})

app.post('/api/propeller', (req, res) => {
  const {level}=req.body
  const H2=hot(); if(!H2) return res.status(503).json({error:'not ready'})
  const ok=activatePropeller(level, H2)
  res.json({ ok, level, target:PROPELLER[level] })
})

app.post('/api/executor/pause',  (req, res) => {
  const H2=hot(); if(!H2) return res.status(503).json({error:'not ready'})
  H2[H.GAS_OK]=0; res.json({ok:true,status:'paused'})
})
app.post('/api/executor/resume', (req, res) => {
  const H2=hot(); if(!H2) return res.status(503).json({error:'not ready'})
  H2[H.GAS_OK]=1; res.json({ok:true,status:'resumed'})
})

app.post('/api/ftw/quote', (req, res) => {
  const {amount,network}=req.body
  if(!amount) return res.status(400).json({error:'amount required'})
  res.json({...calcFee(parseFloat(amount),network||'wave'), ts:Date.now()})
})

app.post('/api/ftw/withdraw', async (req, res) => {
  const {amount,type,phone,accountNumber,accountName,swiftCode,network,address}=req.body
  if(!amount||amount<=0) return res.status(400).json({error:'amount required'})
  const key=process.env.MODEMPAY_SECRET_KEY||''
  if(!key) return res.status(400).json({error:'MODEMPAY_SECRET_KEY not set'})
  try {
    const result=await mpSend(key,{type,amount:parseFloat(amount),phone,accountNumber,accountName,swiftCode,network,address})
    broadcast({type:'ftw',amount})
    res.json({ok:true,...result})
  } catch(e) { res.status(500).json({error:e.message?.slice(0,120)}) }
})

wss.on('connection', ws => {
  WS_CLIENTS.add(ws)
  ws.send(JSON.stringify(fullState()))
  ws.on('close',()=>WS_CLIENTS.delete(ws))
  ws.on('error',()=>WS_CLIENTS.delete(ws))
})

export function startDashboard(SAB) {
  SAB_REF=SAB
  srv.listen(PORT,()=>{
    console.log(`[DASHBOARD] SOVEREIGNTY :${PORT} | 30 tabs | sovereignty.css | /ping`)
  })
}
