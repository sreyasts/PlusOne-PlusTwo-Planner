# +1 & +2 Planner Project Rules & Guidelines

## 🚨 MANDATORY DUAL-DOMAIN DEPLOYMENT POLICY

Whenever you make any changes, fixes, or improvements to this repository, you MUST follow the **Zero-Error Dual-Domain Deployment Protocol** before concluding your task:

### 1. Verify Zero Errors
Run both test suites to ensure 100% test passing (0 errors allowed):
```powershell
npm test
npm run test:legacy
```

### 2. Build Production Bundle
Build and synchronize the production distribution:
```powershell
npm run build
```

### 3. Deploy to Firebase Hosting (Domain 1: plusone-plustwo-planner.web.app)
Deploy the verified build to Firebase Hosting:
```powershell
npx -y firebase-tools@latest deploy --only hosting
```

### 4. Deploy to GitHub Pages (Domain 2: sreyasts.github.io)
Commit and push to `main` branch to trigger GitHub Actions deployment:
```powershell
git add .
git commit -m "feat/fix: <clear description>"
git push origin main
```

**Rule:** NEVER finish a task that modifies app code without verifying and deploying to BOTH domains!
