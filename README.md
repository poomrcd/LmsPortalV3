# LMS Portal v3 — Online Edition

Static LMS deployable to **GitHub + Vercel**. No backend required.

## Deploy in 5 minutes

### 1. Create the GitHub repo
- New repo → upload these files:
  `index.html`, `styles.css`, `app.js`, `content.json`, `vercel.json`,
  `.gitignore`, `.vercelignore`, `README.md`

### 2. Connect to Vercel
- vercel.com → **Add New → Project** → import your GitHub repo
- Framework preset: **Other** · Build command: *(leave blank)* · Output dir: *(leave blank)*
- Click **Deploy**

### 3. Make it private
Vercel protects deployments at the account level, not per-app.

- **Best:** Vercel Pro → Project → Settings → **Deployment Protection → Password Protection**
- **Free workaround:** add a `middleware.js` (see appendix) that checks for a shared cookie/header
- **Quick & dirty:** share only the URL with people you trust; add `robots.txt` with `Disallow: /`

### 4. First admin login
1. Open the deployed URL
2. Admin tab → password `admin123`
3. **Settings → Admin password** → change immediately

## How content flows
