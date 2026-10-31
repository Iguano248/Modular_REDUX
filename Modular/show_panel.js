const fs=require('fs');
const s=fs.readFileSync('panel.html','utf8');
const i=s.indexOf('forzarLogout');
if(i>=0){
  const start=Math.max(0,i-120);
  const end=Math.min(s.length,i+120);
  console.log(s.substring(start,end));
} else {
  console.log('NOT FOUND');
}
