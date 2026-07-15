/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { createSlot, createSolidSlotRegistry, testRender, useRenderer } from "@opentui/solid"
import { onCleanup, onMount } from "solid-js"
import { createSlots } from "../../src/plugin/slots"
import { createTuiPluginApi } from "../fixture/tui-plugin"

type Slots = {
  prompt: {}
}

test("renders fallback content before plugin setup", async () => {
  const runtime = createSlots()
  const Slot = runtime.Slot
  const app = await testRender(() => (
    <Slot name="prompt" mode="replace">
      <text>fallback</text>
    </Slot>
  ))
  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("fallback")
  } finally {
    app.renderer.destroy()
  }
})

test("restores fallback content after plugin disposal", async () => {
  const runtime = createSlots()
  const Slot = runtime.Slot
  let dispose = () => {}
  const App = () => {
    const api = createTuiPluginApi({ renderer: useRenderer() })
    const host = runtime.setup(api)
    expect(runtime.setup(api)).toBe(host)
    host.register({ id: "plugin", slots: { prompt: () => <text>plugin</text> } })
    dispose = host.dispose
    return (
      <Slot name="prompt" mode="replace">
        <text>fallback</text>
      </Slot>
    )
  }
  const app = await testRender(() => <App />)
  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("plugin")
    dispose()
    await Promise.resolve()
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("fallback")
  } finally {
    app.renderer.destroy()
  }
})

test("registering another slot does not remount fallback content", async () => {
  const runtime = createSlots()
  const Slot = runtime.Slot
  let mounts = 0
  let cleanups = 0
  let register = (_plugin: Parameters<ReturnType<typeof runtime.setup>["register"]>[0]) => () => {}
  const Probe = () => {
    onMount(() => mounts++)
    onCleanup(() => cleanups++)
    return <text>fallback</text>
  }
  const App = () => {
    register = runtime.setup(createTuiPluginApi({ renderer: useRenderer() })).register
    return (
      <Slot name="home_logo" mode="replace">
        <Probe />
      </Slot>
    )
  }
  const app = await testRender(() => <App />)
  try {
    await app.renderOnce()
    register({ id: "plugin", slots: { home_bottom: () => <text>bottom</text> } })
    await Promise.resolve()
    await app.renderOnce()
    expect(mounts).toBe(1)
    expect(cleanups).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})

test("replace slot mounts plugin content once", async () => {
  let mounts = 0

  const Probe = () => {
    onMount(() => {
      mounts += 1
    })
    return <box />
  }

  const App = () => {
    const registry = createSolidSlotRegistry<Slots>(useRenderer(), {})
    const Slot = createSlot(registry)
    registry.register({ id: "plugin", slots: { prompt: () => <Probe /> } })

    return (
      <Slot name="prompt" mode="replace">
        <box />
      </Slot>
    )
  }

  const app = await testRender(() => <App />)
  try {
    expect(mounts).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})
