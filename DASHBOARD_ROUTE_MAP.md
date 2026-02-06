# Dashboard Route Map

## Frontend Architecture
- **Type**: Single Page Application (SPA) - Vanilla HTML/JS
- **Entry Point**: `dashboard.html` (served via `server.js`)
- **Routing Mechanism**: Tab-based visibility toggling (CSS `display: none/block`) managed by `data-page` attributes.

## Detected Pages (Screens)
| Page ID | Status | HTML Element ID | Sidebar Link | Description |
|---------|--------|-----------------|--------------|-------------|
| Overview | Present | `#overview` | `data-page="overview"` | System metrics, health, performance charts. |
| Jobs | Present | `#jobs` | `data-page="jobs"` | Job management, statistics, queue status. |
| Memory | Present | `#memory` | `data-page="memory"` | Workspace memory viewer. |
| Adapters | Present | `#adapters` | `data-page="adapters"` | Status of external adapters (Ollama, Docker). |
| System | **MISSING** | N/A | N/A | Required by spec but not found in code. |
| Admin | **MISSING** | N/A | N/A | Required by spec but not found in code. |

## Navigation Structure
- **Sidebar**:
  - System Overview (`overview`)
  - Jobs & Queue (`jobs`)
  - Memory & State (`memory`)
  - Adapters (`adapters`)
- **Issues**:
  - Missing links for "System" and "Admin".
  - "System Overview" likely covers "System" requirement, but needs clarification or separate page.

## Route Handling Logic
- `ProfessionalOpsDashboard.setupNavigation()`: Attaches click listeners to `.nav-item`.
- logic: `active` class is toggled on nav items and corresponding `.page` divs.
