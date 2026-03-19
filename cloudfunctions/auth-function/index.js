const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: "wanxin1994-3g0nf07m2ee74437"
});
const db = app.database();

function normalizeTimestamp(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  if (typeof value === 'object') {
    if (typeof value.$date === 'number') return value.$date;
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value._seconds === 'number') return value._seconds * 1000;
  }
  return null;
}

exports.main = async (event, context) => {
  try {
    let data = {};
    const key = event.key;
    if (!key) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        data: { valid: false, error: '卡密不能为空' }
      };
    }

    // 查询数据库
    const res = await db.collection("card_secrets").where({ key: key }).get();
    console.log('查询数据库结果:', res);
    if (!res.data || res.data.length === 0) {
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { valid: false, error: '无效的卡密' }
      };
    }

    const card = res.data[0];
    if (card.card_type === 'admin') {
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { valid: false, error: '请使用管理员账号登录' }
      };
    }

    if (card.status && card.status !== 'active') {
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { valid: false, error: '卡密已停用' }
      };
    }

    const expiresAt = normalizeTimestamp(card.expires_at);
    if (expiresAt && expiresAt < Date.now()) {
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { valid: false, error: '卡密已过期' }
      };
    }

    const total = Number(card.total_count || 0);
    const used = Number(card.used_count || 0);
    const remaining = Math.max(total - used, 0);
    const isCountCard = card.card_type === 'sheet_count' || card.card_type === 'file_count';
    if (isCountCard && remaining <= 0) {
      return {
        isBase64Encoded: false,
        statusCode: 200,
        data: { valid: false, error: '卡密次数已用完' }
      };
    }

    const userId = card.user_id || card.key || card._id;

    return {
      isBase64Encoded: false,
      statusCode: 200,
      data: {
        valid: true,
        total_count: total,
        card_type: card.card_type || 'sheet_count',
        expires_at: expiresAt,
        user_id: userId,
        remaining_count: remaining
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
