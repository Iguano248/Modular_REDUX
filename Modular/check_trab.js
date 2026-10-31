const fs=require('fs');
const s=fs.readFileSync('trabajador.html','utf8');
const re=/(sesionExpirada|Sesión expirada|sessionToken|401|expirada)/gi;
const m=s.match(re);
console.log(m?m.length:0);
console.log(m?m.slice(0,20):[]);
