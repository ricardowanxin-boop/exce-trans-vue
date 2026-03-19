const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: 'wanxin1994-3g0nf07m2ee74437'
});
const db = app.database();

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeToBuffer(str) {
  const pad = 4 - (str.length % 4 || 4);
  const base64 = (str + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function signToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const sigPart = base64UrlEncode(sig);
  return `${signingInput}.${sigPart}`;
}

function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, sigPart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const actualSig = base64UrlDecodeToBuffer(sigPart);
  if (actualSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;
  try {
    const payload = JSON.parse(base64UrlDecodeToBuffer(payloadPart).toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPasswordPBKDF2(password, saltBase64, iterations) {
  const salt = Buffer.from(saltBase64, 'base64');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return hash.toString('base64');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4) return false;
  const [algo, iterStr, saltBase64, hashBase64] = parts;
  if (algo !== 'pbkdf2_sha256') return false;
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations) || iterations < 10000) return false;
  const computed = hashPasswordPBKDF2(password, saltBase64, iterations);
  const a = Buffer.from(computed, 'base64');
  const b = Buffer.from(hashBase64, 'base64');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

exports.main = async (event, context) => {
  try {
    const username = event.username;
    const password = event.password;

    if (!username || !password) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        data: { valid: false, error: '缺少必要参数' }
      };
    }

    const secret = process.env.ADMIN_AUTH_SECRET;
    if (!secret) {
      return {
        isBase64Encoded: false,
        statusCode: 500,
        data: { valid: false, error: '管理员鉴权未配置' }
      };
    }

    const res = await db
      .collection('admin_users')
      .where({ username: username, status: 'active' })
      .limit(1)
      .get();

    if (!res.data || res.data.length === 0) {
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { valid: false, error: '账号或密码错误' }
      };
    }

    const admin = res.data[0];
    const ok = verifyPassword(password, admin.password_hash);
    if (!ok) {
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { valid: false, error: '账号或密码错误' }
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: admin._id,
      username: admin.username,
      role: 'admin',
      iat: now,
      exp: now + 60 * 60 * 24 * 7
    };
    const token = signToken(payload, secret);

    await db.collection('admin_users').doc(admin._id).update({
      last_login_at: db.serverDate()
    });

    return {
      isBase64Encoded: false,
      statusCode: 200,
      data: {
        valid: true,
        user_id: admin._id,
        role: 'admin',
        token
      }
    };
  } catch (e) {
    return {
      isBase64Encoded: false,
      statusCode: 500,
      data: { valid: false, error: `Server Error: ${e.message}` }
    };
  }
};

