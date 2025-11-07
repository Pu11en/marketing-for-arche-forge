# Spec-Kit Mode: Troubleshooting Guide

## Introduction

This guide helps you diagnose and resolve common issues when using spec-kit mode. It covers problems you might encounter during workflow execution, validation failures, and system errors.

## General Troubleshooting Approach

### 1. Check System Status

Always start by checking the current system status:

```bash
# Check workflow status
/spec-kit status

# Validate current phase
/spec-kit validate

# Generate diagnostic report
/spec-kit report -JSON -OutputPath diagnostics.json
```

### 2. Review Error Messages

Pay attention to error messages and their context:
- Note the exact error text
- Identify which phase failed
- Check if it's a validation or system error
- Look for suggested fixes

### 3. Examine Workflow State

Check the workflow state file for issues:

```bash
# View workflow state
cat .specify/workflow-state.json

# Check for corrupted state
ls -la .specify/
```

## Common Issues and Solutions

### Installation and Setup Issues

#### Issue: Spec-Kit Mode Not Found

**Symptoms**:
```
Error: Mode 'spec-kit' not found
Available modes: code, ask, architect
```

**Solutions**:

1. **Check Mode Installation**:
```bash
# List available modes
/kilo-code modes list

# Check spec-kit mode details
/kilo-code modes info spec-kit
```

2. **Verify File Structure**:
```bash
# Check if mode file exists
ls -la .kilocode/modes/spec-kit.yaml

# Check if workflow exists
ls -la .kilocode/workflows/spec-kit.md
```

3. **Reinstall Spec-Kit Mode**:
```bash
# Remove and reinstall mode files
rm -rf .kilocode/modes/spec-kit.yaml
rm -rf .kilocode/workflows/spec-kit.md

# Reinitialize spec-kit mode
/kilo-code modes install spec-kit
```

#### Issue: PowerShell Scripts Not Executing

**Symptoms**:
```
Error: Script execution failed
PowerShell execution policy restrictions
```

**Solutions**:

1. **Check Execution Policy**:
```powershell
# Check current execution policy
Get-ExecutionPolicy

# Set execution policy for current session
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

2. **Verify Script Permissions**:
```bash
# Check script permissions
ls -la .kilocode/scripts/

# Make scripts executable (on Unix-like systems)
chmod +x .kilocode/scripts/*.ps1
```

3. **Test Script Execution**:
```powershell
# Test simple script
powershell -ExecutionPolicy Bypass -File ".kilocode\scripts\simple-test.ps1"
```

#### Issue: Missing Dependencies

**Symptoms**:
```
Error: temp-spec-kit not found
Missing required templates
Script dependency not satisfied
```

**Solutions**:

1. **Check temp-spec-kit Availability**:
```bash
# Verify temp-spec-kit exists
ls -la temp-spec-kit/

# Check for required templates
ls -la temp-spec-kit/templates/
ls -la temp-spec-kit/scripts/
```

2. **Install Missing Dependencies**:
```bash
# Clone temp-spec-kit if missing
git clone <temp-spec-kit-repo-url> temp-spec-kit

# Install npm dependencies if needed
cd temp-spec-kit && npm install
```

### Workflow Execution Issues

#### Issue: Workflow State Corrupted

**Symptoms**:
```
Error: Invalid workflow state
JSON parsing failed
State file corrupted
```

**Solutions**:

1. **Backup and Reset State**:
```bash
# Backup current state
cp .specify/workflow-state.json .specify/workflow-state.json.backup

# Remove corrupted state
rm .specify/workflow-state.json

# Restart workflow
/spec-kit continue
```

2. **Manual State Repair**:
```json
// Create minimal valid state
{
  "feature": null,
  "currentPhase": "initialize",
  "completedPhases": [],
  "validationStatus": {},
  "artifacts": {},
  "startTime": "2024-01-15T09:00:00Z"
}
```

#### Issue: Phase Transition Failed

**Symptoms**:
```
Error: Phase transition failed
Prerequisites not met
Validation failed
```

**Solutions**:

1. **Check Prerequisites**:
```bash
# Validate current phase
/spec-kit validate -Phase current

# Check required artifacts
ls -la specs/[feature-name]/
```

2. **Manual Phase Completion**:
```bash
# Force phase completion (use with caution)
/spec-kit validate -Phase specify -Force

# Continue to next phase
/spec-kit plan
```

3. **Review Validation Rules**:
```bash
# Check validation rules
cat .kilocode/rules/validation-rules.yaml

# Identify failing validation
/spec-kit validate -Detailed
```

#### Issue: Artifact Not Found

**Symptoms**:
```
Error: Artifact not found
Missing specification file
Plan file does not exist
```

**Solutions**:

1. **Check Artifact Locations**:
```bash
# Check specs directory
ls -la specs/

# Check feature directory
ls -la specs/[feature-name]/

# Verify specific artifact
ls -la specs/[feature-name]/spec.md
```

2. **Recreate Missing Artifacts**:
```bash
# Recreate specification
/speckit.specify "Feature description"

# Recreate plan
/speckit.plan

# Recreate tasks
/speckit.tasks
```

### Validation Issues

#### Issue: Quality Gate Failures

**Symptoms**:
```
Error: Quality gate validation failed
Specification contains implementation details
Success criteria not measurable
User stories incomplete
```

**Solutions**:

1. **Identify Specific Failures**:
```bash
# Get detailed validation report
/spec-kit validate -Detailed

# Check specific quality gates
/spec-kit validate -Phase specify -QualityGate no_implementation_details
```

2. **Fix Common Issues**:

   **Implementation Details in Specification**:
```markdown
# Bad: Contains implementation details
"User can login using JWT token stored in localStorage"

# Good: User-focused
"User can stay logged in between sessions"
```

   **Unmeasurable Success Criteria**:
```markdown
# Bad: Vague criteria
"System should be fast and responsive"

# Good: Measurable criteria
"Page load time < 2 seconds"
"API response time < 500ms"
```

   **Incomplete User Stories**:
```markdown
# Bad: Missing acceptance criteria
"As a user, I want to login"

# Good: Complete with acceptance criteria
"As a user, I want to login so that I can access my account

Acceptance Criteria:
- I can enter email and password
- System validates my credentials
- I'm redirected to dashboard on success
- I see error message on failure"
```

3. **Override Validation (If Necessary)**:
```bash
# Override with justification
/spec-kit validate -Override -Justification "Business requirement requires this approach"
```

#### Issue: Constitution Violations

**Symptoms**:
```
Error: Constitution violation detected
Plan violates project principles
Constitution check failed
```

**Solutions**:

1. **Review Constitution**:
```bash
# Check project constitution
cat temp-spec-kit/memory/constitution.md

# Identify violated principles
/spec-kit validate -Phase plan -Constitution
```

2. **Address Violations**:
```markdown
# Common constitution principles and fixes

## Principle: Simplicity
# Violation: Over-engineered solution
# Fix: Simplify architecture, remove unnecessary complexity

## Principle: Testability
# Violation: Untestable code design
# Fix: Add dependency injection, create testable interfaces

## Principle: Independence
# Violation: Tightly coupled components
# Fix: Implement loose coupling, use interfaces
```

3. **Document Justification**:
```markdown
# If violation is necessary, document justification
## Constitution Violation: Independence Principle

**Violation**: Direct database dependency in service layer
**Justification**: Performance requirements prevent abstraction overhead
**Mitigation**: Isolate dependency in single module, plan future refactoring
**Review Date**: 2024-01-15
```

### Performance Issues

#### Issue: Slow Workflow Execution

**Symptoms**:
```
Workflow taking excessive time
Scripts running slowly
Validation taking too long
```

**Solutions**:

1. **Check System Resources**:
```bash
# Check CPU and memory usage
top
htop

# Check disk space
df -h

# Check for large files
find . -type f -size +100M
```

2. **Optimize Workflow**:
```bash
# Use parallel processing where possible
/spec-kit validate -Parallel

# Generate reports in background
/spec-kit report -Background

# Use cached results
/spec-kit validate -UseCache
```

3. **Profile Performance**:
```bash
# Enable performance logging
/spec-kit validate -Profile

# Check timing information
cat .specify/performance.log
```

#### Issue: Memory Usage High

**Symptoms**:
```
Out of memory errors
System becoming unresponsive
Large memory consumption
```

**Solutions**:

1. **Clear Cache**:
```bash
# Clear spec-kit cache
rm -rf .specify/cache/

# Clear temporary files
rm -rf .specify/temp/
```

2. **Reduce Memory Usage**:
```bash
# Use streaming for large files
/spec-kit report -Stream

# Process in chunks
/spec-kit validate -ChunkSize 100
```

### Integration Issues

#### Issue: Git Integration Problems

**Symptoms**:
```
Git commands failing
Branch creation issues
Merge conflicts
```

**Solutions**:

1. **Check Git Configuration**:
```bash
# Check git status
git status

# Check git configuration
git config --list

# Check remote origin
git remote -v
```

2. **Resolve Git Issues**:
```bash
# Initialize git if needed
git init

# Add remote if missing
git remote add origin <repository-url>

# Resolve merge conflicts
git merge --abort
git reset --hard HEAD
```

3. **Configure Git for Spec-Kit**:
```bash
# Set git user for spec-kit
git config user.name "Spec-Kit User"
git config user.email "spec-kit@example.com"
```

#### Issue: Template Integration Problems

**Symptoms**:
```
Template not found
Template rendering failed
Variable substitution errors
```

**Solutions**:

1. **Check Template Availability**:
```bash
# Check template directory
ls -la temp-spec-kit/templates/

# Check specific template
ls -la temp-spec-kit/templates/spec-template.md
```

2. **Verify Template Mapping**:
```bash
# Check template mappings
cat .kilocode/templates/template-mappings.yaml

# Test template rendering
/spec-kit validate -Template spec
```

3. **Fix Template Issues**:
```markdown
# Common template issues and fixes

## Missing Variables
# Error: Variable not found: {{FEATURE_NAME}}
# Fix: Ensure all variables are defined in context

## Invalid Syntax
# Error: Template syntax error
# Fix: Check template syntax and delimiters

## Encoding Issues
# Error: Template encoding problems
# Fix: Ensure templates use UTF-8 encoding
```

## Error Recovery Strategies

### 1. Phase-Specific Recovery

#### Specification Phase Recovery
```bash
# If specification is corrupted
rm specs/[feature-name]/spec.md
/speckit.specify "Feature description"

# If validation fails
/spec-kit validate -Phase specify -Fix
```

#### Planning Phase Recovery
```bash
# If plan is invalid
rm specs/[feature-name]/plan.md
/speckit.plan

# If constitution violations occur
/spec-kit validate -Phase plan -Constitution -Fix
```

#### Implementation Phase Recovery
```bash
# If implementation fails
git checkout HEAD~1 -- .
/spec-kit implement

# If tests fail
/spec-kit validate -Phase implement -FixTests
```

### 2. System-Wide Recovery

#### Complete Workflow Reset
```bash
# Backup current state
cp -r .specify .specify.backup

# Reset workflow state
rm .specify/workflow-state.json

# Start fresh
/spec-kit "Feature description"
```

#### Emergency Recovery
```bash
# Emergency reset (use with caution)
rm -rf .specify/
rm -rf specs/
git reset --hard HEAD~1

# Reinitialize
/spec-kit "Feature description"
```

## Getting Help

### 1. Built-in Help System

```bash
# General help
/spec-kit help

# Phase-specific help
/spec-kit help specify
/spec-kit help plan
/spec-kit help implement

# Topic-specific help
/spec-kit help user-stories
/spec-kit help validation
/spec-kit help constitution
```

### 2. Diagnostic Information

```bash
# Generate diagnostic report
/spec-kit report -Diagnostic -OutputPath diagnostics.json

# System information
/spec-kit status -System

# Validation report
/spec-kit validate -Report -OutputPath validation-report.md
```

### 3. Log Files

```bash
# Check workflow logs
cat .specify/workflow.log

# Check validation logs
cat .specify/validation.log

# Check error logs
cat .specify/error.log
```

## Prevention Strategies

### 1. Regular Maintenance

```bash
# Clean up temporary files
/spec-kit cleanup

# Backup workflow state
/spec-kit backup

# Update templates
/spec-kit update
```

### 2. Best Practices

1. **Save Progress Frequently**:
```bash
# Save after each major phase
/spec-kit status -Save
```

2. **Validate Regularly**:
```bash
# Validate after each phase
/spec-kit validate
```

3. **Monitor System Health**:
```bash
# Check system status
/spec-kit status -Health
```

### 3. Configuration Management

```bash
# Backup configuration
cp -r .kilocode .kilocode.backup

# Validate configuration
/spec-kit validate -Config

# Reset to defaults
/spec-kit config -Reset
```

## Contact and Support

If you continue to experience issues:

1. **Generate Diagnostic Package**:
```bash
# Create support package
/spec-kit support -Package -OutputPath support-package.zip
```

2. **Include in Support Request**:
- Diagnostic package
- Error messages
- Steps to reproduce
- System information

3. **Community Resources**:
- Check documentation for known issues
- Search for similar problems
- Review community forums

This troubleshooting guide should help you resolve most common issues with spec-kit mode. For complex problems, don't hesitate to seek additional support from the community or development team.