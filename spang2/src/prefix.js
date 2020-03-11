const parser = require('./parser.js');
const fs = require('fs');
const syncRequest = require('sync-request');

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


readPrefixFile = (contents, reload=false) => {
  // TODO: error handling
  if(reload || !prefixMap) {
    prefixMap = {};
    urlToPrefix = {};
  }
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

prepareInitialPrefix = () => {
  if(!prefixMap && fs.readFileSync) readPrefixFile(fs.readFileSync(prefixPath, 'utf8'));
};

getPrefixMap = () => {
  if(prefixMap || fs.existsSync(prefixPath)) {
    prepareInitialPrefix();
    return prefixMap;
  }
  return {};
}

searchPrefixByURL = (url) => {
  prepareInitialPrefix();
  return urlToPrefix[url];
};

exports.loadPrefixFile = (filePath) => {
  prepareInitialPrefix();
  prefixPath = filePath;
  readPrefixFile(fs.readFileSync(prefixPath, 'utf8'));
}

exports.loadPrefixFileByURL = (url) => {
  prepareInitialPrefix();
  readPrefixFile(syncRequest("GET", url).getBody('utf8'));
}

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
    prepareInitialPrefix();
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
