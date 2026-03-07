const jwt = require('jsonwebtoken');

const JWT_SECRET = 'xmQJEe3eRgWFmnxKZ5v98QUqvjzw93eLykMdY97_xgY';

const anonPayload = {
  role: 'anon',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 years
};

const servicePayload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60) // 10 years
};

const anonKey = jwt.sign(anonPayload, JWT_SECRET);
const serviceKey = jwt.sign(servicePayload, JWT_SECRET);

console.log('ANON_KEY=' + anonKey);
console.log('SERVICE_ROLE_KEY=' + serviceKey);
