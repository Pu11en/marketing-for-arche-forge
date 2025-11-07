# Strategic Marketing Operating System

A comprehensive strategic marketing flowchart that visualizes complete marketing ecosystem for AI-powered content creation and distribution.

## 🚀 Features

- **Strategic Flowchart**: Visual representation of marketing strategy and systems
- **Static Site**: Optimized for Vercel deployment
- **Responsive Design**: Works across all devices and screen sizes
- **Marketing Architecture**: Complete content creation and distribution workflow

## 📋 Marketing System Overview

This strategic marketing operating system provides a comprehensive framework for:

- **Prepared Campaign Strategy**: Campaign-style approach for consistent posting
- **Core Narrative Strategy**: Central messaging and brand positioning
- **Content Systems**: AI copywriting and high-impact trend content
- **Platform Distribution**: Multi-platform content deployment strategy
- **Performance Analytics**: Data-driven optimization and feedback loops

### Key Components

- **AI Copywriting System**: Automated SEO-friendly content generation
- **High-Impact Trend Content**: Manual cinematic video production
- **Social Media Platforms**: TikTok, YouTube Shorts, Twitter, Reddit, Instagram, LinkedIn
- **Traffic Drivers**: Product-led growth and SEO flywheel
- **Performance Feedback**: Analytics and optimization cycles

## Prepare Git

```
# From this folder
git config user.name "Your Name"
git config user.email "cryptopullen@gmail.com"

git add .
git commit -m "Init static site for Vercel"
```

## Connect GitHub

- Create repo `Pu11en/marketing-for-arche-forge` on GitHub (empty).
- Point `origin` here and push:

```
# If not set yet
git remote add origin https://github.com/Pu11en/marketing-for-arche-forge.git
# Use main as default branch (optional)
git branch -M main
# Push code
git push -u origin main
```

## Deploy to Vercel

- Dashboard: Import GitHub repo, Framework: Other/Static, Build command: none, Output: root.
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

2. Start local server:
   ```
   npm start
   ```
   
   This will start server on port 8080 and automatically open your browser.

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

1. Install "Live Server" extension by Ritwick Dey in VS Code
2. Right-click on `index.html` and select "Open with Live Server"
3. The site will open in your browser with auto-reload functionality
