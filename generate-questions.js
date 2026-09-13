/* Run with `node generate-questions.js` after replacing the source CSV. */
const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "無人機學科測驗題庫 (1).csv");
const outputPath = path.join(__dirname, "questions.js");

function normalizeQuestionText(value) {
  return value
    .trim()
    .replace(/[\s\u3000]+/g, " ")
    // PDF/CSV line wrapping inserted spaces throughout Chinese sentences. Keep a
    // space only when both neighbouring characters are ASCII letters or digits,
    // such as "40 kts" or "Inertial Navigation System".
    .replace(/([^A-Za-z0-9]) +(?=.)/g, "$1")
    .replace(/([A-Za-z0-9]) +(?=[^A-Za-z0-9])/g, "$1")
    .replace(/\bPA VE\b/g, "PAVE");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

const raw = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(raw);
const headers = rows.shift();
const expectedHeaders = ["章節", "題號", "題目", "選項(A)", "選項(B)", "選項(C)", "選項(D)", "正確答案"];

if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`CSV 欄位不符，實際欄位：${headers.join("、")}`);
}

const questions = rows.filter((row) => row.some(Boolean)).map((row, index) => {
  if (row.length !== expectedHeaders.length) {
    throw new Error(`CSV 第 ${index + 2} 列欄位數量不正確：${row.length}`);
  }
  const [chapter, number, rawText, rawOptionA, rawOptionB, rawOptionC, rawOptionD, answer] = row.map((value) => value.trim());
  const text = normalizeQuestionText(rawText);
  const optionA = normalizeQuestionText(rawOptionA);
  const optionB = normalizeQuestionText(rawOptionB);
  const optionC = normalizeQuestionText(rawOptionC);
  const optionD = normalizeQuestionText(rawOptionD);
  if (!chapter || !number || !text || !optionA || !optionB || !optionC || !optionD || !/[ABCD]/.test(answer)) {
    throw new Error(`CSV 第 ${index + 2} 列含有空白或無效答案。`);
  }
  return {
    id: `${chapter}::${number}`,
    chapter,
    number,
    text,
    options: { A: optionA, B: optionB, C: optionC, D: optionD },
    answer
  };
});

const ids = new Set(questions.map((question) => question.id));
if (ids.size !== questions.length) throw new Error("題庫包含重複的章節＋題號。");

fs.writeFileSync(outputPath, `window.QUESTION_BANK = ${JSON.stringify(questions, null, 2)};\n`, "utf8");
console.log(`已產生 ${questions.length} 題：${outputPath}`);
