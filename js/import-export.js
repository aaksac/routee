function isValidLatitude(lat) {
    current += char;
  }

  result.push(current);
  return result;
}

function normalizeImportedRow(row) {
  return {
    type: String(row.type || "").trim().toLowerCase(),
    name: String(row.name || "").trim(),
    lat: Number(row.lat),
    lng: Number(row.lng)
  };
}

function validateImportedRows(rows) {
  return rows.filter(
    (row) =>
      (row.type === "start" || row.type === "point") &&
      row.name &&
      Number.isFinite(row.lat) &&
      Number.isFinite(row.lng) &&
      isValidLatitude(row.lat) &&
      isValidLongitude(row.lng)
  );
}

async function importFromCsvFile(file) {
  const text = await file.text();
  const parsed = parseCsvText(text);
  return validateImportedRows(parsed);
}

async function importFromXlsxFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  const parsed = jsonRows.map(normalizeImportedRow);
  return validateImportedRows(parsed);
}

function convertImportedRowsToState(rows) {
  const startRow = rows.find((row) => row.type === "start") || null;
  const pointRows = rows.filter((row) => row.type === "point");

  const startPoint = startRow
    ? {
        id: "start-point",
        name: startRow.name,
        lat: Number(startRow.lat),
        lng: Number(startRow.lng),
        type: "start"
      }
    : null;

  const points = pointRows.map((row) => ({
    id: createPointId(),
    name: row.name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    distanceFromPrevious: 0,
    type: "point"
  }));

  return { startPoint, points };
}

export {
  exportToCsv,
  exportToXlsx,
  importFromCsvFile,
  importFromXlsxFile,
  convertImportedRowsToState
};
