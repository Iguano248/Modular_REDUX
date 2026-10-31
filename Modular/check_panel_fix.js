const fs=require('fs');
const s=fs.readFileSync('panel.html','utf8');
console.log(s.includes('__sesionExpiradaPanel'));
