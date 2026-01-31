const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT;
const API_URL = process.env.API_URL;

if (!API_URL) {
  console.error('[CRITICAL] API_URL environment variable is required');
  console.error('[CRITICAL] Set API_URL to API service URL');
  process.exit(1);
}

// Serve static files with API URL injection
app.get('/', (req, res) => {
  // Check if admin control plane is requested
  if (req.headers['user-agent']?.includes('admin') || req.query.admin === 'true') {
    res.sendFile(path.join(__dirname, 'index_admin.html'));
  } else {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// Inject API URL as environment variable for frontend
app.get('/env.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.API_URL = '${API_URL}';`);
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`UI server running on ${PORT}`);
  console.log(`API URL: ${API_URL}`);
});
