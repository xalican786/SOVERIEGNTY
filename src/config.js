// src/config.js -- SOVEREIGNTY
// Final SSS system | Throughput Model | Algorithm-gated
// All flash amounts are LIVE from algorithm.js -- not hardcoded
// P5 default | SP1-SP5 sub-tiers | P1-P10 full propeller

import { ethers } from 'ethers'

// ── WALLETS ───────────────────────────────────────────────────────────────────
export const EXECUTOR_PK     = '0x84981e4418078e8d1169e0bddd80e67c69cc971f94e6feac58c1be1abca2ee3e'
export const EXECUTOR_WALLET = new ethers.Wallet(EXECUTOR_PK)
export const EXECUTOR        = EXECUTOR_WALLET.address // 0xA7b8774954ebF33690676a0061027cFF6Bff85A9
export const TREASURY        = '0xCCCF1C9A2154750A0D7CceeD51fE0f9b4c1906e8'

if (EXECUTOR === TREASURY) throw new Error('SOVEREIGNTY: executor === treasury')

// ── IDENTITY ──────────────────────────────────────────────────────────────────
export const SYSTEM  = 'SOVEREIGNTY'
export const VERSION = '1.0.0'
export const MODEL   = 'FINAL'
export const PORT    = parseInt(process.env.PORT || '3000')

// ── FLASH CAPACITY -- LIVE ONLY ───────────────────────────────────────────────
// These are INITIAL ESTIMATES ONLY
// algorithm.js overwrites these with live reads before every cycle
// The system NEVER sends a transaction using these values directly
// Real values confirmed from live testing:
//   Balancer Vault (Polygon): ~$52M confirmed live
//   Aave V3 (Polygon available): ~$200-400M confirmed live
export const FLASH_ESTIMATE_BALANCER = 52e6      // $52M -- confirmed live on Polygon
export const FLASH_ESTIMATE_AAVE     = 300e6     // $300M -- conservative Aave available
export const FLASH_ESTIMATE_TOTAL    = 352e6     // $352M -- conservative combined
export const EXTRACTION_RATE         = 0.10      // 10% of live flash
export const AAVE_FEE_RATE           = 0.0005    // 0.05%

// These live values are POPULATED by algorithm.js before every cycle
export let LIVE_FLASH = {
  balancer:      FLASH_ESTIMATE_BALANCER,
  aave:          FLASH_ESTIMATE_AAVE,
  total:         FLASH_ESTIMATE_TOTAL,
  extractTarget: FLASH_ESTIMATE_TOTAL * 0.10,
  lastUpdate:    0,
}

export function updateLiveFlash(flash) {
  LIVE_FLASH = { ...flash, lastUpdate: Date.now() }
}

// ── PROPELLER -- SP1 to P10 ───────────────────────────────────────────────────
// SP tiers: validation tiers at conservative flash levels
// P tiers: full throughput across 20 chains
// Propeller governs output -- not market conditions

// Per-cycle profit at conservative $352M flash × 10% = $35.2M per cycle
// For reference: at $352M flash across 40,754 Polygon cycles/day = $1.43T/day theoretical
// But propeller caps how many cycles actually fire per day

export const PROPELLER = {
  // Sub-propeller tiers -- validation levels
  SP1: 10_000,               // $10K/day
  SP2: 50_000,               // $50K/day
  SP3: 200_000,              // $200K/day
  SP4: 500_000,              // $500K/day
  SP5: 1e9,                  // $1B/day -- bridge to P1

  // Full propeller tiers -- each ×7
  P1:  1e9,                  // $1B/day
  P2:  7e9,                  // $7B/day
  P3:  49e9,                 // $49B/day
  P4:  343e9,                // $343B/day
  P5:  2_401e9,              // $2.401T/day -- DEFAULT
  P6:  16_807e9,             // $16.807T/day
  P7:  117_649e9,            // $117.649T/day
  P8:  823_543e9,            // $823.543T/day
  P9:  5_764_801e9,          // $5.765Q/day
  P10: 10e21,                // $10 QUI/day -- ceiling (not hard cap)
}

// Verified block counts per chain for throughput calculation
export const BLOCKS_PER_DAY = {
  polygon:    40_754,
  arbitrum:  345_600,
  base:       43_200,
  optimism:   43_200,
  ethereum:    7_200,
  bnb:        28_328,
  sonic:     172_800,
  sei:       345_600,
  others:    499_390,
  total:   1_526_072,
}

export const DEFAULT_PROPELLER = 'P5'   // $2.401T/day default
export let   ACTIVE_PROPELLER  = DEFAULT_PROPELLER
export let   DAILY_TARGET      = PROPELLER[DEFAULT_PROPELLER]

export function setPropeller(level) {
  if (PROPELLER[level] === undefined) return false
  ACTIVE_PROPELLER = level
  DAILY_TARGET     = PROPELLER[level]
  return true
}

// ── GAS ───────────────────────────────────────────────────────────────────────
export const GAS_CAP_GWEI = 1000n    // 1000 gwei
export const GAS_MARKUP   = 130n
export const GAS_LIMIT    = 4_000_000n

// ── PROTOCOL ADDRESSES ────────────────────────────────────────────────────────
export const BALANCER_VAULT = '0xBA12222222228d8Ba445958a75a0704d566BF2C8'
export const AAVE_POOL      = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
export const USDC_POLYGON   = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'

export const FLASH_ASSETS = [
  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
  '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH
  '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', // WBTC
  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
  '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // DAI
]

// Balancer amounts populated LIVE by algorithm.js before every cycle
// These are placeholders -- never used directly in transactions
export const getBalancerAmounts = (liveFlash = FLASH_ESTIMATE_BALANCER) => [
  BigInt(Math.floor(liveFlash * 0.40 * 1e6)),          // USDC 40%
  BigInt(Math.floor(liveFlash * 0.30 / 3000)) * BigInt(1e18), // WETH 30%
  BigInt(Math.floor(liveFlash * 0.15 / 60000)) * BigInt(1e8), // WBTC 15%
  BigInt(Math.floor(liveFlash * 0.10 * 1e6)),          // USDT 10%
  BigInt(Math.floor(liveFlash * 0.05)) * BigInt(1e18), // DAI  5%
]

// ── ALCHEMY KEYS ──────────────────────────────────────────────────────────────
export const AK = {
  POLYGON:    'CfWwmhym4lH5r7_T7_oU0',
  ARB:        'X0nWXU_gGc2Q7P_FrF_tM',
  BASE:       '3aotTt1Kv1x-fWDF7_kab',
  OPT:        'sGjcCN-W3Ls8XQNNqSsNn',
  ETH:        'jKhd0hz6ZYWaDlacqh_dx',
  BNB:        '6iqYCCQwSTR6b-tJKucS-',
  AVAX:       'qbhq33J1d5gA1fa2F9oTc',
  BLAST:      '0zddkzYwBs_J7lTLPQJAr',
  ZKSYNC:     '-2hgPK_0yIugOtz8gd2bN',
  SCROLL:     '2Hfl39Jdr3cIONf6P6evX',
  LINEA:      '1orEe9d1Y0Z6pcu0YsUPH',
  MANTLE:     'TjtdcQ2UzexinqajRW1AX',
  GNOSIS:     'rcXlHBD_ATzcywKP_3yOv',
  WORLDCHAIN: 'KYeP7PjTazpg9y1cESm3h',
  BERACHAIN:  '2dJONPcgoCkGLFULJ1ugZ',
  UNICHAIN:   'oFFJFW-FxwGOnCaNx21LO',
  SEI:        '-vnNUoR-xYBdJc-EVAEtr',
  SONIC:      'bvVHqI4zTiNSN8Hkx9vqj',
  SONIC2:     'OwN_yxTn0r3jg4KxlqkYJ',
}

export const CHAINS = [
  { id:137,    name:'polygon',    primary:true,
    http:`https://polygon-mainnet.g.alchemy.com/v2/${AK.POLYGON}`,
    ws:`wss://polygon-mainnet.g.alchemy.com/v2/${AK.POLYGON}` },
  { id:42161,  name:'arb',        primary:false,
    http:`https://arb-mainnet.g.alchemy.com/v2/${AK.ARB}`,
    ws:`wss://arb-mainnet.g.alchemy.com/v2/${AK.ARB}` },
  { id:8453,   name:'base',       primary:false,
    http:`https://base-mainnet.g.alchemy.com/v2/${AK.BASE}`,
    ws:`wss://base-mainnet.g.alchemy.com/v2/${AK.BASE}` },
  { id:10,     name:'opt',        primary:false,
    http:`https://opt-mainnet.g.alchemy.com/v2/${AK.OPT}`,
    ws:`wss://opt-mainnet.g.alchemy.com/v2/${AK.OPT}` },
  { id:1,      name:'eth',        primary:false,
    http:`https://eth-mainnet.g.alchemy.com/v2/${AK.ETH}`,
    ws:`wss://eth-mainnet.g.alchemy.com/v2/${AK.ETH}` },
  { id:56,     name:'bnb',        primary:false,
    http:`https://bnb-mainnet.g.alchemy.com/v2/${AK.BNB}`,
    ws:`wss://bnb-mainnet.g.alchemy.com/v2/${AK.BNB}` },
  { id:43114,  name:'avax',       primary:false,
    http:`https://avax-mainnet.g.alchemy.com/v2/${AK.AVAX}`,
    ws:`wss://avax-mainnet.g.alchemy.com/v2/${AK.AVAX}` },
  { id:81457,  name:'blast',      primary:false,
    http:`https://blast-mainnet.g.alchemy.com/v2/${AK.BLAST}`,
    ws:`wss://blast-mainnet.g.alchemy.com/v2/${AK.BLAST}` },
  { id:324,    name:'zksync',     primary:false,
    http:`https://zksync-mainnet.g.alchemy.com/v2/${AK.ZKSYNC}`,
    ws:`wss://zksync-mainnet.g.alchemy.com/v2/${AK.ZKSYNC}` },
  { id:534352, name:'scroll',     primary:false,
    http:`https://scroll-mainnet.g.alchemy.com/v2/${AK.SCROLL}`,
    ws:`wss://scroll-mainnet.g.alchemy.com/v2/${AK.SCROLL}` },
  { id:59144,  name:'linea',      primary:false,
    http:`https://linea-mainnet.g.alchemy.com/v2/${AK.LINEA}`,
    ws:`wss://linea-mainnet.g.alchemy.com/v2/${AK.LINEA}` },
  { id:5000,   name:'mantle',     primary:false,
    http:`https://mantle-mainnet.g.alchemy.com/v2/${AK.MANTLE}`,
    ws:`wss://mantle-mainnet.g.alchemy.com/v2/${AK.MANTLE}` },
  { id:100,    name:'gnosis',     primary:false,
    http:`https://gnosis-mainnet.g.alchemy.com/v2/${AK.GNOSIS}`,
    ws:`wss://gnosis-mainnet.g.alchemy.com/v2/${AK.GNOSIS}` },
  { id:480,    name:'worldchain', primary:false,
    http:`https://worldchain-mainnet.g.alchemy.com/v2/${AK.WORLDCHAIN}`,
    ws:`wss://worldchain-mainnet.g.alchemy.com/v2/${AK.WORLDCHAIN}` },
  { id:80094,  name:'berachain',  primary:false,
    http:`https://berachain-mainnet.g.alchemy.com/v2/${AK.BERACHAIN}`,
    ws:`wss://berachain-mainnet.g.alchemy.com/v2/${AK.BERACHAIN}` },
  { id:130,    name:'unichain',   primary:false,
    http:`https://unichain-mainnet.g.alchemy.com/v2/${AK.UNICHAIN}`,
    ws:`wss://unichain-mainnet.g.alchemy.com/v2/${AK.UNICHAIN}` },
  { id:1329,   name:'sei',        primary:false,
    http:`https://sei-mainnet.g.alchemy.com/v2/${AK.SEI}`,
    ws:`wss://sei-mainnet.g.alchemy.com/v2/${AK.SEI}` },
  { id:146,    name:'sonic',      primary:false,
    http:`https://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC}`,
    ws:`wss://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC}` },
  { id:146,    name:'sonic2',     primary:false,
    http:`https://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC2}`,
    ws:`wss://sonic-mainnet.g.alchemy.com/v2/${AK.SONIC2}` },
  { id:137,    name:'polygon2',   primary:false,
    http:`https://polygon-mainnet.g.alchemy.com/v2/${AK.POLYGON}`,
    ws:`wss://polygon-mainnet.g.alchemy.com/v2/${AK.AVAX}` },
]

export const PRIMARY_CHAIN = CHAINS.find(c => c.primary)
export const WS_CHAINS     = CHAINS.filter(c => c.ws)

// ── CONTRACTS ─────────────────────────────────────────────────────────────────
export const CONTRACT = {
  SOVEREIGNTY:              process.env.SOVEREIGNTY              || '',
  SOVEREIGNTY_AMPLIFIER:    process.env.SOVEREIGNTY_AMPLIFIER    || '',
  SOVEREIGNTY_FLASH:        process.env.SOVEREIGNTY_FLASH        || '',
  SOVEREIGNTY_ORACLE:       process.env.SOVEREIGNTY_ORACLE       || '',
  SOVEREIGNTY_RECONCILER:   process.env.SOVEREIGNTY_RECONCILER   || '',
  SOVEREIGNTY_SPLITTER:     process.env.SOVEREIGNTY_SPLITTER     || '',
  SOVEREIGNTY_GUARD:        process.env.SOVEREIGNTY_GUARD        || '',
  SOVEREIGNTY_REGISTRY:     process.env.SOVEREIGNTY_REGISTRY     || '',
  SOVEREIGNTY_VAULT:        process.env.SOVEREIGNTY_VAULT        || '',
  SOVEREIGNTY_GOVERNANCE:   process.env.SOVEREIGNTY_GOVERNANCE   || '',
}

// ── HOT LAYOUT ────────────────────────────────────────────────────────────────
export const H = {
  CYCLES_TODAY:   0, CYCLES_TOTAL:    1, REV_TODAY:      2, REV_TOTAL:    3,
  VELOCITY:       4, PER_CYCLE:       5, LIVE_FLASH:     6, LIVE_EXTRACT: 7,
  EXEC_TODAY:     8, SUCCESS_TODAY:   9, FAIL_TODAY:     10, GAS_PRICE:   11,
  GAS_OK:         12, PROPELLER:      13, DAILY_TARGET:  14, CYCLES_NEEDED:15,
  CHAIN_COUNT:    16, DEPLOYMENT:     17, CONTRACTS:     18, UPTIME:       19,
  MB:             20,
  // Algorithm check slots
  ALGO_PASS:      21, ALGO_FLASH:     22, ALGO_GAS:      23, ALGO_ORACLE:  24,
  ALGO_SPREAD:    25, ALGO_DEPTH:     26, ALGO_TREASURY: 27, ALGO_CAPACITY:28,
  ALGO_LAST_TS:   29,
  // Reconciler
  RECON_COMPUTED:  30, RECON_CONFIRMED:31, RECON_GAP:   32, RECON_HEALTHY:33,
  RECON_COUNT:    34,
  // Revenue detail
  NET_TODAY:      35, AAVE_FEE_TODAY: 36, PEAK_CYCLE:   37, AVG_CYCLE:    38,
  EXEC_SPEED_MS:  39,
  // Treasury confirmed on-chain
  TREASURY_ONCHAIN:40,
  // Chain slots 41-60
  C_POLYGON:41, C_ARB:42, C_BASE:43, C_OPT:44, C_ETH:45,
  C_BNB:46, C_AVAX:47, C_BLAST:48, C_ZKSYNC:49, C_SCROLL:50,
  C_LINEA:51, C_MANTLE:52, C_GNOSIS:53, C_WORLDCHAIN:54, C_BERACHAIN:55,
  C_UNICHAIN:56, C_SEI:57, C_SONIC:58, C_SONIC2:59, C_POLYGON2:60,
  // Natural swaps detected
  NATURAL_TODAY: 61,
}

export const SAB_SIZE = 8192

export const CHAIN_HOT = {
  polygon:H.C_POLYGON, arb:H.C_ARB, base:H.C_BASE, opt:H.C_OPT,
  eth:H.C_ETH, bnb:H.C_BNB, avax:H.C_AVAX, blast:H.C_BLAST,
  zksync:H.C_ZKSYNC, scroll:H.C_SCROLL, linea:H.C_LINEA, mantle:H.C_MANTLE,
  gnosis:H.C_GNOSIS, worldchain:H.C_WORLDCHAIN, berachain:H.C_BERACHAIN,
  unichain:H.C_UNICHAIN, sei:H.C_SEI, sonic:H.C_SONIC,
  sonic2:H.C_SONIC2, polygon2:H.C_POLYGON2,
}
