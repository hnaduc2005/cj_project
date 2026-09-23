import { ConfidentialClientApplication } from '@azure/msal-node';
import { randomBytes, createHash } from 'node:crypto';
import { fail } from './business.js';
import { id, now, hashPassword } from './database.js';

export const PRIMARY_ADMIN = 'uyenthu.cu@cj.net';
export const corporateEmail = value => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@cj\.net$/i.test(String(value || '').trim());
export const emailAddress = value => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(String(value || ''));
export const canonicalEmail = value => String(value || '').trim().toLowerCase();

export function getAccount(db, key) {
  return db.prepare('SELECT u.id,u.email,u.name,u.role,f.active,f.is_primary FROM users u JOIN account_flags f ON f.user_id=u.id WHERE u.id=?').get(key);
}
export function provisionEmailUser(db, value) {
  const email = canonicalEmail(value);
  if (email.length > 254 || !corporateEmail(email)) fail('Vui lòng nhập email có đuôi @cj.net', 400);
  let user = db.prepare('SELECT id,role FROM users WHERE email=?').get(email);
  if (email === PRIMARY_ADMIN || user?.role === 'ADMIN') fail('Tài khoản Admin cần đăng nhập qua tab quản trị', 403);
  if (!user) {
    const key = id();
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(key,email,email.split('@')[0],'REQUESTER',hashPassword(randomBytes(40).toString('hex')));
    db.prepare('INSERT INTO account_flags VALUES (?,1,0,NULL,?)').run(key,now());
    user = {id:key};
  }
  const account = getAccount(db,user.id);
  if (!account?.active) fail('Tài khoản đã bị ngừng quyền truy cập',403);
  return account;
}
export function provisionMicrosoftUser(db, profile) {
  const email = canonicalEmail(profile.email);
  if (!corporateEmail(email) || !profile.oid) fail('Chỉ tài khoản công ty @cj.net đã xác minh được truy cập', 403);
  let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user) {
    const key = id();
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(key, email, String(profile.name || email.split('@')[0]), 'REQUESTER', hashPassword(randomBytes(40).toString('hex')));
    db.prepare('INSERT INTO account_flags VALUES (?,1,0,?,?)').run(key, profile.oid, now());
    user = { id: key };
  }
  const flags = db.prepare('SELECT * FROM account_flags WHERE user_id=?').get(user.id);
  if (!flags?.active) fail('Tài khoản đã bị ngừng quyền truy cập', 403);
  if (flags.entra_oid && flags.entra_oid !== profile.oid) fail('Danh tính Microsoft không khớp tài khoản đã đăng ký', 403);
  db.prepare('UPDATE account_flags SET entra_oid=? WHERE user_id=?').run(profile.oid, user.id);
  return getAccount(db, user.id);
}

export function microsoftIdentity(env = process.env) {
  const tenant = env.ENTRA_TENANT_ID || '', clientId = env.ENTRA_CLIENT_ID || '';
  const appUrl = (env.APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
  const configured = Boolean(tenant && clientId && env.ENTRA_CLIENT_SECRET);
  if (configured && (!/^[a-f0-9-]{36}$/i.test(tenant) || !/^[a-f0-9-]{36}$/i.test(clientId))) throw Error('ENTRA_TENANT_ID và ENTRA_CLIENT_ID phải là GUID của tenant/app công ty');
  const cca = configured ? new ConfidentialClientApplication({ auth: { clientId, authority: 'https://login.microsoftonline.com/' + tenant, clientSecret: env.ENTRA_CLIENT_SECRET }, system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } } }) : null;
  const redirectUri = appUrl + '/api/auth/microsoft/callback';
  return {
    configured, appUrl, redirectUri,
    async begin(email, state) {
      if (!cca) fail('IT cần cấu hình Entra ID trước khi đăng nhập Microsoft. Admin chính vẫn có thể đăng nhập bằng mật khẩu.', 503);
      const verifier = randomBytes(48).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const url = await cca.getAuthCodeUrl({ scopes: ['openid', 'profile', 'email', 'User.Read'], redirectUri, state, loginHint: email || undefined, prompt: 'select_account', codeChallenge: challenge, codeChallengeMethod: 'S256', responseMode: 'query' });
      return { url, verifier };
    },
    async complete(code, verifier) {
      const result = await cca.acquireTokenByCode({ code, codeVerifier: verifier, scopes: ['User.Read'], redirectUri });
      if (result.tenantId?.toLowerCase() !== tenant.toLowerCase()) fail('Tenant Microsoft không được phép', 403);
      const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: 'Bearer ' + result.accessToken }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) fail('Không xác minh được hộp thư Microsoft', 502);
      const profile = await response.json();
      // Only verified Graph identity; never trust the login hint or browser-supplied email.
      return { email: canonicalEmail(profile.mail || profile.userPrincipalName), oid: profile.id, name: profile.displayName };
    },
    async appToken() {
      if (!cca) fail('Chưa cấu hình Entra ID', 503);
      let result;
      try { result = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] }); }
      catch { fail('Không lấy được token gửi thư. IT kiểm tra tenant, client credential, consent và hạn secret.',502); }
      if (!result?.accessToken) fail('Không lấy được quyền gửi thư Microsoft Graph', 502);
      return result.accessToken;
    }
  };
}
