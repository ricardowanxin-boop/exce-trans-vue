const ExcelJS = require('exceljs');
const https = require('https');
const http = require('http');
const cloudbase = require('@cloudbase/node-sdk');

const PREVIEW_LIMIT_PER_SHEET = 30;

const app = cloudbase.init({
  env: 'wanxin1994-3g0nf07m2ee74437'
});
const db = app.database();

function downloadBuffer(fileUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (!fileUrl) {
      reject(new Error('缺少文件链接'));
      return;
    }

    const client = fileUrl.startsWith('https:') ? https : http;
    client
      .get(fileUrl, (response) => {
        const statusCode = response.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location && redirectCount < 3) {
          resolve(downloadBuffer(response.headers.location, redirectCount + 1));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`文件下载失败: ${statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

function extractWorksheetPreview(worksheet) {
  const previewData = [];
  const maxRow = Number(worksheet.actualRowCount || worksheet.rowCount || 0);

  for (let rowIndex = 1; rowIndex <= maxRow && previewData.length < PREVIEW_LIMIT_PER_SHEET; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const maxCol = Number(row.actualCellCount || row.cellCount || 0);

    for (let colIndex = 1; colIndex <= maxCol && previewData.length < PREVIEW_LIMIT_PER_SHEET; colIndex += 1) {
      const cell = row.getCell(colIndex);
      const text = cell.text || (cell.value && cell.value.toString()) || '';

      if (text) {
        previewData.push({
          coordinate: cell.address,
          text
        });
      }
    }
  }

  return {
    previewData,
    totalCount: previewData.length
  };
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
  // 跨域处理 (虽然网关可能处理，但保留以防万一，如果不需要可删除)
  if (event.httpMethod === 'OPTIONS') {
    return {
      isBase64Encoded: false,
      statusCode: 200,
      data: {}
    };
  }

  try {
    // 1. 直接从 event 中获取参数
    // 注意：网关配置为“集成响应”或类似模式时，body 通常已解析并合并到 event
    const fileBase64 = event.file_base64;
    const fileUrl = event.file_url;
    const uploadId = event.upload_id;

    let buffer = null;
    if (uploadId) {
      buffer = await loadBufferFromUploadId(uploadId);
    } else if (fileUrl) {
      buffer = await downloadBuffer(fileUrl);
    } else if (fileBase64) {
      const base64Data = fileBase64.includes(',') ? fileBase64.split(',').pop() : fileBase64;
      buffer = Buffer.from(base64Data, 'base64');
    }

    if (!buffer) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        data: { error: '未接收到文件数据' }
      };
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    
    const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
    const previewsBySheet = {};
    const totalCellsBySheet = {};
    let totalCells = 0;

    workbook.worksheets.forEach((worksheet) => {
      const { previewData, totalCount } = extractWorksheetPreview(worksheet);
      previewsBySheet[worksheet.name] = previewData;
      totalCellsBySheet[worksheet.name] = totalCount;
      totalCells += totalCount;
    });

    const resolvedSheetName = event.sheet_name && previewsBySheet[event.sheet_name]
      ? event.sheet_name
      : (sheetNames[0] || '');
    const selectedPreview = previewsBySheet[resolvedSheetName] || [];

    // 成功返回
    return {
      isBase64Encoded: false,
      statusCode: 200,
      data: {
        preview: selectedPreview,
        total_cells: totalCells,
        sheet_name: resolvedSheetName,
        sheet_names: sheetNames,
        previews_by_sheet: previewsBySheet,
        total_cells_by_sheet: totalCellsBySheet
      }
    };
  } catch (e) {
    // 异常返回
    return {
      isBase64Encoded: false,
      statusCode: 500,
      data: { error: `解析失败: ${e.message}` }
    };
  }
};
