import fs from 'fs';
const raw = fs.readFileSync('static/offline-data/chapters-en/tt_1781224543804_1_jr077.json','utf8');
const lines = raw.split('\n');
const viRe = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
lines.forEach((ln,li)=>{
  if (viRe.test(ln)) {
    const m = ln.match(/[A-Za-zÀ-ỹđĐ ,;:'"().!?-]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ][A-Za-zÀ-ỹđĐ ,;:'"().!?-]*/g);
    console.log('line', li+1, '::', (m||[]).join(' || ').slice(0,300));
  }
});
