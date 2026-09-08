// src/compile.js -- SOVEREIGNTY one-shot compiler subprocess
// 10 contracts -- isolated 250MB -- exits before runtime starts

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { ethers }        from 'ethers'

const require    = createRequire(import.meta.url)
const COMP_PATH  = '/data/sovereignty_compiled.json'
const ADDR_PATH  = '/data/sovereignty_contracts.json'

const SOURCES = [
  { name:'SovereigntyGovernance', path:'./contracts/SovereigntyGovernance.sol', critical:false },
  { name:'SovereigntyRegistry',   path:'./contracts/SovereigntyRegistry.sol',   critical:false },
  { name:'SovereigntyVault',      path:'./contracts/SovereigntyVault.sol',      critical:false },
  { name:'SovereigntyGuard',      path:'./contracts/SovereigntyGuard.sol',      critical:true  },
  { name:'SovereigntySplitter',   path:'./contracts/SovereigntySplitter.sol',   critical:true  },
  { name:'SovereigntyReconciler', path:'./contracts/SovereigntyReconciler.sol', critical:false },
  { name:'SovereigntyOracle',     path:'./contracts/SovereigntyOracle.sol',     critical:false },
  { name:'SovereigntyAmplifier',  path:'./contracts/SovereigntyAmplifier.sol',  critical:true  },
  { name:'SovereigntyFlash',      path:'./contracts/SovereigntyFlash.sol',      critical:true  },
  { name:'Sovereignty',           path:'./contracts/Sovereignty.sol',           critical:true  },
]

function gc() { if (global.gc) { global.gc(); global.gc() } }
function send(msg) { try { process.send?.(msg) } catch {} }

function compileSingle(name, filePath) {
  if (!existsSync(filePath)) { send({ type:'missing', name }); return null }
  gc()

  let solc, source
  try { solc   = require('solc')               } catch (e) { send({ type:'error', name, msg:`solc: ${e.message?.slice(0,40)}` }); return null }
  try { source = readFileSync(filePath, 'utf8')} catch (e) { send({ type:'error', name, msg:`read: ${e.message?.slice(0,40)}` }); return null }

  const input = JSON.stringify({
    language: 'Solidity',
    sources:  { [`${name}.sol`]: { content: source } },
    settings: {
      viaIR:           true,
      optimizer:       { enabled:true, runs:200 },
      outputSelection: { '*': { '*': ['abi','evm.bytecode.object'] } },
    },
  })

  let out
  try { out = JSON.parse(solc.compile(input)) }
  catch (e) { send({ type:'error', name, msg:e.message?.slice(0,80) }); gc(); return null }

  const fatals = (out.errors||[]).filter(e => e.severity==='error')
  if (fatals.length) {
    fatals.forEach(f => send({ type:'error', name, msg:f.formattedMessage?.slice(0,160) }))
    out=null; gc(); return null
  }

  const c = out.contracts?.[`${name}.sol`]?.[name]
  if (!c?.evm?.bytecode?.object || c.evm.bytecode.object.length < 10) {
    send({ type:'error', name, msg:'empty bytecode' }); out=null; gc(); return null
  }

  const result = { abi:c.abi, bytecode:'0x'+c.evm.bytecode.object }
  out=null; source=null; gc()
  return result
}

async function main() {
  if (existsSync(ADDR_PATH)) {
    try {
      const d = JSON.parse(readFileSync(ADDR_PATH,'utf8'))
      if (d.Sovereignty && ethers.isAddress(d.Sovereignty)) {
        send({ type:'already_deployed', data:d })
        process.exit(0); return
      }
    } catch {}
  }

  send({ type:'start', count:SOURCES.length })
  const compiled = {}

  for (const { name, path:fp, critical } of SOURCES) {
    await new Promise(r => setTimeout(r, 600))
    const result = compileSingle(name, fp)
    if (result) { compiled[name]=result; send({ type:'compiled', name }) }
    else if (critical) send({ type:'critical_fail', name })
    if (Object.keys(compiled).length % 3 === 0) { await new Promise(r=>setTimeout(r,200)); gc() }
  }

  const count = Object.keys(compiled).length
  send({ type:'done', count, names:Object.keys(compiled) })

  const criticals = ['Sovereignty','SovereigntyAmplifier','SovereigntyFlash','SovereigntySplitter','SovereigntyGuard']
  const missing   = criticals.filter(n => !compiled[n])
  if (missing.length) { send({ type:'fatal', msg:`Critical missing: ${missing.join(', ')}` }); process.exit(1); return }

  if (!existsSync('/data')) mkdirSync('/data',{recursive:true})
  writeFileSync(COMP_PATH, JSON.stringify(compiled))
  send({ type:'written', path:COMP_PATH, count })
  gc(); gc()
  process.exit(0)
}

main().catch(e => { send({ type:'fatal', msg:e.message?.slice(0,80) }); process.exit(1) })
