const fs = require('fs');
const expandHomeDir = require('expand-home-dir')

let aliasMap = {};

readAliasDefinition = (contents) => {
  contents.split("\n").forEach(line => {
    tokens = line.split(/\s+/);
    if (tokens.length == 2) {
      aliasMap[tokens[0]] = tokens[1];
    } else if (tokens.length > 0 && tokens[0] != '') {
      console.error(`warning: alias file contains invalid line "${line}"`);
    }
  });
}

exports.setAliasFiles = (filePaths) => {
  filePaths.forEach(filePath => {
    filePath = expandHomeDir(filePath);
    if (fs.existsSync(filePath)) {
      readAliasDefinition(fs.readFileSync(filePath, 'utf8'));
    }
  });
}

exports.replaceIfAny = (text) => {
  if(text in aliasMap)
    text = aliasMap[text];
  return text;
}

exports.aliasMap = aliasMap;
