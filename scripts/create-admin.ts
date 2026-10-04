/** npm run admin:create -- email@example.com "Password" "Name" — creates an admin or resets its password. */
import './env';
import { hashPassword } from '../src/lib/auth';
import { db, schema } from '../src/lib/db';

const [email, password, name = 'Admin'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage: npm run admin:create -- <email> <password (8+ chars)> [name]');
  process.exit(1);
}
const passwordHash = await hashPassword(password);
db.insert(schema.users)
  .values({ email: email.toLowerCase(), name, passwordHash })
  .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash, name, updatedAt: new Date() } })
  .run();
console.log(`Admin ready: ${email.toLowerCase()}`);
