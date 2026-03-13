const c = {
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  reset: '\x1b[0m',
};
const base = 'http://localhost:8081';
console.log('');
console.log(`${c.green}${c.bold}  Game:${c.reset}   ${c.cyan}${c.bold}${base}${c.reset}`);
console.log(`${c.green}${c.bold}  Level 1:${c.reset} ${c.cyan}${c.bold}${base}?level=1${c.reset}`);
console.log(`${c.green}${c.bold}  Level 2:${c.reset} ${c.cyan}${c.bold}${base}?level=2${c.reset}`);
console.log(`${c.green}${c.bold}  Level 3:${c.reset} ${c.cyan}${c.bold}${base}?level=3${c.reset}`);
console.log('');
