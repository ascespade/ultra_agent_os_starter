
const express = require('express');
const app = express();
app.use(express.static(__dirname));
app.listen(8088, ()=>console.log('UI on 8088'));
