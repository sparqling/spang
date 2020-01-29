fs = require('fs');

var prefixPath = `${__dirname}/../etc/prefix`;
var prefixMap;

readPrefixFile = () => {
  // TODO: error handling
  var contents = fs.readFileSync(prefixPath, 'utf8');
  prefixMap = {};
  contents.split("\n").forEach(line => {
    tokens = line.split(/\s+/);
    if(tokens.length == 3 && tokens[0] == 'PREFIX' &&
       tokens[1].endsWith(':') && tokens[2].startsWith('<') &&
       tokens[2].endsWith('>'))
    {
      prefixMap[tokens[1].substr(0, tokens[1].length - 1)] = line;
    }
  });
}

exports.searchPrefix = (prefixName) => {
  if(fs.existsSync(prefixPath)) {
    if(!prefixMap) readPrefixFile();
    return prefixMap[prefixName];
  }
};
