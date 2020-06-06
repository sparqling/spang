const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;
const chai = require('chai');
const assert = chai.assert;
chai.use(require('chai-fs'));

describe('test', () => {
  const dir = 'test';
  fs.readdirSync(dir).forEach(file => {
    testFile(dir, file);
  });
});

function testFile(dir, file) {
  if (file.endsWith('.sh')) {
    const basename = path.basename(file, '.sh');
    it(file, () => {
      const result = execSync(`cd ${dir}; ./${basename}.sh`).toString();
      const expect = fs.readFileSync(`${dir}/${basename}.txt`).toString();
      assert.equal(result, expect);
    });
  }
}
