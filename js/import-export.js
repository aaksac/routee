function buildExportRows(startPoint, points) {
  const rows = [];

  if (startPoint) {
    rows.push({
      type: "start",
      name: startPoint.name || "",
      lat: Number(startPoint.lat),
      lng: Number(startPoint.lng)
    });
  }

  points.forEach((point) => {
    rows.push({
      type: "point",
      name: point.name || "",
      lat: Number(point.lat),
      lng: Number(point.lng)
    });
  });

  return rows;
}

function exportToCsv(filename, startPoint, points) {
  const rows = buildExportRows(startPoint, points);
  const headers = ["type", "name", "lat", "lng"];

  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.type),
        escapeCsvValue(row.name),
        escapeCsvValue(row.lat),
        escapeCsvValue(row.lng)
      ].join(",")
    )
  ];

  const blob = new Blob([csvLines.join("\n")], {
    type: "text/csv;charset=utf-8;"
  });

  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

function escapeCsvValue(value) {
  const str = sanitizeCsvCell(value);

  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function sanitizeCsvCell(value) {
  const str = String(value ?? "");

  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }

  return str;
}

function exportToXlsx(filename, startPoint, points) {
  const rows = buildExportRows(startPoint, points);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "GeziListesi");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsvText(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] ?? "";
    });

    return normalizeImportedRow(obj);
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
      continue;
    }

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
      Number.isFinite(row.lng)
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
    id: Date.now() + Math.random(),
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
