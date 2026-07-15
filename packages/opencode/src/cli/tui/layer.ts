import { run as runTui, type TuiInput } from "@opencode-ai/tui"
import type { TuiPluginHost } from "@opencode-ai/tui/plugin/runtime"
import { Global } from "@opencode-ai/core/global"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { BootProfile } from "@opencode-ai/core/boot-profile"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}

export function createTuiPluginHost(
  load: () => Promise<{ createLegacyTuiPluginHost: () => TuiPluginHost }> = () => import("@/plugin/tui/runtime"),
): TuiPluginHost {
  let loading: Promise<TuiPluginHost> | undefined
  let started: Promise<void> | undefined
  let disposed: Promise<void> | undefined

  const get = () => {
    loading ??= (async () => {
      BootProfile.mark("tui.plugin_host.import_started")
      const runtime = await load()
      BootProfile.mark("tui.plugin_host.imported")
      return runtime.createLegacyTuiPluginHost()
    })()
    return loading
  }

  return {
    start(input) {
      started ??= get().then((host) => host.start(input))
      return started
    },
    dispose() {
      if (!started) return Promise.resolve()
      disposed ??= started.catch(() => {}).then(async () => {
        const host = await loading?.catch(() => undefined)
        await host?.dispose()
      })
      return disposed
    },
  }
}
