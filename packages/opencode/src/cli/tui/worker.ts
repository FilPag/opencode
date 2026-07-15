import { Rpc } from "@/util/rpc"
import { GlobalBus } from "@/bus/global"
import { ServerAuth } from "@/server/auth"
import { writeHeapSnapshot } from "node:v8"
import { Heap } from "@/cli/heap"
import { BootProfile } from "@opencode-ai/core/boot-profile"

type Listener = Awaited<ReturnType<(typeof import("@/server/server"))["listen"]>>

BootProfile.mark("tui.worker.entry")
Heap.start()
const serverModule = import("@/server/server")
void serverModule.catch(() => {})

const onUnhandledRejection = (_error: unknown) => {}

const onUncaughtException = (_error: Error) => {}

process.on("unhandledRejection", onUnhandledRejection)
process.on("uncaughtException", onUncaughtException)

// Subscribe to global events and forward them via RPC
GlobalBus.on("event", (event) => {
  Rpc.emit("global.event", event)
})

let server: Listener | undefined
let internalRequest = false

export const rpc = {
  async fetch(input: { url: string; method: string; headers: Record<string, string>; body?: string }) {
    const firstRequest = !internalRequest
    if (firstRequest) {
      internalRequest = true
      BootProfile.mark("server.internal.first_request")
    }
    const headers = { ...input.headers }
    const auth = ServerAuth.header()
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body,
    })
    const { Server } = await serverModule
    const response = await Server.Default().app.fetch(request)
    if (firstRequest) BootProfile.mark("server.internal.first_response")
    const body = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
  snapshot() {
    const result = writeHeapSnapshot("server.heapsnapshot")
    return result
  },
  async server(input: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    if (server) await server.stop(true)
    const { Server } = await serverModule
    server = await Server.listen(input)
    BootProfile.mark("server.listener.ready")
    return { url: server.url.toString() }
  },
  async checkUpgrade(input: { directory: string }) {
    await serverModule
    const [{ InstanceRuntime }, { upgrade }] = await Promise.all([
      import("@/project/instance-runtime"),
      import("@/cli/upgrade"),
    ])
    await InstanceRuntime.load({ directory: input.directory })
    await upgrade().catch(() => {})
  },
  async reload() {
    await serverModule
    const [{ AppRuntime }, { Effect }, { Config }, { disposeAllInstancesAndEmitGlobalDisposed }] = await Promise.all([
      import("@/effect/app-runtime"),
      import("effect"),
      import("@/config/config"),
      import("@/server/global-lifecycle"),
    ])
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const cfg = yield* Config.Service
        yield* cfg.invalidate()
        yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      }),
    )
  },
  async shutdown() {
    await serverModule
    const { InstanceRuntime } = await import("@/project/instance-runtime")
    await InstanceRuntime.disposeAllInstances()
    if (server) await server.stop(true)
    process.off("unhandledRejection", onUnhandledRejection)
    process.off("uncaughtException", onUncaughtException)
  },
}

Rpc.listen(rpc)
BootProfile.mark("tui.worker.rpc.ready")
