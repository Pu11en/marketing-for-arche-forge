# Spec-Kit Mode: Workflow Overview

## Introduction

The spec-kit mode implements a sequential workflow that guides users through the complete spec-driven development process. This overview provides detailed information about each phase, its purpose, validation criteria, and expected outputs.

## Workflow Architecture

### Sequential Flow

```
specify → clarify → plan → tasks → analyze → implement
```

The workflow follows a strict sequential pattern where each phase builds upon the outputs of previous phases. This ensures:

- **Progressive refinement** of requirements and design
- **Quality assurance** at each transition point
- **Context preservation** between phases
- **Traceability** from requirements to implementation

### State Management

The workflow maintains state in `.specify/workflow-state.json`:

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
  "startTime": "2024-01-15T09:00:00Z",
  "lastUpdated": "2024-01-15T14:30:00Z"
}
```

## Phase Details

### Phase 1: Specify

**Purpose**: Transform user idea into structured specification

**Key Objectives**:
- Define user stories with clear acceptance criteria
- Establish measurable success outcomes
- Identify functional and non-functional requirements
- Document edge cases and error scenarios

**Prerequisites**: None

**Validation Criteria**:
- ✅ No implementation details in specification
- ✅ Measurable success criteria
- ✅ Complete user stories with acceptance criteria
- ⚠️ Maximum 3 clarification markers allowed

**Output**: `specs/[###-feature-name]/spec.md`

**Quality Gates**:
```yaml
- no_implementation_details
- measurable_success_criteria
- complete_user_stories
- max_3_ambiguities
```

**Best Practices**:
- Focus on WHAT users need, not HOW to implement
- Use specific, measurable language
- Include edge cases and error scenarios
- Write user stories in the format: "As a [user], I want [action] so that [benefit]"

**Common Pitfalls**:
- Including technical implementation details
- Vague requirements like "fast" or "user-friendly"
- Missing acceptance criteria
- Forgetting error scenarios

---

### Phase 2: Clarify

**Purpose**: Resolve ambiguities and refine requirements

**Key Objectives**:
- Address all clarification markers from specification
- Resolve ambiguous requirements
- Document assumptions and decisions
- Ensure all critical questions are answered

**Prerequisites**: Complete specification that passes basic quality checks

**Validation Criteria**:
- ✅ Maximum 3 ambiguities remaining
- ✅ All critical questions answered
- ✅ Assumptions documented

**Output**: Updated specification with clarifications

**Quality Gates**:
```yaml
- max_3_ambiguities_remaining
- all_critical_questions_answered
```

**Best Practices**:
- Prioritize security and scope questions
- Document decisions with rationale
- Make reasonable assumptions for less critical items
- Update specification with clarified requirements

**Common Pitfalls**:
- Leaving too many ambiguities unresolved
- Not documenting assumptions
- Ignoring critical security questions

---

### Phase 3: Plan

**Purpose**: Create technical implementation plan

**Key Objectives**:
- Design technical architecture
- Document technical decisions with rationale
- Complete research on technical unknowns
- Ensure compliance with project constitution

**Prerequisites**: Clarified specification

**Validation Criteria**:
- ✅ Constitution compliance
- ✅ Technical decisions documented
- ✅ Research complete with no unresolved items

**Output**: `specs/[###-feature-name]/plan.md`

**Quality Gates**:
```yaml
- constitution_compliance
- technical_decisions_documented
- research_complete
```

**Best Practices**:
- Include alternatives considered and trade-offs
- Document decision rationale
- Address all technical unknowns
- Review constitution constraints

**Common Pitfalls**:
- Violating project constitution principles
- Not documenting technical decisions
- Leaving research items unresolved

---

### Phase 4: Tasks

**Purpose**: Break down implementation into executable tasks

**Key Objectives**:
- Create detailed task breakdown
- Define task dependencies
- Identify MVP tasks
- Ensure all user stories are covered

**Prerequisites**: Complete implementation plan

**Validation Criteria**:
- ✅ User story coverage complete
- ✅ Dependency graph valid (no cycles)
- ⚠️ MVP tasks identified

**Output**: `specs/[###-feature-name]/tasks.md`

**Quality Gates**:
```yaml
- user_story_coverage_complete
- dependency_graph_valid
- mvp_tasks_identified
```

**Best Practices**:
- Break tasks into manageable chunks
- Define clear dependencies
- Mark MVP tasks with priority indicators
- Ensure task granularity is appropriate

**Common Pitfalls**:
- Creating tasks that are too large or too small
- Missing task dependencies
- Not identifying MVP tasks
- Incomplete user story coverage

---

### Phase 5: Analyze

**Purpose**: Quality analysis and validation

**Key Objectives**:
- Identify critical issues
- Analyze test coverage
- Review security considerations
- Validate implementation readiness

**Prerequisites**: Complete task breakdown

**Validation Criteria**:
- ✅ No critical issues
- ⚠️ Test coverage adequate (80%+ recommended)
- ✅ Security reviewed

**Output**: Analysis report and recommendations

**Quality Gates**:
```yaml
- no_critical_issues
- coverage_adequate
- security_reviewed
```

**Best Practices**:
- Address all critical issues before implementation
- Include comprehensive test scenarios
- Complete security checklist
- Document mitigation strategies

**Common Pitfalls**:
- Ignoring critical issues
- Inadequate test coverage
- Skipping security review
- Not documenting analysis findings

---

### Phase 6: Implement

**Purpose**: Execute the implementation plan

**Key Objectives**:
- Implement all tasks according to plan
- Ensure all tests pass
- Verify implementation meets specification
- Complete quality checks

**Prerequisites**: Passed analysis phase

**Validation Criteria**:
- ✅ All tests pass
- ✅ Implementation meets specification
- ⚠️ Quality checks passed (90%+ pass rate)

**Output**: Working feature implementation

**Quality Gates**:
```yaml
- tests_pass
- specification_met
- quality_checks_passed
```

**Best Practices**:
- Follow the task breakdown precisely
- Write comprehensive tests
- Validate against specification requirements
- Address quality check failures promptly

**Common Pitfalls**:
- Deviating from the implementation plan
- Not writing adequate tests
- Ignoring specification requirements
- Skipping quality checks

## Phase Transitions

### Automatic Transitions

Most phase transitions happen automatically when validation criteria are met:

```bash
# When specification passes validation
# System automatically advances to clarify phase

# When clarification is complete
# System automatically advances to plan phase
```

### Manual Transitions

You can manually transition between phases if prerequisites are met:

```bash
# Jump to specific phase
/spec-kit plan
/spec-kit tasks
/spec-kit analyze
```

### Transition Validation

Each transition includes:
- **Prerequisite validation**: Ensures required inputs exist
- **Artifact verification**: Confirms outputs are properly formatted
- **Quality gate checks**: Validates against quality criteria
- **User confirmation**: Required for major transitions

## Error Handling and Recovery

### Phase-Specific Recovery

Each phase includes recovery strategies:

```yaml
missing_prerequisites:
  strategy: "provide_guidance"
  actions:
    - "Identify missing artifacts"
    - "Provide step-by-step recovery instructions"
    - "Offer to run missing phases automatically"

quality_gate_failure:
  strategy: "offer_options"
  actions:
    - "Present specific issues found"
    - "Offer fix suggestions"
    - "Provide override options with justification"

constitution_violation:
  strategy: "require_justification"
  actions:
    - "Block progress until resolved"
    - "Require explicit justification"
    - "Document violation for review"
```

### Rollback Mechanisms

Rollback points are created at key checkpoints:

```json
{
  "rollbackPoints": [
    {
      "phase": "specify",
      "checkpoint": "spec_created",
      "artifacts": ["specs/001-user-auth/spec.md"],
      "command": "git checkout HEAD~1 -- specs/001-user-auth/spec.md"
    },
    {
      "phase": "plan",
      "checkpoint": "plan_validated",
      "artifacts": ["specs/001-user-auth/plan.md"],
      "command": "git checkout HEAD~1 -- specs/001-user-auth/plan.md"
    }
  ]
}
```

## Progress Visualization

### Workflow Dashboard

The system provides visual progress indicators:

```
Feature Development Progress: 001-user-auth

specify    ████████████████████ 100% ✓
clarify    ████████████████████ 100% ✓  
plan       ████████████████░░░░  80%  ⏳
tasks      ░░░░░░░░░░░░░░░░░░░░   0%  -
analyze    ░░░░░░░░░░░░░░░░░░░░   0%  -
implement  ░░░░░░░░░░░░░░░░░░░░   0%  -
```

### Artifact Status

Generated artifacts are tracked with status:

| Artifact | Status | Location | Last Updated |
|----------|--------|----------|--------------|
| spec.md | ✅ Complete | specs/001-user-auth/ | 2024-01-15 14:30 |
| plan.md | 🔄 In Progress | specs/001-user-auth/ | 2024-01-15 15:45 |
| tasks.md | ⏳ Pending | - | - |

## Customization and Configuration

### Phase Customization

You can customize phases through `.kilocode/modes/spec-kit.yaml`:

```yaml
workflow:
  phases:
    - name: "custom_phase"
      description: "Custom phase description"
      required: false
      depends_on: ["plan"]
      validation:
        - "custom_validation_rule"
```

### Validation Rules

Validation rules are defined in `.kilocode/rules/validation-rules.yaml`:

```yaml
phases:
  custom_phase:
    quality_gates:
      - id: "custom_validation"
        name: "Custom Validation Rule"
        description: "Description of validation rule"
        severity: "error"
        validator:
          type: "content_pattern"
          pattern: "required_pattern"
          pattern_type: "required"
```

## Integration with Existing Workflows

### Individual Command Access

While spec-kit mode provides a unified experience, individual commands remain accessible:

```bash
# Use individual commands directly
/speckit.specify "Add user authentication"
/speckit.clarify
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement

# Switch back to unified mode
/spec-kit continue
```

### Template Integration

Spec-kit mode integrates with existing templates:

```yaml
integration:
  templates:
    spec: "temp-spec-kit/templates/spec-template.md"
    plan: "temp-spec-kit/templates/plan-template.md"
    tasks: "temp-spec-kit/templates/tasks-template.md"
    checklist: "temp-spec-kit/templates/checklist-template.md"
```

## Best Practices

### Workflow Management

1. **Follow the sequential flow**: Don't skip phases unless you have a good reason
2. **Address validation failures**: Don't override quality gates without justification
3. **Document decisions**: Keep track of why you made certain choices
4. **Save progress frequently**: The system auto-saves, but manual saves help

### Quality Assurance

1. **Embrace validation**: Use quality gates to improve your work
2. **Review outputs**: Check generated artifacts before proceeding
3. **Test thoroughly**: Ensure implementation meets specification
4. **Security first**: Always complete security reviews

### Collaboration

1. **Share specifications**: Use specs to communicate with team members
2. **Review plans**: Get feedback on technical decisions
3. **Track progress**: Use status reports to keep stakeholders informed
4. **Document assumptions**: Make implicit requirements explicit

This workflow overview provides the foundation for understanding how spec-kit mode guides you through the complete spec-driven development process. For practical examples and scenarios, see the [Usage Examples](spec-kit-usage-examples.md) guide.