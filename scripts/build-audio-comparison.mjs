import fs from 'node:fs';
import path from 'node:path';

const directory = 'output/media-compression-research';
const results = JSON.parse(fs.readFileSync(path.join(directory, 'audio-results.json')));
const choices = results.map(item => {
  const name = path.basename(item.source, path.extname(item.source));
  return { label: `${name} · ${item.variant}`, a: `audio/${name}-current.wav`,
    b: `audio/${path.basename(item.candidate)}.wav`, source: item.encodeSource, seconds: item.seconds };
});
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>So sánh nén âm thanh Tu tập</title><style>
body{max-width:760px;margin:40px auto;padding:0 20px;background:#faf6ed;color:#352b22;font:17px/1.65 system-ui}h1{line-height:1.25}select,button{font:inherit;padding:10px;border:1px solid #c6aa73;border-radius:10px;background:white;color:inherit}select{width:100%}button{cursor:pointer;margin:6px 4px 6px 0}button:hover{background:#f3e2b8}audio{width:100%;margin:18px 0}.panel{padding:20px;border:1px solid #ddcba8;border-radius:16px;margin:20px 0}small{color:#6c6051}#result{white-space:pre-line}</style>
<h1>Nghe đối chiếu trước khi chọn mức nén</h1>
<p>A là âm thanh trong app hiện tại. B là bản nén thử. Các đoạn đã giải mã thành WAV để trình phát không hé lộ codec và để phát đồng nhất.</p>
<select id="choice" aria-label="Chọn đoạn âm thanh"></select>
<p id="detail"></p><div class="panel">
<button id="a">Nghe A</button><button id="b">Nghe B</button><button id="x">Nghe X ngẫu nhiên</button>
<audio id="player" controls preload="none"></audio>
<p id="status" aria-live="polite">Chọn A, B để làm quen, rồi nghe X và đoán.</p>
<button id="guessA">X giống A</button><button id="guessB">X giống B</button><button id="reset">Bắt đầu lại</button>
<p id="result"></p></div>
<p>Dùng tai nghe và âm lượng thường nghe. Chú ý tiếng ngân, âm cao, tiếng mưa và độ rộng stereo. Mỗi lượt X dùng cùng một đoạn; có thể nghe lại A/B/X bao nhiêu lần tùy ý. Kết quả chỉ hiện sau 16 lượt để hạn chế đoán theo phản hồi.</p>
<small>Không phân biệt được trong một lượt thử chưa chứng minh hai bản tương đương với mọi người nghe. Đây là công cụ đối chiếu, chưa phải chứng nhận chất lượng. Các file thử không thay thế tài nguyên app.</small>
<script>
const choices=${JSON.stringify(choices).replaceAll('<', '\\u003c')};
const select=document.getElementById('choice'),player=document.getElementById('player'),status=document.getElementById('status'),result=document.getElementById('result');
for(const [i,c] of choices.entries()){const o=document.createElement('option');o.value=i;o.textContent=c.label;select.append(o)}
let secret=0,answers=[],heardX=false;
function newX(){secret=crypto.getRandomValues(new Uint8Array(1))[0]%2;heardX=false}
function reset(){answers=[];result.textContent='';newX();player.pause();player.removeAttribute('src');status.textContent='Lượt 1/16. Nghe X trước khi đoán.';const c=choices[select.value];document.getElementById('detail').textContent='Đoạn '+c.seconds.toFixed(1)+' giây. Nguồn mã hóa thử: '+c.source}
async function play(which){const c=choices[select.value];player.src=which==='A'?c.a:which==='B'?c.b:secret===0?c.a:c.b;player.currentTime=0;if(which==='X')heardX=true;try{await player.play();status.textContent='Đang nghe '+which+' · lượt '+(answers.length+1)+'/16'}catch(e){status.textContent='Trình duyệt chưa phát được. Bấm nút Play trên thanh âm thanh.'}}
function guess(value){if(answers.length>=16)return;if(!heardX){status.textContent='Hãy nghe X trước khi đoán.';return}answers.push(value===secret);if(answers.length===16){player.pause();const correct=answers.filter(Boolean).length;result.textContent='Kết quả: '+correct+'/16 lượt đúng.\n'+(correct>=12?'Kết quả cho thấy có thể phân biệt hai bản trong lượt thử này.':'Chưa có bằng chứng đủ mạnh để kết luận phân biệt được trong lượt thử này; chưa chứng minh hai bản tương đương.');status.textContent='Đã xong 16 lượt.';return}newX();status.textContent='Đã ghi nhận. Lượt '+(answers.length+1)+'/16.'}
document.getElementById('a').onclick=()=>play('A');document.getElementById('b').onclick=()=>play('B');document.getElementById('x').onclick=()=>play('X');document.getElementById('guessA').onclick=()=>guess(0);document.getElementById('guessB').onclick=()=>guess(1);document.getElementById('reset').onclick=reset;select.onchange=reset;reset();
</script></html>`;
fs.writeFileSync(path.join(directory, 'compare-audio.html'), html);
console.log(`Created ${directory}/compare-audio.html with ${choices.length} comparisons.`);
