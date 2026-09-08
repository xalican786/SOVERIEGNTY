// src/oracle.js -- SOVEREIGNTY oracle price feeds
// Chainlink reads -- feeds algorithm.js

import { ethers } from 'ethers'
import { PRIMARY_CHAIN, H } from './config.js'

const FEEDS = {
  ETH_USD:   '0xF9680D99D6C9589e2a93a78A04A279e509205945',
  MATIC_USD: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
}
const ABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)']

function makeProvider() {
  const c = PRIMARY_CHAIN
  const n = new ethers.Network(c.name, c.id)
  return new ethers.JsonRpcProvider(c.http, n, { staticNetwork:n })
}

let ethPrice=0, maticPrice=0

async function readPrices() {
  try {
    const provider = makeProvider()
    const eth   = new ethers.Contract(FEEDS.ETH_USD,   ABI, provider)
    const matic = new ethers.Contract(FEEDS.MATIC_USD, ABI, provider)
    const [eR,mR] = await Promise.allSettled([eth.latestRoundData(), matic.latestRoundData()])
    if (eR.status==='fulfilled') ethPrice   = Number(eR.value[1])/1e8
    if (mR.status==='fulfilled') maticPrice = Number(mR.value[1])/1e8
  } catch {}
}

export function getPrices() { return { ethPrice, maticPrice } }

export function startOracle(HOT) {
  readPrices().catch(()=>{})
  setInterval(()=>readPrices().catch(()=>{}), 30_000)
  console.log('[ORACLE] Chainlink ETH/MATIC | 30s refresh | feeds algorithm.js')
}
