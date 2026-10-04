import fs from 'node:fs';

// Scripts run outside Next.js, so load .env ourselves when it exists.
if (fs.existsSync('.env')) process.loadEnvFile('.env');
