# Microsoft Graph Calendar Sync - Azure Setup Guide

This guide walks you through registering an Azure AD application to enable Microsoft Calendar sync in Open Loops.

## Prerequisites

- A Microsoft account (personal or work/school)
- Access to Azure Portal (free tier works)
- ~10 minutes to complete setup

## Step 1: Access Azure Portal

1. Navigate to [https://portal.azure.com](https://portal.azure.com)
2. Sign in with your Microsoft account
3. If you don't have an Azure subscription, you can still register apps for free

## Step 2: Navigate to App Registrations

1. In the Azure Portal, search for **"App registrations"** in the top search bar
2. Click **App registrations** in the search results
3. Click **+ New registration** button at the top

## Step 3: Register Application

Fill out the registration form:

### Basic Information
- **Name**: `Open Loops Calendar Sync`
  - (You can name it anything, this is just for your reference)

- **Supported account types**: Select one of these options:
  - **Recommended**: "Accounts in any organizational directory and personal Microsoft accounts"
    - This allows both work/school and personal Microsoft accounts
  - Alternative: "Personal Microsoft accounts only"
    - If you only need personal Outlook.com accounts
  - Alternative: "Accounts in this organizational directory only"
    - If you only need your company's accounts

### Redirect URI
- **Platform**: Select **"Public client/native (mobile & desktop)"**
- **Redirect URI**: Enter `http://localhost:3001/auth/callback`
  - This is where Microsoft will redirect after login
  - The app will start a local server to capture the authentication code

Click **Register** button at the bottom.

## Step 4: Note Your Application (client) ID

After registration, you'll see the app overview page:

1. Find the **Application (client) ID** (looks like `a1b2c3d4-...`)
2. **Copy this ID** - you'll need it for the app configuration
3. Save it somewhere safe (e.g., password manager or `.env` file)

**Important:** This Client ID is public information (it's safe to embed in the app). Do NOT confuse this with a Client Secret (which you don't need for desktop apps).

## Step 5: Configure Authentication Settings

1. In the left sidebar, click **Authentication**

2. Scroll down to **Advanced settings** section

3. Find **"Allow public client flows"**
   - Toggle it to **Yes**
   - This is required for desktop/native apps

4. Click **Save** at the top

## Step 6: Add API Permissions

1. In the left sidebar, click **API permissions**

2. You should see `Microsoft Graph` → `User.Read` already added (default)

3. Click **+ Add a permission**

4. Click **Microsoft Graph** tile

5. Click **Delegated permissions** (not Application permissions)

6. In the search box, type `Calendars.Read`

7. Check the box next to **Calendars.Read**
   - Description: "Read user calendars"

8. Click **Add permissions** at the bottom

9. *Optional but recommended*: Click **Grant admin consent for [Your Organization]**
   - This pre-approves the permissions for all users
   - If you skip this, each user will need to consent on first login
   - Only available if you're an admin

### Final Permissions List

You should now see:
- ✅ Microsoft Graph → `User.Read` (Delegated)
- ✅ Microsoft Graph → `Calendars.Read` (Delegated)

*Note: `offline_access` and `openid` scopes are automatically included and don't need to be added here.*

## Step 7: Configure the App

Now that Azure is set up, you need to configure Open Loops with your Client ID.

### Option A: Environment Variable (Recommended for Development)

Create or edit `.env` file in the project root:

```bash
# Microsoft Graph Configuration
MS_GRAPH_CLIENT_ID=your-client-id-here
MS_GRAPH_REDIRECT_URI=http://localhost:3001/auth/callback
```

### Option B: Settings in Code (For Production Builds)

Edit `src/main/config/microsoft-graph.ts` (file will be created during implementation):

```typescript
export const msGraphConfig = {
  clientId: 'your-client-id-here',
  redirectUri: 'http://localhost:3001/auth/callback',
  authority: 'https://login.microsoftonline.com/common',
  scopes: ['openid', 'profile', 'offline_access', 'Calendars.Read', 'User.Read']
}
```

### Option C: User-Provided (Most Flexible)

Add a setting in the app where users enter their own Client ID:
- Good for open-source distribution
- Each user registers their own Azure app
- Avoids rate limiting issues on a shared Client ID

## Step 8: Test the Integration

1. Start Open Loops
2. Go to **Settings** → **Microsoft Calendar Sync**
3. Click **Connect Microsoft Account**
4. Browser should open with Microsoft login page
5. Sign in and approve permissions
6. App should show "Connected as [your-email]"
7. Try syncing calendar events

## Troubleshooting

### Error: "AADSTS50011: Reply URL mismatch"

**Problem:** The redirect URI in your app doesn't match what's registered in Azure.

**Solution:**
- Go to Azure Portal → App registrations → Your app → Authentication
- Verify the redirect URI is exactly `http://localhost:3001/auth/callback`
- Make sure it's under **"Public client/native"** platform, not "Web"

### Error: "AADSTS65001: The user or administrator has not consented"

**Problem:** Permissions not granted for the app.

**Solution:**
- Go to Azure Portal → App registrations → Your app → API permissions
- Click "Grant admin consent" button
- OR: Users can consent on first login (they'll see permission request screen)

### Error: "AADSTS700016: Application with identifier was not found"

**Problem:** Client ID is incorrect or app was deleted.

**Solution:**
- Double-check the Client ID in your config matches Azure exactly
- Verify the app still exists in Azure Portal → App registrations

### Error: "Cannot connect to local server"

**Problem:** App can't start local redirect server on port 3001.

**Solution:**
- Make sure port 3001 is not already in use
- Try closing other apps using that port
- Check firewall isn't blocking localhost connections

### Permissions not working

**Problem:** Can't read calendar events after connecting.

**Solution:**
- Verify `Calendars.Read` permission was added in Azure Portal
- Try disconnecting and reconnecting Microsoft account
- Check browser console for specific Graph API error messages

## Security Best Practices

### DO:
- ✅ Use delegated permissions (not application permissions)
- ✅ Request minimum scopes needed (Calendars.Read only)
- ✅ Store Client ID in environment variables or config files
- ✅ Add `.env` to `.gitignore` (don't commit secrets)
- ✅ Enable "Allow public client flows" for desktop apps

### DON'T:
- ❌ Generate a Client Secret (not needed for public clients)
- ❌ Commit Client ID to git if it's shared across all users
- ❌ Request `Calendars.ReadWrite` unless you need write access
- ❌ Use "Web" platform (use "Public client/native" instead)

## Managing the App

### View Usage Statistics

1. Go to Azure Portal → App registrations → Your app
2. Click **Sign-in logs** (requires Azure AD Premium or Entra ID)
3. See how many users have connected
4. Monitor for authentication failures

### Revoke Access

**For a specific user:**
- User goes to https://account.microsoft.com/privacy/app-permissions
- Finds "Open Loops Calendar Sync"
- Clicks "Remove" to revoke access

**Delete the app entirely:**
- Go to Azure Portal → App registrations → Your app
- Click **Delete** at the top
- This will break authentication for all users

### Modify Permissions

1. Go to Azure Portal → App registrations → Your app → API permissions
2. Click **+ Add a permission** to add new scopes
3. Click **...** menu next to a permission to remove it
4. If removing a permission users already consented to, they'll need to re-consent

## Multi-Tenant Deployment Considerations

### Single Azure App (Shared Client ID)
**Pros:**
- Easy to distribute (one Client ID)
- Centralized management
- Simpler user experience

**Cons:**
- Microsoft rate limits may affect all users
- If app is compromised, all users affected
- You're responsible for Azure app management

### User-Provided Client ID (Each User Registers Own App)
**Pros:**
- No shared rate limits
- Users control their own app
- Better for open-source distribution
- No centralized dependency

**Cons:**
- More complex user setup
- Each user needs Azure account
- Support burden for helping users with Azure

**Recommendation for Open Loops:**
- Start with shared Client ID (easier onboarding)
- Add "Advanced: Use Custom Client ID" option for power users
- Document both approaches

## Next Steps

Once you have your Client ID:

1. Configure the app with your Client ID
2. Test authentication flow
3. Test calendar sync
4. (Optional) Set up Terraform to automate Azure app creation
5. Document the setup process for other developers/users

## Additional Resources

- [Azure App Registration Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Public client authentication flows](https://learn.microsoft.com/en-us/entra/identity-platform/msal-authentication-flows)
- [Microsoft Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Troubleshooting AADSTS errors](https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes)

---

**Questions or Issues?**
- Check the [spec document](./MICROSOFT_GRAPH_CALENDAR_SYNC_SPEC.md) for technical details
- File an issue on GitHub
- Consult Microsoft's official documentation
