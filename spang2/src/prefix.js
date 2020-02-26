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
var urlToPrefix;
var orderedPrefixURLs;

readPrefixFile = () => {
  // TODO: error handling
  var contents = fs.readFileSync(prefixPath, 'utf8');
  prefixMap = {};
  urlToPrefix = {};
  contents.split("\n").forEach(line => {
    tokens = line.split(/\s+/);
    if(tokens.length == 3 && tokens[0] == 'PREFIX' &&
       tokens[1].endsWith(':') && tokens[2].startsWith('<') &&
       tokens[2].endsWith('>'))
    {
      const prefixName = tokens[1].substr(0, tokens[1].length - 1);
      prefixMap[prefixName] = line;
      urlToPrefix[tokens[2].substring(1, tokens[2].length - 2)] = prefixName;
    }
  });
}

getPrefixMap = () => {
  if(prefixMap || fs.existsSync(prefixPath)) {
    if(!prefixMap) readPrefixFile();
    return prefixMap;
  }
  return {};
}

searchPrefixByURL = (url) => {
  getPrefixMap(); // prepare ulrToPrefix
  return urlToPrefix[url];
};

exports.searchPrefix = (prefixName) => {
  return getPrefixMap()[prefixName];
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

exports.getPrefixMap = getPrefixMap;

exports.getOrderedPrefixURLs = getOrderedPrefixURLs = () => {
  if(!orderedPrefixURLs) {
    getPrefixMap(); // prepare ulrToPrefix
    orderedPrefixURLs = Object.keys(urlToPrefix).sort((a, b) => -(a.length - b.length));
  }
  return orderedPrefixURLs;
}

exports.abbreviateURL = (srcUrl) => {
  for(const url of getOrderedPrefixURLs()) {
    if(srcUrl.startsWith(url)) {
      const prefix = searchPrefixByURL(url)
      return `${prefix}:${srcUrl.substring(url.length + 1)}`;
    }
  }
  return `<${srcUrl}>`;
}
