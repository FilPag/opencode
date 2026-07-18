const enabled = () => {
  const value = process.env.OPENCODE_BOOT_PROFILE?.toLowerCase()
  return value === "true" || value === "1"
}

let previous: number | undefined

function startedAt() {
  if (!enabled()) return
  const existing = Number(process.env.OPENCODE_BOOT_PROFILE_STARTED_AT)
  if (Number.isFinite(existing) && existing > 0) return existing
  const result = performance.timeOrigin
  process.env.OPENCODE_BOOT_PROFILE_STARTED_AT = String(result)
  return result
}

export function mark(milestone: string, attributes?: Record<string, string | number | boolean | undefined>) {
  const start = startedAt()
  if (!start) return
  const now = Date.now()
  const step = now - (previous ?? start)
  previous = now
  process.stderr.write(
    JSON.stringify({
      event: "boot_profile",
      milestone,
      elapsed_ms: now - start,
      step_ms: step,
      ...attributes,
    }) + "\n",
  )
}

export * as BootProfile from "./boot-profile"
