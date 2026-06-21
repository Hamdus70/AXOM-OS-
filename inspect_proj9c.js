// inspect_proj9c.js
import fs from 'fs';
const db = JSON.parse(fs.readFileSync('./projects_db.json', 'utf8'));
const proj = db.find(p => p.id === 'proj-9cmm6era0');
if (proj) {
  const content = proj.chapters.chapter1.content;
  console.log('LENGTH:', content.length);
  // print first 2000 chars
  console.log('START OF CHAPTER 1:');
  console.log(content.substring(0, 3000));
}
