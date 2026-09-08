// src/flash.js -- SOVEREIGNTY live flash monitor
// Reads actual Balancer Vault and Aave balance every 60 seconds
// Updates HOT with confirmed live flash capacity
// Dashboard reads from HOT -- always shows live numbers

import { ethers }        from 'ethers'
import { H, PRIMARY_CHAIN, BALANCER_VAULT } from './config.js'

const USDC    = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const aUSDC   = '0x625E7708f30cA75bfd92586e17077590C60eb4cD'
const ERC20   = ['function balanceOf(address) view returns (uint256)']

function makeProvider() {
  const c = PRIMARY_CHAIN
  const n = new ethers.Network(c.name, c.id)
  return new ethers.JsonRpcProvider(c.http, n, { staticNetwork:n })
}

async function readLiveFlash(HOT) {
  try {
    const provider = makeProvider()
    const usdc     = new ethers.Contract(USDC, ERC20, provider)

    const [balancerBal, aaveBal] = await Promise.all([
      usdc.balanceOf(BALANCER_VAULT),
      usdc.balanceOf(aUSDC),
    ])

    const balancerUSD = Number(balancerBal) / 1e6
    const aaveUSD     = Number(aaveBal)     / 1e6
    const totalUSD    = balancerUSD + aaveUSD

    HOT[H.LIVE_FLASH]    = totalUSD
    HOT[H.LIVE_EXTRACT]  = totalUSD * 0.10

    return { balancerUSD, aaveUSD, totalUSD }
  } catch { return null }
}

export function startFlash(HOT) {
  // First read immediately
  readLiveFlash(HOT).then(r => {
    if (r) console.log(
      `[FLASH] Live: Balancer $${(r.balancerUSD/1e6).toFixed(2)}M | ` +
      `Aave $${(r.aaveUSD/1e6).toFixed(2)}M | Total $${(r.totalUSD/1e6).toFixed(2)}M`
    )
  }).catch(()=>{})

  // Then every 60 seconds
  setInterval(() => readLiveFlash(HOT).catch(()=>{}), 60_000)

  console.log('[FLASH] Live flash capacity monitor active | 60s reads | Balancer + Aave')
}
