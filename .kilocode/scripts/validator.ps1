#!/usr/bin/env pwsh
# Spec-Kit Validator
# Provides validation and quality gate checking for workflow phases

[CmdletBinding()]
param(
    [switch]$Json,
    [string]$Phase,
    [string]$Artifact,
    [string]$Path,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# Show help if requested
if ($Help) {
    Write-Host "Usage: ./validator.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Json               Output in JSON format"
    Write-Host "  -Phase <phase>      Phase to validate (specify, clarify, plan, tasks, analyze, implement)"
    Write-Host "  -Artifact <type>    Artifact type to validate (spec, plan, tasks)"
    Write-Host "  -Path <path>        Specific file path to validate"
    Write-Host "  -Help               Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  ./validator.ps1 -Phase specify -Path 'specs/001-user-auth/spec.md'"
    Write-Host "  ./validator.ps1 -Artifact spec"
    Write-Host "  ./validator.ps1 -Phase plan"
    exit 0
}

# Validation functions
function Test-SpecificationQuality {
    param([string]$SpecPath)
    
    if (-not (Test-Path $SpecPath)) {
        return @{
            passed = $false
            issues = @("Specification file not found: $SpecPath")
            warnings = @()
        }
    }
    
    $specContent = Get-Content $SpecPath -Raw
    $issues = @()
    $warnings = @()
    
    # Check for mandatory sections
    $mandatorySections = @(
        "User Scenarios & Testing",
        "Requirements",
        "Success Criteria"
    )
    
    foreach ($section in $mandatorySections) {
        if ($specContent -notmatch [regex]::Escape($section)) {
            $issues += "Missing mandatory section: $section"
        }
    }
    
    # Check for user stories
    if ($specContent -notmatch "User Story \d+") {
        $issues += "No user stories found"
    }
    
    # Check for functional requirements
    if ($specContent -notmatch "FR-\d+") {
        $issues += "No functional requirements found"
    }
    
    # Check for success criteria
    if ($specContent -notmatch "SC-\d+") {
        $issues += "No success criteria found"
    }
    
    # Check for implementation details (should not be in spec)
    $implementationKeywords = @("database", "API", "endpoint", "function", "class", "method")
    foreach ($keyword in $implementationKeywords) {
        if ($specContent -match [regex]::Escape($keyword)) {
            $warnings += "Possible implementation detail detected: $keyword"
        }
    }
    
    # Check for NEEDS CLARIFICATION markers
    $clarifications = [regex]::Matches($specContent, '\[NEEDS CLARIFICATION:([^\]]+)\]')
    if ($clarifications.Count -gt 3) {
        $issues += "Too many clarification markers ($($clarifications.Count)). Maximum allowed is 3."
    }
    
    # Check for measurable success criteria
    $successCriteriaSection = [regex]::Match($specContent, "## Success Criteria[\s\S]*?(?=##|$)").Value
    if ($successCriteriaSection) {
        $nonMeasurablePatterns = @(
            "fast", "easy", "user-friendly", "better", "improved", "optimized"
        )
        
        foreach ($pattern in $nonMeasurablePatterns) {
            if ($successCriteriaSection -match [regex]::Escape($pattern)) {
                $warnings += "Non-measurable term in success criteria: $pattern"
            }
        }
    }
    
    return @{
        passed = ($issues.Count -eq 0)
        issues = $issues
        warnings = $warnings
        clarificationCount = $clarifications.Count
    }
}

function Test-PlanQuality {
    param([string]$PlanPath)
    
    if (-not (Test-Path $PlanPath)) {
        return @{
            passed = $false
            issues = @("Plan file not found: $PlanPath")
            warnings = @()
        }
    }
    
    $planContent = Get-Content $PlanPath -Raw
    $issues = @()
    $warnings = @()
    
    # Check for mandatory sections
    $mandatorySections = @(
        "Technical Context",
        "Constitution Check",
        "Project Structure"
    )
    
    foreach ($section in $mandatorySections) {
        if ($planContent -notmatch [regex]::Escape($section)) {
            $issues += "Missing mandatory section: $section"
        }
    }
    
    # Check for NEEDS CLARIFICATION markers (should be resolved in plan)
    $clarifications = [regex]::Matches($planContent, 'NEEDS CLARIFICATION')
    if ($clarifications.Count -gt 0) {
        $issues += "Unresolved clarification markers found: $($clarifications.Count)"
    }
    
    # Check for technical decisions
    if ($planContent -notmatch "Language/Version") {
        $issues += "Programming language not specified"
    }
    
    if ($planContent -notmatch "Primary Dependencies") {
        $issues += "Primary dependencies not specified"
    }
    
    # Check for project structure
    if ($planContent -notmatch "src/") {
        $warnings += "Source code structure not clearly defined"
    }
    
    # Check constitution compliance
    $constitutionSection = [regex]::Match($planContent, "## Constitution Check[\s\S]*?(?=##|$)").Value
    if ($constitutionSection) {
        if ($constitutionSection -match "VIOLATION") {
            $warnings += "Constitution violations detected - ensure justification is provided"
        }
    } else {
        $issues += "Constitution check section missing"
    }
    
    return @{
        passed = ($issues.Count -eq 0)
        issues = $issues
        warnings = $warnings
    }
}

function Test-TasksQuality {
    param([string]$TasksPath)
    
    if (-not (Test-Path $TasksPath)) {
        return @{
            passed = $false
            issues = @("Tasks file not found: $TasksPath")
            warnings = @()
        }
    }
    
    $tasksContent = Get-Content $TasksPath -Raw
    $issues = @()
    $warnings = @()
    
    # Check for task structure
    $taskPattern = '\- \[ \] T\d+'
    $tasks = [regex]::Matches($tasksContent, $taskPattern)
    
    if ($tasks.Count -eq 0) {
        $issues += "No tasks found"
    }
    
    # Check for phase organization
    $phases = @("Setup", "Foundational", "User Story", "Polish")
    foreach ($phase in $phases) {
        if ($tasksContent -notmatch [regex]::Escape($phase)) {
            $warnings += "Missing phase: $phase"
        }
    }
    
    # Check for user story mapping
    $userStoryPattern = '\[US\d+\]'
    $userStoryReferences = [regex]::Matches($tasksContent, $userStoryPattern)
    
    if ($userStoryReferences.Count -eq 0) {
        $warnings += "No user story references found in tasks"
    }
    
    # Check for parallel task markers
    $parallelTasks = [regex]::Matches($tasksContent, '\[P\]')
    if ($parallelTasks.Count -eq 0) {
        $warnings += "No parallel task opportunities identified"
    }
    
    # Check for dependencies
    if ($tasksContent -notmatch "Dependencies") {
        $warnings += "Task dependencies not documented"
    }
    
    return @{
        passed = ($issues.Count -eq 0)
        issues = $issues
        warnings = $warnings
        taskCount = $tasks.Count
        parallelTaskCount = $parallelTasks.Count
    }
}

function Test-PhasePrerequisites {
    param(
        [string]$Phase,
        [hashtable]$State
    )
    
    switch ($Phase) {
        "specify" { 
            return @{
                passed = $true
                issues = @()
            }
        }
        "clarify" { 
            if (-not $State.artifacts.spec -or -not (Test-Path $State.artifacts.spec)) {
                return @{
                    passed = $false
                    issues = @("Specification not found")
                }
            }
            
            $specValidation = Test-SpecificationQuality -SpecPath $State.artifacts.spec
            return @{
                passed = $specValidation.passed
                issues = $specValidation.issues
            }
        }
        "plan" { 
            if (-not $State.validationStatus.ContainsKey("clarify") -or $State.validationStatus.clarify -ne "passed") {
                return @{
                    passed = $false
                    issues = @("Clarification phase not completed")
                }
            }
            
            return @{
                passed = $true
                issues = @()
            }
        }
        "tasks" { 
            if (-not $State.artifacts.plan -or -not (Test-Path $State.artifacts.plan)) {
                return @{
                    passed = $false
                    issues = @("Plan not found")
                }
            }
            
            if (-not $State.validationStatus.ContainsKey("plan") -or $State.validationStatus.plan -ne "passed") {
                return @{
                    passed = $false
                    issues = @("Plan phase not completed")
                }
            }
            
            return @{
                passed = $true
                issues = @()
            }
        }
        "analyze" { 
            if (-not $State.artifacts.tasks -or -not (Test-Path $State.artifacts.tasks)) {
                return @{
                    passed = $false
                    issues = @("Tasks not found")
                }
            }
            
            if (-not $State.validationStatus.ContainsKey("tasks") -or $State.validationStatus.tasks -ne "passed") {
                return @{
                    passed = $false
                    issues = @("Tasks phase not completed")
                }
            }
            
            return @{
                passed = $true
                issues = @()
            }
        }
        "implement" { 
            if (-not $State.validationStatus.ContainsKey("analyze") -or $State.validationStatus.analyze -ne "passed") {
                return @{
                    passed = $false
                    issues = @("Analysis phase not completed")
                }
            }
            
            return @{
                passed = $true
                issues = @()
            }
        }
        default {
            return @{
                passed = $false
                issues = @("Unknown phase: $Phase")
            }
        }
    }
}

function Get-WorkflowState {
    $stateFile = Join-Path (Get-RepositoryRoot) ".specify\workflow-state.json"
    
    if (Test-Path $stateFile) {
        try {
            return Get-Content $stateFile | ConvertFrom-Json
        } catch {
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

# Main execution logic
function Main {
    $result = $null
    
    # Get workflow state for prerequisite checking
    $state = Get-WorkflowState
    
    if ($Path) {
        # Validate specific file
        if ($Artifact -eq "spec" -or $Path -match "spec\.md$") {
            $result = Test-SpecificationQuality -SpecPath $Path
        } elseif ($Artifact -eq "plan" -or $Path -match "plan\.md$") {
            $result = Test-PlanQuality -PlanPath $Path
        } elseif ($Artifact -eq "tasks" -or $Path -match "tasks\.md$") {
            $result = Test-TasksQuality -TasksPath $Path
        } else {
            Write-Error "Cannot determine artifact type for path: $Path"
            exit 1
        }
    } elseif ($Artifact) {
        # Validate artifact from state
        if (-not $state) {
            Write-Error "No workflow state found. Cannot validate artifact."
            exit 1
        }
        
        switch ($Artifact) {
            "spec" {
                if ($state.artifacts.spec) {
                    $result = Test-SpecificationQuality -SpecPath $state.artifacts.spec
                } else {
                    $result = @{
                        passed = $false
                        issues = @("Specification artifact not found in workflow state")
                        warnings = @()
                    }
                }
            }
            "plan" {
                if ($state.artifacts.plan) {
                    $result = Test-PlanQuality -PlanPath $state.artifacts.plan
                } else {
                    $result = @{
                        passed = $false
                        issues = @("Plan artifact not found in workflow state")
                        warnings = @()
                    }
                }
            }
            "tasks" {
                if ($state.artifacts.tasks) {
                    $result = Test-TasksQuality -TasksPath $state.artifacts.tasks
                } else {
                    $result = @{
                        passed = $false
                        issues = @("Tasks artifact not found in workflow state")
                        warnings = @()
                    }
                }
            }
            default {
                Write-Error "Unknown artifact type: $Artifact"
                exit 1
            }
        }
    } elseif ($Phase) {
        # Validate phase prerequisites
        if (-not $state) {
            Write-Error "No workflow state found. Cannot validate phase prerequisites."
            exit 1
        }
        
        $result = Test-PhasePrerequisites -Phase $Phase -State $state
    } else {
        Write-Error "Must specify either -Path, -Artifact, or -Phase"
        exit 1
    }
    
    # Output results
    if ($Json) {
        $result | ConvertTo-Json -Depth 10
    } else {
        Write-Host "Validation Results:" -ForegroundColor $(if ($result.passed) { "Green" } else { "Red" })
        Write-Host "Status: $(if ($result.passed) { "PASSED" } else { "FAILED" })"
        
        if ($result.issues.Count -gt 0) {
            Write-Host ""
            Write-Host "Issues:" -ForegroundColor Red
            foreach ($issue in $result.issues) {
                Write-Host "  ❌ $issue"
            }
        }
        
        if ($result.warnings.Count -gt 0) {
            Write-Host ""
            Write-Host "Warnings:" -ForegroundColor Yellow
            foreach ($warning in $result.warnings) {
                Write-Host "  ⚠️  $warning"
            }
        }
        
        # Show additional metrics if available
        if ($result.ContainsKey("taskCount")) {
            Write-Host ""
            Write-Host "Metrics:" -ForegroundColor Cyan
            Write-Host "  Tasks: $($result.taskCount)"
            if ($result.ContainsKey("parallelTaskCount")) {
                Write-Host "  Parallel tasks: $($result.parallelTaskCount)"
            }
        }
        
        if ($result.ContainsKey("clarificationCount")) {
            Write-Host ""
            Write-Host "Metrics:" -ForegroundColor Cyan
            Write-Host "  Clarifications needed: $($result.clarificationCount)"
        }
    }
    
    # Exit with appropriate code
    exit $(if ($result.passed) { 0 } else { 1 })
}

# Execute main function
Main