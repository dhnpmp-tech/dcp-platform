'use strict';

const https = require('https');

const MOYASAR_BASE = 'https://api.moyasar.com/v1';

function getMoyasarSecret() {
  return process.env.MOYASAR_SECRET_KEY || '';
}

function moyasarRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const secret = getMoyasarSecret();
    if (!secret) {
      return reject(new Error('MOYASAR_SECRET_KEY not configured'));
    }

    const bodyStr = body ? JSON.stringify(body) : null;
    const auth = Buffer.from(`${secret}:`).toString('base64');
    const url = new URL(MOYASAR_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = {};
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (_) {
          return reject(new Error(`Invalid Moyasar response: ${data.slice(0, 200)}`));
        }
        if (res.statusCode >= 400) {
          const err = new Error(parsed.message || parsed.type || 'Moyasar API error');
          err.statusCode = res.statusCode;
          err.moyasarError = parsed;
          return reject(err);
        }
        return resolve(parsed);
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function refundPayment({ paymentId, amountHalala }) {
  if (!paymentId || typeof paymentId !== 'string') {
    return Promise.reject(new Error('paymentId is required'));
  }
  if (!Number.isInteger(amountHalala) || amountHalala <= 0) {
    return Promise.reject(new Error('amountHalala must be a positive integer'));
  }
  return moyasarRequest('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, {
    amount: amountHalala,
  });
}

module.exports = {
  refundPayment,
  _moyasarRequest: moyasarRequest,
};
