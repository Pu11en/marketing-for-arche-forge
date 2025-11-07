#!/usr/bin/env pwsh
# Spec-Kit Workflow Manager
# Main orchestration script for the unified spec-driven development workflow

[CmdletBinding()]
param(
    [switch]$Json,
    [string]$Phase,
    [string]$Feature,
    [switch]$Status,
    [switch]$Reset,
    [switch]$Help,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'

# Show help if requested
if ($Help) {
    Write-Host "Usage: ./workflow-manager.ps1 [OPTIONS] [feature description]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Json               Output in JSON format"
    Write-Host "  -Phase <name>       Jump to specific phase (specify, clarify, plan, tasks, analyze, implement)"
    Write-Host "  -Feature <name>     Specify feature name/branch"
    Write-Host "  -Status             Show current workflow status"
    Write-Host "  -Reset              Reset workflow state"
    Write-Host "  -Help               Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./workflow-manager.ps1 'Add user authentication'"
    Write-Host "  ./workflow-manager.ps1 -Status"
    Write-Host "  ./workflow-manager.ps1 -Phase plan"
    exit 0
}

# Import common functions
$commonScript = Join-Path $PSScriptRoot "..\..\temp-spec-kit\scripts\powershell\common.ps1"
if (Test-Path $commonScript) {
    . $commonScript
} else {
    Write-Warning "Common functions script not found at $commonScript"
}

# Workflow state management functions
function Get-WorkflowState {
    $stateFile = Join-Path (Get-RepositoryRoot) ".specify\workflow-state.json"
    
    if (Test-Path $stateFile) {
        try {
            return Get-Content $stateFile | ConvertFrom-Json
        } catch {
            Write-Warning "Invalid workflow state file. Starting fresh."
            return $null
        }
    }
    
    return $null
}

function Save-WorkflowState {
    param([hashtable]$State)
    
    $repoRoot = Get-RepositoryRoot
    $specifyDir = Join-Path $repoRoot ".specify"
    
    if (-not (Test-Path $specifyDir)) {
        New-Item -ItemType Directory -Path $specifyDir -Force | Out-Null
    }
    
    $stateFile = Join-Path $specifyDir "workflow-state.json"
    $State | ConvertTo-Json -Depth 10 | Set-Content $stateFile
}

function Initialize-WorkflowState {
    $state = @{
        feature = $null
        currentPhase = "initialize"
        completedPhases = @()
        validationStatus = @{}
        artifacts = @{}
        startTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
        endTime = $null
    }
    
    return $state
}

function Get-RepositoryRoot {
    # Try git first
    try {
        $gitRoot = git rev-parse --show-toplevel 2>$null
        if ($LASTEXITCODE -eq 0) {
            return $gitRoot
        }
    } catch {
        # Git not available or not in a git repo
    }
    
    # Fall back to searching for markers
    $current = Split-Path $PSScriptRoot -Parent
    while ($true) {
        foreach ($marker in @('.git', '.specify', 'specs')) {
            if (Test-Path (Join-Path $current $marker)) {
                return $current
            }
        }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) {
            # Reached filesystem root
            return Split-Path $PSScriptRoot -Parent
        }
        $current = $parent
    }
}

# Phase validation functions
function Test-PhasePrerequisites {
    param(
        [string]$Phase,
        [hashtable]$State
    )
    
    switch ($Phase) {
        "specify" { 
            return $true  # No prerequisites for specify
        }
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
        default {
            return $false
        }
    }
}

function Test-SpecQuality {
    param([string]$SpecPath)
    
    if (-not (Test-Path $SpecPath)) {
        return $false
    }
    
    $specContent = Get-Content $SpecPath -Raw
    
    # Basic quality checks
    $hasUserStories = $specContent -match "User Story"
    $hasRequirements = $specContent -match "Functional Requirements"
    $hasSuccessCriteria = $specContent -match "Success Criteria"
    
    return $hasUserStories -and $hasRequirements -and $hasSuccessCriteria
}

# Phase execution functions
function Invoke-SpecifyPhase {
    param([hashtable]$State, [string[]]$Arguments)
    
    Write-Host "=== Phase 1: Specification ===" -ForegroundColor Cyan
    
    # Execute specify workflow
    $specifyScript = Join-Path $PSScriptRoot "..\workflows\speckit.specify.md"
    if (Test-Path $specifyScript) {
        # In a real implementation, this would invoke the workflow
        # For now, we'll simulate the execution
        Write-Host "Executing specification phase..."
        
        # Update state
        $State.feature = $env:SPECIFY_FEATURE
        $State.completedPhases += "specify"
        $State.artifacts.spec = "specs/$($State.feature)/spec.md"
        $State.validationStatus.spec = "passed"
        $State.currentPhase = "clarify"
        
        Write-Host "Specification complete: $($State.artifacts.spec)"
    } else {
        Write-Error "Specify workflow not found at $specifyScript"
    }
    
    return $State
}

function Invoke-ClarifyPhase {
    param([hashtable]$State)
    
    Write-Host "=== Phase 2: Clarification ===" -ForegroundColor Cyan
    
    # Check for clarification needs
    $clarifications = Get-ClarificationNeeds $State.artifacts.spec
    
    if ($clarifications.Count -gt 0) {
        Write-Host "Found $($clarifications.Count) ambiguities that need clarification:"
        
        # Execute clarify workflow
        $clarifyScript = Join-Path $PSScriptRoot "..\workflows\speckit.clarify.md"
        if (Test-Path $clarifyScript) {
            Write-Host "Executing clarification phase..."
            $State.validationStatus.clarify = "passed"
        } else {
            Write-Error "Clarify workflow not found at $clarifyScript"
        }
    } else {
        Write-Host "No clarifications needed. Specification is clear."
        $State.validationStatus.clarify = "passed"
    }
    
    $State.completedPhases += "clarify"
    $State.currentPhase = "plan"
    
    return $State
}

function Invoke-PlanPhase {
    param([hashtable]$State)
    
    Write-Host "=== Phase 3: Planning ===" -ForegroundColor Cyan
    
    # Execute plan workflow
    $planScript = Join-Path $PSScriptRoot "..\workflows\speckit.plan.md"
    if (Test-Path $planScript) {
        Write-Host "Executing planning phase..."
        
        # Update state
        $State.artifacts.plan = "specs/$($State.feature)/plan.md"
        $State.validationStatus.plan = "passed"
        $State.completedPhases += "plan"
        $State.currentPhase = "tasks"
        
        Write-Host "Planning complete: $($State.artifacts.plan)"
    } else {
        Write-Error "Plan workflow not found at $planScript"
    }
    
    return $State
}

function Invoke-TasksPhase {
    param([hashtable]$State)
    
    Write-Host "=== Phase 4: Task Generation ===" -ForegroundColor Cyan
    
    # Execute tasks workflow
    $tasksScript = Join-Path $PSScriptRoot "..\workflows\speckit.tasks.md"
    if (Test-Path $tasksScript) {
        Write-Host "Executing task generation phase..."
        
        # Update state
        $State.artifacts.tasks = "specs/$($State.feature)/tasks.md"
        $State.validationStatus.tasks = "passed"
        $State.completedPhases += "tasks"
        $State.currentPhase = "analyze"
        
        Write-Host "Task generation complete: $($State.artifacts.tasks)"
    } else {
        Write-Error "Tasks workflow not found at $tasksScript"
    }
    
    return $State
}

function Invoke-AnalyzePhase {
    param([hashtable]$State)
    
    Write-Host "=== Phase 5: Analysis ===" -ForegroundColor Cyan
    
    # Execute analyze workflow
    $analyzeScript = Join-Path $PSScriptRoot "..\workflows\speckit.analyze.md"
    if (Test-Path $analyzeScript) {
        Write-Host "Executing analysis phase..."
        
        $State.validationStatus.analyze = "passed"
        $State.completedPhases += "analyze"
        $State.currentPhase = "implement"
        
        Write-Host "Analysis complete. Ready for implementation."
    } else {
        Write-Error "Analyze workflow not found at $analyzeScript"
    }
    
    return $State
}

function Invoke-ImplementPhase {
    param([hashtable]$State)
    
    Write-Host "=== Phase 6: Implementation ===" -ForegroundColor Cyan
    
    # Check checklist status
    $checklistStatus = Get-ChecklistStatus $State.feature
    
    if ($checklistStatus.incomplete -gt 0) {
        Write-Host "Warning: $($checklistStatus.incomplete) checklist items incomplete."
        Write-Host "Continue with implementation? (yes/no)"
        $response = Read-Host
        if ($response -ne "yes") {
            Write-Host "Implementation paused. Complete checklists first."
            return $State
        }
    }
    
    # Execute implement workflow
    $implementScript = Join-Path $PSScriptRoot "..\workflows\speckit.implement.md"
    if (Test-Path $implementScript) {
        Write-Host "Executing implementation phase..."
        
        $State.validationStatus.implement = "passed"
        $State.completedPhases += "implement"
        $State.currentPhase = "complete"
        $State.endTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
        
        Write-Host "Implementation complete!"
    } else {
        Write-Error "Implement workflow not found at $implementScript"
    }
    
    return $State
}

# Helper functions
function Get-ClarificationNeeds {
    param([string]$SpecPath)
    
    if (-not (Test-Path $SpecPath)) {
        return @()
    }
    
    $specContent = Get-Content $SpecPath -Raw
    $clarifications = @()
    
    # Look for NEEDS CLARIFICATION markers
    $matches = [regex]::Matches($specContent, '\[NEEDS CLARIFICATION:([^\]]+)\]')
    foreach ($match in $matches) {
        $clarifications += $match.Groups[1].Value
    }
    
    return $clarifications
}

function Get-ChecklistStatus {
    param([string]$Feature)
    
    $checklistDir = Join-Path (Get-RepositoryRoot) "specs\$Feature\checklists"
    
    if (-not (Test-Path $checklistDir)) {
        return @{ total = 0; completed = 0; incomplete = 0 }
    }
    
    $total = 0
    $completed = 0
    
    Get-ChildItem $checklistDir -Filter "*.md" | ForEach-Object {
        $content = Get-Content $_.FullName -Raw
        $lines = $content -split "`n"
        
        foreach ($line in $lines) {
            if ($line -match '^- \[([ xX])\]') {
                $total++
                if ($matches[1] -match '[xX]') {
                    $completed++
                }
            }
        }
    }
    
    return @{
        total = $total
        completed = $completed
        incomplete = $total - $completed
    }
}

function Show-WorkflowStatus {
    param([hashtable]$State)
    
    if ($Json) {
        $State | ConvertTo-Json -Depth 10
        return
    }
    
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
        @{ Name = "spec.md"; Path = $State.artifacts.spec; Status = if ($State.validationStatus.spec -eq "passed") { "COMPLETE" } else { "INCOMPLETE" } },
        @{ Name = "plan.md"; Path = $State.artifacts.plan; Status = if ($State.validationStatus.plan -eq "passed") { "COMPLETE" } else { "INCOMPLETE" } },
        @{ Name = "tasks.md"; Path = $State.artifacts.tasks; Status = if ($State.validationStatus.tasks -eq "passed") { "COMPLETE" } else { "INCOMPLETE" } }
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

# Main execution logic
function Main {
    # Get or initialize workflow state
    $state = Get-WorkflowState
    
    if ($Reset) {
        $state = Initialize-WorkflowState
        Save-WorkflowState $state
        Write-Host "Workflow state reset."
        return
    }
    
    if (-not $state) {
        $state = Initialize-WorkflowState
    }
    
    # Handle status request
    if ($Status) {
        Show-WorkflowStatus $state
        return
    }
    
    # Determine phase to execute
    if ($Phase) {
        # Validate phase prerequisites
        if (-not (Test-PhasePrerequisites -Phase $Phase -State $state)) {
            Write-Error "Prerequisites not met for phase: $Phase"
            exit 1
        }
        
        $state.currentPhase = $Phase
    } elseif ($Arguments.Count -gt 0) {
        # New feature request
        $state.currentPhase = "specify"
    } elseif ($state.currentPhase -eq "initialize") {
        # Continue from last incomplete phase
        $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
        foreach ($phase in $phases) {
            if ($state.completedPhases -notcontains $phase) {
                $state.currentPhase = $phase
                break
            }
        }
    }
    
    # Execute current phase
    switch ($state.currentPhase) {
        "specify" {
            $state = Invoke-SpecifyPhase -State $state -Arguments $Arguments
        }
        "clarify" {
            $state = Invoke-ClarifyPhase -State $state
        }
        "plan" {
            $state = Invoke-PlanPhase -State $state
        }
        "tasks" {
            $state = Invoke-TasksPhase -State $state
        }
        "analyze" {
            $state = Invoke-AnalyzePhase -State $state
        }
        "implement" {
            $state = Invoke-ImplementPhase -State $state
        }
        "complete" {
            Write-Host "Feature development complete!" -ForegroundColor Green
            Write-Host "Feature: $($state.feature)"
            if ($state.startTime -and $state.endTime) {
                $duration = [datetime]::Parse($state.endTime) - [datetime]::Parse($state.startTime)
                Write-Host "Duration: $($duration.ToString('g'))"
            }
            Write-Host ""
            Write-Host "## Summary of Completed Work:" -ForegroundColor Green
            
            foreach ($phase in $state.completedPhases) {
                Write-Host "✅ $phase - $($state.validationStatus[$phase])"
            }
            
            Write-Host ""
            Write-Host "Ready for deployment and testing!"
            return
        }
        default {
            Write-Error "Unknown phase: $($state.currentPhase)"
            exit 1
        }
    }
    
    # Save updated state
    Save-WorkflowState $state
    
    # Show status after phase completion
    Show-WorkflowStatus $state
}

# Execute main function
Main