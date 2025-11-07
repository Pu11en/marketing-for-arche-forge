#!/usr/bin/env pwsh
# Spec-Kit State Manager
# Manages workflow state persistence and retrieval

[CmdletBinding()]
param(
    [switch]$Json,
    [string]$Action,
    [string]$Phase,
    [string]$Status,
    [string]$Artifact,
    [string]$Path,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# Show help if requested
if ($Help) {
    Write-Host "Usage: ./state-manager.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Json               Output in JSON format"
    Write-Host "  -Action <action>    Action to perform (get, set, update, reset)"
    Write-Host "  -Phase <phase>      Phase name (specify, clarify, plan, tasks, analyze, implement)"
    Write-Host "  -Status <status>    Status value (passed, failed, in_progress)"
    Write-Host "  -Artifact <type>    Artifact type (spec, plan, tasks)"
    Write-Host "  -Path <path>        Artifact path"
    Write-Host "  -Help               Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./state-manager.ps1 -Action get"
    Write-Host "  ./state-manager.ps1 -Action set -Phase specify -Status passed"
    Write-Host "  ./state-manager.ps1 -Action update -Artifact spec -Path 'specs/001-user-auth/spec.md'"
    exit 0
}

# State management functions
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
        version = "1.0.0"
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

# State manipulation functions
function Set-PhaseStatus {
    param(
        [hashtable]$State,
        [string]$Phase,
        [string]$Status
    )
    
    if (-not $State.validationStatus) {
        $State.validationStatus = @{}
    }
    
    $State.validationStatus[$Phase] = $Status
    
    # Update current phase if setting to in_progress
    if ($Status -eq "in_progress") {
        $State.currentPhase = $Phase
    }
    
    # Add to completed phases if setting to passed
    if ($Status -eq "passed" -and $State.completedPhases -notcontains $Phase) {
        $State.completedPhases += $Phase
    }
    
    return $State
}

function Set-ArtifactPath {
    param(
        [hashtable]$State,
        [string]$Artifact,
        [string]$Path
    )
    
    if (-not $State.artifacts) {
        $State.artifacts = @{}
    }
    
    $State.artifacts[$Artifact] = $Path
    
    return $State
}

function Complete-Phase {
    param(
        [hashtable]$State,
        [string]$Phase
    )
    
    # Set phase status to passed
    $State = Set-PhaseStatus -State $State -Phase $Phase -Status "passed"
    
    # Determine next phase
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    $currentIndex = $phases.IndexOf($Phase)
    
    if ($currentIndex -lt ($phases.Count - 1)) {
        $State.currentPhase = $phases[$currentIndex + 1]
    } else {
        $State.currentPhase = "complete"
        $State.endTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    }
    
    return $State
}

function Reset-WorkflowState {
    $state = Initialize-WorkflowState
    Save-WorkflowState $state
    
    if ($Json) {
        $state | ConvertTo-Json -Depth 10
    } else {
        Write-Host "Workflow state reset."
    }
}

# Validation functions
function Test-PhaseComplete {
    param(
        [hashtable]$State,
        [string]$Phase
    )
    
    return $State.completedPhases -contains $Phase
}

function Test-PhaseInProgress {
    param(
        [hashtable]$State,
        [string]$Phase
    )
    
    return $State.currentPhase -eq $Phase
}

function Get-PhaseProgress {
    param([hashtable]$State)
    
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    $progress = @{}
    
    foreach ($phase in $phases) {
        $progress[$phase] = @{
            completed = Test-PhaseComplete -State $State -Phase $phase
            inProgress = Test-PhaseInProgress -State $State -Phase $phase
            status = if ($State.validationStatus.ContainsKey($phase)) { $State.validationStatus[$phase] } else { "not_started" }
        }
    }
    
    return $progress
}

# Main execution logic
function Main {
    # Get or initialize workflow state
    $state = Get-WorkflowState
    
    if (-not $state) {
        $state = Initialize-WorkflowState
    }
    
    # Handle different actions
    switch ($Action) {
        "get" {
            if ($Json) {
                $state | ConvertTo-Json -Depth 10
            } else {
                Write-Host "Current Workflow State:" -ForegroundColor Green
                Write-Host "Feature: $($state.feature)"
                Write-Host "Current Phase: $($state.currentPhase)"
                Write-Host "Completed Phases: $($state.completedPhases -join ', ')"
                Write-Host "Start Time: $($state.startTime)"
                if ($state.endTime) {
                    Write-Host "End Time: $($state.endTime)"
                }
                
                Write-Host ""
                Write-Host "Validation Status:" -ForegroundColor Yellow
                foreach ($key in $state.validationStatus.Keys) {
                    Write-Host "  $key`: $($state.validationStatus[$key])"
                }
                
                Write-Host ""
                Write-Host "Artifacts:" -ForegroundColor Yellow
                foreach ($key in $state.artifacts.Keys) {
                    Write-Host "  $key`: $($state.artifacts[$key])"
                }
            }
        }
        
        "set" {
            if (-not $Phase -or -not $Status) {
                Write-Error "Phase and Status required for set action."
                exit 1
            }
            
            $state = Set-PhaseStatus -State $state -Phase $Phase -Status $Status
            Save-WorkflowState $state
            
            if ($Json) {
                @{ phase = $Phase; status = $Status } | ConvertTo-Json
            } else {
                Write-Host "Phase '$Phase' status set to '$Status'"
            }
        }
        
        "update" {
            if (-not $Artifact -or -not $Path) {
                Write-Error "Artifact and Path required for update action."
                exit 1
            }
            
            $state = Set-ArtifactPath -State $state -Artifact $Artifact -Path $Path
            Save-WorkflowState $state
            
            if ($Json) {
                @{ artifact = $Artifact; path = $Path } | ConvertTo-Json
            } else {
                Write-Host "Artifact '$Artifact' path set to '$Path'"
            }
        }
        
        "complete" {
            if (-not $Phase) {
                Write-Error "Phase required for complete action."
                exit 1
            }
            
            $state = Complete-Phase -State $state -Phase $Phase
            Save-WorkflowState $state
            
            if ($Json) {
                @{ phase = $Phase; currentPhase = $state.currentPhase } | ConvertTo-Json
            } else {
                Write-Host "Phase '$Phase' completed. Current phase: $($state.currentPhase)"
            }
        }
        
        "progress" {
            $progress = Get-PhaseProgress -State $state
            
            if ($Json) {
                $progress | ConvertTo-Json -Depth 10
            } else {
                Write-Host "Phase Progress:" -ForegroundColor Green
                foreach ($phase in $progress.Keys) {
                    $status = $progress[$phase].status
                    $indicator = if ($progress[$phase].completed) { "✓" } elseif ($progress[$phase].inProgress) { "⏳" } else { "○" }
                    Write-Host "  $phase`: $indicator $status"
                }
            }
        }
        
        "reset" {
            Reset-WorkflowState
        }
        
        default {
            Write-Error "Unknown action: $Action"
            Write-Host "Valid actions: get, set, update, complete, progress, reset"
            exit 1
        }
    }
}

# Execute main function
Main