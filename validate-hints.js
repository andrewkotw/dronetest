/* Validate generated hint completeness, shape, length, and obvious answer leakage. */
const fs = require("fs");
const vm = require("vm");

function loadWindowValue(filePath, propertyName) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), sandbox, { filename: filePath });
  return sandbox.window[propertyName];
}

const questions = loadWindowValue("questions.js", "QUESTION_BANK");
const hints = loadWindowValue("hints.js", "QUESTION_HINTS");
const errors = [];
const warnings = [];
const questionIds = new Set(questions.map((question) => question.id));
const calculationQuestionIds = new Set([
  "第二章 基礎飛行原理::231",
  "第二章 基礎飛行原理::232",
  "第三章 氣象::125",
  "第三章 氣象::126",
  "第四章 緊急處置與飛行決策::76"
]);

for (const question of questions) {
  const hint = hints[question.id];
  if (!hint) {
    errors.push(`Missing: ${question.id}`);
    continue;
  }
  for (const [field, maximum] of [["hint1", 55], ["hint2", 55], ["explanation", 100]]) {
    if (typeof hint[field] !== "string" || !hint[field].trim()) {
      errors.push(`${question.id}: ${field} is empty`);
    } else if ([...hint[field]].length > maximum) {
      errors.push(`${question.id}: ${field} has ${[...hint[field]].length} characters (maximum ${maximum})`);
    }
  }
  if (hint.promptVersion !== 2 || hint.model !== "gpt-5.6-luna") {
    errors.push(`${question.id}: invalid generation metadata`);
  }
  if (calculationQuestionIds.has(question.id) && hint.calculationPromptVersion !== 1) {
    errors.push(`${question.id}: calculation hint is outdated`);
  }
  if (calculationQuestionIds.has(question.id) && !/[=＝]/.test(hint.hint1)) {
    errors.push(`${question.id}: first calculation hint does not contain a formula`);
  }
  if (calculationQuestionIds.has(question.id) && (!/\d/.test(hint.hint2) || !/[=＝為×÷／]/.test(hint.hint2))) {
    errors.push(`${question.id}: second calculation hint does not contain a substituted expression`);
  }

  const combinedHints = `${hint.hint1} ${hint.hint2}`;
  const correctOption = question.options[question.answer];
  if ([...correctOption].length >= 6 && combinedHints.includes(correctOption)) {
    warnings.push(`${question.id}: hint contains the complete correct option: ${correctOption}`);
  }
  if (/(?:\u7b54\u6848|\u61c9\u9078|\u6b63\u78ba\u9078\u9805|\u9078\u9805)\s*[\uff08(]?[A-D][\uff09)]?/i.test(combinedHints)) {
    warnings.push(`${question.id}: hint may identify an option letter`);
  }
  if (/(?:\u7b54\u6848|\u6b63\u78ba\u9078\u9805|\u9078\u9805)\s*(?:\u70ba|\u662f)?\s*[\uff08(]?[A-D][\uff09)]?/i.test(hint.explanation)) {
    errors.push(`${question.id}: explanation identifies an option letter that may be shuffled`);
  }
}

for (const id of Object.keys(hints)) {
  if (!questionIds.has(id)) errors.push(`Unknown question ID: ${id}`);
}

const fingerprints = new Map();
for (const [id, hint] of Object.entries(hints)) {
  const fingerprint = `${hint.hint1}|${hint.hint2}`;
  if (fingerprints.has(fingerprint)) warnings.push(`${id}: duplicates ${fingerprints.get(fingerprint)}`);
  else fingerprints.set(fingerprint, id);
}

console.log(`Questions: ${questions.length}`);
console.log(`Hints: ${Object.keys(hints).length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
if (errors.length) console.log(`\nErrors\n${errors.join("\n")}`);
if (warnings.length) console.log(`\nWarnings\n${warnings.join("\n")}`);
process.exitCode = errors.length ? 1 : 0;
