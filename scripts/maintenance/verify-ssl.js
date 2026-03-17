
import https from 'https';

const options = {
  hostname: 'api.supabase.atomx.top',
  port: 443,
  path: '/',
  method: 'GET'
};

const req = https.request(options, (res) => {
  console.log('✅ SSL Connection Successful!');
  console.log('StatusCode:', res.statusCode);
  console.log('Certificate is valid and trusted.');
});

req.on('error', (e) => {
  console.error('❌ SSL Connection Failed!');
  console.error('Error Code:', e.code);
  console.error('Error Message:', e.message);
  if (e.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
      console.log('\nDiagnosis: The certificate hostname still does not match api.supabase.atomx.top');
  } else if (e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      console.log('\nDiagnosis: The certificate chain is incomplete or the CA is not trusted.');
  }
});

req.end();
