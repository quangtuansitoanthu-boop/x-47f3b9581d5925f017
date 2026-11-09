import fs from 'fs';
import path from 'path';

const stepBase = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\bbb0eb0a-cf99-4ab8-aaf3-966ae6df9d48\\.system_generated\\steps';

function inspectFile(stepNum) {
  const p = path.join(stepBase, stepNum, 'content.md');
  const text = fs.readFileSync(p, 'utf8');
  console.log(`=== Step ${stepNum} ===`);
  const postStart = text.indexOf('<div class="td-post-content');
  if (postStart === -1) {
    console.log('No td-post-content found!');
    return;
  }
  const postEnd = text.indexOf('<footer>', postStart);
  console.log(`postStart: ${postStart}, postEnd: ${postEnd}`);
  const postHtml = postEnd > 0 ? text.slice(postStart, postEnd) : text.slice(postStart);
  console.log(`postHtml length: ${postHtml.length}`);
  console.log('Start snippet:', postHtml.slice(0, 500).replace(/\s+/g, ' '));
  console.log('End snippet:', postHtml.slice(-800).replace(/\s+/g, ' '));
}

inspectFile('298');
inspectFile('305');
