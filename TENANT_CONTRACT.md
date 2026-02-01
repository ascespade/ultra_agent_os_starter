# TENANT CONTRACT (Multi-Tenant Blueprint)

**Orchestrator:** MULTI_TENANT_BLUEPRINT_ORCHESTRATOR v1.0.0  
**Precondition:** dashboard-freeze-v1.0.0  
**Tag:** tenant-freeze-v1.0.0

---

## 1. TENANT MODEL

- **tenant_id:** Mandatory on all tenant-scoped operations.
- **Extraction sources (order):**
  1. **X-TENANT-ID header** — When present and user has role `admin` (global admin view).
  2. **JWT claim** — `tenantId` in the signed payload (from login; user's `tenant_id` in DB).
  3. **API key** — Not implemented in core; reserved for future service-to-service with tenant.

- **fail_if_tenant_missing:** If no tenant can be resolved (no JWT tenantId and no valid X-TENANT-ID for admin), API returns **403** with `Tenant context required`.

---

## 2. ISOLATION RULES

### Database

- **tenant_id on all tables:** `users`, `jobs`, `memories`, `tenant_quotas`, `tenants`.
- Every tenant-scoped query filters by `tenant_id` (and, where applicable, `user_id`).
- Admin with X-TENANT-ID can list jobs for that tenant (all users in tenant); non-admin sees only own user + tenant.

### Redis

- **Tenant-prefixed keys:**
  - Job queue: `tenant:{tenant_id}:job_queue` (list).
  - Job data: `tenant:{tenant_id}:job:{job_id}` (hash, field `data`).
  - Tenant set: `tenants` (set of active tenant_id; worker uses for BLPOP keys).
  - Rate limit: `rate_limit:tenant:{tenant_id}:{user_key}` (via X-TENANT-ID or JWT tenant in key).

### Jobs

- **Tenant-scoped queues:** One list per tenant. API LPUSHes to `tenant:{req.tenantId}:job_queue`. Worker BLPOPs multiple `tenant:*:job_queue` keys (from Redis set `tenants`).
- Job creation: API SADDs `tenants`, tenant_id; INSERTs job with `tenant_id`; LPUSHes and HSETs with tenant prefix.
- Worker: Pops from tenant queues; passes `tenantId` into `updateJobStatus(jobId, tenantId, status, updates)`.

### Plugins

- **enabled per tenant:** Reserved; plugin execution and config are intended to be tenant-scoped when plugins are introduced.

---

## 3. SECURITY GUARDS

- **cross_tenant_access:** Forbidden. No endpoint returns data for another tenant unless the caller is admin and explicitly sets X-TENANT-ID to that tenant (global admin view).
- **fail_if_tenant_missing:** True. Authenticated routes use `requireTenant`; missing tenant → 403.

---

## 4. DASHBOARD CHANGES

- **tenant_switcher:** Admin dashboard (index_admin.html) shows a Tenant dropdown when user role is `admin`. Data from `GET /api/admin/tenants`. Selected tenant is stored in localStorage and sent as **X-TENANT-ID** on all API requests (status, jobs, job detail).
- **global_admin_view:** Admin can switch tenant and see that tenant’s jobs and status (queue length for that tenant, etc.).

---

## 5. API CONTRACT (Tenant-Aware)

- **POST /api/auth/login** — Returns JWT with `tenantId` (and `role`) from user row. No tenant header required.
- **GET /api/adapters/status** — Requires tenant (JWT or X-TENANT-ID). Returns queue length for `tenant:{tenantId}:job_queue`.
- **POST /api/chat** — Requires tenant. Creates job with `tenant_id`; pushes to `tenant:{tenantId}:job_queue`.
- **GET /api/jobs** — Requires tenant. Returns jobs for that tenant; admin sees all jobs in tenant, non-admin only own.
- **GET /api/jobs/:id** — Requires tenant. Returns job if in tenant and (own user or admin).
- **GET/POST /api/memory/:filename** — Requires tenant. Filters by `user_id` and `tenant_id`.
- **GET /api/workspace** — Requires tenant. Filters by `user_id` and `tenant_id`.
- **GET /api/admin/tenants** — Requires tenant + role admin. Returns list of `{ tenant_id, name, status }` from `tenants` table.

---

## 6. SUCCESS CRITERIA

- **Tenant A cannot see tenant B data:** Enforced by tenant_id on all queries and tenant-prefixed Redis keys; no shared queue or job keys.
- **Jobs isolated per tenant:** Separate queues and job hashes per tenant; worker pops per-tenant queues.
- **Plugins isolated per tenant:** Contract reserved; implementation when plugins are added.

---

## 7. DEFAULT TENANT

- Migration ensures row in `tenants`: `tenant_id = 'default'`, `name = 'Default'`, `status = 'active'`.
- Default admin user is created with `tenant_id = 'default'`, `role = 'admin'`.
- Worker ensures Redis set `tenants` contains `default` if empty so BLPOP runs on at least `tenant:default:job_queue`.
