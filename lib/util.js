const prefixModule = require('../lib/prefix.js');

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
  if (literal.type == 'http://www.w3.org/2001/XMLSchema#boolean') {
    return literal.value ? 'true' : 'false';
  } else if (
    literal.type == 'http://www.w3.org/2001/XMLSchema#decimal' ||
    literal.type == 'http://www.w3.org/2001/XMLSchema#double' ||
    literal.type == 'http://www.w3.org/2001/XMLSchema#integer'
  ) {
    return literal.value;
  } else if (literal.type) {
    return `"${literal.value}"^^<${literal.type}>`;
  } else {
    return `"${literal.value}"`;
  }
};

exports.makeRed = (text) => {
  // const red = '\u001b[31m'; // foreground
  const red = '\u001b[41m'; // backgrond
  const reset = '\u001b[0m';
  return red + text + reset;
};

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
      return `_:${b[v].value}`;
    } else {
      return `"${b[v].value}"`;
    }
  });
}

exports.jsonToTsv = (body, withHeader = false, abbreviate = false) => {
  const obj = JSON.parse(body);

  let tsv = '';
  if (withHeader) {
    tsv += obj.head.vars.join('\t') + '\n';
  }

  tsv += obj.results.bindings.map((b) => {
    return getBindings(obj.head.vars, b, abbreviate).join('\t')
  }).join('\n');

  return tsv;
};
