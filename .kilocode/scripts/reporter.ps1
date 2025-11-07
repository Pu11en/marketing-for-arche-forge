#!/usr/bin/env pwsh
# Spec-Kit Reporter
# Generates progress reports and visualizations for workflow status

[CmdletBinding()]
param(
    [switch]$Json,
    [switch]$Markdown,
    [switch]$Html,
    [string]$OutputPath,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# Show help if requested
if ($Help) {
    Write-Host "Usage: ./reporter.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Json               Output in JSON format"
    Write-Host "  -Markdown           Output in Markdown format"
    Write-Host "  -Html               Output in HTML format"
    Write-Host "  -OutputPath <path>  Save report to file"
    Write-Host "  -Help               Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./reporter.ps1"
    Write-Host "  ./reporter.ps1 -Markdown -OutputPath 'progress-report.md'"
    Write-Host "  ./reporter.ps1 -Html -OutputPath 'progress-report.html'"
    exit 0
}

# Data collection functions
function Get-WorkflowState {
    $stateFile = Join-Path (Get-RepositoryRoot) ".specify\workflow-state.json"
    
    if (Test-Path $stateFile) {
        try {
            return Get-Content $stateFile | ConvertFrom-Json
        } catch {
            Write-Warning "Invalid workflow state file."
            return $null
        }
    }
    
    return $null
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

function Get-ArtifactDetails {
    param([hashtable]$State)
    
    $artifacts = @()
    
    foreach ($key in $State.artifacts.Keys) {
        $path = $State.artifacts[$key]
        $details = @{
            type = $key
            path = $path
            exists = Test-Path $path
            lastModified = if (Test-Path $path) { (Get-Item $path).LastWriteTime } else { $null }
            size = if (Test-Path $path) { (Get-Item $path).Length } else { 0 }
        }
        
        # Add type-specific details
        if ($key -eq "spec" -and $details.exists) {
            $content = Get-Content $path -Raw
            $details.userStories = ([regex]::Matches($content, "User Story \d+")).Count
            $details.functionalRequirements = ([regex]::Matches($content, "FR-\d+")).Count
            $details.successCriteria = ([regex]::Matches($content, "SC-\d+")).Count
            $details.clarifications = ([regex]::Matches($content, "\[NEEDS CLARIFICATION:")).Count
        }
        
        if ($key -eq "tasks" -and $details.exists) {
            $content = Get-Content $path -Raw
            $details.tasks = ([regex]::Matches($content, "\- \[ \] T\d+")).Count
            $details.parallelTasks = ([regex]::Matches($content, "\[P\]")).Count
        }
        
        $artifacts += $details
    }
    
    return $artifacts
}

function Get-ChecklistStatus {
    param([string]$Feature)
    
    $checklistDir = Join-Path (Get-RepositoryRoot) "specs\$Feature\checklists"
    
    if (-not (Test-Path $checklistDir)) {
        return @{
            total = 0
            completed = 0
            incomplete = 0
            checklists = @()
        }
    }
    
    $total = 0
    $completed = 0
    $checklists = @()
    
    Get-ChildItem $checklistDir -Filter "*.md" | ForEach-Object {
        $content = Get-Content $_.FullName -Raw
        $lines = $content -split "`n"
        
        $checklistTotal = 0
        $checklistCompleted = 0
        
        foreach ($line in $lines) {
            if ($line -match '^- \[([ xX])\]') {
                $checklistTotal++
                $total++
                if ($matches[1] -match '[xX]') {
                    $checklistCompleted++
                    $completed++
                }
            }
        }
        
        $checklists += @{
            name = $_.Name
            total = $checklistTotal
            completed = $checklistCompleted
            incomplete = $checklistTotal - $checklistCompleted
            status = if ($checklistTotal -eq $checklistCompleted) { "✅ PASS" } else { "❌ FAIL" }
        }
    }
    
    return @{
        total = $total
        completed = $completed
        incomplete = $total - $completed
        checklists = $checklists
    }
}

# Report generation functions
function New-TextReport {
    param([hashtable]$State, [array]$Artifacts, [hashtable]$ChecklistStatus)
    
    $report = @()
    
    $report += "## Feature Development Progress: $($State.feature)"
    $report += ""
    
    # Phase progress
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    $totalPhases = $phases.Count
    $completedPhases = $State.completedPhases.Count
    $progressPercent = [math]::Round(($completedPhases / $totalPhases) * 100)
    
    foreach ($phase in $phases) {
        $status = if ($State.completedPhases -contains $phase) { "✓" } elseif ($State.currentPhase -eq $phase) { "⏳" } else { "-" }
        $progress = if ($State.completedPhases -contains $phase) { "████████████████████" } elseif ($State.currentPhase -eq $phase) { "████████░░░░░░░░░░" } else { "░░░░░░░░░░░░░░░░░░░░" }
        
        $report += "$($phase.PadRight(10)) $progress $progressPercent% $status"
    }
    
    $report += ""
    $report += "## Generated Artifacts"
    $report += ""
    $report += "| Artifact | Status | Location | Last Modified |"
    $report += "|----------|--------|----------|---------------|"
    
    foreach ($artifact in $Artifacts) {
        $status = if ($artifact.exists) { "✅ Exists" } else { "❌ Missing" }
        $location = Split-Path $artifact.path -Parent
        $lastModified = if ($artifact.lastModified) { $artifact.lastModified.ToString("yyyy-MM-dd HH:mm") } else { "N/A" }
        
        $report += "| $($artifact.type) | $status | $location | $lastModified |"
    }
    
    # Checklist status
    if ($ChecklistStatus.total -gt 0) {
        $report += ""
        $report += "## Checklist Status"
        $report += ""
        $report += "| Checklist | Total | Completed | Incomplete | Status |"
        $report += "|-----------|-------|-----------|------------|--------|"
        
        foreach ($checklist in $ChecklistStatus.checklists) {
            $report += "| $($checklist.name) | $($checklist.total) | $($checklist.completed) | $($checklist.incomplete) | $($checklist.status) |"
        }
    }
    
    # Timeline
    $report += ""
    $report += "## Timeline"
    $report += ""
    $report += "Start Time: $($State.startTime)"
    if ($State.endTime) {
        $report += "End Time: $($State.endTime)"
        $duration = [datetime]::Parse($State.endTime) - [datetime]::Parse($State.startTime)
        $report += "Duration: $($duration.ToString('g'))"
    } else {
        $elapsed = [datetime]::UtcNow - [datetime]::Parse($State.startTime)
        $report += "Elapsed: $($elapsed.ToString('g'))"
    }
    
    return $report -join "`n"
}

function New-MarkdownReport {
    param([hashtable]$State, [array]$Artifacts, [hashtable]$ChecklistStatus)
    
    $report = @()
    
    $report += "# Feature Development Progress Report"
    $report += ""
    $report += "## Overview"
    $report += ""
    $report += "**Feature**: $($State.feature)"
    $report += "**Current Phase**: $($State.currentPhase)"
    $report += "**Progress**: $($State.completedPhases.Count)/6 phases completed"
    $report += "**Start Time**: $($State.startTime)"
    if ($State.endTime) {
        $report += "**End Time**: $($State.endTime)"
        $duration = [datetime]::Parse($State.endTime) - [datetime]::Parse($State.startTime)
        $report += "**Duration**: $($duration.ToString('g'))"
    }
    $report += ""
    
    # Phase progress with visual indicators
    $report += "## Phase Progress"
    $report += ""
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    
    foreach ($phase in $phases) {
        $completed = $State.completedPhases -contains $phase
        $current = $State.currentPhase -eq $phase
        $status = if ($completed) { "✅ Complete" } elseif ($current) { "🔄 In Progress" } else { "⏸️ Pending" }
        $validation = if ($State.validationStatus.ContainsKey($phase)) { "($($State.validationStatus[$phase]))" } else { "(not started)" }
        
        $report += "### $phase"
        $report += "**Status**: $status $validation"
        $report += ""
    }
    
    # Artifact details
    $report += "## Artifacts"
    $report += ""
    foreach ($artifact in $Artifacts) {
        $report += "### $($artifact.type.ToUpper())"
        $report += "**Path**: $($artifact.path)"
        if ($artifact.exists) {
            $statusText = "Exists"
        } else {
            $statusText = "Missing"
        }
        $report += "**Status**: $statusText"
        if ($artifact.lastModified) {
            $report += "**Last Modified**: $($artifact.lastModified.ToString("yyyy-MM-dd HH:mm:ss"))"
        }
        
        # Add type-specific details
        if ($artifact.type -eq "spec" -and $artifact.exists) {
            $report += "**User Stories**: $($artifact.userStories)"
            $report += "**Functional Requirements**: $($artifact.functionalRequirements)"
            $report += "**Success Criteria**: $($artifact.successCriteria)"
            if ($artifact.clarifications -gt 0) {
                $report += "**Clarifications Needed**: $($artifact.clarifications)"
            }
        }
        
        if ($artifact.type -eq "tasks" -and $artifact.exists) {
            $report += "**Total Tasks**: $($artifact.tasks)"
            $report += "**Parallel Tasks**: $($artifact.parallelTasks)"
        }
        
        $report += ""
    }
    
    # Checklist details
    if ($ChecklistStatus.total -gt 0) {
        $report += "## Quality Checklists"
        $report += ""
        $report += "**Overall Progress**: $($ChecklistStatus.completed)/$($ChecklistStatus.total) items completed"
        $report += ""
        
        foreach ($checklist in $ChecklistStatus.checklists) {
            $report += "### $($checklist.name.Replace('.md', ''))"
            $report += "**Progress**: $($checklist.completed)/$($checklist.total) completed"
            $report += "**Status**: $($checklist.status)"
            $report += ""
        }
    }
    
    # Validation status summary
    $report += "## Validation Status"
    $report += ""
    foreach ($phase in $State.validationStatus.Keys) {
        $status = $State.validationStatus[$phase]
        $icon = if ($status -eq "passed") { "✅" } elseif ($status -eq "failed") { "❌" } else { "⏳" }
        $report += "- **$phase**: $icon $status"
    }
    
    return $report -join "`n"
}

function New-JsonReport {
    param([hashtable]$State, [array]$Artifacts, [hashtable]$ChecklistStatus)
    
    $report = @{
        feature = $State.feature
        currentPhase = $State.currentPhase
        completedPhases = $State.completedPhases
        validationStatus = $State.validationStatus
        startTime = $State.startTime
        endTime = $State.endTime
        artifacts = $Artifacts
        checklists = $ChecklistStatus
        generatedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    }
    
    return $report | ConvertTo-Json -Depth 10
}

function New-HtmlReport {
    param([hashtable]$State, [array]$Artifacts, [hashtable]$ChecklistStatus)
    
    $html = @"
<!DOCTYPE html>
<html>
<head>
    <title>Spec-Kit Progress Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .phase { margin: 10px 0; padding: 10px; border-left: 4px solid #ccc; }
        .phase.completed { border-left-color: #4CAF50; }
        .phase.in-progress { border-left-color: #FF9800; }
        .phase.pending { border-left-color: #9E9E9E; }
        .artifact { margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 3px; }
        .checklist { margin: 10px 0; }
        .progress-bar { width: 100%; height: 20px; background-color: #f0f0f0; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background-color: #4CAF50; transition: width 0.3s ease; }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .status-pass { color: #4CAF50; }
        .status-fail { color: #f44336; }
        .status-pending { color: #FF9800; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Spec-Kit Progress Report</h1>
        <p><strong>Feature:</strong> $($State.feature)</p>
        <p><strong>Current Phase:</strong> $($State.currentPhase)</p>
        <p><strong>Generated:</strong> $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</p>
    </div>
    
    <h2>Phase Progress</h2>
    <div class="progress-bar">
        <div class="progress-fill" style="width: $([math]::Round(($State.completedPhases.Count / 6) * 100))%"></div>
    </div>
    <p>$($State.completedPhases.Count)/6 phases completed</p>
"@
    
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    foreach ($phase in $phases) {
        $completed = $State.completedPhases -contains $phase
        $current = $State.currentPhase -eq $phase
        $cssClass = if ($completed) { "completed" } elseif ($current) { "in-progress" } else { "pending" }
        $status = if ($completed) { "✅ Complete" } elseif ($current) { "🔄 In Progress" } else { "⏸️ Pending" }
        
        $html += @"
    <div class="phase $cssClass">
        <h3>$phase</h3>
        <p>Status: $status</p>
"@
        
        if ($State.validationStatus.ContainsKey($phase)) {
            $validationStatus = $State.validationStatus[$phase]
            $statusClass = if ($validationStatus -eq "passed") { "status-pass" } elseif ($validationStatus -eq "failed") { "status-fail" } else { "status-pending" }
            $html += "        <p>Validation: <span class=`"$statusClass`">$validationStatus</span></p>"
        }
        
        $html += "    </div>"
    }
    
    $html += @"
    
    <h2>Artifacts</h2>
    <table>
        <tr>
            <th>Type</th>
            <th>Path</th>
            <th>Status</th>
            <th>Last Modified</th>
        </tr>
"@
    
    foreach ($artifact in $Artifacts) {
        $status = if ($artifact.exists) { "✅ Exists" } else { "❌ Missing" }
        $lastModified = if ($artifact.lastModified) { $artifact.lastModified.ToString("yyyy-MM-dd HH:mm") } else { "N/A" }
        
        $html += @"
        <tr>
            <td>$($artifact.type)</td>
            <td>$($artifact.path)</td>
            <td>$status</td>
            <td>$lastModified</td>
        </tr>
"@
    }
    
    $html += "    </table>"
    
    if ($ChecklistStatus.total -gt 0) {
        $html += @"
    
    <h2>Quality Checklists</h2>
    <p>Overall Progress: $($ChecklistStatus.completed)/$($ChecklistStatus.total) items completed</p>
    <table>
        <tr>
            <th>Checklist</th>
            <th>Progress</th>
            <th>Status</th>
        </tr>
"@
        
        foreach ($checklist in $ChecklistStatus.checklists) {
            $html += @"
        <tr>
            <td>$($checklist.name)</td>
            <td>$($checklist.completed)/$($checklist.total)</td>
            <td>$($checklist.status)</td>
        </tr>
"@
        }
        
        $html += "    </table>"
    }
    
    $html += @"
</body>
</html>
"@
    
    return $html
}

# Main execution logic
function Main {
    # Get workflow state
    $state = Get-WorkflowState
    
    if (-not $state) {
        Write-Error "No workflow state found. Cannot generate report."
        exit 1
    }
    
    # Collect data
    $artifacts = Get-ArtifactDetails -State $state
    $checklistStatus = Get-ChecklistStatus -Feature $state.feature
    
    # Generate report
    $report = $null
    
    if ($Html) {
        $report = New-HtmlReport -State $state -Artifacts $artifacts -ChecklistStatus $checklistStatus
    } elseif ($Markdown) {
        $report = New-MarkdownReport -State $state -Artifacts $artifacts -ChecklistStatus $checklistStatus
    } elseif ($Json) {
        $report = New-JsonReport -State $state -Artifacts $artifacts -ChecklistStatus $checklistStatus
    } else {
        # Default to text format
        $report = New-TextReport -State $state -Artifacts $artifacts -ChecklistStatus $checklistStatus
    }
    
    # Output report
    if ($OutputPath) {
        $report | Set-Content $OutputPath
        Write-Host "Report saved to: $OutputPath"
    } else {
        Write-Host $report
    }
}

# Execute main function
Main