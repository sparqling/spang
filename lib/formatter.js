var output;
var commentsList;
var currentIndent;
indentUnit = '  ';

exports.format = (syntaxTree, indentDepth = 2) => {
  indentUnit = ' '.repeat(indentDepth);

  output = [];
  commentsList = syntaxTree.comments;
  currentIndent = '';

  if (syntaxTree.headers.length > 0) {
    addLine(syntaxTree.headers.join(''));
  }
  addPrologue(syntaxTree.prologue);

  syntaxTree.functions.forEach(addFunction);

  addQuery(syntaxTree);
  if (syntaxTree.inlineData) {
    addInlineData(syntaxTree.inlineData);
  }

  addComments();

  return output.join('\n');
};

/// Local functions //////////////////////////////////////////

debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

increaseIndent = (depth = 1) => {
  currentIndent += indentUnit.repeat(depth);
};

decreaseIndent = (depth = 1) => {
  currentIndent = currentIndent.substr(0, currentIndent.length - indentUnit.length * depth);
};

addLine = (lineText, commentPtr = 0) => {
  // 0 means min ptr, so no comments will be added.
  addComments(commentPtr);
  output.push(currentIndent + lineText);
};

addComments = (commentPtr = -1) => {
  // -1 means 'max' ptr, so all comments will be added.
  var commentAdded = false;
  while (commentsList.length > 0 && (commentsList[0].line < commentPtr || commentPtr == -1)) {
    var commentText = commentsList.shift().text;
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

addPrologue = (prologue) => {
  prologue.prefixes.forEach((prefix) => {
    addLine(`PREFIX ${prefix.prefix || ''}: <${prefix.local}>`);
  });
  if (prologue.prefixes.length > 0) {
    addLine('');
  }
};

addQuery = (query) => {
  switch (query.body.kind) {
    case 'select':
      addSelect(query.body);
  }
};

addSelect = (select) => {
  var selectClause = 'SELECT ';
  if (select.modifier) {
    selectClause += `${select.modifier.toString()} `;
  }
  var projection = select.projection.map(getProjection).join(' ');
  selectClause += projection;
  var lastLine = !select.projection[0].value ?
      select.projection[0].location.start.line :
      select.projection[0].value.location.start.line;
  addLine(selectClause, lastLine);

  addLine('WHERE {', lastLine + 1);
  addGroupGraphPattern(select.pattern);
  addLine('}', select.pattern.location.end.line);

  if (select.order) {
    addLine('ORDER BY ' + getOrderConditions(select.order));
  }
  if (select.limit) {
    addLine(`LIMIT ${select.limit}`);
  }
};

addGroupGraphPattern = (pattern) => {
  increaseIndent();
  pattern.patterns.forEach(addPattern);
  pattern.filters.forEach(addFilter);
  decreaseIndent();
};

addPattern = (pattern) => {
  switch (pattern.token) {
    case 'graphunionpattern':
      addLine('{');
      addGroupGraphPattern(pattern.value[0]);
      addLine('}');
      for (let i = 1; i < pattern.value.length; i++) {
        addLine('UNION');
        addLine('{');
        addGroupGraphPattern(pattern.value[i]);
        addLine('}');
      }
      break;
    case 'optionalgraphpattern':
      addLine('OPTIONAL {');
      addGroupGraphPattern(pattern.value);
      addLine('}');
      break;
    case 'basicgraphpattern':
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
        var name = getUri(pattern.iriref);
        var args = pattern.args.map(getExpression).join(', ');
        addLine(`${name}(${args})`);
      } else {
        debugPrint(pattern);
      }
      break;
    default:
      debugPrint(pattern);
  }
};

getOrderConditions = (conditions) => {
  var orderConditions = [];

  conditions.forEach((condition) => {
    var oc = getVar(condition.expression.value);
    if (condition.direction == 'DESC') {
      orderConditions.push(`DESC(${oc})`);
    } else {
      orderConditions.push(oc);
    }
  });

  return orderConditions.join(' ');
};

getProjection = (projection) => {
  switch (projection.kind) {
    case '*':
      return '*';
    case 'var':
      return '?' + projection.value.value;
    case 'aliased':
      return `(${getExpression(projection.expression)} AS ?${projection.alias.value})`;
    default:
      throw new Error('unknown projection.kind: ' + projection.kind);
  }
};

addFilter = (filter) => {
  if (filter.value.expressionType == 'relationalexpression') {
    var op = filter.value.operator;
    var op1 = getExpression(filter.value.op1);
    var op2 = getExpression(filter.value.op2);
    addLine(`FILTER (${op1} ${op} ${op2})`);
  }
};

addFunction = (func) => {
  var name = getUri(func.header.iriref);
  var args = func.header.args.map(getExpression).join(', ');
  addLine(`${name}(${args}) {`);
  addGroupGraphPattern(func.body);
  addLine('}');
  addLine('');
};

addTriple = (triple) => {
  var s = getTripleElem(triple.subject);
  var p = getTripleElem(triple.predicate);
  var o = getTripleElem(triple.object);
  addLine(`${s} ${p} ${o} .`, triple.object.location.end.line);
};

getExpression = (expr) => {
  switch (expr.expressionType) {
    case 'atomic':
      return getTripleElem(expr.value);
    case 'irireforfunction':
      return getUri(expr.iriref); // how about function?
    case 'builtincall':
      return expr.builtincall + '(' + expr.args.map(getExpression).join(', ') + ')';
  }
};

addInlineData = (inline) => {
  switch (inline.token) {
    case 'inlineData':
      var vals = inline.values.map(getTripleElem).join(' ');
      addLine(`VALUES ${getTripleElem(inline.var)} { ${vals} }`);
      break;
    case 'inlineDataFull':
      var vars = inline.variables.map(getVar).join(' ');
      var vals = inline.values.map(getTuple).join(' ');
      addLine(`VALUES (${vars}) { ${vals} }`);
      break;
  }
};

getTuple = (tuple) => {
  return '(' + tuple.map(getTripleElem).join(' ') + ')';
};

getTripleElem = (elem) => {
  switch (elem.token) {
    case 'uri':
      return getUri(elem);
    case 'var':
      return getVar(elem);
    case 'literal':
      var txt = `"${elem.value}"`;
      if (elem.lang) {
        txt += `@${elem.lang}`;
      }
      return txt;
    case 'path':
      return elem.value.map((v) => getUri(v.value)).join('/');
    case 'blank':
      return '[]';
    default:
      debugPrint(elem);
  }
};

getUri = (uri) => {
  if (uri.prefix && uri.suffix) {
    return `${uri.prefix}:${uri.suffix}`;
  } else if (uri.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
    return 'a';
  } else {
    return `<${uri.value}>`;
  }
};

getVar = (variable) => {
  if (variable.prefix === '?') {
    return '?' + variable.value;
  } else if (variable.prefix === '$') {
    return '$' + variable.value;
  } else {
    return '{{' + variable.value + '}}';
  }
};
