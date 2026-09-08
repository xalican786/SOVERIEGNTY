// src/adapters/modempay.js -- SOVEREIGNTY ModemPay bridge

import { randomUUID } from 'crypto'

const BASE = key => key?.startsWith('sk_live_')
  ? 'https://api.modempay.com/v1'
  : 'https://api.test.modempay.com/v1'

const FEES = {
  wave:0.015, afrimoney:0.015, qmoney:0.015,
  bank:0.0125, international:0.0125, crypto:0.01,
}

export async function send(key, params) {
  const {type,amount,phone,accountNumber,accountName,swiftCode,address,network}=params
  if (!amount||amount<=0) throw new Error('Invalid amount')
  if (!key) throw new Error('MODEMPAY_SECRET_KEY not set in Railway Variables')

  const net=network||(type?.includes('mobile')?'wave':type?.includes('bank')?'bank':'international')
  const fee=amount*(FEES[net]||0.015), netAmt=amount-fee
  const ref=`SOVEREIGNTY | ${Date.now()}`

  const body={
    amount, currency:'GMD',
    account_number:phone||accountNumber||address||'',
    network:net, beneficiary_name:accountName||'Recipient',
    reference:ref, description:ref,
  }
  if (swiftCode) body.swift=swiftCode

  const r=await fetch(`${BASE(key)}/transfers`,{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${key}`,
      'Content-Type':'application/json',
      'Idempotency-Key':randomUUID(),
    },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(60_000),
  })

  const d=await r.json()
  if (!r.ok) throw new Error(d.message||d.error||`ModemPay error ${r.status}`)
  return { ok:true, result:d, fee:+fee.toFixed(2), net:+netAmt.toFixed(2), reference:ref, bridge:'modempay' }
}

export function calcFee(amount, network='wave') {
  const rate=FEES[network]||0.015
  return { amount, fee:+(amount*rate).toFixed(2), net:+(amount*(1-rate)).toFixed(2), rate:`${(rate*100).toFixed(2)}%` }
}
