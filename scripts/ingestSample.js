'use strict';
/**
 * Loads the provided synthetic files straight into MongoDB without going through the UI.
 * Usage: npm run ingest:sample -- ../sample-data
 * Expects file names containing asset_book, liability_book, historical_log.
 */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { connectDB, disconnectDB } = require('../src/config/db');
const { ingest } = require('../src/services/ingestion.service');

const MAP = [
  [/asset_book/i, 'ASSET'],
  [/liability_book/i, 'LIABILITY'],
  [/historical_log/i, 'HISTORICAL'],
];

(async () => {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'sample-data'));
  const files = fs.readdirSync(dir).filter((f) => /\.(xlsx|xls|csv)$/i.test(f));
  await connectDB(config.mongoUri);
  for (const [re, dataset] of MAP) {
    const f = files.find((x) => re.test(x));
    if (!f) { console.warn(`  - no file for ${dataset} in ${dir}`); continue; }
    const buffer = fs.readFileSync(path.join(dir, f));
    const r = await ingest({ dataset, buffer, fileName: f, fileSize: buffer.length, uploadedBy: 'script' });
    console.log(`  ${dataset.padEnd(10)} ${f}: ${r.acceptedRows} accepted, ${r.rejectedRows} rejected (as-of ${r.asOfDate.toISOString().slice(0, 10)})`);
    r.rowErrorPreview.slice(0, 10).forEach((e) => console.log(`      row ${e.row} ${e.transactionId || ''}: ${e.message} [${e.value}]`));
  }
  await disconnectDB();
  console.log('Done. Trigger predictions from the UI (Data Management) or POST /api/predictions/run.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
