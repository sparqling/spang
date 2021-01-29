const parser = require('./template_parser');
const fs = require('fs');
const expandHomeDir = require('expand-home-dir')

var traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this,[i,o[i]]);  
    if (o[i] !== null && typeof(o[i])=="object") {
      traverse(o[i], fn);
    }
  }
}

var defaultPrefixPaths = [`${__dirname}/../etc/prefix`]
var prefixMap;
var urlToPrefix;
var orderedPrefixURLs;


readPrefixFile = (contents, reload=false) => {
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
  if(!prefixMap && fs.readFileSync) {
    defaultPrefixPaths.forEach(prefixPath => {
      if(fs.existsSync(prefixPath)) {
        readPrefixFile(fs.readFileSync(prefixPath, 'utf8'));
      }
    });
  }
};

getPrefixMap = () => {
  prepareInitialPrefix();
  if(prefixMap) {
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
  readPrefixFile(fs.readFileSync(filePath, 'utf8'));
}

exports.setPrefixFiles = (filePaths) => {
  var first = true;
  filePaths.forEach(filePath => {
    filePath = expandHomeDir(filePath);
    if(fs.existsSync(filePath)) {
      readPrefixFile(fs.readFileSync(filePath, 'utf8', first));
      first = false;
    }
  });
}

exports.loadPrefixFileByURL = (url) => {
  const syncRequest = require('sync-request');
  prepareInitialPrefix();
  readPrefixFile(syncRequest("GET", url).getBody('utf8'));
}

exports.searchPrefix = (prefixName) => {
  return getPrefixMap()[prefixName];
};

exports.insertUndefinedPrefixes = (sparql) => {
  const parsedQuery = parser.parse(sparql);
  const definedPrefixes = parsedQuery.prologue.prefixes.map((def) => def.prefix);
  prefixes = [];
  traverse(parsedQuery, (key, value) => {
    if(value && value.token == 'uri' && value.prefix &&
       !prefixes.includes(value.prefix) &&
       !definedPrefixes.includes(value.prefix)) {
      prefixes.push(value.prefix);
    }
  });

  if(prefixes.length > 0) {
    let prologue = sparql.substr(0, parsedQuery.body.location.start.offset);
    let lastNewLineMatch = prologue.match(/\n\s+$/);
    let locationToInsert = lastNewLineMatch ?
        prologue.lastIndexOf(prologue.match(/\n\s+$/).pop()) + 1 : parsedQuery.body.location.start.offset;
    sparql = sparql.insert(locationToInsert, prefixes.map(pre => exports.searchPrefix(pre)).join("\n") +
                           (lastNewLineMatch ? "\n" : "\n\n"));
  }
  return sparql;
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

expandPrefix = (prefix) => {
  const line = getPrefixMap()[prefix];
  if (line) {
    const tokens = line.split(/\s+/);
    if(tokens.length == 3 && tokens[0] == 'PREFIX' &&
       tokens[1].endsWith(':') && tokens[2].startsWith('<') &&
       tokens[2].endsWith('>'))
    {
      const expanded = tokens[2].substring(1, tokens[2].length - 1);
      return expanded;
    }
  }
}

exports.expandPrefixedUri = (arg) => {

  if (/^(http|https):\/\//.test(arg)) {
    uri = arg;
  } else if (/^\w+:/.test(arg)) {
    const matched = arg.match(/^(\w+):(.*)$/);
    uri = expandPrefix(matched[1]) + matched[2];
  } else {
    uri = expandPrefix(arg);
  }

  return uri;
}
