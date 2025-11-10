# Railway Deployment Guide for Proximity

This guide will help you deploy your Proximity signaling server to Railway so you and your friends can use the app daily.

## Prerequisites

- GitHub account
- Railway account (sign up at https://railway.app)
- Your code pushed to GitHub

## Step 1: Push Code to GitHub

Make sure all your changes are committed and pushed:

```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

## Step 2: Create Railway Project

1. Go to https://railway.app
2. Click "Start a New Project"
3. Choose "Deploy from GitHub repo"
4. Select your Proximity repository
5. Railway will auto-detect it's a Node.js project

## Step 3: Configure Railway

### Set Start Command

Railway should auto-detect the start command, but verify:

1. Go to your project settings
2. Under "Deploy" → "Start Command", ensure it's set to:
   ```
   node src/server/signaling-server.js
   ```

### Configure Environment (if needed)

Railway automatically provides a `PORT` environment variable, which the server already uses:
```javascript
const PORT = process.env.PORT || 3000;
```

No additional configuration needed!

## Step 4: Deploy

1. Railway will automatically deploy when you push to your main branch
2. Wait for deployment to complete (1-2 minutes)
3. Railway will provide you with a URL like: `https://your-app.up.railway.app`

## Step 5: Update Client URL

Update the server URL in your Electron app:

1. Open `src/renderer/js/app.js`
2. Find line 8-9:
   ```javascript
   const SERVER_URL = 'https://myserver2-production.up.railway.app';
   const FALLBACK_URL = 'http://localhost:3000';
   ```
3. Replace `myserver2-production.up.railway.app` with your Railway URL
4. Commit and push the change

## Step 6: Test Connection

1. Run your Electron app: `npm run dev`
2. Check the console for connection messages
3. You should see: "✅ Connected to server"
4. Try joining a voice channel

## Railway Pricing

### Free Tier (Trial)
- $5 free credit
- 500 hours/month
- Good for testing

### Hobby Plan ($5/month)
- Always-on deployment
- No sleep mode
- Perfect for daily use with friends
- Recommended for production

### Usage Tips
- Free tier goes to sleep after inactivity
- Hobby plan ($5/month) recommended for friends
- Server uses minimal resources (~100 MB RAM)

## Monitoring Your Deployment

### View Logs
1. Go to your Railway project
2. Click on the deployment
3. View logs in real-time

### Check Health
Visit: `https://your-app.up.railway.app/health`

You should see:
```json
{
  "status": "ok",
  "users": 0,
  "hubUsers": 0,
  "voiceChannel": {
    "id": "voice",
    "userCount": 0
  },
  "chatChannel": "general",
  "messageCount": 0,
  "uptime": 123.45
}
```

## Troubleshooting

### Deployment Failed
- Check Railway logs for errors
- Verify `package.json` has correct dependencies
- Ensure `src/server/signaling-server.js` exists

### Can't Connect from App
- Verify Railway URL in app.js is correct
- Check if deployment is running (not sleeping)
- Open browser DevTools and check for CORS errors

### Server Sleeping (Free Tier)
- Upgrade to Hobby plan ($5/month)
- Or accept 30-second wake-up delay on first connection

## Alternative: Deploy to Your Own Server

If you have your own VPS or home server:

1. Install Node.js
2. Clone your repository
3. Run:
   ```bash
   cd Proximity
   npm install
   npm run server
   ```
4. Set up a reverse proxy (nginx) with SSL
5. Point your app to your server URL

## Next Steps

1. Deploy to Railway
2. Update app with Railway URL
3. Build Electron app: `npm run build`
4. Share the built app with friends (in `dist/` folder)
5. Everyone connects to same Railway server!

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check Railway status: https://status.railway.app

---

**Note**: You already have a Railway server at `myserver2-production.up.railway.app`. You can either:
1. **Redeploy to existing Railway instance** - Push your updated code and Railway will automatically deploy
2. **Create a new Railway project** - Follow steps above for a fresh deployment

For existing Railway server, just push your code and it will auto-deploy!
