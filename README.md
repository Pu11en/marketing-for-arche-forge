# Strategic Marketing Operating System (Static Site)

This is a minimal static site prepared for Vercel hosting. Replace `index.html` with your full flowchart markup when ready.

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

