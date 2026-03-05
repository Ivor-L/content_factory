
const jwt = require('jsonwebtoken');

const secret = 'FlCAUGoWkK8UR1eoCoEta98w9VcSy6xxUDIA1ohXFQYFXaenhIgjnA';
const payload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10) // 10 years
};

const token = jwt.sign(payload, secret);
console.log('Generated Service Role Key:');
console.log(token);
