module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.status(200).json({
    status: 'ok',
    mode: 'vercel-edge',
    doc_modernization: true,
    libreoffice_available: false,
    message: 'TypeCast Vercel Edge Engine is online'
  });
};
