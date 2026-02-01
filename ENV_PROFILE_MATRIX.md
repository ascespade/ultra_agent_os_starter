# ENV PROFILE MATRIX

**Orchestrator:** ENVIRONMENT_PROFILES_ORCHESTRATOR v1.0.0  
**Precondition:** tenant-freeze-v1.0.0  
**Tag:** env-freeze-v1.0.0  
**Rules:** behavior_only, no_code_branching, env_selected_at_boot

---

## 1. ENVIRONMENTS

| Env     | Selected by              | Default when unset |
|---------|---------------------------|--------------------|
| dev     | `APP_ENV=dev` or `PLATFORM_ENV=dev` | dev (default) |
| staging | `APP_ENV=staging` or `PLATFORM_ENV=staging` | — |
| prod    | `APP_ENV=prod` or `PLATFORM_ENV=prod` | — |

Environment is read **once at process boot** via `getEnvProfile()` from `config/env-profiles.js`. No runtime env switching.

---

## 2. BEHAVIOR MATRIX

| Profile  | logging  | limits    | dry_run |
|----------|----------|-----------|--------|
| **dev**  | verbose  | relaxed   | false  |
| **staging** | normal | prod-like | **true** |
| **prod** | minimal  | strict    | false  |

- **logging:** Verbose = more log output; normal = standard; minimal = reduced (errors/warnings).
- **limits:** Relaxed = higher rate limits (ai 16/50, light 100/200); prod-like / strict = production limits (ai 8/25, light 50/100).
- **dry_run:** When true (staging), worker does not run real Docker commands; returns simulated result. No side-effect execution in staging.

---

## 3. IMPLEMENTATION (NO CODE BRANCHING)

- **Single source of truth:** `config/env-profiles.js` holds `BEHAVIOR_MATRIX` and `getEnvProfile()`.
- **No env-specific code paths:** No `if (process.env.NODE_ENV === 'production')` in business logic. Behavior is driven only by the profile object (logging, limits, dry_run).
- **API:** At bootstrap calls `getEnvProfile()`, passes `profile.limitsConfig` to `RateLimitOrchestrator(redisClient, profile.limitsConfig)`. Logs active profile once at startup.
- **Worker:** At bootstrap calls `getEnvProfile()`. In `executeCommand`, when `profile.dry_run === true`, returns simulated result and does not call `docker.run()`.
- **Rate limiter:** `RateLimitOrchestrator` accepts optional `limitsConfig`; policies use it for ai/light rate and burst. No branch on env inside rate limiter.

---

## 4. SUCCESS CRITERIA

- **Same blueprint works in all envs:** One codebase; behavior varies only by `APP_ENV` / `PLATFORM_ENV` at boot.
- **No env-specific code paths:** All behavior comes from `getEnvProfile()`; no scattered env checks.

---

## 5. FILES TOUCHED

| File | Change |
|------|--------|
| `config/env-profiles.js` | New: BEHAVIOR_MATRIX, LIMITS_BY_PROFILE, getEnvProfile(), envLog() |
| `config/env.js` | Re-export getEnvProfile, BEHAVIOR_MATRIX |
| `lib/rate-limiter.js` | RateLimitOrchestrator(redisClient, limitsConfig); setupPolicies uses limitsConfig |
| `apps/api/src/server.js` | Load profile at bootstrap; pass profile.limitsConfig to RateLimitOrchestrator; log profile |
| `apps/worker/src/worker.js` | Require getEnvProfile; in executeCommand use profile.dry_run; log profile at bootstrap |
