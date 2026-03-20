const ExcelJS = require('exceljs');
const axios = require('axios');
const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: "wanxin1994-3g0nf07m2ee74437"
});
const db = app.database();
const _ = db.command;

const OPENAI_API_KEY = "ms-6aefa45f-c326-4733-af4b-9526ac32144d";
const OPENAI_BASE_URL = "https://api-inference.modelscope.cn/v1/chat/completions";
const MODEL_NAME = "Qwen/Qwen3-30B-A3B-Instruct-2507";

function base64UrlDecodeToBuffer(str) {
  const pad = 4 - (str.length % 4 || 4);
  const base64 = (str + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function verifyAdminTokenFromAuthHeader(authHeader) {
  if (!authHeader) return null;
  const m = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  const secret = process.env.ADMIN_AUTH_SECRET;
  if (!secret) return null;
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
    if (payload.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

function verifyAdminToken(token) {
  if (!token) return null;
  return verifyAdminTokenFromAuthHeader(`Bearer ${String(token).trim()}`);
}

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

function getCardValidationError(card) {
  if (!card) return '未找到该用户的授权卡密';
  if (card.card_type === 'admin') return '请使用管理员账号登录';
  if (card.status && card.status !== 'active') return '卡密已停用';

  const expiresAt = normalizeTimestamp(card.expires_at);
  if (expiresAt && expiresAt < Date.now()) return '卡密已过期';

  return '';
}

function getChargeUnits(cardType) {
  return cardType === 'sheet_count' || cardType === 'file_count' ? 1 : 0;
}

function isWorkbookPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const values = Object.values(payload);
  if (values.length === 0) return false;
  return values.every((value) => value && typeof value === 'object' && !Array.isArray(value));
}

function extractWorksheetPayload(worksheet) {
  const sheetPayload = {};

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      const text = cell.text || (cell.value && cell.value.toString()) || '';
      if (text) {
        sheetPayload[cell.address] = text;
      }
    });
  });

  return sheetPayload;
}

async function callLLMTranslate(textsDict, targetLang) {
  if (!textsDict || Object.keys(textsDict).length === 0) return {};
  const systemPrompt = `你是一个专业的翻译专家。请将用户提供的 JSON 格式的文本翻译成 ${targetLang}。保持 JSON 的键名不变，只翻译值的内容。返回的必须是一个合法的 JSON 对象，不要包含其他解释说明文字。`;
  
  try {
    const response = await axios.post(OPENAI_BASE_URL, {
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(textsDict) }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      timeout: 60000
    });

    const content = response.data.choices[0].message.content;
    const jsonContent = content.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonContent);
  } catch (e) {
    throw new Error(`大模型请求失败: ${e.message}`);
  }
}

async function findCardByUserIdentity(userId) {
  let cardRes = await db.collection("card_secrets").where({ user_id: userId }).limit(1).get();
  if (!cardRes.data || cardRes.data.length === 0) {
    cardRes = await db.collection("card_secrets").where({ key: userId }).limit(1).get();
  }
  return cardRes;
}

async function loadBufferFromUploadId(uploadId) {
  if (!uploadId) return null;

  const sessionRes = await db
    .collection('file_upload_sessions')
    .where({ upload_id: String(uploadId) })
    .limit(1)
    .get()
    .catch(() => null);

  if (!sessionRes || !sessionRes.data || sessionRes.data.length === 0) {
    throw new Error('上传文件会话不存在');
  }

  const session = sessionRes.data[0];
  if (session.status !== 'completed') {
    throw new Error('文件仍在上传中，请稍后重试');
  }

  const chunkRes = await db
    .collection('file_upload_chunks')
    .where({ upload_id: String(uploadId) })
    .limit(1000)
    .get();

  const chunks = (chunkRes.data || []).sort((a, b) => Number(a.chunk_index || 0) - Number(b.chunk_index || 0));
  if (!chunks.length) {
    throw new Error('未找到已上传的文件分片');
  }

  return Buffer.concat(chunks.map((item) => Buffer.from(item.chunk_base64, 'base64')));
}

exports.main = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      isBase64Encoded: false,
      statusCode: 200,
      data: {}
    };
  }

  try {
    const authHeader = (event.headers && (event.headers.Authorization || event.headers.authorization)) || '';
    const adminPayload = verifyAdminToken(event.admin_token) || verifyAdminTokenFromAuthHeader(authHeader);
    const isAdmin = !!adminPayload;

    const { data, user_id, target_lang, file_base64, file_id, file_url, upload_id, sheet_name, sheet_names } = event;

    if (!target_lang || (!file_base64 && !file_id && !file_url && !upload_id) || (!isAdmin && !user_id)) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        data: { error: '缺少必要参数' }
      };
    }
    let card = null;
    let total = 0;
    let used = 0;
    let chargeUnits = 0;
    let effectiveUserId = user_id;

    if (!isAdmin) {
      const cardRes = await findCardByUserIdentity(user_id);
      if (!cardRes.data || cardRes.data.length === 0) {
        return {
          isBase64Encoded: false,
          statusCode: 403,
          data: { error: '未找到该用户的授权卡密' }
        };
      }

      card = cardRes.data[0];
      const cardError = getCardValidationError(card);
      if (cardError) {
        return {
          isBase64Encoded: false,
          statusCode: 403,
          data: { error: cardError }
        };
      }

      total = Number(card.total_count || 0);
      used = Number(card.used_count || 0);
      chargeUnits = getChargeUnits(card.card_type);

      if (chargeUnits > 0 && used + chargeUnits > total) {
        return {
          isBase64Encoded: false,
          statusCode: 403,
          data: { error: '卡密剩余次数不足' }
        };
      }
    } else {
      effectiveUserId = adminPayload.sub;
    }

    // 3. 处理 Excel
    let buffer = null;
    if (upload_id) {
      buffer = await loadBufferFromUploadId(upload_id);
    } else if (file_id) {
      const fileRes = await app.downloadFile({ fileID: file_id });
      buffer = fileRes.fileContent;
    } else if (file_url) {
      const fileRes = await axios.get(file_url, {
        responseType: 'arraybuffer',
        timeout: 60000
      });
      buffer = Buffer.from(fileRes.data);
    } else {
      const base64Data = file_base64.includes(',') ? file_base64.split(',').pop() : file_base64;
      buffer = Buffer.from(base64Data, 'base64');
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    let workbookPayload = {};

    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      workbookPayload = isWorkbookPayload(data)
        ? data
        : { [sheet_name || '__DEFAULT__']: data };
    } else {
      const requestedSheetNames = Array.isArray(sheet_names) && sheet_names.length > 0
        ? sheet_names
        : [sheet_name || (workbook.worksheets[0] && workbook.worksheets[0].name)].filter(Boolean);

      for (const requestedSheetName of requestedSheetNames) {
        const worksheet = workbook.getWorksheet(requestedSheetName);
        if (!worksheet) {
          throw new Error(`工作表不存在: ${requestedSheetName}`);
        }

        const sheetPayload = extractWorksheetPayload(worksheet);
        if (Object.keys(sheetPayload).length > 0) {
          workbookPayload[requestedSheetName] = sheetPayload;
        }
      }
    }

    const cellsToTranslate = Object.values(workbookPayload).reduce((sum, sheetData) => {
      return sum + Object.keys(sheetData || {}).length;
    }, 0);

    if (!cellsToTranslate) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        data: { error: '当前文件没有可翻译内容' }
      };
    }

    for (const [requestedSheetName, sheetData] of Object.entries(workbookPayload)) {
      const resolvedSheetName = requestedSheetName === '__DEFAULT__'
        ? (sheet_name || (workbook.worksheets[0] && workbook.worksheets[0].name))
        : requestedSheetName;

      const worksheet = workbook.getWorksheet(resolvedSheetName);
      if (!worksheet) {
        throw new Error(`工作表不存在: ${resolvedSheetName}`);
      }

      if (!sheetData || Object.keys(sheetData).length === 0) {
        continue;
      }

      const translatedDict = await callLLMTranslate(sheetData, target_lang);
      for (const [coord, text] of Object.entries(translatedDict)) {
        const cell = worksheet.getCell(coord);
        cell.value = text;
      }
    }

    const newBuffer = await workbook.xlsx.writeBuffer();
    const newBase64 = newBuffer.toString('base64');
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${newBase64}`;

    if (!isAdmin && chargeUnits > 0) {
      await db.collection("card_secrets").doc(card._id).update({
        used_count: _.inc(chargeUnits)
      });
    }

    // 5. 记录日志
    await db.collection("usage_logs").add({
      user_id: effectiveUserId,
      operation_type: isAdmin ? "admin_translate" : (card && card.card_type) || "translate",
      cells_count: cellsToTranslate,
      created_at: db.serverDate()
    });

    // 成功返回
    return {
      isBase64Encoded: false,
      statusCode: 200,
      data: {
        file_url: dataUrl,
        used_count: chargeUnits
      }
    };

  } catch (e) {
    // 异常返回
    return {
      isBase64Encoded: false,
      statusCode: 500,
      data: { error: `翻译处理失败: ${e.message}` }
    };
  }
};
