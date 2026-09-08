// src/compile.js -- SOVEREIGNTY one-shot compiler subprocess
// 10 contracts -- isolated 250MB -- exits before runtime starts
// SovereigntyGovernance confirmed first in compile order

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { ethers }        from 'ethers'

const require    = createRequire(import.meta.url)
const COMP_PATH  = '/data/sovereignty_compiled.json'
const ADDR_PATH  = '/data/sovereignty_contracts.json'

// All 10 contracts -- explicit paths, no string construction
const SOURCES = [
  {
    name:     'SovereigntyGovernance',
    path:     './contracts/SovereigntyGovernance.sol',
    critical: false,
  },
  {
    name:     'SovereigntyRegistry',
    path:     './contracts/SovereigntyRegistry.sol',
    critical: false,
  },
  {
    name:     'SovereigntyVault',
    path:     './contracts/SovereigntyVault.sol',
    critical: false,
  },
  {
    name:     'SovereigntyGuard',
    path:     './contracts/SovereigntyGuard.sol',
    critical: true,
  },
  {
    name:     'SovereigntySplitter',
    path:     './contracts/SovereigntySplitter.sol',
    critical: true,
  },
  {
    name:     'SovereigntyReconciler',
    path:     './contracts/SovereigntyReconciler.sol',
    critical: false,
  },
  {
    name:     'SovereigntyOracle',
    path:     './contracts/SovereigntyOracle.sol',
    critical: false,
  },
  {
    name:     'SovereigntyAmplifier',
    path:     './contracts/SovereigntyAmplifier.sol',
    critical: true,
  },
  {
    name:     'SovereigntyFlash',
    path:     './contracts/SovereigntyFlash.sol',
    critical: true,
  },
  {
    name:     'Sovereignty',
    path:     './contracts/Sovereignty.sol',
    critical: true,
  },
]

function gc() {
  if (global.gc) { global.gc(); global.gc() }
}

function send(msg) {
  try { process.send?.(msg) } catch {}
}

// Audit all files before starting -- fail fast on missing
function auditFiles() {
  const missing = []
  for (const { name, path: fp } of SOURCES) {
    if (!existsSync(fp)) missing.push({ name, path: fp })
  }
  if (missing.length > 0) {
    send({ type:'audit_fail', missing: missing.map(m => m.name) })
    // Still proceed -- non-critical missing files are handled per-contract
  }
  const found = SOURCES.length - missing.length
  send({ type:'audit', found, total: SOURCES.length, missing: missing.map(m => m.name) })
  return missing
}

function compileSingle(name, filePath) {
  // Validate file exists
  if (!existsSync(filePath)) {
    send({ type:'missing', name, path: filePath })
    return null
  }

  gc()

  let solc, source
  try {
    solc = require('solc')
  } catch (e) {
    send({ type:'error', name, msg: `solc load: ${e.message?.slice(0, 40)}` })
    return null
  }

  try {
    source = readFileSync(filePath, 'utf8')
  } catch (e) {
    send({ type:'error', name, msg: `read: ${e.message?.slice(0, 40)}` })
    return null
  }

  // Check for non-ASCII characters that cause silent parser errors
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) > 127) {
      // Replace non-ASCII with space -- prevents em dash / smart quote bugs
      source = source.replace(/[^\x00-\x7F]/g, ' ')
      send({ type:'warn', name, msg: 'Non-ASCII chars replaced with space' })
      break
    }
  }

  // The solc input key must exactly match the name used to retrieve output
  // name = 'SovereigntyGovernance' (no extension)
  // key  = 'SovereigntyGovernance.sol'
  // This is the only correct pattern
  const solcKey = `${name}.sol`

  const input = JSON.stringify({
    language: 'Solidity',
    sources:  { [solcKey]: { content: source } },
    settings: {
      viaIR:           true,
      optimizer:       { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  })

  let out
  try {
    out = JSON.parse(solc.compile(input))
  } catch (e) {
    send({ type:'error', name, msg: e.message?.slice(0, 100) })
    gc()
    return null
  }

  const fatals = (out.errors || []).filter(e => e.severity === 'error')
  if (fatals.length) {
    fatals.forEach(f => send({ type:'error', name, msg: f.formattedMessage?.slice(0, 200) }))
    out = null; gc(); return null
  }

  // Retrieve output using the exact same key
  const contractOutput = out.contracts?.[solcKey]?.[name]

  if (!contractOutput?.evm?.bytecode?.object ||
       contractOutput.evm.bytecode.object.length < 10) {
    send({ type:'error', name, msg: 'empty bytecode -- check contract name matches filename' })
    out = null; gc(); return null
  }

  const result = {
    abi:      contractOutput.abi,
    bytecode: '0x' + contractOutput.evm.bytecode.object,
  }

  // Free memory immediately
  out    = null
  source = null
  gc()

  return result
}

async function main() {
  // Check existing deployment first
  if (existsSync(ADDR_PATH)) {
    try {
      const d = JSON.parse(readFileSync(ADDR_PATH, 'utf8'))
      if (d.Sovereignty && ethers.isAddress(d.Sovereignty)) {
        send({ type:'already_deployed', data: d })
        process.exit(0)
        return
      }
    } catch {}
  }

  // Audit before starting
  const missingFiles = auditFiles()

  send({ type:'start', count: SOURCES.length })

  const compiled = {}

  for (const { name, path: fp, critical } of SOURCES) {
    // 600ms between each contract -- GC breathing room
    await new Promise(r => setTimeout(r, 600))

    const result = compileSingle(name, fp)

    if (result) {
      compiled[name] = result
      send({ type:'compiled', name })
    } else {
      if (critical) send({ type:'critical_fail', name })
    }

    // Extra GC pause every 3 contracts
    if (Object.keys(compiled).length % 3 === 0) {
      await new Promise(r => setTimeout(r, 300))
      gc()
    }
  }

  const count = Object.keys(compiled).length
  send({ type:'done', count, names: Object.keys(compiled) })

  // Verify all critical contracts compiled
  const criticals = [
    'Sovereignty',
    'SovereigntyAmplifier',
    'SovereigntyFlash',
    'SovereigntySplitter',
    'SovereigntyGuard',
  ]
  const missingCriticals = criticals.filter(n => !compiled[n])

  if (missingCriticals.length > 0) {
    send({ type:'fatal', msg: `Critical contracts missing: ${missingCriticals.join(', ')}` })
    process.exit(1)
    return
  }

  if (!existsSync('/data')) mkdirSync('/data', { recursive: true })
  writeFileSync(COMP_PATH, JSON.stringify(compiled))
  send({ type:'written', path: COMP_PATH, count })

  gc(); gc()
  process.exit(0)
}

main().catch(e => {
  send({ type:'fatal', msg: e.message?.slice(0, 100) })
  process.exit(1)
})
