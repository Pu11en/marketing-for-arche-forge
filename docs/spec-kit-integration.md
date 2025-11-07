# Spec-Kit Mode: Integration with Existing Commands

## Introduction

Spec-kit mode provides a unified workflow experience while maintaining full compatibility with existing individual spec-kit commands. This guide explains how to integrate and transition between the unified mode and individual commands effectively.

## Command Overview

### Unified Mode Commands

```bash
# Main unified workflow commands
/spec-kit "Feature description"        # Start new feature workflow
/spec-kit continue                     # Continue from current phase
/spec-kit status                       # Show workflow progress
/spec-kit report                       # Generate progress report
/spec-kit validate                     # Validate current phase
```

### Individual Phase Commands

```bash
# Individual phase commands (can be used independently)
/speckit.specify "Feature description"  # Create specification
/speckit.clarify                       # Resolve ambiguities
/speckit.plan                          # Create implementation plan
/speckit.tasks                         # Generate task breakdown
/speckit.analyze                       # Analyze implementation readiness
/speckit.implement                     # Execute implementation
/speckit.checklist                     # Manage quality checklists
/speckit.constitution                  # Review project constitution
```

### Utility Commands

```bash
# Utility commands available in both modes
/speckit.status                        # Show current status
/speckit.report                        # Generate reports
/speckit.validate                      # Validate artifacts
/speckit.help                          # Get help information
```

## Workflow Integration Patterns

### Pattern 1: Start with Unified Mode, Switch to Individual Commands

This pattern is useful when you want the guided start but prefer individual control later:

```bash
# Start with unified mode for initial setup
/spec-kit "Add user authentication to web app"

# Complete specification phase with guidance
# (System guides you through specification creation)

# Switch to individual commands for more control
/speckit.clarify    # Handle clarifications manually
/speckit.plan       # Create plan with custom approach
/speckit.tasks      # Generate tasks with specific requirements

# Return to unified mode for implementation
/spec-kit continue   # Resumes unified workflow
```

### Pattern 2: Start with Individual Commands, Switch to Unified Mode

This pattern works when you've already started work and want to join the unified workflow:

```bash
# Start with individual commands
/speckit.specify "Add user authentication"
/speckit.clarify

# Switch to unified mode for structured approach
/spec-kit continue   # Detects existing work and integrates

# Continue with unified workflow benefits
# (Automatic phase transitions, validation, state management)
```

### Pattern 3: Hybrid Approach

Use the best of both worlds by switching between modes as needed:

```bash
# Use unified mode for complex features
/spec-kit "Implement payment processing system"

# Use individual commands for quick fixes
/speckit.specify "Fix login button styling"
/speckit.implement

# Return to main feature
/spec-kit continue
```

## State Synchronization

### How State is Managed

The system maintains state in `.specify/workflow-state.json`:

```json
{
  "feature": "001-user-auth",
  "currentPhase": "plan",
  "completedPhases": ["specify", "clarify"],
  "validationStatus": {
    "spec": "passed",
    "clarify": "passed",
    "plan": "in_progress"
  },
  "artifacts": {
    "spec": "specs/001-user-auth/spec.md",
    "plan": "specs/001-user-auth/plan.md",
    "tasks": null
  },
  "mode": "unified",  // Tracks current mode context
  "lastCommand": "speckit.plan",
  "lastUpdated": "2024-01-15T14:30:00Z"
}
```

### Automatic State Detection

When switching between modes, the system automatically:

1. **Detects Existing Artifacts**: Scans for existing specification, plan, and task files
2. **Validates Artifact Quality**: Checks if artifacts meet quality standards
3. **Updates Workflow State**: Synchronizes state with current progress
4. **Determines Next Phase**: Identifies appropriate next phase based on completed work

### Manual State Synchronization

If automatic detection fails, you can manually synchronize:

```bash
# Force state synchronization
/spec-kit sync

# Sync specific artifacts
/spec-kit sync -Artifacts spec,plan

# Sync from specific directory
/spec-kit sync -From specs/001-user-auth/
```

## Command Mapping and Equivalence

### Direct Command Equivalents

| Unified Mode Command | Individual Command | Description |
|----------------------|-------------------|-------------|
| `/spec-kit "feature"` | `/speckit.specify "feature"` | Start new feature |
| `/spec-kit continue` | Varies | Continue from current phase |
| `/spec-kit status` | `/speckit.status` | Show current status |
| `/spec-kit report` | `/speckit.report` | Generate reports |
| `/spec-kit validate` | `/speckit.validate` | Validate artifacts |

### Phase-Specific Equivalents

| Unified Mode Phase | Individual Command | When to Use |
|-------------------|-------------------|-------------|
| specify phase | `/speckit.specify` | Create specification independently |
| clarify phase | `/speckit.clarify` | Handle clarifications manually |
| plan phase | `/speckit.plan` | Create plan with custom approach |
| tasks phase | `/speckit.tasks` | Generate tasks with specific requirements |
| analyze phase | `/speckit.analyze` | Perform custom analysis |
| implement phase | `/speckit.implement` | Execute implementation independently |

## Advanced Integration Techniques

### 1. Custom Workflow Orchestration

Create custom workflows by combining individual commands:

```bash
#!/bin/bash
# custom-workflow.sh

# Start with specification
/speckit.specify "$1"

# Custom clarification process
/speckit.clarify
./custom-clarification-script.sh

# Continue with standard planning
/speckit.plan

# Custom task generation
./custom-task-generator.sh
/speckit.tasks

# Standard analysis and implementation
/speckit.analyze
/speckit.implement
```

### 2. Conditional Workflow Logic

Implement conditional logic based on project needs:

```bash
#!/bin/bash
# conditional-workflow.sh

FEATURE="$1"
COMPLEXITY="$2"

# Start specification
/speckit.specify "$FEATURE"

# Conditional clarification
if [ "$COMPLEXITY" = "high" ]; then
    /speckit.clarify
    /speckit.clarify  # Double clarification for complex features
fi

# Conditional planning
if [ "$COMPLEXITY" = "high" ]; then
    /speckit.plan
    ./additional-research.sh
else
    /speckit.plan
fi

# Continue with standard workflow
/speckit.tasks
/speckit.analyze
/speckit.implement
```

### 3. Parallel Development Support

Support multiple features in parallel:

```bash
#!/bin/bash
# parallel-workflow.sh

FEATURE1="$1"
FEATURE2="$2"

# Start first feature
/spec-kit "$FEATURE1"
SPEC1_STATE=$(cat .specify/workflow-state.json)

# Switch to second feature
cp .specify/workflow-state.json .specify/workflow-state.json.backup
/spec-kit "$FEATURE2"
SPEC2_STATE=$(cat .specify/workflow-state.json)

# Work on features in parallel
echo "Feature 1 State: $SPEC1_STATE"
echo "Feature 2 State: $SPEC2_STATE"

# Switch between features as needed
cp .specify/workflow-state.json.backup .specify/workflow-state.json
/spec-kit continue  # Work on feature 1
```

## Template and Configuration Integration

### Template Sharing

Both unified and individual command modes share the same templates:

```yaml
# .kilocode/templates/template-mappings.yaml
templates:
  spec: "temp-spec-kit/templates/spec-template.md"
  plan: "temp-spec-kit/templates/plan-template.md"
  tasks: "temp-spec-kit/templates/tasks-template.md"
  checklist: "temp-spec-kit/templates/checklist-template.md"
```

### Configuration Synchronization

Configuration is shared across modes:

```yaml
# .kilocode/modes/spec-kit.yaml
# Configuration applies to both unified and individual commands

validation:
  strict_mode: true
  fail_fast: false

user_experience:
  progress_visualization: true
  contextual_help: true
```

### Custom Template Integration

Create custom templates for specific workflows:

```bash
# Create custom template
cp temp-spec-kit/templates/spec-template.md temp-spec-kit/templates/api-spec-template.md

# Modify template for API specifications
# Add API-specific sections, validation rules, etc.

# Use custom template with individual command
/speckit.specify -Template api-spec-template "Add user API endpoint"

# Use custom template with unified mode
/spec-kit -Template api-spec-template "Add user API endpoint"
```

## Validation Integration

### Shared Validation Rules

Both modes use the same validation rules defined in `.kilocode/rules/validation-rules.yaml`:

```yaml
phases:
  specify:
    quality_gates:
      - no_implementation_details
      - measurable_success_criteria
      - complete_user_stories
```

### Mode-Specific Validation

Some validation behaviors differ between modes:

```bash
# Unified mode: Automatic validation after each phase
/spec-kit "Add feature"
# (System automatically validates specification)

# Individual mode: Manual validation
/speckit.specify "Add feature"
/speckit.validate -Phase specify
```

### Cross-Mode Validation

Validate artifacts created in one mode from another mode:

```bash
# Create specification with individual command
/speckit.specify "Add feature"

# Validate with unified mode
/spec-kit validate -Phase specify

# Continue with unified workflow
/spec-kit continue
```

## Error Handling Integration

### Consistent Error Messages

Both modes provide consistent error handling:

```bash
# Unified mode error
Error: Quality gate validation failed for specify phase
Issues found:
- Specification contains implementation details
- Success criteria not measurable

# Individual mode error
Error: Quality gate validation failed
Issues found:
- Specification contains implementation details
- Success criteria not measurable
```

### Recovery Strategies

Recovery works consistently across modes:

```bash
# Recovery in unified mode
/spec-kit validate -Fix

# Recovery in individual mode
/speckit.validate -Fix

# Both modes use same recovery mechanisms
```

## Best Practices for Integration

### 1. Choose the Right Mode for the Task

```bash
# Use unified mode for:
# - Complex features requiring multiple phases
# - Team projects needing consistent workflow
# - Learning spec-driven development
/spec-kit "Complex feature with multiple components"

# Use individual commands for:
# - Simple, quick features
# - Specific phase focus
# - Custom workflow requirements
/speckit.specify "Simple bug fix"
/speckit.implement
```

### 2. Maintain Consistent State

```bash
# Always sync state when switching modes
/spec-kit sync

# Validate before switching
/spec-kit validate

# Check status after switching
/spec-kit status
```

### 3. Use Appropriate Commands

```bash
# For guided experience
/spec-kit "Feature description"

# For specific phase work
/speckit.plan

# For quick status checks
/speckit.status

# For comprehensive validation
/spec-kit validate -Detailed
```

### 4. Leverage Shared Resources

```bash
# Use shared templates
/speckit.specify -Template custom-template "Feature"

# Use shared validation rules
/spec-kit validate -Phase specify

# Use shared configuration
/spec-kit config -Show
```

## Migration Strategies

### From Individual Commands to Unified Mode

```bash
# Step 1: Complete current phase
/speckit.specify "Current feature"

# Step 2: Validate current work
/speckit.validate

# Step 3: Switch to unified mode
/spec-kit continue

# Step 4: Continue with unified workflow
# (System detects existing work and integrates)
```

### From Unified Mode to Individual Commands

```bash
# Step 1: Complete current phase in unified mode
/spec-kit continue

# Step 2: Switch to individual commands
/speckit.plan

# Step 3: Continue with individual approach
/speckit.tasks
/speckit.implement
```

### Hybrid Migration Strategy

```bash
# Use unified mode for complex phases
/spec-kit "Complex feature"
# (Complete specify and clarify phases)

# Switch to individual for implementation
/speckit.implement

# Return to unified for validation
/spec-kit validate
```

## Troubleshooting Integration Issues

### State Synchronization Problems

```bash
# Symptoms: State not updating correctly between modes
# Solution: Force synchronization
/spec-kit sync -Force

# Reset state if corrupted
rm .specify/workflow-state.json
/spec-kit continue
```

### Validation Inconsistencies

```bash
# Symptoms: Different validation results between modes
# Solution: Check validation rules
cat .kilocode/rules/validation-rules.yaml

# Use consistent validation parameters
/spec-kit validate -Strict
/speckit.validate -Strict
```

### Template Conflicts

```bash
# Symptoms: Templates not working correctly
# Solution: Check template mappings
cat .kilocode/templates/template-mappings.yaml

# Verify template files exist
ls -la temp-spec-kit/templates/
```

This integration guide provides comprehensive information for effectively using both unified mode and individual commands together. Choose the approach that best fits your workflow needs and project requirements.