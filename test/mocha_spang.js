const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;
const chai = require('chai');
const assert = chai.assert;
chai.use(require('chai-fs'));

describe('test', () => {
  fs.readdirSync('test').forEach(file => {
    testFile(file);
  });
});

function testFile(file) {
  if (file.endsWith('.sh')) {
    const basename = path.basename(file, '.sh');
    it(file, () => {
      const result = execSync(`./test/${basename}.sh`).toString();
      const expect = fs.readFileSync(`./test/${basename}.txt`).toString();
      assert.equal(result, expect);
    });
  }
}
