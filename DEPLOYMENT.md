# ResidentPulse Deployment Guide

This guide will help you deploy ResidentPulse to Railway.app.

## Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- Your Anthropic API key

## Step 1: Local Setup with PostgreSQL

Before deploying, you should test locally with PostgreSQL:

### Install PostgreSQL Locally (Optional)

**Windows:**
```bash
winget install PostgreSQL.PostgreSQL
```

**Or use Railway's PostgreSQL for development:**
1. Create a Railway account
2. Create a new project
3. Add PostgreSQL database
4. Copy the DATABASE_URL

### Set Up Environment Variables

1. Copy the example env file:
```bash
cp .env.example .env
```

2. Edit `.env` and fill in:
```
DATABASE_URL=your-postgresql-connection-string
ANTHROPIC_API_KEY=your-anthropic-api-key
SESSION_SECRET=generate-a-random-string-here
```

3. Also set up the server env:
```bash
cd server
cp .env.example .env
# Edit server/.env with the same values
```

### Migrate Your Existing Data

If you have existing SQLite data to migrate:

```bash
cd server
node migrate-to-postgres.js
```

This will transfer all your data from `residentpulse.db` to PostgreSQL.

### Test Locally

```bash
# Install dependencies
npm install

# Build the client
npm run build

# Start the server (with NODE_ENV=production to test built client)
cd server
NODE_ENV=production npm start
```

Visit `http://localhost:3001` - you should see your app running with PostgreSQL!

## Step 2: Deploy to Railway

### A. Push to GitHub

Your code is already in Git. Now push to GitHub:

```bash
git remote add origin https://github.com/EmaichAscent/residentpulse.git
git branch -M main
git push -u origin main
```

### B. Set Up Railway Project

1. Go to [railway.app](https://railway.app) and sign in with GitHub

2. Click **"New Project"**

3. Select **"Deploy from GitHub repo"**

4. Choose the **`residentpulse`** repository

5. Railway will detect your `railway.json` and start deploying

### C. Add PostgreSQL Database

1. In your Railway project, click **"+ New"**

2. Select **"Database"** → **"Add PostgreSQL"**

3. Railway will create a PostgreSQL database and automatically set `DATABASE_URL`

### D. Set Environment Variables

In your Railway project settings, add these environment variables:

1. Click on your web service

2. Go to **"Variables"** tab

3. Add:
   ```
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   SESSION_SECRET=your-random-secret-string
   NODE_ENV=production
   PORT=3001
   ```

4. `DATABASE_URL` should already be set automatically by Railway

### E. Deploy

Railway will automatically deploy when you push to GitHub. You can also manually trigger a deployment from the Railway dashboard.

## Step 3: Initialize Your Database

After first deployment, you need to create your first superadmin account:

1. Open your Railway deployment's PostgreSQL database

2. Run this SQL (replace with your email and generate a password hash):

```sql
-- First, you'll need to generate a bcrypt hash for your password
-- You can use an online tool or run this in Node.js:
-- const bcrypt = require('bcrypt');
-- console.log(await bcrypt.hash('YourPasswordHere', 12));

INSERT INTO admins (email, password_hash, role)
VALUES ('mike.hardy@camascent.com', '$2b$12$your-bcrypt-hash-here', 'superadmin');

INSERT INTO admins (email, password_hash, role)
VALUES ('andrea.hardy@camascent.com', '$2b$12$your-bcrypt-hash-here', 'superadmin');
```

**OR** use the Railway CLI to run a migration script:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run commands in your Railway environment
railway run node server/create-superadmin.js
```

## Step 4: Access Your Application

1. Railway will provide you with a URL like: `https://your-app.railway.app`

2. Visit `https://your-app.railway.app/superadmin/login`

3. Login with your superadmin credentials

4. Create your first client!

## Ongoing Deployments

Railway automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Your changes"
git push
```

Railway will build and deploy automatically.

## Custom Domain (Optional)

1. In Railway project settings, go to **"Settings"** → **"Domains"**

2. Click **"Add Domain"**

3. Follow Railway's instructions to configure your DNS

## Troubleshooting

### Build Fails

- Check the Railway build logs
- Ensure all dependencies are in `package.json`
- Verify `NODE_ENV` is set to `production`

### Database Connection Errors

- Verify `DATABASE_URL` is set in Railway environment variables
- Check that PostgreSQL service is running in your Railway project
- Ensure SSL is configured (it should be automatic)

### App Works Locally But Not on Railway

- Check environment variables are set correctly
- View Railway logs: click on your service → "Deployments" → latest deployment → "View Logs"
- Ensure `NODE_ENV=production` is set

### Need to Reset Database

```bash
railway run psql $DATABASE_URL
# Then run your SQL commands
\dt  # List tables
DROP TABLE sessions CASCADE;  # etc.
```

## Cost Estimation

**Railway Free Tier:**
- $5/month credit (free)
- Good for development and low-traffic production

**Estimated costs for small production:**
- Web Service: ~$5/month
- PostgreSQL: ~$5/month
- **Total: ~$10/month** (first $5 free)

**For higher traffic:**
- Scale up as needed
- Monitor usage in Railway dashboard
- Set spending limits to avoid surprises

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- ResidentPulse Issues: https://github.com/EmaichAscent/residentpulse/issues

---

**Important Security Notes:**

1. **Never commit `.env` files** - they're already in `.gitignore`
2. **Use strong SESSION_SECRET** - generate a random 32+ character string
3. **Rotate API keys regularly** - especially after any security incidents
4. **Enable 2FA** on your Railway and GitHub accounts
5. **Review Railway access logs** periodically

Happy deploying! 🚀
