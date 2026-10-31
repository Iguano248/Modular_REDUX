const fs=require('fs');
const s=fs.readFileSync('panel.html','utf8');
console.log((s.match(/forzarLogout|401|sesion.*expir/gi)||[]).length);
