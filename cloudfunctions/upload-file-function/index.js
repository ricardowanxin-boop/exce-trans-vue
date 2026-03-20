const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({
  env: 'wanxin1994-3g0nf07m2ee74437'
});
const db = app.database();

function makeUploadId() {
  return `upload_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function success(data) {
  return {
    isBase64Encoded: false,
    statusCode: 200,
    data
  };
}

function failure(statusCode, error) {
  return {
    isBase64Encoded: false,
    statusCode,
    data: { error }
  };
}

async function initUploadSession(event) {
  const uploadId = makeUploadId();

  await db.collection('file_upload_sessions').add({
    upload_id: uploadId,
    file_name: event.file_name || '',
    file_size: Number(event.file_size || 0),
    content_type: event.content_type || 'application/octet-stream',
    status: 'uploading',
    total_chunks: 0,
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  });

  return success({ upload_id: uploadId });
}

async function appendUploadChunk(event) {
  const uploadId = String(event.upload_id || '');
  const chunkIndex = Number(event.chunk_index);
  const chunkBase64 = String(event.chunk_base64 || '');

  if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0 || !chunkBase64) {
    return failure(400, '缺少必要参数');
  }

  await db.collection('file_upload_chunks').add({
    upload_id: uploadId,
    chunk_index: chunkIndex,
    chunk_base64: chunkBase64,
    created_at: db.serverDate()
  });

  const sessionRes = await db
    .collection('file_upload_sessions')
    .where({ upload_id: uploadId })
    .limit(1)
    .get();

  if (!sessionRes.data || sessionRes.data.length === 0) {
    return failure(404, '上传会话不存在');
  }

  await db.collection('file_upload_sessions').doc(sessionRes.data[0]._id).update({
    updated_at: db.serverDate()
  });

  return success({ ok: true });
}

async function completeUploadSession(event) {
  const uploadId = String(event.upload_id || '');
  const totalChunks = Number(event.total_chunks || 0);

  if (!uploadId || !Number.isInteger(totalChunks) || totalChunks <= 0) {
    return failure(400, '缺少必要参数');
  }

  const sessionRes = await db
    .collection('file_upload_sessions')
    .where({ upload_id: uploadId })
    .limit(1)
    .get();

  if (!sessionRes.data || sessionRes.data.length === 0) {
    return failure(404, '上传会话不存在');
  }

  await db.collection('file_upload_sessions').doc(sessionRes.data[0]._id).update({
    status: 'completed',
    total_chunks: totalChunks,
    updated_at: db.serverDate(),
    completed_at: db.serverDate()
  });

  return success({ upload_id: uploadId, total_chunks: totalChunks });
}

exports.main = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return success({});
  }

  try {
    const action = event.action;

    if (action === 'init') {
      return await initUploadSession(event);
    }

    if (action === 'append') {
      return await appendUploadChunk(event);
    }

    if (action === 'complete') {
      return await completeUploadSession(event);
    }

    return failure(400, '不支持的操作类型');
  } catch (error) {
    return failure(500, `上传处理失败: ${error.message}`);
  }
};
