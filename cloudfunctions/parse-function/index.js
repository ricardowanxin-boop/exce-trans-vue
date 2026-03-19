const ExcelJS = require('exceljs');

function extractWorksheetPreview(worksheet) {
  const previewData = [];

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      const text = cell.text || (cell.value && cell.value.toString()) || '';
      if (text) {
        previewData.push({
          coordinate: cell.address,
          text
        });
      }
    });
  });

  return previewData;
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

    if (!fileBase64) {
      return {
        isBase64Encoded: false,
        statusCode: 400,
        data: { error: '未接收到文件数据' }
      };
    }

    // 兼容带有前缀的 Base64
    const base64Data = fileBase64.includes(',') ? fileBase64.split(',').pop() : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    
    const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
    const previewsBySheet = {};
    const totalCellsBySheet = {};
    let totalCells = 0;

    workbook.worksheets.forEach((worksheet) => {
      const previewData = extractWorksheetPreview(worksheet);
      previewsBySheet[worksheet.name] = previewData;
      totalCellsBySheet[worksheet.name] = previewData.length;
      totalCells += previewData.length;
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
