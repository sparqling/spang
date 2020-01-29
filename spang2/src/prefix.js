parser = require('./parser.js');
fs = require('fs');

var traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this,[i,o[i]]);  
    if (o[i] !== null && typeof(o[i])=="object") {
      traverse(o[i], fn);
    }
  }
}

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

exports.retrievePrefixes = (sparql) => {
  var parsedQuery = new parser.parse(sparql);
  prefixes = [];
  traverse(parsedQuery, (key, value) => {
    if(value && value.token == 'uri' && value.prefix) {
      prefixes.push(value.prefix);
    }
  });
  return prefixes;
};
