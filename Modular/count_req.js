const fs=require('fs');
const s=fs.readFileSync('server.js','utf8');
console.log((s.match(/requireAuth/g)||[]).length);
