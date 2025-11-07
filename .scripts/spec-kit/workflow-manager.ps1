<#
.SYNOPSIS
    Main orchestration script for spec-kit workflow management
.DESCRIPTION
    Coordinates the execution of spec-kit workflow phases and manages state transitions
.PARAMETER Action
    The action to perform (start, continue, status, reset)
.PARAMETER Feature
    The feature name/identifier
.EXAMPLE
    .\workflow-manager.ps1 -Action start -Feature "user-auth"
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "continue", "status", "reset")]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [string]$Feature
)

# Import required modules
Import-Module ".\state-manager.ps1" -Force
Import-Module ".\reporter.ps1" -Force

function Initialize-Workflow {
    param([string]$FeatureName)
    
    Write-Host "Initializing workflow for feature: $FeatureName" -ForegroundColor Cyan
    
    # Create feature directory structure
    $featurePath = "specs\$FeatureName"
    if (-not (Test-Path $featurePath)) {
        New-Item -ItemType Directory -Path $featurePath -Force
    }
    
    # Initialize workflow state
    $initialState = @{
        feature = $FeatureName
        currentPhase = "specify"
        completedPhases = @()
        validationStatus = @{
            spec = "pending"
            clarify = "pending"
            plan = "pending"
            tasks = "pending"
            analyze = "pending"
            implement = "pending"
        }
        artifacts = @{
            spec = "specs\$FeatureName\spec.md"
            plan = "specs\$FeatureName\plan.md"
            research = "specs\$FeatureName\research.md"
            tasks = "specs\$FeatureName\tasks.md"
        }
        startTime = Get-Date
    }
    
    Save-WorkflowState -State $initialState
    Write-Host "Workflow initialized successfully" -ForegroundColor Green
}

function Get-WorkflowProgress {
    param([hashtable]$State)
    
    $totalPhases = 6
    $completedPhases = $State.completedPhases.Count
    $progressPercent = [math]::Round(($completedPhases / $totalPhases) * 100)
    
    # Progress bar visualization - fixed special characters
    $progressBar = ""
    for ($i = 0; $i -lt 20; $i++) {
        if ($i -lt ($completedPhases / $totalPhases * 20)) {
            $progressBar += [char]0x2588  # Full block character
        } else {
            $progressBar += [char]0x2591  # Light shade character
        }
    }
    
    Write-Host "Workflow Progress: $progressBar $progressPercent%" -ForegroundColor Cyan
    
    # Phase status table - fixed pipeline expression
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    $phaseStatus = foreach ($phase in $phases) {
        $status = if ($phase -in $State.completedPhases) { "Complete" }
                 elseif ($phase -eq $State.currentPhase) { "In Progress" }
                 else { "Pending" }
        [PSCustomObject]@{
            Phase = $phase
            Status = $status
        }
    }
    
    $phaseStatus | Format-Table -AutoSize
}

function Invoke-PhaseTransition {
    param(
        [string]$CurrentPhase,
        [string]$NextPhase,
        [hashtable]$State
    )
    
    Write-Host "Transitioning from $CurrentPhase to $NextPhase" -ForegroundColor Yellow
    
    # Validate current phase completion
    if (-not (Test-PhaseCompletion -Phase $CurrentPhase -State $State)) {
        Write-Error "Cannot transition: $CurrentPhase phase is not complete"
        return $false
    }
    
    # Update state
    $State.completedPhases += $CurrentPhase
    $State.currentPhase = $NextPhase
    $State.validationStatus.$CurrentPhase = "passed"
    
    Save-WorkflowState -State $State
    Write-Host "Successfully transitioned to $NextPhase phase" -ForegroundColor Green
    return $true
}

function Test-PhaseCompletion {
    param(
        [string]$Phase,
        [hashtable]$State
    )
    
    switch ($Phase) {
        "specify" {
            return Test-Path $State.artifacts.spec
        }
        "clarify" {
            return (Test-Path $State.artifacts.spec) -and 
                   (Test-SpecQuality $State.artifacts.spec)
        }
        "plan" {
            return (Test-Path $State.artifacts.plan) -and
                   (Test-PlanCompleteness $State.artifacts.plan)
        }
        "tasks" {
            return (Test-Path $State.artifacts.tasks) -and
                   (Test-TaskCompleteness $State.artifacts.tasks)
        }
        "analyze" {
            return (Test-Path $State.artifacts.tasks) -and
                   (Test-AnalysisComplete $State.artifacts.tasks)
        }
        "implement" {
            return $true  # Implementation is always considered complete when reached
        }
        default {
            return $false
        }
    }
}

# Main execution logic
switch ($Action) {
    "start" {
        if (-not $Feature) {
            Write-Error "Feature name is required when starting a new workflow"
            exit 1
        }
        Initialize-Workflow -FeatureName $Feature
    }
    "continue" {
        $currentState = Get-WorkflowState
        if (-not $currentState) {
            Write-Error "No active workflow found. Use 'start' action to begin."
            exit 1
        }
        Get-WorkflowProgress -State $currentState
    }
    "status" {
        $currentState = Get-WorkflowState
        if (-not $currentState) {
            Write-Host "No active workflow found" -ForegroundColor Yellow
            exit 0
        }
        Get-WorkflowProgress -State $currentState
    }
    "reset" {
        if (-not $Feature) {
            Write-Error "Feature name is required when resetting a workflow"
            exit 1
        }
        Remove-WorkflowState -Feature $Feature
        Write-Host "Workflow reset for feature: $Feature" -ForegroundColor Green
    }
}