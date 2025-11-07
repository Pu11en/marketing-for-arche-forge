# Spec-Kit Mode for Kilo Code

This directory contains the unified spec-driven development workflow mode for Kilo Code.

## Overview

The spec-kit mode provides a comprehensive, guided experience for spec-driven development that orchestrates the complete development process from specification to implementation. It maintains state between phases, provides intelligent validation, and ensures a cohesive development experience.

## Structure

```
.kilocode/
├── workflows/
│   ├── spec-kit.md                    # Main unified orchestrator workflow
│   ├── speckit.analyze.md           # Individual command workflows
│   ├── speckit.checklist.md
│   ├── speckit.clarify.md
│   ├── speckit.constitution.md
│   ├── speckit.implement.md
│   ├── speckit.plan.md
│   ├── speckit.specify.md
│   └── speckit.tasks.md
├── modes/
│   └── spec-kit.yaml                 # Mode registration and configuration
├── scripts/
│   ├── workflow-manager.ps1          # Main orchestration script
│   ├── state-manager.ps1             # Workflow state management
│   ├── validator.ps1                 # Phase and artifact validation
│   ├── reporter.ps1                  # Progress reporting
│   └── simple-test.ps1             # Implementation testing
├── templates/
│   └── template-mappings.yaml       # Template organization and mapping
└── rules/
    ├── validation-rules.yaml          # Comprehensive validation rules
    └── alsways push to github fater each task.md
```

## Key Components

### 1. Unified Workflow (spec-kit.md)

The main orchestrator that guides users through the sequential workflow:

```
specify → clarify → plan → tasks → analyze → implement
```

Features:
- State management between phases
- Intelligent phase transitions
- Progress visualization
- Error handling and recovery
- Context preservation

### 2. Mode Configuration (spec-kit.yaml)

Defines the mode configuration, including:
- Command mappings and aliases
- Phase definitions and dependencies
- Quality gates and validation rules
- Error handling strategies
- Integration settings

### 3. State Management (state-manager.ps1)

Manages workflow state persistence and retrieval:
- JSON-based state file (`.specify/workflow-state.json`)
- Phase tracking
- Artifact management
- Validation status tracking

### 4. Validation System (validator.ps1)

Provides comprehensive validation for each phase:
- Specification quality checks
- Phase prerequisite validation
- Constitution compliance
- Artifact validation

### 5. Progress Reporting (reporter.ps1)

Generates detailed progress reports in multiple formats:
- Text format for console output
- Markdown for documentation
- HTML for visualization
- JSON for programmatic access

### 6. Template Organization (template-mappings.yaml)

Maps existing templates to workflow phases:
- Template metadata
- Variable substitution
- Validation rules
- Integration points

### 7. Validation Rules (validation-rules.yaml)

Comprehensive validation rules for each phase:
- Quality gates
- Error handling strategies
- Recovery mechanisms
- Output formatting

## Usage

### Starting a New Feature

```bash
/spec-kit "Add user authentication to my web app"
```

This will:
1. Create a new feature branch
2. Initialize the specification
3. Guide you through the specification phase
4. Automatically advance to clarification

### Continuing Work

```bash
/spec-kit continue
```

This will:
1. Load existing workflow state
2. Determine the next incomplete phase
3. Resume from where you left off

### Checking Status

```bash
/spec-kit status
```

This will display:
- Current phase and progress
- Completed phases
- Generated artifacts
- Validation status

### Generating Reports

```bash
/spec-kit report -Markdown -OutputPath progress-report.md
```

This will generate a detailed progress report in Markdown format.

## Integration with Individual Commands

The unified mode maintains full compatibility with individual commands:

```bash
# Use unified mode
/spec-kit "Add user authentication"

# Or use individual commands
/speckit.specify "Add user authentication"
/speckit.clarify
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement
```

## Error Handling

The system includes comprehensive error handling:

- **Prerequisite Validation**: Ensures each phase has required inputs
- **Quality Gates**: Validates outputs against quality criteria
- **Recovery Strategies**: Provides options for resolving issues
- **Rollback Mechanisms**: Allows recovery from failures

## Testing

Run the test script to verify the implementation:

```bash
pwershell -ExecutionPolicy Bypass -File ".kilocode\scripts\simple-test.ps1"
```

This will verify:
- Directory structure
- Key file existence
- Template references
- Script references
- Individual workflow files

## Dependencies

The spec-kit mode depends on:

- **temp-spec-kit**: For templates and scripts
- **PowerShell**: For script execution
- **Git**: For version control (optional)

## Configuration

The mode can be configured through:

- **validation-rules.yaml**: Adjust validation strictness
- **template-mappings.yaml**: Customize template organization
- **spec-kit.yaml**: Modify mode behavior

## Contributing

When contributing to the spec-kit mode:

1. Maintain backward compatibility with existing workflows
2. Follow the established file structure
3. Update validation rules for new requirements
4. Test changes with the provided test script
5. Document any new features or breaking changes

## License

This implementation follows the MIT License as specified in the project constitution.