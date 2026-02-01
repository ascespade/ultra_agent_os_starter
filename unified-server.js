const express = require('express');
const path = require('path');

const app = express();
const PORT = 9000;

// Serve static files
app.use(express.static(__dirname));

// Serve unified dashboard as root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

// API proxy to avoid CORS issues
app.get('/proxy/*', async (req, res) => {
  const targetUrl = `http://localhost:3003${req.path.replace('/proxy', '')}`;
  
  try {
    const response = await fetch(targetUrl);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Unified Dashboard Server running on http://localhost:${PORT}`);
  console.log(`📊 Main Dashboard: http://localhost:${PORT}/`);
  console.log(`🔧 Admin Dashboard: http://localhost:${PORT}/?admin=true`);
});
