import { expect, test } from "bun:test"
import { createPluginRuntime } from "@opencode-ai/tui/plugin/runtime"
import { createTuiPluginApi } from "../../fixture/tui-plugin"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { createTuiPluginHost } from "../../../src/cli/tui/layer"

const input = {
  api: createTuiPluginApi(),
  config: createTuiResolvedConfig(),
  runtime: createPluginRuntime(),
}

test("does not import plugins when disposed before start", async () => {
  let imports = 0
  const host = createTuiPluginHost(async () => {
    imports += 1
    return {
      createLegacyTuiPluginHost() {
        return { start: async () => {}, dispose: async () => {} }
      },
    }
  })

  await host.dispose()

  expect(imports).toBe(0)
})

test("disposes the host after an in-flight import", async () => {
  const deferred = Promise.withResolvers<{ createLegacyTuiPluginHost: () => ReturnType<typeof createTuiPluginHost> }>()
  const calls: string[] = []
  const host = createTuiPluginHost(() => deferred.promise)

  const start = host.start(input)
  const dispose = host.dispose()
  deferred.resolve({
    createLegacyTuiPluginHost() {
      return {
        async start() {
          calls.push("start")
        },
        async dispose() {
          calls.push("dispose")
        },
      }
    },
  })
  await start
  await dispose

  expect(calls).toEqual(["start", "dispose"])
})

test("disposes without repeating a reported startup failure", async () => {
  let disposed = false
  const host = createTuiPluginHost(async () => ({
    createLegacyTuiPluginHost() {
      return {
        async start() {
          throw new Error("startup failed")
        },
        async dispose() {
          disposed = true
        },
      }
    },
  }))

  await expect(host.start(input)).rejects.toThrow("startup failed")
  await expect(host.dispose()).resolves.toBeUndefined()
  expect(disposed).toBe(true)
})

test("disposes without repeating an import failure", async () => {
  const host = createTuiPluginHost(async () => {
    throw new Error("import failed")
  })

  await expect(host.start(input)).rejects.toThrow("import failed")
  await expect(host.dispose()).resolves.toBeUndefined()
})

test("waits for startup before disposing the host", async () => {
  const startup = Promise.withResolvers<void>()
  const calls: string[] = []
  const host = createTuiPluginHost(async () => ({
    createLegacyTuiPluginHost() {
      return {
        async start() {
          calls.push("start")
          await startup.promise
        },
        async dispose() {
          calls.push("dispose")
        },
      }
    },
  }))

  const start = host.start(input)
  await Promise.resolve()
  await Promise.resolve()
  const dispose = host.dispose()
  expect(calls).toEqual(["start"])
  startup.resolve()
  await start
  await dispose
  expect(calls).toEqual(["start", "dispose"])
})
