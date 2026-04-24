# Netlify migration — wake-up checklist

Everything below takes ~3 minutes of clicking. Code is already staged and
pushed; Netlify just needs to be told where to look and what secrets to use.

## 1. Connect the repo to Netlify (~30 sec)

1. Go to <https://app.netlify.com/teams/patrick-ytqgxuq/projects>
2. **Add new project → Import from Git → GitHub → authorize (if first time)**
3. Pick repo `plproduction/gigwright`
4. Branch: `main`
5. Build settings should auto-detect from `netlify.toml`. If not:
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node version: 22
6. Do **not** deploy yet — click the tiny **"Add environment variables"**
   link at the bottom of the deploy settings page first.

## 2. Paste env vars (~90 sec)

Open `.env.netlify-paste` (in the repo root, gitignored). Click
**"Import from a .env file"** in Netlify's env-var modal, paste the whole
thing, click **Import**. 21 variables should land in one shot.

Values in that file are pulled directly from Vercel production, so Stripe /
Twilio / QBO / Resend / Neon all work unchanged.

**Note**: `AUTH_URL` says `https://gigwright.com`. That's fine — it keeps
OAuth and magic-link redirects on the apex domain throughout. The first
Netlify preview URL will look like `gigwright-xxxxx.netlify.app`, which is
OK for a smoke test — magic-link sign-in will still work because AUTH_URL
is used for redirect construction, not host matching.

## 3. First deploy (~90 sec to build)

Click **Deploy gigwright**. Watch the build log. You're looking for:
- ✅ `prisma generate` runs
- ✅ `next build` completes
- ✅ No errors about missing env vars
- ✅ Build finishes green

Click the preview URL (e.g. `https://gigwright-xxxxx.netlify.app`) and
check:
- [ ] Landing page renders
- [ ] `/signin` loads
- [ ] Try magic-link sign-in → check email → click link → you're in
- [ ] `/dashboard` loads and shows your gigs
- [ ] Open one gig → roster, loading info, setlist all render

**If anything breaks**, ping me with the Netlify build log and I'll fix.

## 4. DNS swap (~60 sec — needs Squarespace 2FA from you)

Once the Netlify preview works end-to-end:

1. In Netlify, go to **Domain management → Add custom domain**
2. Enter `gigwright.com`, click **Add**
3. Netlify gives you either:
   - **Option A (recommended)**: Netlify nameservers (`dns1.p05.nsone.net`
     etc.). Best option. Point Squarespace nameservers at Netlify's four.
   - **Option B**: A record for apex + CNAME for www. Slightly messier
     but keeps Resend MX / DKIM records at Squarespace.
4. Ping me here when you're on the DNS step — I'll drive the Squarespace
   UI with you feeding 2FA codes. Takes 3 minutes.

## 5. Stripe webhook update (I'll do this)

Once `gigwright.com` resolves to Netlify:
- I'll update the webhook URL from `gigwright.com/api/stripe/webhook`
  (actually it's the same — no change needed unless we change the path)
- Re-verify signing by triggering a test event

You don't need to touch this — I have the Stripe key.

## 6. Keep Vercel live for ~7 days as fallback

If DNS takes 24h to fully propagate or something obscure breaks, we can
flip DNS back to Vercel in 60 seconds. After a week of stability I'll
delete the Vercel project.

---

## What I already did

- ✅ Created `netlify.toml` (Next 16 runtime auto-detected; Node 22 pinned)
- ✅ Fixed 4 hardcoded `gigwright.vercel.app` fallback URLs → `gigwright.com`
- ✅ Pulled all 21 env vars from Vercel → `.env.netlify-paste` (gitignored)
- ✅ Committed + pushed to GitHub so Netlify has something to deploy
- ✅ Left this checklist

## Blockers I can't clear without you

- 🔒 Netlify site creation (needs your GitHub OAuth)
- 🔒 Env var paste (needs your Netlify session)
- 🔒 DNS switch at Squarespace (needs 2FA)

One thing that would remove ALL of these: a **Netlify personal access
token** from <https://app.netlify.com/user/applications#personal-access-tokens>.
With that + your GitHub already authorized in Netlify, I can create the
site, push env, trigger deploys, even add the custom domain — all without
you. You'd still need to swap Squarespace nameservers, but that's 60
seconds and one 2FA code.
