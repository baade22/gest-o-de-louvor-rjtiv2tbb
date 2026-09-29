import { loadConfig } from './config.js'
import { LouvorFlowAgent } from './agent.js'
import { startAgentWebServer } from './server.js'

async function main() {
  console.log('====================================================')
  console.log('      LouvorFlow Agent v0.0.15 — Holyrics Bridge    ')
  console.log('====================================================')

  const config = loadConfig()
  console.log(`[Config] SaaS URL: ${config.saasUrl}`)
  console.log(`[Config] Holyrics API: http://${config.holyricsHost}:${config.holyricsPort}`)
  console.log(`[Config] Máquina: ${config.machineName}`)

  const agent = new LouvorFlowAgent(config)

  // Inicia servidor web local
  const webPort = config.agentWebPort || 8765
  startAgentWebServer(agent, webPort)

  // Inicia agente (heartbeat e polling de comandos)
  agent.start()

  process.on('SIGINT', () => {
    console.log('\n[Agent] Encerrando...')
    agent.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n[Agent] Finalizando processo...')
    agent.stop()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('[Agent Fatal]', err)
  process.exit(1)
})
