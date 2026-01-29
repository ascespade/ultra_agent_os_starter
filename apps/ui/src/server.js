const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT;
const API_URL = process.env.API_URL || 'http://api:3000';

// Serve static files with API URL injection
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
