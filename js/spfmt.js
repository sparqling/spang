(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
spfmt = (sparql, indentDepth = 2) => {
  const parser = require('../lib/template_parser');
  const formatter = require('../lib/formatter.js');
  return formatter.format(parser.parse(sparql), indentDepth);
};

},{"../lib/formatter.js":2,"../lib/template_parser":4}],2:[function(require,module,exports){
let output;
let commentsList;
let currentIndent;
let indentUnit = '  ';

exports.format = (syntaxTree, indentDepth = 2) => {
  indentUnit = ' '.repeat(indentDepth);

  output = [];
  commentsList = syntaxTree.comments;
  currentIndent = '';

  if (syntaxTree.headers.length > 0) {
    addLine(syntaxTree.headers.join(''));
  }
  if (syntaxTree.prologue.length) {
    syntaxTree.prologue.forEach((p) => {
      if (p.token === 'base') {
        addLine(`BASE <${p.value}>`);
      } else if (p.token === 'prefix') {
        addLine(`PREFIX ${p.prefix || ''}: <${p.local}>`);
      }
    });
    addLine('');
  }

  syntaxTree.functions.forEach(addFunction);

  if (syntaxTree.body?.kind === 'select') {
    addSelect(syntaxTree.body);
  } else if (syntaxTree.body?.kind === 'construct') {
    addConstruct(syntaxTree.body);
  } else if (syntaxTree.body?.kind === 'ask') {
    addAsk(syntaxTree.body);
  } else if (syntaxTree.body?.kind === 'describe') {
    addDescribe(syntaxTree.body);
  } else if (syntaxTree.units) {
    syntaxTree.units.forEach((unit) => {
      addUnit(unit);
    });
  }
  if (syntaxTree.inlineData) {
    addInlineData(syntaxTree.inlineData);
  }

  addComments();

  return output.join('\n');
};

const debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

const increaseIndent = (depth = 1) => {
  currentIndent += indentUnit.repeat(depth);
};

const decreaseIndent = (depth = 1) => {
  currentIndent = currentIndent.substr(0, currentIndent.length - indentUnit.length * depth);
};

const addLine = (lineText, commentPtr = 0) => {
  // 0 means min ptr, so no comments will be added.
  addComments(commentPtr);
  output.push(currentIndent + lineText);
};

const addComments = (commentPtr = -1) => {
  // -1 means 'max' ptr, so all comments will be added.
  let commentAdded = false;
  while (commentsList.length > 0 && (commentsList[0].line < commentPtr || commentPtr == -1)) {
    const commentText = commentsList.shift().text;
    if (commentAdded || commentPtr == -1 || output[output.length - 1] === '') {
      // newline is necessary before comment
      output.push(commentText);
    } else {
      // newline is not necessary
      output[output.length - 1] += commentText;
    }
    commentAdded = true;
  }
};

const addAsk = (ask) => {
  addLine('ASK {');
  addGroupGraphPatternSub(ask.pattern);
  addLine('}');
}

const addDescribe = (describe) => {
  const elems = describe.value.map(getTripleElem).join(' ');
  addLine(`DESCRIBE ${elems}`);
  if (describe.pattern) {
    addLine('WHERE {');
    addGroupGraphPatternSub(describe.pattern);
    addLine('}');
  }
}

const addUnit = (unit) => {
  if (unit.kind === 'insertdata') {
    addLine('INSERT DATA');
    addQuads(unit.quads);
  } else if (unit.kind === 'deletedata') {
    addLine('DELETE DATA');
    addQuads(unit.quads);
  } else if (unit.kind === 'deletewhere') {
    addLine('DELETE WHERE {');
    addGroupGraphPatternSub(unit.pattern);
    addLine('}');
  } else if (unit.kind === 'modify') {
    if (unit.with) {
      addLine(`WITH ${getTripleElem(unit.with)}`);
    }
    if (unit.delete && unit.insert) {
      addLine('DELETE INSERT');
    } else if (unit.delete) {
      addLine('DELETE');
      addQuads(unit.delete.quadsContext);
    } else if (unit.insert) {
      addLine('INSERT');
      addQuads(unit.insert.quadsContext);
    }
    addLine('WHERE {');
    addGroupGraphPatternSub(unit.pattern);
    addLine('}');
  }
};

const addQuads = (quads) => {
  addLine('{');
  increaseIndent();
  quads.forEach((quad) => {
    addTriple(quad);
  });
  decreaseIndent();
  addLine('}');
};

const addSelect = (select) => {
  const proj = select.projection;
  const lastLine = proj[0].value ? proj[0].value.location.start.line : proj[0].location.start.line;

  let args = '';
  if (select.modifier) {
    args += `${select.modifier.toString()} `;
  }
  args += proj.map(getProjection).join(' ');
  addLine(`SELECT ${args}`, lastLine);

  if (select.dataset) {
    select.dataset.implicit.forEach((graph) => {
      addFrom(graph);
    });
    select.dataset.named.forEach((graph) => {
      addFromNamed(graph);
    });
  }

  addLine('WHERE {', lastLine + 1);
  addGroupGraphPatternSub(select.pattern);
  addLine('}', select.pattern.location.end.line);

  if (select.group) {
    addLine('GROUP BY ' + select.group.map(elem => getTripleElem(elem)).join(' '));
  }
  if (select.having) {
    addLine(`HAVING (${getExpression(select.having[0])})`);
  }
  if (select.order) {
    addLine('ORDER BY ' + getOrderConditions(select.order));
  }
  if (select.limit) {
    addLine(`LIMIT ${select.limit}`);
  }
  if (select.offset) {
    addLine(`OFFSET ${select.offset}`);
  }
};

const addConstruct = (body) => {
  addLine('CONSTRUCT {');
  increaseIndent();
  body.template.triplesContext.forEach((triple) => {
    addTriple(triple);
  });
  decreaseIndent();
  addLine('}');

  body.dataset.implicit.forEach((graph) => {
    addFrom(graph);
  });
  body.dataset.named.forEach((graph) => {
    addFromNamed(graph);
  });

  addLine('WHERE {');
  if (body.pattern.patterns) {
    addGroupGraphPatternSub(body.pattern);
  } else {
    increaseIndent();
    addPattern(body.pattern);
    decreaseIndent();
  }
  addLine('}');
};

const addFrom = (graph) => {
  const uri = getUri(graph);
  if (uri != null) {
    addLine('FROM ' + uri);
  }
};

const addFromNamed = (graph) => {
  const uri = getUri(graph);
  if (uri != null) {
    addLine('FROM NAMED ' + uri);
  }
};

const addGroupGraphPatternSub = (pattern) => {
  increaseIndent();
  pattern.patterns.forEach((p) => {
    if (p.token === 'filter') {
      addFilter(p)
    } else if (p.token === 'bind') {
      addBind(p)
    } else {
      addPattern(p)
    }
  });
  decreaseIndent();
};

const addBind = (bind) => {
  addLine(`BIND(${getExpression(bind.expression)} AS ${getVar(bind.as)})`);
}

const addPattern = (pattern) => {
  switch (pattern.token) {
    case 'ggps':
      addLine('{');
      addGroupGraphPatternSub(pattern);
      addLine('}');
      break;
    case 'graphgraphpattern':
      addLine(`GRAPH ${getTripleElem(pattern.graph)} {`);
      addGroupGraphPatternSub(pattern.value);
      addLine('}');
      break;
    case 'graphunionpattern':
      addLine('{');
      addGroupGraphPatternSub(pattern.value[0]);
      addLine('}');
      for (let i = 1; i < pattern.value.length; i++) {
        addLine('UNION');
        addLine('{');
        addGroupGraphPatternSub(pattern.value[i]);
        addLine('}');
      }
      break;
    case 'optionalgraphpattern':
      addLine('OPTIONAL {');
      addGroupGraphPatternSub(pattern.value);
      addLine('}');
      break;
    case 'servicegraphpattern':
      addLine(`SERVICE ${getTripleElem(pattern.value[0])}`);
      addPattern(pattern.value[1]);
      break;
    case 'minusgraphpattern':
      addLine('MINUS {');
      addGroupGraphPatternSub(pattern.value);
      addLine('}');
      break;
    case 'bgp':
      pattern.triplesContext.forEach(addTriple);
      break;
    case 'triplesblock':
      pattern.triplesContext.forEach(addTriple);
      break;
    case 'inlineData':
      addInlineData(pattern);
      break;
    case 'inlineDataFull':
      addInlineData(pattern);
      break;
    case 'expression':
      if (pattern.expressionType === 'functioncall') {
        const args = pattern.args.map(getExpression).join(', ');
        addLine(getUri(pattern.iriref) + `(${args})`);
      } else {
        debugPrint(pattern);
      }
      break;
    case 'subselect':
      addLine('{');
      increaseIndent();
      addSelect(pattern);
      decreaseIndent();
      addLine('}');
      break;
    default:
      debugPrint(pattern);
  }
};

const getOrderConditions = (conditions) => {
  let orderConditions = [];
  conditions.forEach((condition) => {
    const oc = getVar(condition.expression.value);
    if (condition.direction == 'DESC') {
      orderConditions.push(`DESC(${oc})`);
    } else {
      orderConditions.push(oc);
    }
  });

  return orderConditions.join(' ');
};

const getProjection = (projection) => {
  switch (projection.kind) {
    case '*':
      return '*';
    case 'var':
      if (projection.value.prefix === '$') {
        return '$' + projection.value.value;
      } else {
        return '?' + projection.value.value;
      }
    case 'aliased':
      return `(${getExpression(projection.expression)} AS ?${projection.alias.value})`;
    default:
      throw new Error('unknown projection.kind: ' + projection.kind);
  }
};

const getRelationalExpression = (exp) => {
  let op1 = getExpression(exp.op1);
  if (exp.op1.bracketted) {
    op1 = `(${op1})`;
  }

  let op2;
  if (Array.isArray(exp.op2)) {
    op2 = exp.op2.map(getTripleElem).join(', ');
    op2 = `(${op2})`;
  } else {
    op2 = getExpression(exp.op2);
  }

  return `${op1} ${exp.operator} ${op2}`;
}

const addFilter = (filter) => {
  if (filter.value.expressionType == 'relationalexpression') {
    addLine(`FILTER (${getRelationalExpression(filter.value)})`);
  } else if (filter.value.expressionType == 'regex') {
    let op = getExpression(filter.value.text);
    op += ', ' + getExpression(filter.value.pattern);
    if (filter.value.flags) {
      op += ', ' + getExpression(filter.value.flags);
    }
    addLine(`FILTER regex(${op})`);
  } else if (filter.value.expressionType === 'builtincall' && filter.value.builtincall === 'notexists') {
    addLine(`FILTER NOT EXISTS`);
    filter.value.args.forEach((pattern) => {
      addPattern(pattern);
    });
  } else if (filter.value.expressionType === 'builtincall' && filter.value.builtincall === 'exists') {
    addLine(`FILTER EXISTS`);
    filter.value.args.forEach((pattern) => {
      addPattern(pattern);
    });
  } else if (filter.value.expressionType === 'conditionaland') {
    let operands = filter.value.operands.map((operand) => {
      return getExpression(operand);
    }).join(' && ');
    if (filter.value.bracketted) {
      addLine(`FILTER (${operands})`);
    } else {
      addLine(`FILTER ${operands}`);
    }
  } else {
    addLine(`FILTER ${getExpression(filter.value)}`);
  }
};

const addFunction = (func) => {
  const name = getUri(func.header.iriref);
  const args = func.header.args.map(getExpression).join(', ');
  addLine(`${name}(${args}) {`);
  addGroupGraphPatternSub(func.body);
  addLine('}');
  addLine('');
};

const addTriple = (triple) => {
  const s = getTripleElem(triple.subject);
  const p = getTripleElem(triple.predicate);
  const o = getTripleElem(triple.object);
  addLine(`${s} ${p} ${o} .`, triple.object.location?.end.line);
};

const getExpression = (expr) => {
  switch (expr.expressionType) {
    case 'atomic':
      return getTripleElem(expr.value);
    case 'irireforfunction':
      let iri = getUri(expr.iriref);
      if (expr.args) {
        iri += '(' + expr.args.map(getExpression).join(', ') + ')';
      }
      return iri;
    case 'builtincall':
      let args = '';
      if (expr.args) {
        args = expr.args.map(getTripleElem).join(', ');
      }
      const ret = expr.builtincall + '(' + args + ')';
      if (expr.bracketted) {
        return `(${ret})`;
      } else {
        return ret;
      }
    case 'unaryexpression':
      let ex = expr.unaryexpression + getExpression(expr.expression);
      if (expr.bracketted) {
        return `(${ex})`;
      } else {
        return ex;
      }
    case 'aggregate':
      if (expr.aggregateType === 'sample') {
        return `SAMPLE(?${expr.expression.value.value})`;
      } else if (expr.aggregateType === 'avg') {
        return `AVG(${getExpression(expr.expression)})`;
      } else if (expr.aggregateType === 'sum') {
        return `sum(?${expr.expression.value.value})`;
      } else if (expr.aggregateType === 'min') {
        return `MIN(?${expr.expression.value.value})`;
      } else if (expr.aggregateType === 'max') {
        return `MAX(?${expr.expression.value.value})`;
      } else if (expr.aggregateType === 'count') {
        let distinct = expr.distinct ? 'DISTINCT ' : '';
        return `COUNT(${distinct}${getExpression(expr.expression)})`;
      } else if (expr.aggregateType === 'group_concat') {
        let distinct = expr.distinct ? 'DISTINCT ' : '';
        let separator = '';
        if (expr.separator) {
          separator = `; SEPARATOR = "${expr.separator.value}"`;
        }
        return `GROUP_CONCAT(${distinct}${getExpression(expr.expression)}${separator})`;
      }
    case 'multiplicativeexpression':
      let multi = getFactor(expr.factor) + ' ' + getFactors(expr.factors);
      if (expr.bracketted) {
        return `(${multi})`;
      } else {
        return multi;
      }
    case 'additiveexpression':
      return getFactor(expr);
    case 'relationalexpression':
      return getRelationalExpression(expr);
  }
  return expr.expressionType;
};

const getFactor = (factor) => {
  let out;
  if (factor.summand) {
    out = getExpression(factor.summand) + ' ' + getFactors(factor.summands);
  } else {
    out = getExpression(factor);
  }
  if (factor.bracketted) {
    return `(${out})`;
  } else {
    return out;
  }
};

const getFactors = (factors) => {
  return factors.map((factor) => {
    return factor.operator + ' ' + getExpression(factor.expression);
  }).join(' ');
};

const addInlineData = (inline) => {
  switch (inline.token) {
    case 'inlineData':
      const v = getTripleElem(inline.var);
      const vals = inline.values.map(getTripleElem).join(' ');
      addLine(`VALUES ${v} { ${vals} }`);
      break;
    case 'inlineDataFull':
      const varlist = inline.variables.map(getVar).join(' ');
      if (inline.variables.length === 1) {
        const vals = inline.values.map((tuple) => {
          return '(' + tuple.map(getTripleElem).join(' ') + ')';
        }).join(' ');
        addLine(`VALUES (${varlist}) { ${vals} }`);
      } else {
        addLine(`VALUES (${varlist}) {`);
        increaseIndent();
        inline.values.map((tuple) => {
          addLine('(' + tuple.map(getTripleElem).join(' ') + ')');
        });
        decreaseIndent();
        addLine('}');
      }
      break;
  }
};

const getTripleElem = (elem) => {
  if (elem === 'UNDEF') {
    return elem;
  }
  switch (elem.token) {
    case 'uri':
      return getUri(elem);
    case 'var':
      return getVar(elem);
    case 'literal':
      if (elem.type === 'http://www.w3.org/2001/XMLSchema#decimal') {
        return elem.value;
      } else if (elem.type === 'http://www.w3.org/2001/XMLSchema#double') {
        return elem.value;
      } else if (elem.type === 'http://www.w3.org/2001/XMLSchema#integer') {
        return elem.value;
      } else if (elem.type?.prefix && elem.type?.suffix) {
        return `"${elem.value}"^^${elem.type.prefix}:${elem.type.suffix}`;
      } else if (elem.type) {
        return `"${elem.value}"^^<${elem.type.value}>`;
      } else if (elem.lang) {
        return `"${elem.value}"@${elem.lang}`;
      } else {
        return `"${elem.value}"`;
      }
    case 'path':
      if (elem.kind === 'alternative') {
        let path = elem.value.map((e) => getPredicate(e)).join('|');
        if (elem.bracketted) {
          path = `(${path})`;
        }
        return path;
      } else if (elem.kind === 'sequence') {
        return elem.value.map((e) => getPredicate(e)).join('/');
      } else {
        return getPredicate(elem);
      }
    case 'blank':
      return '[]';
    default:
      return getExpression(elem);
  }
};

const getPredicate = (elem) => {
  let ret = '';
  if (elem.kind === 'inversePath') {
    ret += '^';
  }
  ret += getTripleElem(elem.value);
  if (elem.modifier) {
    ret += elem.modifier;
  }
  return ret;
};

const getUri = (uri) => {
  if (uri.prefix && uri.suffix) {
    return `${uri.prefix}:${uri.suffix}`;
  } else if (uri.prefix) {
    return `${uri.prefix}:`;
  } else if (uri.suffix) {
    return `:${uri.suffix}`;
  } else if (uri.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
    return 'a';
  } else if (uri.value != null) {
    return `<${uri.value}>`;
  } else {
    return null;
  }
};

const getVar = (variable) => {
  if (variable.prefix === '?') {
    return '?' + variable.value;
  } else if (variable.prefix === '$') {
    return '$' + variable.value;
  } else {
    return '{{' + variable.value + '}}';
  }
};

},{}],3:[function(require,module,exports){
const parser = require('./template_parser');
const fs = require('fs');
const expandHomeDir = require('expand-home-dir');

let traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this, [i, o[i]]);
    if (o[i] !== null && typeof o[i] == 'object') {
      traverse(o[i], fn);
    }
  }
};

let prefixMap = {};
let urlToPrefix = {};
let orderedPrefixURLs;

readPrefixFile = (contents) => {
  contents.split('\n').forEach((line) => {
    tokens = line.split(/\s+/);
    if (
      tokens.length == 3 &&
      tokens[0] == 'PREFIX' &&
      tokens[1].endsWith(':') &&
      tokens[2].startsWith('<') &&
      tokens[2].endsWith('>')
    ) {
      const prefixName = tokens[1].substr(0, tokens[1].length - 1);
      prefixMap[prefixName] = line;
      urlToPrefix[tokens[2].substring(1, tokens[2].length - 2)] = prefixName;
    }
  });
};

exports.loadPrefixFile = (filePath) => {
  if (/^(http|https):\/\//.test(filePath)) {
    const syncRequest = require('sync-request');
    readPrefixFile(syncRequest('GET', filePath).getBody('utf8'));
  } else {
    filePath = expandHomeDir(filePath);
    if (fs.existsSync(filePath)) {
      readPrefixFile(fs.readFileSync(filePath, 'utf8'));
    }
  }
};

exports.setPrefixFiles = (filePaths) => {
  filePaths.forEach((filePath) => {
    exports.loadPrefixFile(filePath);
  });
};

exports.searchPrefix = (prefixName) => {
  return prefixMap[prefixName];
};

exports.insertUndefinedPrefixes = (sparql) => {
  const parsedQuery = parser.parse(sparql);
  const definedPrefixes = parsedQuery.prologue.map((p) => p.prefix).filter(x => x);
  prefixes = [];
  traverse(parsedQuery, (key, value) => {
    if (
      value &&
      value.token == 'uri' &&
      value.prefix &&
      !prefixes.includes(value.prefix) &&
      !definedPrefixes.includes(value.prefix)
    ) {
      prefixes.push(value.prefix);
    }
  });

  if (prefixes.length > 0) {
    const prologue = sparql.substr(0, parsedQuery.body.location.start.offset);
    const lastNewLineMatch = prologue.match(/\n\s+$/);
    const locationToInsert = lastNewLineMatch
      ? prologue.lastIndexOf(prologue.match(/\n\s+$/).pop()) + 1
      : parsedQuery.body.location.start.offset;
    sparql = sparql.insert(
      locationToInsert,
      prefixes.map((pre) => exports.searchPrefix(pre)).join('\n') + (lastNewLineMatch ? '\n' : '\n\n')
    );
  }
  return sparql;
};

exports.abbreviateURL = (srcUrl) => {
  if (!orderedPrefixURLs) {
    orderedPrefixURLs = Object.keys(urlToPrefix).sort((a, b) => -(a.length - b.length));
  }
  for (const url of orderedPrefixURLs) {
    if (srcUrl.startsWith(url)) {
      return `${urlToPrefix[url]}:${srcUrl.substring(url.length + 1)}`;
    }
  }
  return `<${srcUrl}>`;
};

expandPrefix = (prefix) => {
  const line = prefixMap[prefix];
  if (line) {
    const tokens = line.split(/\s+/);
    if (
      tokens.length == 3 &&
      tokens[0] == 'PREFIX' &&
      tokens[1].endsWith(':') &&
      tokens[2].startsWith('<') &&
      tokens[2].endsWith('>')
    ) {
      const expanded = tokens[2].substring(1, tokens[2].length - 1);
      return expanded;
    }
  }
};

exports.expandPrefixedUri = (arg) => {
  let matched;

  matched = arg.match(/^https:\/\/github.com\/([^\/]+)\/([^\/]+)\/blob\/(.+)/);
  if (matched) {
    const [, user, repository, version_file] = matched;
    return `https://raw.githubusercontent.com/${user}/${repository}/${version_file}`;
  }

  if (/^https?:\/\//.test(arg)) {
    return arg;
  }

  matched = arg.match(/^(\S+?)@github:([^\/]+)\/([^\/]+)\/(.+)/);
  if (matched) {
    const [, version, user, repository, file] = matched;
    return `https://raw.githubusercontent.com/${user}/${repository}/${version}/${file}`;
  }

  matched = arg.match(/^github@([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/);
  if (matched) {
    const [, user, repository, version, file] = matched;
    return `https://raw.githubusercontent.com/${user}/${repository}/${version}/${file}`;
  }

  matched = arg.match(/^github:([^\/]+)\/([^\/]+)\/(.+)@(\S+?)$/);
  if (matched) {
    const [, user, repository, file, version] = matched;
    return `https://raw.githubusercontent.com/${user}/${repository}/${version}/${file}`;
  }

  matched = arg.match(/^(\w+):(.*)$/);
  if (matched) {
    const [, prefix, suffix] = matched;
    return expandPrefix(prefix) + suffix;
  }

  return expandPrefix(arg);
};

},{"./template_parser":4,"expand-home-dir":9,"fs":7,"sync-request":19}],4:[function(require,module,exports){
(function (process){
const parser = require('../syntax/parser.js');
const makeRed = require('./util.js').makeRed;

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
      console.error(`ERROR line:${startLine}(col:${startCol}-${endCol})`);
    } else {
      console.error(`ERROR line:${startLine}(col:${startCol})-${endLine}(col:${endCol})`);
    }
    console.error(err.message);
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

}).call(this,require('_process'))
},{"../syntax/parser.js":21,"./util.js":5,"_process":13}],5:[function(require,module,exports){
(function (Buffer){
const prefixModule = require('../lib/prefix.js');

String.prototype.insert = function(idx, val) {
  return this.substring(0, idx) + val + this.substring(idx);
};

String.prototype.remove = function(start, end){
  return this.substring(0, start) + this.substring(end);
};

traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this,[i,o[i]]);  
    if (o[i] !== null && typeof(o[i])=="object") {
      traverse(o[i], fn);
    }
  }
}

exports.traverse = traverse;

exports.literalToString = (literal) => {
  if(literal.type == "http://www.w3.org/2001/XMLSchema#boolean") {
    return literal.value ? "true" : "false";
  } else if(literal.type == "http://www.w3.org/2001/XMLSchema#decimal" || literal.type == "http://www.w3.org/2001/XMLSchema#double" || literal.type == "http://www.w3.org/2001/XMLSchema#integer") {
    return literal.value;
  } else if(literal.type) {
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
}

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
    } catch(e) {
      if (e.code === 'EAGAIN') {
        msleep(1); // wait resource
      }
    }
  }
  return data;
}


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
    } else if (b[v].type === 'typed-literal' || b[v].type === 'literal' && b[v].datatype) {
      if (b[v].datatype === 'http://www.w3.org/2001/XMLSchema#integer' ||
          b[v].datatype === 'http://www.w3.org/2001/XMLSchema#decimal' ||
          b[v].datatype === 'http://www.w3.org/2001/XMLSchema#double') {
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
  const vars = obj.head.vars;
  const bindings = obj.results.bindings;
  let tsv = '';
  if (withHeader) {
    tsv += vars.join('\t') + '\n';
  }
  tsv += bindings.map((b) => getBindings(vars, b, abbreviate).join('\t')).join('\n');
  return tsv;
}

}).call(this,require("buffer").Buffer)
},{"../lib/prefix.js":3,"buffer":8}],6:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(
      uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)
    ))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],7:[function(require,module,exports){

},{}],8:[function(require,module,exports){
(function (Buffer){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var customInspectSymbol =
  (typeof Symbol === 'function' && typeof Symbol.for === 'function')
    ? Symbol.for('nodejs.util.inspect.custom')
    : null

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    var proto = { foo: function () { return 42 } }
    Object.setPrototypeOf(proto, Uint8Array.prototype)
    Object.setPrototypeOf(arr, proto)
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  Object.setPrototypeOf(buf, Buffer.prototype)
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw new TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof SharedArrayBuffer !== 'undefined' &&
      (isInstance(value, SharedArrayBuffer) ||
      (value && isInstance(value.buffer, SharedArrayBuffer)))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype)
Object.setPrototypeOf(Buffer, Uint8Array)

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  Object.setPrototypeOf(buf, Buffer.prototype)

  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}
if (customInspectSymbol) {
  Buffer.prototype[customInspectSymbol] = Buffer.prototype.inspect
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += hexSliceLookupTable[buf[i]]
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  Object.setPrototypeOf(newBuf, Buffer.prototype)

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  } else if (typeof val === 'boolean') {
    val = Number(val)
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

// Create lookup table for `toString('hex')`
// See: https://github.com/feross/buffer/issues/219
var hexSliceLookupTable = (function () {
  var alphabet = '0123456789abcdef'
  var table = new Array(256)
  for (var i = 0; i < 16; ++i) {
    var i16 = i * 16
    for (var j = 0; j < 16; ++j) {
      table[i16 + j] = alphabet[i] + alphabet[j]
    }
  }
  return table
})()

}).call(this,require("buffer").Buffer)
},{"base64-js":6,"buffer":8,"ieee754":11}],9:[function(require,module,exports){
(function (process){
var join = require("path").join;
var homedir = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];

module.exports = expandHomeDir;

function expandHomeDir (path) {
  if (!path) return path;
  if (path == '~') return homedir;
  if (path.slice(0, 2) != '~/') return path;
  return join(homedir, path.slice(2));
}

}).call(this,require('_process'))
},{"_process":13,"path":12}],10:[function(require,module,exports){
"use strict";
/**
 * A response from a web request
 */
var Response = /** @class */ (function () {
    function Response(statusCode, headers, body, url) {
        if (typeof statusCode !== 'number') {
            throw new TypeError('statusCode must be a number but was ' + typeof statusCode);
        }
        if (headers === null) {
            throw new TypeError('headers cannot be null');
        }
        if (typeof headers !== 'object') {
            throw new TypeError('headers must be an object but was ' + typeof headers);
        }
        this.statusCode = statusCode;
        var headersToLowerCase = {};
        for (var key in headers) {
            headersToLowerCase[key.toLowerCase()] = headers[key];
        }
        this.headers = headersToLowerCase;
        this.body = body;
        this.url = url;
    }
    Response.prototype.isError = function () {
        return this.statusCode === 0 || this.statusCode >= 400;
    };
    Response.prototype.getBody = function (encoding) {
        if (this.statusCode === 0) {
            var err = new Error('This request to ' +
                this.url +
                ' resulted in a status code of 0. This usually indicates some kind of network error in a browser (e.g. CORS not being set up or the DNS failing to resolve):\n' +
                this.body.toString());
            err.statusCode = this.statusCode;
            err.headers = this.headers;
            err.body = this.body;
            err.url = this.url;
            throw err;
        }
        if (this.statusCode >= 300) {
            var err = new Error('Server responded to ' +
                this.url +
                ' with status code ' +
                this.statusCode +
                ':\n' +
                this.body.toString());
            err.statusCode = this.statusCode;
            err.headers = this.headers;
            err.body = this.body;
            err.url = this.url;
            throw err;
        }
        if (!encoding || typeof this.body === 'string') {
            return this.body;
        }
        return this.body.toString(encoding);
    };
    return Response;
}());
module.exports = Response;

},{}],11:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],12:[function(require,module,exports){
(function (process){
// .dirname, .basename, and .extname methods are extracted from Node.js v8.11.1,
// backported and transplited with Babel, with backwards-compat fixes

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function (path) {
  if (typeof path !== 'string') path = path + '';
  if (path.length === 0) return '.';
  var code = path.charCodeAt(0);
  var hasRoot = code === 47 /*/*/;
  var end = -1;
  var matchedSlash = true;
  for (var i = path.length - 1; i >= 1; --i) {
    code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
      // We saw the first non-path separator
      matchedSlash = false;
    }
  }

  if (end === -1) return hasRoot ? '/' : '.';
  if (hasRoot && end === 1) {
    // return '//';
    // Backwards-compat fix:
    return '/';
  }
  return path.slice(0, end);
};

function basename(path) {
  if (typeof path !== 'string') path = path + '';

  var start = 0;
  var end = -1;
  var matchedSlash = true;
  var i;

  for (i = path.length - 1; i >= 0; --i) {
    if (path.charCodeAt(i) === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // path component
      matchedSlash = false;
      end = i + 1;
    }
  }

  if (end === -1) return '';
  return path.slice(start, end);
}

// Uses a mixed approach for backwards-compatibility, as ext behavior changed
// in new Node.js versions, so only basename() above is backported here
exports.basename = function (path, ext) {
  var f = basename(path);
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};

exports.extname = function (path) {
  if (typeof path !== 'string') path = path + '';
  var startDot = -1;
  var startPart = 0;
  var end = -1;
  var matchedSlash = true;
  // Track the state of characters (if any) we see before our first dot and
  // after any path separator we find
  var preDotState = 0;
  for (var i = path.length - 1; i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47 /*/*/) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
    if (end === -1) {
      // We saw the first non-path separator, mark this as the end of our
      // extension
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46 /*.*/) {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1)
          startDot = i;
        else if (preDotState !== 1)
          preDotState = 1;
    } else if (startDot !== -1) {
      // We saw a non-dot and non-path separator before our dot, so we should
      // have a good chance at having a non-empty extension
      preDotState = -1;
    }
  }

  if (startDot === -1 || end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    return '';
  }
  return path.slice(startDot, end);
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":13}],13:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],14:[function(require,module,exports){
'use strict';

var replace = String.prototype.replace;
var percentTwenties = /%20/g;

module.exports = {
    'default': 'RFC3986',
    formatters: {
        RFC1738: function (value) {
            return replace.call(value, percentTwenties, '+');
        },
        RFC3986: function (value) {
            return value;
        }
    },
    RFC1738: 'RFC1738',
    RFC3986: 'RFC3986'
};

},{}],15:[function(require,module,exports){
'use strict';

var stringify = require('./stringify');
var parse = require('./parse');
var formats = require('./formats');

module.exports = {
    formats: formats,
    parse: parse,
    stringify: stringify
};

},{"./formats":14,"./parse":16,"./stringify":17}],16:[function(require,module,exports){
'use strict';

var utils = require('./utils');

var has = Object.prototype.hasOwnProperty;

var defaults = {
    allowDots: false,
    allowPrototypes: false,
    arrayLimit: 20,
    decoder: utils.decode,
    delimiter: '&',
    depth: 5,
    parameterLimit: 1000,
    plainObjects: false,
    strictNullHandling: false
};

var parseValues = function parseQueryStringValues(str, options) {
    var obj = {};
    var cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str;
    var limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit;
    var parts = cleanStr.split(options.delimiter, limit);

    for (var i = 0; i < parts.length; ++i) {
        var part = parts[i];

        var bracketEqualsPos = part.indexOf(']=');
        var pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1;

        var key, val;
        if (pos === -1) {
            key = options.decoder(part, defaults.decoder);
            val = options.strictNullHandling ? null : '';
        } else {
            key = options.decoder(part.slice(0, pos), defaults.decoder);
            val = options.decoder(part.slice(pos + 1), defaults.decoder);
        }
        if (has.call(obj, key)) {
            obj[key] = [].concat(obj[key]).concat(val);
        } else {
            obj[key] = val;
        }
    }

    return obj;
};

var parseObject = function (chain, val, options) {
    var leaf = val;

    for (var i = chain.length - 1; i >= 0; --i) {
        var obj;
        var root = chain[i];

        if (root === '[]') {
            obj = [];
            obj = obj.concat(leaf);
        } else {
            obj = options.plainObjects ? Object.create(null) : {};
            var cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
            var index = parseInt(cleanRoot, 10);
            if (
                !isNaN(index)
                && root !== cleanRoot
                && String(index) === cleanRoot
                && index >= 0
                && (options.parseArrays && index <= options.arrayLimit)
            ) {
                obj = [];
                obj[index] = leaf;
            } else {
                obj[cleanRoot] = leaf;
            }
        }

        leaf = obj;
    }

    return leaf;
};

var parseKeys = function parseQueryStringKeys(givenKey, val, options) {
    if (!givenKey) {
        return;
    }

    // Transform dot notation to bracket notation
    var key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey;

    // The regex chunks

    var brackets = /(\[[^[\]]*])/;
    var child = /(\[[^[\]]*])/g;

    // Get the parent

    var segment = brackets.exec(key);
    var parent = segment ? key.slice(0, segment.index) : key;

    // Stash the parent if it exists

    var keys = [];
    if (parent) {
        // If we aren't using plain objects, optionally prefix keys
        // that would overwrite object prototype properties
        if (!options.plainObjects && has.call(Object.prototype, parent)) {
            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(parent);
    }

    // Loop through children appending to the array until we hit depth

    var i = 0;
    while ((segment = child.exec(key)) !== null && i < options.depth) {
        i += 1;
        if (!options.plainObjects && has.call(Object.prototype, segment[1].slice(1, -1))) {
            if (!options.allowPrototypes) {
                return;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return parseObject(keys, val, options);
};

module.exports = function (str, opts) {
    var options = opts ? utils.assign({}, opts) : {};

    if (options.decoder !== null && options.decoder !== undefined && typeof options.decoder !== 'function') {
        throw new TypeError('Decoder has to be a function.');
    }

    options.ignoreQueryPrefix = options.ignoreQueryPrefix === true;
    options.delimiter = typeof options.delimiter === 'string' || utils.isRegExp(options.delimiter) ? options.delimiter : defaults.delimiter;
    options.depth = typeof options.depth === 'number' ? options.depth : defaults.depth;
    options.arrayLimit = typeof options.arrayLimit === 'number' ? options.arrayLimit : defaults.arrayLimit;
    options.parseArrays = options.parseArrays !== false;
    options.decoder = typeof options.decoder === 'function' ? options.decoder : defaults.decoder;
    options.allowDots = typeof options.allowDots === 'boolean' ? options.allowDots : defaults.allowDots;
    options.plainObjects = typeof options.plainObjects === 'boolean' ? options.plainObjects : defaults.plainObjects;
    options.allowPrototypes = typeof options.allowPrototypes === 'boolean' ? options.allowPrototypes : defaults.allowPrototypes;
    options.parameterLimit = typeof options.parameterLimit === 'number' ? options.parameterLimit : defaults.parameterLimit;
    options.strictNullHandling = typeof options.strictNullHandling === 'boolean' ? options.strictNullHandling : defaults.strictNullHandling;

    if (str === '' || str === null || typeof str === 'undefined') {
        return options.plainObjects ? Object.create(null) : {};
    }

    var tempObj = typeof str === 'string' ? parseValues(str, options) : str;
    var obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    var keys = Object.keys(tempObj);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var newObj = parseKeys(key, tempObj[key], options);
        obj = utils.merge(obj, newObj, options);
    }

    return utils.compact(obj);
};

},{"./utils":18}],17:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var formats = require('./formats');

var arrayPrefixGenerators = {
    brackets: function brackets(prefix) { // eslint-disable-line func-name-matching
        return prefix + '[]';
    },
    indices: function indices(prefix, key) { // eslint-disable-line func-name-matching
        return prefix + '[' + key + ']';
    },
    repeat: function repeat(prefix) { // eslint-disable-line func-name-matching
        return prefix;
    }
};

var toISO = Date.prototype.toISOString;

var defaults = {
    delimiter: '&',
    encode: true,
    encoder: utils.encode,
    encodeValuesOnly: false,
    serializeDate: function serializeDate(date) { // eslint-disable-line func-name-matching
        return toISO.call(date);
    },
    skipNulls: false,
    strictNullHandling: false
};

var stringify = function stringify( // eslint-disable-line func-name-matching
    object,
    prefix,
    generateArrayPrefix,
    strictNullHandling,
    skipNulls,
    encoder,
    filter,
    sort,
    allowDots,
    serializeDate,
    formatter,
    encodeValuesOnly
) {
    var obj = object;
    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    } else if (obj instanceof Date) {
        obj = serializeDate(obj);
    } else if (obj === null) {
        if (strictNullHandling) {
            return encoder && !encodeValuesOnly ? encoder(prefix, defaults.encoder) : prefix;
        }

        obj = '';
    }

    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean' || utils.isBuffer(obj)) {
        if (encoder) {
            var keyValue = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder);
            return [formatter(keyValue) + '=' + formatter(encoder(obj, defaults.encoder))];
        }
        return [formatter(prefix) + '=' + formatter(String(obj))];
    }

    var values = [];

    if (typeof obj === 'undefined') {
        return values;
    }

    var objKeys;
    if (Array.isArray(filter)) {
        objKeys = filter;
    } else {
        var keys = Object.keys(obj);
        objKeys = sort ? keys.sort(sort) : keys;
    }

    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];

        if (skipNulls && obj[key] === null) {
            continue;
        }

        if (Array.isArray(obj)) {
            values = values.concat(stringify(
                obj[key],
                generateArrayPrefix(prefix, key),
                generateArrayPrefix,
                strictNullHandling,
                skipNulls,
                encoder,
                filter,
                sort,
                allowDots,
                serializeDate,
                formatter,
                encodeValuesOnly
            ));
        } else {
            values = values.concat(stringify(
                obj[key],
                prefix + (allowDots ? '.' + key : '[' + key + ']'),
                generateArrayPrefix,
                strictNullHandling,
                skipNulls,
                encoder,
                filter,
                sort,
                allowDots,
                serializeDate,
                formatter,
                encodeValuesOnly
            ));
        }
    }

    return values;
};

module.exports = function (object, opts) {
    var obj = object;
    var options = opts ? utils.assign({}, opts) : {};

    if (options.encoder !== null && options.encoder !== undefined && typeof options.encoder !== 'function') {
        throw new TypeError('Encoder has to be a function.');
    }

    var delimiter = typeof options.delimiter === 'undefined' ? defaults.delimiter : options.delimiter;
    var strictNullHandling = typeof options.strictNullHandling === 'boolean' ? options.strictNullHandling : defaults.strictNullHandling;
    var skipNulls = typeof options.skipNulls === 'boolean' ? options.skipNulls : defaults.skipNulls;
    var encode = typeof options.encode === 'boolean' ? options.encode : defaults.encode;
    var encoder = typeof options.encoder === 'function' ? options.encoder : defaults.encoder;
    var sort = typeof options.sort === 'function' ? options.sort : null;
    var allowDots = typeof options.allowDots === 'undefined' ? false : options.allowDots;
    var serializeDate = typeof options.serializeDate === 'function' ? options.serializeDate : defaults.serializeDate;
    var encodeValuesOnly = typeof options.encodeValuesOnly === 'boolean' ? options.encodeValuesOnly : defaults.encodeValuesOnly;
    if (typeof options.format === 'undefined') {
        options.format = formats['default'];
    } else if (!Object.prototype.hasOwnProperty.call(formats.formatters, options.format)) {
        throw new TypeError('Unknown format option provided.');
    }
    var formatter = formats.formatters[options.format];
    var objKeys;
    var filter;

    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    } else if (Array.isArray(options.filter)) {
        filter = options.filter;
        objKeys = filter;
    }

    var keys = [];

    if (typeof obj !== 'object' || obj === null) {
        return '';
    }

    var arrayFormat;
    if (options.arrayFormat in arrayPrefixGenerators) {
        arrayFormat = options.arrayFormat;
    } else if ('indices' in options) {
        arrayFormat = options.indices ? 'indices' : 'repeat';
    } else {
        arrayFormat = 'indices';
    }

    var generateArrayPrefix = arrayPrefixGenerators[arrayFormat];

    if (!objKeys) {
        objKeys = Object.keys(obj);
    }

    if (sort) {
        objKeys.sort(sort);
    }

    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];

        if (skipNulls && obj[key] === null) {
            continue;
        }

        keys = keys.concat(stringify(
            obj[key],
            key,
            generateArrayPrefix,
            strictNullHandling,
            skipNulls,
            encode ? encoder : null,
            filter,
            sort,
            allowDots,
            serializeDate,
            formatter,
            encodeValuesOnly
        ));
    }

    var joined = keys.join(delimiter);
    var prefix = options.addQueryPrefix === true ? '?' : '';

    return joined.length > 0 ? prefix + joined : '';
};

},{"./formats":14,"./utils":18}],18:[function(require,module,exports){
'use strict';

var has = Object.prototype.hasOwnProperty;

var hexTable = (function () {
    var array = [];
    for (var i = 0; i < 256; ++i) {
        array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase());
    }

    return array;
}());

var compactQueue = function compactQueue(queue) {
    var obj;

    while (queue.length) {
        var item = queue.pop();
        obj = item.obj[item.prop];

        if (Array.isArray(obj)) {
            var compacted = [];

            for (var j = 0; j < obj.length; ++j) {
                if (typeof obj[j] !== 'undefined') {
                    compacted.push(obj[j]);
                }
            }

            item.obj[item.prop] = compacted;
        }
    }

    return obj;
};

var arrayToObject = function arrayToObject(source, options) {
    var obj = options && options.plainObjects ? Object.create(null) : {};
    for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
};

var merge = function merge(target, source, options) {
    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (Array.isArray(target)) {
            target.push(source);
        } else if (typeof target === 'object') {
            if (options.plainObjects || options.allowPrototypes || !has.call(Object.prototype, source)) {
                target[source] = true;
            }
        } else {
            return [target, source];
        }

        return target;
    }

    if (typeof target !== 'object') {
        return [target].concat(source);
    }

    var mergeTarget = target;
    if (Array.isArray(target) && !Array.isArray(source)) {
        mergeTarget = arrayToObject(target, options);
    }

    if (Array.isArray(target) && Array.isArray(source)) {
        source.forEach(function (item, i) {
            if (has.call(target, i)) {
                if (target[i] && typeof target[i] === 'object') {
                    target[i] = merge(target[i], item, options);
                } else {
                    target.push(item);
                }
            } else {
                target[i] = item;
            }
        });
        return target;
    }

    return Object.keys(source).reduce(function (acc, key) {
        var value = source[key];

        if (has.call(acc, key)) {
            acc[key] = merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
};

var assign = function assignSingleSource(target, source) {
    return Object.keys(source).reduce(function (acc, key) {
        acc[key] = source[key];
        return acc;
    }, target);
};

var decode = function (str) {
    try {
        return decodeURIComponent(str.replace(/\+/g, ' '));
    } catch (e) {
        return str;
    }
};

var encode = function encode(str) {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    var string = typeof str === 'string' ? str : String(str);

    var out = '';
    for (var i = 0; i < string.length; ++i) {
        var c = string.charCodeAt(i);

        if (
            c === 0x2D // -
            || c === 0x2E // .
            || c === 0x5F // _
            || c === 0x7E // ~
            || (c >= 0x30 && c <= 0x39) // 0-9
            || (c >= 0x41 && c <= 0x5A) // a-z
            || (c >= 0x61 && c <= 0x7A) // A-Z
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xC0 | (c >> 6)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        if (c < 0xD800 || c >= 0xE000) {
            out = out + (hexTable[0xE0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3FF) << 10) | (string.charCodeAt(i) & 0x3FF));
        out += hexTable[0xF0 | (c >> 18)]
            + hexTable[0x80 | ((c >> 12) & 0x3F)]
            + hexTable[0x80 | ((c >> 6) & 0x3F)]
            + hexTable[0x80 | (c & 0x3F)];
    }

    return out;
};

var compact = function compact(value) {
    var queue = [{ obj: { o: value }, prop: 'o' }];
    var refs = [];

    for (var i = 0; i < queue.length; ++i) {
        var item = queue[i];
        var obj = item.obj[item.prop];

        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; ++j) {
            var key = keys[j];
            var val = obj[key];
            if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
                queue.push({ obj: obj, prop: key });
                refs.push(val);
            }
        }
    }

    return compactQueue(queue);
};

var isRegExp = function isRegExp(obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
};

var isBuffer = function isBuffer(obj) {
    if (obj === null || typeof obj === 'undefined') {
        return false;
    }

    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
};

module.exports = {
    arrayToObject: arrayToObject,
    assign: assign,
    compact: compact,
    decode: decode,
    encode: encode,
    isBuffer: isBuffer,
    isRegExp: isRegExp,
    merge: merge
};

},{}],19:[function(require,module,exports){
"use strict";
exports.__esModule = true;
var handle_qs_js_1 = require("then-request/lib/handle-qs.js");
var GenericResponse = require("http-response-object");
var fd = FormData;
exports.FormData = fd;
function doRequest(method, url, options) {
    var xhr = new XMLHttpRequest();
    // check types of arguments
    if (typeof method !== 'string') {
        throw new TypeError('The method must be a string.');
    }
    if (url && typeof url === 'object') {
        url = url.href;
    }
    if (typeof url !== 'string') {
        throw new TypeError('The URL/path must be a string.');
    }
    if (options === null || options === undefined) {
        options = {};
    }
    if (typeof options !== 'object') {
        throw new TypeError('Options must be an object (or null).');
    }
    method = method.toUpperCase();
    options.headers = options.headers || {};
    // handle cross domain
    var match;
    var crossDomain = !!((match = /^([\w-]+:)?\/\/([^\/]+)/.exec(url)) && match[2] != location.host);
    if (!crossDomain)
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
    // handle query string
    if (options.qs) {
        url = handle_qs_js_1["default"](url, options.qs);
    }
    // handle json body
    if (options.json) {
        options.body = JSON.stringify(options.json);
        options.headers['content-type'] = 'application/json';
    }
    if (options.form) {
        options.body = options.form;
    }
    // method, url, async
    xhr.open(method, url, false);
    for (var name in options.headers) {
        xhr.setRequestHeader(name.toLowerCase(), '' + options.headers[name]);
    }
    // avoid sending empty string (#319)
    xhr.send(options.body ? options.body : null);
    var headers = {};
    xhr
        .getAllResponseHeaders()
        .split('\r\n')
        .forEach(function (header) {
        var h = header.split(':');
        if (h.length > 1) {
            headers[h[0].toLowerCase()] = h
                .slice(1)
                .join(':')
                .trim();
        }
    });
    return new GenericResponse(xhr.status, headers, xhr.responseText, url);
}
exports["default"] = doRequest;
module.exports = doRequest;
module.exports["default"] = doRequest;
module.exports.FormData = fd;

},{"http-response-object":10,"then-request/lib/handle-qs.js":20}],20:[function(require,module,exports){
"use strict";
exports.__esModule = true;
var qs_1 = require("qs");
function handleQs(url, query) {
    var _a = url.split('?'), start = _a[0], part2 = _a[1];
    var qs = (part2 || '').split('#')[0];
    var end = part2 && part2.split('#').length > 1 ? '#' + part2.split('#')[1] : '';
    var baseQs = qs_1.parse(qs);
    for (var i in query) {
        baseQs[i] = query[i];
    }
    qs = qs_1.stringify(baseQs);
    if (qs !== '') {
        qs = '?' + qs;
    }
    return start + qs + end;
}
exports["default"] = handleQs;

},{"qs":15}],21:[function(require,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { DOCUMENT: peg$parseDOCUMENT },
      peg$startRuleFunction  = peg$parseDOCUMENT,

      peg$c0 = function(h, s, f) {
        s.headers = h;
        s.comments = Object.entries(Comments).map(([loc, str]) => ({
          text: str,
          line: parseInt(loc),
        }));

        if (s.functions) {
          s.functions = s.functions.concat(f);
        } else {
          s.functions = f;
        }

        return s;
      },
      peg$c1 = function(p, f, q, v) {
        return {
          token: 'query',
          prologue: p,
          body: q,
          functions: f,
          inlineData: v
        }
      },
      peg$c2 = function(h, b) {
        return {
          token: 'function',
          header: h,
          body: b,
          location: location(),
        }
      },
      peg$c3 = "base",
      peg$c4 = peg$literalExpectation("BASE", true),
      peg$c5 = function(i) {
        return {
          token: 'base',
          value: i,
        }
      },
      peg$c6 = "prefix",
      peg$c7 = peg$literalExpectation("PREFIX", true),
      peg$c8 = function(p, l) {
        return {
          token: 'prefix',
          prefix: p,
          local: l,
        }
      },
      peg$c9 = function(s, gs, w, sm) {
        const dataset = { named: [], implicit: [] };
        gs.forEach((g) => {
          if (g.kind === 'default') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph);
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            location: null,
            prefix: null,
            suffix: null,
          });
        }

        return {
          token: 'executableunit',
          kind: 'select',
          dataset: dataset,
          projection: s.vars,
          modifier: s.modifier,
          pattern: w,
          limit: sm.limit,
          offset: sm.offset,
          group: sm.group,
          having: sm.having,
          order: sm.order,
          location: location(),
        }
      },
      peg$c10 = function(s, w, sm) {
        return {
          token: 'subselect',
          kind: 'select',
          projection: s.vars,
          modifier: s.modifier,
          pattern: w,
          limit: sm.limit,
          offset: sm.offset,
          group: sm.group,
          order: sm.order,
        };
      },
      peg$c11 = "select",
      peg$c12 = peg$literalExpectation("SELECT", true),
      peg$c13 = "distinct",
      peg$c14 = peg$literalExpectation("DISTINCT", true),
      peg$c15 = "reduced",
      peg$c16 = peg$literalExpectation("REDUCED", true),
      peg$c17 = "(",
      peg$c18 = peg$literalExpectation("(", false),
      peg$c19 = "as",
      peg$c20 = peg$literalExpectation("AS", true),
      peg$c21 = ")",
      peg$c22 = peg$literalExpectation(")", false),
      peg$c23 = "*",
      peg$c24 = peg$literalExpectation("*", false),
      peg$c25 = function(m, vs) {
        let vars;
        if (vs === "*") {
          vars = [{
            token: 'variable',
            kind: '*',
            location: location(),
          }];
        } else {
          vars = vs.map((v) => {
            if (v.length === 2) {
              return {
                token: 'variable',
                kind: 'var',
                value: v[1],
              };
            } else {
              return {
                token: 'variable',
                kind: 'aliased',
                expression: v[3],
                alias: v[7],
                location: location(),
              };
            }
          });
        }

        return {
          vars: vars,
          modifier: m?.toUpperCase(),
        };
      },
      peg$c26 = "construct",
      peg$c27 = peg$literalExpectation("CONSTRUCT", true),
      peg$c28 = function(t, gs, w, sm) {
        const dataset = { named:[], implicit:[] };
        gs.forEach((g) => {
          if (g.kind === 'default') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph);
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            prefix:null,
            suffix:null,
          });
        }
        
        return {
          kind: 'construct',
          token: 'executableunit',
          dataset: dataset,
          template: t,
          pattern: w,
          limit: sm.limit,
          offset: sm.offset,
          order: sm.order,
          location: location(),
        };
      },
      peg$c29 = "where",
      peg$c30 = peg$literalExpectation("WHERE", true),
      peg$c31 = "{",
      peg$c32 = peg$literalExpectation("{", false),
      peg$c33 = "}",
      peg$c34 = peg$literalExpectation("}", false),
      peg$c35 = function(gs, t, sm) {
        let dataset = { named: [], implicit: [] };
        gs.forEach((g) => {
          if (g.kind === 'default') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph)
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            prefix:null,
            suffix:null,
          });
        }
        
        return {
          kind: 'construct',
          token: 'executableunit',
          dataset: dataset,
          template: t,
          pattern: {
            token: 'bgp',
            triplesContext: t.triplesContext
          },
          limit: sm.limit,
          offset: sm.offset,
          order: sm.order,
          location: location(),
        };
      },
      peg$c36 = "describe",
      peg$c37 = peg$literalExpectation("DESCRIBE", true),
      peg$c38 = function(v, w) {
        return {
          token: 'executableunit',
          kind: 'describe',
          value: v,
          pattern: w,
        }
      },
      peg$c39 = "ask",
      peg$c40 = peg$literalExpectation("ASK", true),
      peg$c41 = function(gs, w) {
        const dataset = { named: [], implicit: [] };
        gs.forEach((g) => {
          if (g.kind === 'implicit') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph);
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            prefix:null,
            suffix:null,
          });
        }

        return {
          kind: 'ask',
          token: 'executableunit',
          dataset: dataset,
          pattern: w,
          location: location(),
        }
      },
      peg$c42 = "from",
      peg$c43 = peg$literalExpectation("FROM", true),
      peg$c44 = function(gs) {
        return gs;
      },
      peg$c45 = function(s) {
        return {
          kind: 'default',
          token: 'graphClause',
          graph: s,
          location: location(),
        }
      },
      peg$c46 = "named",
      peg$c47 = peg$literalExpectation("NAMED", true),
      peg$c48 = function(s) {
        return {
          token: 'graphCluase',
          kind: 'named',
          graph: s,
          location: location(),
        };
      },
      peg$c49 = function(g) {
        return g;
      },
      peg$c50 = function(gc, h, oc, lo) {
        return {
          group: gc,
          order: oc,
          limit: lo?.limit,
          offset: lo?.offset,
          having: h,
        }
      },
      peg$c51 = "group",
      peg$c52 = peg$literalExpectation("GROUP", true),
      peg$c53 = "by",
      peg$c54 = peg$literalExpectation("BY", true),
      peg$c55 = function(conds) {
        return conds;
      },
      peg$c56 = function(b) {
        return b;
      },
      peg$c57 = function(f) {
        return f;
      },
      peg$c58 = function(e, as) {
        if (as) {
          return {
            token: 'aliased_expression',
            expression: e,
            alias: as[2],
            location: location(),
          };
        } else {
          e.bracketted = 'true';
          return e;
        }
      },
      peg$c59 = function(v) {
        return v;
      },
      peg$c60 = "HAVING",
      peg$c61 = peg$literalExpectation("HAVING", false),
      peg$c62 = function(h) {
        return h;
      },
      peg$c63 = "order",
      peg$c64 = peg$literalExpectation("ORDER", true),
      peg$c65 = function(os) {
        return os;
      },
      peg$c66 = "asc",
      peg$c67 = peg$literalExpectation("ASC", true),
      peg$c68 = "desc",
      peg$c69 = peg$literalExpectation("DESC", true),
      peg$c70 = function(direction, e) {
        return {
          direction: direction.toUpperCase(),
          expression: e
        };
      },
      peg$c71 = function(e) {
        if (e.token === 'var') {
          return {
            direction: 'ASC',
            expression: {
              value: e,
              token:'expression',
              expressionType:'atomic',
              primaryexpression: 'var',
              location: location(),
            }
          };
        } else {
          return {
            direction: 'ASC',
            expression: e,
          };
        }
      },
      peg$c72 = function(cls) {
        let acum = {};

        cls.forEach((cl) => {
          if (cl != null && cl.limit != null) {
            acum.limit = cl.limit;
          } else if (cl != null && cl.offset != null){
            acum.offset = cl.offset;
          }
        });
        
        return acum;
      },
      peg$c73 = "limit",
      peg$c74 = peg$literalExpectation("LIMIT", true),
      peg$c75 = function(i) {
        return {
          limit: parseInt(i.value)
        };
      },
      peg$c76 = "offset",
      peg$c77 = peg$literalExpectation("OFFSET", true),
      peg$c78 = function(i) {
        return {
          offset: parseInt(i.value)
        };
      },
      peg$c79 = "values",
      peg$c80 = peg$literalExpectation("VALUES", true),
      peg$c81 = function(b) {
        if (b != null) {
          return b[1];
        } else {
          return null;
        }
      },
      peg$c82 = ";",
      peg$c83 = peg$literalExpectation(";", false),
      peg$c84 = function(p, u) {
        let query = {
          token: 'update',
          prologue: p,
          units: [],
        };
        
        if (u) {
          query.units = [u[1]];
          if (u[2]) {
            query.units = query.units.concat(u[2][3].units);
          }
        }

        return query;
      },
      peg$c85 = "load",
      peg$c86 = peg$literalExpectation("LOAD", true),
      peg$c87 = "into",
      peg$c88 = peg$literalExpectation("INTO", true),
      peg$c89 = function(sg, dg) {
        let query = {
          kind: 'load',
          token: 'executableunit',
          sourceGraph: sg,
        };
        if (dg != null) {
          query.destinyGraph = dg[2];
        }

        return query;
      },
      peg$c90 = "clear",
      peg$c91 = peg$literalExpectation("CLEAR", true),
      peg$c92 = "silent",
      peg$c93 = peg$literalExpectation("SILENT", true),
      peg$c94 = function(ref) {
        return {
          token: 'executableunit',
          kind: 'clear',
          destinyGraph: ref,
        }
      },
      peg$c95 = "drop",
      peg$c96 = peg$literalExpectation("DROP", true),
      peg$c97 = function(ref) {
        return {
          token: 'executableunit',
          kind: 'drop',
          destinyGraph: ref,
        }
      },
      peg$c98 = "create",
      peg$c99 = peg$literalExpectation("CREATE", true),
      peg$c100 = function(ref) {
        return {
          token: 'executableunit',
          kind: 'create',
          destinyGraph: ref,
        }
      },
      peg$c101 = "add",
      peg$c102 = peg$literalExpectation("ADD", true),
      peg$c103 = "to",
      peg$c104 = peg$literalExpectation("TO", true),
      peg$c105 = function(g1, g2) {
        return {
          token: 'executableunit',
          kind: 'add',
          graphs: [g1, g2],
        }
      },
      peg$c106 = "move",
      peg$c107 = peg$literalExpectation("MOVE", true),
      peg$c108 = function(g1, g2) {
        return {
          token: 'executableunit',
          kind: 'move',
          graphs: [g1, g2],
        }
      },
      peg$c109 = "copy",
      peg$c110 = peg$literalExpectation("COPY", true),
      peg$c111 = function(g1, g2) {
        return {
          token: 'executableunit',
          kind: 'copy',
          graphs: [g1, g2],
        }
      },
      peg$c112 = "insert",
      peg$c113 = peg$literalExpectation("INSERT", true),
      peg$c114 = "data",
      peg$c115 = peg$literalExpectation("DATA", true),
      peg$c116 = function(qs) {
        return {
          token: 'executableunit',
          kind: 'insertdata',
          quads: qs,
        }
      },
      peg$c117 = "delete",
      peg$c118 = peg$literalExpectation("DELETE", true),
      peg$c119 = function(qs) {
        return {
          token: 'executableunit',
          kind: 'deletedata',
          quads: qs,
        }
      },
      peg$c120 = function(p) {
        let patternsCollection = p.patterns[0];
        if (patternsCollection.triplesContext == null && patternsCollection.patterns != null) {
          patternsCollection = patternsCollection.patterns[0].triplesContext;
        } else {
          patternsCollection = patternsCollection.triplesContext;
        }

        let quads = [];
        for (let i = 0; i < patternsCollection.length; i++) {
          quads.push({
            subject: patternsCollection[i].subject,
            predicate: patternsCollection[i].predicate,
            object: patternsCollection[i].object,
            graph: patternsCollection[i].graph,
          });
        }

        return {
          kind: 'deletewhere',
          pattern: p,
          delete: quads,
          with: null,
          using: null,
        };
      },
      peg$c121 = "with",
      peg$c122 = peg$literalExpectation("WITH", true),
      peg$c123 = function(w, m, u, p) {
        let query = {
          kind: 'modify',
        };

        if (w) {
          query.with = w[2];
        }

        if (m.length === 3) {
          query.delete = m[0];
          if (m[2]) {
            query.insert = m[2];
          }
        } else {
          query.insert = m;
        }

        if (u.length) {
          query.using = u;
        }

        query.pattern = p;

        return query;
      },
      peg$c124 = function(q) {
        return q;
      },
      peg$c125 = "using",
      peg$c126 = peg$literalExpectation("USING", true),
      peg$c127 = function(g) {
        if (g.length != null) {
          return { kind: 'named', uri: g[2] };
        } else {
          return { kind: 'default', uri: g };
        }
      },
      peg$c128 = "DEFAULT",
      peg$c129 = peg$literalExpectation("DEFAULT", false),
      peg$c130 = "graph",
      peg$c131 = peg$literalExpectation("GRAPH", true),
      peg$c132 = function(i) {
        return i;
      },
      peg$c133 = "default",
      peg$c134 = peg$literalExpectation("DEFAULT", true),
      peg$c135 = function() {
        return 'default';
      },
      peg$c136 = function() {
        return 'named';
      },
      peg$c137 = "all",
      peg$c138 = peg$literalExpectation("ALL", true),
      peg$c139 = function() {
        return 'all';
      },
      peg$c140 = ".",
      peg$c141 = peg$literalExpectation(".", false),
      peg$c142 = function(ts, qs) {
        let quads = [];

        ts?.triplesContext.forEach((t) => {
          quads.push(t)
        });

        qs.forEach((q) => {
          quads = quads.concat(q[0].quadsContext);
          q[2]?.triplesContext.forEach((t) => {
            quads.push(t)
          });
        });
        
        return {
          token:'quads',
          quadsContext: quads,
          location: location(),
        }
      },
      peg$c143 = function(g, ts) {
        let quads = [];
        ts?.triplesContext.forEach((t) => {
          let triple = t;
          triple.graph = g;
          quads.push(triple)
        });
        
        return {
          token:'quadsnottriples',
          quadsContext: quads,
          location: location(),
        }
      },
      peg$c144 = function(b, bs) {
        let triples = b.triplesContext;
        if (bs && bs[3]) {
          triples = triples.concat(bs[3].triplesContext);
        }

        return {
          token:'triplestemplate',
          triplesContext: triples,
          location: location(),
        };
      },
      peg$c145 = function(p) {
        return p;
      },
      peg$c146 = function(tb, tbs) {
        let patterns = [];

        if (tb) {
          patterns.push(tb);
        }
        tbs.forEach((b) => {
          patterns.push(b[0]);
          if (b[4]) {
            patterns.push(b[4]);
          }
        });

        return {
          token: 'ggps',
          patterns: patterns,
          location: location(),
        }
      },
      peg$c147 = function(a, b) {
        let triples = a.triplesContext;
        if (b && b[3]) {
          triples = triples.concat(b[3].triplesContext);
        }
        
        return {
          token: 'triplesblock',
          triplesContext: triples,
          location: location(),
        }
      },
      peg$c148 = "optional",
      peg$c149 = peg$literalExpectation("OPTIONAL", true),
      peg$c150 = function(v) {
        return {
          token: 'optionalgraphpattern',
          value: v,
          location: location(),
        }
      },
      peg$c151 = function(g, gg) {
        return {
          token: 'graphgraphpattern',
          graph: g,
          value: gg,
        }
      },
      peg$c152 = "SERVICE",
      peg$c153 = peg$literalExpectation("SERVICE", false),
      peg$c154 = function(v, ggp) {
        return {
          token: 'servicegraphpattern',
          value: [v, ggp],
          location: location(),
        }
      },
      peg$c155 = "bind",
      peg$c156 = peg$literalExpectation("BIND", true),
      peg$c157 = function(ex, v) {
        return {
          token: 'bind',
          expression: ex,
          as: v,
          location: location(),
        };
      },
      peg$c158 = function(d) {
        return d;
      },
      peg$c159 = function(v, d) {
        return {
          token: 'inlineData',
          // values: [{
          //   'var': v,
          //   'value': d
          // }]
          var: v,
          values: d,
          location: location(),
        };
      },
      peg$c160 = function(vars, vals) {
        return {
          token: 'inlineDataFull',
          variables: vars,
          // values: vars.map((v, i) => { return  { 'var': v, 'value': vals[i] }; })
          values: vals,
          location: location(),
        };
      },
      peg$c161 = function(val) {
        return val;
      },
      peg$c162 = "UNDEF",
      peg$c163 = peg$literalExpectation("UNDEF", false),
      peg$c164 = "minus",
      peg$c165 = peg$literalExpectation("MINUS", true),
      peg$c166 = function(ggp) {
        return {
          token: 'minusgraphpattern',
          value: ggp,
          location: location(),
        }
      },
      peg$c167 = "union",
      peg$c168 = peg$literalExpectation("UNION", true),
      peg$c169 = function(a, b) {
        if (b.length === 0) {
          return a;
        }

        let lastToken = {
          token: 'graphunionpattern',
          location: location(),
          value: [a],
        };

        for (let i = 0; i < b.length; i++) {
          lastToken.value.push(b[i][3]);
        }

        return lastToken;
      },
      peg$c170 = "filter",
      peg$c171 = peg$literalExpectation("FILTER", true),
      peg$c172 = function(c) {
        return {
          token: 'filter',
          value: c,
          location: location(),
        }
      },
      peg$c173 = function(i, args) {
        return {
          token: "expression",
          expressionType: 'functioncall',
          iriref: i,
          args: args.value,
          location: location(),
        }
      },
      peg$c174 = function() {
        return {
          token: 'args',
          value: [],
        }
      },
      peg$c175 = ",",
      peg$c176 = peg$literalExpectation(",", false),
      peg$c177 = function(d, e, es) {
        return {
          token: 'args',
          distinct: Boolean(d),
          value: [e].concat(es.map((e) => e[2])),
        }
      },
      peg$c178 = function() {
        return [];
      },
      peg$c179 = function(e, es) {
        return [e].concat(es.map((e) => e[2]));
      },
      peg$c180 = function(ts) {
        return ts;
      },
      peg$c181 = function(b, bs) {
        let triples = b.triplesContext;
        if (bs != null && typeof(bs) === 'object') {
          if (bs.length != null) {
            if (bs[3] != null && bs[3].triplesContext != null) {
              triples = triples.concat(bs[3].triplesContext);
            }
          }
        }
        
        return {
          token:'triplestemplate',
          triplesContext: triples,
          location: location(),
        }
      },
      peg$c182 = function(s, pairs) {
        let triplesContext = pairs.triplesContext;

        pairs.pairs.forEach((pair) => {
          if (pair[1].length != null) {
            pair[1] = pair[1][0]
          }
          if (s.token && s.token === 'triplesnodecollection') {
            triplesContext.push({ subject: s.chainSubject[0], predicate: pair[0], object: pair[1] });
            triplesContext = triplesContext.concat(s.triplesContext);
          } else {
            triplesContext.push({ subject: s, predicate: pair[0], object: pair[1] });
          }
        });
        
        return {
          token: 'triplessamesubject',
          chainSubject: s,
          triplesContext: triplesContext,
        }
      },
      peg$c183 = function(tn, pairs) {
        let triplesContext = tn.triplesContext;

        if (pairs.pairs) {
          for (let i=0; i < pairs.pairs.length; i++) {
            const pair = pairs.pairs[i];
            if (pair[1].length != null) {
              pair[1] = pair[1][0]
            }
            if (tn.token === "triplesnodecollection") {
              for (let j = 0; j < tn.chainSubject.length; j++) {
                if (tn.chainSubject[j].triplesContext != null) {
                  triplesContext.concat(tn.chainSubject[j].triplesContext);
                } else {
                  triplesContext.push({ subject: tn.chainSubject[j], predicate: pair[0], object: pair[1] });
                }
              }
            } else {
              triplesContext.push({ subject: tn.chainSubject, predicate: pair[0], object: pair[1] });
            }
          }
        }
        
        return {
          token: "triplessamesubject",
          chainSubject: tn.chainSubject,
          triplesContext: triplesContext,
        }
      },
      peg$c184 = function(v, ol, rest) {
        let pairs = [];
        let triplesContext = [];
        ol.forEach((o) => {
          if (o.triplesContext) {
            triplesContext = triplesContext.concat(o.triplesContext);
            if (o.token === 'triplesnodecollection' && o.chainSubject.length ) {
              pairs.push([v, o.chainSubject[0]]);
            } else {
              pairs.push([v, o.chainSubject]);
            }
          } else {
            pairs.push([v, o])
          }
        });
        
        rest.forEach((r) => {
          if (r[3]) {
            r[3][2].forEach((o) => {
              if (o.triplesContext) {
                triplesContext = triplesContext.concat(o.triplesContext);
                pairs.push([r[3][0], o.chainSubject]);
              } else {
                pairs.push([r[3][0], o])
              }
            });
          }
        });
        
        return {
          token: 'propertylist',
          pairs: pairs,
          triplesContext: triplesContext,
        };
      },
      peg$c185 = "a",
      peg$c186 = peg$literalExpectation("a", false),
      peg$c187 = function() {
        return {
          token: 'uri',
          prefix: null,
          suffix: null,
          value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          location: location(),
        }
      },
      peg$c188 = function(o, os) {
        let ret = [o];

        os.forEach((oi) => {
          ret.push(oi[3]);
        });

        return ret;
      },
      peg$c189 = function(s, list) {
        let triplesContext = list.triplesContext;

        list.pairs.forEach((pair) => {
          triplesContext.push({ subject: s, predicate: pair[0], object: pair[1] });
        });

        return {
          token: 'triplessamesubject',
          chainSubject: s,
          triplesContext: triplesContext,
        }
      },
      peg$c190 = function(tn, pairs) {
        let triplesContext = tn.triplesContext;
        if (pairs != null && pairs.pairs != null) {
          for (let i = 0; i < pairs.pairs.length; i++) {
            const pair = pairs.pairs[i];
            if (pair[1].length != null) {
              pair[1] = pair[1][0];
            }
            if (tn.token === "triplesnodecollection") {
              for (let j = 0; j < tn.chainSubject.length; j++) {
                if (tn.chainSubject[j].triplesContext != null) {
                  triplesContext.concat(tn.chainSubject[j].triplesContext);
                } else {
                  triplesContext.push({ subject: tn.chainSubject[j], predicate: pair[0], object: pair[1] });
                }
              }
            } else {
              triplesContext.push({ subject: tn.chainSubject, predicate: pair[0], object: pair[1] });
            }
          }
        }

        return {
          token: "triplessamesubject",
          chainSubject: tn.chainSubject,
          triplesContext: triplesContext,
        };
      },
      peg$c191 = function(v, ol, rest) {
        let pairs = [];
        let triplesContext = [];
        ol.forEach((o) => {
          if (o.triplesContext) {
            triplesContext = triplesContext.concat(o.triplesContext);
            if (o.token === 'triplesnodecollection' && o.chainSubject.length ) {
              pairs.push([v, o.chainSubject[0]]);
            } else {
              pairs.push([v, o.chainSubject]);
            }
          } else {
            pairs.push([v, o])
          }
        });

        rest.forEach((r) => {
          if (r[3]) {
            r[3][2].forEach((o) => {
              if (o.triplesContext) {
                triplesContext = triplesContext.concat(o.triplesContext);
                pairs.push([r[3][0], o.chainSubject]);
              } else {
                pairs.push([r[3][0], o])
              }
            });
          }
        });
        
        return {
          token: 'propertylist',
          pairs: pairs,
          triplesContext: triplesContext,
        };
      },
      peg$c192 = "|",
      peg$c193 = peg$literalExpectation("|", false),
      peg$c194 = function(first, rest) {
        if (rest.length) {
          let arr = [first];
          for (let i = 0; i < rest.length; i++) {
            arr.push(rest[i][3]);
          }

          return {
            token: 'path',
            kind: 'alternative',
            value: arr,
            location: location(),
          };
        } else {
          return first;
        }
      },
      peg$c195 = "/",
      peg$c196 = peg$literalExpectation("/", false),
      peg$c197 = function(first, rest) {
        if (rest.length) {
          let arr = [first];
          for (let i = 0; i < rest.length; i++) {
            arr.push(rest[i][3]);
          }

          return {
            token: 'path',
            kind: 'sequence',
            value: arr,
            location: location(),
          };
        } else {
          return first;
        }
      },
      peg$c198 = function(p, mod) {
        if (p.token && p.token != 'path' && mod == '') {
          p.kind = 'primary' // for debug
          return p;
        }
        if (p.token && p.token != 'path' && mod != '') {
          return {
            token: 'path',
            kind: 'element',
            value: p,
            modifier: mod,
          }
        } else {
          p.modifier = mod;
          return p;
        }
      },
      peg$c199 = "^",
      peg$c200 = peg$literalExpectation("^", false),
      peg$c201 = function(elt) {
        return {
          token: 'path',
          kind: 'inversePath',
          value: elt,
        };
      },
      peg$c202 = "?",
      peg$c203 = peg$literalExpectation("?", false),
      peg$c204 = "+",
      peg$c205 = peg$literalExpectation("+", false),
      peg$c206 = function(m) {
        return m;
      },
      peg$c207 = "!",
      peg$c208 = peg$literalExpectation("!", false),
      peg$c209 = function(p) {
        p.bracketted = true;
        return p;
      },
      peg$c210 = function(c) {
        var triplesContext = [];
        var chainSubject = [];

        var triple = null;

        // catch NIL
        /*
         if(c.length == 1 && c[0].token && c[0].token === 'nil') {
         GlobalBlankNodeCounter++;
         return  {token: "triplesnodecollection",
         triplesContext:[{subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
         predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
         object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))}}],
         chainSubject:{token:'blank', value:("_:"+GlobalBlankNodeCounter)}};

         }
         */

        // other cases
        for(var i=0; i<c.length; i++) {
          GlobalBlankNodeCounter++;
          //_:b0  rdf:first  1 ;
          //rdf:rest   _:b1 .
          var nextObject = null;
          if(c[i].chainSubject == null && c[i].triplesContext == null) {
            nextObject = c[i];
          } else {
            nextObject = c[i].chainSubject;
            triplesContext = triplesContext.concat(nextObject.triplesContext);
          }
          triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                    predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'},
                    object:nextObject };

          if(i==0) {
            chainSubject.push(triple.subject);
          }

          triplesContext.push(triple);

          if(i===(c.length-1)) {
            triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                      predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                      object:   {token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'}};
          } else {
            triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                      predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                      object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))} };
          }

          triplesContext.push(triple);
        }

        return {token:"triplesnodecollection", triplesContext:triplesContext, chainSubject:chainSubject};
      },
      peg$c211 = "[",
      peg$c212 = peg$literalExpectation("[", false),
      peg$c213 = "]",
      peg$c214 = peg$literalExpectation("]", false),
      peg$c215 = function(pl) {
        GlobalBlankNodeCounter++;
        var subject = {token:'blank', value:'_:'+GlobalBlankNodeCounter};
        var newTriples =  [];

        for(var i=0; i< pl.pairs.length; i++) {
          var pair = pl.pairs[i];
          var triple = {}
          triple.subject = subject;
          triple.predicate = pair[0];
          if(pair[1].length != null)
            pair[1] = pair[1][0]
          triple.object = pair[1];
          newTriples.push(triple);
        }

        return {
          token: 'triplesnode',
          location: location(),
          kind: 'blanknodepropertylist',
          triplesContext: pl.triplesContext.concat(newTriples),
          chainSubject: subject
        };
      },
      peg$c216 = function(c) {
          var triplesContext = [];
          var chainSubject = [];

          var triple = null;

          // catch NIL
          /*
           if(c.length == 1 && c[0].token && c[0].token === 'nil') {
           GlobalBlankNodeCounter++;
           return  {token: "triplesnodecollection",
           triplesContext:[{subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
           predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
           object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))}}],
           chainSubject:{token:'blank', value:("_:"+GlobalBlankNodeCounter)}};

           }
           */

          // other cases
          for(var i=0; i<c.length; i++) {
              GlobalBlankNodeCounter++;
              //_:b0  rdf:first  1 ;
              //rdf:rest   _:b1 .
              var nextObject = null;
              if(c[i].chainSubject == null && c[i].triplesContext == null) {
                  nextObject = c[i];
              } else {
                  nextObject = c[i].chainSubject;
                  triplesContext = triplesContext.concat(c[i].triplesContext);
              }
              triple = {
                  subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                  predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'},
                  object:nextObject
              };

              if(i==0) {
                  chainSubject.push(triple.subject);
              }

              triplesContext.push(triple);

              if(i===(c.length-1)) {
                  triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                      predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                      object:   {token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'}};
              } else {
                  triple = {subject: {token:'blank', value:("_:"+GlobalBlankNodeCounter)},
                      predicate:{token:'uri', prefix:null, suffix:null, value:'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'},
                      object:  {token:'blank', value:("_:"+(GlobalBlankNodeCounter+1))} };
              }

              triplesContext.push(triple);
          }

            return {token:"triplesnodecollection", triplesContext:triplesContext, chainSubject:chainSubject,  location: location()};
      },
      peg$c217 = function(pl) {
        GlobalBlankNodeCounter++;

        const subject = {
          token: 'blank',
          value: '_:' + GlobalBlankNodeCounter,
        };

        let newTriples =  [];
        for (let i = 0; i < pl.pairs.length; i++) {
          const pair = pl.pairs[i];
          let triple = {
            subject: subject,
            predicate: pair[0],
          };
          if (pair[1].length != null) {
            pair[1] = pair[1][0];
          }
          triple.object = pair[1];
          newTriples.push(triple);
        }

        return {
          token: 'triplesnode',
          kind: 'blanknodepropertylist',
          chainSubject: subject,
          triplesContext: pl.triplesContext.concat(newTriples),
          location: location(),
        };
      },
      peg$c218 = function(gn) {
        return gn;
      },
      peg$c219 = function(v) {
        return {
          token: 'var',
          prefix: v.prefix,
          value: v.value,
          location: location(),
        }
      },
      peg$c220 = "||",
      peg$c221 = peg$literalExpectation("||", false),
      peg$c222 = function(v, vs) {
        if (vs.length === 0) {
          return v;
        }

        let operands = [v];
        for (let i = 0; i < vs.length; i++) {
          operands.push(vs[i][3]);
        }

        return {
          token: "expression",
          expressionType: "conditionalor",
          operands: operands,
        };
      },
      peg$c223 = "&&",
      peg$c224 = peg$literalExpectation("&&", false),
      peg$c225 = function(v, vs) {
        if (vs.length === 0) {
          return v;
        }

        let operands = [v];
        for (let i = 0; i < vs.length; i++) {
          operands.push(vs[i][3]);
        }  

        return {
          token: "expression",
          expressionType: "conditionaland",
          operands: operands,
        };
      },
      peg$c226 = "=",
      peg$c227 = peg$literalExpectation("=", false),
      peg$c228 = "!=",
      peg$c229 = peg$literalExpectation("!=", false),
      peg$c230 = "<",
      peg$c231 = peg$literalExpectation("<", false),
      peg$c232 = ">",
      peg$c233 = peg$literalExpectation(">", false),
      peg$c234 = "<=",
      peg$c235 = peg$literalExpectation("<=", false),
      peg$c236 = ">=",
      peg$c237 = peg$literalExpectation(">=", false),
      peg$c238 = "in",
      peg$c239 = peg$literalExpectation("IN", true),
      peg$c240 = "not",
      peg$c241 = peg$literalExpectation("NOT", true),
      peg$c242 = function(e1, e2) {
        if (e2.length) {
          const o1 = e1;
          let op = e2[0][1].toUpperCase();
          let o2 = e2[0][3];
          if (op === 'NOT') {
            op += ' ' + e2[0][3].toUpperCase();
            o2 = e2[0][5];
          }

          return {
            token: "expression",
            expressionType: "relationalexpression",
            operator: op,
            op1: o1,
            op2: o2,
          }
        } else {
          return e1;
        }
      },
      peg$c243 = "-",
      peg$c244 = peg$literalExpectation("-", false),
      peg$c245 = function(op1, ops) {
        if (ops.length === 0) {
          return op1;
        }

        let summands = [];
        ops.forEach((op) => {
          if (op.length == 4 && typeof(op[1]) === "string") {
            summands.push({ operator: op[1], expression: op[3] });
          } else {
            let sum = {};
            const firstFactor = sum[0];
            var operator = sum[1][1];
            var secondFactor = sum[1][3];
            var operator = null;
            if (firstFactor.value < 0) {
              sum.operator = '-';
              firstFactor.value = - firstFactor.value;
            } else {
              sum.operator = '+';
            }
            sum.expression = {
              token: 'expression',
              expressionType: 'multiplicativeexpression',
              operator: firstFactor,
              factors: [ { operator: operator, expression: secondFactor } ],
            };
            summands.push(sum);
          }
        });

        return {
          token: 'expression',
          expressionType: 'additiveexpression',
          summand: op1,
          summands: summands,
        };
      },
      peg$c246 = function(e1, es) {
        if (es.length === 0) {
          return e1;
        }
        
        let ret = {
          token: 'expression',
          expressionType: 'multiplicativeexpression',
          factor: e1,
          factors: [],
        };
        es.forEach((e) => {
          ret.factors.push({ operator: e[1], expression: e[3] });
        });
        
        return ret;
      },
      peg$c247 = function(e) {
        return {
          token: 'expression',
          expressionType: 'unaryexpression',
          unaryexpression: "!",
          expression: e,
        }
      },
      peg$c248 = function(v) {
        return {
          token: 'expression',
          expressionType: 'unaryexpression',
          unaryexpression: "+",
          expression: v,
        }
      },
      peg$c249 = function(v) {
        return {
          token: 'expression',
          expressionType: 'unaryexpression',
          unaryexpression: "-",
          expression: v,
        }
      },
      peg$c250 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'rdfliteral',
          value: v,
        }
      },
      peg$c251 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'numericliteral',
          value: v,
        }
      },
      peg$c252 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'booleanliteral',
          value: v,
        }
      },
      peg$c253 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'var',
          value: v,
        }
      },
      peg$c254 = function(e) {
        e.bracketted = 'true';
        return e;
      },
      peg$c255 = "str",
      peg$c256 = peg$literalExpectation("STR", true),
      peg$c257 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'str',
          args: [e],
        }
      },
      peg$c258 = "lang",
      peg$c259 = peg$literalExpectation("LANG", true),
      peg$c260 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'lang',
          args: [e],
        }
      },
      peg$c261 = "langmatches",
      peg$c262 = peg$literalExpectation("LANGMATCHES", true),
      peg$c263 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'langMatches',
          args: [e1, e2],
        }
      },
      peg$c264 = "datatype",
      peg$c265 = peg$literalExpectation("DATATYPE", true),
      peg$c266 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'datatype',
          args: [e],
        }
      },
      peg$c267 = "bound",
      peg$c268 = peg$literalExpectation("BOUND", true),
      peg$c269 = function(v) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'bound',
          args: [v],
        }
      },
      peg$c270 = "iri",
      peg$c271 = peg$literalExpectation("IRI", true),
      peg$c272 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'IRI',
          args: [e],
        }
      },
      peg$c273 = "uri",
      peg$c274 = peg$literalExpectation("URI", true),
      peg$c275 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'URI',
          args: [e],
        }
      },
      peg$c276 = "bnode",
      peg$c277 = peg$literalExpectation("BNODE", true),
      peg$c278 = function(arg) {
        const ret = {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'BNODE',
          args: null,
        };
        if (arg.length === 5) {
          ret.args = [arg[2]];
        }

        return ret;
      },
      peg$c279 = "rand",
      peg$c280 = peg$literalExpectation("RAND", true),
      peg$c281 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'rand',
        }
      },
      peg$c282 = "abs",
      peg$c283 = peg$literalExpectation("ABS", true),
      peg$c284 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'abs',
          args: [e],
        }
      },
      peg$c285 = "ceil",
      peg$c286 = peg$literalExpectation("CEIL", true),
      peg$c287 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'ceil',
          args: [e],
        }
      },
      peg$c288 = "floor",
      peg$c289 = peg$literalExpectation("FLOOR", true),
      peg$c290 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'floor',
          args: [e],
        }
      },
      peg$c291 = "round",
      peg$c292 = peg$literalExpectation("ROUND", true),
      peg$c293 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'ROUND',
          args: [e],
        }
      },
      peg$c294 = "concat",
      peg$c295 = peg$literalExpectation("CONCAT", true),
      peg$c296 = function(args) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'CONCAT',
          args: args,
        }
      },
      peg$c297 = "strlen",
      peg$c298 = peg$literalExpectation("STRLEN", true),
      peg$c299 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRLEN',
          args: [e],
        }
      },
      peg$c300 = "ucase",
      peg$c301 = peg$literalExpectation("UCASE", true),
      peg$c302 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'UCASE',
          args: [e],
        }
      },
      peg$c303 = "lcase",
      peg$c304 = peg$literalExpectation("LCASE", true),
      peg$c305 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'LCASE',
          args: [e],
        }
      },
      peg$c306 = "encode_for_uri",
      peg$c307 = peg$literalExpectation("ENCODE_FOR_URI", true),
      peg$c308 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'ENCODE_FOR_URI',
          args: [e],
        }
      },
      peg$c309 = "contains",
      peg$c310 = peg$literalExpectation("CONTAINS", true),
      peg$c311 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'CONTAINS',
          args: [e1, e2],
        }
      },
      peg$c312 = "strbefore",
      peg$c313 = peg$literalExpectation("STRBEFORE", true),
      peg$c314 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRBEFORE',
          args: [e1, e2],
        }
      },
      peg$c315 = "strstarts",
      peg$c316 = peg$literalExpectation("STRSTARTS", true),
      peg$c317 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRSTARTS',
          args: [e1, e2],
        }
      },
      peg$c318 = "strends",
      peg$c319 = peg$literalExpectation("STRENDS", true),
      peg$c320 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRENDS',
          args: [e1, e2],
        }
      },
      peg$c321 = "strafter",
      peg$c322 = peg$literalExpectation("STRAFTER", true),
      peg$c323 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRAFTER',
          args: [e1, e2],
        }
      },
      peg$c324 = "year",
      peg$c325 = peg$literalExpectation("YEAR", true),
      peg$c326 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'year',
          args: [e],
        }
      },
      peg$c327 = "month",
      peg$c328 = peg$literalExpectation("MONTH", true),
      peg$c329 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'month',
          args: [e],
        }
      },
      peg$c330 = "day",
      peg$c331 = peg$literalExpectation("DAY", true),
      peg$c332 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'day',
          args: [e],
        }
      },
      peg$c333 = "hours",
      peg$c334 = peg$literalExpectation("HOURS", true),
      peg$c335 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'hours',
          args: [e],
        }
      },
      peg$c336 = "minutes",
      peg$c337 = peg$literalExpectation("MINUTES", true),
      peg$c338 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'minutes',
          args: [e],
        }
      },
      peg$c339 = "seconds",
      peg$c340 = peg$literalExpectation("SECONDS", true),
      peg$c341 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'seconds',
          args: [e],
        }
      },
      peg$c342 = "timezone",
      peg$c343 = peg$literalExpectation("TIMEZONE", true),
      peg$c344 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'timezone',
          args: [e],
        }
      },
      peg$c345 = "tz",
      peg$c346 = peg$literalExpectation("TZ", true),
      peg$c347 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'tz',
          args: [e],
        }
      },
      peg$c348 = "now",
      peg$c349 = peg$literalExpectation("NOW", true),
      peg$c350 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'now',
        }
      },
      peg$c351 = "uuid",
      peg$c352 = peg$literalExpectation("UUID", true),
      peg$c353 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'UUID',
        }
      },
      peg$c354 = "struuid",
      peg$c355 = peg$literalExpectation("STRUUID", true),
      peg$c356 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRUUID',
        }
      },
      peg$c357 = "md5",
      peg$c358 = peg$literalExpectation("MD5", true),
      peg$c359 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'MD5',
          args: [e],
        }
      },
      peg$c360 = "sha1",
      peg$c361 = peg$literalExpectation("SHA1", true),
      peg$c362 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA1',
          args: [e],
        }
      },
      peg$c363 = "sha256",
      peg$c364 = peg$literalExpectation("SHA256", true),
      peg$c365 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA256',
          args: [e],
        }
      },
      peg$c366 = "sha384",
      peg$c367 = peg$literalExpectation("SHA384", true),
      peg$c368 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA384',
          args: [e],
        }
      },
      peg$c369 = "sha512",
      peg$c370 = peg$literalExpectation("SHA512", true),
      peg$c371 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA512',
          args: [e],
        }
      },
      peg$c372 = "coalesce",
      peg$c373 = peg$literalExpectation("COALESCE", true),
      peg$c374 = function(args) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'COALESCE',
          args: args,
        }
      },
      peg$c375 = "if",
      peg$c376 = peg$literalExpectation("IF", true),
      peg$c377 = function(test, trueCond, falseCond) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'IF',
          args: [test, trueCond, falseCond],
        }
      },
      peg$c378 = "strlang",
      peg$c379 = peg$literalExpectation("STRLANG", true),
      peg$c380 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRLANG',
          args: [e1, e2],
        }
      },
      peg$c381 = "strdt",
      peg$c382 = peg$literalExpectation("STRDT", true),
      peg$c383 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRDT',
          args: [e1, e2],
        }
      },
      peg$c384 = "sameterm",
      peg$c385 = peg$literalExpectation("sameTerm", true),
      peg$c386 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'sameTerm',
          args: [e1, e2],
        }
      },
      peg$c387 = "isuri",
      peg$c388 = peg$literalExpectation("isURI", true),
      peg$c389 = "isiri",
      peg$c390 = peg$literalExpectation("isIRI", true),
      peg$c391 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isURI',
          args: [arg],
        }
      },
      peg$c392 = "isblank",
      peg$c393 = peg$literalExpectation("isBLANK", true),
      peg$c394 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isBlank',
          args: [arg],
        }
      },
      peg$c395 = "isliteral",
      peg$c396 = peg$literalExpectation("isLITERAL", true),
      peg$c397 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isLiteral',
          args: [arg],
        }
      },
      peg$c398 = "isnumeric",
      peg$c399 = peg$literalExpectation("isNUMERIC", true),
      peg$c400 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isNumeric',
          args: [arg],
        }
      },
      peg$c401 = "custom:",
      peg$c402 = peg$literalExpectation("custom:", true),
      peg$c403 = /^[a-zA-Z0-9_]/,
      peg$c404 = peg$classExpectation([["a", "z"], ["A", "Z"], ["0", "9"], "_"], false, false),
      peg$c405 = function(fnname, alter, finalarg) {
        let ret = {
          token: 'expression',
          expressionType: 'custom',
          name: fnname.join(''),
        };

        let acum = [];
        for (let i = 0; i < alter.length; i++) {
          acum.push(alter[i][1]);
        }
        acum.push(finalarg);
        ret.args = acum;

        return ret;
      },
      peg$c406 = "regex",
      peg$c407 = peg$literalExpectation("REGEX", true),
      peg$c408 = function(e1, e2, e3) {
        return {
          token: 'expression',
          expressionType: 'regex',
          text: e1,
          pattern: e2,
          flags: e3 ? e3[2] : null,
        }
      },
      peg$c409 = "substr",
      peg$c410 = peg$literalExpectation("SUBSTR", true),
      peg$c411 = function(e1, e2, e3) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'substr',
          args: [
            e1,
            e2,
            e3 ? e3[2] : null
          ]
        }
      },
      peg$c412 = "replace",
      peg$c413 = peg$literalExpectation("REPLACE", true),
      peg$c414 = function(e1, e2, e3, e4) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'replace',
          args: [
            e1,
            e2,
            e3,
            e4 ? e4[2] : null
          ]
        }
      },
      peg$c415 = "exists",
      peg$c416 = peg$literalExpectation("EXISTS", true),
      peg$c417 = function(ggp) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'exists',
          args: [ggp],
        }
      },
      peg$c418 = function(ggp) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'notexists',
          args: [ggp],
        }
      },
      peg$c419 = "count",
      peg$c420 = peg$literalExpectation("COUNT", true),
      peg$c421 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'count',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c422 = "sum",
      peg$c423 = peg$literalExpectation("SUM", true),
      peg$c424 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'sum',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c425 = "min",
      peg$c426 = peg$literalExpectation("MIN", true),
      peg$c427 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'min',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c428 = "max",
      peg$c429 = peg$literalExpectation("MAX", true),
      peg$c430 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'max',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c431 = "avg",
      peg$c432 = peg$literalExpectation("AVG", true),
      peg$c433 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'avg',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c434 = "sample",
      peg$c435 = peg$literalExpectation("SAMPLE", true),
      peg$c436 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'sample',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c437 = "group_concat",
      peg$c438 = peg$literalExpectation("GROUP_CONCAT", true),
      peg$c439 = "separator",
      peg$c440 = peg$literalExpectation("SEPARATOR", true),
      peg$c441 = function(d, e, s) {
        let sep = null;
        if (s.length) {
          sep = s[7];
        }

        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'group_concat',
          expression: e,
          separator: sep,
          distinct: Boolean(d),
        }
      },
      peg$c442 = function(i, args) {
        return {
          token: "expression",
          expressionType: 'irireforfunction',
          iriref: i,
          args: (args != null ? args.value : args),
        };
      },
      peg$c443 = "^^",
      peg$c444 = peg$literalExpectation("^^", false),
      peg$c445 = function(s, e) {
        let ret = {
          token:'literal',
          value: s.value,
          lang: null,
          type: null,
          location: location(),
        };

        if (typeof(e) === "string") {
          ret.lang = e;
        } else if (e) {
          ret.type = e[1];
        }

        return ret;
      },
      peg$c446 = "true",
      peg$c447 = peg$literalExpectation("TRUE", true),
      peg$c448 = function() {
        return {
          token: "literal",
          value: true,
          type: "http://www.w3.org/2001/XMLSchema#boolean",
        }
      },
      peg$c449 = "false",
      peg$c450 = peg$literalExpectation("FALSE", true),
      peg$c451 = function() {
        return {
          token: "literal",
          value: false,
          type: "http://www.w3.org/2001/XMLSchema#boolean",
        }
      },
      peg$c452 = function(s) {
        return {
          token: 'string',
          value: s,
          location: location(),
        }
      },
      peg$c453 = function(s) {
        return {
          token:'string',
          value: s,
          location: location(),
        }
      },
      peg$c454 = function(iri) {
        return {
          token: 'uri',
          prefix: null,
          suffix: null,
          value: iri,
          location: location(),
        }
      },
      peg$c455 = function(p) {
        return p
      },
      peg$c456 = function(p) {
        return {
          token: 'uri',
          prefix: p[0],
          suffix: p[1],
          value: null,
          location: location(),
        }
      },
      peg$c457 = function(p) {
        return {
          token: 'uri',
          prefix: p,
          suffix: '',
          value: null,
          location: location(),
        }
      },
      peg$c458 = function(l) {
        return {
          token: 'blank',
          value: l,
          location: location(),
        }
      },
      peg$c459 = function() { 
        GlobalBlankNodeCounter++;
        return {
          token: 'blank',
          value: '_:' + GlobalBlankNodeCounter,
          location: location(),
        }
      },
      peg$c460 = /^[^<>"{}|\^`\\]/,
      peg$c461 = peg$classExpectation(["<", ">", "\"", "{", "}", "|", "^", "`", "\\"], true, false),
      peg$c462 = function(i) {
        return i.join('')
      },
      peg$c463 = ":",
      peg$c464 = peg$literalExpectation(":", false),
      peg$c465 = function(p, s) {
        return [p, s]
      },
      peg$c466 = "_:",
      peg$c467 = peg$literalExpectation("_:", false),
      peg$c468 = function(l) {
        return l
      },
      peg$c469 = function(v) {
        return {
          prefix: "?",
          value: v,
        }
      },
      peg$c470 = "$",
      peg$c471 = peg$literalExpectation("$", false),
      peg$c472 = function(v) {
        return {
          prefix: "$",
          value: v,
        }
      },
      peg$c473 = "{{",
      peg$c474 = peg$literalExpectation("{{", false),
      peg$c475 = "}}",
      peg$c476 = peg$literalExpectation("}}", false),
      peg$c477 = function(v) {
        return {
          prefix: 'mustash',
          value: v,
        }
      },
      peg$c478 = "@",
      peg$c479 = peg$literalExpectation("@", false),
      peg$c480 = /^[a-zA-Z]/,
      peg$c481 = peg$classExpectation([["a", "z"], ["A", "Z"]], false, false),
      peg$c482 = /^[a-zA-Z0-9]/,
      peg$c483 = peg$classExpectation([["a", "z"], ["A", "Z"], ["0", "9"]], false, false),
      peg$c484 = function(a, b) {
        let lang = a.join('');

        if (b.length) {
          lang += '-' + b[0][1].join('');
        }

        return lang.toLowerCase();
      },
      peg$c485 = /^[0-9]/,
      peg$c486 = peg$classExpectation([["0", "9"]], false, false),
      peg$c487 = function(d) {
        return {
          token: "literal",
          value: flattenString(d),
          type: "http://www.w3.org/2001/XMLSchema#integer",
        }
      },
      peg$c488 = function(a, b, c) {
        return {
          token: "literal",
          value: flattenString([a, b, c]),
          type: "http://www.w3.org/2001/XMLSchema#decimal",
        }
      },
      peg$c489 = function(a, b) {
        return {
          token: "literal",
          value: flattenString([a, b]),
          type: "http://www.w3.org/2001/XMLSchema#decimal",
        }
      },
      peg$c490 = function(a, b, c, e) {
        return {
          token: "literal",
          value: flattenString([a, b, c, e]),
          type: "http://www.w3.org/2001/XMLSchema#double",
        }
      },
      peg$c491 = function(a, b, c) {
        return {
          token: "literal",
          value: flattenString([a, b, c]),
          type: "http://www.w3.org/2001/XMLSchema#double",
        }
      },
      peg$c492 = function(a, b) {
        return {
          token: "literal",
          value: flattenString([a, b]),
          type: "http://www.w3.org/2001/XMLSchema#double",
        }
      },
      peg$c493 = function(d) {
        d.value = "+" + d.value;
        return d;
      },
      peg$c494 = function(d) {
        d.value = "-" + d.value;
        return d;
      },
      peg$c495 = /^[eE]/,
      peg$c496 = peg$classExpectation(["e", "E"], false, false),
      peg$c497 = /^[+\-]/,
      peg$c498 = peg$classExpectation(["+", "-"], false, false),
      peg$c499 = function(a, b, c) {
        return flattenString([a,b,c]);
      },
      peg$c500 = "'",
      peg$c501 = peg$literalExpectation("'", false),
      peg$c502 = /^[^'\\\n\r]/,
      peg$c503 = peg$classExpectation(["'", "\\", "\n", "\r"], true, false),
      peg$c504 = function(content) {
        return flattenString(content);
      },
      peg$c505 = "\"",
      peg$c506 = peg$literalExpectation("\"", false),
      peg$c507 = /^[^"\\\n\r]/,
      peg$c508 = peg$classExpectation(["\"", "\\", "\n", "\r"], true, false),
      peg$c509 = "'''",
      peg$c510 = peg$literalExpectation("'''", false),
      peg$c511 = /^[^'\\]/,
      peg$c512 = peg$classExpectation(["'", "\\"], true, false),
      peg$c513 = "\"\"\"",
      peg$c514 = peg$literalExpectation("\"\"\"", false),
      peg$c515 = /^[^"\\]/,
      peg$c516 = peg$classExpectation(["\"", "\\"], true, false),
      peg$c517 = "\\",
      peg$c518 = peg$literalExpectation("\\", false),
      peg$c519 = /^[tbnrf\\"']/,
      peg$c520 = peg$classExpectation(["t", "b", "n", "r", "f", "\\", "\"", "'"], false, false),
      peg$c521 = function() {
        return {
          token: "triplesnodecollection",
          location: location(),
          triplesContext:[],
          chainSubject:[{token:'uri', value:"http://www.w3.org/1999/02/22-rdf-syntax-ns#nil"}]};
      },
      peg$c522 = /^[ \t]/,
      peg$c523 = peg$classExpectation([" ", "\t"], false, false),
      peg$c524 = /^[\n\r]/,
      peg$c525 = peg$classExpectation(["\n", "\r"], false, false),
      peg$c526 = /^[^\n\r]/,
      peg$c527 = peg$classExpectation(["\n", "\r"], true, false),
      peg$c528 = "#",
      peg$c529 = peg$literalExpectation("#", false),
      peg$c530 = function(h) {
        return flattenString(h);
      },
      peg$c531 = function(comment) {
        const line = location().start.line;
        Comments[line] = flattenString(comment);

        return '';
      },
      peg$c532 = /^[A-Z]/,
      peg$c533 = peg$classExpectation([["A", "Z"]], false, false),
      peg$c534 = /^[a-z]/,
      peg$c535 = peg$classExpectation([["a", "z"]], false, false),
      peg$c536 = /^[\xC0-\xD6]/,
      peg$c537 = peg$classExpectation([["\xC0", "\xD6"]], false, false),
      peg$c538 = /^[\xD8-\xF6]/,
      peg$c539 = peg$classExpectation([["\xD8", "\xF6"]], false, false),
      peg$c540 = /^[\xF8-\u02FF]/,
      peg$c541 = peg$classExpectation([["\xF8", "\u02FF"]], false, false),
      peg$c542 = /^[\u0370-\u037D]/,
      peg$c543 = peg$classExpectation([["\u0370", "\u037D"]], false, false),
      peg$c544 = /^[\u037F-\u1FFF]/,
      peg$c545 = peg$classExpectation([["\u037F", "\u1FFF"]], false, false),
      peg$c546 = /^[\u200C-\u200D]/,
      peg$c547 = peg$classExpectation([["\u200C", "\u200D"]], false, false),
      peg$c548 = /^[\u2070-\u218F]/,
      peg$c549 = peg$classExpectation([["\u2070", "\u218F"]], false, false),
      peg$c550 = /^[\u2C00-\u2FEF]/,
      peg$c551 = peg$classExpectation([["\u2C00", "\u2FEF"]], false, false),
      peg$c552 = /^[\u3001-\uD7FF]/,
      peg$c553 = peg$classExpectation([["\u3001", "\uD7FF"]], false, false),
      peg$c554 = /^[\uF900-\uFDCF]/,
      peg$c555 = peg$classExpectation([["\uF900", "\uFDCF"]], false, false),
      peg$c556 = /^[\uFDF0-\uFFFD]/,
      peg$c557 = peg$classExpectation([["\uFDF0", "\uFFFD"]], false, false),
      peg$c558 = /^[\u1000-\uEFFF]/,
      peg$c559 = peg$classExpectation([["\u1000", "\uEFFF"]], false, false),
      peg$c560 = "_",
      peg$c561 = peg$literalExpectation("_", false),
      peg$c562 = /^[\xB7]/,
      peg$c563 = peg$classExpectation(["\xB7"], false, false),
      peg$c564 = /^[\u0300-\u036F]/,
      peg$c565 = peg$classExpectation([["\u0300", "\u036F"]], false, false),
      peg$c566 = /^[\u203F-\u2040]/,
      peg$c567 = peg$classExpectation([["\u203F", "\u2040"]], false, false),
      peg$c568 = function(init, rpart) { return init+rpart.join('') },
      peg$c569 = function(base, rest) { 
        if (rest[rest.length-1] == '.') {
          throw new Error("Wrong PN_PREFIX, cannot finish with '.'")
        } else {
          return base + rest.join('');
        }
      },
      peg$c570 = function(base, rest) {
        return base + (rest||[]).join('');
      },
      peg$c571 = "%",
      peg$c572 = peg$literalExpectation("%", false),
      peg$c573 = function(h) {
        return h.join("");
      },
      peg$c574 = /^[A-F]/,
      peg$c575 = peg$classExpectation([["A", "F"]], false, false),
      peg$c576 = /^[a-f]/,
      peg$c577 = peg$classExpectation([["a", "f"]], false, false),
      peg$c578 = "~",
      peg$c579 = peg$literalExpectation("~", false),
      peg$c580 = "&",
      peg$c581 = peg$literalExpectation("&", false),
      peg$c582 = function(c) {
        return "\\"+c;
      },

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parseDOCUMENT() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseHEADER_LINE();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseHEADER_LINE();
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseSPARQL();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseFunction();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseFunction();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c0(s1, s3, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSPARQL() {
    var s0;

    s0 = peg$parseQuery();
    if (s0 === peg$FAILED) {
      s0 = peg$parseUpdate();
    }

    return s0;
  }

  function peg$parseQuery() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parsePrologue();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseFunction();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseFunction();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSelectQuery();
            if (s5 === peg$FAILED) {
              s5 = peg$parseConstructQuery();
              if (s5 === peg$FAILED) {
                s5 = peg$parseDescribeQuery();
                if (s5 === peg$FAILED) {
                  s5 = peg$parseAskQuery();
                }
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseValuesClause();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c1(s1, s3, s5, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseFunction() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    s1 = peg$parseFunctionCall();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c2(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePrologue() {
    var s0, s1;

    s0 = [];
    s1 = peg$parseBaseDecl();
    if (s1 === peg$FAILED) {
      s1 = peg$parsePrefixDecl();
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      s1 = peg$parseBaseDecl();
      if (s1 === peg$FAILED) {
        s1 = peg$parsePrefixDecl();
      }
    }

    return s0;
  }

  function peg$parseBaseDecl() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c3) {
        s2 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c4); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseIRIREF();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c5(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePrefixDecl() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c6) {
        s2 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c7); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsePNAME_NS();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseIRIREF();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c8(s4, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSelectQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseSelectClause();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseDatasetClause();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseDatasetClause();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseWhereClause();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseSolutionModifier();
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c9(s1, s3, s5, s7);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSubSelect() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    s1 = peg$parseSelectClause();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseWhereClause();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSolutionModifier();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c10(s1, s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSelectClause() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c11) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c12); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
          s3 = input.substr(peg$currPos, 8);
          peg$currPos += 8;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c14); }
        }
        if (s3 === peg$FAILED) {
          if (input.substr(peg$currPos, 7).toLowerCase() === peg$c15) {
            s3 = input.substr(peg$currPos, 7);
            peg$currPos += 7;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c16); }
          }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$currPos;
            s7 = [];
            s8 = peg$parseWS();
            while (s8 !== peg$FAILED) {
              s7.push(s8);
              s8 = peg$parseWS();
            }
            if (s7 !== peg$FAILED) {
              s8 = peg$parseVar();
              if (s8 !== peg$FAILED) {
                s7 = [s7, s8];
                s6 = s7;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 === peg$FAILED) {
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 40) {
                  s8 = peg$c17;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseConditionalOrExpression();
                    if (s10 !== peg$FAILED) {
                      s11 = [];
                      s12 = peg$parseWS();
                      while (s12 !== peg$FAILED) {
                        s11.push(s12);
                        s12 = peg$parseWS();
                      }
                      if (s11 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                          s12 = input.substr(peg$currPos, 2);
                          peg$currPos += 2;
                        } else {
                          s12 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c20); }
                        }
                        if (s12 !== peg$FAILED) {
                          s13 = [];
                          s14 = peg$parseWS();
                          while (s14 !== peg$FAILED) {
                            s13.push(s14);
                            s14 = peg$parseWS();
                          }
                          if (s13 !== peg$FAILED) {
                            s14 = peg$parseVar();
                            if (s14 !== peg$FAILED) {
                              s15 = [];
                              s16 = peg$parseWS();
                              while (s16 !== peg$FAILED) {
                                s15.push(s16);
                                s16 = peg$parseWS();
                              }
                              if (s15 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 41) {
                                  s16 = peg$c21;
                                  peg$currPos++;
                                } else {
                                  s16 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                }
                                if (s16 !== peg$FAILED) {
                                  s7 = [s7, s8, s9, s10, s11, s12, s13, s14, s15, s16];
                                  s6 = s7;
                                } else {
                                  peg$currPos = s6;
                                  s6 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s6;
                                s6 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s6;
                              s6 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s6;
                            s6 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            }
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseVar();
                  if (s8 !== peg$FAILED) {
                    s7 = [s7, s8];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
                if (s6 === peg$FAILED) {
                  s6 = peg$currPos;
                  s7 = [];
                  s8 = peg$parseWS();
                  while (s8 !== peg$FAILED) {
                    s7.push(s8);
                    s8 = peg$parseWS();
                  }
                  if (s7 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 40) {
                      s8 = peg$c17;
                      peg$currPos++;
                    } else {
                      s8 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = [];
                      s10 = peg$parseWS();
                      while (s10 !== peg$FAILED) {
                        s9.push(s10);
                        s10 = peg$parseWS();
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parseConditionalOrExpression();
                        if (s10 !== peg$FAILED) {
                          s11 = [];
                          s12 = peg$parseWS();
                          while (s12 !== peg$FAILED) {
                            s11.push(s12);
                            s12 = peg$parseWS();
                          }
                          if (s11 !== peg$FAILED) {
                            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                              s12 = input.substr(peg$currPos, 2);
                              peg$currPos += 2;
                            } else {
                              s12 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c20); }
                            }
                            if (s12 !== peg$FAILED) {
                              s13 = [];
                              s14 = peg$parseWS();
                              while (s14 !== peg$FAILED) {
                                s13.push(s14);
                                s14 = peg$parseWS();
                              }
                              if (s13 !== peg$FAILED) {
                                s14 = peg$parseVar();
                                if (s14 !== peg$FAILED) {
                                  s15 = [];
                                  s16 = peg$parseWS();
                                  while (s16 !== peg$FAILED) {
                                    s15.push(s16);
                                    s16 = peg$parseWS();
                                  }
                                  if (s15 !== peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 41) {
                                      s16 = peg$c21;
                                      peg$currPos++;
                                    } else {
                                      s16 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                    }
                                    if (s16 !== peg$FAILED) {
                                      s7 = [s7, s8, s9, s10, s11, s12, s13, s14, s15, s16];
                                      s6 = s7;
                                    } else {
                                      peg$currPos = s6;
                                      s6 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s6;
                                    s6 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s6;
                                  s6 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s6;
                                s6 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s6;
                              s6 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s6;
                            s6 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 42) {
                s5 = peg$c23;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c24); }
              }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c25(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConstructQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 9).toLowerCase() === peg$c26) {
      s1 = input.substr(peg$currPos, 9);
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c27); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseConstructTemplate();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseDatasetClause();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseDatasetClause();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseWhereClause();
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseSolutionModifier();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c28(s3, s5, s7, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 9).toLowerCase() === peg$c26) {
        s1 = input.substr(peg$currPos, 9);
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c27); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseDatasetClause();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseDatasetClause();
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
                s5 = input.substr(peg$currPos, 5);
                peg$currPos += 5;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c30); }
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 123) {
                    s7 = peg$c31;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c32); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = [];
                    s9 = peg$parseWS();
                    while (s9 !== peg$FAILED) {
                      s8.push(s9);
                      s9 = peg$parseWS();
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parseTriplesTemplate();
                      if (s9 === peg$FAILED) {
                        s9 = null;
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = [];
                        s11 = peg$parseWS();
                        while (s11 !== peg$FAILED) {
                          s10.push(s11);
                          s11 = peg$parseWS();
                        }
                        if (s10 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 125) {
                            s11 = peg$c33;
                            peg$currPos++;
                          } else {
                            s11 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c34); }
                          }
                          if (s11 !== peg$FAILED) {
                            s12 = [];
                            s13 = peg$parseWS();
                            while (s13 !== peg$FAILED) {
                              s12.push(s13);
                              s13 = peg$parseWS();
                            }
                            if (s12 !== peg$FAILED) {
                              s13 = peg$parseSolutionModifier();
                              if (s13 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c35(s3, s9, s13);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseDescribeQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c36) {
      s1 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c37); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseVarOrIri();
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseVarOrIri();
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 42) {
            s3 = peg$c23;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c24); }
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseDatasetClause();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseDatasetClause();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseWhereClause();
                if (s7 === peg$FAILED) {
                  s7 = null;
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseSolutionModifier();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c38(s3, s7);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAskQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c39) {
        s2 = input.substr(peg$currPos, 3);
        peg$currPos += 3;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c40); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseDatasetClause();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseDatasetClause();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseWhereClause();
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c41(s4, s6);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDatasetClause() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c42) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c43); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseDefaultGraphClause();
        if (s3 === peg$FAILED) {
          s3 = peg$parseNamedGraphClause();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c44(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDefaultGraphClause() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseIRIref();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c45(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNamedGraphClause() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c46) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c47); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseIRIref();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c48(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseWhereClause() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c30); }
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c49(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSolutionModifier() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseGroupClause();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseHavingClause();
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseOrderClause();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseLimitOffsetClauses();
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c50(s1, s2, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupClause() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c51) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c52); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c53) {
          s3 = input.substr(peg$currPos, 2);
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c54); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseGroupCondition();
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$parseGroupCondition();
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c55(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupCondition() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseBuiltInCall();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c56(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseWS();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parseWS();
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionCall();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseWS();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseWS();
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c57(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseWS();
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseWS();
        }
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s2 = peg$c17;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s2 !== peg$FAILED) {
            s3 = [];
            s4 = peg$parseWS();
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = peg$parseWS();
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseConditionalOrExpression();
              if (s4 !== peg$FAILED) {
                s5 = [];
                s6 = peg$parseWS();
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  s6 = peg$parseWS();
                }
                if (s5 !== peg$FAILED) {
                  s6 = peg$currPos;
                  if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                    s7 = input.substr(peg$currPos, 2);
                    peg$currPos += 2;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c20); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = [];
                    s9 = peg$parseWS();
                    while (s9 !== peg$FAILED) {
                      s8.push(s9);
                      s9 = peg$parseWS();
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parseVar();
                      if (s9 !== peg$FAILED) {
                        s7 = [s7, s8, s9];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                  if (s6 === peg$FAILED) {
                    s6 = null;
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = [];
                    s8 = peg$parseWS();
                    while (s8 !== peg$FAILED) {
                      s7.push(s8);
                      s8 = peg$parseWS();
                    }
                    if (s7 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s8 = peg$c21;
                        peg$currPos++;
                      } else {
                        s8 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                      }
                      if (s8 !== peg$FAILED) {
                        s9 = [];
                        s10 = peg$parseWS();
                        while (s10 !== peg$FAILED) {
                          s9.push(s10);
                          s10 = peg$parseWS();
                        }
                        if (s9 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c58(s4, s6);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = [];
          s2 = peg$parseWS();
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseWS();
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseVar();
            if (s2 !== peg$FAILED) {
              s3 = [];
              s4 = peg$parseWS();
              while (s4 !== peg$FAILED) {
                s3.push(s4);
                s4 = peg$parseWS();
              }
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c59(s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    return s0;
  }

  function peg$parseHavingClause() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c60) {
      s1 = peg$c60;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c61); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseConstraint();
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseConstraint();
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c62(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseOrderClause() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c63) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c64); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c53) {
          s3 = input.substr(peg$currPos, 2);
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c54); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseOrderCondition();
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$parseOrderCondition();
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c65(s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseOrderCondition() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c66) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c67); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c68) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c69); }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseBrackettedExpression();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c70(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseConstraint();
      if (s1 === peg$FAILED) {
        s1 = peg$parseVar();
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c71(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseLimitOffsetClauses() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$parseLimitClause();
    if (s2 !== peg$FAILED) {
      s3 = peg$parseOffsetClause();
      if (s3 === peg$FAILED) {
        s3 = null;
      }
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = peg$currPos;
      s2 = peg$parseOffsetClause();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseLimitClause();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s2 = [s2, s3];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c72(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseLimitClause() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c73) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c74); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseINTEGER();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c75(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseOffsetClause() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c76) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c77); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseINTEGER();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c78(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseValuesClause() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c79) {
      s2 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c80); }
    }
    if (s2 !== peg$FAILED) {
      s3 = peg$parseDataBlock();
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c81(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseUpdate() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parsePrologue();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        s4 = peg$parseUpdate1();
        if (s4 !== peg$FAILED) {
          s5 = peg$currPos;
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 59) {
              s7 = peg$c82;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c83); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$parseUpdate();
                if (s9 !== peg$FAILED) {
                  s6 = [s6, s7, s8, s9];
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          if (s5 !== peg$FAILED) {
            s3 = [s3, s4, s5];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c84(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseUpdate1() {
    var s0;

    s0 = peg$parseLoad();
    if (s0 === peg$FAILED) {
      s0 = peg$parseClear();
      if (s0 === peg$FAILED) {
        s0 = peg$parseDrop();
        if (s0 === peg$FAILED) {
          s0 = peg$parseCreate();
          if (s0 === peg$FAILED) {
            s0 = peg$parseInsertData();
            if (s0 === peg$FAILED) {
              s0 = peg$parseDeleteData();
              if (s0 === peg$FAILED) {
                s0 = peg$parseDeleteWhere();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseModify();
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseLoad() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c85) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c86); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseIRIref();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$currPos;
            if (input.substr(peg$currPos, 4).toLowerCase() === peg$c87) {
              s6 = input.substr(peg$currPos, 4);
              peg$currPos += 4;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c88); }
            }
            if (s6 !== peg$FAILED) {
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                s8 = peg$parseGraphRef();
                if (s8 !== peg$FAILED) {
                  s6 = [s6, s7, s8];
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c89(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseClear() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c90) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c91); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c92) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c93); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphRefAll();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c94(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDrop() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c95) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c96); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c92) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c93); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphRefAll();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c97(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCreate() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c98) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c99); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c92) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c93); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphRef();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c100(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAdd() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c101) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c102); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c92) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c93); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphOrDefault();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c103) {
                  s7 = input.substr(peg$currPos, 2);
                  peg$currPos += 2;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c104); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseGraphOrDefault();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c105(s5, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseMove() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c106) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c107); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c92) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c93); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphOrDefault();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c103) {
                  s7 = input.substr(peg$currPos, 2);
                  peg$currPos += 2;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c104); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseGraphOrDefault();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c108(s5, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCopy() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c109) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c110); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c92) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c93); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphOrDefault();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c103) {
                  s7 = input.substr(peg$currPos, 2);
                  peg$currPos += 2;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c104); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseGraphOrDefault();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c111(s5, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInsertData() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c112) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c113); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c114) {
          s3 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c115); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseQuadData();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c116(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDeleteData() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c117) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c118); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c114) {
          s3 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c115); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseQuadData();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c119(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDeleteWhere() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c117) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c118); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
          s3 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c30); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGroupGraphPattern();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c120(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseModify() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c121) {
      s2 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c122); }
    }
    if (s2 !== peg$FAILED) {
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        s4 = peg$parseIRIref();
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s2 = [s2, s3, s4, s5];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = peg$parseDeleteClause();
      if (s3 !== peg$FAILED) {
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parseInsertClause();
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          if (s5 !== peg$FAILED) {
            s3 = [s3, s4, s5];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = peg$parseInsertClause();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseUsingClause();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseUsingClause();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
                s6 = input.substr(peg$currPos, 5);
                peg$currPos += 5;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c30); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseGroupGraphPattern();
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c123(s1, s2, s4, s8);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDeleteClause() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c117) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c118); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseQuadPattern();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c124(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInsertClause() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c112) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c113); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseQuadPattern();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c124(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseUsingClause() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c125) {
        s2 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c126); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseIRIref();
          if (s4 === peg$FAILED) {
            s4 = peg$currPos;
            if (input.substr(peg$currPos, 5).toLowerCase() === peg$c46) {
              s5 = input.substr(peg$currPos, 5);
              peg$currPos += 5;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c47); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseIRIref();
                if (s7 !== peg$FAILED) {
                  s5 = [s5, s6, s7];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c127(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphOrDefault() {
    var s0, s1, s2, s3;

    if (input.substr(peg$currPos, 7) === peg$c128) {
      s0 = peg$c128;
      peg$currPos += 7;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c129); }
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c130) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c131); }
      }
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseIRIref();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c132(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseGraphRef() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c130) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c131); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseIRIref();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c132(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphRefAll() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseGraphRef();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c49(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 7).toLowerCase() === peg$c133) {
        s1 = input.substr(peg$currPos, 7);
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c134); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c135();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c46) {
          s1 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c47); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c136();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c137) {
            s1 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c138); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c139();
          }
          s0 = s1;
        }
      }
    }

    return s0;
  }

  function peg$parseQuadPattern() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 123) {
        s2 = peg$c31;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseQuads();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s6 = peg$c33;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c34); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c124(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseQuadData() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 123) {
        s2 = peg$c31;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseQuads();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s6 = peg$c33;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c34); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c124(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseQuads() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesTemplate();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$parseQuadsNotTriples();
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s5 = peg$c140;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c141); }
        }
        if (s5 === peg$FAILED) {
          s5 = null;
        }
        if (s5 !== peg$FAILED) {
          s6 = peg$parseTriplesTemplate();
          if (s6 === peg$FAILED) {
            s6 = null;
          }
          if (s6 !== peg$FAILED) {
            s4 = [s4, s5, s6];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = peg$parseQuadsNotTriples();
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s5 = peg$c140;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c141); }
          }
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseTriplesTemplate();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s4 = [s4, s5, s6];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c142(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseQuadsNotTriples() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c130) {
        s2 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c131); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseVarOrIri();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 123) {
                s6 = peg$c31;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c32); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseTriplesTemplate();
                  if (s8 === peg$FAILED) {
                    s8 = null;
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 125) {
                        s10 = peg$c33;
                        peg$currPos++;
                      } else {
                        s10 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c34); }
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = [];
                        s12 = peg$parseWS();
                        while (s12 !== peg$FAILED) {
                          s11.push(s12);
                          s12 = peg$parseWS();
                        }
                        if (s11 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c143(s4, s8);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesTemplate() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesSameSubject();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c140;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c141); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseTriplesTemplate();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c144(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupGraphPattern() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseSubSelect();
        if (s3 === peg$FAILED) {
          s3 = peg$parseGroupGraphPatternSub();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c33;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c34); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c145(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupGraphPatternSub() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parseTriplesBlock();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$currPos;
        s5 = peg$parseGraphPatternNotTriples();
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 46) {
              s7 = peg$c140;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c141); }
            }
            if (s7 === peg$FAILED) {
              s7 = null;
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$parseTriplesBlock();
                if (s9 === peg$FAILED) {
                  s9 = null;
                }
                if (s9 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8, s9];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$currPos;
          s5 = peg$parseGraphPatternNotTriples();
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 46) {
                s7 = peg$c140;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c141); }
              }
              if (s7 === peg$FAILED) {
                s7 = null;
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$parseTriplesBlock();
                  if (s9 === peg$FAILED) {
                    s9 = null;
                  }
                  if (s9 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8, s9];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c146(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesBlock() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesSameSubjectPath();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c140;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c141); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseTriplesBlock();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c147(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphPatternNotTriples() {
    var s0;

    s0 = peg$parseGroupOrUnionGraphPattern();
    if (s0 === peg$FAILED) {
      s0 = peg$parseOptionalGraphPattern();
      if (s0 === peg$FAILED) {
        s0 = peg$parseMinusGraphPattern();
        if (s0 === peg$FAILED) {
          s0 = peg$parseGraphGraphPattern();
          if (s0 === peg$FAILED) {
            s0 = peg$parseServiceGraphPattern();
            if (s0 === peg$FAILED) {
              s0 = peg$parseFilter();
              if (s0 === peg$FAILED) {
                s0 = peg$parseBind();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseInlineData();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseFunctionCall();
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseOptionalGraphPattern() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c148) {
        s2 = input.substr(peg$currPos, 8);
        peg$currPos += 8;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c149); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseGroupGraphPattern();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c150(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphGraphPattern() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c130) {
        s2 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c131); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseVarOrIri();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseGroupGraphPattern();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c151(s4, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseServiceGraphPattern() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7) === peg$c152) {
      s1 = peg$c152;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c153); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseVarOrIri();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGroupGraphPattern();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c154(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseBind() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c155) {
        s2 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c156); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s4 = peg$c17;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseConditionalOrExpression();
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                    s8 = input.substr(peg$currPos, 2);
                    peg$currPos += 2;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c20); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseVar();
                      if (s10 !== peg$FAILED) {
                        s11 = [];
                        s12 = peg$parseWS();
                        while (s12 !== peg$FAILED) {
                          s11.push(s12);
                          s12 = peg$parseWS();
                        }
                        if (s11 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s12 = peg$c21;
                            peg$currPos++;
                          } else {
                            s12 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                          }
                          if (s12 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c157(s6, s10);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInlineData() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c79) {
        s2 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c80); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseDataBlock();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c158(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDataBlock() {
    var s0;

    s0 = peg$parseInlineDataOneVar();
    if (s0 === peg$FAILED) {
      s0 = peg$parseInlineDataFull();
    }

    return s0;
  }

  function peg$parseInlineDataOneVar() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVar();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 123) {
            s4 = peg$c31;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c32); }
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseDataBlockValue();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseDataBlockValue();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s7 = peg$c33;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c34); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c159(s2, s6);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInlineDataFull() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 40) {
        s2 = peg$c17;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseVar();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseVar();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s6 = peg$c21;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 123) {
                    s8 = peg$c31;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c32); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseDataBlockTuple();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseDataBlockTuple();
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = [];
                        s12 = peg$parseWS();
                        while (s12 !== peg$FAILED) {
                          s11.push(s12);
                          s12 = peg$parseWS();
                        }
                        if (s11 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 125) {
                            s12 = peg$c33;
                            peg$currPos++;
                          } else {
                            s12 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c34); }
                          }
                          if (s12 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c160(s4, s10);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDataBlockTuple() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c17;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c18); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseDataBlockValue();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseDataBlockValue();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 41) {
              s5 = peg$c21;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c22); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c161(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDataBlockValue() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseIRIref();
      if (s2 === peg$FAILED) {
        s2 = peg$parseRDFLiteral();
        if (s2 === peg$FAILED) {
          s2 = peg$parseNumericLiteral();
          if (s2 === peg$FAILED) {
            s2 = peg$parseBooleanLiteral();
            if (s2 === peg$FAILED) {
              if (input.substr(peg$currPos, 5) === peg$c162) {
                s2 = peg$c162;
                peg$currPos += 5;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c163); }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c59(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseMinusGraphPattern() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c164) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c165); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c166(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupOrUnionGraphPattern() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseGroupGraphPattern();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c167) {
          s5 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c168); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseGroupGraphPattern();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c167) {
            s5 = input.substr(peg$currPos, 5);
            peg$currPos += 5;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c168); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseGroupGraphPattern();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c169(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseFilter() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c170) {
        s2 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c171); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseConstraint();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c172(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConstraint() {
    var s0;

    s0 = peg$parseBrackettedExpression();
    if (s0 === peg$FAILED) {
      s0 = peg$parseBuiltInCall();
      if (s0 === peg$FAILED) {
        s0 = peg$parseFunctionCall();
      }
    }

    return s0;
  }

  function peg$parseFunctionCall() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseIRIref();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c173(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseArgList() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;

    s0 = peg$currPos;
    s1 = peg$parseNIL();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c174();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
            s3 = input.substr(peg$currPos, 8);
            peg$currPos += 8;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c14); }
          }
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseConditionalOrExpression();
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = [];
                  s8 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s9 = peg$c175;
                    peg$currPos++;
                  } else {
                    s9 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c176); }
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = [];
                    s11 = peg$parseWS();
                    while (s11 !== peg$FAILED) {
                      s10.push(s11);
                      s11 = peg$parseWS();
                    }
                    if (s10 !== peg$FAILED) {
                      s11 = peg$parseConditionalOrExpression();
                      if (s11 !== peg$FAILED) {
                        s9 = [s9, s10, s11];
                        s8 = s9;
                      } else {
                        peg$currPos = s8;
                        s8 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s8;
                      s8 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s8;
                    s8 = peg$FAILED;
                  }
                  while (s8 !== peg$FAILED) {
                    s7.push(s8);
                    s8 = peg$currPos;
                    if (input.charCodeAt(peg$currPos) === 44) {
                      s9 = peg$c175;
                      peg$currPos++;
                    } else {
                      s9 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c176); }
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = peg$parseConditionalOrExpression();
                        if (s11 !== peg$FAILED) {
                          s9 = [s9, s10, s11];
                          s8 = s9;
                        } else {
                          peg$currPos = s8;
                          s8 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s8;
                        s8 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s8;
                      s8 = peg$FAILED;
                    }
                  }
                  if (s7 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s8 = peg$c21;
                      peg$currPos++;
                    } else {
                      s8 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                    }
                    if (s8 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c177(s3, s5, s7);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseExpressionList() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parseNIL();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c178();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseIRIref();
          if (s3 === peg$FAILED) {
            s3 = peg$parseConditionalOrExpression();
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              s5 = [];
              s6 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 44) {
                s7 = peg$c175;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c176); }
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$parseIRIref();
                  if (s9 === peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                  }
                  if (s9 !== peg$FAILED) {
                    s7 = [s7, s8, s9];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c175;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c176); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseIRIref();
                    if (s9 === peg$FAILED) {
                      s9 = peg$parseConditionalOrExpression();
                    }
                    if (s9 !== peg$FAILED) {
                      s7 = [s7, s8, s9];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
              if (s5 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s6 = peg$c21;
                  peg$currPos++;
                } else {
                  s6 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                }
                if (s6 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c179(s3, s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseConstructTemplate() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseConstructTriples();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c33;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c34); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c180(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConstructTriples() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesSameSubject();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c140;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c141); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseConstructTriples();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c181(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesSameSubject() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseVarOrTerm();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsePropertyListNotEmpty();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c182(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseWS();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parseWS();
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseTriplesNode();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseWS();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseWS();
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsePropertyList();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c183(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePropertyList() {
    var s0;

    s0 = peg$parsePropertyListNotEmpty();
    if (s0 === peg$FAILED) {
      s0 = null;
    }

    return s0;
  }

  function peg$parsePropertyListNotEmpty() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = peg$parseVerb();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseObjectList();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$currPos;
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 59) {
              s7 = peg$c82;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c83); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$currPos;
                s10 = peg$parseVerb();
                if (s10 !== peg$FAILED) {
                  s11 = [];
                  s12 = peg$parseWS();
                  while (s12 !== peg$FAILED) {
                    s11.push(s12);
                    s12 = peg$parseWS();
                  }
                  if (s11 !== peg$FAILED) {
                    s12 = peg$parseObjectList();
                    if (s12 !== peg$FAILED) {
                      s10 = [s10, s11, s12];
                      s9 = s10;
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s9;
                  s9 = peg$FAILED;
                }
                if (s9 === peg$FAILED) {
                  s9 = null;
                }
                if (s9 !== peg$FAILED) {
                  s6 = [s6, s7, s8, s9];
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$currPos;
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 59) {
                s7 = peg$c82;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c83); }
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$currPos;
                  s10 = peg$parseVerb();
                  if (s10 !== peg$FAILED) {
                    s11 = [];
                    s12 = peg$parseWS();
                    while (s12 !== peg$FAILED) {
                      s11.push(s12);
                      s12 = peg$parseWS();
                    }
                    if (s11 !== peg$FAILED) {
                      s12 = peg$parseObjectList();
                      if (s12 !== peg$FAILED) {
                        s10 = [s10, s11, s12];
                        s9 = s10;
                      } else {
                        peg$currPos = s9;
                        s9 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                  if (s9 === peg$FAILED) {
                    s9 = null;
                  }
                  if (s9 !== peg$FAILED) {
                    s6 = [s6, s7, s8, s9];
                    s5 = s6;
                  } else {
                    peg$currPos = s5;
                    s5 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c184(s1, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVerb() {
    var s0, s1;

    s0 = peg$parseVarOrIri();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 97) {
        s1 = peg$c185;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c186); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c187();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseObjectList() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseGraphNode();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s5 = peg$c175;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c176); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseGraphNode();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c175;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c176); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseGraphNode();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c188(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesSameSubjectPath() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseVarOrTerm();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsePropertyListPathNotEmpty();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c189(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseWS();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parseWS();
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseTriplesNodePath();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseWS();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseWS();
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsePropertyListPath();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c190(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePropertyListPath() {
    var s0;

    s0 = peg$parsePropertyListPathNotEmpty();
    if (s0 === peg$FAILED) {
      s0 = null;
    }

    return s0;
  }

  function peg$parsePropertyListPathNotEmpty() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = peg$parsePathAlternative();
    if (s1 === peg$FAILED) {
      s1 = peg$parseVar();
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseObjectListPath();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$currPos;
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 59) {
              s7 = peg$c82;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c83); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$currPos;
                s10 = peg$parsePathAlternative();
                if (s10 === peg$FAILED) {
                  s10 = peg$parseVar();
                }
                if (s10 !== peg$FAILED) {
                  s11 = [];
                  s12 = peg$parseWS();
                  while (s12 !== peg$FAILED) {
                    s11.push(s12);
                    s12 = peg$parseWS();
                  }
                  if (s11 !== peg$FAILED) {
                    s12 = peg$parseObjectList();
                    if (s12 !== peg$FAILED) {
                      s10 = [s10, s11, s12];
                      s9 = s10;
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s9;
                  s9 = peg$FAILED;
                }
                if (s9 === peg$FAILED) {
                  s9 = null;
                }
                if (s9 !== peg$FAILED) {
                  s6 = [s6, s7, s8, s9];
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$currPos;
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 59) {
                s7 = peg$c82;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c83); }
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$currPos;
                  s10 = peg$parsePathAlternative();
                  if (s10 === peg$FAILED) {
                    s10 = peg$parseVar();
                  }
                  if (s10 !== peg$FAILED) {
                    s11 = [];
                    s12 = peg$parseWS();
                    while (s12 !== peg$FAILED) {
                      s11.push(s12);
                      s12 = peg$parseWS();
                    }
                    if (s11 !== peg$FAILED) {
                      s12 = peg$parseObjectList();
                      if (s12 !== peg$FAILED) {
                        s10 = [s10, s11, s12];
                        s9 = s10;
                      } else {
                        peg$currPos = s9;
                        s9 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                  if (s9 === peg$FAILED) {
                    s9 = null;
                  }
                  if (s9 !== peg$FAILED) {
                    s6 = [s6, s7, s8, s9];
                    s5 = s6;
                  } else {
                    peg$currPos = s5;
                    s5 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c191(s1, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseObjectListPath() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseGraphNodePath();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s5 = peg$c175;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c176); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseGraphNodePath();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c175;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c176); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseGraphNodePath();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c188(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathAlternative() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parsePathSequence();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 124) {
          s5 = peg$c192;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c193); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parsePathSequence();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 124) {
            s5 = peg$c192;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c193); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parsePathSequence();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c194(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathSequence() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parsePathEltOrInverse();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 47) {
          s5 = peg$c195;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c196); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parsePathEltOrInverse();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c195;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c196); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parsePathEltOrInverse();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c197(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathElt() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsePathPrimary();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsePathMod();
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c198(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathEltOrInverse() {
    var s0, s1, s2;

    s0 = peg$parsePathElt();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 94) {
        s1 = peg$c199;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c200); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePathElt();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c201(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePathMod() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 63) {
      s1 = peg$c202;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c203); }
    }
    if (s1 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 42) {
        s1 = peg$c23;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c24); }
      }
      if (s1 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 43) {
          s1 = peg$c204;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c205); }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c206(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parsePathPrimary() {
    var s0, s1, s2, s3;

    s0 = peg$parseIRIref();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 97) {
        s1 = peg$c185;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c186); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c187();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 33) {
          s1 = peg$c207;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c208); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parsePathNegatedPropertySet();
          if (s2 !== peg$FAILED) {
            s1 = [s1, s2];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 40) {
            s1 = peg$c17;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parsePathAlternative();
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s3 = peg$c21;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c209(s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    return s0;
  }

  function peg$parsePathNegatedPropertySet() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$parsePathOneInPropertySet();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = peg$parsePathOneInPropertySet();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 124) {
            s6 = peg$c192;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c193); }
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parsePathOneInPropertySet();
            if (s7 !== peg$FAILED) {
              s6 = [s6, s7];
              s5 = s6;
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 124) {
              s6 = peg$c192;
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c193); }
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parsePathOneInPropertySet();
              if (s7 !== peg$FAILED) {
                s6 = [s6, s7];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 41) {
            s3 = peg$c21;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c22); }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePathOneInPropertySet() {
    var s0, s1, s2;

    s0 = peg$parseIRIref();
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 97) {
        s0 = peg$c185;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c186); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 94) {
          s1 = peg$c199;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c200); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIRIref();
          if (s2 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 97) {
              s2 = peg$c185;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c186); }
            }
          }
          if (s2 !== peg$FAILED) {
            s1 = [s1, s2];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseTriplesNode() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseCollection();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c210(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$parseBlankNodePropertyList();
    }

    return s0;
  }

  function peg$parseBlankNodePropertyList() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 91) {
        s2 = peg$c211;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c212); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsePropertyListNotEmpty();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s6 = peg$c213;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c214); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c215(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesNodePath() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseCollectionPath();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c216(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$parseBlankNodePropertyListPath();
    }

    return s0;
  }

  function peg$parseBlankNodePropertyListPath() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 91) {
        s2 = peg$c211;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c212); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsePropertyListPathNotEmpty();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 93) {
              s5 = peg$c213;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c214); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c217(s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCollection() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 40) {
        s2 = peg$c17;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseGraphNode();
          if (s5 !== peg$FAILED) {
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseGraphNode();
            }
          } else {
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s6 = peg$c21;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c218(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCollectionPath() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 40) {
        s2 = peg$c17;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseGraphNodePath();
          if (s5 !== peg$FAILED) {
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseGraphNodePath();
            }
          } else {
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s6 = peg$c21;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c218(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphNode() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVarOrTerm();
      if (s2 === peg$FAILED) {
        s2 = peg$parseTriplesNode();
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c218(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphNodePath() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVarOrTerm();
      if (s2 === peg$FAILED) {
        s2 = peg$parseTriplesNodePath();
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c218(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVarOrTerm() {
    var s0;

    s0 = peg$parseVar();
    if (s0 === peg$FAILED) {
      s0 = peg$parseGraphTerm();
    }

    return s0;
  }

  function peg$parseVarOrIri() {
    var s0;

    s0 = peg$parseVar();
    if (s0 === peg$FAILED) {
      s0 = peg$parseIRIref();
    }

    return s0;
  }

  function peg$parseVar() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVAR1();
      if (s2 === peg$FAILED) {
        s2 = peg$parseVAR2();
        if (s2 === peg$FAILED) {
          s2 = peg$parseVAR3();
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c219(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphTerm() {
    var s0;

    s0 = peg$parseIRIref();
    if (s0 === peg$FAILED) {
      s0 = peg$parseRDFLiteral();
      if (s0 === peg$FAILED) {
        s0 = peg$parseNumericLiteral();
        if (s0 === peg$FAILED) {
          s0 = peg$parseBooleanLiteral();
          if (s0 === peg$FAILED) {
            s0 = peg$parseBlankNode();
            if (s0 === peg$FAILED) {
              s0 = peg$parseNIL();
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseConditionalOrExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseConditionalAndExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c220) {
          s5 = peg$c220;
          peg$currPos += 2;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c221); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseConditionalAndExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c220) {
            s5 = peg$c220;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c221); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseConditionalAndExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c222(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConditionalAndExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseRelationalExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c223) {
          s5 = peg$c223;
          peg$currPos += 2;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c224); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseRelationalExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c223) {
            s5 = peg$c223;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c224); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseRelationalExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c225(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRelationalExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parseAdditiveExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 61) {
          s5 = peg$c226;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c227); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseAdditiveExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c228) {
            s5 = peg$c228;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c229); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseAdditiveExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 60) {
              s5 = peg$c230;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c231); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseAdditiveExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 62) {
                s5 = peg$c232;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c233); }
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseAdditiveExpression();
                  if (s7 !== peg$FAILED) {
                    s4 = [s4, s5, s6, s7];
                    s3 = s4;
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            if (s3 === peg$FAILED) {
              s3 = peg$currPos;
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2) === peg$c234) {
                  s5 = peg$c234;
                  peg$currPos += 2;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c235); }
                }
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parseAdditiveExpression();
                    if (s7 !== peg$FAILED) {
                      s4 = [s4, s5, s6, s7];
                      s3 = s4;
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
              if (s3 === peg$FAILED) {
                s3 = peg$currPos;
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c236) {
                    s5 = peg$c236;
                    peg$currPos += 2;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c237); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseAdditiveExpression();
                      if (s7 !== peg$FAILED) {
                        s4 = [s4, s5, s6, s7];
                        s3 = s4;
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
                if (s3 === peg$FAILED) {
                  s3 = peg$currPos;
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2).toLowerCase() === peg$c238) {
                      s5 = input.substr(peg$currPos, 2);
                      peg$currPos += 2;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c239); }
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parseExpressionList();
                        if (s7 !== peg$FAILED) {
                          s4 = [s4, s5, s6, s7];
                          s3 = s4;
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                  if (s3 === peg$FAILED) {
                    s3 = peg$currPos;
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c240) {
                        s5 = input.substr(peg$currPos, 3);
                        peg$currPos += 3;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c241); }
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c238) {
                            s7 = input.substr(peg$currPos, 2);
                            peg$currPos += 2;
                          } else {
                            s7 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c239); }
                          }
                          if (s7 !== peg$FAILED) {
                            s8 = [];
                            s9 = peg$parseWS();
                            while (s9 !== peg$FAILED) {
                              s8.push(s9);
                              s9 = peg$parseWS();
                            }
                            if (s8 !== peg$FAILED) {
                              s9 = peg$parseExpressionList();
                              if (s9 !== peg$FAILED) {
                                s4 = [s4, s5, s6, s7, s8, s9];
                                s3 = s4;
                              } else {
                                peg$currPos = s3;
                                s3 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s3;
                              s3 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  }
                }
              }
            }
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 61) {
            s5 = peg$c226;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c227); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseAdditiveExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c228) {
              s5 = peg$c228;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c229); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseAdditiveExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 60) {
                s5 = peg$c230;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c231); }
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseAdditiveExpression();
                  if (s7 !== peg$FAILED) {
                    s4 = [s4, s5, s6, s7];
                    s3 = s4;
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            if (s3 === peg$FAILED) {
              s3 = peg$currPos;
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 62) {
                  s5 = peg$c232;
                  peg$currPos++;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c233); }
                }
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parseAdditiveExpression();
                    if (s7 !== peg$FAILED) {
                      s4 = [s4, s5, s6, s7];
                      s3 = s4;
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
              if (s3 === peg$FAILED) {
                s3 = peg$currPos;
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c234) {
                    s5 = peg$c234;
                    peg$currPos += 2;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c235); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseAdditiveExpression();
                      if (s7 !== peg$FAILED) {
                        s4 = [s4, s5, s6, s7];
                        s3 = s4;
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
                if (s3 === peg$FAILED) {
                  s3 = peg$currPos;
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2) === peg$c236) {
                      s5 = peg$c236;
                      peg$currPos += 2;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c237); }
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parseAdditiveExpression();
                        if (s7 !== peg$FAILED) {
                          s4 = [s4, s5, s6, s7];
                          s3 = s4;
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                  if (s3 === peg$FAILED) {
                    s3 = peg$currPos;
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c238) {
                        s5 = input.substr(peg$currPos, 2);
                        peg$currPos += 2;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c239); }
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          s7 = peg$parseExpressionList();
                          if (s7 !== peg$FAILED) {
                            s4 = [s4, s5, s6, s7];
                            s3 = s4;
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                    if (s3 === peg$FAILED) {
                      s3 = peg$currPos;
                      s4 = [];
                      s5 = peg$parseWS();
                      while (s5 !== peg$FAILED) {
                        s4.push(s5);
                        s5 = peg$parseWS();
                      }
                      if (s4 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c240) {
                          s5 = input.substr(peg$currPos, 3);
                          peg$currPos += 3;
                        } else {
                          s5 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c241); }
                        }
                        if (s5 !== peg$FAILED) {
                          s6 = [];
                          s7 = peg$parseWS();
                          while (s7 !== peg$FAILED) {
                            s6.push(s7);
                            s7 = peg$parseWS();
                          }
                          if (s6 !== peg$FAILED) {
                            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c238) {
                              s7 = input.substr(peg$currPos, 2);
                              peg$currPos += 2;
                            } else {
                              s7 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c239); }
                            }
                            if (s7 !== peg$FAILED) {
                              s8 = [];
                              s9 = peg$parseWS();
                              while (s9 !== peg$FAILED) {
                                s8.push(s9);
                                s9 = peg$parseWS();
                              }
                              if (s8 !== peg$FAILED) {
                                s9 = peg$parseExpressionList();
                                if (s9 !== peg$FAILED) {
                                  s4 = [s4, s5, s6, s7, s8, s9];
                                  s3 = s4;
                                } else {
                                  peg$currPos = s3;
                                  s3 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s3;
                                s3 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s3;
                              s3 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c242(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAdditiveExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = peg$parseMultiplicativeExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 43) {
          s5 = peg$c204;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c205); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseMultiplicativeExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 45) {
            s5 = peg$c243;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c244); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseMultiplicativeExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = peg$parseNumericLiteralPositive();
          if (s4 === peg$FAILED) {
            s4 = peg$parseNumericLiteralNegative();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$currPos;
            s7 = [];
            s8 = peg$parseWS();
            while (s8 !== peg$FAILED) {
              s7.push(s8);
              s8 = peg$parseWS();
            }
            if (s7 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 42) {
                s8 = peg$c23;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c24); }
              }
              if (s8 !== peg$FAILED) {
                s9 = [];
                s10 = peg$parseWS();
                while (s10 !== peg$FAILED) {
                  s9.push(s10);
                  s10 = peg$parseWS();
                }
                if (s9 !== peg$FAILED) {
                  s10 = peg$parseUnaryExpression();
                  if (s10 !== peg$FAILED) {
                    s7 = [s7, s8, s9, s10];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 === peg$FAILED) {
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 47) {
                  s8 = peg$c195;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c196); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseUnaryExpression();
                    if (s10 !== peg$FAILED) {
                      s7 = [s7, s8, s9, s10];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            }
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 42) {
                  s8 = peg$c23;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c24); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseUnaryExpression();
                    if (s10 !== peg$FAILED) {
                      s7 = [s7, s8, s9, s10];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              if (s6 === peg$FAILED) {
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 47) {
                    s8 = peg$c195;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c196); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseUnaryExpression();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
            }
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 43) {
            s5 = peg$c204;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c205); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseMultiplicativeExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 45) {
              s5 = peg$c243;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c244); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseMultiplicativeExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            s4 = peg$parseNumericLiteralPositive();
            if (s4 === peg$FAILED) {
              s4 = peg$parseNumericLiteralNegative();
            }
            if (s4 !== peg$FAILED) {
              s5 = [];
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 42) {
                  s8 = peg$c23;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c24); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseUnaryExpression();
                    if (s10 !== peg$FAILED) {
                      s7 = [s7, s8, s9, s10];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              if (s6 === peg$FAILED) {
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 47) {
                    s8 = peg$c195;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c196); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseUnaryExpression();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 42) {
                    s8 = peg$c23;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c24); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseUnaryExpression();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
                if (s6 === peg$FAILED) {
                  s6 = peg$currPos;
                  s7 = [];
                  s8 = peg$parseWS();
                  while (s8 !== peg$FAILED) {
                    s7.push(s8);
                    s8 = peg$parseWS();
                  }
                  if (s7 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 47) {
                      s8 = peg$c195;
                      peg$currPos++;
                    } else {
                      s8 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c196); }
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = [];
                      s10 = peg$parseWS();
                      while (s10 !== peg$FAILED) {
                        s9.push(s10);
                        s10 = peg$parseWS();
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parseUnaryExpression();
                        if (s10 !== peg$FAILED) {
                          s7 = [s7, s8, s9, s10];
                          s6 = s7;
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
              }
              if (s5 !== peg$FAILED) {
                s4 = [s4, s5];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c245(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseMultiplicativeExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseUnaryExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 42) {
          s5 = peg$c23;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c24); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseUnaryExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c195;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c196); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseUnaryExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 42) {
            s5 = peg$c23;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c24); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseUnaryExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 47) {
              s5 = peg$c195;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c196); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseUnaryExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c246(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseUnaryExpression() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 33) {
      s1 = peg$c207;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c208); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsePrimaryExpression();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c247(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 43) {
        s1 = peg$c204;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c205); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsePrimaryExpression();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c248(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 45) {
          s1 = peg$c243;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c244); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseWS();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseWS();
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parsePrimaryExpression();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c249(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parsePrimaryExpression();
        }
      }
    }

    return s0;
  }

  function peg$parsePrimaryExpression() {
    var s0, s1;

    s0 = peg$parseBrackettedExpression();
    if (s0 === peg$FAILED) {
      s0 = peg$parseBuiltInCall();
      if (s0 === peg$FAILED) {
        s0 = peg$parseIRIrefOrFunction();
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseRDFLiteral();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c250(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseNumericLiteral();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c251(s1);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseBooleanLiteral();
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c252(s1);
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                s1 = peg$parseVar();
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c253(s1);
                }
                s0 = s1;
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseBrackettedExpression() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c17;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c18); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseConditionalOrExpression();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 41) {
              s5 = peg$c21;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c22); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c254(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseBuiltInCall() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15;

    s0 = peg$parseAggregate();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c255) {
        s1 = input.substr(peg$currPos, 3);
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c256); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c17;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseConditionalOrExpression();
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s7 = peg$c21;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c257(s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c258) {
          s1 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c259); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseWS();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseWS();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s3 = peg$c17;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c18); }
            }
            if (s3 !== peg$FAILED) {
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parseConditionalOrExpression();
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s7 = peg$c21;
                      peg$currPos++;
                    } else {
                      s7 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                    }
                    if (s7 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c260(s5);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 11).toLowerCase() === peg$c261) {
            s1 = input.substr(peg$currPos, 11);
            peg$currPos += 11;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c262); }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$parseWS();
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parseWS();
            }
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 40) {
                s3 = peg$c17;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c18); }
              }
              if (s3 !== peg$FAILED) {
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  s5 = peg$parseConditionalOrExpression();
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 44) {
                        s7 = peg$c175;
                        peg$currPos++;
                      } else {
                        s7 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c176); }
                      }
                      if (s7 !== peg$FAILED) {
                        s8 = [];
                        s9 = peg$parseWS();
                        while (s9 !== peg$FAILED) {
                          s8.push(s9);
                          s9 = peg$parseWS();
                        }
                        if (s8 !== peg$FAILED) {
                          s9 = peg$parseConditionalOrExpression();
                          if (s9 !== peg$FAILED) {
                            s10 = [];
                            s11 = peg$parseWS();
                            while (s11 !== peg$FAILED) {
                              s10.push(s11);
                              s11 = peg$parseWS();
                            }
                            if (s10 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s11 = peg$c21;
                                peg$currPos++;
                              } else {
                                s11 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                              }
                              if (s11 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c263(s5, s9);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 8).toLowerCase() === peg$c264) {
              s1 = input.substr(peg$currPos, 8);
              peg$currPos += 8;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c265); }
            }
            if (s1 !== peg$FAILED) {
              s2 = [];
              s3 = peg$parseWS();
              while (s3 !== peg$FAILED) {
                s2.push(s3);
                s3 = peg$parseWS();
              }
              if (s2 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 40) {
                  s3 = peg$c17;
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    s5 = peg$parseConditionalOrExpression();
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s7 = peg$c21;
                          peg$currPos++;
                        } else {
                          s7 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                        }
                        if (s7 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c266(s5);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c267) {
                s1 = input.substr(peg$currPos, 5);
                peg$currPos += 5;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c268); }
              }
              if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$parseWS();
                while (s3 !== peg$FAILED) {
                  s2.push(s3);
                  s3 = peg$parseWS();
                }
                if (s2 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 40) {
                    s3 = peg$c17;
                    peg$currPos++;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      s5 = peg$parseVar();
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s7 = peg$c21;
                            peg$currPos++;
                          } else {
                            s7 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                          }
                          if (s7 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c269(s5);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 3).toLowerCase() === peg$c270) {
                  s1 = input.substr(peg$currPos, 3);
                  peg$currPos += 3;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c271); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = [];
                  s3 = peg$parseWS();
                  while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$parseWS();
                  }
                  if (s2 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 40) {
                      s3 = peg$c17;
                      peg$currPos++;
                    } else {
                      s3 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                    }
                    if (s3 !== peg$FAILED) {
                      s4 = [];
                      s5 = peg$parseWS();
                      while (s5 !== peg$FAILED) {
                        s4.push(s5);
                        s5 = peg$parseWS();
                      }
                      if (s4 !== peg$FAILED) {
                        s5 = peg$parseConditionalOrExpression();
                        if (s5 !== peg$FAILED) {
                          s6 = [];
                          s7 = peg$parseWS();
                          while (s7 !== peg$FAILED) {
                            s6.push(s7);
                            s7 = peg$parseWS();
                          }
                          if (s6 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s7 = peg$c21;
                              peg$currPos++;
                            } else {
                              s7 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s7 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c272(s5);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.substr(peg$currPos, 3).toLowerCase() === peg$c273) {
                    s1 = input.substr(peg$currPos, 3);
                    peg$currPos += 3;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c274); }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = [];
                    s3 = peg$parseWS();
                    while (s3 !== peg$FAILED) {
                      s2.push(s3);
                      s3 = peg$parseWS();
                    }
                    if (s2 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 40) {
                        s3 = peg$c17;
                        peg$currPos++;
                      } else {
                        s3 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                      }
                      if (s3 !== peg$FAILED) {
                        s4 = [];
                        s5 = peg$parseWS();
                        while (s5 !== peg$FAILED) {
                          s4.push(s5);
                          s5 = peg$parseWS();
                        }
                        if (s4 !== peg$FAILED) {
                          s5 = peg$parseConditionalOrExpression();
                          if (s5 !== peg$FAILED) {
                            s6 = [];
                            s7 = peg$parseWS();
                            while (s7 !== peg$FAILED) {
                              s6.push(s7);
                              s7 = peg$parseWS();
                            }
                            if (s6 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s7 = peg$c21;
                                peg$currPos++;
                              } else {
                                s7 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                              }
                              if (s7 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c275(s5);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c276) {
                      s1 = input.substr(peg$currPos, 5);
                      peg$currPos += 5;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c277); }
                    }
                    if (s1 !== peg$FAILED) {
                      s2 = [];
                      s3 = peg$parseWS();
                      while (s3 !== peg$FAILED) {
                        s2.push(s3);
                        s3 = peg$parseWS();
                      }
                      if (s2 !== peg$FAILED) {
                        s3 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 40) {
                          s4 = peg$c17;
                          peg$currPos++;
                        } else {
                          s4 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                        }
                        if (s4 !== peg$FAILED) {
                          s5 = [];
                          s6 = peg$parseWS();
                          while (s6 !== peg$FAILED) {
                            s5.push(s6);
                            s6 = peg$parseWS();
                          }
                          if (s5 !== peg$FAILED) {
                            s6 = peg$parseConditionalOrExpression();
                            if (s6 !== peg$FAILED) {
                              s7 = [];
                              s8 = peg$parseWS();
                              while (s8 !== peg$FAILED) {
                                s7.push(s8);
                                s8 = peg$parseWS();
                              }
                              if (s7 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 41) {
                                  s8 = peg$c21;
                                  peg$currPos++;
                                } else {
                                  s8 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                }
                                if (s8 !== peg$FAILED) {
                                  s4 = [s4, s5, s6, s7, s8];
                                  s3 = s4;
                                } else {
                                  peg$currPos = s3;
                                  s3 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s3;
                                s3 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s3;
                              s3 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                        if (s3 === peg$FAILED) {
                          s3 = peg$parseNIL();
                        }
                        if (s3 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c278(s3);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                    if (s0 === peg$FAILED) {
                      s0 = peg$currPos;
                      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c279) {
                        s1 = input.substr(peg$currPos, 4);
                        peg$currPos += 4;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c280); }
                      }
                      if (s1 !== peg$FAILED) {
                        s2 = [];
                        s3 = peg$parseWS();
                        while (s3 !== peg$FAILED) {
                          s2.push(s3);
                          s3 = peg$parseWS();
                        }
                        if (s2 !== peg$FAILED) {
                          s3 = peg$parseNIL();
                          if (s3 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c281();
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                      if (s0 === peg$FAILED) {
                        s0 = peg$currPos;
                        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c282) {
                          s1 = input.substr(peg$currPos, 3);
                          peg$currPos += 3;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c283); }
                        }
                        if (s1 !== peg$FAILED) {
                          s2 = [];
                          s3 = peg$parseWS();
                          while (s3 !== peg$FAILED) {
                            s2.push(s3);
                            s3 = peg$parseWS();
                          }
                          if (s2 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 40) {
                              s3 = peg$c17;
                              peg$currPos++;
                            } else {
                              s3 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                            }
                            if (s3 !== peg$FAILED) {
                              s4 = [];
                              s5 = peg$parseWS();
                              while (s5 !== peg$FAILED) {
                                s4.push(s5);
                                s5 = peg$parseWS();
                              }
                              if (s4 !== peg$FAILED) {
                                s5 = peg$parseConditionalOrExpression();
                                if (s5 !== peg$FAILED) {
                                  s6 = [];
                                  s7 = peg$parseWS();
                                  while (s7 !== peg$FAILED) {
                                    s6.push(s7);
                                    s7 = peg$parseWS();
                                  }
                                  if (s6 !== peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 41) {
                                      s7 = peg$c21;
                                      peg$currPos++;
                                    } else {
                                      s7 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                    }
                                    if (s7 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c284(s5);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                        if (s0 === peg$FAILED) {
                          s0 = peg$currPos;
                          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c285) {
                            s1 = input.substr(peg$currPos, 4);
                            peg$currPos += 4;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c286); }
                          }
                          if (s1 !== peg$FAILED) {
                            s2 = [];
                            s3 = peg$parseWS();
                            while (s3 !== peg$FAILED) {
                              s2.push(s3);
                              s3 = peg$parseWS();
                            }
                            if (s2 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 40) {
                                s3 = peg$c17;
                                peg$currPos++;
                              } else {
                                s3 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                              }
                              if (s3 !== peg$FAILED) {
                                s4 = [];
                                s5 = peg$parseWS();
                                while (s5 !== peg$FAILED) {
                                  s4.push(s5);
                                  s5 = peg$parseWS();
                                }
                                if (s4 !== peg$FAILED) {
                                  s5 = peg$parseConditionalOrExpression();
                                  if (s5 !== peg$FAILED) {
                                    s6 = [];
                                    s7 = peg$parseWS();
                                    while (s7 !== peg$FAILED) {
                                      s6.push(s7);
                                      s7 = peg$parseWS();
                                    }
                                    if (s6 !== peg$FAILED) {
                                      if (input.charCodeAt(peg$currPos) === 41) {
                                        s7 = peg$c21;
                                        peg$currPos++;
                                      } else {
                                        s7 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                      }
                                      if (s7 !== peg$FAILED) {
                                        peg$savedPos = s0;
                                        s1 = peg$c287(s5);
                                        s0 = s1;
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                          if (s0 === peg$FAILED) {
                            s0 = peg$currPos;
                            if (input.substr(peg$currPos, 5).toLowerCase() === peg$c288) {
                              s1 = input.substr(peg$currPos, 5);
                              peg$currPos += 5;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c289); }
                            }
                            if (s1 !== peg$FAILED) {
                              s2 = [];
                              s3 = peg$parseWS();
                              while (s3 !== peg$FAILED) {
                                s2.push(s3);
                                s3 = peg$parseWS();
                              }
                              if (s2 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 40) {
                                  s3 = peg$c17;
                                  peg$currPos++;
                                } else {
                                  s3 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                }
                                if (s3 !== peg$FAILED) {
                                  s4 = [];
                                  s5 = peg$parseWS();
                                  while (s5 !== peg$FAILED) {
                                    s4.push(s5);
                                    s5 = peg$parseWS();
                                  }
                                  if (s4 !== peg$FAILED) {
                                    s5 = peg$parseConditionalOrExpression();
                                    if (s5 !== peg$FAILED) {
                                      s6 = [];
                                      s7 = peg$parseWS();
                                      while (s7 !== peg$FAILED) {
                                        s6.push(s7);
                                        s7 = peg$parseWS();
                                      }
                                      if (s6 !== peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 41) {
                                          s7 = peg$c21;
                                          peg$currPos++;
                                        } else {
                                          s7 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                        }
                                        if (s7 !== peg$FAILED) {
                                          peg$savedPos = s0;
                                          s1 = peg$c290(s5);
                                          s0 = s1;
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                            if (s0 === peg$FAILED) {
                              s0 = peg$currPos;
                              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c291) {
                                s1 = input.substr(peg$currPos, 5);
                                peg$currPos += 5;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c292); }
                              }
                              if (s1 !== peg$FAILED) {
                                s2 = [];
                                s3 = peg$parseWS();
                                while (s3 !== peg$FAILED) {
                                  s2.push(s3);
                                  s3 = peg$parseWS();
                                }
                                if (s2 !== peg$FAILED) {
                                  if (input.charCodeAt(peg$currPos) === 40) {
                                    s3 = peg$c17;
                                    peg$currPos++;
                                  } else {
                                    s3 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                  }
                                  if (s3 !== peg$FAILED) {
                                    s4 = [];
                                    s5 = peg$parseWS();
                                    while (s5 !== peg$FAILED) {
                                      s4.push(s5);
                                      s5 = peg$parseWS();
                                    }
                                    if (s4 !== peg$FAILED) {
                                      s5 = peg$parseConditionalOrExpression();
                                      if (s5 !== peg$FAILED) {
                                        s6 = [];
                                        s7 = peg$parseWS();
                                        while (s7 !== peg$FAILED) {
                                          s6.push(s7);
                                          s7 = peg$parseWS();
                                        }
                                        if (s6 !== peg$FAILED) {
                                          if (input.charCodeAt(peg$currPos) === 41) {
                                            s7 = peg$c21;
                                            peg$currPos++;
                                          } else {
                                            s7 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                          }
                                          if (s7 !== peg$FAILED) {
                                            peg$savedPos = s0;
                                            s1 = peg$c293(s5);
                                            s0 = s1;
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                              if (s0 === peg$FAILED) {
                                s0 = peg$currPos;
                                if (input.substr(peg$currPos, 6).toLowerCase() === peg$c294) {
                                  s1 = input.substr(peg$currPos, 6);
                                  peg$currPos += 6;
                                } else {
                                  s1 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c295); }
                                }
                                if (s1 !== peg$FAILED) {
                                  s2 = [];
                                  s3 = peg$parseWS();
                                  while (s3 !== peg$FAILED) {
                                    s2.push(s3);
                                    s3 = peg$parseWS();
                                  }
                                  if (s2 !== peg$FAILED) {
                                    s3 = peg$parseExpressionList();
                                    if (s3 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c296(s3);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                                if (s0 === peg$FAILED) {
                                  s0 = peg$parseSubstringExpression();
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$currPos;
                                    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c297) {
                                      s1 = input.substr(peg$currPos, 6);
                                      peg$currPos += 6;
                                    } else {
                                      s1 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c298); }
                                    }
                                    if (s1 !== peg$FAILED) {
                                      s2 = [];
                                      s3 = peg$parseWS();
                                      while (s3 !== peg$FAILED) {
                                        s2.push(s3);
                                        s3 = peg$parseWS();
                                      }
                                      if (s2 !== peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 40) {
                                          s3 = peg$c17;
                                          peg$currPos++;
                                        } else {
                                          s3 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                        }
                                        if (s3 !== peg$FAILED) {
                                          s4 = [];
                                          s5 = peg$parseWS();
                                          while (s5 !== peg$FAILED) {
                                            s4.push(s5);
                                            s5 = peg$parseWS();
                                          }
                                          if (s4 !== peg$FAILED) {
                                            s5 = peg$parseConditionalOrExpression();
                                            if (s5 !== peg$FAILED) {
                                              s6 = [];
                                              s7 = peg$parseWS();
                                              while (s7 !== peg$FAILED) {
                                                s6.push(s7);
                                                s7 = peg$parseWS();
                                              }
                                              if (s6 !== peg$FAILED) {
                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                  s7 = peg$c21;
                                                  peg$currPos++;
                                                } else {
                                                  s7 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                }
                                                if (s7 !== peg$FAILED) {
                                                  peg$savedPos = s0;
                                                  s1 = peg$c299(s5);
                                                  s0 = s1;
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$parseStrReplaceExpression();
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$currPos;
                                        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c300) {
                                          s1 = input.substr(peg$currPos, 5);
                                          peg$currPos += 5;
                                        } else {
                                          s1 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c301); }
                                        }
                                        if (s1 !== peg$FAILED) {
                                          s2 = [];
                                          s3 = peg$parseWS();
                                          while (s3 !== peg$FAILED) {
                                            s2.push(s3);
                                            s3 = peg$parseWS();
                                          }
                                          if (s2 !== peg$FAILED) {
                                            if (input.charCodeAt(peg$currPos) === 40) {
                                              s3 = peg$c17;
                                              peg$currPos++;
                                            } else {
                                              s3 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                            }
                                            if (s3 !== peg$FAILED) {
                                              s4 = [];
                                              s5 = peg$parseWS();
                                              while (s5 !== peg$FAILED) {
                                                s4.push(s5);
                                                s5 = peg$parseWS();
                                              }
                                              if (s4 !== peg$FAILED) {
                                                s5 = peg$parseConditionalOrExpression();
                                                if (s5 !== peg$FAILED) {
                                                  s6 = [];
                                                  s7 = peg$parseWS();
                                                  while (s7 !== peg$FAILED) {
                                                    s6.push(s7);
                                                    s7 = peg$parseWS();
                                                  }
                                                  if (s6 !== peg$FAILED) {
                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                      s7 = peg$c21;
                                                      peg$currPos++;
                                                    } else {
                                                      s7 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                    }
                                                    if (s7 !== peg$FAILED) {
                                                      peg$savedPos = s0;
                                                      s1 = peg$c302(s5);
                                                      s0 = s1;
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                        if (s0 === peg$FAILED) {
                                          s0 = peg$currPos;
                                          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c303) {
                                            s1 = input.substr(peg$currPos, 5);
                                            peg$currPos += 5;
                                          } else {
                                            s1 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c304); }
                                          }
                                          if (s1 !== peg$FAILED) {
                                            s2 = [];
                                            s3 = peg$parseWS();
                                            while (s3 !== peg$FAILED) {
                                              s2.push(s3);
                                              s3 = peg$parseWS();
                                            }
                                            if (s2 !== peg$FAILED) {
                                              if (input.charCodeAt(peg$currPos) === 40) {
                                                s3 = peg$c17;
                                                peg$currPos++;
                                              } else {
                                                s3 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                              }
                                              if (s3 !== peg$FAILED) {
                                                s4 = [];
                                                s5 = peg$parseWS();
                                                while (s5 !== peg$FAILED) {
                                                  s4.push(s5);
                                                  s5 = peg$parseWS();
                                                }
                                                if (s4 !== peg$FAILED) {
                                                  s5 = peg$parseConditionalOrExpression();
                                                  if (s5 !== peg$FAILED) {
                                                    s6 = [];
                                                    s7 = peg$parseWS();
                                                    while (s7 !== peg$FAILED) {
                                                      s6.push(s7);
                                                      s7 = peg$parseWS();
                                                    }
                                                    if (s6 !== peg$FAILED) {
                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                        s7 = peg$c21;
                                                        peg$currPos++;
                                                      } else {
                                                        s7 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                      }
                                                      if (s7 !== peg$FAILED) {
                                                        peg$savedPos = s0;
                                                        s1 = peg$c305(s5);
                                                        s0 = s1;
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                          if (s0 === peg$FAILED) {
                                            s0 = peg$currPos;
                                            if (input.substr(peg$currPos, 14).toLowerCase() === peg$c306) {
                                              s1 = input.substr(peg$currPos, 14);
                                              peg$currPos += 14;
                                            } else {
                                              s1 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c307); }
                                            }
                                            if (s1 !== peg$FAILED) {
                                              s2 = [];
                                              s3 = peg$parseWS();
                                              while (s3 !== peg$FAILED) {
                                                s2.push(s3);
                                                s3 = peg$parseWS();
                                              }
                                              if (s2 !== peg$FAILED) {
                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                  s3 = peg$c17;
                                                  peg$currPos++;
                                                } else {
                                                  s3 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                }
                                                if (s3 !== peg$FAILED) {
                                                  s4 = [];
                                                  s5 = peg$parseWS();
                                                  while (s5 !== peg$FAILED) {
                                                    s4.push(s5);
                                                    s5 = peg$parseWS();
                                                  }
                                                  if (s4 !== peg$FAILED) {
                                                    s5 = peg$parseConditionalOrExpression();
                                                    if (s5 !== peg$FAILED) {
                                                      s6 = [];
                                                      s7 = peg$parseWS();
                                                      while (s7 !== peg$FAILED) {
                                                        s6.push(s7);
                                                        s7 = peg$parseWS();
                                                      }
                                                      if (s6 !== peg$FAILED) {
                                                        if (input.charCodeAt(peg$currPos) === 41) {
                                                          s7 = peg$c21;
                                                          peg$currPos++;
                                                        } else {
                                                          s7 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                        }
                                                        if (s7 !== peg$FAILED) {
                                                          peg$savedPos = s0;
                                                          s1 = peg$c308(s5);
                                                          s0 = s1;
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                            if (s0 === peg$FAILED) {
                                              s0 = peg$currPos;
                                              if (input.substr(peg$currPos, 8).toLowerCase() === peg$c309) {
                                                s1 = input.substr(peg$currPos, 8);
                                                peg$currPos += 8;
                                              } else {
                                                s1 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c310); }
                                              }
                                              if (s1 !== peg$FAILED) {
                                                s2 = [];
                                                s3 = peg$parseWS();
                                                while (s3 !== peg$FAILED) {
                                                  s2.push(s3);
                                                  s3 = peg$parseWS();
                                                }
                                                if (s2 !== peg$FAILED) {
                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                    s3 = peg$c17;
                                                    peg$currPos++;
                                                  } else {
                                                    s3 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                  }
                                                  if (s3 !== peg$FAILED) {
                                                    s4 = [];
                                                    s5 = peg$parseWS();
                                                    while (s5 !== peg$FAILED) {
                                                      s4.push(s5);
                                                      s5 = peg$parseWS();
                                                    }
                                                    if (s4 !== peg$FAILED) {
                                                      s5 = peg$parseConditionalOrExpression();
                                                      if (s5 !== peg$FAILED) {
                                                        s6 = [];
                                                        s7 = peg$parseWS();
                                                        while (s7 !== peg$FAILED) {
                                                          s6.push(s7);
                                                          s7 = peg$parseWS();
                                                        }
                                                        if (s6 !== peg$FAILED) {
                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                            s7 = peg$c175;
                                                            peg$currPos++;
                                                          } else {
                                                            s7 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                          }
                                                          if (s7 !== peg$FAILED) {
                                                            s8 = [];
                                                            s9 = peg$parseWS();
                                                            while (s9 !== peg$FAILED) {
                                                              s8.push(s9);
                                                              s9 = peg$parseWS();
                                                            }
                                                            if (s8 !== peg$FAILED) {
                                                              s9 = peg$parseConditionalOrExpression();
                                                              if (s9 !== peg$FAILED) {
                                                                s10 = [];
                                                                s11 = peg$parseWS();
                                                                while (s11 !== peg$FAILED) {
                                                                  s10.push(s11);
                                                                  s11 = peg$parseWS();
                                                                }
                                                                if (s10 !== peg$FAILED) {
                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                    s11 = peg$c21;
                                                                    peg$currPos++;
                                                                  } else {
                                                                    s11 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                  }
                                                                  if (s11 !== peg$FAILED) {
                                                                    peg$savedPos = s0;
                                                                    s1 = peg$c311(s5, s9);
                                                                    s0 = s1;
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                              if (s0 === peg$FAILED) {
                                                s0 = peg$currPos;
                                                if (input.substr(peg$currPos, 9).toLowerCase() === peg$c312) {
                                                  s1 = input.substr(peg$currPos, 9);
                                                  peg$currPos += 9;
                                                } else {
                                                  s1 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c313); }
                                                }
                                                if (s1 !== peg$FAILED) {
                                                  s2 = [];
                                                  s3 = peg$parseWS();
                                                  while (s3 !== peg$FAILED) {
                                                    s2.push(s3);
                                                    s3 = peg$parseWS();
                                                  }
                                                  if (s2 !== peg$FAILED) {
                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                      s3 = peg$c17;
                                                      peg$currPos++;
                                                    } else {
                                                      s3 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                    }
                                                    if (s3 !== peg$FAILED) {
                                                      s4 = [];
                                                      s5 = peg$parseWS();
                                                      while (s5 !== peg$FAILED) {
                                                        s4.push(s5);
                                                        s5 = peg$parseWS();
                                                      }
                                                      if (s4 !== peg$FAILED) {
                                                        s5 = peg$parseConditionalOrExpression();
                                                        if (s5 !== peg$FAILED) {
                                                          s6 = [];
                                                          s7 = peg$parseWS();
                                                          while (s7 !== peg$FAILED) {
                                                            s6.push(s7);
                                                            s7 = peg$parseWS();
                                                          }
                                                          if (s6 !== peg$FAILED) {
                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                              s7 = peg$c175;
                                                              peg$currPos++;
                                                            } else {
                                                              s7 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                            }
                                                            if (s7 !== peg$FAILED) {
                                                              s8 = [];
                                                              s9 = peg$parseWS();
                                                              while (s9 !== peg$FAILED) {
                                                                s8.push(s9);
                                                                s9 = peg$parseWS();
                                                              }
                                                              if (s8 !== peg$FAILED) {
                                                                s9 = peg$parseConditionalOrExpression();
                                                                if (s9 !== peg$FAILED) {
                                                                  s10 = [];
                                                                  s11 = peg$parseWS();
                                                                  while (s11 !== peg$FAILED) {
                                                                    s10.push(s11);
                                                                    s11 = peg$parseWS();
                                                                  }
                                                                  if (s10 !== peg$FAILED) {
                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                      s11 = peg$c21;
                                                                      peg$currPos++;
                                                                    } else {
                                                                      s11 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                    }
                                                                    if (s11 !== peg$FAILED) {
                                                                      peg$savedPos = s0;
                                                                      s1 = peg$c314(s5, s9);
                                                                      s0 = s1;
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                                if (s0 === peg$FAILED) {
                                                  s0 = peg$currPos;
                                                  if (input.substr(peg$currPos, 9).toLowerCase() === peg$c315) {
                                                    s1 = input.substr(peg$currPos, 9);
                                                    peg$currPos += 9;
                                                  } else {
                                                    s1 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c316); }
                                                  }
                                                  if (s1 !== peg$FAILED) {
                                                    s2 = [];
                                                    s3 = peg$parseWS();
                                                    while (s3 !== peg$FAILED) {
                                                      s2.push(s3);
                                                      s3 = peg$parseWS();
                                                    }
                                                    if (s2 !== peg$FAILED) {
                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                        s3 = peg$c17;
                                                        peg$currPos++;
                                                      } else {
                                                        s3 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                      }
                                                      if (s3 !== peg$FAILED) {
                                                        s4 = [];
                                                        s5 = peg$parseWS();
                                                        while (s5 !== peg$FAILED) {
                                                          s4.push(s5);
                                                          s5 = peg$parseWS();
                                                        }
                                                        if (s4 !== peg$FAILED) {
                                                          s5 = peg$parseConditionalOrExpression();
                                                          if (s5 !== peg$FAILED) {
                                                            s6 = [];
                                                            s7 = peg$parseWS();
                                                            while (s7 !== peg$FAILED) {
                                                              s6.push(s7);
                                                              s7 = peg$parseWS();
                                                            }
                                                            if (s6 !== peg$FAILED) {
                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                s7 = peg$c175;
                                                                peg$currPos++;
                                                              } else {
                                                                s7 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                              }
                                                              if (s7 !== peg$FAILED) {
                                                                s8 = [];
                                                                s9 = peg$parseWS();
                                                                while (s9 !== peg$FAILED) {
                                                                  s8.push(s9);
                                                                  s9 = peg$parseWS();
                                                                }
                                                                if (s8 !== peg$FAILED) {
                                                                  s9 = peg$parseConditionalOrExpression();
                                                                  if (s9 !== peg$FAILED) {
                                                                    s10 = [];
                                                                    s11 = peg$parseWS();
                                                                    while (s11 !== peg$FAILED) {
                                                                      s10.push(s11);
                                                                      s11 = peg$parseWS();
                                                                    }
                                                                    if (s10 !== peg$FAILED) {
                                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                                        s11 = peg$c21;
                                                                        peg$currPos++;
                                                                      } else {
                                                                        s11 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                      }
                                                                      if (s11 !== peg$FAILED) {
                                                                        peg$savedPos = s0;
                                                                        s1 = peg$c317(s5, s9);
                                                                        s0 = s1;
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                  if (s0 === peg$FAILED) {
                                                    s0 = peg$currPos;
                                                    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c318) {
                                                      s1 = input.substr(peg$currPos, 7);
                                                      peg$currPos += 7;
                                                    } else {
                                                      s1 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c319); }
                                                    }
                                                    if (s1 !== peg$FAILED) {
                                                      s2 = [];
                                                      s3 = peg$parseWS();
                                                      while (s3 !== peg$FAILED) {
                                                        s2.push(s3);
                                                        s3 = peg$parseWS();
                                                      }
                                                      if (s2 !== peg$FAILED) {
                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                          s3 = peg$c17;
                                                          peg$currPos++;
                                                        } else {
                                                          s3 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                        }
                                                        if (s3 !== peg$FAILED) {
                                                          s4 = [];
                                                          s5 = peg$parseWS();
                                                          while (s5 !== peg$FAILED) {
                                                            s4.push(s5);
                                                            s5 = peg$parseWS();
                                                          }
                                                          if (s4 !== peg$FAILED) {
                                                            s5 = peg$parseConditionalOrExpression();
                                                            if (s5 !== peg$FAILED) {
                                                              s6 = [];
                                                              s7 = peg$parseWS();
                                                              while (s7 !== peg$FAILED) {
                                                                s6.push(s7);
                                                                s7 = peg$parseWS();
                                                              }
                                                              if (s6 !== peg$FAILED) {
                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                  s7 = peg$c175;
                                                                  peg$currPos++;
                                                                } else {
                                                                  s7 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                }
                                                                if (s7 !== peg$FAILED) {
                                                                  s8 = [];
                                                                  s9 = peg$parseWS();
                                                                  while (s9 !== peg$FAILED) {
                                                                    s8.push(s9);
                                                                    s9 = peg$parseWS();
                                                                  }
                                                                  if (s8 !== peg$FAILED) {
                                                                    s9 = peg$parseConditionalOrExpression();
                                                                    if (s9 !== peg$FAILED) {
                                                                      s10 = [];
                                                                      s11 = peg$parseWS();
                                                                      while (s11 !== peg$FAILED) {
                                                                        s10.push(s11);
                                                                        s11 = peg$parseWS();
                                                                      }
                                                                      if (s10 !== peg$FAILED) {
                                                                        if (input.charCodeAt(peg$currPos) === 41) {
                                                                          s11 = peg$c21;
                                                                          peg$currPos++;
                                                                        } else {
                                                                          s11 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                        }
                                                                        if (s11 !== peg$FAILED) {
                                                                          peg$savedPos = s0;
                                                                          s1 = peg$c320(s5, s9);
                                                                          s0 = s1;
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                    if (s0 === peg$FAILED) {
                                                      s0 = peg$currPos;
                                                      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c321) {
                                                        s1 = input.substr(peg$currPos, 8);
                                                        peg$currPos += 8;
                                                      } else {
                                                        s1 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c322); }
                                                      }
                                                      if (s1 !== peg$FAILED) {
                                                        s2 = [];
                                                        s3 = peg$parseWS();
                                                        while (s3 !== peg$FAILED) {
                                                          s2.push(s3);
                                                          s3 = peg$parseWS();
                                                        }
                                                        if (s2 !== peg$FAILED) {
                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                            s3 = peg$c17;
                                                            peg$currPos++;
                                                          } else {
                                                            s3 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                          }
                                                          if (s3 !== peg$FAILED) {
                                                            s4 = [];
                                                            s5 = peg$parseWS();
                                                            while (s5 !== peg$FAILED) {
                                                              s4.push(s5);
                                                              s5 = peg$parseWS();
                                                            }
                                                            if (s4 !== peg$FAILED) {
                                                              s5 = peg$parseConditionalOrExpression();
                                                              if (s5 !== peg$FAILED) {
                                                                s6 = [];
                                                                s7 = peg$parseWS();
                                                                while (s7 !== peg$FAILED) {
                                                                  s6.push(s7);
                                                                  s7 = peg$parseWS();
                                                                }
                                                                if (s6 !== peg$FAILED) {
                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                    s7 = peg$c175;
                                                                    peg$currPos++;
                                                                  } else {
                                                                    s7 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                  }
                                                                  if (s7 !== peg$FAILED) {
                                                                    s8 = [];
                                                                    s9 = peg$parseWS();
                                                                    while (s9 !== peg$FAILED) {
                                                                      s8.push(s9);
                                                                      s9 = peg$parseWS();
                                                                    }
                                                                    if (s8 !== peg$FAILED) {
                                                                      s9 = peg$parseConditionalOrExpression();
                                                                      if (s9 !== peg$FAILED) {
                                                                        s10 = [];
                                                                        s11 = peg$parseWS();
                                                                        while (s11 !== peg$FAILED) {
                                                                          s10.push(s11);
                                                                          s11 = peg$parseWS();
                                                                        }
                                                                        if (s10 !== peg$FAILED) {
                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                            s11 = peg$c21;
                                                                            peg$currPos++;
                                                                          } else {
                                                                            s11 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                          }
                                                                          if (s11 !== peg$FAILED) {
                                                                            peg$savedPos = s0;
                                                                            s1 = peg$c323(s5, s9);
                                                                            s0 = s1;
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                      if (s0 === peg$FAILED) {
                                                        s0 = peg$currPos;
                                                        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c324) {
                                                          s1 = input.substr(peg$currPos, 4);
                                                          peg$currPos += 4;
                                                        } else {
                                                          s1 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c325); }
                                                        }
                                                        if (s1 !== peg$FAILED) {
                                                          s2 = [];
                                                          s3 = peg$parseWS();
                                                          while (s3 !== peg$FAILED) {
                                                            s2.push(s3);
                                                            s3 = peg$parseWS();
                                                          }
                                                          if (s2 !== peg$FAILED) {
                                                            if (input.charCodeAt(peg$currPos) === 40) {
                                                              s3 = peg$c17;
                                                              peg$currPos++;
                                                            } else {
                                                              s3 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                            }
                                                            if (s3 !== peg$FAILED) {
                                                              s4 = [];
                                                              s5 = peg$parseWS();
                                                              while (s5 !== peg$FAILED) {
                                                                s4.push(s5);
                                                                s5 = peg$parseWS();
                                                              }
                                                              if (s4 !== peg$FAILED) {
                                                                s5 = peg$parseConditionalOrExpression();
                                                                if (s5 !== peg$FAILED) {
                                                                  s6 = [];
                                                                  s7 = peg$parseWS();
                                                                  while (s7 !== peg$FAILED) {
                                                                    s6.push(s7);
                                                                    s7 = peg$parseWS();
                                                                  }
                                                                  if (s6 !== peg$FAILED) {
                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                      s7 = peg$c21;
                                                                      peg$currPos++;
                                                                    } else {
                                                                      s7 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                    }
                                                                    if (s7 !== peg$FAILED) {
                                                                      peg$savedPos = s0;
                                                                      s1 = peg$c326(s5);
                                                                      s0 = s1;
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                        if (s0 === peg$FAILED) {
                                                          s0 = peg$currPos;
                                                          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c327) {
                                                            s1 = input.substr(peg$currPos, 5);
                                                            peg$currPos += 5;
                                                          } else {
                                                            s1 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c328); }
                                                          }
                                                          if (s1 !== peg$FAILED) {
                                                            s2 = [];
                                                            s3 = peg$parseWS();
                                                            while (s3 !== peg$FAILED) {
                                                              s2.push(s3);
                                                              s3 = peg$parseWS();
                                                            }
                                                            if (s2 !== peg$FAILED) {
                                                              if (input.charCodeAt(peg$currPos) === 40) {
                                                                s3 = peg$c17;
                                                                peg$currPos++;
                                                              } else {
                                                                s3 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                              }
                                                              if (s3 !== peg$FAILED) {
                                                                s4 = [];
                                                                s5 = peg$parseWS();
                                                                while (s5 !== peg$FAILED) {
                                                                  s4.push(s5);
                                                                  s5 = peg$parseWS();
                                                                }
                                                                if (s4 !== peg$FAILED) {
                                                                  s5 = peg$parseConditionalOrExpression();
                                                                  if (s5 !== peg$FAILED) {
                                                                    s6 = [];
                                                                    s7 = peg$parseWS();
                                                                    while (s7 !== peg$FAILED) {
                                                                      s6.push(s7);
                                                                      s7 = peg$parseWS();
                                                                    }
                                                                    if (s6 !== peg$FAILED) {
                                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                                        s7 = peg$c21;
                                                                        peg$currPos++;
                                                                      } else {
                                                                        s7 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                      }
                                                                      if (s7 !== peg$FAILED) {
                                                                        peg$savedPos = s0;
                                                                        s1 = peg$c329(s5);
                                                                        s0 = s1;
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                          if (s0 === peg$FAILED) {
                                                            s0 = peg$currPos;
                                                            if (input.substr(peg$currPos, 3).toLowerCase() === peg$c330) {
                                                              s1 = input.substr(peg$currPos, 3);
                                                              peg$currPos += 3;
                                                            } else {
                                                              s1 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c331); }
                                                            }
                                                            if (s1 !== peg$FAILED) {
                                                              s2 = [];
                                                              s3 = peg$parseWS();
                                                              while (s3 !== peg$FAILED) {
                                                                s2.push(s3);
                                                                s3 = peg$parseWS();
                                                              }
                                                              if (s2 !== peg$FAILED) {
                                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                                  s3 = peg$c17;
                                                                  peg$currPos++;
                                                                } else {
                                                                  s3 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                }
                                                                if (s3 !== peg$FAILED) {
                                                                  s4 = [];
                                                                  s5 = peg$parseWS();
                                                                  while (s5 !== peg$FAILED) {
                                                                    s4.push(s5);
                                                                    s5 = peg$parseWS();
                                                                  }
                                                                  if (s4 !== peg$FAILED) {
                                                                    s5 = peg$parseConditionalOrExpression();
                                                                    if (s5 !== peg$FAILED) {
                                                                      s6 = [];
                                                                      s7 = peg$parseWS();
                                                                      while (s7 !== peg$FAILED) {
                                                                        s6.push(s7);
                                                                        s7 = peg$parseWS();
                                                                      }
                                                                      if (s6 !== peg$FAILED) {
                                                                        if (input.charCodeAt(peg$currPos) === 41) {
                                                                          s7 = peg$c21;
                                                                          peg$currPos++;
                                                                        } else {
                                                                          s7 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                        }
                                                                        if (s7 !== peg$FAILED) {
                                                                          peg$savedPos = s0;
                                                                          s1 = peg$c332(s5);
                                                                          s0 = s1;
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                            if (s0 === peg$FAILED) {
                                                              s0 = peg$currPos;
                                                              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c333) {
                                                                s1 = input.substr(peg$currPos, 5);
                                                                peg$currPos += 5;
                                                              } else {
                                                                s1 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c334); }
                                                              }
                                                              if (s1 !== peg$FAILED) {
                                                                s2 = [];
                                                                s3 = peg$parseWS();
                                                                while (s3 !== peg$FAILED) {
                                                                  s2.push(s3);
                                                                  s3 = peg$parseWS();
                                                                }
                                                                if (s2 !== peg$FAILED) {
                                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                                    s3 = peg$c17;
                                                                    peg$currPos++;
                                                                  } else {
                                                                    s3 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                  }
                                                                  if (s3 !== peg$FAILED) {
                                                                    s4 = [];
                                                                    s5 = peg$parseWS();
                                                                    while (s5 !== peg$FAILED) {
                                                                      s4.push(s5);
                                                                      s5 = peg$parseWS();
                                                                    }
                                                                    if (s4 !== peg$FAILED) {
                                                                      s5 = peg$parseConditionalOrExpression();
                                                                      if (s5 !== peg$FAILED) {
                                                                        s6 = [];
                                                                        s7 = peg$parseWS();
                                                                        while (s7 !== peg$FAILED) {
                                                                          s6.push(s7);
                                                                          s7 = peg$parseWS();
                                                                        }
                                                                        if (s6 !== peg$FAILED) {
                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                            s7 = peg$c21;
                                                                            peg$currPos++;
                                                                          } else {
                                                                            s7 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                          }
                                                                          if (s7 !== peg$FAILED) {
                                                                            peg$savedPos = s0;
                                                                            s1 = peg$c335(s5);
                                                                            s0 = s1;
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                              if (s0 === peg$FAILED) {
                                                                s0 = peg$currPos;
                                                                if (input.substr(peg$currPos, 7).toLowerCase() === peg$c336) {
                                                                  s1 = input.substr(peg$currPos, 7);
                                                                  peg$currPos += 7;
                                                                } else {
                                                                  s1 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c337); }
                                                                }
                                                                if (s1 !== peg$FAILED) {
                                                                  s2 = [];
                                                                  s3 = peg$parseWS();
                                                                  while (s3 !== peg$FAILED) {
                                                                    s2.push(s3);
                                                                    s3 = peg$parseWS();
                                                                  }
                                                                  if (s2 !== peg$FAILED) {
                                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                                      s3 = peg$c17;
                                                                      peg$currPos++;
                                                                    } else {
                                                                      s3 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                    }
                                                                    if (s3 !== peg$FAILED) {
                                                                      s4 = [];
                                                                      s5 = peg$parseWS();
                                                                      while (s5 !== peg$FAILED) {
                                                                        s4.push(s5);
                                                                        s5 = peg$parseWS();
                                                                      }
                                                                      if (s4 !== peg$FAILED) {
                                                                        s5 = peg$parseConditionalOrExpression();
                                                                        if (s5 !== peg$FAILED) {
                                                                          s6 = [];
                                                                          s7 = peg$parseWS();
                                                                          while (s7 !== peg$FAILED) {
                                                                            s6.push(s7);
                                                                            s7 = peg$parseWS();
                                                                          }
                                                                          if (s6 !== peg$FAILED) {
                                                                            if (input.charCodeAt(peg$currPos) === 41) {
                                                                              s7 = peg$c21;
                                                                              peg$currPos++;
                                                                            } else {
                                                                              s7 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                            }
                                                                            if (s7 !== peg$FAILED) {
                                                                              peg$savedPos = s0;
                                                                              s1 = peg$c338(s5);
                                                                              s0 = s1;
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                                if (s0 === peg$FAILED) {
                                                                  s0 = peg$currPos;
                                                                  if (input.substr(peg$currPos, 7).toLowerCase() === peg$c339) {
                                                                    s1 = input.substr(peg$currPos, 7);
                                                                    peg$currPos += 7;
                                                                  } else {
                                                                    s1 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c340); }
                                                                  }
                                                                  if (s1 !== peg$FAILED) {
                                                                    s2 = [];
                                                                    s3 = peg$parseWS();
                                                                    while (s3 !== peg$FAILED) {
                                                                      s2.push(s3);
                                                                      s3 = peg$parseWS();
                                                                    }
                                                                    if (s2 !== peg$FAILED) {
                                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                                        s3 = peg$c17;
                                                                        peg$currPos++;
                                                                      } else {
                                                                        s3 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                      }
                                                                      if (s3 !== peg$FAILED) {
                                                                        s4 = [];
                                                                        s5 = peg$parseWS();
                                                                        while (s5 !== peg$FAILED) {
                                                                          s4.push(s5);
                                                                          s5 = peg$parseWS();
                                                                        }
                                                                        if (s4 !== peg$FAILED) {
                                                                          s5 = peg$parseConditionalOrExpression();
                                                                          if (s5 !== peg$FAILED) {
                                                                            s6 = [];
                                                                            s7 = peg$parseWS();
                                                                            while (s7 !== peg$FAILED) {
                                                                              s6.push(s7);
                                                                              s7 = peg$parseWS();
                                                                            }
                                                                            if (s6 !== peg$FAILED) {
                                                                              if (input.charCodeAt(peg$currPos) === 41) {
                                                                                s7 = peg$c21;
                                                                                peg$currPos++;
                                                                              } else {
                                                                                s7 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                              }
                                                                              if (s7 !== peg$FAILED) {
                                                                                peg$savedPos = s0;
                                                                                s1 = peg$c341(s5);
                                                                                s0 = s1;
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                  if (s0 === peg$FAILED) {
                                                                    s0 = peg$currPos;
                                                                    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c342) {
                                                                      s1 = input.substr(peg$currPos, 8);
                                                                      peg$currPos += 8;
                                                                    } else {
                                                                      s1 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c343); }
                                                                    }
                                                                    if (s1 !== peg$FAILED) {
                                                                      s2 = [];
                                                                      s3 = peg$parseWS();
                                                                      while (s3 !== peg$FAILED) {
                                                                        s2.push(s3);
                                                                        s3 = peg$parseWS();
                                                                      }
                                                                      if (s2 !== peg$FAILED) {
                                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                                          s3 = peg$c17;
                                                                          peg$currPos++;
                                                                        } else {
                                                                          s3 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                        }
                                                                        if (s3 !== peg$FAILED) {
                                                                          s4 = [];
                                                                          s5 = peg$parseWS();
                                                                          while (s5 !== peg$FAILED) {
                                                                            s4.push(s5);
                                                                            s5 = peg$parseWS();
                                                                          }
                                                                          if (s4 !== peg$FAILED) {
                                                                            s5 = peg$parseConditionalOrExpression();
                                                                            if (s5 !== peg$FAILED) {
                                                                              s6 = [];
                                                                              s7 = peg$parseWS();
                                                                              while (s7 !== peg$FAILED) {
                                                                                s6.push(s7);
                                                                                s7 = peg$parseWS();
                                                                              }
                                                                              if (s6 !== peg$FAILED) {
                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                  s7 = peg$c21;
                                                                                  peg$currPos++;
                                                                                } else {
                                                                                  s7 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                }
                                                                                if (s7 !== peg$FAILED) {
                                                                                  peg$savedPos = s0;
                                                                                  s1 = peg$c344(s5);
                                                                                  s0 = s1;
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                    if (s0 === peg$FAILED) {
                                                                      s0 = peg$currPos;
                                                                      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c345) {
                                                                        s1 = input.substr(peg$currPos, 2);
                                                                        peg$currPos += 2;
                                                                      } else {
                                                                        s1 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c346); }
                                                                      }
                                                                      if (s1 !== peg$FAILED) {
                                                                        s2 = [];
                                                                        s3 = peg$parseWS();
                                                                        while (s3 !== peg$FAILED) {
                                                                          s2.push(s3);
                                                                          s3 = peg$parseWS();
                                                                        }
                                                                        if (s2 !== peg$FAILED) {
                                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                                            s3 = peg$c17;
                                                                            peg$currPos++;
                                                                          } else {
                                                                            s3 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                          }
                                                                          if (s3 !== peg$FAILED) {
                                                                            s4 = [];
                                                                            s5 = peg$parseWS();
                                                                            while (s5 !== peg$FAILED) {
                                                                              s4.push(s5);
                                                                              s5 = peg$parseWS();
                                                                            }
                                                                            if (s4 !== peg$FAILED) {
                                                                              s5 = peg$parseConditionalOrExpression();
                                                                              if (s5 !== peg$FAILED) {
                                                                                s6 = [];
                                                                                s7 = peg$parseWS();
                                                                                while (s7 !== peg$FAILED) {
                                                                                  s6.push(s7);
                                                                                  s7 = peg$parseWS();
                                                                                }
                                                                                if (s6 !== peg$FAILED) {
                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                    s7 = peg$c21;
                                                                                    peg$currPos++;
                                                                                  } else {
                                                                                    s7 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                  }
                                                                                  if (s7 !== peg$FAILED) {
                                                                                    peg$savedPos = s0;
                                                                                    s1 = peg$c347(s5);
                                                                                    s0 = s1;
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                      if (s0 === peg$FAILED) {
                                                                        s0 = peg$currPos;
                                                                        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c348) {
                                                                          s1 = input.substr(peg$currPos, 3);
                                                                          peg$currPos += 3;
                                                                        } else {
                                                                          s1 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c349); }
                                                                        }
                                                                        if (s1 !== peg$FAILED) {
                                                                          s2 = [];
                                                                          s3 = peg$parseWS();
                                                                          while (s3 !== peg$FAILED) {
                                                                            s2.push(s3);
                                                                            s3 = peg$parseWS();
                                                                          }
                                                                          if (s2 !== peg$FAILED) {
                                                                            s3 = peg$parseNIL();
                                                                            if (s3 !== peg$FAILED) {
                                                                              peg$savedPos = s0;
                                                                              s1 = peg$c350();
                                                                              s0 = s1;
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                        if (s0 === peg$FAILED) {
                                                                          s0 = peg$currPos;
                                                                          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c351) {
                                                                            s1 = input.substr(peg$currPos, 4);
                                                                            peg$currPos += 4;
                                                                          } else {
                                                                            s1 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c352); }
                                                                          }
                                                                          if (s1 !== peg$FAILED) {
                                                                            s2 = [];
                                                                            s3 = peg$parseWS();
                                                                            while (s3 !== peg$FAILED) {
                                                                              s2.push(s3);
                                                                              s3 = peg$parseWS();
                                                                            }
                                                                            if (s2 !== peg$FAILED) {
                                                                              s3 = peg$parseNIL();
                                                                              if (s3 !== peg$FAILED) {
                                                                                peg$savedPos = s0;
                                                                                s1 = peg$c353();
                                                                                s0 = s1;
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                          if (s0 === peg$FAILED) {
                                                                            s0 = peg$currPos;
                                                                            if (input.substr(peg$currPos, 7).toLowerCase() === peg$c354) {
                                                                              s1 = input.substr(peg$currPos, 7);
                                                                              peg$currPos += 7;
                                                                            } else {
                                                                              s1 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c355); }
                                                                            }
                                                                            if (s1 !== peg$FAILED) {
                                                                              s2 = [];
                                                                              s3 = peg$parseWS();
                                                                              while (s3 !== peg$FAILED) {
                                                                                s2.push(s3);
                                                                                s3 = peg$parseWS();
                                                                              }
                                                                              if (s2 !== peg$FAILED) {
                                                                                s3 = peg$parseNIL();
                                                                                if (s3 !== peg$FAILED) {
                                                                                  peg$savedPos = s0;
                                                                                  s1 = peg$c356();
                                                                                  s0 = s1;
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                            if (s0 === peg$FAILED) {
                                                                              s0 = peg$currPos;
                                                                              if (input.substr(peg$currPos, 3).toLowerCase() === peg$c357) {
                                                                                s1 = input.substr(peg$currPos, 3);
                                                                                peg$currPos += 3;
                                                                              } else {
                                                                                s1 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c358); }
                                                                              }
                                                                              if (s1 !== peg$FAILED) {
                                                                                s2 = [];
                                                                                s3 = peg$parseWS();
                                                                                while (s3 !== peg$FAILED) {
                                                                                  s2.push(s3);
                                                                                  s3 = peg$parseWS();
                                                                                }
                                                                                if (s2 !== peg$FAILED) {
                                                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                                                    s3 = peg$c17;
                                                                                    peg$currPos++;
                                                                                  } else {
                                                                                    s3 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                  }
                                                                                  if (s3 !== peg$FAILED) {
                                                                                    s4 = [];
                                                                                    s5 = peg$parseWS();
                                                                                    while (s5 !== peg$FAILED) {
                                                                                      s4.push(s5);
                                                                                      s5 = peg$parseWS();
                                                                                    }
                                                                                    if (s4 !== peg$FAILED) {
                                                                                      s5 = peg$parseConditionalOrExpression();
                                                                                      if (s5 !== peg$FAILED) {
                                                                                        s6 = [];
                                                                                        s7 = peg$parseWS();
                                                                                        while (s7 !== peg$FAILED) {
                                                                                          s6.push(s7);
                                                                                          s7 = peg$parseWS();
                                                                                        }
                                                                                        if (s6 !== peg$FAILED) {
                                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                                            s7 = peg$c21;
                                                                                            peg$currPos++;
                                                                                          } else {
                                                                                            s7 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                          }
                                                                                          if (s7 !== peg$FAILED) {
                                                                                            peg$savedPos = s0;
                                                                                            s1 = peg$c359(s5);
                                                                                            s0 = s1;
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                              if (s0 === peg$FAILED) {
                                                                                s0 = peg$currPos;
                                                                                if (input.substr(peg$currPos, 4).toLowerCase() === peg$c360) {
                                                                                  s1 = input.substr(peg$currPos, 4);
                                                                                  peg$currPos += 4;
                                                                                } else {
                                                                                  s1 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c361); }
                                                                                }
                                                                                if (s1 !== peg$FAILED) {
                                                                                  s2 = [];
                                                                                  s3 = peg$parseWS();
                                                                                  while (s3 !== peg$FAILED) {
                                                                                    s2.push(s3);
                                                                                    s3 = peg$parseWS();
                                                                                  }
                                                                                  if (s2 !== peg$FAILED) {
                                                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                                                      s3 = peg$c17;
                                                                                      peg$currPos++;
                                                                                    } else {
                                                                                      s3 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                    }
                                                                                    if (s3 !== peg$FAILED) {
                                                                                      s4 = [];
                                                                                      s5 = peg$parseWS();
                                                                                      while (s5 !== peg$FAILED) {
                                                                                        s4.push(s5);
                                                                                        s5 = peg$parseWS();
                                                                                      }
                                                                                      if (s4 !== peg$FAILED) {
                                                                                        s5 = peg$parseConditionalOrExpression();
                                                                                        if (s5 !== peg$FAILED) {
                                                                                          s6 = [];
                                                                                          s7 = peg$parseWS();
                                                                                          while (s7 !== peg$FAILED) {
                                                                                            s6.push(s7);
                                                                                            s7 = peg$parseWS();
                                                                                          }
                                                                                          if (s6 !== peg$FAILED) {
                                                                                            if (input.charCodeAt(peg$currPos) === 41) {
                                                                                              s7 = peg$c21;
                                                                                              peg$currPos++;
                                                                                            } else {
                                                                                              s7 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                            }
                                                                                            if (s7 !== peg$FAILED) {
                                                                                              peg$savedPos = s0;
                                                                                              s1 = peg$c362(s5);
                                                                                              s0 = s1;
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                                if (s0 === peg$FAILED) {
                                                                                  s0 = peg$currPos;
                                                                                  if (input.substr(peg$currPos, 6).toLowerCase() === peg$c363) {
                                                                                    s1 = input.substr(peg$currPos, 6);
                                                                                    peg$currPos += 6;
                                                                                  } else {
                                                                                    s1 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c364); }
                                                                                  }
                                                                                  if (s1 !== peg$FAILED) {
                                                                                    s2 = [];
                                                                                    s3 = peg$parseWS();
                                                                                    while (s3 !== peg$FAILED) {
                                                                                      s2.push(s3);
                                                                                      s3 = peg$parseWS();
                                                                                    }
                                                                                    if (s2 !== peg$FAILED) {
                                                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                                                        s3 = peg$c17;
                                                                                        peg$currPos++;
                                                                                      } else {
                                                                                        s3 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                      }
                                                                                      if (s3 !== peg$FAILED) {
                                                                                        s4 = [];
                                                                                        s5 = peg$parseWS();
                                                                                        while (s5 !== peg$FAILED) {
                                                                                          s4.push(s5);
                                                                                          s5 = peg$parseWS();
                                                                                        }
                                                                                        if (s4 !== peg$FAILED) {
                                                                                          s5 = peg$parseConditionalOrExpression();
                                                                                          if (s5 !== peg$FAILED) {
                                                                                            s6 = [];
                                                                                            s7 = peg$parseWS();
                                                                                            while (s7 !== peg$FAILED) {
                                                                                              s6.push(s7);
                                                                                              s7 = peg$parseWS();
                                                                                            }
                                                                                            if (s6 !== peg$FAILED) {
                                                                                              if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                s7 = peg$c21;
                                                                                                peg$currPos++;
                                                                                              } else {
                                                                                                s7 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                              }
                                                                                              if (s7 !== peg$FAILED) {
                                                                                                peg$savedPos = s0;
                                                                                                s1 = peg$c365(s5);
                                                                                                s0 = s1;
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                  if (s0 === peg$FAILED) {
                                                                                    s0 = peg$currPos;
                                                                                    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c366) {
                                                                                      s1 = input.substr(peg$currPos, 6);
                                                                                      peg$currPos += 6;
                                                                                    } else {
                                                                                      s1 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c367); }
                                                                                    }
                                                                                    if (s1 !== peg$FAILED) {
                                                                                      s2 = [];
                                                                                      s3 = peg$parseWS();
                                                                                      while (s3 !== peg$FAILED) {
                                                                                        s2.push(s3);
                                                                                        s3 = peg$parseWS();
                                                                                      }
                                                                                      if (s2 !== peg$FAILED) {
                                                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                                                          s3 = peg$c17;
                                                                                          peg$currPos++;
                                                                                        } else {
                                                                                          s3 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                        }
                                                                                        if (s3 !== peg$FAILED) {
                                                                                          s4 = [];
                                                                                          s5 = peg$parseWS();
                                                                                          while (s5 !== peg$FAILED) {
                                                                                            s4.push(s5);
                                                                                            s5 = peg$parseWS();
                                                                                          }
                                                                                          if (s4 !== peg$FAILED) {
                                                                                            s5 = peg$parseConditionalOrExpression();
                                                                                            if (s5 !== peg$FAILED) {
                                                                                              s6 = [];
                                                                                              s7 = peg$parseWS();
                                                                                              while (s7 !== peg$FAILED) {
                                                                                                s6.push(s7);
                                                                                                s7 = peg$parseWS();
                                                                                              }
                                                                                              if (s6 !== peg$FAILED) {
                                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                  s7 = peg$c21;
                                                                                                  peg$currPos++;
                                                                                                } else {
                                                                                                  s7 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                }
                                                                                                if (s7 !== peg$FAILED) {
                                                                                                  peg$savedPos = s0;
                                                                                                  s1 = peg$c368(s5);
                                                                                                  s0 = s1;
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                    if (s0 === peg$FAILED) {
                                                                                      s0 = peg$currPos;
                                                                                      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c369) {
                                                                                        s1 = input.substr(peg$currPos, 6);
                                                                                        peg$currPos += 6;
                                                                                      } else {
                                                                                        s1 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c370); }
                                                                                      }
                                                                                      if (s1 !== peg$FAILED) {
                                                                                        s2 = [];
                                                                                        s3 = peg$parseWS();
                                                                                        while (s3 !== peg$FAILED) {
                                                                                          s2.push(s3);
                                                                                          s3 = peg$parseWS();
                                                                                        }
                                                                                        if (s2 !== peg$FAILED) {
                                                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                                                            s3 = peg$c17;
                                                                                            peg$currPos++;
                                                                                          } else {
                                                                                            s3 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                          }
                                                                                          if (s3 !== peg$FAILED) {
                                                                                            s4 = [];
                                                                                            s5 = peg$parseWS();
                                                                                            while (s5 !== peg$FAILED) {
                                                                                              s4.push(s5);
                                                                                              s5 = peg$parseWS();
                                                                                            }
                                                                                            if (s4 !== peg$FAILED) {
                                                                                              s5 = peg$parseConditionalOrExpression();
                                                                                              if (s5 !== peg$FAILED) {
                                                                                                s6 = [];
                                                                                                s7 = peg$parseWS();
                                                                                                while (s7 !== peg$FAILED) {
                                                                                                  s6.push(s7);
                                                                                                  s7 = peg$parseWS();
                                                                                                }
                                                                                                if (s6 !== peg$FAILED) {
                                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                    s7 = peg$c21;
                                                                                                    peg$currPos++;
                                                                                                  } else {
                                                                                                    s7 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                  }
                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                    peg$savedPos = s0;
                                                                                                    s1 = peg$c371(s5);
                                                                                                    s0 = s1;
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                      if (s0 === peg$FAILED) {
                                                                                        s0 = peg$currPos;
                                                                                        if (input.substr(peg$currPos, 8).toLowerCase() === peg$c372) {
                                                                                          s1 = input.substr(peg$currPos, 8);
                                                                                          peg$currPos += 8;
                                                                                        } else {
                                                                                          s1 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c373); }
                                                                                        }
                                                                                        if (s1 !== peg$FAILED) {
                                                                                          s2 = [];
                                                                                          s3 = peg$parseWS();
                                                                                          while (s3 !== peg$FAILED) {
                                                                                            s2.push(s3);
                                                                                            s3 = peg$parseWS();
                                                                                          }
                                                                                          if (s2 !== peg$FAILED) {
                                                                                            s3 = peg$parseExpressionList();
                                                                                            if (s3 !== peg$FAILED) {
                                                                                              peg$savedPos = s0;
                                                                                              s1 = peg$c374(s3);
                                                                                              s0 = s1;
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                        if (s0 === peg$FAILED) {
                                                                                          s0 = peg$currPos;
                                                                                          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c375) {
                                                                                            s1 = input.substr(peg$currPos, 2);
                                                                                            peg$currPos += 2;
                                                                                          } else {
                                                                                            s1 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c376); }
                                                                                          }
                                                                                          if (s1 !== peg$FAILED) {
                                                                                            s2 = [];
                                                                                            s3 = peg$parseWS();
                                                                                            while (s3 !== peg$FAILED) {
                                                                                              s2.push(s3);
                                                                                              s3 = peg$parseWS();
                                                                                            }
                                                                                            if (s2 !== peg$FAILED) {
                                                                                              if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                s3 = peg$c17;
                                                                                                peg$currPos++;
                                                                                              } else {
                                                                                                s3 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                              }
                                                                                              if (s3 !== peg$FAILED) {
                                                                                                s4 = [];
                                                                                                s5 = peg$parseWS();
                                                                                                while (s5 !== peg$FAILED) {
                                                                                                  s4.push(s5);
                                                                                                  s5 = peg$parseWS();
                                                                                                }
                                                                                                if (s4 !== peg$FAILED) {
                                                                                                  s5 = peg$parseConditionalOrExpression();
                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                    s6 = [];
                                                                                                    s7 = peg$parseWS();
                                                                                                    while (s7 !== peg$FAILED) {
                                                                                                      s6.push(s7);
                                                                                                      s7 = peg$parseWS();
                                                                                                    }
                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                        s7 = peg$c175;
                                                                                                        peg$currPos++;
                                                                                                      } else {
                                                                                                        s7 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                                                      }
                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                        s8 = [];
                                                                                                        s9 = peg$parseWS();
                                                                                                        while (s9 !== peg$FAILED) {
                                                                                                          s8.push(s9);
                                                                                                          s9 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s8 !== peg$FAILED) {
                                                                                                          s9 = peg$parseConditionalOrExpression();
                                                                                                          if (s9 !== peg$FAILED) {
                                                                                                            s10 = [];
                                                                                                            s11 = peg$parseWS();
                                                                                                            while (s11 !== peg$FAILED) {
                                                                                                              s10.push(s11);
                                                                                                              s11 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s10 !== peg$FAILED) {
                                                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                s11 = peg$c175;
                                                                                                                peg$currPos++;
                                                                                                              } else {
                                                                                                                s11 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                                                              }
                                                                                                              if (s11 !== peg$FAILED) {
                                                                                                                s12 = [];
                                                                                                                s13 = peg$parseWS();
                                                                                                                while (s13 !== peg$FAILED) {
                                                                                                                  s12.push(s13);
                                                                                                                  s13 = peg$parseWS();
                                                                                                                }
                                                                                                                if (s12 !== peg$FAILED) {
                                                                                                                  s13 = peg$parseConditionalOrExpression();
                                                                                                                  if (s13 !== peg$FAILED) {
                                                                                                                    s14 = [];
                                                                                                                    s15 = peg$parseWS();
                                                                                                                    while (s15 !== peg$FAILED) {
                                                                                                                      s14.push(s15);
                                                                                                                      s15 = peg$parseWS();
                                                                                                                    }
                                                                                                                    if (s14 !== peg$FAILED) {
                                                                                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                        s15 = peg$c21;
                                                                                                                        peg$currPos++;
                                                                                                                      } else {
                                                                                                                        s15 = peg$FAILED;
                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                      }
                                                                                                                      if (s15 !== peg$FAILED) {
                                                                                                                        peg$savedPos = s0;
                                                                                                                        s1 = peg$c377(s5, s9, s13);
                                                                                                                        s0 = s1;
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                          if (s0 === peg$FAILED) {
                                                                                            s0 = peg$currPos;
                                                                                            if (input.substr(peg$currPos, 7).toLowerCase() === peg$c378) {
                                                                                              s1 = input.substr(peg$currPos, 7);
                                                                                              peg$currPos += 7;
                                                                                            } else {
                                                                                              s1 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c379); }
                                                                                            }
                                                                                            if (s1 !== peg$FAILED) {
                                                                                              s2 = [];
                                                                                              s3 = peg$parseWS();
                                                                                              while (s3 !== peg$FAILED) {
                                                                                                s2.push(s3);
                                                                                                s3 = peg$parseWS();
                                                                                              }
                                                                                              if (s2 !== peg$FAILED) {
                                                                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                  s3 = peg$c17;
                                                                                                  peg$currPos++;
                                                                                                } else {
                                                                                                  s3 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                }
                                                                                                if (s3 !== peg$FAILED) {
                                                                                                  s4 = [];
                                                                                                  s5 = peg$parseWS();
                                                                                                  while (s5 !== peg$FAILED) {
                                                                                                    s4.push(s5);
                                                                                                    s5 = peg$parseWS();
                                                                                                  }
                                                                                                  if (s4 !== peg$FAILED) {
                                                                                                    s5 = peg$parseConditionalOrExpression();
                                                                                                    if (s5 !== peg$FAILED) {
                                                                                                      s6 = [];
                                                                                                      s7 = peg$parseWS();
                                                                                                      while (s7 !== peg$FAILED) {
                                                                                                        s6.push(s7);
                                                                                                        s7 = peg$parseWS();
                                                                                                      }
                                                                                                      if (s6 !== peg$FAILED) {
                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                          s7 = peg$c175;
                                                                                                          peg$currPos++;
                                                                                                        } else {
                                                                                                          s7 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                                                        }
                                                                                                        if (s7 !== peg$FAILED) {
                                                                                                          s8 = [];
                                                                                                          s9 = peg$parseWS();
                                                                                                          while (s9 !== peg$FAILED) {
                                                                                                            s8.push(s9);
                                                                                                            s9 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s8 !== peg$FAILED) {
                                                                                                            s9 = peg$parseConditionalOrExpression();
                                                                                                            if (s9 !== peg$FAILED) {
                                                                                                              s10 = [];
                                                                                                              s11 = peg$parseWS();
                                                                                                              while (s11 !== peg$FAILED) {
                                                                                                                s10.push(s11);
                                                                                                                s11 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s10 !== peg$FAILED) {
                                                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                  s11 = peg$c21;
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s11 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                }
                                                                                                                if (s11 !== peg$FAILED) {
                                                                                                                  peg$savedPos = s0;
                                                                                                                  s1 = peg$c380(s5, s9);
                                                                                                                  s0 = s1;
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                            if (s0 === peg$FAILED) {
                                                                                              s0 = peg$currPos;
                                                                                              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c381) {
                                                                                                s1 = input.substr(peg$currPos, 5);
                                                                                                peg$currPos += 5;
                                                                                              } else {
                                                                                                s1 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c382); }
                                                                                              }
                                                                                              if (s1 !== peg$FAILED) {
                                                                                                s2 = [];
                                                                                                s3 = peg$parseWS();
                                                                                                while (s3 !== peg$FAILED) {
                                                                                                  s2.push(s3);
                                                                                                  s3 = peg$parseWS();
                                                                                                }
                                                                                                if (s2 !== peg$FAILED) {
                                                                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                    s3 = peg$c17;
                                                                                                    peg$currPos++;
                                                                                                  } else {
                                                                                                    s3 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                  }
                                                                                                  if (s3 !== peg$FAILED) {
                                                                                                    s4 = [];
                                                                                                    s5 = peg$parseWS();
                                                                                                    while (s5 !== peg$FAILED) {
                                                                                                      s4.push(s5);
                                                                                                      s5 = peg$parseWS();
                                                                                                    }
                                                                                                    if (s4 !== peg$FAILED) {
                                                                                                      s5 = peg$parseConditionalOrExpression();
                                                                                                      if (s5 !== peg$FAILED) {
                                                                                                        s6 = [];
                                                                                                        s7 = peg$parseWS();
                                                                                                        while (s7 !== peg$FAILED) {
                                                                                                          s6.push(s7);
                                                                                                          s7 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s6 !== peg$FAILED) {
                                                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                            s7 = peg$c175;
                                                                                                            peg$currPos++;
                                                                                                          } else {
                                                                                                            s7 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                                                          }
                                                                                                          if (s7 !== peg$FAILED) {
                                                                                                            s8 = [];
                                                                                                            s9 = peg$parseWS();
                                                                                                            while (s9 !== peg$FAILED) {
                                                                                                              s8.push(s9);
                                                                                                              s9 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s8 !== peg$FAILED) {
                                                                                                              s9 = peg$parseConditionalOrExpression();
                                                                                                              if (s9 !== peg$FAILED) {
                                                                                                                s10 = [];
                                                                                                                s11 = peg$parseWS();
                                                                                                                while (s11 !== peg$FAILED) {
                                                                                                                  s10.push(s11);
                                                                                                                  s11 = peg$parseWS();
                                                                                                                }
                                                                                                                if (s10 !== peg$FAILED) {
                                                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                    s11 = peg$c21;
                                                                                                                    peg$currPos++;
                                                                                                                  } else {
                                                                                                                    s11 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                  }
                                                                                                                  if (s11 !== peg$FAILED) {
                                                                                                                    peg$savedPos = s0;
                                                                                                                    s1 = peg$c383(s5, s9);
                                                                                                                    s0 = s1;
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                              if (s0 === peg$FAILED) {
                                                                                                s0 = peg$currPos;
                                                                                                if (input.substr(peg$currPos, 8).toLowerCase() === peg$c384) {
                                                                                                  s1 = input.substr(peg$currPos, 8);
                                                                                                  peg$currPos += 8;
                                                                                                } else {
                                                                                                  s1 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c385); }
                                                                                                }
                                                                                                if (s1 !== peg$FAILED) {
                                                                                                  s2 = [];
                                                                                                  s3 = peg$parseWS();
                                                                                                  while (s3 !== peg$FAILED) {
                                                                                                    s2.push(s3);
                                                                                                    s3 = peg$parseWS();
                                                                                                  }
                                                                                                  if (s2 !== peg$FAILED) {
                                                                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                      s3 = peg$c17;
                                                                                                      peg$currPos++;
                                                                                                    } else {
                                                                                                      s3 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                    }
                                                                                                    if (s3 !== peg$FAILED) {
                                                                                                      s4 = [];
                                                                                                      s5 = peg$parseWS();
                                                                                                      while (s5 !== peg$FAILED) {
                                                                                                        s4.push(s5);
                                                                                                        s5 = peg$parseWS();
                                                                                                      }
                                                                                                      if (s4 !== peg$FAILED) {
                                                                                                        s5 = peg$parseConditionalOrExpression();
                                                                                                        if (s5 !== peg$FAILED) {
                                                                                                          s6 = [];
                                                                                                          s7 = peg$parseWS();
                                                                                                          while (s7 !== peg$FAILED) {
                                                                                                            s6.push(s7);
                                                                                                            s7 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s6 !== peg$FAILED) {
                                                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                              s7 = peg$c175;
                                                                                                              peg$currPos++;
                                                                                                            } else {
                                                                                                              s7 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                                                            }
                                                                                                            if (s7 !== peg$FAILED) {
                                                                                                              s8 = [];
                                                                                                              s9 = peg$parseWS();
                                                                                                              while (s9 !== peg$FAILED) {
                                                                                                                s8.push(s9);
                                                                                                                s9 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s8 !== peg$FAILED) {
                                                                                                                s9 = peg$parseConditionalOrExpression();
                                                                                                                if (s9 !== peg$FAILED) {
                                                                                                                  s10 = [];
                                                                                                                  s11 = peg$parseWS();
                                                                                                                  while (s11 !== peg$FAILED) {
                                                                                                                    s10.push(s11);
                                                                                                                    s11 = peg$parseWS();
                                                                                                                  }
                                                                                                                  if (s10 !== peg$FAILED) {
                                                                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                      s11 = peg$c21;
                                                                                                                      peg$currPos++;
                                                                                                                    } else {
                                                                                                                      s11 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                    }
                                                                                                                    if (s11 !== peg$FAILED) {
                                                                                                                      peg$savedPos = s0;
                                                                                                                      s1 = peg$c386(s5, s9);
                                                                                                                      s0 = s1;
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                                if (s0 === peg$FAILED) {
                                                                                                  s0 = peg$currPos;
                                                                                                  if (input.substr(peg$currPos, 5).toLowerCase() === peg$c387) {
                                                                                                    s1 = input.substr(peg$currPos, 5);
                                                                                                    peg$currPos += 5;
                                                                                                  } else {
                                                                                                    s1 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c388); }
                                                                                                  }
                                                                                                  if (s1 === peg$FAILED) {
                                                                                                    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c389) {
                                                                                                      s1 = input.substr(peg$currPos, 5);
                                                                                                      peg$currPos += 5;
                                                                                                    } else {
                                                                                                      s1 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c390); }
                                                                                                    }
                                                                                                  }
                                                                                                  if (s1 !== peg$FAILED) {
                                                                                                    s2 = [];
                                                                                                    s3 = peg$parseWS();
                                                                                                    while (s3 !== peg$FAILED) {
                                                                                                      s2.push(s3);
                                                                                                      s3 = peg$parseWS();
                                                                                                    }
                                                                                                    if (s2 !== peg$FAILED) {
                                                                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                        s3 = peg$c17;
                                                                                                        peg$currPos++;
                                                                                                      } else {
                                                                                                        s3 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                      }
                                                                                                      if (s3 !== peg$FAILED) {
                                                                                                        s4 = [];
                                                                                                        s5 = peg$parseWS();
                                                                                                        while (s5 !== peg$FAILED) {
                                                                                                          s4.push(s5);
                                                                                                          s5 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s4 !== peg$FAILED) {
                                                                                                          s5 = peg$parseConditionalOrExpression();
                                                                                                          if (s5 !== peg$FAILED) {
                                                                                                            s6 = [];
                                                                                                            s7 = peg$parseWS();
                                                                                                            while (s7 !== peg$FAILED) {
                                                                                                              s6.push(s7);
                                                                                                              s7 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s6 !== peg$FAILED) {
                                                                                                              if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                s7 = peg$c21;
                                                                                                                peg$currPos++;
                                                                                                              } else {
                                                                                                                s7 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                              }
                                                                                                              if (s7 !== peg$FAILED) {
                                                                                                                peg$savedPos = s0;
                                                                                                                s1 = peg$c391(s5);
                                                                                                                s0 = s1;
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                  if (s0 === peg$FAILED) {
                                                                                                    s0 = peg$currPos;
                                                                                                    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c392) {
                                                                                                      s1 = input.substr(peg$currPos, 7);
                                                                                                      peg$currPos += 7;
                                                                                                    } else {
                                                                                                      s1 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c393); }
                                                                                                    }
                                                                                                    if (s1 !== peg$FAILED) {
                                                                                                      s2 = [];
                                                                                                      s3 = peg$parseWS();
                                                                                                      while (s3 !== peg$FAILED) {
                                                                                                        s2.push(s3);
                                                                                                        s3 = peg$parseWS();
                                                                                                      }
                                                                                                      if (s2 !== peg$FAILED) {
                                                                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                          s3 = peg$c17;
                                                                                                          peg$currPos++;
                                                                                                        } else {
                                                                                                          s3 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                        }
                                                                                                        if (s3 !== peg$FAILED) {
                                                                                                          s4 = [];
                                                                                                          s5 = peg$parseWS();
                                                                                                          while (s5 !== peg$FAILED) {
                                                                                                            s4.push(s5);
                                                                                                            s5 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s4 !== peg$FAILED) {
                                                                                                            s5 = peg$parseConditionalOrExpression();
                                                                                                            if (s5 !== peg$FAILED) {
                                                                                                              s6 = [];
                                                                                                              s7 = peg$parseWS();
                                                                                                              while (s7 !== peg$FAILED) {
                                                                                                                s6.push(s7);
                                                                                                                s7 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s6 !== peg$FAILED) {
                                                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                  s7 = peg$c21;
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s7 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                }
                                                                                                                if (s7 !== peg$FAILED) {
                                                                                                                  peg$savedPos = s0;
                                                                                                                  s1 = peg$c394(s5);
                                                                                                                  s0 = s1;
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                    if (s0 === peg$FAILED) {
                                                                                                      s0 = peg$currPos;
                                                                                                      if (input.substr(peg$currPos, 9).toLowerCase() === peg$c395) {
                                                                                                        s1 = input.substr(peg$currPos, 9);
                                                                                                        peg$currPos += 9;
                                                                                                      } else {
                                                                                                        s1 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c396); }
                                                                                                      }
                                                                                                      if (s1 !== peg$FAILED) {
                                                                                                        s2 = [];
                                                                                                        s3 = peg$parseWS();
                                                                                                        while (s3 !== peg$FAILED) {
                                                                                                          s2.push(s3);
                                                                                                          s3 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s2 !== peg$FAILED) {
                                                                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                            s3 = peg$c17;
                                                                                                            peg$currPos++;
                                                                                                          } else {
                                                                                                            s3 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                          }
                                                                                                          if (s3 !== peg$FAILED) {
                                                                                                            s4 = [];
                                                                                                            s5 = peg$parseWS();
                                                                                                            while (s5 !== peg$FAILED) {
                                                                                                              s4.push(s5);
                                                                                                              s5 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s4 !== peg$FAILED) {
                                                                                                              s5 = peg$parseConditionalOrExpression();
                                                                                                              if (s5 !== peg$FAILED) {
                                                                                                                s6 = [];
                                                                                                                s7 = peg$parseWS();
                                                                                                                while (s7 !== peg$FAILED) {
                                                                                                                  s6.push(s7);
                                                                                                                  s7 = peg$parseWS();
                                                                                                                }
                                                                                                                if (s6 !== peg$FAILED) {
                                                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                    s7 = peg$c21;
                                                                                                                    peg$currPos++;
                                                                                                                  } else {
                                                                                                                    s7 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                  }
                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                    peg$savedPos = s0;
                                                                                                                    s1 = peg$c397(s5);
                                                                                                                    s0 = s1;
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                      if (s0 === peg$FAILED) {
                                                                                                        s0 = peg$currPos;
                                                                                                        if (input.substr(peg$currPos, 9).toLowerCase() === peg$c398) {
                                                                                                          s1 = input.substr(peg$currPos, 9);
                                                                                                          peg$currPos += 9;
                                                                                                        } else {
                                                                                                          s1 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c399); }
                                                                                                        }
                                                                                                        if (s1 !== peg$FAILED) {
                                                                                                          s2 = [];
                                                                                                          s3 = peg$parseWS();
                                                                                                          while (s3 !== peg$FAILED) {
                                                                                                            s2.push(s3);
                                                                                                            s3 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s2 !== peg$FAILED) {
                                                                                                            if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                              s3 = peg$c17;
                                                                                                              peg$currPos++;
                                                                                                            } else {
                                                                                                              s3 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                            }
                                                                                                            if (s3 !== peg$FAILED) {
                                                                                                              s4 = [];
                                                                                                              s5 = peg$parseWS();
                                                                                                              while (s5 !== peg$FAILED) {
                                                                                                                s4.push(s5);
                                                                                                                s5 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s4 !== peg$FAILED) {
                                                                                                                s5 = peg$parseConditionalOrExpression();
                                                                                                                if (s5 !== peg$FAILED) {
                                                                                                                  s6 = [];
                                                                                                                  s7 = peg$parseWS();
                                                                                                                  while (s7 !== peg$FAILED) {
                                                                                                                    s6.push(s7);
                                                                                                                    s7 = peg$parseWS();
                                                                                                                  }
                                                                                                                  if (s6 !== peg$FAILED) {
                                                                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                      s7 = peg$c21;
                                                                                                                      peg$currPos++;
                                                                                                                    } else {
                                                                                                                      s7 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                    }
                                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                                      peg$savedPos = s0;
                                                                                                                      s1 = peg$c400(s5);
                                                                                                                      s0 = s1;
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                        if (s0 === peg$FAILED) {
                                                                                                          s0 = peg$currPos;
                                                                                                          if (input.substr(peg$currPos, 7).toLowerCase() === peg$c401) {
                                                                                                            s1 = input.substr(peg$currPos, 7);
                                                                                                            peg$currPos += 7;
                                                                                                          } else {
                                                                                                            s1 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c402); }
                                                                                                          }
                                                                                                          if (s1 !== peg$FAILED) {
                                                                                                            s2 = [];
                                                                                                            if (peg$c403.test(input.charAt(peg$currPos))) {
                                                                                                              s3 = input.charAt(peg$currPos);
                                                                                                              peg$currPos++;
                                                                                                            } else {
                                                                                                              s3 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c404); }
                                                                                                            }
                                                                                                            if (s3 !== peg$FAILED) {
                                                                                                              while (s3 !== peg$FAILED) {
                                                                                                                s2.push(s3);
                                                                                                                if (peg$c403.test(input.charAt(peg$currPos))) {
                                                                                                                  s3 = input.charAt(peg$currPos);
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s3 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c404); }
                                                                                                                }
                                                                                                              }
                                                                                                            } else {
                                                                                                              s2 = peg$FAILED;
                                                                                                            }
                                                                                                            if (s2 !== peg$FAILED) {
                                                                                                              s3 = [];
                                                                                                              s4 = peg$parseWS();
                                                                                                              while (s4 !== peg$FAILED) {
                                                                                                                s3.push(s4);
                                                                                                                s4 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s3 !== peg$FAILED) {
                                                                                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                                  s4 = peg$c17;
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s4 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                                }
                                                                                                                if (s4 !== peg$FAILED) {
                                                                                                                  s5 = [];
                                                                                                                  s6 = peg$currPos;
                                                                                                                  s7 = [];
                                                                                                                  s8 = peg$parseWS();
                                                                                                                  while (s8 !== peg$FAILED) {
                                                                                                                    s7.push(s8);
                                                                                                                    s8 = peg$parseWS();
                                                                                                                  }
                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                    s8 = peg$parseConditionalOrExpression();
                                                                                                                    if (s8 !== peg$FAILED) {
                                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                        s9 = peg$c175;
                                                                                                                        peg$currPos++;
                                                                                                                      } else {
                                                                                                                        s9 = peg$FAILED;
                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                                                                      }
                                                                                                                      if (s9 !== peg$FAILED) {
                                                                                                                        s7 = [s7, s8, s9];
                                                                                                                        s6 = s7;
                                                                                                                      } else {
                                                                                                                        peg$currPos = s6;
                                                                                                                        s6 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s6;
                                                                                                                      s6 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s6;
                                                                                                                    s6 = peg$FAILED;
                                                                                                                  }
                                                                                                                  while (s6 !== peg$FAILED) {
                                                                                                                    s5.push(s6);
                                                                                                                    s6 = peg$currPos;
                                                                                                                    s7 = [];
                                                                                                                    s8 = peg$parseWS();
                                                                                                                    while (s8 !== peg$FAILED) {
                                                                                                                      s7.push(s8);
                                                                                                                      s8 = peg$parseWS();
                                                                                                                    }
                                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                                      s8 = peg$parseConditionalOrExpression();
                                                                                                                      if (s8 !== peg$FAILED) {
                                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                          s9 = peg$c175;
                                                                                                                          peg$currPos++;
                                                                                                                        } else {
                                                                                                                          s9 = peg$FAILED;
                                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                                                                                                        }
                                                                                                                        if (s9 !== peg$FAILED) {
                                                                                                                          s7 = [s7, s8, s9];
                                                                                                                          s6 = s7;
                                                                                                                        } else {
                                                                                                                          peg$currPos = s6;
                                                                                                                          s6 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s6;
                                                                                                                        s6 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s6;
                                                                                                                      s6 = peg$FAILED;
                                                                                                                    }
                                                                                                                  }
                                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                                    s6 = [];
                                                                                                                    s7 = peg$parseWS();
                                                                                                                    while (s7 !== peg$FAILED) {
                                                                                                                      s6.push(s7);
                                                                                                                      s7 = peg$parseWS();
                                                                                                                    }
                                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                                      s7 = peg$parseConditionalOrExpression();
                                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                                        s8 = [];
                                                                                                                        s9 = peg$parseWS();
                                                                                                                        while (s9 !== peg$FAILED) {
                                                                                                                          s8.push(s9);
                                                                                                                          s9 = peg$parseWS();
                                                                                                                        }
                                                                                                                        if (s8 !== peg$FAILED) {
                                                                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                            s9 = peg$c21;
                                                                                                                            peg$currPos++;
                                                                                                                          } else {
                                                                                                                            s9 = peg$FAILED;
                                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                          }
                                                                                                                          if (s9 !== peg$FAILED) {
                                                                                                                            peg$savedPos = s0;
                                                                                                                            s1 = peg$c405(s2, s5, s7);
                                                                                                                            s0 = s1;
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                          if (s0 === peg$FAILED) {
                                                                                                            s0 = peg$parseRegexExpression();
                                                                                                            if (s0 === peg$FAILED) {
                                                                                                              s0 = peg$parseExistsFunc();
                                                                                                              if (s0 === peg$FAILED) {
                                                                                                                s0 = peg$parseNotExistsFunc();
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseRegexExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c406) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c407); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseConditionalOrExpression();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c175;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c176); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s12 = peg$c175;
                          peg$currPos++;
                        } else {
                          s12 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c176); }
                        }
                        if (s12 !== peg$FAILED) {
                          s13 = [];
                          s14 = peg$parseWS();
                          while (s14 !== peg$FAILED) {
                            s13.push(s14);
                            s14 = peg$parseWS();
                          }
                          if (s13 !== peg$FAILED) {
                            s14 = peg$parseConditionalOrExpression();
                            if (s14 !== peg$FAILED) {
                              s12 = [s12, s13, s14];
                              s11 = s12;
                            } else {
                              peg$currPos = s11;
                              s11 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s11;
                            s11 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s11;
                          s11 = peg$FAILED;
                        }
                        if (s11 === peg$FAILED) {
                          s11 = null;
                        }
                        if (s11 !== peg$FAILED) {
                          s12 = [];
                          s13 = peg$parseWS();
                          while (s13 !== peg$FAILED) {
                            s12.push(s13);
                            s13 = peg$parseWS();
                          }
                          if (s12 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s13 = peg$c21;
                              peg$currPos++;
                            } else {
                              s13 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s13 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c408(s5, s9, s11);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSubstringExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c409) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c410); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseConditionalOrExpression();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c175;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c176); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s12 = peg$c175;
                          peg$currPos++;
                        } else {
                          s12 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c176); }
                        }
                        if (s12 !== peg$FAILED) {
                          s13 = [];
                          s14 = peg$parseWS();
                          while (s14 !== peg$FAILED) {
                            s13.push(s14);
                            s14 = peg$parseWS();
                          }
                          if (s13 !== peg$FAILED) {
                            s14 = peg$parseConditionalOrExpression();
                            if (s14 !== peg$FAILED) {
                              s12 = [s12, s13, s14];
                              s11 = s12;
                            } else {
                              peg$currPos = s11;
                              s11 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s11;
                            s11 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s11;
                          s11 = peg$FAILED;
                        }
                        if (s11 === peg$FAILED) {
                          s11 = null;
                        }
                        if (s11 !== peg$FAILED) {
                          s12 = [];
                          s13 = peg$parseWS();
                          while (s13 !== peg$FAILED) {
                            s12.push(s13);
                            s13 = peg$parseWS();
                          }
                          if (s12 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s13 = peg$c21;
                              peg$currPos++;
                            } else {
                              s13 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s13 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c411(s5, s9, s11);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseStrReplaceExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17, s18;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c412) {
      s1 = input.substr(peg$currPos, 7);
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c413); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseConditionalOrExpression();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c175;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c176); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s11 = peg$c175;
                          peg$currPos++;
                        } else {
                          s11 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c176); }
                        }
                        if (s11 !== peg$FAILED) {
                          s12 = [];
                          s13 = peg$parseWS();
                          while (s13 !== peg$FAILED) {
                            s12.push(s13);
                            s13 = peg$parseWS();
                          }
                          if (s12 !== peg$FAILED) {
                            s13 = peg$parseConditionalOrExpression();
                            if (s13 !== peg$FAILED) {
                              s14 = [];
                              s15 = peg$parseWS();
                              while (s15 !== peg$FAILED) {
                                s14.push(s15);
                                s15 = peg$parseWS();
                              }
                              if (s14 !== peg$FAILED) {
                                s15 = peg$currPos;
                                if (input.charCodeAt(peg$currPos) === 44) {
                                  s16 = peg$c175;
                                  peg$currPos++;
                                } else {
                                  s16 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c176); }
                                }
                                if (s16 !== peg$FAILED) {
                                  s17 = [];
                                  s18 = peg$parseWS();
                                  while (s18 !== peg$FAILED) {
                                    s17.push(s18);
                                    s18 = peg$parseWS();
                                  }
                                  if (s17 !== peg$FAILED) {
                                    s18 = peg$parseConditionalOrExpression();
                                    if (s18 !== peg$FAILED) {
                                      s16 = [s16, s17, s18];
                                      s15 = s16;
                                    } else {
                                      peg$currPos = s15;
                                      s15 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s15;
                                    s15 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s15;
                                  s15 = peg$FAILED;
                                }
                                if (s15 === peg$FAILED) {
                                  s15 = null;
                                }
                                if (s15 !== peg$FAILED) {
                                  s16 = [];
                                  s17 = peg$parseWS();
                                  while (s17 !== peg$FAILED) {
                                    s16.push(s17);
                                    s17 = peg$parseWS();
                                  }
                                  if (s16 !== peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 41) {
                                      s17 = peg$c21;
                                      peg$currPos++;
                                    } else {
                                      s17 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                    }
                                    if (s17 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c414(s5, s9, s13, s15);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseExistsFunc() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c415) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c416); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c417(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNotExistsFunc() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c240) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c241); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c415) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c416); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGroupGraphPattern();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c418(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAggregate() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c419) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c420); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
              s5 = input.substr(peg$currPos, 8);
              peg$currPos += 8;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c14); }
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 42) {
                  s7 = peg$c23;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c24); }
                }
                if (s7 === peg$FAILED) {
                  s7 = peg$parseConditionalOrExpression();
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s9 = peg$c21;
                      peg$currPos++;
                    } else {
                      s9 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c421(s5, s7);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c422) {
        s1 = input.substr(peg$currPos, 3);
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c423); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c17;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                s5 = input.substr(peg$currPos, 8);
                peg$currPos += 8;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c14); }
              }
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseConditionalOrExpression();
                  if (s7 !== peg$FAILED) {
                    s8 = [];
                    s9 = peg$parseWS();
                    while (s9 !== peg$FAILED) {
                      s8.push(s9);
                      s9 = peg$parseWS();
                    }
                    if (s8 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s9 = peg$c21;
                        peg$currPos++;
                      } else {
                        s9 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = [];
                        s11 = peg$parseWS();
                        while (s11 !== peg$FAILED) {
                          s10.push(s11);
                          s11 = peg$parseWS();
                        }
                        if (s10 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c424(s5, s7);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c425) {
          s1 = input.substr(peg$currPos, 3);
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c426); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseWS();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseWS();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s3 = peg$c17;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c18); }
            }
            if (s3 !== peg$FAILED) {
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                  s5 = input.substr(peg$currPos, 8);
                  peg$currPos += 8;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c14); }
                }
                if (s5 === peg$FAILED) {
                  s5 = null;
                }
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parseConditionalOrExpression();
                    if (s7 !== peg$FAILED) {
                      s8 = [];
                      s9 = peg$parseWS();
                      while (s9 !== peg$FAILED) {
                        s8.push(s9);
                        s9 = peg$parseWS();
                      }
                      if (s8 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s9 = peg$c21;
                          peg$currPos++;
                        } else {
                          s9 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                        }
                        if (s9 !== peg$FAILED) {
                          s10 = [];
                          s11 = peg$parseWS();
                          while (s11 !== peg$FAILED) {
                            s10.push(s11);
                            s11 = peg$parseWS();
                          }
                          if (s10 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c427(s5, s7);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c428) {
            s1 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c429); }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$parseWS();
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parseWS();
            }
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 40) {
                s3 = peg$c17;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c18); }
              }
              if (s3 !== peg$FAILED) {
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                    s5 = input.substr(peg$currPos, 8);
                    peg$currPos += 8;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c14); }
                  }
                  if (s5 === peg$FAILED) {
                    s5 = null;
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseConditionalOrExpression();
                      if (s7 !== peg$FAILED) {
                        s8 = [];
                        s9 = peg$parseWS();
                        while (s9 !== peg$FAILED) {
                          s8.push(s9);
                          s9 = peg$parseWS();
                        }
                        if (s8 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s9 = peg$c21;
                            peg$currPos++;
                          } else {
                            s9 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                          }
                          if (s9 !== peg$FAILED) {
                            s10 = [];
                            s11 = peg$parseWS();
                            while (s11 !== peg$FAILED) {
                              s10.push(s11);
                              s11 = peg$parseWS();
                            }
                            if (s10 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c430(s5, s7);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 3).toLowerCase() === peg$c431) {
              s1 = input.substr(peg$currPos, 3);
              peg$currPos += 3;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c432); }
            }
            if (s1 !== peg$FAILED) {
              s2 = [];
              s3 = peg$parseWS();
              while (s3 !== peg$FAILED) {
                s2.push(s3);
                s3 = peg$parseWS();
              }
              if (s2 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 40) {
                  s3 = peg$c17;
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                      s5 = input.substr(peg$currPos, 8);
                      peg$currPos += 8;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c14); }
                    }
                    if (s5 === peg$FAILED) {
                      s5 = null;
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parseConditionalOrExpression();
                        if (s7 !== peg$FAILED) {
                          s8 = [];
                          s9 = peg$parseWS();
                          while (s9 !== peg$FAILED) {
                            s8.push(s9);
                            s9 = peg$parseWS();
                          }
                          if (s8 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s9 = peg$c21;
                              peg$currPos++;
                            } else {
                              s9 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s9 !== peg$FAILED) {
                              s10 = [];
                              s11 = peg$parseWS();
                              while (s11 !== peg$FAILED) {
                                s10.push(s11);
                                s11 = peg$parseWS();
                              }
                              if (s10 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c433(s5, s7);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 6).toLowerCase() === peg$c434) {
                s1 = input.substr(peg$currPos, 6);
                peg$currPos += 6;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c435); }
              }
              if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$parseWS();
                while (s3 !== peg$FAILED) {
                  s2.push(s3);
                  s3 = peg$parseWS();
                }
                if (s2 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 40) {
                    s3 = peg$c17;
                    peg$currPos++;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                        s5 = input.substr(peg$currPos, 8);
                        peg$currPos += 8;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c14); }
                      }
                      if (s5 === peg$FAILED) {
                        s5 = null;
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          s7 = peg$parseConditionalOrExpression();
                          if (s7 !== peg$FAILED) {
                            s8 = [];
                            s9 = peg$parseWS();
                            while (s9 !== peg$FAILED) {
                              s8.push(s9);
                              s9 = peg$parseWS();
                            }
                            if (s8 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s9 = peg$c21;
                                peg$currPos++;
                              } else {
                                s9 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                              }
                              if (s9 !== peg$FAILED) {
                                s10 = [];
                                s11 = peg$parseWS();
                                while (s11 !== peg$FAILED) {
                                  s10.push(s11);
                                  s11 = peg$parseWS();
                                }
                                if (s10 !== peg$FAILED) {
                                  peg$savedPos = s0;
                                  s1 = peg$c436(s5, s7);
                                  s0 = s1;
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 12).toLowerCase() === peg$c437) {
                  s1 = input.substr(peg$currPos, 12);
                  peg$currPos += 12;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c438); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = [];
                  s3 = peg$parseWS();
                  while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$parseWS();
                  }
                  if (s2 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 40) {
                      s3 = peg$c17;
                      peg$currPos++;
                    } else {
                      s3 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                    }
                    if (s3 !== peg$FAILED) {
                      s4 = [];
                      s5 = peg$parseWS();
                      while (s5 !== peg$FAILED) {
                        s4.push(s5);
                        s5 = peg$parseWS();
                      }
                      if (s4 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                          s5 = input.substr(peg$currPos, 8);
                          peg$currPos += 8;
                        } else {
                          s5 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c14); }
                        }
                        if (s5 === peg$FAILED) {
                          s5 = null;
                        }
                        if (s5 !== peg$FAILED) {
                          s6 = [];
                          s7 = peg$parseWS();
                          while (s7 !== peg$FAILED) {
                            s6.push(s7);
                            s7 = peg$parseWS();
                          }
                          if (s6 !== peg$FAILED) {
                            s7 = peg$parseConditionalOrExpression();
                            if (s7 !== peg$FAILED) {
                              s8 = peg$currPos;
                              s9 = [];
                              s10 = peg$parseWS();
                              while (s10 !== peg$FAILED) {
                                s9.push(s10);
                                s10 = peg$parseWS();
                              }
                              if (s9 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 59) {
                                  s10 = peg$c82;
                                  peg$currPos++;
                                } else {
                                  s10 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c83); }
                                }
                                if (s10 !== peg$FAILED) {
                                  s11 = [];
                                  s12 = peg$parseWS();
                                  while (s12 !== peg$FAILED) {
                                    s11.push(s12);
                                    s12 = peg$parseWS();
                                  }
                                  if (s11 !== peg$FAILED) {
                                    if (input.substr(peg$currPos, 9).toLowerCase() === peg$c439) {
                                      s12 = input.substr(peg$currPos, 9);
                                      peg$currPos += 9;
                                    } else {
                                      s12 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c440); }
                                    }
                                    if (s12 !== peg$FAILED) {
                                      s13 = [];
                                      s14 = peg$parseWS();
                                      while (s14 !== peg$FAILED) {
                                        s13.push(s14);
                                        s14 = peg$parseWS();
                                      }
                                      if (s13 !== peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 61) {
                                          s14 = peg$c226;
                                          peg$currPos++;
                                        } else {
                                          s14 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c227); }
                                        }
                                        if (s14 !== peg$FAILED) {
                                          s15 = [];
                                          s16 = peg$parseWS();
                                          while (s16 !== peg$FAILED) {
                                            s15.push(s16);
                                            s16 = peg$parseWS();
                                          }
                                          if (s15 !== peg$FAILED) {
                                            s16 = peg$parseString();
                                            if (s16 !== peg$FAILED) {
                                              s9 = [s9, s10, s11, s12, s13, s14, s15, s16];
                                              s8 = s9;
                                            } else {
                                              peg$currPos = s8;
                                              s8 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s8;
                                            s8 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s8;
                                          s8 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s8;
                                        s8 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s8;
                                      s8 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s8;
                                    s8 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s8;
                                  s8 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s8;
                                s8 = peg$FAILED;
                              }
                              if (s8 === peg$FAILED) {
                                s8 = null;
                              }
                              if (s8 !== peg$FAILED) {
                                s9 = [];
                                s10 = peg$parseWS();
                                while (s10 !== peg$FAILED) {
                                  s9.push(s10);
                                  s10 = peg$parseWS();
                                }
                                if (s9 !== peg$FAILED) {
                                  if (input.charCodeAt(peg$currPos) === 41) {
                                    s10 = peg$c21;
                                    peg$currPos++;
                                  } else {
                                    s10 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                  }
                                  if (s10 !== peg$FAILED) {
                                    s11 = [];
                                    s12 = peg$parseWS();
                                    while (s12 !== peg$FAILED) {
                                      s11.push(s12);
                                      s12 = peg$parseWS();
                                    }
                                    if (s11 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c441(s5, s7, s8);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseIRIrefOrFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseIRIref();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgList();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c442(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRDFLiteral() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseString();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseLANGTAG();
      if (s2 === peg$FAILED) {
        s2 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c443) {
          s3 = peg$c443;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c444); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseIRIref();
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c445(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNumericLiteral() {
    var s0;

    s0 = peg$parseNumericLiteralUnsigned();
    if (s0 === peg$FAILED) {
      s0 = peg$parseNumericLiteralPositive();
      if (s0 === peg$FAILED) {
        s0 = peg$parseNumericLiteralNegative();
      }
    }

    return s0;
  }

  function peg$parseNumericLiteralUnsigned() {
    var s0;

    s0 = peg$parseDOUBLE();
    if (s0 === peg$FAILED) {
      s0 = peg$parseDECIMAL();
      if (s0 === peg$FAILED) {
        s0 = peg$parseINTEGER();
      }
    }

    return s0;
  }

  function peg$parseNumericLiteralPositive() {
    var s0;

    s0 = peg$parseDOUBLE_POSITIVE();
    if (s0 === peg$FAILED) {
      s0 = peg$parseDECIMAL_POSITIVE();
      if (s0 === peg$FAILED) {
        s0 = peg$parseINTEGER_POSITIVE();
      }
    }

    return s0;
  }

  function peg$parseNumericLiteralNegative() {
    var s0;

    s0 = peg$parseDOUBLE_NEGATIVE();
    if (s0 === peg$FAILED) {
      s0 = peg$parseDECIMAL_NEGATIVE();
      if (s0 === peg$FAILED) {
        s0 = peg$parseINTEGER_NEGATIVE();
      }
    }

    return s0;
  }

  function peg$parseBooleanLiteral() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c446) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c447); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c448();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c449) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c450); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c451();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseString() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseSTRING_LITERAL_LONG1();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c452(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseSTRING_LITERAL_LONG2();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c452(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseSTRING_LITERAL1();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c452(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseSTRING_LITERAL2();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c453(s1);
          }
          s0 = s1;
        }
      }
    }

    return s0;
  }

  function peg$parseIRIref() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseIRIREF();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c454(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsePrefixedName();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c455(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parsePrefixedName() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parsePNAME_LN();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c456(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsePNAME_NS();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c457(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseBlankNode() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseBLANK_NODE_LABEL();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c458(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseANON();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c459();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseIRIREF() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 60) {
      s1 = peg$c230;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c231); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c460.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c461); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c460.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c461); }
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 62) {
          s3 = peg$c232;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c233); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c462(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePNAME_NS() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsePN_PREFIX();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 58) {
        s2 = peg$c463;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c464); }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c455(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePNAME_LN() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsePNAME_NS();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsePN_LOCAL();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c465(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseBLANK_NODE_LABEL() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c466) {
      s1 = peg$c466;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c467); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsePN_LOCAL();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c468(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVAR1() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 63) {
      s1 = peg$c202;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c203); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVARNAME();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c469(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVAR2() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 36) {
      s1 = peg$c470;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c471); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVARNAME();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c472(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVAR3() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c473) {
      s1 = peg$c473;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c474); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVARNAME();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c475) {
          s3 = peg$c475;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c476); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c477(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseLANGTAG() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 64) {
      s1 = peg$c478;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c479); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c480.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c481); }
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c480.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c481); }
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 45) {
          s5 = peg$c243;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c244); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          if (peg$c482.test(input.charAt(peg$currPos))) {
            s7 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s7 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c483); }
          }
          if (s7 !== peg$FAILED) {
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              if (peg$c482.test(input.charAt(peg$currPos))) {
                s7 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c483); }
              }
            }
          } else {
            s6 = peg$FAILED;
          }
          if (s6 !== peg$FAILED) {
            s5 = [s5, s6];
            s4 = s5;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 45) {
            s5 = peg$c243;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c244); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            if (peg$c482.test(input.charAt(peg$currPos))) {
              s7 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c483); }
            }
            if (s7 !== peg$FAILED) {
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                if (peg$c482.test(input.charAt(peg$currPos))) {
                  s7 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c483); }
                }
              }
            } else {
              s6 = peg$FAILED;
            }
            if (s6 !== peg$FAILED) {
              s5 = [s5, s6];
              s4 = s5;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c484(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseINTEGER() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c485.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c486); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c487(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseDECIMAL() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c485.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c486); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c140;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c141); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          if (peg$c485.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c486); }
          }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c488(s1, s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s1 = peg$c140;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c141); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            if (peg$c485.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c486); }
            }
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c489(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseDOUBLE() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c485.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c486); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c140;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c141); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          if (peg$c485.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c486); }
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseEXPONENT();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c490(s1, s2, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s1 = peg$c140;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c141); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            if (peg$c485.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c486); }
            }
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseEXPONENT();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c491(s1, s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = [];
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            if (peg$c485.test(input.charAt(peg$currPos))) {
              s2 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c486); }
            }
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseEXPONENT();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c492(s1, s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseINTEGER_POSITIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s1 = peg$c204;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c205); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseINTEGER();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c493(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDECIMAL_POSITIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s1 = peg$c204;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c205); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDECIMAL();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c493(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDOUBLE_POSITIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s1 = peg$c204;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c205); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDOUBLE();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c493(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseINTEGER_NEGATIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s1 = peg$c243;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c244); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseINTEGER();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c494(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDECIMAL_NEGATIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s1 = peg$c243;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c244); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDECIMAL();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c494(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDOUBLE_NEGATIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s1 = peg$c243;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c244); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDOUBLE();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c494(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseEXPONENT() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (peg$c495.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c496); }
    }
    if (s1 !== peg$FAILED) {
      if (peg$c497.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c498); }
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c485.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c486); }
            }
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c499(s1, s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL1() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 39) {
      s1 = peg$c500;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c501); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c502.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c503); }
      }
      if (s3 === peg$FAILED) {
        s3 = peg$parseECHAR();
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c502.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c503); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$parseECHAR();
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 39) {
          s3 = peg$c500;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c501); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c504(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL2() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 34) {
      s1 = peg$c505;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c506); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c507.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c508); }
      }
      if (s3 === peg$FAILED) {
        s3 = peg$parseECHAR();
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c507.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c508); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$parseECHAR();
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 34) {
          s3 = peg$c505;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c506); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c504(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL_LONG1() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c509) {
      s1 = peg$c509;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c510); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c511.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c512); }
      }
      if (s3 === peg$FAILED) {
        s3 = peg$parseECHAR();
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c511.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c512); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$parseECHAR();
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c509) {
          s3 = peg$c509;
          peg$currPos += 3;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c510); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c504(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL_LONG2() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c513) {
      s1 = peg$c513;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c514); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c515.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c516); }
      }
      if (s3 === peg$FAILED) {
        s3 = peg$parseECHAR();
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c515.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c516); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$parseECHAR();
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c513) {
          s3 = peg$c513;
          peg$currPos += 3;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c514); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c504(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseECHAR() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 92) {
      s1 = peg$c517;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c518); }
    }
    if (s1 !== peg$FAILED) {
      if (peg$c519.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c520); }
      }
      if (s2 !== peg$FAILED) {
        s1 = [s1, s2];
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNIL() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c17;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c18); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 41) {
          s3 = peg$c21;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c22); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c521();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseWS() {
    var s0;

    s0 = peg$parseCOMMENT();
    if (s0 === peg$FAILED) {
      s0 = peg$parseSPACE_OR_TAB();
      if (s0 === peg$FAILED) {
        s0 = peg$parseNEW_LINE();
      }
    }

    return s0;
  }

  function peg$parseSPACE_OR_TAB() {
    var s0;

    if (peg$c522.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c523); }
    }

    return s0;
  }

  function peg$parseNEW_LINE() {
    var s0;

    if (peg$c524.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c525); }
    }

    return s0;
  }

  function peg$parseNON_NEW_LINE() {
    var s0;

    if (peg$c526.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c527); }
    }

    return s0;
  }

  function peg$parseHEADER_LINE() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 35) {
      s2 = peg$c528;
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c529); }
    }
    if (s2 !== peg$FAILED) {
      s3 = [];
      s4 = peg$parseNON_NEW_LINE();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseNON_NEW_LINE();
      }
      if (s3 !== peg$FAILED) {
        s4 = peg$parseNEW_LINE();
        if (s4 !== peg$FAILED) {
          s2 = [s2, s3, s4];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c530(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseCOMMENT() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = [];
    s3 = peg$parseSPACE_OR_TAB();
    while (s3 !== peg$FAILED) {
      s2.push(s3);
      s3 = peg$parseSPACE_OR_TAB();
    }
    if (s2 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 35) {
        s3 = peg$c528;
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c529); }
      }
      if (s3 !== peg$FAILED) {
        s4 = [];
        s5 = peg$parseNON_NEW_LINE();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseNON_NEW_LINE();
        }
        if (s4 !== peg$FAILED) {
          s2 = [s2, s3, s4];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c531(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseANON() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c211;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c212); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s3 = peg$c213;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c214); }
        }
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePN_CHARS_BASE() {
    var s0;

    if (peg$c532.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c533); }
    }
    if (s0 === peg$FAILED) {
      if (peg$c534.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c535); }
      }
      if (s0 === peg$FAILED) {
        if (peg$c536.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c537); }
        }
        if (s0 === peg$FAILED) {
          if (peg$c538.test(input.charAt(peg$currPos))) {
            s0 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c539); }
          }
          if (s0 === peg$FAILED) {
            if (peg$c540.test(input.charAt(peg$currPos))) {
              s0 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c541); }
            }
            if (s0 === peg$FAILED) {
              if (peg$c542.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c543); }
              }
              if (s0 === peg$FAILED) {
                if (peg$c544.test(input.charAt(peg$currPos))) {
                  s0 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s0 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c545); }
                }
                if (s0 === peg$FAILED) {
                  if (peg$c546.test(input.charAt(peg$currPos))) {
                    s0 = input.charAt(peg$currPos);
                    peg$currPos++;
                  } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c547); }
                  }
                  if (s0 === peg$FAILED) {
                    if (peg$c548.test(input.charAt(peg$currPos))) {
                      s0 = input.charAt(peg$currPos);
                      peg$currPos++;
                    } else {
                      s0 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c549); }
                    }
                    if (s0 === peg$FAILED) {
                      if (peg$c550.test(input.charAt(peg$currPos))) {
                        s0 = input.charAt(peg$currPos);
                        peg$currPos++;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c551); }
                      }
                      if (s0 === peg$FAILED) {
                        if (peg$c552.test(input.charAt(peg$currPos))) {
                          s0 = input.charAt(peg$currPos);
                          peg$currPos++;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c553); }
                        }
                        if (s0 === peg$FAILED) {
                          if (peg$c554.test(input.charAt(peg$currPos))) {
                            s0 = input.charAt(peg$currPos);
                            peg$currPos++;
                          } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c555); }
                          }
                          if (s0 === peg$FAILED) {
                            if (peg$c556.test(input.charAt(peg$currPos))) {
                              s0 = input.charAt(peg$currPos);
                              peg$currPos++;
                            } else {
                              s0 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c557); }
                            }
                            if (s0 === peg$FAILED) {
                              if (peg$c558.test(input.charAt(peg$currPos))) {
                                s0 = input.charAt(peg$currPos);
                                peg$currPos++;
                              } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c559); }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parsePN_CHARS_U() {
    var s0;

    s0 = peg$parsePN_CHARS_BASE();
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 95) {
        s0 = peg$c560;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c561); }
      }
    }

    return s0;
  }

  function peg$parseVARNAME() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parsePN_CHARS_U();
    if (s1 === peg$FAILED) {
      if (peg$c485.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c486); }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsePN_CHARS_U();
      if (s3 === peg$FAILED) {
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        if (s3 === peg$FAILED) {
          if (peg$c562.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c563); }
          }
          if (s3 === peg$FAILED) {
            if (peg$c564.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c565); }
            }
            if (s3 === peg$FAILED) {
              if (peg$c566.test(input.charAt(peg$currPos))) {
                s3 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c567); }
              }
            }
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsePN_CHARS_U();
        if (s3 === peg$FAILED) {
          if (peg$c485.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c486); }
          }
          if (s3 === peg$FAILED) {
            if (peg$c562.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c563); }
            }
            if (s3 === peg$FAILED) {
              if (peg$c564.test(input.charAt(peg$currPos))) {
                s3 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c565); }
              }
              if (s3 === peg$FAILED) {
                if (peg$c566.test(input.charAt(peg$currPos))) {
                  s3 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c567); }
                }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c568(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePN_CHARS() {
    var s0;

    s0 = peg$parsePN_CHARS_U();
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 45) {
        s0 = peg$c243;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c244); }
      }
      if (s0 === peg$FAILED) {
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        if (s0 === peg$FAILED) {
          if (peg$c562.test(input.charAt(peg$currPos))) {
            s0 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c563); }
          }
          if (s0 === peg$FAILED) {
            if (peg$c564.test(input.charAt(peg$currPos))) {
              s0 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c565); }
            }
            if (s0 === peg$FAILED) {
              if (peg$c566.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c567); }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parsePN_PREFIX() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parsePN_CHARS_U();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsePN_CHARS();
      if (s3 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s3 = peg$c140;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c141); }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsePN_CHARS();
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s3 = peg$c140;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c141); }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c569(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePN_LOCAL() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 36) {
      s1 = peg$c470;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c471); }
    }
    if (s1 === peg$FAILED) {
      s1 = peg$parsePN_CHARS_U();
      if (s1 === peg$FAILED) {
        if (peg$c485.test(input.charAt(peg$currPos))) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c486); }
        }
        if (s1 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 58) {
            s1 = peg$c463;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c464); }
          }
          if (s1 === peg$FAILED) {
            s1 = peg$parsePLX();
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsePN_CHARS();
      if (s3 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s3 = peg$c140;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c141); }
        }
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 58) {
            s3 = peg$c463;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c464); }
          }
          if (s3 === peg$FAILED) {
            s3 = peg$parsePLX();
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsePN_CHARS();
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s3 = peg$c140;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c141); }
          }
          if (s3 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 58) {
              s3 = peg$c463;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c464); }
            }
            if (s3 === peg$FAILED) {
              s3 = peg$parsePLX();
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c570(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePLX() {
    var s0;

    s0 = peg$parsePERCENT();
    if (s0 === peg$FAILED) {
      s0 = peg$parsePN_LOCAL_ESC();
    }

    return s0;
  }

  function peg$parsePERCENT() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 37) {
      s2 = peg$c571;
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c572); }
    }
    if (s2 !== peg$FAILED) {
      s3 = peg$parseHEX();
      if (s3 !== peg$FAILED) {
        s4 = peg$parseHEX();
        if (s4 !== peg$FAILED) {
          s2 = [s2, s3, s4];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c573(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseHEX() {
    var s0;

    if (peg$c485.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c486); }
    }
    if (s0 === peg$FAILED) {
      if (peg$c574.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c575); }
      }
      if (s0 === peg$FAILED) {
        if (peg$c576.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c577); }
        }
      }
    }

    return s0;
  }

  function peg$parsePN_LOCAL_ESC() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 92) {
      s1 = peg$c517;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c518); }
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 95) {
        s2 = peg$c560;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c561); }
      }
      if (s2 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 126) {
          s2 = peg$c578;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c579); }
        }
        if (s2 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s2 = peg$c140;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c141); }
          }
          if (s2 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 45) {
              s2 = peg$c243;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c244); }
            }
            if (s2 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 33) {
                s2 = peg$c207;
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c208); }
              }
              if (s2 === peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 36) {
                  s2 = peg$c470;
                  peg$currPos++;
                } else {
                  s2 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c471); }
                }
                if (s2 === peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 38) {
                    s2 = peg$c580;
                    peg$currPos++;
                  } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c581); }
                  }
                  if (s2 === peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 39) {
                      s2 = peg$c500;
                      peg$currPos++;
                    } else {
                      s2 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c501); }
                    }
                    if (s2 === peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 40) {
                        s2 = peg$c17;
                        peg$currPos++;
                      } else {
                        s2 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                      }
                      if (s2 === peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s2 = peg$c21;
                          peg$currPos++;
                        } else {
                          s2 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                        }
                        if (s2 === peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 42) {
                            s2 = peg$c23;
                            peg$currPos++;
                          } else {
                            s2 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c24); }
                          }
                          if (s2 === peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 43) {
                              s2 = peg$c204;
                              peg$currPos++;
                            } else {
                              s2 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c205); }
                            }
                            if (s2 === peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 44) {
                                s2 = peg$c175;
                                peg$currPos++;
                              } else {
                                s2 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c176); }
                              }
                              if (s2 === peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 59) {
                                  s2 = peg$c82;
                                  peg$currPos++;
                                } else {
                                  s2 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c83); }
                                }
                                if (s2 === peg$FAILED) {
                                  if (input.charCodeAt(peg$currPos) === 58) {
                                    s2 = peg$c463;
                                    peg$currPos++;
                                  } else {
                                    s2 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c464); }
                                  }
                                  if (s2 === peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 61) {
                                      s2 = peg$c226;
                                      peg$currPos++;
                                    } else {
                                      s2 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c227); }
                                    }
                                    if (s2 === peg$FAILED) {
                                      if (input.charCodeAt(peg$currPos) === 47) {
                                        s2 = peg$c195;
                                        peg$currPos++;
                                      } else {
                                        s2 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c196); }
                                      }
                                      if (s2 === peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 63) {
                                          s2 = peg$c202;
                                          peg$currPos++;
                                        } else {
                                          s2 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c203); }
                                        }
                                        if (s2 === peg$FAILED) {
                                          if (input.charCodeAt(peg$currPos) === 35) {
                                            s2 = peg$c528;
                                            peg$currPos++;
                                          } else {
                                            s2 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c529); }
                                          }
                                          if (s2 === peg$FAILED) {
                                            if (input.charCodeAt(peg$currPos) === 64) {
                                              s2 = peg$c478;
                                              peg$currPos++;
                                            } else {
                                              s2 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c479); }
                                            }
                                            if (s2 === peg$FAILED) {
                                              if (input.charCodeAt(peg$currPos) === 37) {
                                                s2 = peg$c571;
                                                peg$currPos++;
                                              } else {
                                                s2 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c572); }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c582(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }


    let Comments = {};

    let GlobalBlankNodeCounter = 0;

    function flattenString(arr) {
      return arr.map((a) => {
        if (typeof(a) === 'string') {
          return a;
        } else {
          return a.join('');
        }
      }).join('');
    }


  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{}]},{},[1]);
