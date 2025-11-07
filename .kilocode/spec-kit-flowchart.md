# Spec-Kit Mode Flowchart

```mermaid
flowchart TD
    A[Start] --> B{User Input}
    B --> C{Command Type}
    
    C -->|spec-kit| D[Unified Workflow]
    C -->|individual| E[Individual Commands]
    
    D --> F[Initialize State]
    F --> G{Current Phase}
    
    G -->|specify| H[Specify Phase]
    G -->|clarify| I[Clarify Phase]
    G -->|plan| J[Plan Phase]
    G -->|tasks| K[Tasks Phase]
    G -->|analyze| L[Analyze Phase]
    G -->|implement| M[Implement Phase]
    
    H --> N[Create Specification]
    I --> O[Validate Specification]
    O --> P{Quality Gates}
    P -->|pass| Q[Update State]
    P -->|fail| R[Error Recovery]
    Q --> G
    
    I --> S[Resolve Ambiguities]
    S --> T{All Resolved?}
    T -->|yes| Q
    T -->|no| U[Provide Options]
    U --> V[User Selection]
    V --> Q
    
    J --> W[Technical Research]
    W --> X[Create Design]
    X --> Y[Validate Constitution]
    Y --> Z{Constitution OK?}
    Z -->|yes| AA[Update State]
    Z -->|no| AB[Require Justification]
    AB --> AC[Document Violation]
    AC --> Q
    
    K --> AD[Generate Tasks]
    AD --> AE[Validate Dependencies]
    AE --> AF{Dependencies OK?}
    AF -->|yes| AG[Update State]
    AF -->|no| AH[Fix Dependencies]
    AH --> AG
    
    L --> AI[Quality Analysis]
    AI --> AJ[Check Critical Issues]
    AJ --> AK{Issues Found?}
    AK -->|no| AL[Update State]
    AK -->|yes| AM[Error Recovery]
    AM --> Q
    
    M --> AN[Execute Implementation]
    AN --> AO[Run Tests]
    AO --> AP{Tests Pass?}
    AP -->|yes| AQ[Complete Feature]
    AP -->|no| AR[Fix Issues]
    AR --> AO
    
    E --> AS[Select Command]
    AS --> AT{Command Available?}
    AT -->|yes| AU[Execute Command]
    AT -->|no| AV[Show Error]
    AU --> AW[Update State]
    AW --> Q
    
    Q --> AX[Save State]
    AX --> AY{Continue?}
    AY -->|yes| G
    AY -->|no| AZ[End Workflow]
    AZ --> BB[Generate Report]
    
    R --> BA[Identify Issue Type]
    BA --> BB{Recovery Strategy}
    BB -->|guided_recovery| BC[Provide Guidance]
    BB -->|interactive_resolution| BD[Offer Options]
    BB -->|strict_enforcement| BE[Block Progress]
    BC --> BF
    BD --> BG
    BE --> BF
    
    AC --> BF
    AM --> BF
    AR --> BF
    
    classDef default fill:#f9f9f,stroke:#333,stroke-width:4px
    classDef pass fill:#90EE90,stroke:#333,stroke-width:4px
    classDef fail fill:#FFB6C1,stroke:#333,stroke-width:4px
```

## Phase Descriptions

### Specify Phase
- **Purpose**: Transform user idea into structured specification
- **Input**: Feature description from user
- **Output**: `specs/[feature]/spec.md`
- **Validation**: No implementation details, measurable success criteria, complete user stories

### Clarify Phase
- **Purpose**: Resolve ambiguities and refine requirements
- **Input**: Specification with potential ambiguities
- **Output**: Updated specification with clarifications
- **Validation**: Maximum 3 ambiguities remaining, all critical questions answered

### Plan Phase
- **Purpose**: Create technical implementation plan
- **Input**: Clarified specification
- **Output**: `specs/[feature]/plan.md` and design artifacts
- **Validation**: Constitution compliance, technical decisions documented, research complete

### Tasks Phase
- **Purpose**: Break down implementation into executable tasks
- **Input**: Implementation plan and specification
- **Output**: `specs/[feature]/tasks.md`
- **Validation**: User story coverage complete, dependency graph valid, MVP tasks identified

### Analyze Phase
- **Purpose**: Quality analysis and validation
- **Input**: Task breakdown and implementation plan
- **Output**: Analysis report and recommendations
- **Validation**: No critical issues, coverage adequate, security reviewed

### Implement Phase
- **Purpose**: Execute the implementation plan
- **Input**: Validated task breakdown
- **Output**: Working feature implementation
- **Validation**: Tests pass, specification met, quality checks passed

## Error Handling Paths

### Missing Prerequisites
- Identify missing required inputs
- Provide step-by-step recovery instructions
- Offer to run missing phases automatically

### Quality Gate Failures
- Present specific issues found
- Offer fix suggestions
- Provide override options with justification
- Allow return to previous phase

### Constitution Violations
- Block progress until resolved
- Require explicit justification
- Document violation for review

### Script Execution Failures
- Log detailed error information
- Attempt fallback methods
- Provide manual workarounds

## State Management

The workflow maintains a JSON state file (`.specify/workflow-state.json`) that tracks:

- Current phase
- Completed phases
- Validation status
- Generated artifacts
- Start and end times

This state is preserved between phase transitions and enables resuming work at any point.