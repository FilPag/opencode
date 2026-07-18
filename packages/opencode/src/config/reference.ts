export * as ConfigReference from "./reference"

import { Context, Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Repository } from "@opencode-ai/core/repository"
import { RepositoryCache } from "@opencode-ai/core/repository-cache"
import { Global } from "@opencode-ai/core/global"
import { InstanceState } from "@/effect/instance-state"
import { Config } from "./config"

export interface Info {
  name: string
  path: string
  description?: string
  hidden?: boolean
}

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ConfigReference") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const cache = yield* RepositoryCache.Service
    const state = yield* InstanceState.make(
      Effect.fn("ConfigReference.state")(function* () {
        const result: Info[] = []
        const seen = new Map<string, string | undefined>()
        for (const [name, source] of yield* config.referenceSources()) {
          if (source.type === "local") {
            result.push({ name, path: source.path, description: source.description, hidden: source.hidden })
            continue
          }
          const repository = Repository.parse(source.repository)
          if (!repository || !Repository.isRemote(repository)) continue
          if (source.branch) {
            const valid = yield* RepositoryCache.validateBranch(source.branch).pipe(
              Effect.as(true),
              Effect.catch(() => Effect.succeed(false)),
            )
            if (!valid) continue
          }
          const target = Repository.cachePath(Global.Path.repos, repository)
          if (seen.has(target) && seen.get(target) !== source.branch) continue
          seen.set(target, source.branch)
          result.push({ name, path: target, description: source.description, hidden: source.hidden })
          yield* cache.ensure({ reference: repository, branch: source.branch, refresh: true }).pipe(
            Effect.catchCause((cause) => Effect.logWarning("failed to materialize reference", { name, cause })),
            Effect.forkScoped,
          )
        }
        return result
      }),
    )

    return Service.of({
      list: Effect.fn("ConfigReference.list")(function* () {
        return yield* InstanceState.get(state)
      }),
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Config.node, RepositoryCache.node],
})
