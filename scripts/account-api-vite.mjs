import { spawn } from 'node:child_process'

export const API_PORT = 3101

/** Development only: run the account API next to Vite so /api works in Preview like the published hybrid site. */
export function accountApi() {
  let child
  return {
    name: 'geongi-market-account-api',
    apply: 'serve',
    configureServer(server) {
      child = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(API_PORT) }, stdio: 'inherit' })
      server.httpServer?.once('close', () => child?.kill())
    },
  }
}
