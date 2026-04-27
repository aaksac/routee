function buildExportRows(startPoint, points, endPoint = null) {
  const rows = [];

  if (startPoint) {
    rows.push({
      type: "start",
      name: startPoint.name || "",
      lat: Number(startPoint.lat),
      lng: Number(startPoint.lng),
      note: startPoint.note || ""
    });
  }

  points.forEach((point) => {
    rows.push({
      type: "point",
      name: point.name || "",
      lat: Number(point.lat),
      lng: Number(point.lng),
      note: point.note || ""
    });
  });

  if (endPoint) {
    rows.push({
      type: "end",
      name: endPoint.name || "",
      lat: Number(endPoint.lat),
      lng: Number(endPoint.lng),
      note: endPoint.note || ""
    });
  }

  return rows;
}

function exportToCsv(filename, startPoint, points, endPoint = null) {
  const rows = buildExportRows(startPoint, points, endPoint);
  const headers = ["type", "name", "lat", "lng", "note"];
  const delimiter = ",";

  const csvLines = [
    headers.join(delimiter),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.type, delimiter),
        escapeCsvValue(row.name, delimiter),
        escapeCsvValue(row.lat, delimiter),
        escapeCsvValue(row.lng, delimiter),
        escapeCsvValue(row.note, delimiter)
      ].join(delimiter)
    )
  ];

  const bom = "\uFEFF";
  const csvContent = `${bom}${csvLines.join("\r\n")}`;
  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;"
  });

  downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

function escapeCsvValue(value, delimiter = ",") {
  const str = sanitizeCsvCell(value);

  if (str.includes(delimiter) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
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

function exportToXlsx(filename, startPoint, points, endPoint = null) {
  const rows = buildExportRows(startPoint, points, endPoint);
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
  const normalizedText = String(csvText || "").replace(/^\uFEFF/, "").trim();

  if (!normalizedText) return [];

  const delimiter = detectCsvDelimiter(normalizedText);
  const lines = splitCsvRecords(normalizedText);

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0], delimiter).map((header) =>
    normalizeHeader(header)
  );

  return lines
    .slice(1)
    .map((line) => {
      const values = splitCsvLine(line, delimiter);
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] = values[index] ?? "";
      });

      return normalizeImportedRow(obj);
    })
    .filter(Boolean);
}

function splitCsvRecords(text) {
  const records = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '""';
        i += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      current += char;
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (current.trim()) {
        records.push(current);
      }

      current = "";

      if (char === "\r" && next === "\n") {
        i += 1;
      }

      continue;
    }

    current += char;
  }

  if (current.trim()) {
    records.push(current);
  }

  return records;
}

function detectCsvDelimiter(text) {
  const firstLine = splitCsvRecords(text)[0] || "";
  const commaCount = countDelimiterOutsideQuotes(firstLine, ",");
  const semicolonCount = countDelimiterOutsideQuotes(firstLine, ";");
  const tabCount = countDelimiterOutsideQuotes(firstLine, "\t");

  if (tabCount > commaCount && tabCount > semicolonCount) {
    return "\t";
  }

  return semicolonCount > commaCount ? ";" : ",";
}

function countDelimiterOutsideQuotes(line, delimiter) {
  let count = 0;
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      count += 1;
    }
  }

  return count;
}

function splitCsvLine(line, delimiter = ",") {
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

    if (char === delimiter && !insideQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);

  return result.map((value) => value.trim());
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "");
}

function getRowValue(row, keys) {
  for (const key of keys) {
    if (
      row[key] !== undefined &&
      row[key] !== null &&
      String(row[key]).trim() !== ""
    ) {
      return row[key];
    }
  }

  return "";
}

function normalizeImportedType(value) {
  const normalized = toAsciiLower(value);

  if (["start", "baslangic", "baslangicnoktasi", "startingpoint"].includes(normalized)) {
    return "start";
  }

  if (["point", "konum", "nokta", "location", "place"].includes(normalized)) {
    return "point";
  }

  if (
    [
      "end",
      "endpoint",
      "end_point",
      "bitis",
      "bitisnoktasi",
      "finish",
      "destination",
      "varis",
      "varisnoktasi"
    ].includes(normalized)
  ) {
    return "end";
  }

  return normalized;
}

function toAsciiLower(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[İ]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[_\-\s]+/g, "");
}

function parseCoordinateValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  const normalized = String(value ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");

  const number = Number(normalized);

  return Number.isFinite(number) ? number : NaN;
}

function repairCommonMojibake(text) {
  let repaired = String(text ?? "");

  const replacements = [
    ["Ã§", "ç"],
    ["Ã‡", "Ç"],
    ["ÄŸ", "ğ"],
    ["Äž", "Ğ"],
    ["Ã¼", "ü"],
    ["Ãœ", "Ü"],
    ["ÅŸ", "ş"],
    ["Åž", "Ş"],
    ["Ä±", "ı"],
    ["Ä°", "İ"],
    ["Ã¶", "ö"],
    ["Ã–", "Ö"],
    ["â€™", "'"],
    ["â€œ", '"'],
    ["â€", '"'],
    ["â€“", "-"],
    ["â€”", "-"]
  ];

  replacements.forEach(([wrong, correct]) => {
    repaired = repaired.split(wrong).join(correct);
  });

  return repaired;
}

function cleanImportedText(value) {
  return repairCommonMojibake(String(value ?? "").trim());
}

function normalizeImportedRow(row) {
  const typeValue = getRowValue(row, ["type", "tur", "tür", "türü", "turu"]);
  const nameValue = getRowValue(row, ["name", "ad", "isim", "yeradi", "yeradı", "placename"]);
  const latValue = getRowValue(row, ["lat", "latitude", "enlem"]);
  const lngValue = getRowValue(row, ["lng", "lon", "long", "longitude", "boylam"]);
  const noteValue = getRowValue(row, [
    "note",
    "notes",
    "not",
    "notlar",
    "aciklama",
    "açıklama",
    "description",
    "memo"
  ]);

  return {
    type: normalizeImportedType(typeValue),
    name: cleanImportedText(nameValue),
    lat: parseCoordinateValue(latValue),
    lng: parseCoordinateValue(lngValue),
    note: cleanImportedText(noteValue)
  };
}

function validateImportedRows(rows) {
  return rows.filter(
    (row) =>
      (row.type === "start" || row.type === "point" || row.type === "end") &&
      row.name &&
      Number.isFinite(row.lat) &&
      Number.isFinite(row.lng)
  );
}

function countReplacementChars(text) {
  return (String(text).match(/�/g) || []).length;
}

function countTurkishChars(text) {
  return (String(text).match(/[çÇğĞıİöÖşŞüÜ]/g) || []).length;
}

function scoreDecodedText(text, parsedRows) {
  const replacementCount = countReplacementChars(text);
  const turkishCharCount = countTurkishChars(text);

  let rowNameScore = 0;

  parsedRows.forEach((row) => {
    rowNameScore += countTurkishChars(row.name);

    if (row.name.includes("�")) {
      rowNameScore -= 5;
    }
  });

  return (
    parsedRows.length * 100 +
    turkishCharCount * 2 +
    rowNameScore * 5 -
    replacementCount * 50
  );
}

function decodeWithEncoding(bytes, encoding) {
  const decoder = new TextDecoder(encoding, { fatal: false });
  return decoder.decode(bytes);
}

async function decodeCsvFile(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const encodings = ["utf-8", "windows-1254", "iso-8859-9"];
  const candidates = [];

  for (const encoding of encodings) {
    try {
      const text = decodeWithEncoding(bytes, encoding);
      const parsedRows = validateImportedRows(parseCsvText(text));
      const score = scoreDecodedText(text, parsedRows);

      candidates.push({
        encoding,
        text,
        parsedRows,
        score
      });
    } catch (error) {
      // Sonraki encoding denenecek.
    }
  }

  if (!candidates.length) {
    const fallbackText = await file.text();
    return validateImportedRows(parseCsvText(fallbackText));
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0].parsedRows;
}

async function importFromCsvFile(file) {
  return decodeCsvFile(file);
}

async function importFromXlsxFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  const parsed = jsonRows.map((row) => {
    const normalizedRow = {};

    Object.keys(row).forEach((key) => {
      normalizedRow[normalizeHeader(key)] = row[key];
    });

    return normalizeImportedRow(normalizedRow);
  });

  return validateImportedRows(parsed);
}

function convertImportedRowsToState(rows) {
  const startRow = rows.find((row) => row.type === "start") || null;
  const endRow = rows.find((row) => row.type === "end") || null;
  const pointRows = rows.filter((row) => row.type === "point");

  const startPoint = startRow
    ? {
        id: "start-point",
        name: startRow.name,
        lat: Number(startRow.lat),
        lng: Number(startRow.lng),
        note: startRow.note || "",
        type: "start"
      }
    : null;

  const endPoint = endRow
    ? {
        id: "end-point",
        name: endRow.name,
        lat: Number(endRow.lat),
        lng: Number(endRow.lng),
        note: endRow.note || "",
        type: "end"
      }
    : null;

  const points = pointRows.map((row) => ({
    id: Date.now() + Math.random(),
    name: row.name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    note: row.note || "",
    distanceFromPrevious: 0,
    type: "point"
  }));

  return {
    startPoint,
    points,
    endPoint
  };
}

export {
  exportToCsv,
  exportToXlsx,
  importFromCsvFile,
  importFromXlsxFile,
  convertImportedRowsToState
};
