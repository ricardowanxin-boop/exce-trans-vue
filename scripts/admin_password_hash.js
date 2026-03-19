const crypto = require('crypto');

function hashPasswordPBKDF2(password, saltBase64, iterations) {
  const salt = Buffer.from(saltBase64, 'base64');
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return hash.toString('base64');
}

function createPasswordHash(password, iterations = 120000) {
  const salt = crypto.randomBytes(16);
  const saltBase64 = salt.toString('base64');
  const hashBase64 = hashPasswordPBKDF2(password, saltBase64, iterations);
  return `pbkdf2_sha256$${iterations}$${saltBase64}$${hashBase64}`;
}

const password = process.argv[2];
if (!password) {
  process.stderr.write('Usage: node scripts/admin_password_hash.js <password>\n');
  process.exit(1);
}

process.stdout.write(createPasswordHash(password) + '\n');

