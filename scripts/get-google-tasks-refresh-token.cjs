const http = require('http');
const { google } = require('googleapis');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.');
  process.exit(1);
}

const redirectUri = 'http://127.0.0.1:5555/oauth2callback';
const scopes = ['https://www.googleapis.com/auth/tasks'];
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopes });

console.log('\n1) Open this URL in your browser:\n\n' + authUrl + '\n');
console.log('2) After granting access, Google will redirect to:\n   ' + redirectUri);
console.log('   Leave this terminal open — waiting for the redirect...\n');

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth2callback')) { res.statusCode = 404; return res.end('Not found'); }
  const u = new URL(req.url, 'http://127.0.0.1:5555');
  const code = u.searchParams.get('code');
  res.end('Auth complete — you can close this window.');
  server.close();
  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      console.error('\nNo refresh token returned. Revoke old grants at https://myaccount.google.com/permissions and re-run.\n');
      return;
    }
    console.log('\nGOOGLE_REFRESH_TOKEN=' + tokens.refresh_token + '\n');
  } catch (e) {
    console.error('\nToken exchange failed:\n', e?.response?.data || e.message, '\n');
  }
});
server.listen(5555);