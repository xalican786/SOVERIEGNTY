// src/monitor.js -- SOVEREIGNTY ecosystem monitor

import { H }           from './config.js'
import { checkEcosystem } from './shadow.js'

export function startMonitor(HOT) {
  console.log('[MONITOR] Ecosystem monitor active | 5min checks | 0.1% TVL throttle')
  setInterval(()=>{
    const revHour=(HOT[H.REV_TODAY]||0)/(HOT[H.UPTIME]||1)*3600
    checkEcosystem('balancer', revHour*0.5, HOT)
    checkEcosystem('aave',     revHour*0.3, HOT)
  }, 300_000)
}
