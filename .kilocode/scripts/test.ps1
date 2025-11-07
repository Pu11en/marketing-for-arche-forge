#!/usr/bin/env pwsh
# Simple test script for spec-kit implementation

Write-Host "Testing Spec-Kit Implementation..." -ForegroundColor Green
Write-Host ""

# Test 1: Check directory structure
Write-Host "Test 1: Directory Structure" -ForegroundColor Yellow
$requiredDirs = @(".kilocode/workflows", ".kilocode/modes", ".kilocode/scripts", ".kilocode/rules", ".kilocode/templates")
foreach ($dir in $requiredDirs) {
    if (Test-Path $dir) {
        Write-Host "  ✓ $dir" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $dir (missing)" -ForegroundColor Red
    }
}

Write-Host ""

# Test 2: Check key files
Write-Host "Test 2: Key Files" -ForegroundColor Yellow
$requiredFiles = @(
    ".kilocode/workflows/spec-kit.md",
    ".kilocode/modes/spec-kit.yaml",
    ".kilocode/scripts/workflow-manager.ps1",
    ".kilocode/scripts/state-manager.ps1",
    ".kilocode/scripts/validator.ps1",
    ".kilocode/scripts/reporter.ps1",
    ".kilocode/templates/template-mappings.yaml",
    ".kilocode/rules/validation-rules.yaml"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (missing)" -ForegroundColor Red
    }
}

Write-Host ""

# Test 3: Check template references
Write-Host "Test 3: Template References" -ForegroundColor Yellow
$templateRefs = @(
    "temp-spec-kit/templates/spec-template.md",
    "temp-spec-kit/templates/plan-template.md",
    "temp-spec-kit/templates/tasks-template.md"
)

foreach ($template in $templateRefs) {
    if (Test-Path $template) {
        Write-Host "  ✓ $template" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $template (missing)" -ForegroundColor Red
    }
}

Write-Host ""

# Test 4: Check script references
Write-Host "Test 4: Script References" -ForegroundColor Yellow
$scriptRefs = @(
    "temp-spec-kit/scripts/powershell/create-new-feature.ps1",
    "temp-spec-kit/scripts/powershell/check-prerequisites.ps1",
    "temp-spec-kit/scripts/powershell/setup-plan.ps1",
    "temp-spec-kit/scripts/powershell/update-agent-context.ps1"
)

foreach ($script in $scriptRefs) {
    if (Test-Path $script) {
        Write-Host "  ✓ $script" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $script (missing)" -ForegroundColor Red
    }
}

Write-Host ""

# Test 5: Check individual workflow files
Write-Host "Test 5: Individual Workflow Files" -ForegroundColor Yellow
$workflowFiles = @(
    ".kilocode/workflows/speckit.specify.md",
    ".kilocode/workflows/speckit.clarify.md",
    ".kilocode/workflows/speckit.plan.md",
    ".kilocode/workflows/speckit.tasks.md",
    ".kilocode/workflows/speckit.analyze.md",
    ".kilocode/workflows/speckit.implement.md"
)

foreach ($workflow in $workflowFiles) {
    if (Test-Path $workflow) {
        Write-Host "  ✓ $workflow" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $workflow (missing)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Spec-Kit Implementation Test Complete!" -ForegroundColor Green