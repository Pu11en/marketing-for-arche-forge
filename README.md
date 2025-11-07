# Strategic Marketing Operating System with Spec-Kit Integration

This project combines a strategic marketing operating system with Kilo Code's spec-kit mode for comprehensive spec-driven development. The system provides both a static site for Vercel hosting and advanced development workflow capabilities.

## 🚀 Features

- **Spec-Kit Mode**: Comprehensive spec-driven development workflow
- **Static Site**: Optimized for Vercel deployment
- **AI Video System**: Complete video generation pipeline
- **Development Workflow**: Guided sequential development process

## 📋 Spec-Kit Mode Overview

The spec-kit mode provides a unified, guided experience for spec-driven development that orchestrates the complete development process from specification to implementation:

```
specify → clarify → plan → tasks → analyze → implement
```

### Key Benefits

- **Sequential Workflow**: Guided progression through development phases
- **State Management**: Context preservation between workflow stages
- **Intelligent Validation**: Quality gates at each transition point
- **Error Recovery**: Comprehensive error handling and recovery mechanisms
- **Progress Tracking**: Visual progress indicators and status reporting

### Quick Start with Spec-Kit

```bash
# Start a new feature with spec-kit mode
/spec-kit "Add user authentication to my web app"

# Continue from where you left off
/spec-kit continue

# Check current workflow status
/spec-kit status

# Generate progress report
/spec-kit report -Markdown
```

## 📚 Documentation

- [Spec-Kit Getting Started Guide](docs/spec-kit-getting-started.md)
- [Spec-Kit Workflow Overview](docs/spec-kit-workflow-overview.md)
- [Spec-Kit Usage Examples](docs/spec-kit-usage-examples.md)
- [Spec-Kit Troubleshooting Guide](docs/spec-kit-troubleshooting.md)
- [Spec-Kit Integration Guide](docs/spec-kit-integration.md)

## Prepare Git

```
# From this folder
git config user.name "Your Name"
git config user.email "cryptopullen@gmail.com"

git add .
git commit -m "Init static site for Vercel"
```

## Connect GitHub

- Create the repo `Pu11en/marketing-for-arche-forge` on GitHub (empty).
- Point `origin` here and push:

```
# If not set yet
git remote add origin https://github.com/Pu11en/marketing-for-arche-forge.git
# Use main as default branch (optional)
git branch -M main
# Push the code
git push -u origin main
```

## Deploy to Vercel

- Dashboard: Import the GitHub repo, Framework: Other/Static, Build command: none, Output: root.
- CLI (optional):

```
npm i -g vercel
vercel login
vercel --prod
```


## Local Development

This static HTML website can be served locally using multiple methods:

### Option 1: Using npm (Recommended)

1. Install dependencies:
   ```
   npm install
   ```

2. Start the local server:
   ```
   npm start
   ```
   
   This will start the server on port 8080 and automatically open your browser.

### Option 2: Using Python's Built-in Server

If you have Python installed:

1. For Python 3.x:
   ```
   python -m http.server 8000
   ```

2. For Python 2.x:
   ```
   python -m SimpleHTTPServer 8000
   ```

3. Open your browser and navigate to `http://localhost:8000`

### Option 3: Using VS Code's Live Server Extension

1. Install the "Live Server" extension by Ritwick Dey in VS Code
2. Right-click on `index.html` and select "Open with Live Server"
3. The site will open in your browser with auto-reload functionality
