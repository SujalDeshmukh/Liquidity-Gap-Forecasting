'use strict';
/**
 * Creates / updates the predefined users from SEED_USERS_FILE (PS: "log in with predefined credentials").
 * Credentials live in a git-ignored JSON file, never in code.
 *   cp seed/users.seed.example.json seed/users.seed.json   # then edit passwords
 *   npm run seed:users
 */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { connectDB, disconnectDB } = require('../src/config/db');
const { User } = require('../src/models');

(async () => {
  const file = path.resolve(__dirname, '..', config.seedUsersFile);
  if (!fs.existsSync(file)) {
    console.error(`Seed file not found: ${file}\nCopy seed/users.seed.example.json to seed/users.seed.json first.`);
    process.exit(1);
  }
  const users = JSON.parse(fs.readFileSync(file, 'utf8'));
  await connectDB(config.mongoUri);
  for (const u of users) {
    const passwordHash = await User.hashPassword(u.password);
    await User.findOneAndUpdate(
      { userId: u.userId.toLowerCase() },
      { userId: u.userId.toLowerCase(), name: u.name, role: u.role, location: u.location || null, passwordHash, active: true },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    console.log(`  ✓ ${u.userId} (${u.role}${u.location ? ` · ${u.location}` : ''})`);
  }
  await disconnectDB();
  console.log(`Seeded ${users.length} users.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
