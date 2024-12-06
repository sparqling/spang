const prefixModule = require('./prefix.js');
const parser = require('./parser.js');

String.prototype.insert = function (idx, val) {
  return this.substring(0, idx) + val + this.substring(idx);
};

String.prototype.remove = function (start, end) {
  return this.substring(0, start) + this.substring(end);
};

traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this, [i, o[i]]);
    if (o[i] !== null && typeof o[i] == 'object') {
      traverse(o[i], fn);
    }
  }
};

exports.traverse = traverse;

exports.literalToString = (literal) => {
  if (literal.dataType == 'http://www.w3.org/2001/XMLSchema#boolean') {
    return literal.literal ? 'true' : 'false';
  } else if (
    literal.dataType == 'http://www.w3.org/2001/XMLSchema#decimal' ||
    literal.dataType == 'http://www.w3.org/2001/XMLSchema#double' ||
    literal.dataType == 'http://www.w3.org/2001/XMLSchema#integer'
  ) {
    return literal.literal;
  } else if (literal.dataType) {
    return `"${literal.literal}"^^<${literal.dataType}>`;
  } else {
    return `"${literal.literal}"`;
  }
};

exports.parse = (template) => {
  let objectTree;

  try {
    objectTree = new parser.parse(template);
  } catch (err) {
    printError(template, err);
    process.exit(1);
  }

  return objectTree;
};

const printError = (inputText, err) => {
  if (err.location) {
    const startLine = err.location.start.line;
    const endLine = err.location.end.line;
    const startCol = err.location.start.column;
    const endCol = err.location.end.column;

    if (startLine == endLine) {
      console.error(`SyntaxError at line:${startLine}(col:${startCol}-${endCol})`);
    } else {
      console.error(`SyntaxError at line:${startLine}(col:${startCol})-${endLine}(col:${endCol})`);
    }
    let message = '';
    if (err.message) {
      message = err.message;
      message = message.replace(/^Expected/, 'Expected:');
      message = message.replace(/ but .* found.$/, '');
      message = message.replace('end of input', '');
      message = message.replace('[ \\t]', '');
      message = message.replace('[\\n\\r]', '');
      message = message.replace(/\[[^\dAa]\S+\]/g, '');
      message = message.replace('"#"', '');
      message = message.replace(/"(\S+)"/g, '$1');
      message = message.replace(/'"'/, '"');
      message = message.replace(/\\"/g, '"');
      message = message.replace('or ', ', ');
      message = message.replace(/[, ]+$/g, '');
      message = message.replace(/ *(, )+/g, ' ');
    }
    console.error(message);
    console.error('--');

    const lines = inputText.split('\n').slice(startLine - 1, endLine);
    if (lines.length == 1) {
      const line = lines[0];
      console.error(line.substring(0, startCol - 1) + makeRed(line.substring(startCol - 1, endCol)) + line.substring(endCol));
    } else {
      lines.forEach((line, i) => {
        if (i == 0) {
          console.error(line.substring(0, startCol - 1) + makeRed(line.substring(startCol - 1)));
        } else if (i < lines.length - 1) {
          console.error(makeRed(line));
        } else {
          console.error(makeRed(line.substring(0, endCol)) + line.substring(endCol));
        }
      });
    }
  } else {
    console.error(err);
    console.error('--');
    console.error(makeRed(inputText));
  }
};

exports.printError = printError;

const makeRed = (text) => {
  // const red = '\u001b[31m'; // foreground
  const red = '\u001b[41m'; // backgrond
  const reset = '\u001b[0m';
  return red + text + reset;
};

exports.makeRed = makeRed;

function msleep(n) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}

exports.stdinReadSync = () => {
  let b = new Buffer.alloc(1024);
  let data = '';
  const eagainMax = 100;
  let eagainCount = 0;

  while (true) {
    let n;
    try {
      n = fs.readSync(0, b, 0, b.length);
      if (!n) break;
      data += b.toString('utf8', 0, n);
    } catch (e) {
      if (e.code === 'EAGAIN') {
        msleep(1); // wait resource
      }
    }
  }
  return data;
};

function getBindings(vars, b, abbreviate) {
  return vars.map((v) => {
    if (!b[v]) {
      return '';
    }
    if (b[v].type === 'uri') {
      if (abbreviate) {
        return prefixModule.abbreviateURL(b[v].value);
      } else {
        return `<${b[v].value}>`;
      }
    } else if (b[v]['xml:lang']) {
      const lang = b[v]['xml:lang'];
      return `"${b[v].value}"@${lang}`;
    } else if (b[v].type === 'typed-literal' || (b[v].type === 'literal' && b[v].datatype)) {
      if (
        b[v].datatype === 'http://www.w3.org/2001/XMLSchema#int' ||
        b[v].datatype === 'http://www.w3.org/2001/XMLSchema#integer' ||
        b[v].datatype === 'http://www.w3.org/2001/XMLSchema#decimal' ||
        b[v].datatype === 'http://www.w3.org/2001/XMLSchema#double'
      ) {
        return b[v].value;
      } else if (abbreviate) {
        return `"${b[v].value}"^^${prefixModule.abbreviateURL(b[v].datatype)}`;
      } else {
        return `"${b[v].value}"^^<${b[v].datatype}>`;
      }
    } else if (b[v].type === 'bnode') {
      return `<${b[v].value}>`;
    } else {
      return b[v].value;
    }
  });
}

exports.jsonToTsv = (body, withHeader = false, abbreviate = false) => {
  const obj = JSON.parse(body);

  let tsv = '';
  if (withHeader) {
    tsv += obj.head.vars.join('\t') + '\n';
  }

  if (obj.results) {
    tsv += obj.results.bindings.map((b) => {
      return getBindings(obj.head.vars, b, abbreviate).join('\t')
    }).join('\n');
  } else {
    tsv += obj.boolean
  }

  return tsv;
};

exports.isValidUrl = (_string) => {
  let url_string; 
  try {
    url_string = new URL(_string);
  } catch (_) {
    return false;  
  }
  return url_string.protocol === "http:" || url_string.protocol === "https:" ;
}
