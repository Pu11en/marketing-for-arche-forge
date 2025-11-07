---
description: Unified spec-driven development workflow mode that orchestrates the complete development process from specification to implementation.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

The spec-kit mode is a unified orchestrator that guides users through the complete spec-driven development workflow:

```
specify → clarify → plan → tasks → analyze → implement
```

This workflow maintains state between phases, provides intelligent validation, and ensures a cohesive development experience.

## Workflow State Management

### 1. Initialize Workflow State

First, check for existing workflow state and initialize if needed:

```powershell
# Check if workflow state exists
$stateFile = ".specify/workflow-state.json"
if (Test-Path $stateFile) {
    $state = Get-Content $stateFile | ConvertFrom-Json
} else {
    # Initialize new workflow state
    $state = @{
        feature = $null
        currentPhase = "initialize"
        completedPhases = @()
        validationStatus = @{}
        artifacts = @{}
        startTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    }
}
```

### 2. Determine Current Phase

Based on user input and existing state, determine the appropriate phase:

```powershell
# Parse user intent from $ARGUMENTS
if ($ARGUMENTS -match "new|create|start") {
    $state.currentPhase = "specify"
} elseif ($ARGUMENTS -match "continue|resume") {
    # Continue from last phase
    $state.currentPhase = Get-LastIncompletePhase $state
} elseif ($ARGUMENTS -match "status|progress") {
    # Show current status
    Show-WorkflowStatus $state
    exit 0
} else {
    # Default to specify for new features
    $state.currentPhase = "specify"
}
```

## Phase Execution

### Phase 1: Specify

**Purpose**: Transform user idea into structured specification

**Prerequisites**: None
**Validation**: Quality gates for specification completeness
**Output**: `specs/[###-feature-name]/spec.md`

```powershell
if ($state.currentPhase -eq "specify") {
    Write-Host "=== Phase 1: Specification ===" -ForegroundColor Cyan
    
    # Execute specify workflow
    & .kilocode/workflows/speckit.specify.md $ARGUMENTS
    
    # Update state
    $state.feature = $env:SPECIFY_FEATURE
    $state.completedPhases += "specify"
    $state.artifacts.spec = "specs/$($state.feature)/spec.md"
    $state.validationStatus.spec = Validate-Specification $state.artifacts.spec
    
    # Advance to next phase
    $state.currentPhase = "clarify"
    Save-WorkflowState $state
}
```

### Phase 2: Clarify

**Purpose**: Resolve ambiguities and refine requirements

**Prerequisites**: Complete specification
**Validation**: Maximum 3 ambiguities remaining
**Output**: Updated specification with clarifications

```powershell
if ($state.currentPhase -eq "clarify") {
    Write-Host "=== Phase 2: Clarification ===" -ForegroundColor Cyan
    
    # Check for clarification needs
    $clarifications = Get-ClarificationNeeds $state.artifacts.spec
    
    if ($clarifications.Count -gt 0) {
        Write-Host "Found $($clarifications.Count) ambiguities that need clarification:"
        
        # Execute clarify workflow
        & .kilocode/workflows/speckit.clarify.md $ARGUMENTS
        
        # Re-validate after clarification
        $state.validationStatus.clarify = Validate-Clarification $state.artifacts.spec
    } else {
        Write-Host "No clarifications needed. Specification is clear."
        $state.validationStatus.clarify = "passed"
    }
    
    $state.completedPhases += "clarify"
    $state.currentPhase = "plan"
    Save-WorkflowState $state
}
```

### Phase 3: Plan

**Purpose**: Create technical implementation plan

**Prerequisites**: Clarified specification
**Validation**: Constitution compliance, technical decisions documented
**Output**: `specs/[###-feature-name]/plan.md` and design artifacts

```powershell
if ($state.currentPhase -eq "plan") {
    Write-Host "=== Phase 3: Planning ===" -ForegroundColor Cyan
    
    # Execute plan workflow
    & .kilocode/workflows/speckit.plan.md $ARGUMENTS
    
    # Update state
    $state.artifacts.plan = "specs/$($state.feature)/plan.md"
    $state.validationStatus.plan = Validate-Plan $state.artifacts.plan
    
    $state.completedPhases += "plan"
    $state.currentPhase = "tasks"
    Save-WorkflowState $state
}
```

### Phase 4: Tasks

**Purpose**: Break down implementation into executable tasks

**Prerequisites**: Complete implementation plan
**Validation**: User story coverage complete, dependency graph valid
**Output**: `specs/[###-feature-name]/tasks.md`

```powershell
if ($state.currentPhase -eq "tasks") {
    Write-Host "=== Phase 4: Task Generation ===" -ForegroundColor Cyan
    
    # Execute tasks workflow
    & .kilocode/workflows/speckit.tasks.md $ARGUMENTS
    
    # Update state
    $state.artifacts.tasks = "specs/$($state.feature)/tasks.md"
    $state.validationStatus.tasks = Validate-Tasks $state.artifacts.tasks
    
    $state.completedPhases += "tasks"
    $state.currentPhase = "analyze"
    Save-WorkflowState $state
}
```

### Phase 5: Analyze

**Purpose**: Quality analysis and validation

**Prerequisites**: Complete task breakdown
**Validation**: No critical issues, coverage adequate
**Output**: Analysis report and recommendations

```powershell
if ($state.currentPhase -eq "analyze") {
    Write-Host "=== Phase 5: Analysis ===" -ForegroundColor Cyan
    
    # Execute analyze workflow
    & .kilocode/workflows/speckit.analyze.md $ARGUMENTS
    
    # Check for critical issues
    $analysis = Get-AnalysisResults $state.feature
    $state.validationStatus.analyze = Validate-Analysis $analysis
    
    if ($state.validationStatus.analyze -eq "failed") {
        Write-Host "Critical issues found. Returning to planning phase."
        $state.currentPhase = "plan"
        Save-WorkflowState $state
        exit 1
    }
    
    $state.completedPhases += "analyze"
    $state.currentPhase = "implement"
    Save-WorkflowState $state
}
```

### Phase 6: Implement

**Purpose**: Execute the implementation plan

**Prerequisites**: Passed analysis phase
**Validation**: Implementation matches specification
**Output**: Working feature implementation

```powershell
if ($state.currentPhase -eq "implement") {
    Write-Host "=== Phase 6: Implementation ===" -ForegroundColor Cyan
    
    # Check checklist status
    $checklistStatus = Get-ChecklistStatus $state.feature
    
    if ($checklistStatus.incomplete -gt 0) {
        Write-Host "Warning: $($checklistStatus.incomplete) checklist items incomplete."
        Write-Host "Continue with implementation? (yes/no)"
        $response = Read-Host
        if ($response -ne "yes") {
            Write-Host "Implementation paused. Complete checklists first."
            exit 0
        }
    }
    
    # Execute implement workflow
    & .kilocode/workflows/speckit.implement.md $ARGUMENTS
    
    # Update state
    $state.validationStatus.implement = Validate-Implementation $state.feature
    $state.completedPhases += "implement"
    
    # Mark workflow complete
    $state.currentPhase = "complete"
    $state.endTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    Save-WorkflowState $state
}
```

## Progress Visualization

### Workflow Dashboard

```powershell
function Show-WorkflowStatus {
    param([hashtable]$State)
    
    Write-Host "## Feature Development Progress: $($State.feature)" -ForegroundColor Green
    Write-Host ""
    
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    $totalPhases = $phases.Count
    $completedPhases = $State.completedPhases.Count
    $progressPercent = [math]::Round(($completedPhases / $totalPhases) * 100)
    
    foreach ($phase in $phases) {
        $status = if ($State.completedPhases -contains $phase) { "✓" } elseif ($State.currentPhase -eq $phase) { "⏳" } else { "-" }
        $progress = if ($State.completedPhases -contains $phase) { "████████████████████" } elseif ($State.currentPhase -eq $phase) { "████████░░░░░░░░░░" } else { "░░░░░░░░░░░░░░░░░░░░" }
        
        Write-Host "$($phase.PadRight(10)) $progress $progressPercent% $status"
    }
    
    Write-Host ""
    Write-Host "## Generated Artifacts" -ForegroundColor Green
    Write-Host ""
    
    $artifacts = @(
        @{ Name = "spec.md"; Path = $State.artifacts.spec; Status = if ($State.validationStatus.spec -eq "passed") { "✅ Complete" } else { "❌ Incomplete" } },
        @{ Name = "plan.md"; Path = $State.artifacts.plan; Status = if ($State.validationStatus.plan -eq "passed") { "✅ Complete" } else { "❌ Incomplete" } },
        @{ Name = "tasks.md"; Path = $State.artifacts.tasks; Status = if ($State.validationStatus.tasks -eq "passed") { "✅ Complete" } else { "❌ Incomplete" } }
    )
    
    Write-Host "| Artifact | Status | Location |"
    Write-Host "|----------|--------|----------|"
    
    foreach ($artifact in $artifacts) {
        if ($artifact.Path) {
            $location = Split-Path $artifact.Path -Parent
            Write-Host "| $($artifact.Name) | $($artifact.Status) | $location |"
        }
    }
}
```

## Error Handling and Recovery

### Phase Validation

```powershell
function Test-PhasePrerequisites {
    param(
        [string]$Phase,
        [hashtable]$State
    )
    
    switch ($Phase) {
        "clarify" { 
            return (Test-Path $State.artifacts.spec) -and 
                   (Test-SpecQuality $State.artifacts.spec)
        }
        "plan" { 
            return (Test-Path $State.artifacts.spec) -and 
                   ($State.validationStatus.clarify -eq "passed")
        }
        "tasks" { 
            return (Test-Path $State.artifacts.plan) -and
                   ($State.validationStatus.plan -eq "passed")
        }
        "analyze" { 
            return (Test-Path $State.artifacts.tasks) -and
                   ($State.validationStatus.tasks -eq "passed")
        }
        "implement" { 
            return ($State.validationStatus.analyze -eq "passed")
        }
    }
}
```

### Error Recovery

```powershell
function Invoke-PhaseRecovery {
    param(
        [string]$Phase,
        [string]$ErrorType,
        [hashtable]$Context
    )
    
    switch ($ErrorType) {
        "missing_prerequisites" {
            Write-Host "Missing required artifacts for $Phase phase" -ForegroundColor Red
            Write-Host "Suggested actions:"
            foreach ($action in $Context.recoveryActions) {
                Write-Host "  - $action"
            }
        }
        "quality_gate_failure" {
            Write-Host "Quality gate validation failed for $Phase" -ForegroundColor Red
            Write-Host "Issues found:"
            $Context.issues | ForEach-Object { Write-Host "  - $_" }
            Write-Host "Options:"
            Write-Host "  1. Fix issues and retry"
            Write-Host "  2. Override with justification"
            Write-Host "  3. Return to previous phase"
        }
        "constitution_violation" {
            Write-Host "Constitution violation detected in $Phase" -ForegroundColor Red
            Write-Host "This requires explicit justification or modification"
            Write-Host "Violations: $($Context.violations -join ', ')"
        }
    }
}
```

## State Management Functions

```powershell
function Save-WorkflowState {
    param([hashtable]$State)
    
    $stateDir = ".specify"
    if (-not (Test-Path $stateDir)) {
        New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    }
    
    $stateFile = Join-Path $stateDir "workflow-state.json"
    $State | ConvertTo-Json -Depth 10 | Set-Content $stateFile
}

function Get-LastIncompletePhase {
    param([hashtable]$State)
    
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    
    foreach ($phase in $phases) {
        if ($State.completedPhases -notcontains $phase) {
            return $phase
        }
    }
    
    return "complete"
}
```

## Quality Gates

### Specification Quality Gates

```yaml
specify:
  - no_implementation_details
  - measurable_success_criteria
  - complete_user_stories
  - max_3_ambiguities
clarify:
  - max_3_ambiguities_remaining
  - all_critical_questions_answered
plan:
  - constitution_compliance
  - technical_decisions_documented
  - research_complete
tasks:
  - user_story_coverage_complete
  - dependency_graph_valid
  - mvp_tasks_identified
analyze:
  - no_critical_issues
  - coverage_adequate
  - security_reviewed
implement:
  - tests_pass
  - specification_met
  - quality_checks_passed
```

## Completion

When all phases are complete:

```powershell
if ($state.currentPhase -eq "complete") {
    Write-Host "🎉 Feature development complete!" -ForegroundColor Green
    Write-Host "Feature: $($state.feature)"
    Write-Host "Duration: $(Calculate-Duration $state.startTime $state.endTime)"
    Write-Host ""
    Write-Host "## Summary of Completed Work:" -ForegroundColor Green
    
    foreach ($phase in $state.completedPhases) {
        Write-Host "✅ $phase - $($state.validationStatus[$phase])"
    }
    
    Write-Host ""
    Write-Host "Ready for deployment and testing!"
    exit 0
}
```

## Usage Examples

```bash
# Start a new feature
/spec-kit "Add user authentication to my web app"

# Continue from where you left off
/spec-kit continue

# Check current status
/spec-kit status

# Jump to a specific phase (if prerequisites met)
/spec-kit plan
```

## Integration with Individual Commands

The unified spec-kit mode maintains full compatibility with individual commands:

```bash
# Use individual commands directly
/speckit.specify "Add user authentication"
/speckit.clarify
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement

# Switch back to unified mode
/spec-kit continue
```

This provides flexibility for users who prefer to work with individual commands while offering the guided experience of the unified workflow.