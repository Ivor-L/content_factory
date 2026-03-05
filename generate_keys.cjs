
const jwt = require('jsonwebtoken');

const secret = 'FlCAUGoWkK8UR1eoCoEta98w9VcSy6xxUDIA1ohXFQYFXaenhIgjnA';

const anonPayload = {
  role: 'anon',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10) // 10 years
};

const servicePayload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10) // 10 years
};

console.log('ANON_KEY:');
console.log(jwt.sign(anonPayload, secret));
console.log('\nSERVICE_ROLE_KEY:');
console.log(jwt.sign(servicePayload, secret));
