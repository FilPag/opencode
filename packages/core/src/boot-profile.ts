const enabled = () => {
  const value = process.env.OPENCODE_BOOT_PROFILE?.toLowerCase()
  return value === "true" || value === "1"
}

function startedAt() {
  if (!enabled()) return
  const existing = Number(process.env.OPENCODE_BOOT_PROFILE_STARTED_AT)
  if (Number.isFinite(existing) && existing > 0) return existing
  const result = Date.now()
  process.env.OPENCODE_BOOT_PROFILE_STARTED_AT = String(result)
  return result
}

export function mark(milestone: string, attributes?: Record<string, string | number | boolean | undefined>) {
  const start = startedAt()
  if (!start) return
  process.stderr.write(
    JSON.stringify({
      event: "boot_profile",
      milestone,
      elapsed_ms: Date.now() - start,
      ...attributes,
    }) + "\n",
  )
}

export * as BootProfile from "./boot-profile"
