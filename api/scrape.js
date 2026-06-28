/**
 * Vercel Serverless Function — scraping API endpoint.
 * מריץ קריאות API ישירות לבנקים/אשראי (בלי Puppeteer).
 *
 * POST /api/scrape
 * Body: { providerId, credentials: { username, password }, startDate, endDate? }
 * Returns: { success, accounts: [...] } or { success: false, error }
 */

export default async function handler(req, res) {
  // רק POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { providerId, credentials, startDate, endDate } = req.body;

  if (!providerId || !credentials?.username || !credentials?.password) {
    return res.status(400).json({ success: false, error: 'Missing required fields: providerId, credentials' });
  }

  try {
    const scraper = getScraper(providerId);
    if (!scraper) {
      return res.status(400).json({ success: false, error: `Unknown provider: ${providerId}` });
    }

    const accounts = await scraper(credentials, { startDate, endDate });

    return res.status(200).json({
      success: true,
      providerId,
      scrapeDate: new Date().toISOString(),
      accounts,
    });
  } catch (err) {
    console.error(`[scrape] Error for ${providerId}:`, err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Scraping failed',
    });
  }
}

// --- Scrapers ---

function getScraper(providerId) {
  const scrapers = {
    'visa-cal': scrapeVisaCal,
    'max': scrapeMax,
    'isracard': scrapeIsracard,
    'leumi': scrapeLeumi,
    'hapoalim': scrapeHapoalim,
  };
  return scrapers[providerId] || null;
}

// --- Visa Cal ---
async function scrapeVisaCal(credentials, options) {
  const { username, password } = credentials;
  const { startDate, endDate } = options;

  const loginRes = await fetch('https://connect.cal-online.co.il/col-rest/calconnect/authentication/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, recaptcha: '' }),
  });

  if (!loginRes.ok) throw new Error(`Cal login failed: ${loginRes.status}`);
  const loginData = await loginRes.json();
  const token = loginData?.token;
  if (!token) throw new Error('Cal login failed: no token');

  const end = endDate || new Date().toISOString().slice(0, 10);
  const txnRes = await fetch('https://api.cal-online.co.il/Transactions/api/transactionsDetails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `CALAuthScheme ${token}`,
    },
    body: JSON.stringify({
      dateFrom: startDate,
      dateTo: end,
      isShowDebitTransactions: true,
      isShowInstallments: true,
      isShowRefunds: true,
    }),
  });

  if (!txnRes.ok) throw new Error(`Cal transactions failed: ${txnRes.status}`);
  const txnData = await txnRes.json();
  const transactions = txnData?.result?.transactions || [];

  return [{
    success: true,
    accountNumber: txnData?.result?.cardNumberLastDigits || '',
    txns: transactions.map(tx => ({
      date: tx.transactionDate || tx.date,
      processedDate: tx.paymentDate,
      chargedAmount: tx.amountForDisplay || tx.currentPaymentAmount || 0,
      originalAmount: tx.originalAmount,
      originalCurrency: tx.originalCurrency || 'ILS',
      description: tx.merchantName || tx.description || '',
      memo: tx.comments || '',
      status: 'completed',
      type: tx.planName ? 'installments' : 'normal',
      identifier: tx.id || tx.transactionId || '',
    })),
  }];
}

// --- Max ---
async function scrapeMax(credentials, options) {
  const { username, password } = credentials;
  const { startDate, endDate } = options;

  const loginRes = await fetch('https://online.max.co.il/api/login/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: username, password, recaptcha: '' }),
  });

  if (!loginRes.ok) throw new Error(`Max login failed: ${loginRes.status}`);
  const cookies = loginRes.headers.get('set-cookie') || '';

  const end = endDate || new Date().toISOString().slice(0, 10);
  const txnRes = await fetch('https://online.max.co.il/api/registered/transactionDetails/getTransactionsAndGraphs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
    body: JSON.stringify({ filterData: { dateFrom: startDate, dateTo: end } }),
  });

  if (!txnRes.ok) throw new Error(`Max transactions failed: ${txnRes.status}`);
  const data = await txnRes.json();
  const cards = data?.result?.cards || [];

  return cards.map(card => ({
    success: true,
    accountNumber: card.cardNumber?.slice(-4) || '',
    txns: (card.txns || []).map(tx => ({
      date: tx.purchaseDate || tx.date,
      processedDate: tx.paymentDate,
      chargedAmount: tx.actualPaymentAmount || tx.originalAmount || 0,
      originalAmount: tx.originalAmount,
      originalCurrency: tx.originalCurrency || 'ILS',
      description: tx.merchantName || '',
      memo: tx.comments || '',
      status: 'completed',
      type: tx.planName ? 'installments' : 'normal',
      identifier: tx.id || '',
    })),
  }));
}

// --- Isracard ---
async function scrapeIsracard(credentials, options) {
  const { username, password } = credentials;
  const { startDate, endDate } = options;

  const loginRes = await fetch('https://digital.isracard.co.il/services/ProxyRequestHandler.ashx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      reqName: 'performLogonI',
      id: username,
      password,
      countryCode: '212',
      idType: '1',
      checkLevel: '1',
      companyCode: '11',
    }),
  });

  if (!loginRes.ok) throw new Error(`Isracard login failed: ${loginRes.status}`);

  const end = endDate || new Date().toISOString().slice(0, 10);
  const txnRes = await fetch('https://digital.isracard.co.il/services/ProxyRequestHandler.ashx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      reqName: 'CardsTransactionsList',
      startDate: startDate.replace(/-/g, ''),
      endDate: end.replace(/-/g, ''),
    }),
  });

  if (!txnRes.ok) throw new Error(`Isracard transactions failed: ${txnRes.status}`);
  const data = await txnRes.json();
  const cards = data?.CardsTransactionsListBean?.cardNumberList || [];

  return cards.map(card => ({
    success: true,
    accountNumber: card.cardNumberTail || '',
    txns: (card.txnList || []).map(tx => ({
      date: tx.fullPurchaseDate || tx.purchaseDate,
      processedDate: tx.fullPaymentDate,
      chargedAmount: tx.paymentSum || tx.dealSum || 0,
      originalAmount: tx.dealSum,
      originalCurrency: tx.currencyId === '1' ? 'ILS' : (tx.currencyId || 'ILS'),
      description: tx.merchantName || tx.dealDescription || '',
      memo: tx.comments || '',
      status: 'completed',
      type: tx.planTypeId > 0 ? 'installments' : 'normal',
      identifier: tx.id || '',
    })),
  }));
}

// --- Leumi ---
async function scrapeLeumi(credentials, options) {
  const { username, password } = credentials;
  const { startDate, endDate } = options;

  const loginRes = await fetch('https://hb2.bankleumi.co.il/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: username, password }),
  });

  if (!loginRes.ok) throw new Error(`Leumi login failed: ${loginRes.status}`);
  const loginData = await loginRes.json();

  const end = endDate || new Date().toISOString().slice(0, 10);
  const txnRes = await fetch('https://hb2.bankleumi.co.il/ServerServices/general/accounts/transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.token || ''}`,
    },
    body: JSON.stringify({ startDate, endDate: end }),
  });

  if (!txnRes.ok) throw new Error(`Leumi transactions failed: ${txnRes.status}`);
  const data = await txnRes.json();
  const transactions = data?.transactions || [];

  return [{
    success: true,
    accountNumber: data?.accountNumber || '',
    txns: transactions.map(tx => ({
      date: tx.transactionDate || tx.date,
      processedDate: tx.valueDate,
      chargedAmount: tx.amount || tx.eventAmount || 0,
      description: tx.description || tx.activityDescription || '',
      memo: tx.referenceNumber || '',
      status: 'completed',
      type: 'normal',
      identifier: tx.referenceNumber || tx.id || '',
    })),
  }];
}

// --- Hapoalim ---
async function scrapeHapoalim(credentials, options) {
  const { username, password } = credentials;
  const { startDate, endDate } = options;

  const loginRes = await fetch('https://login.bankhapoalim.co.il/ng-portals/auth/api/loginMass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode: username, password }),
  });

  if (!loginRes.ok) throw new Error(`Hapoalim login failed: ${loginRes.status}`);
  const loginData = await loginRes.json();
  if (loginData.errorCode) throw new Error(`Hapoalim login failed: ${loginData.errorMessage}`);

  const end = endDate || new Date().toISOString().slice(0, 10);
  const txnRes = await fetch('https://login.bankhapoalim.co.il/ServerServices/general/accounts/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      startDate: startDate.replace(/-/g, ''),
      endDate: end.replace(/-/g, ''),
    }),
  });

  if (!txnRes.ok) throw new Error(`Hapoalim transactions failed: ${txnRes.status}`);
  const data = await txnRes.json();
  const transactions = data?.transactions || [];

  return [{
    success: true,
    accountNumber: data?.accountNumber || '',
    txns: transactions.map(tx => ({
      date: tx.eventDate || tx.transactionDate,
      processedDate: tx.valueDate,
      chargedAmount: tx.eventAmount || tx.amount || 0,
      description: tx.activityDescription || tx.beneficiaryDetailsData || '',
      memo: tx.referenceNumber || '',
      status: 'completed',
      type: 'normal',
      identifier: tx.referenceNumber || '',
    })),
  }];
}
