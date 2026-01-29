# Repository Discovery Map

## Directory Structure Analysis

### Executable Service Roots Found:
- **apps/** - INTENDED canonical source
  - apps/api/ (3 items)
  - apps/ui/ (3 items) 
  - apps/worker/ (3 items)
- **services/** - CONFLICTING duplicate structure
  - services/api/ (6 items)
  - services/ui/ (6 items)
  - services/worker/ (5 items)

### Service Entrypoints:

#### apps/ Structure (CANONICAL):
- **apps/api/src/server.js** - Main API server (307 lines)
- **apps/ui/src/server.js** - UI server (25 lines)
- **apps/worker/src/worker.js** - Worker process (297 lines)

#### services/ Structure (TO BE REMOVED):
- **services/api/src/server.js** - Duplicate API implementation
- **services/ui/src/server.js** - Duplicate UI implementation  
- **services/worker/src/worker.js** - Duplicate worker implementation

### Configuration Files with Forbidden References:

#### railway.toml (BLOCKER):
```
source = "services/api"    # ❌ WRONG - should be apps/api
source = "services/ui"     # ❌ WRONG - should be apps/ui  
source = "services/worker" # ❌ WRONG - should be apps/worker
```

### Root Package.json Analysis:
- References apps/ workspaces: ✅ CORRECT
- Scripts reference apps/: ✅ CORRECT

### Docker Files Status:
- Dockerfile.api - References apps/ structure ✅
- Dockerfile.dashboard - References apps/ structure ✅  
- Dockerfile.worker - References apps/ structure ✅

## Conflicts Identified:

1. **CRITICAL**: railway.toml points to services/ but apps/ has the working code
2. **MEDIUM**: Duplicate code exists in services/ directory
3. **LOW**: Some legacy references in documentation

## Canonicalization Plan:

### Phase 1 ✅ COMPLETE:
- Discovery complete
- Conflicts mapped
- Forbidden paths identified

### Next Actions Required:
1. Delete services/ directory entirely
2. Update railway.toml source paths
3. Verify all references point to apps/
4. Validate repository structure

## Risk Assessment:
- **LOW RISK**: apps/ contains complete, working implementations
- **NO DATA LOSS**: services/ contains duplicate/unused code
- **HIGH IMPACT**: Fixes deployment-blocking issues
