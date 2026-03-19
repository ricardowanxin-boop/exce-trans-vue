const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: 'wanxin1994-3g0nf07m2ee74437'
});
const db = app.database();
const SELLABLE_TYPES = ['sheet_count', 'file_count', 'time'];

function base64UrlDecodeToBuffer(str) {
  const pad = 4 - (str.length % 4 || 4);
  const base64 = (str + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function verifyAdminTokenFromAuthHeader(authHeader) {
  if (!authHeader) return null;
  // 支持 Bearer Token 或是直接的 Token 字符串
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : String(authHeader).trim();
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, sigPart] = parts;
  try {
    const payload = JSON.parse(base64UrlDecodeToBuffer(payloadPart).toString('utf8'));
    const secret = process.env.ADMIN_AUTH_SECRET;
    if (secret) {
      const signingInput = `${headerPart}.${payloadPart}`;
      const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
      const actualSig = base64UrlDecodeToBuffer(sigPart);
      if (actualSig.length !== expectedSig.length) return null;
      if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;
    if (payload.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

function randomKey(prefix) {
  const buf = crypto.randomBytes(12);
  return `${prefix}${buf.toString('hex')}`;
}

function toMs(t) {
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function buildExpiryFromPeriod(period) {
  const now = Date.now();
  if (period === 'month') return now + 30 * 24 * 60 * 60 * 1000;
  if (period === 'year') return now + 365 * 24 * 60 * 60 * 1000;
  return null;
}

exports.main = async (event, context) => {
  try {
    // 优先从 body 中获取 admin_token，其次从 headers 获取
    const tokenFromBody = event.admin_token;
    const authHeader = tokenFromBody || (event.headers && (event.headers['x-admin-token'] || event.headers.Authorization || event.headers.authorization)) || '';
    const adminPayload = verifyAdminTokenFromAuthHeader(authHeader);
    if (!adminPayload) {
      return {
        isBase64Encoded: false,
        statusCode: 403,
        data: { error: '管理员未登录' }
      };
    }

    const action = event.action;
    if (!action) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        data: { error: '缺少必要参数' }
      };
    }

    if (action === 'stats') {
      const types = [...SELLABLE_TYPES, 'admin'];
      const perType = {};
      for (const t of types) {
        const c = await db.collection('card_secrets').where({ card_type: t }).count();
        perType[t] = c.total || 0;
      }
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: {
          total: SELLABLE_TYPES.reduce((sum, type) => sum + (perType[type] || 0), 0),
          sheet_count: perType.sheet_count || 0,
          file_count: perType.file_count || 0,
          time: perType.time || 0,
          admin: perType.admin || 0
        }
      };
    }

    if (action === 'list') {
      const page = Math.max(1, Number(event.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(event.page_size) || 20));
      const searchKey = (event.search_key || '').trim();

      let query = db.collection('card_secrets');
      if (searchKey) {
        const reg = db.RegExp({ regexp: searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
        query = query.where({ key: reg });
      }

      const res = await query
        .orderBy('created_at', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      const countRes = searchKey ? await query.count() : await db.collection('card_secrets').count();

      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: {
          list: (res.data || []).map((d) => ({
            _id: d._id,
            key: d.key,
            card_type: d.card_type || 'sheet_count',
            total_count: d.total_count ?? null,
            used_count: d.used_count ?? null,
            expires_at: d.expires_at ?? null,
            last_reset_at: d.last_reset_at ?? null,
            period: d.period ?? null,
            status: d.status || 'active',
            created_at: d.created_at ?? null,
            user_id: d.user_id ?? null
          })),
          total: countRes.total || 0,
          page,
          page_size: pageSize
        }
      };
    }

    if (action === 'create') {
      const cardType = event.card_type;
      const quantity = Math.min(500, Math.max(1, Number(event.quantity) || 1));
      const totalCount = Number(event.total_count);
      const expiresAt = toMs(event.expires_at);
      const period = typeof event.period === 'string' ? event.period.trim() : null;

      if (!cardType || !['sheet_count', 'file_count', 'time', 'admin'].includes(cardType)) {
        return {
          isBase64Encoded: false,
          statusCode: 400,
          data: { error: '卡密类型不正确' }
        };
      }

      if (!['time', 'admin'].includes(cardType) && (!Number.isFinite(totalCount) || totalCount <= 0)) {
        return {
          isBase64Encoded: false,
          statusCode: 400,
          data: { error: '次数必须大于0' }
        };
      }

      const keys = [];
      for (let i = 0; i < quantity; i++) {
        const key = randomKey(cardType === 'admin' ? 'admin-' : 'key-');
        const doc = {
          key,
          card_type: cardType,
          status: 'active',
          created_at: db.serverDate(),
          user_id: event.user_id || key
        };
        if (cardType === 'time') {
          const resolvedExpiresAt = expiresAt || buildExpiryFromPeriod(period);
          if (resolvedExpiresAt) doc.expires_at = resolvedExpiresAt;
          doc.period = period || null;
          doc.last_reset_at = db.serverDate();
          doc.total_count = 999999;
          doc.used_count = 0;
        } else {
          doc.total_count = cardType === 'admin' && (!Number.isFinite(totalCount) || totalCount <= 0) ? 999999 : totalCount;
          doc.used_count = 0;
        }
        await db.collection('card_secrets').add(doc);
        keys.push(key);
      }

      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { keys }
      };
    }

    if (action === 'update') {
      const id = event.id;
      if (!id) {
        return {
          isBase64Encoded: false,
          statusCode: 400,
          data: { error: '缺少必要参数' }
        };
      }

      const patch = {};
      if (event.status) patch.status = event.status;
      if (event.expires_at !== undefined) patch.expires_at = toMs(event.expires_at);
      if (event.total_count !== undefined) patch.total_count = Number(event.total_count);
      if (event.used_count !== undefined) patch.used_count = Number(event.used_count);
      if (event.period !== undefined) patch.period = event.period || null;

      await db.collection('card_secrets').doc(id).update(patch);
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { ok: true }
      };
    }

    if (action === 'delete') {
      const id = event.id;
      if (!id) {
        return {
          isBase64Encoded: false,
          statusCode: 400,
          data: { error: '缺少必要参数' }
        };
      }

      const detailRes = await db.collection('card_secrets').doc(id).get();
      const current = Array.isArray(detailRes.data) ? detailRes.data[0] : detailRes.data;
      if (!current) {
        return {
          isBase64Encoded: false,
          statusCode: 404,
          data: { error: '卡密不存在' }
        };
      }

      if (current.card_type === 'admin') {
        return {
          isBase64Encoded: false,
          statusCode: 400,
          data: { error: '管理员卡不可删除' }
        };
      }

      await db.collection('card_secrets').doc(id).remove();
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { ok: true }
      };
    }

    return {
      isBase64Encoded: false,
      statusCode: 400,
      data: { error: '不支持的操作' }
    };
  } catch (e) {
    return {
      isBase64Encoded: false,
      statusCode: 500,
      data: { error: `Server Error: ${e.message}` }
    };
  }
};
