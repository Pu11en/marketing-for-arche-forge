<#
.SYNOPSIS
    Progress reporting for spec-kit workflows
.DESCRIPTION
    Generates and displays progress reports for spec-kit workflow phases
.PARAMETER Action
    The action to perform (show, generate, export)
.PARAMETER Feature
    The feature name/identifier
.PARAMETER Format
    The output format (console, json, markdown)
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("show", "generate", "export")]
    [string]$Action,
    
    [Parameter(Mandatory=$false)]
    [string]$Feature,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("console", "json", "markdown")]
    [string]$Format = "console"
)

# Import required modules
Import-Module ".\state-manager.ps1" -Force

function Show-ProgressReport {
    param([hashtable]$State)
    
    Write-Host "=== Spec-Kit Progress Report ===" -ForegroundColor Cyan
    Write-Host "Feature: $($State.feature)" -ForegroundColor White
    Write-Host "Current Phase: $($State.currentPhase)" -ForegroundColor Yellow
    Write-Host "Started: $($State.startTime)" -ForegroundColor Gray
    Write-Host ""
    
    # Progress bar visualization - fixed special characters
    $totalPhases = 6
    $completedPhases = $State.completedPhases.Count
    $progressPercent = [math]::Round(($completedPhases / $totalPhases) * 100)
    
    $progressBar = ""
    for ($i = 0; $i -lt 20; $i++) {
        if ($i -lt ($completedPhases / $totalPhases * 20)) {
            $progressBar += [char]0x2588  # Full block character
        } else {
            $progressBar += [char]0x2591  # Light shade character
        }
    }
    
    Write-Host "Overall Progress: $progressBar $progressPercent%" -ForegroundColor Cyan
    Write-Host ""
    
    # Phase status table - fixed pipeline expression
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    $phaseStatus = foreach ($phase in $phases) {
        $status = if ($phase -in $State.completedPhases) { "Complete" }
                 elseif ($phase -eq $State.currentPhase) { "In Progress" }
                 else { "Pending" }
        $validation = $State.validationStatus.$phase
        [PSCustomObject]@{
            Phase = $phase
            Status = $status
            Validation = $validation
        }
    }
    
    $phaseStatus | Format-Table -AutoSize
    
    Write-Host ""
    Show-ArtifactStatus -State $State
}

function Show-ArtifactStatus {
    param([hashtable]$State)
    
    Write-Host "=== Artifact Status ===" -ForegroundColor Cyan
    
    $artifacts = @(
        @{ Name = "spec.md"; Path = $State.artifacts.spec; Description = "Specification" },
        @{ Name = "plan.md"; Path = $State.artifacts.plan; Description = "Implementation Plan" },
        @{ Name = "research.md"; Path = $State.artifacts.research; Description = "Research Findings" },
        @{ Name = "tasks.md"; Path = $State.artifacts.tasks; Description = "Task Breakdown" }
    )
    
    $artifactStatus = $artifacts | ForEach-Object {
        $exists = Test-Path $_.Path
        $status = if ($exists) { "✅ Exists" } else { "❌ Missing" }
        $lastModified = if ($exists) { (Get-Item $_.Path).LastWriteTime } else { "N/A" }
        
        [PSCustomObject]@{
            Artifact = $_.Name
            Description = $_.Description
            Status = $status
            Location = $_.Path
            LastModified = $lastModified
        }
    }
    
    $artifactStatus | Format-Table -AutoSize
}

function Export-ProgressReport {
    param(
        [hashtable]$State,
        [string]$OutputFormat,
        [string]$OutputPath
    )
    
    switch ($OutputFormat) {
        "json" {
            Export-JsonReport -State $State -OutputPath $OutputPath
        }
        "markdown" {
            Export-MarkdownReport -State $State -OutputPath $OutputPath
        }
        default {
            Write-Error "Unsupported export format: $OutputFormat"
        }
    }
}

function Export-JsonReport {
    param(
        [hashtable]$State,
        [string]$OutputPath
    )
    
    $report = @{
        feature = $State.feature
        currentPhase = $State.currentPhase
        completedPhases = $State.completedPhases
        validationStatus = $State.validationStatus
        artifacts = @{}
        generatedAt = Get-Date
    }
    
    # Add artifact information
    foreach ($artifact in $State.artifacts.Keys) {
        $path = $State.artifacts.$artifact
        $report.artifacts[$artifact] = @{
            path = $path
            exists = Test-Path $path
            lastModified = if (Test-Path $path) { (Get-Item $path).LastWriteTime } else { $null }
        }
    }
    
    $json = $report | ConvertTo-Json -Depth 10
    $json | Out-File -FilePath $OutputPath -Encoding UTF8
    Write-Host "Report exported to $OutputPath" -ForegroundColor Green
}

function Export-MarkdownReport {
    param(
        [hashtable]$State,
        [string]$OutputPath
    )
    
    $markdown = @"
# Spec-Kit Progress Report

## Feature Information
- **Feature**: $($State.feature)
- **Current Phase**: $($State.currentPhase)
- **Started**: $($State.startTime)
- **Report Generated**: $(Get-Date)

## Progress Overview

"@
    
    $totalPhases = 6
    $completedPhases = $State.completedPhases.Count
    $progressPercent = [math]::Round(($completedPhases / $totalPhases) * 100)
    
    $markdown += @"
- **Overall Progress**: $progressPercent%
- **Completed Phases**: $($State.completedPhases.Count) / $totalPhases

## Phase Status

| Phase | Status | Validation |
|-------|--------|------------|
"@
    
    $phases = @("specify", "clarify", "plan", "tasks", "analyze", "implement")
    foreach ($phase in $phases) {
        $status = if ($phase -in $State.completedPhases) { "✅ Complete" } 
                 elseif ($phase -eq $State.currentPhase) { "⏳ In Progress" } 
                 else { "⭕ Pending" }
        $validation = $State.validationStatus.$phase
        
        $markdown += "| $phase | $status | $validation |`n"
    }
    
    $markdown += @"

## Artifact Status

| Artifact | Description | Status | Location |
|----------|-------------|--------|----------|
"@
    
    $artifacts = @(
        @{ Name = "spec.md"; Path = $State.artifacts.spec; Description = "Specification" },
        @{ Name = "plan.md"; Path = $State.artifacts.plan; Description = "Implementation Plan" },
        @{ Name = "research.md"; Path = $State.artifacts.research; Description = "Research Findings" },
        @{ Name = "tasks.md"; Path = $State.artifacts.tasks; Description = "Task Breakdown" }
    )
    
    foreach ($artifact in $artifacts) {
        $exists = Test-Path $artifact.Path
        $status = if ($exists) { "✅ Exists" } else { "❌ Missing" }
        
        $markdown += "| $($artifact.Name) | $($artifact.Description) | $status | $($artifact.Path) |`n"
    }
    
    $markdown | Out-File -FilePath $OutputPath -Encoding UTF8
    Write-Host "Markdown report exported to $OutputPath" -ForegroundColor Green
}

function Generate-SummaryReport {
    param([hashtable]$State)
    
    $totalPhases = 6
    $completedPhases = $State.completedPhases.Count
    $progressPercent = [math]::Round(($completedPhases / $totalPhases) * 100)
    
    $summary = @{
        feature = $State.feature
        currentPhase = $State.currentPhase
        progressPercent = $progressPercent
        completedPhases = $completedPhases
        totalPhases = $totalPhases
        isComplete = ($completedPhases -eq $totalPhases)
        nextSteps = @()
    }
    
    # Determine next steps
    if ($State.currentPhase -eq "specify") {
        $summary.nextSteps += "Complete specification document"
        $summary.nextSteps += "Review user stories and acceptance criteria"
    } elseif ($State.currentPhase -eq "clarify") {
        $summary.nextSteps += "Resolve remaining ambiguities"
        $summary.nextSteps += "Finalize requirements"
    } elseif ($State.currentPhase -eq "plan") {
        $summary.nextSteps += "Complete technical design"
        $summary.nextSteps += "Document implementation approach"
    } elseif ($State.currentPhase -eq "tasks") {
        $summary.nextSteps += "Break down work into executable tasks"
        $summary.nextSteps += "Define task dependencies"
    } elseif ($State.currentPhase -eq "analyze") {
        $summary.nextSteps += "Review quality analysis"
        $summary.nextSteps += "Address any critical issues"
    } elseif ($State.currentPhase -eq "implement") {
        $summary.nextSteps += "Execute implementation tasks"
        $summary.nextSteps += "Validate completed work"
    }
    
    return $summary
}

# Main execution logic
switch ($Action) {
    "show" {
        if (-not $Feature) {
            Write-Error "Feature name is required for show action"
            exit 1
        }
        
        $state = Get-WorkflowState -FeatureName $Feature
        if (-not $state) {
            Write-Error "No workflow state found for feature: $Feature"
            exit 1
        }
        
        Show-ProgressReport -State $state
    }
    
    "generate" {
        if (-not $Feature) {
            Write-Error "Feature name is required for generate action"
            exit 1
        }
        
        $state = Get-WorkflowState -FeatureName $Feature
        if (-not $state) {
            Write-Error "No workflow state found for feature: $Feature"
            exit 1
        }
        
        $summary = Generate-SummaryReport -State $state
        
        if ($Format -eq "json") {
            $summary | ConvertTo-Json -Depth 10
        } else {
            Write-Host "=== Summary Report ===" -ForegroundColor Cyan
            Write-Host "Feature: $($summary.feature)" -ForegroundColor White
            Write-Host "Progress: $($summary.progressPercent)% ($($summary.completedPhases)/$($summary.totalPhases) phases)" -ForegroundColor Green
            Write-Host "Current Phase: $($summary.currentPhase)" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "Next Steps:" -ForegroundColor Cyan
            $summary.nextSteps | ForEach-Object { Write-Host "  • $_" -ForegroundColor Gray }
        }
    }
    
    "export" {
        if (-not $Feature) {
            Write-Error "Feature name is required for export action"
            exit 1
        }
        
        $state = Get-WorkflowState -FeatureName $Feature
        if (-not $state) {
            Write-Error "No workflow state found for feature: $Feature"
            exit 1
        }
        
        $outputPath = "reports\$($State.feature)-progress-$(Get-Date -Format 'yyyyMMdd-HHmmss').$($Format)"
        Export-ProgressReport -State $state -OutputFormat $Format -OutputPath $outputPath
    }
}