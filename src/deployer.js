// src/deployer.js -- SOVEREIGNTY deployer
// 10 contracts -- compiler isolated in 250MB subprocess
// Workers start after compiler exits

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { fork }          from 'child_process'
import { ethers }        from 'ethers'
import { fileURLToPath } from 'url'
import path              from 'path'
import {
  EXECUTOR_PK, EXECUTOR, TREASURY,
  CONTRACT, H, PRIMARY_CHAIN,
  BALANCER_VAULT, AAVE_POOL, FLASH_ASSETS,
} from './config.js'

const __dir    = path.dirname(fileURLToPath(import.meta.url))
const ADDR_PATH= '/data/sovereignty_contracts.json'
const COMP_PATH= '/data/sovereignty_compiled.json'

function makeProvider() {
  const c = PRIMARY_CHAIN
  const n = new ethers.Network(c.name, c.id)
  return new ethers.JsonRpcProvider(c.http, n, { staticNetwork:n })
}
function makeSigner() { return new ethers.Wallet(EXECUTOR_PK, makeProvider()) }

function loadAddresses() {
  try {
    if (!existsSync(ADDR_PATH)) return null
    const d = JSON.parse(readFileSync(ADDR_PATH,'utf8'))
    return d.Sovereignty && ethers.isAddress(d.Sovereignty) ? d : null
  } catch { return null }
}

function loadCompiled() {
  try {
    if (!existsSync(COMP_PATH)) return null
    return JSON.parse(readFileSync(COMP_PATH,'utf8'))
  } catch { return null }
}

function saveAddresses(data) {
  try {
    if (!existsSync('/data')) mkdirSync('/data',{recursive:true})
    writeFileSync(ADDR_PATH, JSON.stringify(data,null,2))
  } catch {}
}

function inject(addrs) {
  const map = {
    SOVEREIGNTY:            'Sovereignty',
    SOVEREIGNTY_AMPLIFIER:  'SovereigntyAmplifier',
    SOVEREIGNTY_FLASH:      'SovereigntyFlash',
    SOVEREIGNTY_ORACLE:     'SovereigntyOracle',
    SOVEREIGNTY_RECONCILER: 'SovereigntyReconciler',
    SOVEREIGNTY_SPLITTER:   'SovereigntySplitter',
    SOVEREIGNTY_GUARD:      'SovereigntyGuard',
    SOVEREIGNTY_REGISTRY:   'SovereigntyRegistry',
    SOVEREIGNTY_VAULT:      'SovereigntyVault',
    SOVEREIGNTY_GOVERNANCE: 'SovereigntyGovernance',
  }
  for (const [env,key] of Object.entries(map)) {
    const val = addrs[key]
    if (val && ethers.isAddress(val)) { process.env[env]=val; CONTRACT[env]=val }
  }
}

function runCompiler() {
  return new Promise((resolve, reject) => {
    console.log('[DEPLOYER] Forking compiler (250MB isolated)...')

    const child = fork(
      path.join(__dir,'compile.js'), [],
      { execArgv:['--max-old-space-size=250','--expose-gc','--gc-interval=50'], silent:false }
    )

    child.on('message', msg => {
      switch(msg.type) {
        case 'start':           console.log(`[DEPLOYER] Compiling ${msg.count} contracts (viaIR)...`); break
        case 'compiled':        console.log(`[DEPLOYER] + ${msg.name}`); break
        case 'missing':         console.log(`[DEPLOYER] Missing: ${msg.name}.sol`); break
        case 'error':           console.log(`[DEPLOYER] ${msg.name}: ${msg.msg}`); break
        case 'critical_fail':   console.log(`[DEPLOYER] CRITICAL FAIL: ${msg.name}`); break
        case 'done':            console.log(`[DEPLOYER] Compiled ${msg.count}/10: ${msg.names.join(', ')}`); break
        case 'written':         console.log(`[DEPLOYER] Artifacts written`); break
        case 'already_deployed':
          console.log('[DEPLOYER] Existing deployment found')
          resolve({ alreadyDeployed:true, data:msg.data }); break
        case 'fatal': console.log(`[DEPLOYER] FATAL: ${msg.msg}`); break
      }
    })

    child.on('exit', code => {
      if (code === 0) {
        const compiled = loadCompiled()
        compiled ? resolve({ compiled }) : reject(new Error('No artifacts after compile'))
      } else { reject(new Error(`Compiler exited: ${code}`)) }
    })

    child.on('error', e => reject(e))
  })
}

async function deployOne(compiled, name, args=[]) {
  const c = compiled[name]
  if (!c) { console.log(`[DEPLOYER] ${name} not compiled -- skip`); return null }

  const provider = makeProvider()
  const signer   = makeSigner()
  const feeData  = await provider.getFeeData()
  const rawGas   = feeData.gasPrice || ethers.parseUnits('50','gwei')
  const capGas   = ethers.parseUnits('1000','gwei')
  const gasPrice = rawGas > capGas ? (capGas*130n)/100n : (rawGas*130n)/100n

  const factory  = new ethers.ContractFactory(c.abi, c.bytecode, signer)
  const contract = await factory.deploy(...args, { gasLimit:4_000_000, gasPrice })
  const receipt  = await contract.deploymentTransaction().wait(2)
  const address  = await contract.getAddress()

  if (!receipt?.status) throw new Error(`${name} reverted`)
  if (compiled[name]) compiled[name].bytecode = ''
  console.log(`[DEPLOYER] ${name} → ${address.slice(0,14)}...`)
  return address
}

async function deployAll(compiled, HOT) {
  const addrs = {}
  const deploy = async (name, args) => {
    for (let i=1;i<=3;i++) {
      try {
        const a = await deployOne(compiled, name, args)
        if (a) { addrs[name]=a; return a }
      } catch(e) {
        console.log(`[DEPLOYER] ${name} attempt ${i}/3: ${e.message?.slice(0,60)}`)
        if (i<3) await new Promise(r=>setTimeout(r,8_000))
      }
    }
    return null
  }

  // Deploy in dependency order
  await deploy('SovereigntyGovernance', [EXECUTOR])
  await deploy('SovereigntyRegistry',   [EXECUTOR])
  await deploy('SovereigntyVault',      [EXECUTOR, TREASURY])
  const guardAddr      = await deploy('SovereigntyGuard',      [EXECUTOR, EXECUTOR])
  const splitterAddr   = await deploy('SovereigntySplitter',   [EXECUTOR, TREASURY])
  const reconcilerAddr = await deploy('SovereigntyReconciler', [EXECUTOR, TREASURY, EXECUTOR])
  await deploy('SovereigntyOracle',     [EXECUTOR])
  const ampAddr        = await deploy('SovereigntyAmplifier',  [EXECUTOR, EXECUTOR])
  await deploy('SovereigntyFlash',      [EXECUTOR, EXECUTOR, BALANCER_VAULT, AAVE_POOL, TREASURY])

  const sovereigntyAddr = await deploy('Sovereignty', [
    EXECUTOR, TREASURY, BALANCER_VAULT, AAVE_POOL,
    ampAddr         || EXECUTOR,
    guardAddr       || EXECUTOR,
    splitterAddr    || EXECUTOR,
    reconcilerAddr  || EXECUTOR,
  ])

  if (!sovereigntyAddr) { console.log('[DEPLOYER] FATAL: Sovereignty failed'); return false }

  // Authorize Sovereignty in splitter
  if (splitterAddr && sovereigntyAddr) {
    try {
      const s = new ethers.Contract(splitterAddr, ['function authorize(address,bool) external'], makeSigner())
      await (await s.authorize(sovereigntyAddr,true,{gasLimit:100_000})).wait(1)
      console.log('[DEPLOYER] Splitter authorized')
    } catch {}
  }

  // Register vault assets
  if (addrs.SovereigntyVault) {
    try {
      const v = new ethers.Contract(addrs.SovereigntyVault, ['function addAsset(address,string,uint8,uint256,uint256) external'], makeSigner())
      const assets = [
        [FLASH_ASSETS[0],'USDC',6,BigInt(Math.floor(52e6*1e6*0.4)),BigInt(Math.floor(300e6*1e6*0.4))],
        [FLASH_ASSETS[3],'USDT',6,BigInt(Math.floor(52e6*1e6*0.1)),BigInt(Math.floor(300e6*1e6*0.1))],
      ]
      for (const a of assets) { try { await (await v.addAsset(...a,{gasLimit:200_000})).wait(1) } catch {} }
      console.log('[DEPLOYER] Vault assets registered')
    } catch {}
  }

  inject(addrs)
  saveAddresses({ ...addrs, deployedAt:Date.now(), chain:PRIMARY_CHAIN.name })

  const count = Object.values(addrs).filter(v => typeof v==='string' && ethers.isAddress(v)).length
  HOT[H.CONTRACTS]  = count
  HOT[H.DEPLOYMENT] = 1

  try { if (existsSync(COMP_PATH)) unlinkSync(COMP_PATH) } catch {}
  console.log(`[DEPLOYER] ${count}/10 deployed | Sovereignty: ${sovereigntyAddr.slice(0,14)}...`)
  return true
}

function watchForFunds(compiled, SAB, HOT) {
  const provider = makeProvider()
  let deploying=false, lastBal=-1

  const iv = setInterval(async () => {
    if (deploying) return
    try {
      const bal = await provider.getBalance(EXECUTOR)
      const pol = parseFloat(ethers.formatEther(bal))
      if (Math.floor(pol*100) !== lastBal) {
        lastBal = Math.floor(pol*100)
        if (pol > 0) console.log(`[DEPLOYER] ${pol.toFixed(4)} POL | need 0.1 at ${EXECUTOR}`)
      }
      if (pol >= 0.1) {
        deploying=true; clearInterval(iv)
        const ok = await deployAll(compiled, HOT)
        if (!ok) { deploying=false; setTimeout(()=>watchForFunds(compiled,SAB,HOT),60_000) }
      }
    } catch {}
  }, 500)
}

export function startDeployer(SAB, onWorkersReady) {
  const HOT = new Float64Array(SAB)

  const existing = loadAddresses()
  if (existing) {
    inject(existing)
    const count = Object.values(existing).filter(v => typeof v==='string' && ethers.isAddress(v)).length
    HOT[H.CONTRACTS]=count; HOT[H.DEPLOYMENT]=1
    console.log(`[DEPLOYER] Restored ${count} contracts | Sovereignty: ${existing.Sovereignty.slice(0,14)}...`)
    onWorkersReady?.(); return
  }

  console.log('[DEPLOYER] No deployment -- workers held until compiler exits')
  setTimeout(async () => {
    let attempts=0
    const tryCompile = async () => {
      attempts++
      try {
        const result = await runCompiler()
        if (result.alreadyDeployed) {
          inject(result.data)
          const count=Object.values(result.data).filter(v=>typeof v==='string'&&ethers.isAddress(v)).length
          HOT[H.CONTRACTS]=count; HOT[H.DEPLOYMENT]=1
          onWorkersReady?.(); return
        }
        if (result.compiled) {
          console.log('[DEPLOYER] Compiler exited -- starting workers')
          onWorkersReady?.()
          watchForFunds(result.compiled, SAB, HOT)
        }
      } catch(e) {
        console.log(`[DEPLOYER] Compile attempt ${attempts}/5: ${e.message?.slice(0,60)}`)
        if (attempts<5) setTimeout(tryCompile,30_000)
        else { console.log('[DEPLOYER] Compilation failed -- starting workers'); onWorkersReady?.() }
      }
    }
    tryCompile()
  }, 3_000)
}
