# Spec-Kit Mode: Getting Started Guide

## Introduction

Spec-Kit mode is a comprehensive spec-driven development workflow that guides you through the complete development process from specification to implementation. This guide will help you get started with using spec-kit mode effectively.

## Prerequisites

Before using spec-kit mode, ensure you have:

- **Kilo Code** installed and configured
- **PowerShell** available (for script execution)
- **Git** initialized in your project directory (recommended)
- **temp-spec-kit** module available in your project

## Installation and Setup

### 1. Verify Spec-Kit Mode Availability

Check if spec-kit mode is properly installed:

```bash
# List available modes
/kilo-code modes list

# Verify spec-kit mode is available
/kilo-code modes info spec-kit
```

### 2. Initialize Your Project

If you haven't already, initialize your project:

```bash
# Initialize git repository
git init

# Configure git user (if not already configured)
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### 3. Verify Dependencies

Ensure all required dependencies are available:

```bash
# Check temp-spec-kit availability
ls temp-spec-kit/

# Verify PowerShell scripts
ls .kilocode/scripts/
```

## Your First Spec-Kit Workflow

### Starting a New Feature

Begin your first spec-driven development workflow:

```bash
# Start a new feature with spec-kit mode
/spec-kit "Add user authentication to my web app"
```

This will:
1. Create a new feature branch (e.g., `001-user-auth`)
2. Initialize the specification structure
3. Guide you through the specification phase
4. Set up workflow state tracking

### Understanding the Workflow Phases

Spec-kit mode guides you through six sequential phases:

```
specify → clarify → plan → tasks → analyze → implement
```

#### Phase 1: Specify
- **Purpose**: Transform your idea into a structured specification
- **Focus**: User needs, business requirements, measurable outcomes
- **Output**: `specs/[###-feature-name]/spec.md`

#### Phase 2: Clarify
- **Purpose**: Resolve ambiguities and refine requirements
- **Focus**: Answering unclear requirements, edge cases
- **Output**: Updated specification with clarifications

#### Phase 3: Plan
- **Purpose**: Create technical implementation plan
- **Focus**: Architecture, technical decisions, research
- **Output**: `specs/[###-feature-name]/plan.md`

#### Phase 4: Tasks
- **Purpose**: Break down implementation into executable tasks
- **Focus**: Task breakdown, dependencies, MVP identification
- **Output**: `specs/[###-feature-name]/tasks.md`

#### Phase 5: Analyze
- **Purpose**: Quality analysis and validation
- **Focus**: Issue identification, coverage analysis, security review
- **Output**: Analysis report and recommendations

#### Phase 6: Implement
- **Purpose**: Execute the implementation plan
- **Focus**: Code implementation, testing, validation
- **Output**: Working feature implementation

## Basic Commands

### Starting and Continuing Work

```bash
# Start a new feature
/spec-kit "Feature description here"

# Continue from where you left off
/spec-kit continue

# Jump to a specific phase (if prerequisites met)
/spec-kit plan
```

### Checking Status and Progress

```bash
# Check current workflow status
/spec-kit status

# Generate detailed progress report
/spec-kit report -Markdown

# Generate report in different formats
/spec-kit report -HTML -OutputPath progress.html
/spec-kit report -JSON -OutputPath progress.json
```

### Validation and Quality Checks

```bash
# Validate current phase or artifact
/spec-kit validate

# Validate specific phase
/spec-kit validate -Phase specify

# Validate with detailed output
/spec-kit validate -Detailed
```

## Working with Individual Commands

While spec-kit mode provides a unified experience, you can still use individual commands directly:

```bash
# Use individual phase commands
/speckit.specify "Add user authentication"
/speckit.clarify
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement

# Switch back to unified mode
/spec-kit continue
```

## Understanding Workflow State

Spec-kit mode maintains state in `.specify/workflow-state.json`:

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
  }
}
```

## Best Practices for Getting Started

### 1. Start Small

Begin with a simple feature to understand the workflow:

```bash
# Good first feature
/spec-kit "Add contact form to website"

# Avoid complex features initially
# /spec-kit "Implement complete microservices architecture"
```

### 2. Follow the Guidance

Spec-kit mode provides contextual guidance at each phase:
- Read the phase descriptions carefully
- Follow the suggested best practices
- Use the provided templates and examples

### 3. Embrace Validation

Don't skip validation steps:
- Address quality gate failures promptly
- Use the suggested fixes and improvements
- Document any overrides with justification

### 4. Save Progress Frequently

The system automatically saves state, but you can manually save:

```bash
# Save current workflow state
/spec-kit status -Save
```

### 5. Use Help Resources

Leverage the built-in help system:

```bash
# Get help with current phase
/spec-kit help

# Get help with specific topics
/spec-kit help user-stories
/spec-kit help success-criteria
/spec-kit help constitution
```

## Common Questions

### Q: Can I switch between unified mode and individual commands?
A: Yes! Spec-kit mode maintains full compatibility with individual commands. You can switch back and forth seamlessly.

### Q: What happens if I make a mistake?
A: Spec-kit mode includes error recovery mechanisms, rollback points, and validation to help you recover from mistakes.

### Q: How do I know when a phase is complete?
A: Each phase has specific validation criteria. When all quality gates pass, the phase is considered complete.

### Q: Can I customize the workflow?
A: Yes, you can customize validation rules, templates, and phase definitions through the configuration files in `.kilocode/`.

### Q: What if I need to pause work?
A: The workflow state is automatically saved. Simply use `/spec-kit continue` when you're ready to resume.

## Next Steps

After completing this getting started guide:

1. Read the [Workflow Overview](spec-kit-workflow-overview.md) for detailed phase information
2. Explore [Usage Examples](spec-kit-usage-examples.md) for practical scenarios
3. Review the [Troubleshooting Guide](spec-kit-troubleshooting.md) for common issues
4. Check the [Integration Guide](spec-kit-integration.md) for advanced usage

## Support

If you encounter issues:

1. Check the troubleshooting guide
2. Run validation to identify problems
3. Use `/spec-kit report` to generate diagnostic information
4. Review the workflow state file for context

Happy spec-driven development! 🚀