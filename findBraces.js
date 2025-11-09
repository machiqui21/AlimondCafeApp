const fs = require('fs');
const path = require('path');

// Read the file
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');

let braceStack = [];
let braceCount = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Count braces in this line
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '{') {
            braceStack.push({ line: lineNum, col: j + 1, type: 'open' });
            braceCount++;
        } else if (char === '}') {
            if (braceStack.length > 0) {
                braceStack.pop();
            } else {
                console.log(`Extra closing brace at line ${lineNum}, col ${j + 1}`);
            }
            braceCount--;
        }
    }
}

console.log(`Total brace balance: ${braceCount}`);
console.log(`Unmatched opening braces: ${braceStack.length}`);

if (braceStack.length > 0) {
    console.log('\nUnmatched opening braces:');
    braceStack.forEach(brace => {
        console.log(`Line ${brace.line}, col ${brace.col}: ${lines[brace.line - 1].trim()}`);
    });
}