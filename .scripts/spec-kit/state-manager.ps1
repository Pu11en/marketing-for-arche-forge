<#
.SYNOPSIS
    Workflow state management for spec-kit
.DESCRIPTION
    Manages persistence and retrieval of workflow state data
.PARAMETER Action
    The action to perform (save, load, remove, exists)
.PARAMETER Feature
    The feature name/identifier
.PARAMETER State
    The state data to save (hashtable)
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("save", "load", "remove", "exists")]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [string]$Feature,
    
    [Parameter(Mandatory=$false)]
    [hashtable]$State
)

$StateDirectory = ".specify"
$StateFile = "$StateDirectory\workflow-state.json"

function Ensure-StateDirectory {
    if (-not (Test-Path $StateDirectory)) {
        New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
    }
}

function Save-WorkflowState {
    param([hashtable]$WorkflowState)
    
    Ensure-StateDirectory
    
    try {
        $jsonState = $WorkflowState | ConvertTo-Json -Depth 10
        $jsonState | Out-File -FilePath $StateFile -Encoding UTF8
        Write-Verbose "Workflow state saved to $StateFile"
        return $true
    }
    catch {
        Write-Error "Failed to save workflow state: $_"
        return $false
    }
}

function Get-WorkflowState {
    param([string]$FeatureName = $null)
    
    if (-not (Test-Path $StateFile)) {
        Write-Verbose "No state file found at $StateFile"
        return $null
    }
    
    try {
        $jsonContent = Get-Content -Path $StateFile -Raw
        $state = $jsonContent | ConvertFrom-Json -AsHashtable
        
        if ($FeatureName -and $state.feature -ne $FeatureName) {
            Write-Verbose "State file exists but for different feature: $($state.feature)"
            return $null
        }
        
        return $state
    }
    catch {
        Write-Error "Failed to load workflow state: $_"
        return $null
    }
}

function Remove-WorkflowState {
    param([string]$FeatureName)
    
    $currentState = Get-WorkflowState -FeatureName $FeatureName
    if (-not $currentState) {
        Write-Warning "No workflow state found for feature: $FeatureName"
        return $false
    }
    
    try {
        Remove-Item -Path $StateFile -Force
        Write-Verbose "Workflow state removed for feature: $FeatureName"
        return $true
    }
    catch {
        Write-Error "Failed to remove workflow state: $_"
        return $false
    }
}

function Test-WorkflowStateExists {
    param([string]$FeatureName = $null)
    
    if (-not (Test-Path $StateFile)) {
        return $false
    }
    
    if ($FeatureName) {
        $currentState = Get-WorkflowState -FeatureName $FeatureName
        return $null -ne $currentState
    }
    
    return $true
}

function Update-WorkflowPhase {
    param(
        [string]$FeatureName,
        [string]$NewPhase,
        [string[]]$CompletedPhases = @()
    )
    
    $currentState = Get-WorkflowState -FeatureName $FeatureName
    if (-not $currentState) {
        Write-Error "No workflow state found for feature: $FeatureName"
        return $false
    }
    
    $currentState.currentPhase = $NewPhase
    foreach ($phase in $CompletedPhases) {
        if ($phase -notin $currentState.completedPhases) {
            $currentState.completedPhases += $phase
        }
    }
    
    return Save-WorkflowState -WorkflowState $currentState
}

function Get-PhaseStatus {
    param([string]$FeatureName)
    
    $state = Get-WorkflowState -FeatureName $FeatureName
    if (-not $state) {
        return $null
    }
    
    $status = @{}
    foreach ($phase in $state.validationStatus.Keys) {
        $status[$phase] = @{
            Status = $state.validationStatus[$phase]
            IsCurrent = ($phase -eq $state.currentPhase)
            IsCompleted = ($phase -in $state.completedPhases)
        }
    }
    
    return $status
}

function Show-WorkflowVisualization {
    param([hashtable]$State)
    
    Write-Host "=== Workflow Visualization ===" -ForegroundColor Cyan
    
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    $currentPhaseIndex = $phases.IndexOf($State.currentPhase)
    
    # Progress visualization - fixed special characters
    for ($i = 0; $i -lt $phases.Count; $i++) {
        $phase = $phases[$i]
        $status = if ($phase -in $State.completedPhases) { "Complete" }
                 elseif ($phase -eq $State.currentPhase) { "In Progress" }
                 else { "Pending" }
        
        $color = if ($phase -in $State.completedPhases) { "Green" }
                elseif ($phase -eq $State.currentPhase) { "Yellow" }
                else { "Gray" }
        
        Write-Host "$status $phase" -ForegroundColor $color
        
        # Fixed missing closing braces
        if ($i -lt $phases.Count - 1) {
            if ($i -lt $currentPhaseIndex) {
                Write-Host "   ↓" -ForegroundColor Green
            } elseif ($i -eq $currentPhaseIndex) {
                Write-Host "   ↓" -ForegroundColor Yellow
            } else {
                Write-Host "   ↓" -ForegroundColor Gray
            }
        }
    }
    
    Write-Host ""
}

function Test-SpecQuality {
    param([string]$SpecPath)
    
    if (-not (Test-Path $SpecPath)) {
        return $false
    }
    
    $content = Get-Content -Path $SpecPath -Raw
    
    # Basic quality checks
    $hasUserStories = $content -match "User Story \d+"
    $hasSuccessCriteria = $content -match "Success Criteria"
    $noImplementationDetails = $content -notmatch "database|API|endpoint|function|class|method|variable"
    
    return $hasUserStories -and $hasSuccessCriteria -and $noImplementationDetails
}

function Test-PlanCompleteness {
    param([string]$PlanPath)
    
    if (-not (Test-Path $PlanPath)) {
        return $false
    }
    
    $content = Get-Content -Path $PlanPath -Raw
    
    # Basic completeness checks
    $hasTechnicalDecisions = $content -match "Technical Decisions"
    $hasImplementationSteps = $content -match "Implementation"
    $hasDependencies = $content -match "Dependencies"
    
    return $hasTechnicalDecisions -and $hasImplementationSteps -and $hasDependencies
}

function Test-TaskCompleteness {
    param([string]$TasksPath)
    
    if (-not (Test-Path $TasksPath)) {
        return $false
    }
    
    $content = Get-Content -Path $TasksPath -Raw
    
    # Basic completeness checks
    $hasTasks = $content -match "Task \d+"
    $hasDependencies = $content -match "depends on|requires"
    $hasAcceptanceCriteria = $content -match "Acceptance Criteria"
    
    return $hasTasks -and $hasDependencies -and $hasAcceptanceCriteria
}

function Test-AnalysisComplete {
    param([string]$TasksPath)
    
    # For now, assume analysis is complete if tasks exist
    return Test-Path $TasksPath
}

# Switch statement - fixed missing closing brace
switch ($Action) {
    "save" {
        if (-not $State) {
            Write-Error "State parameter is required for save action"
            exit 1
        }
        Save-WorkflowState -WorkflowState $State
    }
    "load" {
        Get-WorkflowState -FeatureName $Feature
    }
    "remove" {
        if (-not $Feature) {
            Write-Error "Feature parameter is required for remove action"
            exit 1
        }
        Remove-WorkflowState -FeatureName $Feature
    }
    "exists" {
        Test-WorkflowStateExists -FeatureName $Feature
    }
}